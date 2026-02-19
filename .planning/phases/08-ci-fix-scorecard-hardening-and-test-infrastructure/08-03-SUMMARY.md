---
phase: 08-ci-fix-scorecard-hardening-and-test-infrastructure
plan: 03
subsystem: testing
tags: [vitest, memfs, vitest-mock-extended, coverage, mocking, llm-provider]

# Dependency graph
requires:
  - phase: 08-01
    provides: vitest config with passWithNoTests, CI passing with no tests
provides:
  - memfs and vitest-mock-extended installed as dev dependencies
  - Vitest coverage config with WASM/type-only/CLI/config exclusions
  - createMockProvider() factory at src/providers/__mocks__/index.ts
  - vi.hoisted() pattern documented as project convention
affects:
  - 08-04 (test infrastructure foundation for future test phases)
  - phase-09 (scorecard tests will import createMockProvider)
  - phase-10 (config tests will use memfs)
  - phase-11 (coverage thresholds will use the exclusion config)

# Tech tracking
tech-stack:
  added:
    - memfs@4.56.10 (in-memory filesystem for testing)
    - vitest-mock-extended@3.1.0 (type-safe mock utilities)
  patterns:
    - vi.fn() cast via as unknown as TypedFn to satisfy generic interface types
    - LLMProvider mock boundary: mock at interface level, not SDK level
    - vi.hoisted() pattern for pre-import mock variable initialization

key-files:
  created:
    - src/providers/__mocks__/index.ts
  modified:
    - vitest.config.ts
    - package.json
    - package-lock.json

key-decisions:
  - 'vi.fn() must be cast via as unknown as TypedFn to satisfy generic interface signatures (complete<T> cannot be directly assigned from Mock<Procedure>)'
  - 'createMockProvider() default complete() return includes model and duration fields to satisfy CompletionResult schema'
  - 'Coverage thresholds deliberately omitted from vitest.config.ts — Phase 11 enforces 80% after real test suite exists'

patterns-established:
  - 'MockProvider pattern: use createMockProvider() from src/providers/__mocks__/index.ts for all LLM provider mocking'
  - 'vi.hoisted() convention: documented in mock factory JSDoc for module-level mock variable initialization'
  - 'Coverage exclusion pattern: exclude WASM-dependent, type-only, CLI entry, and config constant files'

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 8 Plan 03: Test Infrastructure Setup Summary

**memfs + vitest-mock-extended installed, coverage exclusions configured, createMockProvider() typed mock factory established at LLMProvider interface boundary**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T00:01:32Z
- **Completed:** 2026-02-19T00:03:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Installed memfs@4.56.10 and vitest-mock-extended@3.1.0 as dev dependencies
- Updated vitest.config.ts with comprehensive coverage exclusions (WASM parsing layer, type-only files, CLI entry, Zod schemas, config constants)
- Created createMockProvider() factory that satisfies LLMProvider interface at compile time with vi.fn() type-safe casts
- Documented vi.hoisted() pattern as project convention in JSDoc

## Task Commits

Each task was committed atomically:

1. **Task 1: Install memfs and vitest-mock-extended, update vitest config** - `f1f9ea5` (chore)
2. **Task 2: Create createMockProvider() factory with vi.hoisted() convention** - `fa72046` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/providers/__mocks__/index.ts` - Typed mock LLMProvider factory; exports createMockProvider() with vi.fn() defaults and vi.hoisted() documentation
- `vitest.config.ts` - Added coverage exclusions: types.ts, domain/schemas.ts, cli/index.ts, grammars/downloader.ts, parsing/\*\*, config/defaults.ts
- `package.json` - Added memfs and vitest-mock-extended to devDependencies
- `package-lock.json` - Updated lock file after npm install

## Decisions Made

- Used `vi.fn() as unknown as TypedFn` pattern because `vi.fn()` returns `Mock<Procedure | Constructable>` which cannot be directly assigned to a generic typed function signature. This is the idiomatic TypeScript workaround for mocking generic interface methods with vi.
- Mock's `complete()` default return includes `model: 'mock'` and `duration: 0` because `CompletionResultSchema` requires those fields (not just data + usage).
- Removed unused `z`, `CompletionRequest`, and `CompletionResult` imports after initial draft triggered ESLint `no-unused-vars` errors in pre-commit hook.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed type mismatch in mock factory — vi.fn() cast required**

- **Found during:** Task 2 (createMockProvider factory)
- **Issue:** TypeScript reported 3 errors: `vi.fn()` returns `Mock<Procedure | Constructable>` which doesn't match specific typed signatures (`complete<T>`, `(text: string) => number`, `() => number`)
- **Fix:** Added `as unknown as TypedFn` casts for each vi.fn() call; extracted `type CompleteFn = LLMProvider['complete']` as local alias
- **Files modified:** src/providers/**mocks**/index.ts
- **Verification:** `npm run typecheck` exits 0
- **Committed in:** fa72046 (Task 2 commit)

**2. [Rule 1 - Bug] Removed unused imports that blocked pre-commit hook**

- **Found during:** Task 2 commit (lint-staged pre-commit)
- **Issue:** Initial draft included `import type { z } from 'zod'`, `CompletionRequest`, `CompletionResult` which were unused after simplifying the factory signature
- **Fix:** Removed the 3 unused type imports
- **Files modified:** src/providers/**mocks**/index.ts
- **Verification:** ESLint passes, `npm run typecheck` exits 0
- **Committed in:** fa72046 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 - type/lint bugs)
**Impact on plan:** Both auto-fixes required for the factory to compile and commit cleanly. No scope creep.

## Issues Encountered

- Initial `createMockProvider()` draft included typed overrides using `ReturnType<typeof vi.fn>` (from plan template) which caused compile errors — needed to replace with concrete function signatures and `as unknown` casts. Standard pattern for mocking generic interface methods in Vitest.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Test infrastructure foundation complete: memfs for filesystem mocking (Phase 10 config tests), vitest-mock-extended for type-safe mocks, createMockProvider() for LLM provider mocking (Phases 9-11)
- Coverage exclusions ensure WASM files don't inflate denominator when coverage runs start in Phase 11
- No blockers for Phase 9 (Scorecard tests) or Phase 10 (config/loadConfig tests)

---

_Phase: 08-ci-fix-scorecard-hardening-and-test-infrastructure_
_Completed: 2026-02-19_

## Self-Check: PASSED

- FOUND: src/providers/**mocks**/index.ts
- FOUND: vitest.config.ts
- FOUND: 08-03-SUMMARY.md
- FOUND commit: f1f9ea5 (chore: install memfs + vitest-mock-extended, update coverage config)
- FOUND commit: fa72046 (feat: create createMockProvider() typed mock factory)
