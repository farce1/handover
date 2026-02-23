---
title: Adding a provider
---

# Adding a provider

handover uses a Template Method pattern for LLM providers. `BaseProvider` in `src/providers/base-provider.ts` handles the infrastructure — retry with exponential backoff, concurrent rate limiting, and token estimation. You implement the provider-specific API call. A working provider requires changes to four files.

## Step 1: Create the provider class

Create a new file in `src/providers/`. Name it after the provider (e.g., `src/providers/mistral.ts`).

Extend `BaseProvider` and implement three abstract members:

- `name` — a string identifier matching the preset key (used in logging)
- `doComplete<T>(request, schema)` — the actual API call; called by `BaseProvider.complete()` after acquiring the rate-limit slot
- `isRetryable(err)` — return `true` for transient errors (rate limits, server errors) so the retry loop handles them
- `maxContextTokens()` — return the provider's context window size in tokens

```typescript
// src/providers/mistral.ts
import { MistralClient } from '@mistralai/mistralai'; // or whichever SDK
import type { z } from 'zod';
import type { CompletionRequest, CompletionResult } from '../domain/types.js';
import { BaseProvider } from './base-provider.js';
import { ProviderError } from '../utils/errors.js';

export class MistralProvider extends BaseProvider {
  readonly name = 'mistral';
  private client: MistralClient;

  constructor(apiKey: string, model: string, concurrency: number) {
    super(model, concurrency);
    this.client = new MistralClient({ apiKey });
    this.logInit('Mistral', concurrency); // logs initialization
  }

  protected async doComplete<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>,
  ): Promise<CompletionResult & { data: T }> {
    const start = Date.now();

    // Call the API. handover always uses structured output (tool/function calls).
    // See src/providers/anthropic.ts (tool_use) or src/providers/openai-compat.ts
    // (function calling) for reference implementations.
    const response = await this.client.chat.complete({
      model: this.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      // Implement structured output using the provider's mechanism.
      // The response must be parsed and validated with schema.parse(rawData).
    });

    // Parse and validate with the Zod schema
    const rawData = /* extract structured data from response */ {};
    const data = schema.parse(rawData);

    return {
      data,
      usage: {
        inputTokens: response.usage?.promptTokens ?? 0,
        outputTokens: response.usage?.completionTokens ?? 0,
      },
      model: this.model,
      duration: Date.now() - start,
    };
  }

  protected isRetryable(err: unknown): boolean {
    if (err && typeof err === 'object') {
      const status = (err as { status?: number }).status;
      // Retry on rate limit (429), server error (500/503)
      return status === 429 || status === 500 || status === 503;
    }
    return false;
  }

  maxContextTokens(): number {
    return 128_000; // Adjust to the model's actual context window
  }
}
```

Look at `src/providers/anthropic.ts` (Anthropic tool_use pattern) and `src/providers/openai-compat.ts` (OpenAI function calling pattern) as reference implementations. Pick whichever matches your provider's structured output mechanism.

The `CompletionRequest` type (from `src/domain/types.ts`) has these fields:

- `systemPrompt: string`
- `userPrompt: string`
- `temperature?: number` (default varies by round, typically 0.3–0.7)
- `maxTokens?: number` (default 4096)

## Step 2: Add the preset

Add an entry to the `PROVIDER_PRESETS` record in `src/providers/presets.ts`. The preset defines everything about your provider that the factory and config validator need:

```typescript
mistral: {
  name: 'mistral',
  displayName: 'Mistral',
  baseUrl: 'https://api.mistral.ai/v1',
  apiKeyEnv: 'MISTRAL_API_KEY',        // env var name for the API key
  defaultModel: 'mistral-large-latest',
  contextWindow: 128_000,
  defaultConcurrency: 4,               // 1 for local models, 4 for cloud
  isLocal: false,                       // true only for Ollama-style local servers
  sdkType: 'openai-compat',            // 'anthropic' | 'openai-compat'
  pricing: {
    'mistral-large-latest': { inputPerMillion: 2, outputPerMillion: 6 },
  },
  supportedModels: ['mistral-large-latest', 'mistral-small-latest'],
  timeoutMs: 120_000,
},
```

The `sdkType` field controls which branch the factory takes (`'anthropic'` for the Anthropic SDK, `'openai-compat'` for the OpenAI SDK with a custom `baseURL`). For a provider with its own SDK (like the example above), you will add a new factory branch in Step 3.

## Step 3: Register in the factory

Open `src/providers/factory.ts`. The factory's `createProvider()` function switches on `preset.sdkType` to instantiate the right provider class.

If your provider fits the OpenAI-compatible pattern (uses the `openai` npm SDK with a custom base URL), you do not need to change the factory — set `sdkType: 'openai-compat'` in the preset and `OpenAICompatibleProvider` handles it automatically.

If your provider needs its own SDK, add a new `sdkType` value and a new `case` in the switch:

```typescript
// In src/providers/presets.ts, add to the sdkType union:
sdkType: 'anthropic' | 'openai-compat' | 'mistral';

// In src/providers/factory.ts, add a case:
case 'mistral': {
  const { MistralProvider } = await import('./mistral.js');
  return new MistralProvider(apiKey, model, concurrency);
}
```

Also add your provider name to the `VALID_PROVIDERS` list (it derives from `Object.keys(PROVIDER_PRESETS)` automatically once you add the preset).

## Step 4: Update the config schema

Open `src/config/schema.ts`. Add your provider name to the `provider` enum:

```typescript
provider: z
  .enum([
    'anthropic',
    'openai',
    'ollama',
    'groq',
    'together',
    'deepseek',
    'azure-openai',
    'mistral',      // add your provider here
    'custom',
  ])
  .default('anthropic'),
```

Run `npm run typecheck` to confirm no type errors.

## Step 5: Test

Set the API key and run handover against a small project:

```bash
MISTRAL_API_KEY=your-key npm run dev -- generate --provider mistral

# Or point at a specific project directory:
MISTRAL_API_KEY=your-key npm run dev -- generate --provider mistral --model mistral-small-latest

# Run static analysis only first to verify the config path works (no API cost):
npm run dev -- generate --static-only
```

Verify that:

- The terminal banner shows the correct provider name and model
- All six AI rounds complete without errors
- The `handover/` output directory contains the expected documents

To run the unit tests:

```bash
npm test
```

If you add a new provider class, add a unit test in `src/providers/` that mocks the SDK client and verifies that `doComplete()` returns a correctly shaped `CompletionResult`, and that `isRetryable()` returns `true` for 429 errors and `false` for others.
