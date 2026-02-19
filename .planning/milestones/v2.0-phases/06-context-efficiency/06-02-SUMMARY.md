---
phase: 06-context-efficiency
plan: 02
subsystem: api
tags: [anthropic, prompt-caching, gpt-tokenizer, bpe-tokenization, cost-tracking]

# Dependency graph
requires:
  - phase: 05-ux-responsiveness
    provides: streaming token counter infrastructure and CompletionResult usage pipeline

provides:
  - Anthropic provider sends system prompt as TextBlockParam[] with cache_control ephemeral marker
  - CompletionResult.usage carries cacheReadTokens and cacheCreationTokens from API response
  - TokenUsageTracker.getRoundCacheSavings() computes per-round cache savings (tokens, dollars, %)
  - estimateCost() accounts for cache read (0.1x) and cache creation (1.25x) pricing
  - OpenAICompatibleProvider.estimateTokens() uses BPE tokenization (gpt-tokenizer)

affects:
  - 06-03-PLAN (per-round savings display reads getRoundCacheSavings())
  - Any future plan consuming CompletionResult.usage

# Tech tracking
tech-stack:
  added:
    - gpt-tokenizer ^3.4.0 (BPE token estimation for OpenAI-compatible providers)
  patterns:
    - Cache pricing constants as static class members (CACHE_READ_MULTIPLIER, CACHE_WRITE_MULTIPLIER)
    - Optional cache fields propagated from provider response through Usage schema to tracker

key-files:
  created: []
  modified:
    - src/providers/anthropic.ts
    - src/domain/schemas.ts
    - src/context/types.ts
    - src/context/tracker.ts
    - src/providers/openai-compat.ts
    - package.json

key-decisions:
  - 'cache_read_input_tokens and cache_creation_input_tokens are directly accessible on SDK 0.39.0 Usage type — no cast needed'
  - 'BPE model routing: gpt-4- and gpt-3.5- prefixes use cl100k_base; everything else (gpt-4o, gpt-4.1, o-series) uses o200k_base (main export)'
  - 'null ?? undefined pattern converts SDK nullable fields to optional undefined for Zod optional()'

patterns-established:
  - 'Provider usage extraction: always coerce null SDK fields to undefined with ?? undefined'
  - 'Cache pricing: CACHE_READ_MULTIPLIER=0.1 and CACHE_WRITE_MULTIPLIER=1.25 as static class constants in TokenUsageTracker'

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 6 Plan 02: Context Efficiency - Prompt Caching and BPE Tokenization Summary

**Anthropic system prompt caching with cache_control ephemeral blocks, cache-aware cost tracking in TokenUsageTracker, and BPE token estimation via gpt-tokenizer replacing chars/4 heuristic for OpenAI providers**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T09:10:36Z
- **Completed:** 2026-02-19T09:14:12Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Anthropic provider sends system prompt as `TextBlockParam[]` with `cache_control: { type: 'ephemeral' }`, enabling automatic cache hits on rounds 2-6 at 90% cost reduction on cached input tokens
- Extended `UsageSchema` and `TokenUsageSchema` with optional `cacheReadTokens` and `cacheCreationTokens` fields; both return paths in `AnthropicProvider.doComplete()` extract cache counts from API response
- `TokenUsageTracker` extended with `getRoundCacheSavings()`, cache-aware `estimateCost()` (0.1x for cache reads, 1.25x for cache writes), and updated `getRoundCost()`/`getTotalCost()`
- `OpenAICompatibleProvider.estimateTokens()` overrides chars/4 heuristic with BPE via `gpt-tokenizer`: `cl100k_base` for legacy models (`gpt-4-`, `gpt-3.5-`), `o200k_base` for modern models

## Task Commits

Each task was committed atomically:

1. **Task 1: Anthropic prompt caching, Usage schema extension, and tracker cache fields** - `065efdc` (feat)
2. **Task 2: Install gpt-tokenizer and add BPE token estimation to OpenAI provider** - `47fcf30` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/providers/anthropic.ts` - Added `TextBlockParam` import, system prompt converted to array with `cache_control: { type: 'ephemeral' }`, both streaming and non-streaming return paths extract `cacheReadTokens` and `cacheCreationTokens`
- `src/domain/schemas.ts` - `UsageSchema` extended with optional `cacheReadTokens` and `cacheCreationTokens` fields
- `src/context/types.ts` - `TokenUsageSchema` extended with optional `cacheReadTokens` and `cacheCreationTokens` fields
- `src/context/tracker.ts` - Added `CACHE_READ_MULTIPLIER` (0.1) and `CACHE_WRITE_MULTIPLIER` (1.25) constants, `getRoundCacheSavings()` method, updated `estimateCost()`, `getRoundCost()`, `getTotalCost()`
- `src/providers/openai-compat.ts` - Added `gpt-tokenizer` imports, `estimateTokens()` override with BPE counting
- `package.json` - Added `gpt-tokenizer ^3.4.0` production dependency

## Decisions Made

- **SDK 0.39.0 cache field access**: `cache_read_input_tokens` and `cache_creation_input_tokens` are typed as `number | null` directly on the `Usage` interface in the installed SDK — no unsafe cast required. Used `?? undefined` to coerce null to undefined for Zod optional fields.
- **BPE model routing**: models starting with `gpt-4-` (gpt-4-0613, gpt-4-turbo, etc.) or `gpt-3.5-` use `cl100k_base`; all other models (gpt-4o, gpt-4.1, o-series, Groq, Together, DeepSeek) use `o200k_base` via gpt-tokenizer's main export.
- **No changes to base-provider.ts**: `AnthropicProvider` keeps the chars/4 heuristic from `BaseProvider` since Anthropic returns authoritative token counts in usage responses — the heuristic only affects budget planning, which is less critical when you have exact counts post-call.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript error in `src/ai-rounds/runner.ts` (line 18: `ValidationResult` not imported). Confirmed pre-existing before changes; out of scope per deviation rules.

## User Setup Required

None - no external service configuration required. Prompt caching activates automatically once the API detects cache-eligible requests.

## Next Phase Readiness

- Plan 03 can now call `tracker.getRoundCacheSavings(n)` to display per-round savings in the terminal output
- Cache token fields flow from Anthropic API response through `CompletionResult.usage` to `TokenUsage` records in the tracker
- BPE tokenization active for all OpenAI-compatible providers; Anthropic uses authoritative counts from API

---

_Phase: 06-context-efficiency_
_Completed: 2026-02-19_

## Self-Check: PASSED

- FOUND: src/providers/anthropic.ts
- FOUND: src/domain/schemas.ts
- FOUND: src/context/types.ts
- FOUND: src/context/tracker.ts
- FOUND: src/providers/openai-compat.ts
- FOUND: .planning/phases/06-context-efficiency/06-02-SUMMARY.md
- FOUND: 065efdc (Task 1 commit)
- FOUND: 47fcf30 (Task 2 commit)
