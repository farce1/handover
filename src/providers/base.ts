import type { z } from 'zod';
import type { CompletionRequest, CompletionResult } from '../domain/types.js';

/**
 * LLM Provider interface.
 * PROV-05: Switching providers requires only a config change.
 */
export interface LLMProvider {
  readonly name: string;

  /**
   * Send a prompt and receive a Zod-validated structured response.
   */
  complete<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>,
  ): Promise<CompletionResult & { data: T }>;

  /**
   * Rough token count estimate for a text string.
   */
  estimateTokens(text: string): number;

  /**
   * Maximum context window size in tokens.
   */
  maxContextTokens(): number;
}
