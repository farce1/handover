import { retryWithBackoff } from '../utils/rate-limiter.js';
import { HandoverError } from '../utils/errors.js';
import { EMBEDDING_MODELS } from './types.js';
import type { EmbeddingBatchResult, EmbeddingClient } from './embedder.js';

interface OllamaEmbedResponse {
  embeddings: number[][];
}

export interface LocalEmbeddingProviderConfig {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  batchSize?: number;
}

export class LocalEmbeddingProvider implements EmbeddingClient {
  readonly provider = 'local' as const;
  readonly model: string;

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly batchSize: number;

  constructor(config: LocalEmbeddingProviderConfig) {
    this.model = config.model;
    this.baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.batchSize = config.batchSize ?? 100;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getTimeoutMs(): number {
    return this.timeoutMs;
  }

  getDimensions(): number {
    return EMBEDDING_MODELS[this.model] ?? 0;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingBatchResult> {
    if (texts.length === 0) {
      return {
        embeddings: [],
        totalTokens: 0,
        dimensions: this.getDimensions(),
      };
    }

    const allEmbeddings: number[][] = [];
    let totalTokens = 0;
    let dimensions = 0;

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchEmbeddings = await this.embed(batch);

      if (dimensions === 0 && batchEmbeddings.length > 0) {
        dimensions = batchEmbeddings[0].length;
      }

      allEmbeddings.push(...batchEmbeddings);

      const batchTextLength = batch.reduce((sum, text) => sum + text.length, 0);
      totalTokens += Math.ceil(batchTextLength / 4);
    }

    return {
      embeddings: allEmbeddings,
      totalTokens,
      dimensions: dimensions || this.getDimensions(),
    };
  }

  private async embed(texts: string[]): Promise<number[][]> {
    const requestWithRetry = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}/api/embed`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            input: texts,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text();
          const error = new Error(
            `Local embedding API error: ${response.status} ${response.statusText} ${body}`,
          );
          (error as { status?: number }).status = response.status;
          throw error;
        }

        const data = (await response.json()) as OllamaEmbedResponse;
        if (!Array.isArray(data.embeddings)) {
          throw new HandoverError(
            'Local embedding endpoint returned invalid payload',
            `Expected an embeddings array from ${this.baseUrl}/api/embed`,
            `Ensure model '${this.model}' supports embeddings and Ollama is up to date`,
            'EMBEDDING_LOCAL_INVALID_RESPONSE',
          );
        }

        return data.embeddings;
      } finally {
        clearTimeout(timeout);
      }
    };

    try {
      return await retryWithBackoff(requestWithRetry, {
        maxRetries: 3,
        baseDelayMs: 1_000,
        isRetryable: (err: unknown) => {
          if (err && typeof err === 'object') {
            const status = (err as { status?: number }).status;
            return status === 429 || (status !== undefined && status >= 500);
          }

          if (err instanceof Error && err.name === 'AbortError') {
            return true;
          }

          return false;
        },
      });
    } catch (err) {
      if (err instanceof HandoverError) {
        throw err;
      }

      throw new HandoverError(
        'Local embedding request failed',
        err instanceof Error ? err.message : String(err),
        `Verify Ollama is running at ${this.baseUrl} and model '${this.model}' is installed`,
        'EMBEDDING_LOCAL_REQUEST_FAILED',
      );
    }
  }
}
