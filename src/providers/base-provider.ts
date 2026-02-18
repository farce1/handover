import type { z } from 'zod';
import type { LLMProvider } from './base.js';
import type { CompletionRequest, CompletionResult } from '../domain/types.js';
import { RateLimiter, retryWithBackoff } from '../utils/rate-limiter.js';
import { logger } from '../utils/logger.js';

/**
 * Abstract base class for LLM providers.
 * Encapsulates shared retry/rate-limit/token-estimation logic.
 */
export abstract class BaseProvider implements LLMProvider {
  abstract readonly name: string;
  protected rateLimiter: RateLimiter;
  protected model: string;

  constructor(model: string, concurrency: number) {
    this.model = model;
    this.rateLimiter = new RateLimiter(concurrency);
  }

  /**
   * Subclasses implement the provider-specific API call.
   */
  protected abstract doComplete<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>,
  ): Promise<CompletionResult & { data: T }>;

  /**
   * Whether an error is retryable for this provider.
   */
  protected abstract isRetryable(err: unknown): boolean;

  /**
   * Maximum context window size in tokens.
   */
  abstract maxContextTokens(): number;

  async complete<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>,
    options?: { onRetry?: (attempt: number, delayMs: number, reason: string) => void },
  ): Promise<CompletionResult & { data: T }> {
    return this.rateLimiter.withLimit(async () => {
      return retryWithBackoff(
        () => this.doComplete(request, schema),
        {
          maxRetries: 3,
          baseDelayMs: 30_000,
          isRetryable: (err: unknown) => this.isRetryable(err),
          onRetry: options?.onRetry,
        },
      );
    });
  }

  /**
   * Rough token estimate: ~4 characters per token.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Log provider initialization.
   */
  protected logInit(displayName: string, concurrency: number): void {
    logger.log(`${displayName} provider initialized (model: ${this.model}, concurrency: ${concurrency})`);
  }
}
