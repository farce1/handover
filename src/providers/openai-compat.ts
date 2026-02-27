import OpenAI from 'openai';
import { AzureOpenAI } from 'openai';
import { countTokens } from 'gpt-tokenizer';
import { countTokens as countTokensCl100k } from 'gpt-tokenizer/encoding/cl100k_base';
import type { z } from 'zod';
import type { ProviderPreset } from './presets.js';
import { AuthError } from '../auth/types.js';
import type { CompletionRequest, CompletionResult } from '../domain/types.js';
import { BaseProvider } from './base-provider.js';
import { zodToToolSchema } from './schema-utils.js';
import { ProviderError } from '../utils/errors.js';

function parseRetryAfterSeconds(err: InstanceType<typeof OpenAI.RateLimitError>): number | null {
  const rawMs = err.headers?.get('retry-after-ms');
  if (rawMs) {
    const ms = Number.parseFloat(rawMs);
    if (Number.isFinite(ms) && ms > 0) {
      return ms / 1000;
    }
  }

  const rawSeconds = err.headers?.get('retry-after');
  if (!rawSeconds) {
    return null;
  }

  const seconds = Number.parseFloat(rawSeconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds;
  }

  const parsedDate = Date.parse(rawSeconds);
  if (Number.isFinite(parsedDate)) {
    return Math.max(0, (parsedDate - Date.now()) / 1000);
  }

  return null;
}

function formatRateLimitDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return 'a moment';
  }

  const normalizedSeconds = Math.ceil(totalSeconds);
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

/**
 * OpenAI-compatible LLM provider.
 * Handles all non-Anthropic providers: OpenAI, Ollama, Groq, Together, DeepSeek, Azure OpenAI.
 * Uses the `openai` npm SDK with configurable baseURL for any OpenAI-compatible endpoint.
 */
export class OpenAICompatibleProvider extends BaseProvider {
  readonly name: string;
  private client: OpenAI;
  private preset: ProviderPreset;
  private isSubscription: boolean;

  constructor(
    preset: ProviderPreset,
    apiKey: string,
    model: string,
    concurrency: number,
    baseUrl?: string,
    isSubscription?: boolean,
  ) {
    super(model, concurrency);
    this.preset = preset;
    this.name = preset.name;
    this.isSubscription = isSubscription ?? false;

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

    this.logInit(preset.displayName, concurrency);
  }

  /**
   * BPE token estimation using gpt-tokenizer (EFF-05).
   * Replaces the chars/4 heuristic with accurate encoding-aware counting.
   * Uses o200k_base for modern models (gpt-4o, gpt-4.1, o-series),
   * cl100k_base for legacy models (gpt-4, gpt-3.5-turbo).
   */
  override estimateTokens(text: string): number {
    if (this.model.startsWith('gpt-4-') || this.model.startsWith('gpt-3.5-')) {
      return countTokensCl100k(text);
    }
    return countTokens(text);
  }

  protected async doComplete<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>,
    onToken?: (tokenCount: number) => void,
  ): Promise<CompletionResult & { data: T }> {
    try {
      const start = Date.now();

      const parameters = zodToToolSchema(schema);

      const params = {
        model: this.model,
        messages: [
          { role: 'system' as const, content: request.systemPrompt },
          { role: 'user' as const, content: request.userPrompt },
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
      };

      if (onToken) {
        // Streaming path: use chat.completions.stream() for live token count updates
        const runner = this.client.chat.completions.stream(params);

        let charCount = 0;
        runner.on('chunk', (chunk) => {
          const delta = chunk.choices[0]?.delta?.tool_calls?.[0]?.function?.arguments ?? '';
          charCount += delta.length;
          onToken(Math.ceil(charCount / 4));
        });

        const completion = await runner.finalChatCompletion();

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

        // OpenAI returns arguments as a JSON string; parse full accumulated response
        const data = schema.parse(JSON.parse(toolCall.function.arguments));

        // Snap to authoritative token count
        const completionTokens = completion.usage?.completion_tokens ?? Math.ceil(charCount / 4);
        onToken(completionTokens);

        const duration = Date.now() - start;

        return {
          data,
          usage: {
            inputTokens: completion.usage?.prompt_tokens ?? 0,
            outputTokens: completionTokens,
          },
          model: completion.model ?? this.model,
          duration,
        };
      } else {
        // Non-streaming path (original code, unchanged)
        const completion = await this.client.chat.completions.create(params);

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
      }
    } catch (err) {
      if (this.isSubscription && err instanceof OpenAI.RateLimitError) {
        const retrySeconds = parseRetryAfterSeconds(err);
        const duration = retrySeconds !== null ? formatRateLimitDuration(retrySeconds) : 'a moment';
        throw new ProviderError(
          'Rate limited',
          'Subscription rate limit reached',
          `Try again in ${duration}`,
          'PROVIDER_SUBSCRIPTION_RATE_LIMITED',
        );
      }

      if (this.isSubscription && err instanceof OpenAI.AuthenticationError) {
        throw AuthError.sessionExpired(this.preset.name);
      }

      throw err;
    }
  }

  protected isRetryable(err: unknown): boolean {
    if (err instanceof OpenAI.RateLimitError) return true;
    if (err instanceof OpenAI.InternalServerError) return true;
    if (err instanceof OpenAI.APIConnectionError) return true;
    if (err && typeof err === 'object') {
      const status = (err as { status?: number }).status;
      return status === 429 || status === 500 || status === 503;
    }
    return false;
  }

  maxContextTokens(): number {
    return this.preset.contextWindow;
  }
}
