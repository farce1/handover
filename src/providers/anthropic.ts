import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import type { CompletionRequest, CompletionResult } from '../domain/types.js';
import { BaseProvider } from './base-provider.js';
import { zodToToolSchema } from './schema-utils.js';
import { ProviderError } from '../utils/errors.js';

/**
 * Anthropic Claude LLM provider.
 * PROV-01: Works with Claude Opus as default.
 * Uses tool_use pattern for Zod-validated structured output.
 */
export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(
    apiKey: string,
    model: string = 'claude-opus-4-6',
    concurrency: number = 4,
  ) {
    super(model, concurrency);
    this.client = new Anthropic({ apiKey });
    this.logInit('Anthropic', concurrency);
  }

  protected async doComplete<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>,
  ): Promise<CompletionResult & { data: T }> {
    const start = Date.now();

    const inputSchema = zodToToolSchema(schema) as Anthropic.Tool.InputSchema;

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
  }

  protected isRetryable(err: unknown): boolean {
    if (err && typeof err === 'object') {
      const status = (err as { status?: number }).status;
      return status === 429 || status === 529;
    }
    return false;
  }

  maxContextTokens(): number {
    return 200_000;
  }
}
