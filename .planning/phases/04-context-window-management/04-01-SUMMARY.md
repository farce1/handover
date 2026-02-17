---
phase: 04-context-window-management
plan: 01
subsystem: context
tags: [zod, scoring, token-estimation, priority, context-window]

# Dependency graph
requires:
  - phase: 03-static-analysis
    provides: StaticAnalysisResult with fileTree, gitHistory, todos, ast data
  - phase: 02-parsing
    provides: ParsedFile with imports/exports for reverse-import mapping
provides:
  - Zod schemas for entire context window management subsystem (8 schemas)
  - File priority scorer with six CTX-02 weighted factors
  - Token estimation (chars/4 heuristic + LLMProvider delegation)
  - Token budget computation with configurable overhead and safety margin
affects: [04-02-packer, 04-03-compressor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Six-factor weighted scoring with deterministic tiebreaking"
    - "Reverse-import map with extension-aware resolution"
    - "Token budget = (maxTokens - overhead - reserve) * safetyMargin"

key-files:
  created:
    - src/context/types.ts
    - src/context/token-counter.ts
    - src/context/scorer.ts
  modified: []

key-decisions:
  - "chars/4 heuristic as standalone token estimator with optional LLMProvider delegation"
  - "Test file penalty of -15 from score to deprioritize test files in context packing"
  - "Lock files excluded entirely from scoring (zero handover value)"
  - "Safety margin 0.9 default for token budget to avoid context window overflow"

patterns-established:
  - "Score breakdown object: individual factor scores preserved alongside total for debugging"
  - "Extension-aware import resolution: tries .ts, .js, .tsx, .jsx, /index.ts, /index.js suffixes"

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 4 Plan 1: Context Schemas and Scorer Summary

**Zod schemas for context window management (8 schemas) plus file priority scorer using six CTX-02 weighted factors and token budget computation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T08:31:24Z
- **Completed:** 2026-02-17T08:33:35Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- All 8 Zod schemas defined for context subsystem: ScoreBreakdown, FilePriority, ContentTier, TokenBudget, PackedFile, PackedContext, RoundContext, TokenUsage
- File priority scorer computes 0-100 scores from StaticAnalysisResult using six weighted factors with deterministic ordering
- Token estimation supports standalone chars/4 heuristic and LLMProvider delegation
- Token budget computation with configurable prompt overhead, output reserve, and safety margin

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Zod schemas and token budget utilities** - `604212e` (feat)
2. **Task 2: Implement file priority scorer** - `9c092f9` (feat)

## Files Created/Modified
- `src/context/types.ts` - 8 Zod schemas and inferred types for context window management
- `src/context/token-counter.ts` - estimateTokens() and computeTokenBudget() utilities
- `src/context/scorer.ts` - scoreFiles() with six CTX-02 factors, reverse-import map, test penalty, lock file exclusion

## Decisions Made
- chars/4 heuristic as standalone token estimator with optional LLMProvider delegation -- simple, no dependencies, accurate enough for budget planning
- Test file penalty of -15 to deprioritize test files in context packing -- tests have less handover value than implementation
- Lock files (package-lock.json, yarn.lock, etc.) excluded entirely -- machine-generated, zero handover value
- Safety margin of 0.9 (90%) for token budget to prevent context window overflow near limits

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All types needed by Plans 04-02 (packer) and 04-03 (compressor) are defined
- scoreFiles() produces the FilePriority[] input that the packer will consume
- Token budget computation ready for packer to determine file content allocation
- TypeScript compiles cleanly with strict mode

## Self-Check: PASSED

- [x] src/context/types.ts exists
- [x] src/context/token-counter.ts exists
- [x] src/context/scorer.ts exists
- [x] 04-01-SUMMARY.md exists
- [x] Commit 604212e found
- [x] Commit 9c092f9 found

---
*Phase: 04-context-window-management*
*Completed: 2026-02-17*
