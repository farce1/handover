---
phase: 02-ci-cd-automation
plan: 01
subsystem: infra
tags: [github-actions, vitest, coverage, v8, codecov, ci, nodejs]

# Dependency graph
requires: []
provides:
  - CI quality gate workflow running lint/typecheck/test/build on Node 20 and 22
  - Vitest v8 coverage provider with lcov reporter and 80% thresholds
  - Codecov integration (lcov upload on Node 20 leg only)
  - Integration test opt-in via HANDOVER_INTEGRATION env var (skipped by default in CI)
affects: [02-02-lint-formatter, 02-03-release-automation]

# Tech tracking
tech-stack:
  added:
    [
      '@vitest/coverage-v8@^3.2.4',
      'codecov/codecov-action@v5',
      'actions/checkout@v4',
      'actions/setup-node@v4',
    ]
  patterns:
    - 'Coverage upload gated to single matrix leg to prevent duplicate Codecov reports'
    - 'fail_ci_if_error: false for graceful Codecov degradation before token is configured'
    - 'npm test -- --coverage pattern: test script stays fast locally, CI adds --coverage flag'

key-files:
  created:
    - .github/workflows/ci.yml
  modified:
    - vitest.config.ts
    - package.json
    - .gitignore

key-decisions:
  - 'Use @vitest/coverage-v8@^3.x (not ^4.x) to match vitest@^3.0.0 peer requirement'
  - 'Coverage upload only on Node 20 matrix leg — prevents duplicate Codecov reports'
  - 'fail_ci_if_error: false for Codecov — CI succeeds before CODECOV_TOKEN is configured'
  - 'Added coverage/ to .gitignore — generated artifacts must not be committed'

patterns-established:
  - 'CI matrix: Node 20 and 22 on ubuntu-latest'
  - 'npm test -- --coverage: --coverage flag passed by CI, not baked into test script'
  - 'Integration tests: opt-in via HANDOVER_INTEGRATION env var; absent in CI by default'

# Metrics
duration: 2min
completed: 2026-02-18
---

# Phase 2 Plan 1: CI Quality Gate Summary

**GitHub Actions CI with Node 20/22 matrix, vitest v8 coverage (80% thresholds), and Codecov lcov upload via codecov-action@v5**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-18T11:57:49Z
- **Completed:** 2026-02-18T11:59:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `.github/workflows/ci.yml` — triggers on push to main and PRs; runs lint, typecheck, test with coverage, and build on Node 20 and 22
- Configured `vitest.config.ts` with v8 coverage provider, `text` + `lcov` reporters, and 80% thresholds on all four metrics (lines, functions, branches, statements)
- Codecov integration via `codecov/codecov-action@v5` — uploads `coverage/lcov.info` on Node 20 leg only; gracefully degrades if token not yet configured
- Integration tests remain opt-in (no `HANDOVER_INTEGRATION` in workflow) — does not slow CI

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure vitest coverage with v8 provider and 80% thresholds** - `300bf75` (chore)
2. **Task 2: Create CI quality gate workflow** - `a4b418b` (feat)

**Plan metadata:** `7167115` (docs: complete plan)

## Files Created/Modified

- `.github/workflows/ci.yml` - CI quality gate workflow with Node 20/22 matrix, all quality steps, and Codecov upload
- `vitest.config.ts` - Added coverage block with v8 provider, lcov reporter, and 80% thresholds
- `package.json` - Added `@vitest/coverage-v8` devDependency
- `.gitignore` - Added `coverage/` to prevent generated coverage artifacts from being committed

## Decisions Made

- Used `@vitest/coverage-v8@^3.x` to match vitest v3 peer requirement — the `*` wildcard resolved to v4 which broke peer resolution
- Codecov upload only on Node 20 matrix leg (not both) to avoid duplicate coverage reports
- `fail_ci_if_error: false` so CI doesn't fail before CODECOV_TOKEN secret is configured in GitHub
- Added `coverage/` to `.gitignore` — generated artifacts should not be tracked in git

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added coverage/ to .gitignore**

- **Found during:** Task 1 (vitest coverage configuration)
- **Issue:** Running `npx vitest run --coverage` generates a `coverage/` directory with lcov.info. This directory was not in `.gitignore`, meaning generated artifacts would be committed to the repo.
- **Fix:** Added `coverage/` entry to `.gitignore`
- **Files modified:** `.gitignore`
- **Verification:** `git status` no longer shows coverage/ as an untracked file
- **Committed in:** `300bf75` (Task 1 commit)

**2. [Rule 1 - Bug] Pinned @vitest/coverage-v8 to v3.x**

- **Found during:** Task 1 (npm install)
- **Issue:** `npm install --save-dev @vitest/coverage-v8` (latest) resolved to v4.x which requires vitest@^4 peer. Project uses vitest@^3, causing ERESOLVE conflict.
- **Fix:** Explicitly installed `@vitest/coverage-v8@^3.0.0` to match the existing vitest version
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** npm install succeeded; `npx vitest run --coverage` ran and produced lcov.info
- **Committed in:** `300bf75` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- npm peer resolution conflict between `@vitest/coverage-v8@latest` (requires vitest@^4) and project's `vitest@^3`. Resolved by pinning to `@vitest/coverage-v8@^3.x`. No user action required.

## User Setup Required

After CI workflow is active, configure CODECOV_TOKEN secret in GitHub repository settings:

1. Create account at codecov.io and add the repository
2. Copy the upload token from Codecov dashboard
3. Add as `CODECOV_TOKEN` secret in GitHub → Settings → Secrets and variables → Actions

Until configured, `fail_ci_if_error: false` ensures CI still passes.

## Next Phase Readiness

- CI quality gate is live — any PR to main now runs the full quality pipeline
- Plan 02-02 (lint/formatter) can proceed; the real `npm run lint` replaces the existing ESLint stub
- Plan 02-03 (release automation) can proceed; build step is already verified in CI
- Coverage thresholds at 80% — current coverage is low (~0.23% statements); this will fail CI until unit tests are added (expected; tracked as project-level concern)

## Self-Check: PASSED

All created files and commits verified:

- `.github/workflows/ci.yml` — exists
- `vitest.config.ts` — updated with coverage block
- `02-01-SUMMARY.md` — exists
- Commit `300bf75` — Task 1 (vitest coverage config)
- Commit `a4b418b` — Task 2 (CI workflow)
- Commit `7167115` — Plan metadata

---

_Phase: 02-ci-cd-automation_
_Completed: 2026-02-18_
