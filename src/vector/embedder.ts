/**
 * Embedding provider for OpenAI embedding API
 *
 * Handles batch embedding requests with retry logic and rate limiting.
 * Does NOT extend BaseProvider (BaseProvider is for LLM completions with schema validation).
 */

import { retryWithBackoff } from '../utils/rate-limiter.js';
import { logger } from '../utils/logger.js';
import { HandoverError } from '../utils/errors.js';
import { EMBEDDING_MODELS } from './types.js';
import type { HandoverConfig } from '../config/schema.js';

/**
 * Configuration for embedding provider
 */
export interface EmbeddingProviderConfig {
  /** OpenAI embedding model name */
  model: string;
  /** OpenAI API key */
  apiKey: string;
  /** Batch size for embedding requests (default: 100) */
  batchSize?: number;
}

/**
 * Result from embedding API call
 */
interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Embedding provider for OpenAI API
 *
 * Handles batching, retry logic, and rate limiting for embedding generation.
 */
export class EmbeddingProvider {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly batchSize: number;

  constructor(config: EmbeddingProviderConfig) {
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.batchSize = config.batchSize ?? 100;
  }

  /**
   * Embed a single batch of texts via OpenAI API
   *
   * @param texts - Array of text strings to embed
   * @returns Array of embedding vectors
   */
  private async embed(texts: string[]): Promise<number[][]> {
    const embedWithRetry = async () => {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: texts,
          model: this.model,
        }),
      });

      if (!response.ok) {
        const error = new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        (error as { status?: number }).status = response.status;
        throw error;
      }

      const data = (await response.json()) as OpenAIEmbeddingResponse;

      // Sort by index to ensure correct order
      const sortedData = data.data.sort((a, b) => a.index - b.index);
      return sortedData.map((item) => item.embedding);
    };

    return await retryWithBackoff(embedWithRetry, {
      maxRetries: 3,
      baseDelayMs: 30_000,
      isRetryable: (err: unknown) => {
        if (err && typeof err === 'object') {
          const status = (err as { status?: number }).status;
          // Retry on rate limit (429) or server errors (5xx)
          return status === 429 || (status !== undefined && status >= 500);
        }
        return false;
      },
    });
  }

  /**
   * Embed multiple texts with automatic batching
   *
   * @param texts - Array of text strings to embed
   * @returns Embeddings, dimensions, and token usage
   */
  async embedBatch(texts: string[]): Promise<{
    embeddings: number[][];
    totalTokens: number;
    dimensions: number;
  }> {
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

    // Split into batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);

      logger.log(
        `Embedding batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(texts.length / this.batchSize)} (${batch.length} texts)`,
      );

      const batchEmbeddings = await this.embed(batch);

      // Extract dimensions from first result
      if (dimensions === 0 && batchEmbeddings.length > 0) {
        dimensions = batchEmbeddings[0].length;
      }

      allEmbeddings.push(...batchEmbeddings);

      // Estimate tokens (OpenAI doesn't provide per-batch usage in the current implementation)
      // For now, we'll approximate based on input text length
      const batchTextLength = batch.reduce((sum, text) => sum + text.length, 0);
      totalTokens += Math.ceil(batchTextLength / 4);
    }

    return {
      embeddings: allEmbeddings,
      totalTokens,
      dimensions: dimensions || this.getDimensions(),
    };
  }

  /**
   * Get expected dimensions for the configured model
   *
   * @returns Embedding dimension count
   */
  getDimensions(): number {
    return EMBEDDING_MODELS[this.model] ?? 1536;
  }
}

/**
 * Create embedding provider from HandoverConfig
 *
 * Resolves API key and model from config with fallback to main provider config.
 *
 * @param config - Handover configuration
 * @returns Configured embedding provider
 * @throws HandoverError if OpenAI API key not found
 */
export function createEmbeddingProvider(config: HandoverConfig): EmbeddingProvider {
  let apiKey: string | undefined;
  let model: string;

  // Case 1: Explicit embedding config
  if (config.embedding) {
    model = config.embedding.model;
    const apiKeyEnv = config.embedding.apiKeyEnv ?? 'OPENAI_API_KEY';
    apiKey = process.env[apiKeyEnv];

    if (!apiKey) {
      throw new HandoverError(
        'Embedding requires an OpenAI API key',
        `Environment variable ${apiKeyEnv} is not set`,
        `Set the API key: export ${apiKeyEnv}=your-api-key-here\n` +
          `Or configure a different env var in .handover.yml under embedding.apiKeyEnv`,
        'EMBEDDING_NO_API_KEY',
      );
    }
  }
  // Case 2: Reuse OpenAI config from main provider
  else if (config.provider === 'openai') {
    model = 'text-embedding-3-small';
    const apiKeyEnv = config.apiKeyEnv ?? 'OPENAI_API_KEY';
    apiKey = process.env[apiKeyEnv];

    if (!apiKey) {
      throw new HandoverError(
        'Embedding requires an OpenAI API key',
        `Environment variable ${apiKeyEnv} is not set`,
        `Set the API key: export ${apiKeyEnv}=your-api-key-here\n` +
          `Or configure embedding.apiKeyEnv in .handover.yml`,
        'EMBEDDING_NO_API_KEY',
      );
    }
  }
  // Case 3: No OpenAI config found
  else {
    apiKey = process.env.OPENAI_API_KEY;
    model = 'text-embedding-3-small';

    if (!apiKey) {
      throw new HandoverError(
        'Embedding requires an OpenAI API key',
        'No OpenAI configuration found in .handover.yml and OPENAI_API_KEY is not set',
        'Set OPENAI_API_KEY environment variable or configure embedding section in .handover.yml:\n\n' +
          'embedding:\n' +
          '  provider: openai\n' +
          '  model: text-embedding-3-small\n' +
          '  apiKeyEnv: OPENAI_API_KEY',
        'EMBEDDING_NO_API_KEY',
      );
    }
  }

  return new EmbeddingProvider({
    model,
    apiKey,
    batchSize: config.embedding?.batchSize,
  });
}
