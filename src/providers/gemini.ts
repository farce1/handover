import { GoogleGenAI } from '@google/genai';
import type { z } from 'zod';
import type { CompletionRequest, CompletionResult } from '../domain/types.js';
import { ProviderError } from '../utils/errors.js';
import { BaseProvider } from './base-provider.js';
import { zodToToolSchema } from './schema-utils.js';

/**
 * Google Gemini LLM provider.
 * Uses native structured JSON output with responseSchema.
 */
export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI;

  constructor(apiKey: string, model: string = 'gemini-2.5-flash', concurrency: number = 4) {
    super(model, concurrency);
    this.client = new GoogleGenAI({ apiKey });
    this.logInit('Gemini', concurrency);
  }

  protected async doComplete<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>,
    onToken?: (tokenCount: number) => void,
  ): Promise<CompletionResult & { data: T }> {
    const start = Date.now();
    const responseSchema = zodToToolSchema(schema);

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
      config: {
        systemInstruction: request.systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: responseSchema as Record<string, unknown>,
        maxOutputTokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
      },
    });

    if (!response.text) {
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        throw new ProviderError(
          'Gemini safety filter blocked the response',
          `Gemini returned finish reason ${finishReason}`,
          'Try a less sensitive prompt or switch to a different model',
          'PROVIDER_SAFETY_BLOCKED',
        );
      }

      throw new ProviderError(
        'No structured response from Gemini model',
        'Gemini did not return JSON content in response.text',
        'Retry the request or switch models',
        'PROVIDER_NO_RESPONSE',
      );
    }

    const data = schema.parse(JSON.parse(response.text));
    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    if (onToken && response.usageMetadata?.candidatesTokenCount !== undefined) {
      onToken(response.usageMetadata.candidatesTokenCount);
    }

    const duration = Date.now() - start;

    return {
      data,
      usage: {
        inputTokens,
        outputTokens,
      },
      model: this.model,
      duration,
    };
  }

  protected isRetryable(err: unknown): boolean {
    if (err && typeof err === 'object') {
      const status = (err as { status?: number }).status;
      return status === 429 || status === 500 || status === 503;
    }
    return false;
  }

  maxContextTokens(): number {
    return 1_000_000;
  }
}
