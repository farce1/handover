# Phase 6: Context Efficiency - Research

**Researched:** 2026-02-19
**Domain:** Token efficiency, BPE tokenization, Anthropic prompt caching, parallel rendering
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Completion summary

- Show tokens sent + received AND estimated dollar cost per round
- Per-round breakdown (not just totals) — each round shows its own token count and cost
- Each round includes a savings line when savings exist: tokens saved, percentage, and dollar amount
- Skip the summary entirely on all-cached runs (no API calls made)
- On first/full runs with no savings, just show totals without mentioning savings

#### Incremental run feedback

- Count summary for skipped files: "Analyzed 12 files, skipped 48 unchanged" — aggregate only, no file list
- Verbose flag (-v) reveals per-file decisions (which files were re-analyzed and why)
- Label runs explicitly: "Incremental run (3 files changed)" at the start vs "Full run"

#### Savings reporting style

- Express savings in all three units: tokens, percentage, and dollars — e.g., "Saved 12,400 tokens (62%, ~$0.03)"
- Green color coding for savings amounts in terminal output
- On full runs with no savings, just show totals — don't mention savings at all

#### Parallel render behavior

- Aggregate progress only: "Rendering 4 documents..." then done — no per-doc status lines
- Show time saved by parallel rendering: "Rendered 4 docs in 2.1s (saved ~4.3s vs sequential)"
- If one document fails, continue rendering the others and report the failure at the end

### Claude's Discretion

- How to handle Anthropic prompt cache vs context-packing savings breakdown (combined or separate)
- Document ordering when rendered in parallel
- What to send for unchanged files (signature-only, cached analysis, or other token-efficient approach)
- Exact format and layout of the per-round token summary table

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 6 implements four distinct efficiency improvements across three sub-plans. Each sub-plan targets a different part of the pipeline: (1) changed-files context packing, which reduces tokens sent on incremental runs by skipping unchanged file content; (2) Anthropic prompt caching, which adds `cache_control` markers to the static system prompt and file context blocks so rounds 2–6 can hit the cache rather than re-process the same content; and (3) token summary with accurate counting and parallel rendering, which gives users honest per-round cost data and cuts the render phase wall time.

The key codebase insight is that `AnalysisCache` already tracks per-file content hashes but has no public `getChangedFiles()` method, so that's the first change needed. The `packFiles()` function in `src/context/packer.ts` already accepts a set of priorities and assigns tiers — it just needs a way to force changed files to the `full` tier while letting unchanged files fall to `signatures`. For Anthropic caching, the `AnthropicProvider.doComplete()` method builds the messages payload directly — adding `cache_control` to the system block is straightforward since the installed SDK (0.39.0) already exposes `CacheControlEphemeral` in the non-beta messages API and returns `cache_read_input_tokens` / `cache_creation_input_tokens` in the usage object. BPE tokenization requires installing `gpt-tokenizer` (not currently in `package.json`) and overriding `estimateTokens()` in `OpenAICompatibleProvider`. Document rendering currently loops sequentially in `generate.ts`; converting to `Promise.all` is a one-line change with error-isolation via `Promise.allSettled`.

**Primary recommendation:** Implement all three sub-plans as coded (EFF-01 through EFF-05); the codebase is already structured to accept each change at a well-defined insertion point with minimal blast radius.

---

## Standard Stack

### Core

| Library             | Version                          | Purpose                                      | Why Standard                                                                                                                               |
| ------------------- | -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `@anthropic-ai/sdk` | `^0.39.0` (installed)            | Prompt caching via `cache_control` blocks    | Already installed; 0.39.0 exposes `CacheControlEphemeral` and cache usage fields in the GA messages API — no SDK upgrade required          |
| `gpt-tokenizer`     | `^3.4.0` (latest as of Feb 2026) | BPE tokenization for OpenAI-family providers | Pure TypeScript, synchronous, fastest NPM tokenizer, supports all OpenAI encodings (o200k_base for GPT-4o/o-series, cl100k_base for GPT-4) |

### Supporting

| Library          | Version              | Purpose                                    | When to Use                                                                 |
| ---------------- | -------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `picocolors`     | `^1.1.0` (installed) | Green color for savings lines              | Already used throughout `src/ui/`; use `pc.green()` for all savings amounts |
| Node.js `crypto` | built-in             | SHA-256 hashing for changed-file detection | Already used in `src/analyzers/cache.ts` via `hashContent()`                |

### Alternatives Considered

| Instead of                  | Could Use                       | Tradeoff                                                                                                                                                    |
| --------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gpt-tokenizer`             | `tiktoken` (Python port)        | `tiktoken` requires WASM and async init; `gpt-tokenizer` is synchronous — better fit for this codebase's sync `estimateTokens()` interface                  |
| `gpt-tokenizer`             | OpenAI's own `tiktoken-node`    | Node binding with native dependencies; `gpt-tokenizer` is pure TS, no build step                                                                            |
| `Promise.all` for rendering | Sequential `for` loop (current) | Sequential is the current bug; `Promise.allSettled` preferred for error isolation (one doc failure doesn't abort others, which matches the locked decision) |

**Installation:**

```bash
npm install gpt-tokenizer
```

---

## Architecture Patterns

### Recommended Project Structure

No new directories needed. All changes are in-place edits to existing files:

```
src/
├── analyzers/cache.ts         # Add getChangedFiles() public method
├── context/packer.ts          # Accept changedFiles Set parameter in packFiles()
├── context/token-counter.ts   # No change needed (heuristic stays as standalone fallback)
├── providers/base-provider.ts # Override estimateTokens() for BPE in subclass
├── providers/openai-compat.ts # Override estimateTokens() using gpt-tokenizer
├── providers/anthropic.ts     # Add cache_control to system + file context blocks
├── ui/components.ts           # Add per-round savings line, parallel render timing
├── ui/types.ts                # Extend DisplayState with incremental run metadata
├── cli/generate.ts            # Wire changed-files into packFiles(), parallel render
```

### Pattern 1: Exposing getChangedFiles() from AnalysisCache

**What:** `AnalysisCache` stores `{ hash, analyzedAt }` per file path. On an incremental run, the set of files whose current hash differs from the cached hash are "changed files". The method returns `Set<string>` of relative paths that are changed (or new).

**When to use:** Called during the static-analysis step in `generate.ts`, after `buildAnalysisContext()` and before `packFiles()`. The file-discovery loop already reads content for fingerprinting — piggyback there to collect hashes.

**Example:**

```typescript
// In src/analyzers/cache.ts -- add this public method:
// Source: codebase analysis of AnalysisCache.entries
getChangedFiles(currentHashes: Map<string, string>): Set<string> {
  const changed = new Set<string>();
  for (const [path, currentHash] of currentHashes) {
    if (!this.isUnchanged(path, currentHash)) {
      changed.add(path);
    }
  }
  return changed;
}
```

### Pattern 2: Changed-files tier forcing in packFiles()

**What:** `packFiles()` currently assigns tiers (full/signatures/skip) based purely on priority scores and token budget. For incremental runs, force changed files to the `full` tier and let unchanged files use their normal score-based tier assignment — but prefer `signatures` over `skip` for unchanged files to keep context quality high.

**When to use:** When `changedFiles` set is non-empty (incremental run). On a full run (empty `changedFiles`), existing logic is unchanged.

**Example:**

```typescript
// Extended packFiles() signature
export async function packFiles(
  scored: FilePriority[],
  astResult: ASTResult,
  budget: TokenBudget,
  estimateTokensFn: (text: string) => number,
  getFileContent: (path: string) => Promise<string>,
  changedFiles?: Set<string>, // NEW: optional, only set on incremental runs
): Promise<PackedContext>;

// Inside the main greedy packing loop, BEFORE normal tier assignment:
if (changedFiles && changedFiles.size > 0 && changedFiles.has(entry.path)) {
  // Force changed files to full tier (ignore budget for these)
  packedFiles.push({
    path: entry.path,
    tier: 'full',
    content,
    tokens: fullTokens,
    score: entry.score,
  });
  remaining -= fullTokens;
  continue;
}
// Unchanged files: proceed with normal tier logic but budget is already reduced by changed files
```

**Critical design note (Claude's Discretion):** The "what to send for unchanged files" decision is: send signature-only for unchanged files. This matches EFF-01's intent of "only changed files sent at full detail." Unchanged files still get AST signatures so the LLM has their structural context without paying for full content.

### Pattern 3: Anthropic Prompt Caching

**What:** Add `cache_control: { type: 'ephemeral' }` to the system prompt block in `AnthropicProvider.doComplete()`. The Anthropic API caches the prefix up to and including the marked block. Since the system prompt is identical across all 6 rounds (same static analysis context), rounds 2–6 will hit the cache.

**When to use:** Always in `AnthropicProvider`. The SDK installed (0.39.0) exposes `CacheControlEphemeral` from `@anthropic-ai/sdk` GA API — no beta header needed, no SDK upgrade needed.

**Key facts (verified from official docs):**

- Cache lifetime: 5 minutes by default (refreshed on each hit, so rounds 1–6 within a single run will all cache-hit since they complete well within 5 minutes)
- Minimum cacheable tokens: 1024 for claude-sonnet models; 4096 for claude-opus and claude-haiku-4.5
- Cache writes cost 1.25× base input price; cache reads cost 0.10× base input price
- Usage response fields: `cache_creation_input_tokens` (number | null), `cache_read_input_tokens` (number | null) — already typed in SDK 0.39.0
- **No beta header required** — prompt caching is GA as of 2025

**Example (system prompt as content block array):**

```typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
// In AnthropicProvider.doComplete() — change system from string to TextBlockParam[]
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages.js';

const systemBlocks: TextBlockParam[] = [
  {
    type: 'text',
    text: request.systemPrompt,
    cache_control: { type: 'ephemeral' }, // Cache the static system prompt
  },
];

const params = {
  model: this.model,
  max_tokens: request.maxTokens ?? 4096,
  system: systemBlocks, // was: request.systemPrompt (string)
  messages: [{ role: 'user' as const, content: request.userPrompt }],
  // ... tools, tool_choice, temperature unchanged
};
```

**Savings reporting for Anthropic (Claude's Discretion):** Report Anthropic cache savings and context-packing savings as a combined total. The user sees one number: "Saved X tokens (Y%, ~$Z)" which combines both sources. This is simpler and avoids confusing users who may not understand the distinction.

**Tracking cache in usage:**

```typescript
// After message.usage is available:
const cacheReadTokens = message.usage.cache_read_input_tokens ?? 0;
const cacheCreationTokens = message.usage.cache_creation_input_tokens ?? 0;
// Pass these through CompletionResult for the tracker to record savings
```

**Important:** `CompletionResult` in `src/domain/schemas.ts` and `TokenUsageTracker` need to be extended to carry `cacheReadTokens` and `cacheCreationTokens` so that savings can be computed and displayed.

### Pattern 4: BPE Tokenization for OpenAI Providers

**What:** Override `estimateTokens()` in `OpenAICompatibleProvider` using `gpt-tokenizer`. The base class uses `chars/4` heuristic. `gpt-tokenizer` supports per-model imports for accurate encoding selection.

**When to use:** Only in `OpenAICompatibleProvider`. `AnthropicProvider` inherits `chars/4` (acceptable as Anthropic returns actual token counts in usage — estimation is only used for budget planning, not billing). For OpenAI-family providers, accurate estimation prevents context window overflows.

**Encoding selection by preset model family:**

```typescript
// Source: https://github.com/niieani/gpt-tokenizer (Context7 verified)
// o200k_base: gpt-4o, o1, o3, o4, gpt-4.1 series (all modern OpenAI)
// cl100k_base: gpt-4, gpt-3.5-turbo (legacy)

// Default import uses o200k_base (covers all modern models):
import { countTokens } from 'gpt-tokenizer';

// For cl100k models:
import { countTokens as countTokensCl100k } from 'gpt-tokenizer/encoding/cl100k_base';
```

**Implementation approach:** Use the default import (`o200k_base`) for all presets by default, since all models listed in `PROVIDER_PRESETS` that would use `OpenAICompatibleProvider` are modern OpenAI-compatible. Add a `cl100k_base` path only if the model name suggests a legacy model (`gpt-4-*`, `gpt-3.5-*`). This keeps the implementation simple while being correct.

```typescript
// In OpenAICompatibleProvider:
import { countTokens } from 'gpt-tokenizer';
import { countTokens as countTokensCl100k } from 'gpt-tokenizer/encoding/cl100k_base';

override estimateTokens(text: string): number {
  // Use cl100k_base for legacy GPT-4 / GPT-3.5 models
  if (this.model.startsWith('gpt-4-') || this.model.startsWith('gpt-3.5-')) {
    return countTokensCl100k(text);
  }
  return countTokens(text);  // o200k_base covers gpt-4o, gpt-4.1, o-series
}
```

### Pattern 5: Parallel Document Rendering

**What:** Convert the sequential `for` loop over `selectedDocs` in the render step of `generate.ts` to `Promise.allSettled`. Each `doc.render(ctx)` is currently synchronous but the outer `writeFile` is async — wrap each doc as a `Promise` and run all concurrently.

**When to use:** Always — there's no dependency between document renderers.

**Document ordering (Claude's Discretion):** Use the existing `DOCUMENT_REGISTRY` order for output (00–13). Since rendering is parallelized, collect results in an array indexed by document position and push to `statuses` in registry order after `Promise.allSettled` resolves.

**Example:**

```typescript
// Source: analysis of generate.ts render step
const renderResults = await Promise.allSettled(
  selectedDocs
    .filter((doc) => doc.id !== '00-index')
    .map(async (doc) => {
      const content = doc.render(ctx);
      if (content === '') return { doc, status: 'not-generated' };
      await writeFile(join(outputDir, doc.filename), content, 'utf-8');
      return { doc, status: 'done', content };
    }),
);

// Collect timing for savings report
const parallelMs = Date.now() - renderStart;
const sequentialEstimateMs = renderResults.reduce(
  (sum, r) => sum + (r.status === 'fulfilled' ? (r.value.durationMs ?? 0) : 0),
  0,
);
```

**Error isolation:** `Promise.allSettled` (not `Promise.all`) means one failed render doesn't abort others. Collect `rejected` results and report them in the error summary at the end, matching the locked decision.

**"Rendering N documents..." progress:** Add a single `renderer.onRenderStart(state)` call with count before the `Promise.allSettled`, and `renderer.onRenderDone(state)` with timing after. No per-doc lines during parallel phase.

**INDEX last:** INDEX (`00-INDEX.md`) still must be rendered last since it requires all other document statuses. Keep INDEX outside the parallel batch.

### Pattern 6: Per-Round Token Summary with Savings

**What:** The completion screen currently shows total tokens and cost (via `renderCompletionSummary`). The locked decisions require per-round breakdown with savings lines. This means extending `RoundDisplayState` and `DisplayState` to carry caching savings, and adding savings rendering to `renderRoundBlock` / `renderCompletionSummary`.

**What to track per round:**

- `inputTokens`, `outputTokens` (already in tracker)
- `cacheReadTokens`, `cacheCreationTokens` (new — from Anthropic usage response)
- `dollarsSpent` (already via `getRoundCost()`)
- `dollarsFullCost` (what it would have cost without caching — computed from `cache_read_input_tokens * full_price_rate`)

**Savings calculation:**

```typescript
// Tokens saved = cache_read_input_tokens (those weren't re-processed)
const tokensSaved = cacheReadTokens;
// Cost saved = cacheReadTokens * (fullRate - cacheReadRate) / 1_000_000
const dollarsSaved = (cacheReadTokens * (inputPerMillion - cacheReadPerMillion)) / 1_000_000;
const pctSaved = tokensSaved / (inputTokens + cacheReadTokens + cacheCreationTokens);
```

**Run label at startup (locked decision):** Display "Incremental run (3 files changed)" vs "Full run" in the banner or file coverage line. Requires `DisplayState` to carry `{ isIncremental: boolean; changedFileCount: number }`.

### Anti-Patterns to Avoid

- **Caching the user message content:** The codebase context (file content) in the `userPrompt` changes every run (different changed files, different context). Only cache the `systemPrompt` which is static per round. Do NOT mark the userPrompt block with `cache_control` — it will miss on most runs.
- **SDK upgrade for caching:** No upgrade needed. The installed 0.39.0 already has `CacheControlEphemeral` and `cache_read_input_tokens` in the GA API.
- **Using `Promise.all` instead of `Promise.allSettled` for rendering:** `Promise.all` would abort on the first renderer failure. Use `Promise.allSettled` and collect failures.
- **Importing gpt-tokenizer with dynamic import for ESM:** `gpt-tokenizer` supports synchronous loading. Import statically at module top level — no async init required.
- **Calling `getChangedFiles()` before `cache.load()`:** The `AnalysisCache` must be loaded from disk before comparing hashes. `buildAnalysisContext()` already calls `cache.load()`, so this is safe as long as `getChangedFiles()` is called after context is built.
- **Savings display on all-cached runs:** When all rounds are cached (round cache hits from Phase 5), skip the token summary entirely. There are no API calls — no tokens sent, no cost. The locked decision confirms this.

---

## Don't Hand-Roll

| Problem                      | Don't Build                          | Use Instead                              | Why                                                                                                          |
| ---------------------------- | ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| BPE tokenization             | Custom regex/heuristic token counter | `gpt-tokenizer`                          | BPE is a learned algorithm with 100k+ merge rules; approximations are 15-25% off and cause context overflows |
| Cache expiry detection       | TTL-tracking logic                   | Anthropic API's built-in 5min TTL        | The API handles cache lifetime; client just marks breakpoints and reads `cache_read_input_tokens`            |
| Parallel rendering framework | Custom queue/worker                  | `Promise.allSettled` (Node built-in)     | Document renders are I/O-bound, not CPU-bound; Node event loop handles concurrency naturally                 |
| Per-file change detection    | Git diff parsing                     | `AnalysisCache.isUnchanged()` (existing) | SHA-256 hash comparison is already implemented and used by the AST analyzer cache                            |

**Key insight:** The hardest part of this phase is bookkeeping — threading cache token counts through `CompletionResult` → `TokenUsageTracker` → `DisplayState` → renderer. None of it requires new algorithms; it's plumbing.

---

## Common Pitfalls

### Pitfall 1: System prompt array vs string type mismatch

**What goes wrong:** `AnthropicProvider.doComplete()` currently passes `system: request.systemPrompt` as a string. Changing to an array of `TextBlockParam` objects is not backwards-compatible with the TypeScript type of `MessageCreateParams.system`.

**Why it happens:** The Anthropic SDK accepts `system` as either `string | TextBlockParam[]`. The current code uses the string shorthand.

**How to avoid:** Change the `params` object's `system` field to `TextBlockParam[]`. The SDK's TypeScript types allow this union — no cast required. Verify the streaming path (`messages.stream`) passes the same params object.

**Warning signs:** TypeScript errors on `system:` assignment; test failures on non-streaming path.

### Pitfall 2: Minimum cacheable token threshold

**What goes wrong:** Requests with short system prompts (e.g., test fixtures with minimal prompts) will not be cached by Anthropic even if `cache_control` is set. The API silently ignores the `cache_control` directive and processes normally.

**Why it happens:** Anthropic requires at least 1024 tokens (Sonnet) or 4096 tokens (Opus, Haiku 4.5) to justify cache storage overhead.

**How to avoid:** Handover's system prompts are long (hundreds of lines of analysis instructions + packed file context), so in production this threshold is easily met. No defensive code needed — just document that savings won't appear on trivially small test prompts.

**Warning signs:** `cache_creation_input_tokens` is always 0 in test runs (prompt too short to cache).

### Pitfall 3: Changed-file set blows the token budget

**What goes wrong:** If a high-churn project has 80% files changed, forcing all changed files to `full` tier could exceed the token budget — worse than the baseline behavior.

**Why it happens:** Forcing `full` tier bypasses the greedy budget check for changed files.

**How to avoid:** Apply budget enforcement even for changed files. Changed files get priority in the queue (sorted first), but they still consume from `remaining`. If `remaining` goes to zero after the changed files, unchanged files simply get `skip` tier rather than `signatures`. This is correct behavior — changed files are more important than unchanged context.

**Warning signs:** `remaining` goes negative; `usedTokens` exceeds `budgetTokens`.

### Pitfall 4: Document ordering in parallel render

**What goes wrong:** `Promise.allSettled` does not preserve insertion order of results relative to the input array order.

**Why it happens:** Promises resolve in completion order, not input order. In practice, all renders complete nearly simultaneously, but this is not guaranteed.

**How to avoid:** `Promise.allSettled` DOES preserve the order of the result array relative to the input array. The `results[i]` corresponds to `inputDocs[i]`. This is part of the spec. So mapping over results in order is safe.

**Warning signs:** Documents appear in wrong order in INDEX — but this should not happen if results are processed in input array order.

### Pitfall 5: gpt-tokenizer ESM/CJS mismatch

**What goes wrong:** The project uses `"type": "module"` (ESM). `gpt-tokenizer` ships both ESM and CJS. Importing from `gpt-tokenizer/cjs/encoding/cl100k_base` in an ESM context will cause module resolution errors.

**Why it happens:** The `exports` map in `gpt-tokenizer` maps the main path to ESM automatically for ESM projects. Manually specifying the `cjs/` subpath breaks this.

**How to avoid:** Always import from `gpt-tokenizer` or `gpt-tokenizer/encoding/cl100k_base` (no `cjs/` prefix). The package's `exports` field handles ESM/CJS resolution automatically.

**Warning signs:** `ERR_REQUIRE_ESM` or module not found errors at runtime.

---

## Code Examples

Verified patterns from official sources and codebase analysis:

### Anthropic Prompt Caching — system as content blocks

```typescript
// Source: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
// Installed SDK 0.39.0 supports this in GA messages API (verified in node_modules)

import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages.js';

// In AnthropicProvider.doComplete() — replace the params system field:
const systemBlocks: TextBlockParam[] = [
  {
    type: 'text',
    text: request.systemPrompt,
    cache_control: { type: 'ephemeral' },
  },
];

const params = {
  model: this.model,
  max_tokens: request.maxTokens ?? 4096,
  system: systemBlocks, // changed from: system: request.systemPrompt
  messages: [{ role: 'user' as const, content: request.userPrompt }],
  tools: [
    /* unchanged */
  ],
  tool_choice: { type: 'tool' as const, name: 'structured_response' },
  temperature: request.temperature ?? 0.7,
};

// After completion, extract cache usage:
// message.usage.cache_read_input_tokens  -- number | null
// message.usage.cache_creation_input_tokens  -- number | null
```

### gpt-tokenizer — BPE countTokens

```typescript
// Source: Context7 /niieani/gpt-tokenizer, verified against npm package v3.4.0
import { countTokens } from 'gpt-tokenizer';  // default: o200k_base
import { countTokens as countTokensCl100k } from 'gpt-tokenizer/encoding/cl100k_base';

// In OpenAICompatibleProvider — override the base class estimateTokens():
override estimateTokens(text: string): number {
  if (this.model.startsWith('gpt-4-') || this.model.startsWith('gpt-3.5-')) {
    return countTokensCl100k(text);
  }
  return countTokens(text);  // o200k_base: gpt-4o, gpt-4.1, o1, o3, o4
}
```

### AnalysisCache.getChangedFiles()

```typescript
// Source: codebase analysis of src/analyzers/cache.ts
// Add to AnalysisCache class:
getChangedFiles(currentHashes: Map<string, string>): Set<string> {
  const changed = new Set<string>();
  for (const [path, currentHash] of currentHashes) {
    if (!this.isUnchanged(path, currentHash)) {
      changed.add(path);
    }
  }
  return changed;
}
```

### Parallel document rendering

```typescript
// Source: codebase analysis of src/cli/generate.ts render step
const renderStart = Date.now();
const docsToRender = selectedDocs.filter((doc) => doc.id !== '00-index');

const renderResults = await Promise.allSettled(
  docsToRender.map(async (doc) => {
    const content = doc.render(ctx);
    if (content === '') {
      return { doc, skipped: true };
    }
    await writeFile(join(outputDir, doc.filename), content, 'utf-8');
    return { doc, skipped: false };
  }),
);

const parallelMs = Date.now() - renderStart;

// Process results in input order (Promise.allSettled preserves order)
for (let i = 0; i < renderResults.length; i++) {
  const result = renderResults[i];
  const doc = docsToRender[i];
  if (result.status === 'rejected' || (result.status === 'fulfilled' && result.value.skipped)) {
    statuses.push({
      id: doc.id,
      filename: doc.filename,
      title: doc.title,
      status: 'not-generated',
    });
  } else {
    statuses.push({ id: doc.id, filename: doc.filename, title: doc.title, status: 'done' });
  }
}

// INDEX last (unchanged)
const indexContent = renderIndex(ctx, statuses);
await writeFile(join(outputDir, '00-INDEX.md'), indexContent, 'utf-8');
```

### Per-round savings display

```typescript
// Locked decision format: "Saved 12,400 tokens (62%, ~$0.03)"
// In src/ui/components.ts

function renderRoundSavings(tokensSaved: number, pctSaved: number, dollarsSaved: number): string {
  const tokStr = tokensSaved.toLocaleString();
  const pctStr = Math.round(pctSaved * 100);
  const dolStr = dollarsSaved < 0.01 ? '<$0.01' : `~$${dollarsSaved.toFixed(2)}`;
  return pc.green(`  Saved ${tokStr} tokens (${pctStr}%, ${dolStr})`);
}
```

---

## State of the Art

| Old Approach                                                              | Current Approach                                                      | When Changed      | Impact                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------- |
| Anthropic caching required `client.beta.prompt_caching.messages.create()` | GA: `client.messages.create()` with `cache_control` on content blocks | 2025 (GA release) | No beta prefix needed; SDK 0.39.0 already types this correctly |
| `gpt-tokenizer` used o200k_base only as default                           | Default import is o200k_base, all modern OpenAI models                | v2.4.0+           | Covers gpt-4o, gpt-4.1, o-series without specifying encoding   |
| `Promise.allSettled` was not widely used                                  | Standard Node.js since v12.9                                          | Node 12.9 (2019)  | No polyfill needed; project requires Node >= 18                |

**Deprecated/outdated:**

- Old Anthropic caching beta header `anthropic-beta: prompt-caching-2024-07-31`: No longer needed; prompt caching is GA. Using it may still work but is unnecessary.
- `chars/4` heuristic for OpenAI providers: Replaced by BPE via gpt-tokenizer in this phase (15-25% accuracy improvement).

---

## Open Questions

1. **Where to surface "Incremental run (N files changed)" label**
   - What we know: `DisplayState.banner` doesn't have an incremental flag; `renderBanner()` builds a single-line summary
   - What's unclear: Should the incremental label appear in the banner line or in the file coverage line (which already shows "N files · M analyzing · K ignored")?
   - Recommendation: Add it to the file coverage line: "Incremental run · 3 changed · 12 analyzing · 48 unchanged." This keeps the banner clean and puts the info near the file count context where it's most relevant.

2. **How to handle Anthropic cache savings vs context-packing savings in the round display**
   - What we know: Claude's Discretion says to combine or separate these is the planner's call
   - What's unclear: If shown combined, the savings number may be confusing on Round 1 (no cache hit yet, but context-packing savings exist on incremental runs)
   - Recommendation: Show combined savings per round as a single "Saved X tokens (Y%, ~$Z)" line. On Round 1 of an incremental run, the savings are from context packing only; on rounds 2–6, they include both. This keeps the UI simple. Do not attempt to split by source.

3. **Extended CompletionResult schema for cache token fields**
   - What we know: `CompletionResult` is defined via Zod schema in `src/domain/schemas.ts`; `usage` has `inputTokens` and `outputTokens`
   - What's unclear: Whether to add `cacheReadTokens` and `cacheCreationTokens` as optional fields on `Usage` or as a separate `cacheUsage` nested object
   - Recommendation: Add optional fields directly to the `Usage` schema: `cacheReadTokens?: number` and `cacheCreationTokens?: number`. This is the minimal change and keeps the tracker interface simple.

---

## Sources

### Primary (HIGH confidence)

- `/anthropics/anthropic-sdk-typescript` (Context7) — prompt caching types, usage fields, content block params
- `https://platform.claude.com/docs/en/build-with-claude/prompt-caching` — Official Anthropic docs: cache_control structure, usage fields, minimum token thresholds, pricing multipliers, GA status, no beta header required
- `/niieani/gpt-tokenizer` (Context7) — `countTokens()` API, model-specific imports, encoding map
- `https://www.npmjs.com/package/gpt-tokenizer` — Version 3.4.0 confirmed current, ESM support, synchronous API
- `node_modules/@anthropic-ai/sdk` at v0.39.0 — `CacheControlEphemeral` type and `cache_read_input_tokens` / `cache_creation_input_tokens` in `Usage` type confirmed present in GA messages API

### Secondary (MEDIUM confidence)

- WebSearch: Anthropic prompt caching GA status (2025) — confirms no beta header required, corroborated by official docs
- WebSearch: gpt-tokenizer v3.4.0 — current version, synchronous API, ESM support confirmed

### Tertiary (LOW confidence)

- None — all critical claims verified against official docs or installed SDK source

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — SDK 0.39.0 has all needed types; gpt-tokenizer API verified against Context7 and npm
- Architecture: HIGH — all insertion points identified in codebase; patterns derived from existing code structure
- Pitfalls: HIGH — SDK type verification and official Anthropic caching docs reviewed thoroughly

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (30 days; Anthropic SDK and gpt-tokenizer are stable libraries with slow-moving APIs)
