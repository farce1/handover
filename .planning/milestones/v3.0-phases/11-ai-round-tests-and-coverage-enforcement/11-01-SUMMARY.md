---
phase: 11-ai-round-tests-and-coverage-enforcement
plan: 01
subsystem: testing
tags: [vitest, unit-tests, mocking, fake-timers, ai-rounds, retry, rate-limiter]

# Dependency graph
requires:
  - phase: 10-algorithm-and-validation-tests
    provides: test infrastructure and patterns (charTokens, factory functions)
  - phase: 08-test-infrastructure
    provides: createMockProvider() factory, vitest configuration
provides:
  - executeRound unit tests (happy, degraded, retry-on-dropRate, retry-on-quality paths)
  - validateFileClaims, validateImportClaims, validateRoundClaims unit tests
  - compressRoundOutput unit tests (field extraction + token budget enforcement)
  - retryWithBackoff unit tests with vi.useFakeTimers + vi.advanceTimersByTimeAsync
  - RateLimiter class unit tests (acquire, withLimit, queue-and-release)
affects:
  - future coverage enforcement (Phase 11 plans 02+)
  - any phase touching ai-rounds, compressor, or rate-limiter

# Tech tracking
tech-stack:
  added: []
  patterns:
    - mkAnalysis() factory for StaticAnalysisResult fixtures (all required fields,
      only fileTree.directoryTree and ast.files populated meaningfully)
    - charTokens = (text) => text.length as deterministic token estimator
    - Fresh createMockProvider() per test — no shared mutable mock state
    - vi.useFakeTimers() + vi.advanceTimersByTimeAsync() for timer-dependent tests
    - Catch-pattern for unhandled rejections in fake-timer tests

key-files:
  created:
    - src/ai-rounds/runner.test.ts
    - src/ai-rounds/validator.test.ts
    - src/context/compressor.test.ts
    - src/utils/rate-limiter.test.ts
  modified: []

key-decisions:
  - 'retryWithBackoff non-retryable errors throw ProviderError (not the original error): source
    always wraps the final throw via ProviderError.rateLimited() if lastError is not already
    a ProviderError instance'
  - 'All-retries-exhausted test uses .catch() pattern to avoid unhandled rejection warning
    from fake-timer advancement racing with expect(...).rejects'
  - 'Happy path mock data must be rich enough to pass quality check (500+ chars, 3+ code
    refs, hasAnyFilePaths) to avoid unexpected retry in executeRound tests'
  - 'Token budget enforcement test uses budget=80 (not 30) to allow minimum-1-finding rule
    while still heavily trimming all fields'

patterns-established:
  - 'mkAnalysis(filePaths) factory: build minimal StaticAnalysisResult with only
    fileTree.directoryTree populated with file entries'
  - 'Fake timer pattern: beforeEach vi.useFakeTimers(), afterEach vi.useRealTimers(),
    advance with vi.advanceTimersByTimeAsync() before awaiting promise'

# Metrics
duration: 6min
completed: 2026-02-20
---

# Phase 11 Plan 01: AI Round Tests Summary

**42 unit tests covering executeRound, claim validators, compressRoundOutput, and retryWithBackoff with fake-timer retry patterns**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T00:52:20Z
- **Completed:** 2026-02-20T00:58:25Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added 6 tests for `executeRound()` covering happy path, degraded (with idempotency check),
  retry-on-high-drop-rate, retry-on-quality-failure, and warning message assertion
- Added 12 tests for `validateFileClaims`, `validateImportClaims`, and `validateRoundClaims`
  with a reusable `mkAnalysis()` factory that populates all required StaticAnalysisResult fields
- Added 13 tests for `compressRoundOutput()` covering all field extraction paths and progressive
  token budget enforcement (openQuestions first, then findings with min-1 rule, then
  relationships, then modules)
- Added 11 tests for `retryWithBackoff()` and `RateLimiter` using `vi.useFakeTimers()` and
  `vi.advanceTimersByTimeAsync()` for deterministic timer control

## Task Commits

Each task was committed atomically:

1. **Task 1: executeRound and validator tests** - `1cb1d36` (feat)
2. **Task 2: compressRoundOutput and retryWithBackoff tests** - `9a4f425` (feat)

## Files Created/Modified

- `src/ai-rounds/runner.test.ts` - executeRound() tests: happy, degraded,
  idempotent, retry-dropRate, retry-quality, warning message
- `src/ai-rounds/validator.test.ts` - validateFileClaims, validateImportClaims,
  validateRoundClaims tests with mkAnalysis() factory
- `src/context/compressor.test.ts` - compressRoundOutput() field extraction
  and token budget enforcement tests
- `src/utils/rate-limiter.test.ts` - retryWithBackoff() and RateLimiter tests
  with vi.useFakeTimers()

## Decisions Made

- `retryWithBackoff` always throws `ProviderError` at end (even for non-retryable errors),
  because the source wraps all exits in `ProviderError.rateLimited()` when lastError is not
  already a `ProviderError`. Test asserts `ProviderError` instance, not original error message.
- All-retries-exhausted test uses `.catch()` pattern to capture the rejection before awaiting,
  avoiding unhandled rejection warnings from fake-timer advancement.
- Happy path mock data must contain file paths and code references (500+ chars, 3+ code refs)
  to pass Round 1 quality thresholds and avoid triggering an unexpected retry.
- Token budget `80` (not `30`) used for the "extremely tight" budget test to allow the
  minimum-1-finding rule while still forcing heavy truncation of all other fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mock response data enriched to pass quality check**

- **Found during:** Task 1 (happy path test)
- **Issue:** Mock data `{ sections: [...], signatures: [...] }` was too sparse — only ~40 chars,
  0 file path references — causing quality check to fail and triggering unexpected retry,
  making `result.status` equal `'retried'` instead of `'success'`
- **Fix:** Enriched mock response data with file paths, functions array, and longer content
  (500+ chars after JSON serialization) to satisfy Round 1 quality thresholds
- **Files modified:** src/ai-rounds/runner.test.ts
- **Verification:** `result.status === 'success'` test passes
- **Committed in:** 1cb1d36 (Task 1 commit)

**2. [Rule 1 - Bug] Token budget assertion value corrected**

- **Found during:** Task 2 (compressor token budget test)
- **Issue:** Test asserted `ctx.tokenCount <= 30` but minimum output after truncation
  (header + 1 finding at min-1 rule) is 47 chars, violating the budget assertion
- **Fix:** Changed budget to `80` chars (forces heavy trimming while allowing min-1 finding)
  and asserted `tokenCount <= 80`
- **Files modified:** src/context/compressor.test.ts
- **Verification:** All 13 compressor tests pass
- **Committed in:** 9a4f425 (Task 2 commit)

**3. [Rule 1 - Bug] Non-retryable error test assertion corrected**

- **Found during:** Task 2 (rate-limiter non-retryable test)
- **Issue:** Test asserted `rejects.toThrow('Not a rate limit error')` but source wraps
  all final throws via `ProviderError.rateLimited()` — original error message is lost
- **Fix:** Changed assertion to `rejects.toBeInstanceOf(ProviderError)` to match actual behavior
- **Files modified:** src/utils/rate-limiter.test.ts
- **Verification:** Test passes, behavior documented in key-decisions
- **Committed in:** 9a4f425 (Task 2 commit)

**4. [Rule 1 - Bug] All-retries-exhausted unhandled rejection fixed**

- **Found during:** Task 2 (rate-limiter all-retries test)
- **Issue:** `expect(promise).rejects.toBeInstanceOf(ProviderError)` produced unhandled
  rejection warning because fake timer advancement and the rejection handler raced
- **Fix:** Used `.catch()` pattern to capture rejection before timer advancement,
  then asserted the caught error
- **Files modified:** src/utils/rate-limiter.test.ts
- **Verification:** Test passes with no unhandled rejection warnings
- **Committed in:** 9a4f425 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (all Rule 1 — test assertion/mock data correctness bugs)
**Impact on plan:** All fixes necessary for test correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 test files ready: 42 tests, all passing, `npx tsc --noEmit` clean
- Coverage enforcement (Phase 11 Plan 02+) can now proceed with real test suite
- No blockers

---

_Phase: 11-ai-round-tests-and-coverage-enforcement_
_Completed: 2026-02-20_

## Self-Check: PASSED

- src/ai-rounds/runner.test.ts: FOUND
- src/ai-rounds/validator.test.ts: FOUND
- src/context/compressor.test.ts: FOUND
- src/utils/rate-limiter.test.ts: FOUND
- 11-01-SUMMARY.md: FOUND
- Commit 1cb1d36: FOUND
- Commit 9a4f425: FOUND
