---
phase: 09-code-hardening-and-pure-function-tests
plan: 01
subsystem: testing
tags: [scoring, constants, logger, catch-blocks, cli-validation, hardening]

# Dependency graph
requires:
  - phase: 08-ci-fix
    provides: test infrastructure and vitest config in place
provides:
  - Named SCORE_* exported constants replacing all inline magic numbers in scorer.ts
  - logger.debug() method for documenting recoverable catch blocks
  - Documented catch blocks across all analyzer files
  - CLI validation order: --only alias check before API key check
affects: [10-config-validation-tests, 11-full-test-suite, future scorer refactors]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'UPPER_SNAKE_CASE as const named exports for scoring weights'
    - 'logger.debug() in recoverable catch blocks for optional verbose output'
    - 'Fail-fast CLI validation: cheapest/most-actionable check first'

key-files:
  created: []
  modified:
    - src/context/scorer.ts
    - src/utils/logger.ts
    - src/analyzers/env-scanner.ts
    - src/analyzers/test-analyzer.ts
    - src/analyzers/doc-analyzer.ts
    - src/analyzers/todo-scanner.ts
    - src/analyzers/file-tree.ts
    - src/cli/init.ts
    - src/parsing/index.ts
    - src/cli/generate.ts

key-decisions:
  - '11 SCORE_* constants exported from scorer.ts with as const — not user-configurable, internal weights only'
  - 'logger.debug() in recoverable catch blocks — only shown with -v flag, not noise in normal output'
  - 'resolveSelectedDocs() moved before validateProviderConfig() in generate.ts — pure function, no env/API deps (HARD-03)'
  - 'Stale plan 02-02 pending comments in parsing/index.ts replaced with accurate rationale'

patterns-established:
  - 'Named constants pattern: export const SCORE_X = N as const for all scoring weights'
  - 'Catch block documentation policy: logger.debug() for expected/recoverable, comment for intentional silence'
  - 'CLI validation ordering: pure checks first, env-dependent last'

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 09 Plan 01: Code Hardening — Scoring Constants, Logger.debug, and Catch Block Audit Summary

**11 SCORE\_\* named constants extracted from scorer.ts magic numbers, logger.debug() added for recoverable catch blocks across 5 analyzer files, and CLI --only validation reordered before API key check**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T20:45:08Z
- **Completed:** 2026-02-19T20:48:21Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Extracted 11 scoring weight constants (SCORE_ENTRY_POINT, SCORE_IMPORT_CAP, etc.) as named exported `as const` values in scorer.ts, replacing all inline magic numbers in scoreFiles()
- Added debug() method to Logger class (verbose-gated, suppressed-gated, with `[debug]` prefix) for use in recoverable catch blocks
- Audited and documented all catch blocks across env-scanner.ts, test-analyzer.ts, doc-analyzer.ts, todo-scanner.ts, and file-tree.ts with logger.debug() calls; updated stale comments in parsing/index.ts and init.ts
- Reordered CLI validation in generate.ts: resolveSelectedDocs() (pure) fires before validateProviderConfig() and resolveApiKey(), implementing fail-fast UX for --only flag

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract scoring constants and add logger.debug()** - `47cf50c` (feat)
2. **Task 2: Audit catch blocks and reorder CLI validation** - `d021c7e` (feat)

## Files Created/Modified

- `src/context/scorer.ts` - Added 11 SCORE\_\* exported constants, replaced all inline magic numbers in scoreFiles(), updated JSDoc
- `src/utils/logger.ts` - Added debug() method after log() method with verbose-gated, suppressed-gated pattern
- `src/analyzers/env-scanner.ts` - Added logger import, logger.debug() in 2 recoverable catch blocks
- `src/analyzers/test-analyzer.ts` - Added logger import, logger.debug() in 2 recoverable catch blocks
- `src/analyzers/doc-analyzer.ts` - Added logger import, logger.debug() in 1 recoverable catch block
- `src/analyzers/todo-scanner.ts` - Added logger import, logger.debug() in 1 recoverable catch block
- `src/analyzers/file-tree.ts` - Added logger import, logger.debug() in 1 recoverable catch block
- `src/cli/init.ts` - Updated catch comment to explain WHY parse errors are ignored
- `src/parsing/index.ts` - Replaced stale 'plan 02-02 pending' comments with accurate rationale
- `src/cli/generate.ts` - Moved resolveSelectedDocs/computeRequiredRounds before validateProviderConfig/resolveApiKey

## Decisions Made

- SCORE\_\* constants are exported (not kept private) so they can be imported by future unit tests without special access
- logger.debug() chosen over comments in catch blocks because it gives developers visibility into skipped files when running with -v
- resolveSelectedDocs() move is safe because it is a pure function — only reads options.only and DOCUMENT_REGISTRY, has no side effects, no env/API dependencies
- Outer catch blocks (success:false return pattern) in analyzers left unchanged — they already propagate errors appropriately

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- scorer.ts is now test-ready: all scoring logic uses named constants that can be verified in unit tests without guessing magic numbers
- Logger.debug() method ready for use in any future catch block additions
- CLI validation order hardened: --only flag errors fire before API key errors, improving UX for invalid document aliases
- Phase 09 Plan 02 (pure function tests for scorer.ts) can now proceed with named constants as test anchors

---

_Phase: 09-code-hardening-and-pure-function-tests_
_Completed: 2026-02-19_

## Self-Check: PASSED

- All 10 modified source files found on disk
- SUMMARY.md created at .planning/phases/09-code-hardening-and-pure-function-tests/09-01-SUMMARY.md
- Task 1 commit 47cf50c found in git log
- Task 2 commit d021c7e found in git log
