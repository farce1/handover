---
phase: 07-terminal-ux
plan: 02
subsystem: ai-pipeline
tags: [token-tracking, cost-estimation, retry-callbacks, dag-events, llm-provider]

# Dependency graph
requires:
  - phase: 05-ai-rounds
    provides: "AI round runner, rate limiter, token tracker, provider interface"
  - phase: 06-document-synthesis
    provides: "Round step creators with executeRound integration"
provides:
  - "TokenUsageTracker cost estimation API (estimateCost, getRoundCost, getTotalCost, getRoundUsage)"
  - "RoundExecutionResult tokens and cost fields populated after each round"
  - "retryWithBackoff onRetry callback exposing delay and reason"
  - "DAGEvents.onStepRetry for retry countdown propagation"
  - "LLMProvider.complete() and AnthropicProvider onRetry forwarding"
  - "All 6 round step creators accept and forward onRetry callback"
  - "HandoverConfig.costWarningThreshold optional field"
affects: [07-terminal-ux, 08-providers-reliability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Model cost table with per-million token pricing for cost estimation"
    - "onRetry callback threading from DAG events through provider to rate limiter"
    - "Optional field extension pattern for backward-compatible interface growth"

key-files:
  created: []
  modified:
    - "src/context/tracker.ts"
    - "src/config/schema.ts"
    - "src/ai-rounds/runner.ts"
    - "src/ai-rounds/types.ts"
    - "src/utils/rate-limiter.ts"
    - "src/domain/types.ts"
    - "src/providers/base.ts"
    - "src/providers/anthropic.ts"
    - "src/ai-rounds/round-1-overview.ts"
    - "src/ai-rounds/round-2-modules.ts"
    - "src/ai-rounds/round-3-features.ts"
    - "src/ai-rounds/round-4-architecture.ts"
    - "src/ai-rounds/round-5-edge-cases.ts"
    - "src/ai-rounds/round-6-deployment.ts"

key-decisions:
  - "MODEL_COSTS static table with default fallback to claude-opus-4-6 pricing"
  - "onRetry callback threaded end-to-end: DAG -> round step -> executeRound -> provider.complete -> retryWithBackoff"
  - "Round 5 per-module fan-out also receives onRetry through analyzeModule and retryFailedModules"
  - "costWarningThreshold in config schema with no default (renderer handles default 1.00)"
  - "Degraded round fallback path also populates tokens/cost from tracker when partial data available"

patterns-established:
  - "Optional callback threading: add optional param at each layer, forward with ?. operator"
  - "Cost estimation via MODEL_COSTS lookup table with 'default' key fallback"

# Metrics
duration: 5min
completed: 2026-02-17
---

# Phase 7 Plan 2: Event Pipeline Extension Summary

**Token cost estimation API, retry countdown callbacks, and onRetry threading through all 6 AI round step creators for terminal renderer consumption**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-17T15:18:26Z
- **Completed:** 2026-02-17T15:23:38Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments
- TokenUsageTracker extended with estimateCost(), getRoundCost(), getTotalCost(), and getRoundUsage() methods using a 6-model cost table
- executeRound populates tokens and cost on every RoundExecutionResult (success, retried, and degraded paths)
- retryWithBackoff exposes retry countdown delay and reason via onRetry callback
- DAGEvents.onStepRetry defined for orchestrator-level retry event propagation
- LLMProvider interface and AnthropicProvider forward onRetry to retryWithBackoff
- All 6 round step creators (R1-R6) accept and forward optional onRetry callback
- HandoverConfig schema extended with optional costWarningThreshold field

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cost calculation to TokenUsageTracker and costWarningThreshold to config** - `728d30b` (feat)
2. **Task 2a: Extend core pipeline files -- runner, rate limiter, types, DAG events, and provider** - `32b28a3` (feat)
3. **Task 2b: Thread onRetry callback through all 6 round step creators** - `08fefc5` (feat)

## Files Created/Modified
- `src/context/tracker.ts` - Added MODEL_COSTS table, estimateCost(), getRoundCost(), getTotalCost(), getRoundUsage() methods, model param to constructor
- `src/config/schema.ts` - Added optional costWarningThreshold field to HandoverConfigSchema
- `src/ai-rounds/types.ts` - Added optional tokens and cost fields to RoundExecutionResult
- `src/ai-rounds/runner.ts` - Added onRetry to ExecuteRoundOptions, populated tokens/cost on success and degraded paths
- `src/utils/rate-limiter.ts` - Added onRetry callback to retryWithBackoff, invoked before delay sleep
- `src/domain/types.ts` - Added onStepRetry event to DAGEvents interface
- `src/providers/base.ts` - Added optional options parameter with onRetry to LLMProvider.complete()
- `src/providers/anthropic.ts` - Accepted and forwarded onRetry to retryWithBackoff
- `src/ai-rounds/round-1-overview.ts` - Added optional onRetry parameter, forwarded to executeRound
- `src/ai-rounds/round-2-modules.ts` - Added optional onRetry parameter, forwarded to executeRound
- `src/ai-rounds/round-3-features.ts` - Added optional onRetry parameter, forwarded to executeRound
- `src/ai-rounds/round-4-architecture.ts` - Added optional onRetry parameter, forwarded to executeRound
- `src/ai-rounds/round-5-edge-cases.ts` - Added optional onRetry parameter, forwarded through executeRound5, analyzeModule, and retryFailedModules
- `src/ai-rounds/round-6-deployment.ts` - Added optional onRetry parameter, forwarded to executeRound

## Decisions Made
- MODEL_COSTS uses static readonly table with 'default' key fallback to claude-opus-4-6 pricing (most expensive, safe default)
- costWarningThreshold has no schema default -- renderer in Plan 07-03 will use 1.00 as default to keep config clean
- onRetry threaded end-to-end through the complete call chain for full retry countdown visibility
- Round 5 per-module fan-out required deeper threading through analyzeModule and retryFailedModules (not just executeRound)
- Degraded fallback path checks tracker for partial usage data before returning zero values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All event hooks in place for Plan 07-03 (terminal renderer) to consume
- onStepRetry in DAGEvents ready for orchestrator wiring
- tokens and cost available on every RoundExecutionResult for live cost display
- costWarningThreshold available in config for cost warning thresholds
- No blockers for Plan 07-03

## Self-Check: PASSED

All 14 modified files verified present. All 3 task commits verified (728d30b, 32b28a3, 08fefc5). SUMMARY.md exists.

---
*Phase: 07-terminal-ux*
*Completed: 2026-02-17*
