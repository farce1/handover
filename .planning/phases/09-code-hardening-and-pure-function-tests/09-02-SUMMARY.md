---
phase: 09-code-hardening-and-pure-function-tests
plan: 02
subsystem: testing
tags: [vitest, unit-tests, scorer, token-counter, test.each, pure-functions]

# Dependency graph
requires:
  - phase: 09-01
    provides: SCORE_* constants exported from scorer.ts enabling import in test files
provides:
  - Unit tests for scoreFiles() covering all 6 scoring factors via test.each
  - Unit tests for computeTokenBudget() covering defaults, custom options, and edge cases
  - Unit tests for estimateTokens() covering heuristic, delegation, and edge cases

affects: [phase-10, phase-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - buildMockAnalysis() factory helper constructed inline in test file (not shared)
    - Cast partial mocks via `as unknown as StaticAnalysisResult` and `as unknown as LLMProvider`
    - test.each for combinatorial inputs (lock files, entry point filenames, window sizes)
    - Computed expected values inline using the same formula as implementation (documents behavior)

key-files:
  created:
    - src/context/scorer.test.ts
    - src/context/token-counter.test.ts
  modified:
    - src/context/token-counter.ts (prettier reformatting by pre-commit hook only)

key-decisions:
  - 'buildMockAnalysis() factory kept local to scorer.test.ts per plan spec (not shared)'
  - 'SCORE_TEST_PENALTY used in assertion via Math.max(SCORE_MIN, 0 - SCORE_TEST_PENALTY) to satisfy ESLint no-unused-vars'
  - 'LLMProvider mock cast via `as unknown as LLMProvider` (not `as any`) to satisfy @typescript-eslint/no-explicit-any'

patterns-established:
  - 'All scoring assertions use named SCORE_* constants, never raw numbers'
  - 'Edge case tests document actual behavior with comments (negative budgets, no guards)'

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 9 Plan 02: Pure Function Tests Summary

**33 unit tests across scorer.ts and token-counter.ts covering all 6 scoring factors, budget formula, and estimateTokens heuristic with named-constant assertions and test.each combinatorial cases**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T21:50:46Z
- **Completed:** 2026-02-19T21:54:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- 20 tests for scoreFiles(): all 6 scoring factors (entry point, import count, export count, git activity, edge cases/TODOs, config file), lock file exclusion via test.each, import/export cap enforcement, test file penalty, score cap at SCORE_MAX, and sort order (descending score, alphabetical tie-break)
- 13 tests for computeTokenBudget() and estimateTokens(): default 100k window formula, 3 custom window sizes via test.each, zero-maxTokens and negative-intermediate edge cases documented, provider delegation via LLMProvider mock
- All assertions use named constants (SCORE_ENTRY_POINT, SCORE_IMPORT_CAP, etc.) or computed expected values using the same formula as the implementation

## Task Commits

Each task was committed atomically:

1. **Task 1: Write scoreFiles() unit tests** - `f2a2f14` (feat)
2. **Task 2: Write computeTokenBudget() and estimateTokens() unit tests** - `4fa650e` (feat)

## Files Created/Modified

- `src/context/scorer.test.ts` - 20 unit tests for scoreFiles(), buildMockAnalysis() factory, test.each for lock files and entry points
- `src/context/token-counter.test.ts` - 13 unit tests for computeTokenBudget() and estimateTokens(), LLMProvider mock
- `src/context/token-counter.ts` - Prettier reformatting only (pre-commit hook, no logic change)

## Decisions Made

- `buildMockAnalysis()` factory kept local to scorer.test.ts per plan spec — not shared between test files
- `SCORE_TEST_PENALTY` used in assertion via `Math.max(SCORE_MIN, 0 - SCORE_TEST_PENALTY)` to satisfy ESLint `no-unused-vars` rule while keeping the constant meaningful in assertions
- LLMProvider mock cast via `as unknown as LLMProvider` (not `as any`) to satisfy `@typescript-eslint/no-explicit-any` rule

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- ESLint `no-unused-vars` rejected `SCORE_TEST_PENALTY` because initial test only referenced it in a comment. Fixed by using the constant in a computed expected-value assertion (`Math.max(SCORE_MIN, 0 - SCORE_TEST_PENALTY)`).
- ESLint `no-explicit-any` rejected `as any` for LLMProvider mock. Fixed by importing the interface and casting via `as unknown as LLMProvider`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- scorer.ts and token-counter.ts are regression-protected for all scoring and budget logic
- Phase 10 (integration tests) can now run against a stable scored-file baseline
- Phase 11 (coverage enforcement) will count scorer.test.ts and token-counter.test.ts toward the 80% threshold

---

_Phase: 09-code-hardening-and-pure-function-tests_
_Completed: 2026-02-19_

## Self-Check: PASSED

- FOUND: src/context/scorer.test.ts
- FOUND: src/context/token-counter.test.ts
- FOUND: 09-02-SUMMARY.md
- FOUND commit: f2a2f14 (Task 1)
- FOUND commit: 4fa650e (Task 2)
