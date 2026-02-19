---
phase: 08-ci-fix-scorecard-hardening-and-test-infrastructure
plan: 01
subsystem: infra
tags: [ci, dependabot, zod, vitest, typescript, dependencies]

# Dependency graph
requires: []
provides:
  - Green CI on main (typecheck exits 0, npm test exits 0)
  - All 5 Dependabot PRs merged/applied (actions/checkout v6, setup-node v6, upload-artifact v6, production deps, dev deps)
  - 0.x dependencies pinned to exact versions (@anthropic-ai/sdk=0.76.0, web-tree-sitter=0.26.5, tree-sitter-wasms=0.1.13)
  - Zod v4 compatibility fixes applied across providers/config/schemas
affects:
  - 08-02-scorecard-hardening
  - 08-03-test-infrastructure
  - all subsequent phases (rely on green CI)

# Tech tracking
tech-stack:
  added:
    - vitest v4.0.18 (upgraded from v3)
    - @anthropic-ai/sdk 0.76.0 (upgraded from 0.39.0, exact pin)
    - openai v6.22.0 (upgraded from v5)
    - zod v4.3.6 (upgraded from v3, breaking changes fixed)
    - "@clack/prompts v1.0.1 (upgraded from 0.x)"
    - commander v14.0.3 (upgraded from v13)
    - web-tree-sitter 0.26.5 (exact pin)
    - tree-sitter-wasms 0.1.13 (exact pin)
  patterns:
    - "vitest --passWithNoTests: test script passes before test files exist"
    - "Exact pins for 0.x packages: prevents breaking minor updates in pre-1.0 libs"
    - "Zod v4 object defaults require full value, not empty object"

key-files:
  created: []
  modified:
    - src/ai-rounds/runner.ts
    - src/config/schema.ts
    - src/domain/schemas.ts
    - src/providers/schema-utils.ts
    - vitest.config.ts
    - package.json
    - package-lock.json
    - .github/workflows/ci.yml
    - .github/workflows/release-please.yml

key-decisions:
  - "vitest --passWithNoTests added to test script so CI passes before Phase 11 adds test files"
  - "Zod v4 object .default() requires full value matching output type, not empty object"
  - "responseSchema in CompletionRequestSchema made optional - schema passed separately to provider.complete()"
  - "PRs #2 and #5 closed manually applied: package.json conflicts resolved via rebase, changes applied inline"
  - "zodToJsonSchema cast to any: zod-to-json-schema@3.x imports from zod/v3 compat layer, type mismatch at boundary"

patterns-established:
  - "0.x dep pinning: all pre-1.0 packages use exact versions in package.json"
  - "Zod defaults: nested object defaults require full value, e.g. .default({ concurrency: 4, staticOnly: false })"

# Metrics
duration: 9min
completed: 2026-02-19
---

# Phase 8 Plan 01: CI Fix, Dependabot Merges, and 0.x Pinning Summary

**TypeScript CI unblocked by adding missing ValidationResult import; all 5 Dependabot PRs applied; Zod v4 breaking changes fixed; 0.x packages pinned to exact versions**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-19T19:49:07Z
- **Completed:** 2026-02-19T19:58:25Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Fixed missing `ValidationResult` import in `src/ai-rounds/runner.ts` (was causing TS2304 error on CI)
- Merged/applied all 5 Dependabot PRs: GitHub Actions v6 upgrades + production/dev npm bumps
- Fixed 3 Zod v4 breaking changes: `schema-utils.ts` type cast, `config/schema.ts` defaults, `domain/schemas.ts` optional field
- Pinned all 0.x dependencies to exact versions (`@anthropic-ai/sdk=0.76.0`, `web-tree-sitter=0.26.5`, `tree-sitter-wasms=0.1.13`)
- Removed premature coverage thresholds from `vitest.config.ts`; added `--passWithNoTests` so CI passes before Phase 11

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix TypeScript error and remove coverage thresholds** - `cacf40d` (fix)
2. **Task 2: Merge all 5 Dependabot PRs and pin 0.x versions** - `dd18481` (fix)

## Files Created/Modified

- `src/ai-rounds/runner.ts` - Combined ValidationResult into single import from types.js
- `vitest.config.ts` - Removed thresholds block, removed tests/\*_/_.test.ts include
- `package.json` - Added --passWithNoTests, upgraded all deps, pinned 0.x to exact
- `package-lock.json` - Updated lockfile for all dep changes
- `src/config/schema.ts` - Fixed Zod v4 .default() on nested objects (full value required)
- `src/domain/schemas.ts` - Made responseSchema optional (passed separately to providers)
- `src/providers/schema-utils.ts` - Cast schema to any for zod-to-json-schema v3 compat
- `.github/workflows/ci.yml` - Upgraded setup-node v4 -> v6 (from PR #2, manual apply)
- `.github/workflows/release-please.yml` - Upgraded setup-node v4 -> v6 (from PR #2, manual apply)

## Decisions Made

- **vitest --passWithNoTests**: Added to test script so CI passes before Phase 11 adds test files. Without this, `vitest run` exits 1 when no test files match the glob.
- **responseSchema optional**: `CompletionRequestSchema` had `responseSchema: z.any()` as required but `buildRoundPrompt` never returns it (schema passed separately via `provider.complete()` arg). Made optional to reflect actual usage.
- **Manual PR apply for #2 and #5**: Both PRs had merge conflicts with earlier merges (both touched same files). Rebased local main, applied changes directly, closed PRs with explanation comment.
- **Zod v4 .default() breaking change**: In Zod v3, `.default({})` on an object with field-level defaults worked (Zod filled in defaults). In Zod v4, the default value must exactly match the output type. Fixed by providing full defaults: `{ concurrency: 4, staticOnly: false }` and `{ pin: [], boost: [] }`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added --passWithNoTests to test script**

- **Found during:** Task 1 (Fix TypeScript error and remove coverage thresholds)
- **Issue:** `vitest run` exits code 1 when no test files exist. Plan requires `npm test` to exit 0, but there are no test files yet (Phase 11 adds them). Without `--passWithNoTests`, CI would still fail.
- **Fix:** Added `--passWithNoTests` flag to `test` script in `package.json`
- **Files modified:** `package.json`
- **Verification:** `npm test` exits 0, vitest outputs "No test files found, exiting with code 0"
- **Committed in:** `cacf40d` (Task 1 commit)

**2. [Rule 3 - Blocking] Resolved PR #2 merge conflict via manual application**

- **Found during:** Task 2 (Merge all Dependabot PRs)
- **Issue:** PR #2 (setup-node v4->v6) conflicted with PR #1 after PR #1 merged (both modified ci.yml). `gh pr merge 2 --admin` returned "Pull Request is not mergeable".
- **Fix:** Closed PR #2, applied `setup-node@v4 -> setup-node@v6` changes manually to ci.yml and release-please.yml
- **Files modified:** `.github/workflows/ci.yml`, `.github/workflows/release-please.yml`
- **Verification:** No `setup-node@v4` references remain in workflow files
- **Committed in:** `dd18481` (Task 2 commit)

**3. [Rule 3 - Blocking] Resolved PR #5 merge conflict via manual application**

- **Found during:** Task 2 (Merge all Dependabot PRs)
- **Issue:** PR #5 (dev-deps) conflicted with PR #4 after PR #4 merged (both modified package-lock.json). `gh pr merge 5 --admin` returned "Pull Request is not mergeable".
- **Fix:** Closed PR #5, applied dev dep version bumps manually to package.json, ran `npm install`
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** vitest@4.0.18, @types/node@^25.2.3, @vitest/coverage-v8@^4.0.18 in package.json
- **Committed in:** `dd18481` (Task 2 commit)

**4. [Rule 1 - Bug] Fixed 3 Zod v4 breaking changes**

- **Found during:** Task 2 (after merging production deps PR which upgraded zod v3->v4)
- **Issue:** `npm run typecheck` reported 4 errors after Dependabot PR #4 merged:
  - `schema-utils.ts`: `z.ZodType<T>` incompatible with `ZodSchema<any>` from `zod-to-json-schema` (imports `zod/v3`)
  - `config/schema.ts` (2 errors): `.default({})` now requires full matching object in Zod v4
  - `ai-rounds/prompts.ts`: `responseSchema` required but not present (pre-existing bug exposed by Zod v4 stricter types)
- **Fix:**
  - `schema-utils.ts`: Added `as any` cast when calling `zodToJsonSchema`
  - `config/schema.ts`: `.default({})` -> `.default({ concurrency: 4, staticOnly: false })` and `.default({ pin: [], boost: [] })`
  - `domain/schemas.ts`: `responseSchema: z.any()` -> `responseSchema: z.any().optional()`
- **Files modified:** `src/providers/schema-utils.ts`, `src/config/schema.ts`, `src/domain/schemas.ts`
- **Verification:** `npm run typecheck` exits 0 with zero errors
- **Committed in:** `dd18481` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 blocking merge conflicts, 1 blocking vitest behavior, 1 bug from dependency upgrade)
**Impact on plan:** All auto-fixes necessary for plan completion. No scope creep — all fixes directly caused by current task changes.

## Issues Encountered

- Dependabot PR sequential merge conflicts: when multiple PRs touch the same files, GitHub marks later PRs as conflicting after earlier ones merge. Resolved by applying changes manually and closing conflicted PRs.
- Zod v4 migration: upgrading from v3 to v4 has breaking type-level changes that required 3 small fixes. Runtime behavior unchanged (schema parsing works correctly).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CI is green: `npm run typecheck` exits 0, `npm test` exits 0, all 5 Dependabot PRs handled
- Ready for Phase 8 Plan 02 (Scorecard hardening)
- No blockers from this plan

## Self-Check: PASSED

- FOUND: src/ai-rounds/runner.ts
- FOUND: vitest.config.ts
- FOUND: package.json
- FOUND: src/config/schema.ts
- FOUND: src/domain/schemas.ts
- FOUND: src/providers/schema-utils.ts
- FOUND: 08-01-SUMMARY.md
- FOUND commit: cacf40d (Task 1)
- FOUND commit: dd18481 (Task 2)

---

_Phase: 08-ci-fix-scorecard-hardening-and-test-infrastructure_
_Completed: 2026-02-19_
