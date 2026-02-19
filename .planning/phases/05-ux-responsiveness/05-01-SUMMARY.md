---
phase: 05-ux-responsiveness
plan: 01
subsystem: ui
tags: [streaming, token-counter, elapsed-timer, anthropic-sdk, openai-sdk, terminal-ui]

# Dependency graph
requires:
  - phase: 04-cache-correctness
    provides: Correct cache layer so streaming runs against valid data

provides:
  - onToken streaming callback in LLMProvider.complete() interface
  - Streaming paths in AnthropicProvider via messages.stream()
  - Streaming paths in OpenAICompatibleProvider via chat.completions.stream()
  - Live token counter updating in place during each LLM round
  - Live elapsed timer updating per spinner tick (80ms interval)
  - Round display format: 'Round N/T spinner X tokens (Y total) Zs'
  - Completed round format: 'check Round N X tokens duration'

affects: [06-prompt-caching, any phase touching provider layer or terminal UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Lazy callback getter: makeOnToken(n) returns () => roundTokenCallbacks.get(n) to handle timing between onStepStart and execute()'
    - 'Streaming gate: onToken presence gates streaming path; absent means non-streaming path unchanged'
    - 'Token estimate: Math.ceil(charCount / 4) during streaming, snap to authoritative usage count on completion'
    - 'Spinner-driven elapsed: rd.elapsedMs computed from Date.now() - rd.roundStartMs in 80ms interval'

key-files:
  created: []
  modified:
    - src/providers/base.ts
    - src/providers/base-provider.ts
    - src/providers/anthropic.ts
    - src/providers/openai-compat.ts
    - src/ui/types.ts
    - src/ui/components.ts
    - src/ui/renderer.ts
    - src/cli/generate.ts
    - src/ai-rounds/runner.ts
    - src/ai-rounds/round-factory.ts
    - src/ai-rounds/round-1-overview.ts
    - src/ai-rounds/round-2-modules.ts
    - src/ai-rounds/round-3-features.ts
    - src/ai-rounds/round-4-architecture.ts
    - src/ai-rounds/round-5-edge-cases.ts
    - src/ai-rounds/round-6-deployment.ts

key-decisions:
  - 'onToken is optional in all signatures — no callback means non-streaming path executes unchanged (backward compatible)'
  - 'Round 5 fan-out accepts onToken parameter for API consistency but does not thread it into parallel per-module calls (would cause display noise)'
  - 'streamingTokens cleared to undefined on round completion so live counter does not interfere with authoritative rd.tokens value'
  - 'Lazy getter pattern: makeOnToken(n) used instead of direct callback reference to handle timing (roundTokenCallbacks populated in onStepStart, consumed when step execute() runs)'
  - 'Spinner-driven elapsed: elapsedMs updated in 80ms spinner interval not in onToken callback (avoids ~100 updates/sec render flooding)'

patterns-established:
  - 'Streaming gate pattern: if (onToken) { streaming path } else { non-streaming path }'
  - 'Lazy getter for per-round callbacks avoids timing issues between DAG event setup and step execution'

# Metrics
duration: 6min
completed: 2026-02-19
---

# Phase 5 Plan 01: Live Streaming Token Counter and Elapsed Timer Summary

**Streaming via messages.stream()/chat.completions.stream() with in-place "Round N/T X tokens (Y total) Zs" terminal progress replacing frozen 30-90s wait**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-02-19T08:11:27Z
- **Completed:** 2026-02-19T08:17:14Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- Both LLM providers (Anthropic and OpenAI-compatible) now stream tokens via SDK streaming APIs when an `onToken` callback is provided
- Terminal displays live "Round N/T spinner X tokens (Y total) Zs" progress that updates in place every 80ms during each active LLM round
- Completed rounds display as "check Round N X tokens duration" and stack visibly as rounds finish
- Streaming token count snaps to authoritative API usage count on round completion
- All existing non-streaming paths preserved unchanged — feature is fully opt-in via callback presence

## Task Commits

Each task was committed atomically:

1. **Task 1: Add onToken streaming callback to provider layer** - `c69a1e1` (feat)
2. **Task 2: Wire live progress display with token counter and elapsed timer** - `637ae69` (feat)

## Files Created/Modified

- `src/providers/base.ts` - Added `onToken?: (tokenCount: number) => void` to `complete()` options
- `src/providers/base-provider.ts` - Thread `onToken` from `complete()` to abstract `doComplete()`
- `src/providers/anthropic.ts` - Streaming path via `messages.stream()` with `input_json_delta` character counting
- `src/providers/openai-compat.ts` - Streaming path via `chat.completions.stream()` with chunk listener
- `src/ui/types.ts` - Added `streamingTokens`, `roundStartMs` to `RoundDisplayState`; `cumulativeTokens` to `DisplayState`
- `src/ui/components.ts` - Updated running/done round formats; added `computeCumulativeTokens()` helper
- `src/ui/renderer.ts` - Spinner tick now updates `elapsedMs` for running rounds before re-render
- `src/cli/generate.ts` - Wires `onToken` callbacks via `roundTokenCallbacks` Map and lazy `makeOnToken()` getter; sets `roundStartMs` on round start; clears `streamingTokens` on completion
- `src/ai-rounds/runner.ts` - Added `onToken` to `ExecuteRoundOptions`, passed to `provider.complete()`
- `src/ai-rounds/round-factory.ts` - Added `onToken` lazy getter parameter to `createStandardRoundStep()`
- `src/ai-rounds/round-{1,2,3,4,5,6}-*.ts` - Added `onToken` parameter to each round step factory

## Decisions Made

- `onToken` is optional in all signatures — no callback means existing non-streaming code path runs unchanged
- Round 5 (fan-out pattern) accepts `onToken` for API consistency but does not wire it into parallel per-module calls to avoid display noise
- `streamingTokens` is cleared to `undefined` on round completion — authoritative value lives in `rd.tokens`
- Lazy getter pattern (`makeOnToken(n) => () => roundTokenCallbacks.get(n)`) handles timing: callback is registered in `onStepStart`, resolved when step `execute()` runs
- Spinner interval (80ms) drives elapsed time updates — `onToken` callback does NOT trigger re-renders (avoids ~100 renders/sec during streaming)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript error in `src/ai-rounds/runner.ts` (`ValidationResult` not found) was present before this plan and unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Streaming foundation complete, ready for Phase 5 Plan 02 (if any further UX improvements planned)
- Provider streaming is gated on `onToken` presence — SDK upgrade for Phase 6 can upgrade streaming APIs without changing callback contract
- Both streaming paths accumulate full response before Zod validation per the established constraint (no mid-stream JSON parsing)

---

_Phase: 05-ux-responsiveness_
_Completed: 2026-02-19_
