import { GoogleGenAI } from '@google/genai';
import { retryWithBackoff } from '../utils/rate-limiter.js';
import { HandoverError } from '../utils/errors.js';
import type { EmbeddingBatchResult, EmbeddingClient } from './embedder.js';

const GEMINI_EMBEDDING_DIMENSIONS = 1536;

export class GeminiEmbeddingProvider implements EmbeddingClient {
  readonly provider = 'remote' as const;
  readonly model: string;

  private client: GoogleGenAI;
  private readonly batchSize: number;

  constructor(apiKey: string, model = 'gemini-embedding-001', batchSize = 100) {
    this.model = model;
    this.client = new GoogleGenAI({ apiKey });
    this.batchSize = batchSize;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingBatchResult> {
    if (texts.length === 0) {
      return {
        embeddings: [],
        totalTokens: 0,
        dimensions: GEMINI_EMBEDDING_DIMENSIONS,
      };
    }

    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);

      const batchEmbeddings = await retryWithBackoff(
        async () => {
          const embeddings: number[][] = [];

          for (const text of batch) {
            const response = await this.client.models.embedContent({
              model: this.model,
              contents: text,
              config: {
                outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS,
              },
            });

            const result = response as {
              embeddings?: Array<{ values?: number[] }>;
              embedding?: { values?: number[] };
            };

            const values = result.embeddings?.[0]?.values ?? result.embedding?.values;
            if (!values || values.length === 0) {
              throw new HandoverError(
                'Gemini embedding request returned no vector values',
                'The embedContent response did not include embedding values',
                'Retry the request or verify the configured embedding model supports text embeddings',
                'EMBEDDING_EMPTY_RESPONSE',
              );
            }

            embeddings.push(values);
          }

          return embeddings;
        },
        {
          maxRetries: 3,
          baseDelayMs: 30_000,
          isRetryable: (err: unknown) => {
            if (err && typeof err === 'object') {
              const status = (err as { status?: number }).status;
              return status === 429 || (status !== undefined && status >= 500);
            }
            return false;
          },
        },
      );

      allEmbeddings.push(...batchEmbeddings);
    }

    const totalTokens = texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);

    return {
      embeddings: allEmbeddings,
      totalTokens,
      dimensions: GEMINI_EMBEDDING_DIMENSIONS,
    };
  }

  getDimensions(): number {
    return GEMINI_EMBEDDING_DIMENSIONS;
  }
}
