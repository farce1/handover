---
phase: 08-ci-fix-scorecard-hardening-and-test-infrastructure
verified: 2026-02-19T21:00:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 8: CI Fix, Scorecard Hardening, and Test Infrastructure Verification Report

**Phase Goal:** CI passes on main, OpenSSF Scorecard maximized, and test infrastructure foundation is correct before any test files are authored
**Verified:** 2026-02-19T21:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                    | Status   | Evidence                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `npm run typecheck` passes on main with zero errors                                                      | VERIFIED | `tsc --noEmit` exits 0, no errors printed                                                                                                                            |
| 2   | `npm test` exits 0 on main (no coverage threshold failures)                                              | VERIFIED | vitest outputs "No test files found, exiting with code 0"                                                                                                            |
| 3   | All 5 Dependabot PRs are merged and closed                                                               | VERIFIED | `gh pr list --author 'dependabot[bot]' --state open` returns no results                                                                                              |
| 4   | All 0.x dependencies in package.json use exact versions (no `^` or `~` prefix)                           | VERIFIED | `@anthropic-ai/sdk=0.76.0`, `web-tree-sitter=0.26.5`, `tree-sitter-wasms=0.1.13` — all exact; `@clack/prompts` bumped to `^1.0.1` (no longer 0.x)                    |
| 5   | All 4 existing workflows have `permissions: read-all` at the top level                                   | VERIFIED | ci.yml, codeql.yml, release-please.yml, scorecard.yml all have `permissions: read-all` on line 3                                                                     |
| 6   | All action `uses:` references across all workflows are pinned to 40-character SHA hashes                 | VERIFIED | `grep -E 'uses:.*@v[0-9]' .github/workflows/*.yml` returns no output                                                                                                 |
| 7   | Branch protection is enabled on main requiring 1 reviewer, stale review dismissal, and code owner review | VERIFIED | API returns: required_reviewers=1, dismiss_stale=true, code_owner_reviews=true                                                                                       |
| 8   | CODEOWNERS file exists with `* @farce1` and `.github/ @farce1` entries                                   | VERIFIED | `.github/CODEOWNERS` contains exactly those two lines                                                                                                                |
| 9   | Private vulnerability reporting is enabled on the repository                                             | VERIFIED | `gh api repos/farce1/handover/private-vulnerability-reporting` returns `{"enabled":true}`                                                                            |
| 10  | An automerge workflow exists for Dependabot patch/minor PRs                                              | VERIFIED | `.github/workflows/automerge.yml` exists with `dependabot/fetch-metadata` SHA-pinned reference                                                                       |
| 11  | `memfs` and `vitest-mock-extended` are installed as dev dependencies                                     | VERIFIED | Both present in `devDependencies` of `package.json`                                                                                                                  |
| 12  | Vitest coverage excludes WASM-dependent files, type-only files, CLI entry point, and config constants    | VERIFIED | `vitest.config.ts` excludes `src/parsing/**`, `src/**/types.ts`, `src/domain/schemas.ts`, `src/cli/index.ts`, `src/grammars/downloader.ts`, `src/config/defaults.ts` |
| 13  | `createMockProvider()` factory exists and satisfies the `LLMProvider` interface at compile time          | VERIFIED | `src/providers/__mocks__/index.ts` exports `createMockProvider()`; `npm run typecheck` passes                                                                        |
| 14  | `vi.hoisted()` pattern is documented as project convention                                               | VERIFIED | Documented in JSDoc of `src/providers/__mocks__/index.ts` lines 12-24                                                                                                |

**Score:** 14/14 truths verified

---

## Required Artifacts

| Artifact                               | Expected                                                     | Status   | Details                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/ai-rounds/runner.ts`              | Missing ValidationResult import fixed                        | VERIFIED | Line 5: `import type { RoundExecutionResult, ValidationResult } from './types.js'`                                                                                       |
| `package.json`                         | Exact-pinned 0.x deps, --passWithNoTests, memfs              | VERIFIED | `@anthropic-ai/sdk=0.76.0`, `web-tree-sitter=0.26.5`, `tree-sitter-wasms=0.1.13`; test script has `--passWithNoTests`; memfs and vitest-mock-extended in devDependencies |
| `vitest.config.ts`                     | Coverage config with WASM/type-only exclusions               | VERIFIED | All 6 exclusion categories present; thresholds absent                                                                                                                    |
| `src/providers/__mocks__/index.ts`     | Typed mock LLMProvider factory                               | VERIFIED | Exports `createMockProvider()`, imports `LLMProvider` from `../base.js`, vi.hoisted() documented                                                                         |
| `.github/CODEOWNERS`                   | Code ownership for Scorecard Branch-Protection               | VERIFIED | `* @farce1` and `.github/ @farce1`                                                                                                                                       |
| `.github/workflows/automerge.yml`      | Auto-merge workflow for Dependabot patch/minor               | VERIFIED | `dependabot/fetch-metadata@21025c705c08248db411dc16f3619e6b5f9ea21a` SHA-pinned                                                                                          |
| `.github/workflows/ci.yml`             | CI workflow with read-all permissions and SHA-pinned actions | VERIFIED | `permissions: read-all` at top; all 5 uses: lines SHA-pinned; no `@v*` references                                                                                        |
| `.github/workflows/codeql.yml`         | CodeQL workflow with restructured permissions                | VERIFIED | `permissions: read-all` at top; `security-events: write` moved to analyze job                                                                                            |
| `.github/workflows/release-please.yml` | Release workflow with restructured permissions               | VERIFIED | `permissions: read-all` at top; job-level `contents: write` + `pull-requests: write`                                                                                     |
| `.github/workflows/scorecard.yml`      | Scorecard workflow with top-level read-all                   | VERIFIED | `permissions: read-all` at top; 4 SHA-pinned action references                                                                                                           |

---

## Key Link Verification

| From                               | To                              | Via                        | Status   | Details                                                                                        |
| ---------------------------------- | ------------------------------- | -------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `src/ai-rounds/runner.ts`          | `src/ai-rounds/types.ts`        | type import                | VERIFIED | `import type { RoundExecutionResult, ValidationResult } from './types.js'`                     |
| `src/providers/__mocks__/index.ts` | `src/providers/base.ts`         | type import of LLMProvider | VERIFIED | `import type { LLMProvider } from '../base.js'`; factory return type declared as `LLMProvider` |
| `vitest.config.ts`                 | coverage exclusions             | exclude patterns           | VERIFIED | `src/parsing/**` and 5 other exclusions present in coverage.exclude                            |
| `.github/CODEOWNERS`               | branch protection               | require_code_owner_reviews | VERIFIED | Branch protection API confirms `require_code_owner_reviews=true`                               |
| `.github/workflows/ci.yml`         | branch protection status checks | Quality Gate job names     | VERIFIED | Branch protection contexts match: `Quality Gate (Node 20)` and `Quality Gate (Node 22)`        |

---

## Requirements Coverage

All phase requirements from the ROADMAP are satisfied. The three sub-goals of phase 8 are fully delivered:

| Requirement                               | Status    | Notes                                                                                       |
| ----------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| CI passes on main                         | SATISFIED | typecheck exits 0, npm test exits 0, --passWithNoTests in place                             |
| OpenSSF Scorecard maximized               | SATISFIED | Token-Permissions, Pinned-Dependencies, Branch-Protection all hardened                      |
| Test infrastructure foundation is correct | SATISFIED | memfs + vitest-mock-extended installed, mock factory exists, coverage exclusions configured |

---

## Anti-Patterns Found

No blockers detected. Scanned all modified files.

| File                               | Pattern Checked                    | Result | Notes                                                        |
| ---------------------------------- | ---------------------------------- | ------ | ------------------------------------------------------------ |
| `src/ai-rounds/runner.ts`          | Placeholder/stub imports           | Clean  | Single combined import, no TODOs                             |
| `vitest.config.ts`                 | Coverage thresholds present        | Clean  | Thresholds absent by design; comment explains rationale      |
| `src/providers/__mocks__/index.ts` | Empty/unimplemented factory        | Clean  | Substantive vi.fn() defaults; model/duration fields included |
| `.github/workflows/*.yml`          | Mutable `@v*` action references    | Clean  | All 16+ references SHA-pinned                                |
| `package.json`                     | Unpinned 0.x deps (`^0.` or `~0.`) | Clean  | No remaining 0.x unpinned versions                           |

---

## Human Verification Required

### 1. OpenSSF Scorecard Score

**Test:** Trigger the Scorecard workflow by pushing to main, then check the Security tab in the GitHub repository for the updated Scorecard score.
**Expected:** Token-Permissions, Pinned-Dependencies, and Branch-Protection checks all pass; overall score >= 7/10.
**Why human:** Scorecard runs as a scheduled/push-triggered GitHub Actions job. The actual score is only visible after a successful workflow run on GitHub's hosted runners.

### 2. Branch Protection Blocking Force-Push

**Test:** Attempt `git push --force origin main` from a local clone.
**Expected:** GitHub rejects the push with "remote: error: GH006: Protected branch update failed".
**Why human:** `allow_force_pushes=false` was set via API but can only be confirmed by attempting an actual push.

### 3. Dependabot Auto-merge on Next PR

**Test:** Wait for the next Dependabot patch/minor PR to open, confirm it gets auto-merged via the automerge workflow.
**Expected:** Dependabot PR merges automatically without manual approval.
**Why human:** Requires a live Dependabot PR to trigger; cannot be simulated with grep.

---

## Commit Verification

All documented commits exist on main:

| Commit  | Description                                                                           |
| ------- | ------------------------------------------------------------------------------------- |
| cacf40d | fix(ci): add missing ValidationResult import and remove premature coverage thresholds |
| dd18481 | fix(deps): merge Dependabot upgrades and pin 0.x to exact versions                    |
| b438d00 | chore(08-02): pin actions to SHA, set workflow permissions, CODEOWNERS and automerge  |
| f1f9ea5 | chore(08-03): install memfs and vitest-mock-extended, update coverage config          |
| fa72046 | feat(08-03): create createMockProvider() typed mock factory                           |

---

## Summary

Phase 8 achieved its goal. All three sub-goals are fully delivered:

**CI passes on main:** The `ValidationResult` import that was causing TS2304 is fixed. The test script uses `--passWithNoTests` so vitest exits 0 when no test files exist. All 5 Dependabot PRs are handled (3 merged, 2 manually applied due to merge conflicts). Zod v4 breaking changes were resolved across 3 files. TypeScript compiles clean.

**OpenSSF Scorecard maximized:** All 5 workflows (ci, codeql, release-please, scorecard, automerge) have `permissions: read-all` at workflow level with write scopes pushed to individual jobs. All 16+ action references are SHA-pinned with version comments. CODEOWNERS maps all files to `@farce1`. Branch protection requires 1 reviewer, dismisses stale reviews, requires code owner review, and mandates the Quality Gate status checks. Private vulnerability reporting is enabled. Repository auto-merge is enabled.

**Test infrastructure foundation is correct:** `memfs` and `vitest-mock-extended` are installed. `vitest.config.ts` excludes WASM-dependent files, type-only files, the CLI entry point, Zod schema declarations, and config constants from coverage. `createMockProvider()` at `src/providers/__mocks__/index.ts` satisfies the `LLMProvider` interface at compile time using `as unknown as TypedFn` casts. The `vi.hoisted()` convention is documented in JSDoc. No test files were authored — this phase correctly limits itself to infrastructure only.

---

_Verified: 2026-02-19T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
