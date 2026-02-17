import OpenAI from 'openai';
import { AzureOpenAI } from 'openai';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LLMProvider } from './base.js';
import type { ProviderPreset } from './presets.js';
import type { CompletionRequest, CompletionResult } from '../domain/types.js';
import { RateLimiter, retryWithBackoff } from '../utils/rate-limiter.js';
import { ProviderError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * OpenAI-compatible LLM provider.
 * Handles all non-Anthropic providers: OpenAI, Ollama, Groq, Together, DeepSeek, Azure OpenAI.
 * Uses the `openai` npm SDK with configurable baseURL for any OpenAI-compatible endpoint.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private client: OpenAI;
  private rateLimiter: RateLimiter;
  private model: string;
  private preset: ProviderPreset;

  constructor(
    preset: ProviderPreset,
    apiKey: string,
    model: string,
    concurrency: number,
    baseUrl?: string,
  ) {
    this.preset = preset;
    this.model = model;
    this.name = preset.name;
    this.rateLimiter = new RateLimiter(concurrency);

    // Azure OpenAI uses a dedicated client class
    if (preset.name === 'azure-openai') {
      this.client = new AzureOpenAI({
        apiKey,
        baseURL: baseUrl,
        apiVersion: '2024-10-21',
      });
    } else {
      this.client = new OpenAI({
        baseURL: baseUrl ?? preset.baseUrl,
        apiKey,
        timeout: preset.timeoutMs,
      });
    }

    logger.log(
      `${preset.displayName} provider initialized (model: ${model}, concurrency: ${concurrency})`,
    );
  }

  async complete<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>,
    options?: { onRetry?: (attempt: number, delayMs: number, reason: string) => void },
  ): Promise<CompletionResult & { data: T }> {
    return this.rateLimiter.withLimit(async () => {
      return retryWithBackoff(
        async () => {
          const start = Date.now();

          // Convert Zod schema to JSON Schema for tool parameters
          const jsonSchema = zodToJsonSchema(schema, 'response');
          const parameters =
            (jsonSchema as Record<string, unknown>).definitions
              ? (jsonSchema as Record<string, Record<string, unknown>>)
                  .definitions?.response
              : jsonSchema;

          const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userPrompt },
            ],
            tools: [
              {
                type: 'function' as const,
                function: {
                  name: 'structured_response',
                  description: 'Return the analysis result as structured data',
                  parameters: parameters as Record<string, unknown>,
                },
              },
            ],
            tool_choice: {
              type: 'function' as const,
              function: { name: 'structured_response' },
            },
            temperature: request.temperature ?? 0.3,
            max_tokens: request.maxTokens ?? 4096,
          });

          // Extract tool call from response
          const toolCall = completion.choices[0]?.message.tool_calls?.[0];

          if (!toolCall || toolCall.type !== 'function') {
            throw new ProviderError(
              'No structured response from model',
              'The model did not return a function tool call in its response',
              'This may be a model issue -- try again or use a different model',
              'PROVIDER_NO_TOOL_USE',
            );
          }

          // OpenAI returns arguments as a JSON string
          const data = schema.parse(JSON.parse(toolCall.function.arguments));

          const duration = Date.now() - start;

          return {
            data,
            usage: {
              inputTokens: completion.usage?.prompt_tokens ?? 0,
              outputTokens: completion.usage?.completion_tokens ?? 0,
            },
            model: completion.model ?? this.model,
            duration,
          };
        },
        {
          maxRetries: 3,
          baseDelayMs: 30_000,
          isRetryable: (err: unknown) => {
            if (err instanceof OpenAI.RateLimitError) return true;
            if (err instanceof OpenAI.InternalServerError) return true;
            if (err instanceof OpenAI.APIConnectionError) return true;
            if (err && typeof err === 'object') {
              const status = (err as { status?: number }).status;
              return status === 429 || status === 500 || status === 503;
            }
            return false;
          },
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
   * Context window from preset configuration.
   */
  maxContextTokens(): number {
    return this.preset.contextWindow;
  }
}
