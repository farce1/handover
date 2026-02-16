import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LLMProvider } from './base.js';
import type { CompletionRequest, CompletionResult } from '../domain/types.js';
import { RateLimiter, retryWithBackoff } from '../utils/rate-limiter.js';
import { ProviderError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Anthropic Claude LLM provider.
 * PROV-01: Works with Claude Opus as default.
 * Uses tool_use pattern for Zod-validated structured output.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private rateLimiter: RateLimiter;
  private model: string;

  constructor(
    apiKey: string,
    model: string = 'claude-opus-4-6',
    concurrency: number = 4,
  ) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.rateLimiter = new RateLimiter(concurrency);

    // SEC-03: Log that code will be sent to cloud
    logger.log(`Anthropic provider initialized (model: ${model}, concurrency: ${concurrency})`);
  }

  async complete<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>,
  ): Promise<CompletionResult & { data: T }> {
    return this.rateLimiter.withLimit(async () => {
      return retryWithBackoff(
        async () => {
          const start = Date.now();

          // Convert Zod schema to JSON Schema for tool input
          const jsonSchema = zodToJsonSchema(schema, 'response');
          const inputSchema =
            (jsonSchema as Record<string, unknown>).definitions
              ? ((jsonSchema as Record<string, Record<string, unknown>>)
                  .definitions?.response as Anthropic.Tool.InputSchema)
              : (jsonSchema as Anthropic.Tool.InputSchema);

          const response = await this.client.messages.create({
            model: this.model,
            max_tokens: request.maxTokens ?? 4096,
            system: request.systemPrompt,
            messages: [
              { role: 'user', content: request.userPrompt },
            ],
            tools: [
              {
                name: 'structured_response',
                description: 'Return the analysis result as structured data',
                input_schema: inputSchema,
              },
            ],
            tool_choice: {
              type: 'tool' as const,
              name: 'structured_response',
            },
            temperature: request.temperature ?? 0.7,
          });

          // Extract tool_use block
          const toolBlock = response.content.find(
            (block): block is Anthropic.ToolUseBlock =>
              block.type === 'tool_use',
          );

          if (!toolBlock) {
            throw new ProviderError(
              'No structured response from model',
              'The model did not return a tool_use block',
              'This may be a model issue — try again or use a different model',
              'PROVIDER_NO_TOOL_USE',
            );
          }

          // Validate with Zod schema
          const data = schema.parse(toolBlock.input);

          const duration = Date.now() - start;

          return {
            data,
            usage: {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            },
            model: response.model,
            duration,
          };
        },
        {
          maxRetries: 3,
          baseDelayMs: 30_000,
          isRetryable: (err: unknown) => {
            if (err && typeof err === 'object') {
              const status = (err as { status?: number }).status;
              return status === 429 || status === 529;
            }
            return false;
          },
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
   * Claude Opus/Sonnet context window.
   */
  maxContextTokens(): number {
    return 200_000;
  }
}
