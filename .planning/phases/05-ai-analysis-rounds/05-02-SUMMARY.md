---
phase: 05-ai-analysis-rounds
plan: 02
subsystem: ai-analysis
tags: [llm-execution, round-engine, fallbacks, project-overview, module-detection, retry-logic, graceful-degradation]

# Dependency graph
requires:
  - phase: 05-ai-analysis-rounds
    provides: "Zod schemas, prompt templates, validator, quality checker from plan 01"
  - phase: 04-context-window-management
    provides: "PackedContext, RoundContext, TokenUsageTracker, compressRoundOutput for inter-round context"
  - phase: 03-static-analysis
    provides: "StaticAnalysisResult with AST data for fallback builders and validation"
  - phase: 01-foundation
    provides: "CompletionRequest, LLMProvider interface, StepDefinition, createStep"
provides:
  - "Round execution engine (executeRound<T>) with validation, quality check, single retry, and fallback"
  - "Round 1 step creator (createRound1Step) producing project overview with business/technical interleaving"
  - "Round 2 step creator (createRound2Step) identifying module boundaries from imports and directory structure"
  - "Static analysis fallback builders for all 6 rounds (buildRound1-6Fallback)"
affects: [05-03, 05-04, 06-output-generation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Round execution engine pattern: attempt() with boolean retry flag for at-most-once retry"
    - "Fallback builder pattern: produce typed output from StaticAnalysisResult for graceful degradation"
    - "Step creator pattern: function returning StepDefinition for DAG integration"
    - "Prior round injection: getRound1Result() callback for inter-round dependency"

key-files:
  created:
    - src/ai-rounds/runner.ts
    - src/ai-rounds/fallbacks.ts
    - src/ai-rounds/round-1-overview.ts
    - src/ai-rounds/round-2-modules.ts
  modified: []

key-decisions:
  - "At most one retry per round via boolean hasRetried flag (not a counter)"
  - "Retry triggers: validation dropRate >0.3 OR quality.isAcceptable === false"
  - "Retry uses buildRetrySystemPrompt() for stricter prompting and temperature 0.1"
  - "Failed rounds return degraded status with static fallback (never throw)"
  - "maxTokens 4096 for Round 1, 8192 for Round 2 (module detection needs more output)"
  - "2000 tokens per prior round for compressed inter-round context"

patterns-established:
  - "executeRound<T> generic engine: all rounds use same lifecycle (call -> validate -> quality -> retry -> compress -> return)"
  - "Fallback builder: extract whatever static data applies, mark unavailable fields, return typed object"
  - "Step creator: function(provider, analysis, packed, config, tracker, estimate) -> StepDefinition"
  - "Round data builder: private function assembling round-specific analysis strings from StaticAnalysisResult"

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 5 Plan 02: Round Execution Engine and Rounds 1-2 Summary

**Reusable round execution engine with validation/quality/retry/fallback lifecycle, plus Round 1 Project Overview and Round 2 Module Detection step creators, and static fallback builders for all 6 rounds**

## Performance

- **Duration:** 4min
- **Started:** 2026-02-17T09:51:15Z
- **Completed:** 2026-02-17T09:55:24Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments
- Round execution engine handling full LLM call lifecycle with at-most-once retry and graceful degradation to static data
- Round 1 step producing project overview from file tree, dependencies, git history, docs coverage, and business context
- Round 2 step identifying module boundaries from import graph, reverse import map, directory structure, and export summary
- All 6 fallback builders producing typed non-empty output from raw StaticAnalysisResult

## Task Commits

Each task was committed atomically:

1. **Task 1: Create round execution engine and fallback builders** - `e1bc879` (feat)
2. **Task 2: Implement Round 1 Project Overview and Round 2 Module Detection** - `6390fd8` (feat)

## Files Created/Modified
- `src/ai-rounds/runner.ts` - Generic executeRound<T> engine: LLM call, validate, quality check, retry once, compress, fallback
- `src/ai-rounds/fallbacks.ts` - Six buildRoundNFallback functions extracting typed fallback data from StaticAnalysisResult
- `src/ai-rounds/round-1-overview.ts` - createRound1Step: project overview with business/technical interleaving, deps=['static-analysis']
- `src/ai-rounds/round-2-modules.ts` - createRound2Step: module detection from AST imports and directory structure, deps=['ai-round-1']

## Decisions Made
- Boolean `hasRetried` flag ensures exactly one retry attempt (not a counter, per plan locked decision)
- Validation dropRate threshold 0.3 triggers retry (30% claim failure rate)
- Round 2 gets 8192 maxTokens (double Round 1's 4096) since complex projects have many modules
- Round data builders are private functions (not exported) -- only step creators are public API
- fallbacks.ts uses underscore-prefixed params for unused analysis args in Rounds 3-4

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Round execution engine ready for Rounds 3-6 (plan 05-03) to use same executeRound<T> pattern
- Round 1 and 2 compressed contexts available for downstream rounds via RoundExecutionResult.context
- All 6 fallback builders ready for pipeline-level fallback handling
- All files compile cleanly with no TypeScript errors

## Self-Check: PASSED

All 4 created files verified to exist on disk. Both task commits (e1bc879, 6390fd8) verified in git log.

---
*Phase: 05-ai-analysis-rounds*
*Completed: 2026-02-17*
