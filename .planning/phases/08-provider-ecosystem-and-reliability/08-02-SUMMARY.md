---
phase: 08-provider-ecosystem-and-reliability
plan: 02
subsystem: cli, cache
tags: [round-cache, estimate, cost-comparison, crash-recovery, content-hash, picocolors]

# Dependency graph
requires:
  - phase: 08-01
    provides: "PROVIDER_PRESETS with pricing data for all 7 providers"
  - phase: 03
    provides: "discoverFiles for file enumeration and size calculation"
  - phase: 04
    provides: "chars/4 token estimation heuristic"
  - phase: 07
    provides: "Terminal UI formatters (formatTokens, formatCost, SYMBOLS)"
provides:
  - "RoundCache class for content-hash-based AI round result persistence"
  - "handover estimate CLI command with styled multi-provider cost comparison"
affects: [08-03, generate-pipeline, cli]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "File-per-round JSON cache with content-hash invalidation"
    - "Lazy import pattern for CLI command registration"
    - "chars/4 + 20% output heuristic for cost estimation"

key-files:
  created:
    - src/cache/round-cache.ts
    - src/cli/estimate.ts
  modified:
    - src/cli/index.ts

key-decisions:
  - "Output tokens estimated at 20% of input tokens for cost heuristic"
  - "Estimate uses console.log directly, not the terminal renderer (simple command, not pipeline)"
  - "Cost entries sorted: current provider first, then ascending cost, local providers last"
  - "Ollama label uses provider name as model since defaultModel is empty"

patterns-established:
  - "RoundCache file-per-round storage: round-N.json with hash/model/result/createdAt fields"
  - "Static computeAnalysisFingerprint: path+size sorted hash for fast change detection"

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 8 Plan 2: Round Cache and Estimate Command Summary

**Content-hash RoundCache for crash recovery and `handover estimate` CLI command with styled 7-provider cost comparison**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T19:43:29Z
- **Completed:** 2026-02-17T19:47:39Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- RoundCache class with content-hash invalidation for crash recovery (get/set/clear/getCachedRounds)
- `handover estimate` command shows cost comparison across all 7 providers with zero network calls
- CLI registration with lazy import pattern consistent with existing analyze command
- Styled terminal output with green arrow for current provider, yellow costs, dim separators

## Task Commits

Each task was committed atomically:

1. **Task 1: Round cache for crash recovery** - `840b814` (feat)
2. **Task 2: Estimate command with styled cost comparison** - `b0a6ae6` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `src/cache/round-cache.ts` - Content-hash-based disk cache for AI round results with get/set/clear/getCachedRounds
- `src/cli/estimate.ts` - Estimate command handler with styled multi-provider cost comparison output
- `src/cli/index.ts` - CLI with estimate command registered via lazy import

## Decisions Made
- Output tokens estimated at 20% of input tokens for cost heuristic (input dominates for codebase analysis)
- Estimate uses console.log directly rather than the terminal renderer (simple command, not a pipeline operation)
- Cost entries sorted: current provider first, then ascending cost, local providers last for quick scanning
- When a provider has no pricing data for the selected model, shows N/A rather than $0.00
- Ollama label uses provider name as model since defaultModel is empty string

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm run build` (tsup) fails due to missing tsup config -- this is a pre-existing issue unrelated to this plan. Verification performed via `tsx` instead of `node dist/`. Logged as informational only.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- RoundCache ready for integration into the generate pipeline (08-03 retry/resilience plan)
- Estimate command available for users to preview costs before running generate
- Provider presets pricing data fully exercised by both cache hashing and cost estimation

## Self-Check: PASSED

- [x] src/cache/round-cache.ts -- FOUND
- [x] src/cli/estimate.ts -- FOUND
- [x] src/cli/index.ts -- modified (estimate command registered)
- [x] Commit 840b814 -- FOUND (Task 1: RoundCache)
- [x] Commit b0a6ae6 -- FOUND (Task 2: estimate command)
- [x] TypeScript compiles cleanly (tsc --noEmit)
- [x] RoundCache round-trip verified (set/get/hash-mismatch/clear/getCachedRounds)
- [x] Estimate command runs and shows all 7 providers

---
*Phase: 08-provider-ecosystem-and-reliability*
*Completed: 2026-02-17*
