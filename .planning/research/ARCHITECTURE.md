# Architecture Research

**Domain:** Performance Features — Caching, Parallel Execution, Streaming Output, Token Optimization
**Researched:** 2026-02-18
**Confidence:** HIGH (existing codebase read directly; patterns grounded in source; streaming patterns MEDIUM from web sources)

---

## Standard Architecture

This document covers how four performance features integrate with the existing DAG orchestrator and multi-round LLM pipeline. It does not re-document what already exists — it focuses on what changes and what is new.

### System Overview

Current pipeline (simplified):

```
CLI
 └── generate.ts (orchestration coordinator)
       ├── DAGOrchestrator.execute()
       │     ├── static-analysis step (sequential, always runs)
       │     ├── ai-round-1 step (depends on static-analysis)
       │     ├── ai-round-2 step (depends on ai-round-1)
       │     ├── ai-round-3 step (depends on ai-round-1, ai-round-2)
       │     ├── ai-round-4 step (depends on ai-round-1..3)
       │     ├── ai-round-5 step (depends on ai-round-1, ai-round-2)
       │     ├── ai-round-6 step (depends on ai-round-1, ai-round-2)
       │     └── render step (depends on terminal rounds)
       ├── RoundCache (disk cache, already exists at src/cache/round-cache.ts)
       ├── AnalysisCache (disk cache, already exists at src/analyzers/cache.ts)
       ├── TokenUsageTracker (cost tracking, src/context/tracker.ts)
       └── TerminalRenderer (progress UI, src/ui/renderer.ts)
```

Performance feature integration points:

```
┌─────────────────────────────────────────────────────────────────────┐
│  CACHING LAYER (already partially exists — extend, do not rewrite)  │
│                                                                     │
│  AnalysisCache (src/analyzers/cache.ts)                             │
│    File-hash-based: skip re-parsing unchanged files                 │
│                                                                     │
│  RoundCache (src/cache/round-cache.ts)                              │
│    Content-hash-based: skip LLM calls for unchanged codebases       │
│    Already wired into generate.ts wrapWithCache()                   │
│                                                                     │
│  NEW: PromptCache coordination (Anthropic prompt caching API)       │
│    Prefix caching: mark static system context as cacheable          │
│    Lives in: src/providers/anthropic.ts (modify doComplete)         │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PARALLEL EXECUTION (extend DAGOrchestrator behavior)               │
│                                                                     │
│  Current: DAGOrchestrator already runs independent steps in         │
│           parallel via Promise.race (lines 227-228 in dag.ts)       │
│  Current: AI rounds 5 and 6 have identical deps (rounds 1,2)       │
│           — they could run in parallel but don't because they are   │
│             created sequentially with sequential dep declarations   │
│                                                                     │
│  NEW: Declare rounds 5 and 6 with same deps → DAG runs them        │
│       concurrently automatically (no orchestrator changes needed)   │
│                                                                     │
│  NEW: AnalyzerConcurrencyConfig — expose config.analysis.concurrency│
│       already exists in schema; verify coordinator uses it          │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STREAMING OUTPUT (new capability in providers)                     │
│                                                                     │
│  Current: providers use non-streaming tool_use / function calls     │
│           Response arrives all at once; no progress during LLM wait │
│                                                                     │
│  NEW: StreamingProvider interface extension                         │
│       Adds optional completeStream() method to BaseProvider         │
│       Streaming incompatible with tool_use structured output        │
│       → Stream text, then parse/validate JSON at stream end         │
│       → Falls back to non-streaming if provider doesn't support it  │
│                                                                     │
│  UI integration: TerminalRenderer.onRoundToken() callback           │
│  new: shows "receiving..." progress during LLM wait                 │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TOKEN OPTIMIZATION (extend existing context layer)                 │
│                                                                     │
│  Current: computeTokenBudget(), scoreFiles(), packFiles()           │
│           compressRoundOutput() deterministic field extraction      │
│           estimateTokens() uses chars/4 heuristic                   │
│                                                                     │
│  NEW: Anthropic prompt caching headers (cache_control blocks)       │
│       Marks stable context prefix as cacheable → 90% token discount │
│                                                                     │
│  NEW: Improved token estimator (tiktoken or provider native)        │
│       chars/4 is 15-20% inaccurate; inaccuracy wastes budget       │
│                                                                     │
│  NEW: Dynamic context budget tuning based on --only selection       │
│       If only 2 rounds needed, budget can be larger per round       │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (New vs Modified)

| Component                             | Status | Responsibility                                                | Modified By                                                                |
| ------------------------------------- | ------ | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/cache/round-cache.ts`            | EXISTS | Disk cache for AI round results                               | Already wired. Extension: expose `getCacheStatus()` for better UI feedback |
| `src/analyzers/cache.ts`              | EXISTS | File-hash cache for static analysis                           | Already exists. Verify coordinator uses it                                 |
| `src/providers/anthropic.ts`          | MODIFY | Add `cache_control` headers for prompt caching                | Prompt cache blocks                                                        |
| `src/providers/base-provider.ts`      | MODIFY | Add optional streaming path (`completeStream`)                | Streaming support                                                          |
| `src/providers/base.ts` (interface)   | MODIFY | Expose streaming capability flag                              | Streaming support                                                          |
| `src/context/token-counter.ts`        | MODIFY | Improve token estimation accuracy                             | Token optimization                                                         |
| `src/ai-rounds/round-5-edge-cases.ts` | MODIFY | Verify deps declare only rounds 1,2                           | Parallel execution                                                         |
| `src/ai-rounds/round-6-deployment.ts` | MODIFY | Verify deps declare only rounds 1,2                           | Parallel execution                                                         |
| `src/cli/generate.ts`                 | MODIFY | Expose --stream flag; parallel round sequencing               | All features                                                               |
| `src/ui/renderer.ts`                  | MODIFY | Add `onRoundToken()` for streaming progress                   | Streaming support                                                          |
| `src/ui/types.ts`                     | MODIFY | Add streaming state to DisplayState                           | Streaming support                                                          |
| `src/config/schema.ts`                | MODIFY | Add `performance.promptCache`, `performance.streaming` fields | Config                                                                     |
| NEW: `src/providers/streaming.ts`     | NEW    | Streaming result types and utilities                          | Streaming support                                                          |

---

## Recommended Project Structure

The performance features do not require new top-level folders. All additions are targeted modifications or small new files within existing directories.

```
src/
├── cache/
│   └── round-cache.ts          # EXISTS — minor: add getCacheStatus() helper
├── analyzers/
│   └── cache.ts                # EXISTS — verify coordinator uses it fully
├── providers/
│   ├── base.ts                 # MODIFY — add hasStreamingSupport() to interface
│   ├── base-provider.ts        # MODIFY — add completeStream() with fallback
│   ├── anthropic.ts            # MODIFY — add cache_control headers to doComplete()
│   ├── openai-compat.ts        # MODIFY — add stream: true path for compatible providers
│   └── streaming.ts            # NEW — StreamChunk type, streaming result utilities
├── context/
│   └── token-counter.ts        # MODIFY — optional: more accurate estimator
├── ai-rounds/
│   ├── round-5-edge-cases.ts   # VERIFY deps, no change if already correct
│   └── round-6-deployment.ts   # VERIFY deps, no change if already correct
├── cli/
│   └── generate.ts             # MODIFY — --stream flag, wiring
├── config/
│   └── schema.ts               # MODIFY — performance config block
└── ui/
    ├── types.ts                 # MODIFY — streaming display state
    └── renderer.ts              # MODIFY — onRoundToken() callback
```

### Structure Rationale

- **No new top-level folders:** All performance features are modifications to existing layers. Creating `src/performance/` or `src/streaming/` would fragment cohesion — streaming belongs in `providers/`, caching belongs in `cache/`, token work belongs in `context/`.
- **streaming.ts in providers/:** Streaming is a provider capability, not a pipeline concept. The type definitions and utilities belong alongside the providers that use them.
- **Schema changes minimal:** One new `performance` block in `HandoverConfigSchema` controls all performance flags. This keeps config discoverable and opt-in.

---

## Architectural Patterns

### Pattern 1: Prompt Caching via cache_control Headers (Anthropic)

**What:** Anthropic's API supports marking message content blocks with `"cache_control": {"type": "ephemeral"}`. Cached blocks are stored for 5 minutes and cost 10% of normal input tokens on cache hit (90% discount). Cache miss costs 25% extra but subsequent hits recoup this immediately.

**When to use:** Mark the static system context (file tree, dependency summary, static analysis data) as cacheable. This context is identical across all 6 rounds in a single run. Without prompt caching, this context is re-tokenized and billed 6 times. With prompt caching, it is tokenized once; rounds 2-6 pay 10%.

**Trade-offs:** Only available on Anthropic provider. Other providers do not have equivalent. Must be guarded by provider check. Cache is ephemeral (5 minutes) — only useful within a single `handover generate` run, not across runs.

**Example — modified AnthropicProvider.doComplete():**

```typescript
// In src/providers/anthropic.ts
protected async doComplete<T>(
  request: CompletionRequest,
  schema: z.ZodType<T>,
): Promise<CompletionResult & { data: T }> {
  const inputSchema = zodToToolSchema(schema) as Anthropic.Tool.InputSchema;

  // Mark the static context in system prompt as cacheable
  // This is the large block of file content / static analysis data
  const systemContent: Anthropic.TextBlockParam[] = request.cacheablePrefix
    ? [
        {
          type: 'text',
          text: request.cacheablePrefix,
          cache_control: { type: 'ephemeral' },  // <-- NEW
        },
        {
          type: 'text',
          text: request.systemPrompt,
        },
      ]
    : [{ type: 'text', text: request.systemPrompt }];

  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: request.maxTokens ?? 4096,
    system: systemContent,  // now array, not string
    messages: [{ role: 'user', content: request.userPrompt }],
    // ... tools unchanged
    betas: ['prompt-caching-2024-07-31'],  // required for cache_control
  });
  // ...
}
```

**CompletionRequest must be extended:**

```typescript
// In src/domain/types.ts
export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  cacheablePrefix?: string; // NEW — stable context block to cache
}
```

**Where `cacheablePrefix` comes from:** The packed file context (`packedContext.fileContent`) is the stable prefix — it does not change between rounds. The per-round instructions go in `systemPrompt`. The round factory (`src/ai-rounds/round-factory.ts`) passes `packedContext` already; extracting the file content into `cacheablePrefix` is a targeted change there.

### Pattern 2: Parallel Round Execution via DAG Dependency Declaration

**What:** The existing DAGOrchestrator already supports parallel execution — independent steps run via `Promise.race`. The bottleneck is dependency declarations. Rounds 5 and 6 both depend only on rounds 1 and 2, making them candidates for parallel execution.

**When to use:** Any two rounds that do not consume each other's output can be declared with the same dependencies and will run in parallel automatically.

**Trade-offs:** Round execution order becomes non-deterministic for rounds with same deps. This is fine — rounds are independent by design. The `roundResults` Map in generate.ts is safe because DAG guarantees a round's `execute()` only runs after its deps complete.

**Example — verifying round dep declarations:**

```typescript
// src/ai-rounds/round-5-edge-cases.ts
export const ROUND_5_CONFIG: StandardRoundConfig<Round5Output> = {
  roundNumber: 5,
  name: 'Edge Cases & Conventions',
  deps: ['static-analysis', 'ai-round-1', 'ai-round-2'], // NOT round 3 or 4
  // ...
};

// src/ai-rounds/round-6-deployment.ts
export const ROUND_6_CONFIG: StandardRoundConfig<Round6Output> = {
  roundNumber: 6,
  name: 'Deployment Inference',
  deps: ['static-analysis', 'ai-round-1', 'ai-round-2'], // NOT round 3 or 4
  // ...
};
```

If rounds 5 and 6 currently declare these deps, parallel execution is free — no orchestrator changes needed. If they over-declare (e.g., depending on round 3 or 4 when they don't use those results), removing the excess deps is the only change needed.

**Analyzer parallelism:** `config.analysis.concurrency` already exists in the schema (default: 4). Verify `src/analyzers/coordinator.ts` respects this value when running the 8 analyzers concurrently.

### Pattern 3: Streaming with Deferred Schema Validation

**What:** LLM APIs support streaming responses (token by token) for faster perceived performance. However, Anthropic's `tool_use` and OpenAI's `function_call` structured output patterns require the complete JSON before Zod validation can run. The streaming pattern for structured output is: stream the raw text, accumulate it, then parse and validate the complete JSON at stream end.

**When to use:** When `--stream` is enabled and the provider supports streaming. Stream is opt-in because it complicates error handling and adds UI state management complexity.

**Trade-offs:** Streaming does not reduce total LLM token cost or total execution time — it only improves perceived latency (user sees activity rather than a spinning cursor). For long rounds (4096 max_tokens), streaming shows output token-by-token which is visible. For structured output, the JSON is not meaningful until complete — but the user sees characters appearing, signaling progress.

**Example — new streaming.ts types:**

```typescript
// src/providers/streaming.ts
export interface StreamChunk {
  type: 'token' | 'done' | 'error';
  content?: string; // token text
  error?: Error; // on error
  fullText?: string; // on done: accumulated text
}

export type StreamCallback = (chunk: StreamChunk) => void;
```

**Example — interface extension in base.ts:**

```typescript
// src/providers/base.ts
export interface LLMProvider {
  readonly name: string;
  complete<T>(request: CompletionRequest, schema: z.ZodType<T>, options?: {...}): Promise<CompletionResult & { data: T }>;
  estimateTokens(text: string): number;
  maxContextTokens(): number;
  supportsStreaming(): boolean;  // NEW — providers declare capability
}
```

**Example — UI integration:**

```typescript
// src/ui/types.ts (extend Renderer interface)
export interface Renderer {
  // ... existing methods
  onRoundToken?(roundNum: number, token: string): void; // NEW — optional
}
```

The `TerminalRenderer` shows a character counter or partial text indicator when `onRoundToken` is called. The `CIRenderer` ignores it (no-op). Both are safe because the method is optional.

### Pattern 4: Improved Token Estimation

**What:** The current `estimateTokens(text)` uses `Math.ceil(text.length / 4)` — the chars/4 heuristic. This is accurate within 15-20% for English code. For token budget computation (`computeTokenBudget`), this inaccuracy compounds: if the budget is calculated at 200K tokens but the actual usage is 15% higher, files get packed that overflow the context window.

**When to use:** A more accurate estimator benefits all runs. The improvement is in `src/context/token-counter.ts` and the provider's `estimateTokens()` implementation.

**Recommended approach:** Use `js-tiktoken` (the JavaScript port of OpenAI's tiktoken) for GPT-family providers. For Anthropic, the chars/4 heuristic is closer to accurate because Claude uses a similar tokenizer. Alternatively, use the Anthropic token counting API endpoint (`/v1/messages/count_tokens`) as a pre-flight check — but this adds latency and an extra API call.

**Practical recommendation:** Keep chars/4 as the default. Add `tiktoken` as an optional estimator for OpenAI-family providers when `performance.preciseTokenCounting: true` is in config. The complexity budget for this feature is low relative to prompt caching.

**Example — config schema extension:**

```typescript
// src/config/schema.ts
export const HandoverConfigSchema = z.object({
  // ... existing fields
  performance: z
    .object({
      promptCache: z.boolean().default(true), // Anthropic prompt caching
      streaming: z.boolean().default(false), // streaming output
      preciseTokenCounting: z.boolean().default(false), // tiktoken estimator
    })
    .default({}),
});
```

---

## Data Flow

### Caching Flow (per-run)

```
generate.ts starts
    ↓
RoundCache.getCachedRounds()  → check what's already cached
    ↓
[for each required round]
    wrapWithCache() checks hash
        ├── HIT:  return cached result, mark UI as 'cached', skip LLM call
        └── MISS: execute round → LLM call → store result → return
    ↓
All rounds complete (mix of cache hits and LLM calls)
    ↓
Render step (reads roundResults, all populated regardless of hit/miss)
```

### Parallel Round Flow

```
static-analysis step completes
    ↓ (DAGOrchestrator checkDependents triggers)
ai-round-1 starts
    ↓ (ai-round-1 completes)
ai-round-2 starts (depends on round-1)
    ↓ (ai-round-2 completes)
ai-round-3 starts (depends on rounds 1,2)
ai-round-4 starts (depends on rounds 1,2,3 — waits for 3)
ai-round-5 starts (depends on rounds 1,2 — starts same time as 3)  ← parallel
ai-round-6 starts (depends on rounds 1,2 — starts same time as 3)  ← parallel
    ↓ (all terminal rounds complete)
render step starts
```

Note: Rounds 3 and 4 remain sequential (4 depends on 3). Rounds 5 and 6 run in parallel with rounds 3 and 4 if their deps are correctly declared.

### Streaming Flow (per round, when enabled)

```
provider.completeStream(request, onChunk) called
    ↓
LLM streams tokens
    ↓ (each token)
onChunk({ type: 'token', content: '...' })
    → renderer.onRoundToken(roundNum, token)
    → UI shows partial output indicator
    ↓ (stream ends)
onChunk({ type: 'done', fullText: '...' })
    → Zod schema.parse(JSON.parse(fullText))
    → validation and quality check run on complete data
    → RoundCache.set() stores complete validated result
```

### Prompt Cache Flow (Anthropic, within a single run)

```
Round 1 call:
  system: [{ text: packedFileContent, cache_control: ephemeral }, { text: round1Instructions }]
  → Anthropic stores packedFileContent in cache for 5 minutes
  → Usage: cache_creation_input_tokens (billed at 125%)

Round 2 call:
  system: [{ text: packedFileContent, cache_control: ephemeral }, { text: round2Instructions }]
  → Anthropic recognizes same prefix in cache
  → Usage: cache_read_input_tokens (billed at 10%)

Rounds 3-6: same pattern → each pays 10% for the large static context block
```

### Key Data Flows

1. **Cache hit bypasses `executeRound`:** When `wrapWithCache()` returns cached data, it stores directly into `roundResults` and updates UI state. The `executeRound` function is never called, saving the LLM API call, all retry logic, and quality checking.

2. **Parallel rounds share `roundResults` safely:** The `roundResults` Map is shared mutable state. It is safe because the DAG guarantees sequential-by-dependency execution — a round's `execute()` cannot read from `roundResults` before its declared deps have written to it.

3. **Prompt caching is transparent to round logic:** Round factories build prompts as normal. The `cacheablePrefix` extraction happens in the round factory or the prompt builder — round-specific logic does not change.

4. **Streaming fallback is provider-local:** If `completeStream` is not implemented or `supportsStreaming()` returns false, `BaseProvider.complete()` is called unchanged. The streaming path is additive, not replacing the existing path.

---

## Scaling Considerations

These performance features target the primary pain point: a single `handover generate` run takes 3-8 minutes on a medium-sized codebase, mostly waiting for 6 sequential LLM API calls.

| Concern          | Current      | With Parallel (rounds 5+6) | With Prompt Cache                       | With Round Cache (2nd run)  |
| ---------------- | ------------ | -------------------------- | --------------------------------------- | --------------------------- |
| Total LLM calls  | 6 sequential | ~4 sequential steps        | 6 calls, 5 cached reads                 | 0 (full hit) or partial     |
| Perceived wait   | 3-8 min      | ~2-4 min                   | 3-8 min (savings are cost, not latency) | <30s (static analysis only) |
| Token cost       | 100%         | 100%                       | ~20-30%                                 | 0%                          |
| Code change size | —            | Small (dep declarations)   | Medium (provider layer)                 | Already implemented         |

### Scaling Priorities

1. **First win: Round cache is already implemented.** Second runs on an unchanged codebase skip all LLM calls. This is the highest-ROI feature. Ensure it is correctly wired and working.

2. **Second win: Parallel rounds 5+6.** Rounds 5 and 6 have identical deps (rounds 1, 2) and do not consume each other's output. If their dep declarations are correct, the DAG runs them concurrently automatically. This is potentially zero code change if the dep declarations are already minimal.

3. **Third win: Prompt caching.** 70-80% token cost reduction on rounds 2-6 for Anthropic users. Medium code change in the provider layer. No impact on other providers.

4. **Fourth win: Streaming.** Improves perceived latency only. Medium complexity — new UI state, new provider path, careful error handling. Lower ROI than caching but noticeable UX improvement for first-time runs.

5. **Defer: Precise token counting.** The chars/4 heuristic is sufficient. Tiktoken adds a dependency with marginal accuracy gain. Address only if token budget overflows are observed in practice.

---

## Anti-Patterns

### Anti-Pattern 1: Adding a Separate Cache Layer for Prompt Caching

**What people do:** Create a new `src/cache/prompt-cache.ts` to "manage" Anthropic prompt caching.

**Why it's wrong:** Anthropic prompt caching is managed entirely by the Anthropic API — it's ephemeral (5 minute TTL), automatic on subsequent calls with the same prefix, and requires no client-side state management. Adding a client-side cache layer for something the API already manages is pure overhead.

**Do this instead:** Add `cache_control` headers in `AnthropicProvider.doComplete()` and add `cacheablePrefix` to `CompletionRequest`. That's the entire implementation. No new cache class.

### Anti-Pattern 2: Streaming with Partial JSON Validation

**What people do:** Try to validate the streaming Zod schema as tokens arrive, using partial JSON parsers.

**Why it's wrong:** Handover's structured output uses Anthropic's `tool_use` block and OpenAI's `function_call`, both of which require the complete JSON string before Zod can validate. Partial JSON parsers are fragile and add complexity without benefit — the schema validation needs the full response regardless.

**Do this instead:** Stream tokens for UI feedback only. Accumulate the full text. Parse and validate at stream end exactly as the non-streaming path does.

### Anti-Pattern 3: Changing DAGOrchestrator for Parallelism

**What people do:** Add concurrency controls, thread pools, or max-parallel settings to DAGOrchestrator.

**Why it's wrong:** The DAGOrchestrator already runs independent steps in parallel via `Promise.race` (line 227 in dag.ts). The concurrency model is correct. The only thing preventing rounds 5 and 6 from running in parallel is their dependency declarations. Fix the declarations, not the orchestrator.

**Do this instead:** Audit the dep declarations in `round-5-edge-cases.ts` and `round-6-deployment.ts`. Remove any over-declared deps (deps that the round doesn't actually consume). The orchestrator will handle the rest.

### Anti-Pattern 4: Caching LLM Responses by Prompt Hash

**What people do:** Hash the full prompt text and use that as the cache key, storing LLM responses in a key-value store keyed by prompt hash.

**Why it's wrong:** Handover already has the correct cache key: content hash of (round number + model name + analysis fingerprint). The analysis fingerprint is a hash of all file paths and sizes — a cheap proxy for "did the codebase change?" This is more stable than a prompt hash (prompts include timestamps, config values) and already implemented in `RoundCache.computeHash()`.

**Do this instead:** Keep the existing cache key strategy. The only valid reason to change it is if false cache hits occur in practice (cache returns stale data). Verify this doesn't happen before considering changes.

### Anti-Pattern 5: Making Streaming Mandatory

**What people do:** Replace `provider.complete()` calls with `provider.completeStream()` for all rounds.

**Why it's wrong:** Streaming complicates error handling (partial network failure mid-stream), requires UI state management for partial output, and has no benefit in CI environments or when piped output is used. The existing non-streaming path is simpler and more reliable.

**Do this instead:** Make streaming opt-in via `--stream` flag and `performance.streaming: true` in config. Default to non-streaming. The `supportsStreaming()` method on the provider interface allows the generate command to check capability before attempting to stream.

---

## Integration Points

### External Services

| Service                       | Integration Pattern                                                                     | Notes                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Anthropic API                 | Add `cache_control` to system content array; add `betas: ['prompt-caching-2024-07-31']` | Only for Anthropic provider; must check API version support; beta header may change         |
| Anthropic API (streaming)     | `client.messages.stream()` instead of `client.messages.create()`                        | Streaming path through beta streaming API; verify current Anthropic SDK version supports it |
| OpenAI-compat API (streaming) | `client.chat.completions.create({ stream: true })`                                      | OpenAI SDK supports streaming natively; returns `Stream<ChatCompletionChunk>`               |

### Internal Boundaries

| Boundary                                  | Communication                                                               | Notes                                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `generate.ts` ↔ `RoundCache`              | Direct instantiation, `wrapWithCache()` closure                             | Already implemented. No interface change needed.                                                                                  |
| `generate.ts` ↔ `LLMProvider`             | Via `provider.complete()` and new `provider.completeStream()`               | `completeStream` is optional; generate.ts checks `supportsStreaming()` before using it                                            |
| `CompletionRequest` ↔ `AnthropicProvider` | `cacheablePrefix` field on request object                                   | Anthropic-only field; OpenAI-compat provider ignores it (no `if` needed — just unused)                                            |
| `round-factory.ts` ↔ `CompletionRequest`  | `buildPrompt()` extracts `packedContext.fileContent` into `cacheablePrefix` | Factory already receives `packedContext`; minimal change to split prompt into prefix + instructions                               |
| `TerminalRenderer` ↔ streaming            | New `onRoundToken()` callback on `Renderer` interface (optional method)     | `CIRenderer` does not implement it; `TerminalRenderer` shows token counter; optional prevents breaking existing renderer contract |
| `DisplayState` ↔ streaming                | New `streamingRound?: number` field                                         | Optional field; `buildRoundLines()` checks for it and shows partial indicator                                                     |

---

## Build Order

The four features have dependencies on each other and on codebase understanding. Build in this order:

```
1. Verify parallel round deps (rounds 5, 6)
   — Read round-5-edge-cases.ts and round-6-deployment.ts
   — Check which prior rounds they actually consume in getPriorContexts()
   — If deps are already minimal: zero code change; document the finding
   — If over-declared: remove excess deps; test that rounds still produce correct output
   — Cost: 30 min to 2 hours

2. Extend CompletionRequest with cacheablePrefix
   — Modify src/domain/types.ts
   — Zero runtime behavior change: field is optional, providers ignore if not used
   — Cost: 15 minutes

3. Implement Anthropic prompt caching
   — Modify src/providers/anthropic.ts: system as array, cache_control, betas header
   — Modify src/ai-rounds/round-factory.ts: extract packedContext.fileContent → cacheablePrefix
   — Test with actual Anthropic API: verify cache_read_input_tokens appear in usage
   — Cost: 2-4 hours (includes API testing)

4. Add performance config block
   — Modify src/config/schema.ts: add performance.promptCache, performance.streaming, etc.
   — Wire flags into generate.ts
   — Cost: 1 hour

5. Implement streaming (if in scope for this milestone)
   — New src/providers/streaming.ts: StreamChunk type, StreamCallback
   — Modify src/providers/base.ts: supportsStreaming() method
   — Modify src/providers/base-provider.ts: default supportsStreaming() returns false
   — Implement AnthropicProvider.completeStream() using client.messages.stream()
   — Implement OpenAICompatibleProvider.completeStream() using stream: true
   — Modify src/ui/types.ts: add onRoundToken to Renderer interface (optional)
   — Modify src/ui/renderer.ts: implement onRoundToken for TerminalRenderer
   — Modify src/cli/generate.ts: check supportsStreaming(), pass onChunk callback
   — Cost: 4-8 hours

6. Token estimation improvement (if in scope)
   — Install js-tiktoken (or equivalent)
   — Modify src/context/token-counter.ts: conditional tiktoken path
   — Wire behind performance.preciseTokenCounting flag
   — Cost: 2-3 hours
```

**Critical path:** Steps 1-3 are the highest-value changes. Steps 4-6 are improvements. If time is constrained, deliver steps 1-3 and defer streaming and token estimation.

---

## Sources

- Direct codebase reading: `src/orchestrator/dag.ts`, `src/cache/round-cache.ts`, `src/providers/anthropic.ts`, `src/providers/base-provider.ts`, `src/ai-rounds/runner.ts`, `src/cli/generate.ts`, `src/config/schema.ts` — HIGH confidence
- [Anthropic Prompt Caching documentation](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) — MEDIUM confidence (API still beta as of research date; `betas` header requirement may change)
- [OpenAI Streaming documentation](https://platform.openai.com/docs/api-reference/streaming) — HIGH confidence
- [Streaming Structured LLM Response — Medium](https://medium.com/@amitsriv99/genai-streaming-structured-llm-response-over-http-2450ed7b6749) — MEDIUM confidence (secondary source)
- [LLMOps Caching Guide — Redis](https://redis.io/blog/large-language-model-operations-guide/) — MEDIUM confidence (general patterns, not handover-specific)

---

_Architecture research for: Handover CLI — Performance Features Milestone_
_Researched: 2026-02-18_
