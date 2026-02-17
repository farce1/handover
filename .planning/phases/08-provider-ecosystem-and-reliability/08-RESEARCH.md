# Phase 8: Provider Ecosystem and Reliability - Research

**Researched:** 2026-02-17
**Domain:** Multi-provider LLM integration, cost estimation, crash recovery caching
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Cost estimation output
- `handover estimate` shows a single total (estimated tokens + total cost) -- no per-round breakdown
- Show cost comparison across providers: current provider's estimate plus what it would cost on other known providers
- Pure calculation only -- no network calls, no API key validation, just math from file count and model pricing
- Output in a styled terminal box (consistent with Phase 7's completion summary framing)

#### Crash recovery UX
- Auto-detect and resume: when `handover generate` runs, automatically detect cached round results and skip completed rounds -- no user prompt or flag needed
- `--no-cache` flag to force a clean run, discarding all cached results
- Cached rounds shown explicitly in terminal: "Round 1: cached" so user sees what was skipped vs what's running fresh
- Cache stored on local filesystem only (no external storage)

#### Provider switching
- Fail fast at startup: validate provider config (key present, model recognized) at the beginning of `generate` before any work starts -- clear error message if misconfigured
- Named provider presets out of the box: Anthropic, OpenAI, Ollama, Groq, Together, DeepSeek, Azure OpenAI
- Each preset knows its base URL, API key env var name, and supported model list
- Phase 7 banner already shows provider -- new providers just plug into existing banner display

#### Ollama local experience
- Require explicit model config -- user must set model name in .handover.yml; fail with clear message if model not pulled in Ollama
- Show a "LOCAL" badge/indicator in the startup banner when using Ollama -- reassures privacy-conscious users
- Same UX as cloud providers (same spinners, progress bars) but with longer timeout values -- no special "local mode" messaging
- Omit cost section entirely for local providers -- don't show $0.00, just skip cost display as irrelevant
- Concurrency capped at 1 for Ollama (per requirements)

### Claude's Discretion
- Cache invalidation strategy (content hash, time-based, or hybrid)
- Exact retry backoff implementation details (3 attempts: 30s, 60s, 120s per requirements)
- Provider preset data structure and how presets map to OpenAI-compatible clients
- How the estimate command discovers file count without running full static analysis

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Summary

Phase 8 extends handover from a single-provider (Anthropic) tool to a multi-provider ecosystem supporting Anthropic, OpenAI, Ollama, Groq, Together, DeepSeek, and Azure OpenAI -- all switchable via `.handover.yml` config alone. The existing provider architecture (`LLMProvider` interface, `createProvider` factory, `RateLimiter`, `retryWithBackoff`) is well-designed for extension: every new provider implements the same 3-method interface (`complete`, `estimateTokens`, `maxContextTokens`). The key insight is that OpenAI, Groq, Together, DeepSeek, and Azure OpenAI all speak the OpenAI-compatible chat/completions API, so a single `OpenAICompatibleProvider` class with configurable base URL, API key, and model handles 6 of the 7 providers. Only Anthropic retains its dedicated SDK. Additionally, this phase adds a `handover estimate` command for pre-run cost estimation and crash recovery via disk-cached intermediate round results.

The primary new dependency is the `openai` npm package (v5.x), which provides a well-typed TypeScript client with built-in Zod integration (`zodFunction`, `client.chat.completions.parse`) for structured output. Ollama exposes an OpenAI-compatible endpoint at `http://localhost:11434/v1/`, meaning it can use the same `openai` client with a different base URL and a dummy API key. The existing `retryWithBackoff` function already implements the required 3-attempt exponential backoff (30s, 60s, 120s) -- it just needs expanded `isRetryable` logic for OpenAI-style error codes.

**Primary recommendation:** Build one `OpenAICompatibleProvider` class that covers OpenAI, Groq, Together, DeepSeek, Azure OpenAI, and Ollama, parameterized by a `ProviderPreset` config object. Crash recovery uses content-hash-based cache invalidation stored in `.handover/cache/rounds/`. The estimate command uses fast file discovery (already in `file-discovery.ts`) to count files and estimate tokens without running full static analysis.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openai` | ^5.19.0 | OpenAI-compatible chat completions client | Official SDK with TypeScript types, Zod integration via `zodFunction()`, supports custom `baseURL` for any compatible endpoint |
| `zod` | ^3.24.0 | Already in project -- schema validation for structured LLM output | Used by both Anthropic and OpenAI paths |
| `zod-to-json-schema` | ^3.24.0 | Already in project -- converts Zod schemas for tool definitions | Used by OpenAI's `zodFunction()` helper and existing Anthropic path |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `picocolors` | ^1.1.0 | Already in project -- terminal colors for estimate output | Used for the styled estimate box |
| `commander` | ^13.0.0 | Already in project -- CLI command registration | Used to register `handover estimate` command |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `openai` npm package | Raw `fetch` calls to OpenAI-compatible endpoints | `openai` SDK gives type safety, Zod helpers, AzureOpenAI class, error typing, streaming -- worth the dependency |
| `ollama` npm package | `openai` with Ollama's `/v1/` compat endpoint | Ollama's dedicated SDK has nice model management but the OpenAI compat layer is sufficient for chat completions; one fewer dependency |

**Installation:**
```bash
npm install openai@^5.19.0
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  providers/
    base.ts              # LLMProvider interface (existing, unchanged)
    anthropic.ts         # AnthropicProvider (existing, unchanged)
    openai-compat.ts     # NEW: OpenAICompatibleProvider class
    presets.ts           # NEW: ProviderPreset definitions and registry
    factory.ts           # MODIFIED: expanded switch for all providers
  config/
    schema.ts            # MODIFIED: add baseUrl, timeout, cacheDir fields
    defaults.ts          # MODIFIED: expanded DEFAULT_API_KEY_ENV, DEFAULT_MODEL, DEFAULT_CONCURRENCY
    loader.ts            # MODIFIED: fail-fast validation at startup
  cache/
    round-cache.ts       # NEW: disk cache for round results
  cli/
    index.ts             # MODIFIED: register `estimate` command
    estimate.ts          # NEW: estimate command handler
    generate.ts          # MODIFIED: integrate round cache, --no-cache flag
  ui/
    components.ts        # MODIFIED: add LOCAL badge, cached round display, estimate box
```

### Pattern 1: OpenAI-Compatible Provider via Base URL Parameterization
**What:** A single `OpenAICompatibleProvider` class handles all OpenAI-compatible endpoints by accepting a `ProviderPreset` that configures the base URL, API key env var, and model list.
**When to use:** For any provider that speaks the OpenAI chat/completions API.
**Example:**
```typescript
// Source: Context7 openai-node docs + Ollama OpenAI compatibility docs
import OpenAI from 'openai';
import { zodFunction } from 'openai/helpers/zod';

// All these providers use the same class, different config:
const groqClient = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});

const ollamaClient = new OpenAI({
  baseURL: 'http://localhost:11434/v1/',
  apiKey: 'ollama', // required but ignored
});

// Both use the same chat.completions.parse() with zodFunction():
const completion = await client.chat.completions.parse({
  model: modelName,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  tools: [zodFunction({ name: 'structured_response', parameters: schema })],
  tool_choice: { type: 'function', function: { name: 'structured_response' } },
  temperature: 0.3,
  max_tokens: 4096,
});
```

### Pattern 2: Provider Preset Registry
**What:** A static registry of named presets that map provider names to their configuration (base URL, env var, default model, context window, pricing, concurrency).
**When to use:** When the factory needs to construct a provider from a config file's `provider: "groq"` field.
**Example:**
```typescript
export interface ProviderPreset {
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  defaultModel: string;
  contextWindow: number;
  defaultConcurrency: number;
  isLocal: boolean; // true for Ollama -- controls LOCAL badge, cost display
  pricing: Record<string, { inputPerMillion: number; outputPerMillion: number }>;
  supportedModels: string[]; // for fail-fast validation and estimate comparison
  timeoutMs: number; // longer for Ollama (300s), shorter for cloud (120s)
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  anthropic: { ... }, // Special case: uses Anthropic SDK, not OpenAI compat
  openai: { name: 'openai', baseUrl: 'https://api.openai.com/v1', ... },
  ollama: { name: 'ollama', baseUrl: 'http://localhost:11434/v1/', isLocal: true, ... },
  groq: { name: 'groq', baseUrl: 'https://api.groq.com/openai/v1', ... },
  together: { name: 'together', baseUrl: 'https://api.together.xyz/v1', ... },
  deepseek: { name: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', ... },
  'azure-openai': { name: 'azure-openai', baseUrl: '', ... }, // user must set baseUrl
};
```

### Pattern 3: Content-Hash-Based Round Cache (Discretion Area)
**What:** Before running each AI round, check if a cached result exists for that round with a matching content hash. The hash is derived from the static analysis fingerprint (file hashes) plus the round number plus the model name. If the hash matches, deserialize the cached result and skip the LLM call.
**When to use:** Crash recovery and repeat runs on unchanged codebases.
**Recommendation:** Use **content hash** (not time-based, not hybrid).

**Rationale:**
- Content hash is deterministic: same input = same cache key, regardless of when it ran
- Time-based is fragile: arbitrary expiry misses the point (crash recovery should work immediately)
- Hybrid adds complexity with no benefit: if the content hasn't changed, the cache is valid
- The existing `AnalysisCache` in `src/analyzers/cache.ts` already uses content hashing (SHA-256) -- follow the same pattern

**Cache key:** `sha256(JSON.stringify({ roundNumber, model, staticAnalysisHash, configHash }))`
**Cache location:** `.handover/cache/rounds/round-{N}.json`
**Static analysis hash:** SHA-256 of sorted file paths + sizes from file discovery (fast, no content reading)

**Example:**
```typescript
import { createHash } from 'node:crypto';

export interface RoundCacheEntry {
  hash: string;
  roundNumber: number;
  model: string;
  result: RoundExecutionResult<unknown>;
  createdAt: string;
}

export class RoundCache {
  constructor(private readonly cacheDir: string) {}

  computeHash(roundNumber: number, model: string, analysisFingerprint: string): string {
    return createHash('sha256')
      .update(JSON.stringify({ roundNumber, model, analysisFingerprint }))
      .digest('hex');
  }

  async get(roundNumber: number, hash: string): Promise<RoundCacheEntry | null> { ... }
  async set(roundNumber: number, hash: string, result: RoundExecutionResult<unknown>): Promise<void> { ... }
  async clear(): Promise<void> { ... } // for --no-cache
}
```

### Pattern 4: Fast File Count for Estimate (Discretion Area)
**What:** The `handover estimate` command needs file count and approximate token estimate without running full static analysis. Reuse `discoverFiles()` from `src/analyzers/file-discovery.ts` directly -- it runs in under 100ms for typical projects (fast-glob scan + .gitignore filter).
**Recommendation:** Call `discoverFiles(rootDir)` to get file count and sum file sizes, then use `Math.ceil(totalSize / 4)` as the total token estimate (same chars/4 heuristic used by all providers' `estimateTokens`).

**Rationale:**
- `discoverFiles` is already fast and battle-tested
- No need for AST parsing, git history, or any other analyzer
- The chars/4 heuristic is the same used by `AnthropicProvider.estimateTokens()` and is close enough for estimation purposes
- Over-estimates are better than under-estimates for cost estimation

### Pattern 5: Structured Tool Use Across Providers
**What:** The existing Anthropic provider uses Claude's `tool_use` pattern (tool definition + `tool_choice` + extract `ToolUseBlock`). The OpenAI-compatible providers use the equivalent OpenAI pattern: `tools` array with `zodFunction()` + `tool_choice` + extract `tool_calls[0].function.parsed_arguments`.
**When to use:** Every LLM call in the pipeline.

**Key difference:** Anthropic SDK returns `response.content.find(b => b.type === 'tool_use').input`, while OpenAI SDK returns `response.choices[0].message.tool_calls[0].function.parsed_arguments`. The `LLMProvider.complete()` method abstracts this -- callers never see the difference.

```typescript
// OpenAI-compatible provider complete() implementation:
async complete<T>(request, schema, options?) {
  const completion = await this.client.chat.completions.parse({
    model: this.model,
    messages: [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ],
    tools: [zodFunction({ name: 'structured_response', parameters: schema })],
    tool_choice: { type: 'function', function: { name: 'structured_response' } },
    temperature: request.temperature ?? 0.3,
    max_tokens: request.maxTokens ?? 4096,
  });

  const toolCall = completion.choices[0]?.message.tool_calls?.[0];
  const data = schema.parse(toolCall.function.parsed_arguments);

  return {
    data,
    usage: {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    },
    model: completion.model,
    duration: Date.now() - start,
  };
}
```

**IMPORTANT: Ollama structured output consideration.** Ollama supports structured output via the `format` parameter (passing a JSON schema directly) rather than the `tools` API. However, Ollama's OpenAI-compatible `/v1/chat/completions` endpoint also supports `tools` in recent versions. The OpenAI SDK approach with `tools` should work for Ollama models that support tool calling (e.g., llama3.1, qwen2.5). For models that do not support tools, a fallback to `format: jsonSchema` via the native Ollama client would be needed -- but this is an edge case since the recommended models all support tools.

### Anti-Patterns to Avoid
- **Per-provider SDK packages:** Do NOT add `groq-sdk`, `together-sdk`, etc. They all speak OpenAI-compatible API. One `openai` package handles them all.
- **Provider-specific code paths in generate.ts:** All provider differences MUST be encapsulated behind the `LLMProvider` interface. `generate.ts` should not know which provider is active.
- **Lazy API key validation:** The decision says fail fast at startup. Do NOT defer key validation to the first API call.
- **Caching the entire static analysis result:** Round cache only needs round results (the AI output). Static analysis runs fast and should always run fresh.
- **Showing $0.00 for local providers:** The decision says omit cost entirely. Check `preset.isLocal` and skip all cost display.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAI-compatible HTTP client | Custom fetch wrapper with auth, retries, error parsing | `openai` npm package | Handles auth, streaming, types, Zod helpers, Azure specifics, error classes |
| Azure OpenAI auth + API versioning | Custom URL construction with `api-version` query param | `openai` SDK's `AzureOpenAI` class | Handles deployment names, API versions, token providers |
| JSON Schema from Zod | Manual schema conversion | `zodFunction()` from `openai/helpers/zod` | Auto-converts Zod to OpenAI's strict function schema format |
| Content hashing | Custom hash function | `node:crypto` `createHash('sha256')` | Already used in `src/analyzers/cache.ts` -- follow same pattern |
| File discovery for estimate | Custom glob/walk | `discoverFiles()` from `src/analyzers/file-discovery.ts` | Already fast, handles .gitignore, returns sorted FileEntry[] |

**Key insight:** The OpenAI Node SDK is the universal adapter for all non-Anthropic providers. It handles base URL switching, error typing, Azure auth quirks, and structured output parsing. Building custom HTTP wrappers would be reimplementing what the SDK does.

## Common Pitfalls

### Pitfall 1: Ollama Tool Calling Model Compatibility
**What goes wrong:** Not all Ollama models support function/tool calling. Attempting `tools` with a model that doesn't support them returns an error or ignores the tool definition entirely.
**Why it happens:** Ollama supports hundreds of models but only certain ones (llama3.1+, qwen2.5+, mistral v0.3+) implement tool calling.
**How to avoid:** The preset's `supportedModels` list should document which models support tool calling. At startup validation, check the configured model against known-supported models. If unknown, warn but proceed (model support evolves).
**Warning signs:** Empty or malformed responses, missing `tool_calls` in the response, JSON parse errors.

### Pitfall 2: OpenAI SDK Error Status Codes Differ from Anthropic
**What goes wrong:** The existing `isRetryable` function in `retryWithBackoff` checks for HTTP 429 and 529 (Anthropic-specific overload). OpenAI uses 429 for rate limits and 500/503 for server errors. Groq, Together, DeepSeek may have their own codes.
**Why it happens:** Each provider returns different HTTP status codes for retryable errors.
**How to avoid:** Expand `isRetryable` to a provider-configurable function. The OpenAI SDK wraps errors in typed classes (`APIError`, `RateLimitError`, etc.) -- use these for reliable detection.
**Warning signs:** Retries not firing on rate limits, or retrying on non-retryable errors (400 Bad Request).

### Pitfall 3: Cache Serialization of Complex Types
**What goes wrong:** `RoundExecutionResult<T>` contains Zod-parsed objects that may have methods or non-serializable properties. `JSON.stringify` silently drops functions and symbols.
**Why it happens:** Zod `.parse()` returns plain objects, but if any transform or refinement adds non-serializable data, it breaks.
**How to avoid:** The current round result schemas are all flat Zod objects with primitive types (strings, numbers, arrays, booleans) -- no transforms, no methods. Verify this remains true by round-tripping through `JSON.parse(JSON.stringify(result))` in tests. The `context` field (compressed round output) is also plain data.
**Warning signs:** Cache loads successfully but downstream rounds get `undefined` for expected fields.

### Pitfall 4: Azure OpenAI Requires Deployment Name, Not Model Name
**What goes wrong:** Azure OpenAI doesn't use model names like `gpt-4o` directly -- it uses deployment names configured in the Azure portal. Passing a model name fails.
**Why it happens:** Azure wraps OpenAI models in "deployments" with user-chosen names.
**How to avoid:** For Azure, the `model` config field maps to the deployment name. Document this clearly. The `AzureOpenAI` class from the `openai` SDK handles this with the `deployment` parameter.
**Warning signs:** 404 errors from Azure saying "deployment not found".

### Pitfall 5: Ollama Timeout on First Request (Model Loading)
**What goes wrong:** Ollama loads models into memory on first request. For large models (70B+), this can take 30-60 seconds. The default timeout causes the request to fail.
**Why it happens:** Local inference requires GPU/CPU model loading, unlike cloud APIs.
**How to avoid:** The decision says "longer timeout values" for Ollama. Set `timeoutMs: 300000` (5 minutes) in the Ollama preset. The OpenAI SDK accepts a `timeout` option in the constructor.
**Warning signs:** Timeout errors on the first request only, with subsequent requests succeeding quickly.

### Pitfall 6: Usage Tokens Missing from Some Providers
**What goes wrong:** Some OpenAI-compatible providers (especially Ollama) may not return `usage.prompt_tokens` / `usage.completion_tokens` in the response, or return 0.
**Why it happens:** The `/v1/chat/completions` compat layer may not implement all fields.
**How to avoid:** Default to 0 when usage data is missing. For token tracking and cost estimation, use the chars/4 heuristic as fallback: `estimateTokens(systemPrompt + userPrompt)` for input, `estimateTokens(JSON.stringify(result.data))` for output.
**Warning signs:** Token counts showing 0 in the terminal, cost displaying $0.00 for cloud providers.

### Pitfall 7: Estimate Command Must Not Require API Key
**What goes wrong:** If `handover estimate` validates the API key (because it loads config), users can't estimate costs before setting up their provider.
**Why it happens:** Config loading in `loadConfig()` doesn't validate keys, but `resolveApiKey()` does -- and `estimate` must NOT call it.
**How to avoid:** The estimate command loads config for provider/model info but never calls `resolveApiKey()` or `createProvider()`. It uses the preset's pricing table directly. Decision says "no network calls, no API key validation."
**Warning signs:** Estimate command failing with "API key not found" errors.

## Code Examples

### OpenAICompatibleProvider Implementation
```typescript
// Source: Context7 openai-node docs (verified with /openai/openai-node)
import OpenAI from 'openai';
import { zodFunction } from 'openai/helpers/zod';
import type { z } from 'zod';
import type { LLMProvider } from './base.js';
import type { CompletionRequest, CompletionResult } from '../domain/types.js';
import type { ProviderPreset } from './presets.js';
import { RateLimiter, retryWithBackoff } from '../utils/rate-limiter.js';
import { ProviderError } from '../utils/errors.js';

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private client: OpenAI;
  private rateLimiter: RateLimiter;
  private model: string;
  private preset: ProviderPreset;

  constructor(preset: ProviderPreset, apiKey: string, model: string, concurrency: number) {
    this.name = preset.name;
    this.preset = preset;
    this.model = model;
    this.rateLimiter = new RateLimiter(concurrency);

    this.client = new OpenAI({
      baseURL: preset.baseUrl,
      apiKey,
      timeout: preset.timeoutMs,
    });
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

          const completion = await this.client.chat.completions.parse({
            model: this.model,
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userPrompt },
            ],
            tools: [zodFunction({ name: 'structured_response', parameters: schema })],
            tool_choice: { type: 'function', function: { name: 'structured_response' } },
            temperature: request.temperature ?? 0.3,
            max_tokens: request.maxTokens ?? 4096,
          });

          const toolCall = completion.choices[0]?.message.tool_calls?.[0];
          if (!toolCall) {
            throw new ProviderError(
              'No structured response from model',
              'The model did not return a tool_use/function_call block',
              'This may be a model issue -- try again or use a different model',
              'PROVIDER_NO_TOOL_USE',
            );
          }

          // parsed_arguments is auto-parsed by zodFunction + .parse()
          const data = schema.parse(toolCall.function.parsed_arguments);
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
            // OpenAI SDK error types
            if (err instanceof OpenAI.RateLimitError) return true;
            if (err instanceof OpenAI.InternalServerError) return true;
            if (err instanceof OpenAI.APIConnectionError) return true;
            // Fallback to status code check
            if (err && typeof err === 'object') {
              const status = (err as { status?: number }).status;
              return status === 429 || status === 500 || status === 503 || status === 529;
            }
            return false;
          },
          onRetry: options?.onRetry,
        },
      );
    });
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  maxContextTokens(): number {
    return this.preset.contextWindow;
  }
}
```

### Ollama via OpenAI SDK
```typescript
// Source: Context7 Ollama docs - OpenAI compatibility section
// Ollama exposes /v1/chat/completions that speaks the OpenAI protocol
const ollamaClient = new OpenAI({
  baseURL: 'http://localhost:11434/v1/',
  apiKey: 'ollama', // required by SDK but ignored by Ollama
  timeout: 300_000, // 5 minutes for model loading
});

// Works with the same chat.completions.parse() + zodFunction() pattern
```

### Round Cache Read/Write
```typescript
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export class RoundCache {
  private readonly cacheDir: string;

  constructor(baseDir: string = '.handover/cache/rounds') {
    this.cacheDir = baseDir;
  }

  /**
   * Compute cache fingerprint from round inputs.
   * Includes: roundNumber, model, analysis fingerprint (sorted file paths + sizes).
   */
  computeHash(roundNumber: number, model: string, analysisFingerprint: string): string {
    return createHash('sha256')
      .update(JSON.stringify({ roundNumber, model, analysisFingerprint }))
      .digest('hex');
  }

  /**
   * Compute analysis fingerprint from discovered files.
   * Fast: just paths + sizes, no content reading.
   */
  static computeAnalysisFingerprint(files: Array<{ path: string; size: number }>): string {
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    const data = sorted.map(f => `${f.path}:${f.size}`).join('\n');
    return createHash('sha256').update(data).digest('hex');
  }

  async get(roundNumber: number, expectedHash: string): Promise<unknown | null> {
    const path = join(this.cacheDir, `round-${roundNumber}.json`);
    if (!existsSync(path)) return null;
    try {
      const raw = await readFile(path, 'utf-8');
      const entry = JSON.parse(raw);
      if (entry.hash !== expectedHash) return null; // stale cache
      return entry.result;
    } catch {
      return null; // corrupted cache
    }
  }

  async set(roundNumber: number, hash: string, result: unknown): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const path = join(this.cacheDir, `round-${roundNumber}.json`);
    await writeFile(path, JSON.stringify({ hash, result, createdAt: new Date().toISOString() }));
  }

  async clear(): Promise<void> {
    if (existsSync(this.cacheDir)) {
      await rm(this.cacheDir, { recursive: true, force: true });
    }
  }
}
```

### Estimate Command Output
```typescript
// Styled terminal box consistent with Phase 7's completion summary framing
import pc from 'picocolors';
import { formatCost, formatTokens } from '../ui/formatters.js';

function renderEstimateBox(
  currentProvider: string,
  currentModel: string,
  fileCount: number,
  estimatedTokens: number,
  providerCosts: Array<{ provider: string; model: string; cost: number; isLocal: boolean }>,
): string[] {
  const lines: string[] = [];
  const sep = pc.dim(' \u00B7 ');

  // Header
  lines.push(`${pc.cyan('\u25B6')} ${pc.bold('handover estimate')}${sep}${fileCount} files${sep}${formatTokens(estimatedTokens)}`);
  lines.push('');

  // Provider comparison table
  for (const p of providerCosts) {
    const marker = p.provider === currentProvider ? pc.green('\u25B6 ') : '  ';
    const cost = p.isLocal ? pc.dim('FREE (local)') : pc.yellow(formatCost(p.cost));
    lines.push(`${marker}${p.provider}/${p.model}${sep}${cost}`);
  }

  return lines;
}
```

### Fail-Fast Provider Validation
```typescript
// In generate.ts, before any pipeline work:
function validateProviderConfig(config: HandoverConfig): void {
  const preset = PROVIDER_PRESETS[config.provider];
  if (!preset) {
    throw new ProviderError(
      `Unknown provider: "${config.provider}"`,
      'The provider name does not match any known preset',
      `Use one of: ${Object.keys(PROVIDER_PRESETS).join(', ')}`,
      'PROVIDER_UNKNOWN',
    );
  }

  // Validate API key present (skip for local providers)
  if (!preset.isLocal) {
    const envVarName = config.apiKeyEnv ?? preset.apiKeyEnv;
    if (!process.env[envVarName]) {
      throw ProviderError.missingApiKey(config.provider);
    }
  }

  // Validate model is recognized (warn if unknown, don't fail)
  if (config.model && preset.supportedModels.length > 0) {
    if (!preset.supportedModels.includes(config.model)) {
      logger.warn(`Model "${config.model}" is not in the known model list for ${config.provider}. Proceeding anyway.`);
    }
  }

  // Ollama: require explicit model config
  if (config.provider === 'ollama' && !config.model) {
    throw new ProviderError(
      'Ollama requires an explicit model name',
      'Unlike cloud providers, Ollama has no default model',
      'Set model in .handover.yml: model: "llama3.1:8b"',
      'PROVIDER_OLLAMA_NO_MODEL',
    );
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `openai` v3/v4 with manual JSON schema | `openai` v5 with `zodFunction()` and `.parse()` | 2025 | Native Zod integration eliminates manual schema conversion |
| Separate SDK per provider | OpenAI-compatible base URL pattern | 2024-2025 | Groq, Together, DeepSeek, Ollama all expose `/v1/chat/completions` |
| `@azure/openai` separate package | `openai` SDK's built-in `AzureOpenAI` class | 2024 | One package for OpenAI + Azure |

**Deprecated/outdated:**
- `openai` v3 function calling syntax: replaced by v4/v5 `tools` array
- `@azure/openai` npm package: deprecated in favor of `openai` SDK's built-in Azure support
- Ollama-only `ollama` npm package for chat: unnecessary when using OpenAI compat endpoint

## Discretion Recommendations

### 1. Cache Invalidation Strategy
**Recommendation: Content hash only.**
- Hash computed from: round number + model name + analysis fingerprint (sorted file paths + sizes)
- No time-based expiry -- if the codebase hasn't changed, the cache is valid forever
- The `--no-cache` flag provides manual override when users want a fresh run
- This matches the pattern already used in `src/analyzers/cache.ts`

### 2. Retry Backoff Implementation
**Recommendation: Keep existing `retryWithBackoff` function, expand `isRetryable`.**
- The function already implements 3 attempts with 30s base delay and exponential backoff (30s, 60s, 120s with jitter)
- Add OpenAI SDK error class checking (`RateLimitError`, `InternalServerError`, `APIConnectionError`)
- Make `isRetryable` configurable per-provider via the preset (Anthropic checks 429/529, OpenAI checks 429/500/503)
- No code change needed to the backoff math -- it already meets the requirement

### 3. Provider Preset Data Structure
**Recommendation: Static `PROVIDER_PRESETS` object in `src/providers/presets.ts`.**
- Each preset is a plain object implementing the `ProviderPreset` interface
- Anthropic preset marked as `sdkType: 'anthropic'` (uses Anthropic SDK)
- All others marked as `sdkType: 'openai-compat'` (uses OpenAI SDK with custom baseURL)
- Pricing table embedded per-preset for estimate command
- `supportedModels` array for fail-fast validation (non-exhaustive, warn on unknown)

### 4. Estimate File Count Discovery
**Recommendation: Reuse `discoverFiles()` directly.**
- `discoverFiles()` from `src/analyzers/file-discovery.ts` returns `FileEntry[]` with `path`, `size`, `extension`
- Runs in <100ms for typical projects (fast-glob + .gitignore)
- Token estimate: `sum(file.size) / 4` (chars/4 heuristic)
- No need for a separate "light" file scanner -- `discoverFiles` IS the light scanner

## Provider Pricing Data (for Estimate Command)

Current pricing as of February 2026 (used for estimate calculations):

| Provider | Model | Input $/M | Output $/M | Context Window |
|----------|-------|-----------|------------|----------------|
| Anthropic | claude-opus-4-6 | $15.00 | $75.00 | 200K |
| Anthropic | claude-sonnet-4-5 | $3.00 | $15.00 | 200K |
| OpenAI | gpt-4o | $2.50 | $10.00 | 128K |
| OpenAI | gpt-4o-mini | $0.15 | $0.60 | 128K |
| Groq | llama-3.3-70b | ~$0.59 | ~$0.79 | 128K |
| Together | llama-3.1-70b | ~$0.88 | ~$0.88 | 128K |
| DeepSeek | deepseek-v3 | $0.28 | $0.42 | 128K |
| Ollama | (local) | FREE | FREE | model-dependent |
| Azure OpenAI | gpt-4o (deployment) | $2.50 | $10.00 | 128K |

**Note:** Pricing changes frequently. These values should be maintained in `PROVIDER_PRESETS` and updated periodically. The estimate is a best-effort approximation, not a billing guarantee. The `MODEL_COSTS` table in `TokenUsageTracker` should be expanded to cover all preset models.

## Open Questions

1. **Ollama model validation at startup**
   - What we know: User wants "fail with clear message if model not pulled in Ollama"
   - What's unclear: Should we make an HTTP call to `http://localhost:11434/api/tags` to check if the model exists? This is technically a network call but local-only.
   - Recommendation: Yes, make a local HTTP call to Ollama's model list API at startup. This is a local-only network call (not cloud), validates the model exists before starting the pipeline, and provides a clear error. Alternatively, skip validation and let the first chat completion fail naturally -- but this wastes time on static analysis first.

2. **Azure OpenAI base URL and API version**
   - What we know: Azure requires a deployment-specific base URL and an `apiVersion` query parameter. The `openai` SDK's `AzureOpenAI` class handles this.
   - What's unclear: Should we support `AzureOpenAI` as a separate code path or treat it as a custom OpenAI-compatible endpoint?
   - Recommendation: Use `AzureOpenAI` from the `openai` SDK for the `azure-openai` preset. It extends `OpenAI` with Azure-specific config (`apiVersion`, deployment routing). The provider factory creates `AzureOpenAI` instead of `OpenAI` when the preset is `azure-openai`. This avoids users needing to manually construct the base URL.

3. **Cache directory configuration**
   - What we know: Cache stored on local filesystem
   - What's unclear: Should the cache directory be configurable in `.handover.yml`?
   - Recommendation: Default to `.handover/cache/rounds/` (alongside the existing `.handover/` output dir). No config needed for v1 -- `.handover/` is already the project's workspace directory.

## Sources

### Primary (HIGH confidence)
- Context7 `/openai/openai-node` - Chat completions with `.parse()`, `zodFunction()`, structured output, tool calls
- Context7 `/ollama/ollama-js` - Structured JSON outputs with Zod, tool calling, chat completion, model management
- Context7 `/llmstxt/ollama_llms-full_txt` - OpenAI compatibility endpoint `/v1/chat/completions`, usage with OpenAI SDK
- Codebase files: `src/providers/base.ts`, `src/providers/anthropic.ts`, `src/providers/factory.ts`, `src/config/schema.ts`, `src/config/defaults.ts`, `src/config/loader.ts`, `src/utils/rate-limiter.ts`, `src/utils/errors.ts`, `src/cli/generate.ts`, `src/context/tracker.ts`, `src/analyzers/cache.ts`, `src/analyzers/file-discovery.ts`

### Secondary (MEDIUM confidence)
- OpenAI pricing page (https://platform.openai.com/docs/pricing) - GPT-4o: $2.50/$10.00 per M tokens
- DeepSeek API docs (https://api-docs.deepseek.com/quick_start/pricing) - DeepSeek V3: $0.28/$0.42 per M tokens
- Groq pricing (https://groq.com/pricing) - Pay-as-you-go token pricing
- Azure OpenAI Node.js setup - `AzureOpenAI` class with `baseURL`, `apiVersion`, `apiKey`

### Tertiary (LOW confidence)
- Together AI pricing (https://www.together.ai/pricing) - Varies by model and endpoint tier, needs verification for specific models
- Groq specific model pricing - Search results showed general pricing tiers, not per-model detail

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - `openai` SDK is the canonical client, well-documented with Zod integration
- Architecture: HIGH - Codebase has clear provider interface and factory pattern ready for extension
- Pitfalls: HIGH - Identified from direct Context7 docs, OpenAI SDK error handling, and Ollama compatibility docs
- Pricing data: MEDIUM - Prices change frequently; embedded values are best-effort approximations

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (pricing data may change sooner; SDK patterns stable for 90+ days)
