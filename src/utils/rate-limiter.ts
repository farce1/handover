import { ProviderError } from './errors.js';
import { logger } from './logger.js';

/**
 * Token bucket rate limiter for controlling concurrent LLM requests.
 * PIPE-05: Default 4 for cloud, 1 for Ollama.
 */
export class RateLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  /**
   * Acquire a slot. Resolves immediately if available, waits if at capacity.
   */
  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  /**
   * Release a slot, allowing the next queued caller to proceed.
   */
  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }

  /**
   * Execute a function within the rate limit.
   * Automatically acquires and releases slots.
   */
  async withLimit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/**
 * Retry a function with exponential backoff.
 * PIPE-06: Rate limiting with exponential backoff and jitter.
 * REL-01: 3 attempts with delays 30s, 60s, 120s.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    isRetryable?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 30_000;
  const isRetryable =
    options.isRetryable ??
    ((err: unknown) => {
      if (err && typeof err === 'object') {
        const status = (err as { status?: number }).status;
        return status === 429 || status === 529;
      }
      return false;
    });

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= maxRetries || !isRetryable(err)) {
        break;
      }

      // Exponential backoff: 30s, 60s, 120s with jitter
      const delay = baseDelayMs * Math.pow(2, attempt);
      const jitter = delay * (0.5 + Math.random());

      logger.warn(
        `Rate limited. Retrying in ${Math.ceil(jitter / 1000)}s (attempt ${attempt + 1}/${maxRetries})...`,
      );

      await new Promise<void>((resolve) => setTimeout(resolve, jitter));
    }
  }

  // All retries exhausted
  if (lastError instanceof ProviderError) {
    throw lastError;
  }

  throw ProviderError.rateLimited(baseDelayMs * Math.pow(2, maxRetries));
}
