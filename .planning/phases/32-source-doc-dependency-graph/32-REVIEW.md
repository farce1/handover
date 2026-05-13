---
phase: 32-source-doc-dependency-graph
reviewed: 2026-05-13T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/cli/generate.test.ts
  - src/cli/generate.ts
  - src/cli/index.ts
  - src/renderers/registry.test.ts
  - src/renderers/registry.ts
  - src/renderers/render-00-index.ts
  - src/renderers/types.ts
  - tests/integration/dry-run.test.ts
  - tests/integration/setup.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 32: Code Review Report (Re-review after 32-04 gap closure)

**Reviewed:** 2026-05-13
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Re-review of Phase 32 after gap closure 32-04. The two prior BLOCKERs are confirmed FIXED:

- **CR-01 (bad-ref crash in dry-run):** `runGenerate()` now wraps `getGitChangedFiles` in try/catch on the dry-run branch (`src/cli/generate.ts:158-174`), preserves `exitCode 0`, surfaces a stderr warning, and lets `computeDryRunDecision` fall through to a friendly preview. New integration test (`tests/integration/dry-run.test.ts:138-179`) locks the contract.
- **CR-02 (lying INDEX after deleted prior output):** the render-loop reused-branch now calls `checkPriorOutput()` and falls through to a real render when `priorExists === false` (`src/cli/generate.ts:996-1013`). The helper is exported and unit-tested in `src/cli/generate.test.ts`.

Re-review surfaces **4 new WARNINGs and 4 INFO items**, primarily around incomplete symmetry of the CR-01 fix (the non-dry-run --since path remains vulnerable to the same crash), a misleading dry-run preview when a bad ref is paired with an existing graph, dead code in the test helper, and a stale coverage-exclusion path in `vitest.config.ts`.

No critical issues. No security findings. Plan 32-02's `src/regen/*` files are not in this scope — flagged below as INFO (metadata gap to track).

## Warnings

### WR-01: CR-01 fix is asymmetric — non-dry-run `--since <bad-ref>` still crashes the pipeline

**File:** `src/cli/generate.ts:587`
**Issue:** The dry-run branch (lines 158-174) now catches `getGitChangedFiles` throws, but the non-dry-run static-analysis step on line 587 still calls `await getGitChangedFiles(rootDir, options.since)` without a try/catch. `git-fingerprint.ts:38-41` rethrows on any invalid ref. A user running `handover generate --since not-a-real-ref` (no `--dry-run`) will burn through onboarding/auth/config setup, then have the entire DAG fail at the static-analysis step with an opaque error — exactly the failure mode CR-01 was meant to prevent. The dry-run regression test in `dry-run.test.ts:162` does not cover the non-dry-run path. CR-01 was framed as a `--dry-run` regression because that's where it was observed, but the underlying defect (unhandled throw on bad `--since` ref) remains in the costly path.
**Fix:** Mirror the dry-run guard at the call site:
```ts
let gitResult: GitFingerprintResult;
try {
  gitResult = await getGitChangedFiles(rootDir, options.since);
} catch (err) {
  process.stderr.write(
    `warning: --since "${options.since}" could not be resolved: ${(err as Error).message} — falling back to content-hash mode\n`,
  );
  gitResult = { kind: 'fallback', reason: 'invalid ref' };
}
```
Or push the fix down into `getGitChangedFiles` itself by returning `{ kind: 'fallback', reason: ... }` for invalid refs instead of throwing — that single change repairs both call sites.

### WR-02: Dry-run preview misleadingly claims `since` was applied when ref resolution failed but a graph exists

**File:** `src/cli/generate.ts:158-184` (in conjunction with `src/regen/dep-graph.ts:259-273`, branch 3)
**Issue:** When the user runs `--dry-run --since <bad-ref>` and a `.handover/cache/dep-graph.json` exists, `changedFiles` stays `undefined` (CR-01 catch branch) but `since` is still passed into `computeDryRunDecision`. Because `graph !== null` and `changedFiles === undefined`, branch 3 fires: header reads `Dry-run preview (since: <bad-ref>)`, every doc lands in `wouldExecute` with reason `(no --since filter)`, and `fellBackToFullRegen` is `false`. The stderr warning is the only signal the user has that `--since` did NOT actually filter anything. The CR-01 regression test (`tests/integration/dry-run.test.ts:138-179`) only exercises the no-graph case (branch 1), so this branch is untested.
**Fix:** When the catch block fires, also clear `since` so `computeDryRunDecision` enters the no-since branch cleanly and the preview header / reasons stay honest:
```ts
} catch (err) {
  process.stderr.write(...);
  // Treat as if --since was not given so the preview matches reality
  options = { ...options, since: undefined };
}
```
Or pass an explicit `sinceFailed: true` flag into `computeDryRunDecision` and surface it in the header (`Dry-run preview (since: <ref> — IGNORED: invalid ref)`).

### WR-03: Dry-run path uses bare `process.cwd()` while every other branch uses `resolve(process.cwd())` — minor inconsistency that hides if the caller chdir's via a relative path

**File:** `src/cli/generate.ts:153` vs `src/cli/generate.ts:205, 244, 330`
**Issue:** The dry-run branch sets `const rootDir = process.cwd();` (line 153). Every other branch uses `resolve(process.cwd())` (lines 205, 244, 330). On POSIX `process.cwd()` already returns an absolute path, so this is harmless today. But the implicit contract used by `loadDepGraph(rootDir)` and `getGitChangedFiles(rootDir, ...)` is "absolute root path" — passing a non-resolved value risks divergent behavior if a future caller invokes from a sub-process where cwd was set via a relative path. Easy to make consistent.
**Fix:** Use `resolve(process.cwd())` on line 153 to match the rest of the function:
```ts
const rootDir = resolve(process.cwd());
```

### WR-04: New unit test files violate the documented project rule "Do not add unit tests"

**File:** `src/cli/generate.test.ts` (entire file), `src/renderers/registry.test.ts` (entire file)
**Issue:** `AGENTS.md:53` states explicitly: *"Do not add unit tests — the project uses integration tests only (by design)"*. `src/cli/generate.test.ts` was added by Plan 32-04 and `src/renderers/registry.test.ts` was added/expanded by Plan 32-01. The header docstring of `generate.test.ts` notes the planner authorized the unit test as a one-off, but there is no corresponding update to `AGENTS.md` carving out an exception, no marker linking the file back to the planner authorization, and no policy on when future contributors may add similar tests. The convention now reads as "no unit tests except when an unspecified planner says so." Either the rule should be amended or these files should be removed/converted.
**Fix:** Either (a) update `AGENTS.md:53` to add a documented exception (e.g., "exception: regression-locking unit tests for pure helpers extracted from CLI files are permitted; mark with `// regression-test:` comment"), or (b) re-home the regression as an integration test that mocks the LLM provider (the planner's stated reason for going unit-only — "integration stack does not stub the LLM provider" — is fixable infrastructure, not an immutable constraint), or (c) at minimum add a `// LINT-EXCEPTION:` marker pointing back to the 32-04 plan.

## Info

### IN-01: Stale coverage exclusion path in `vitest.config.ts` (the file doesn't exist under that name)

**File:** `vitest.config.ts:90`
**Issue:** Line 90 lists `'src/renderers/renderer-template.ts'` as a coverage exclusion, but the actual file is `src/renderers/render-template.ts` (no second `er`). The path therefore matches nothing. The file is still excluded from coverage by the broader `'src/renderers/render-*.ts'` glob on line 84, so the practical effect is zero — but the line is dead config and likely reflects a rename that was never followed up.
**Fix:** Delete line 90 (and its preceding comment on line 89), or rename to `'src/renderers/render-template.ts'` for clarity. Since the wildcard above already covers it, deletion is cleaner.

### IN-02: `simulateReusedBranch` test helper duplicates production logic instead of importing it

**File:** `src/cli/generate.test.ts:78-88`
**Issue:** The "branch shape" describe block writes a 10-line helper that hand-rolls the same early-return shape used by `src/cli/generate.ts:996-1013`. If the production branch ever drifts (e.g. adds a `reason` field, or changes `reused: true` to `status: 'reused'`), the test still passes because it tests a hand-written copy of the contract, not the real code. The unit test for `checkPriorOutput` (lines 27-60) is sufficient on its own; the simulated branch is duplicative theatre.
**Fix:** Either (a) drop the `simulateReusedBranch` describe block and rely on `checkPriorOutput` unit tests + the integration test in `tests/integration/dry-run.test.ts`, or (b) extract the actual branch into a small helper in `generate.ts` (e.g. `buildReusedPayload(doc, outputDir, docStart)`) and import it from the test so the contract is tested against the real code, not a copy.

### IN-03: Plan 32-02 source files (`src/regen/*`) are not in this re-review's scope due to a SUMMARY.md metadata gap

**File:** `src/regen/dep-graph.ts`, `src/regen/dep-graph.test.ts` (not in `files_reviewed_list`)
**Issue:** The phase context notes that Plan 32-02's SUMMARY.md frontmatter did not declare its created/modified files, so these source files were never threaded into this review's scope. `src/regen/dep-graph.ts` is the load-bearing module behind `--dry-run` and `--since` — it should have been reviewed as part of Phase 32, not implicitly skipped because of a metadata omission. While I did spot-check it during this review (referenced for branch 3 analysis in WR-02), no full bug pass was performed against it under these scope rules.
**Fix:** Process-level: backfill 32-02-SUMMARY.md's frontmatter with `created: [src/regen/dep-graph.ts, src/regen/dep-graph.test.ts]` so future re-reviews include them. Code-level: schedule a follow-up code review pass over `src/regen/*` independent of Phase 32 closure.

### IN-04: `cli/index.ts` adds top-level `--dry-run` and `--json` flags but the default action (no command) does not register them

**File:** `src/cli/index.ts:39, 144-150`
**Issue:** `--dry-run` and `--json` are registered on the `generate` subcommand only (lines 38-39). The default-action block (lines 144-150) only forwards `--provider`, `--model`, `--audience`, `-v`. A user running bare `handover --dry-run` (no `generate`) will be told by Commander that `--dry-run` is unknown — but `handover generate --dry-run` works. This is consistent with how `--since`, `--only`, `--static-only`, `--no-cache`, and `--stream` are also missing from the default action, so it is not a regression — but the default-action block has clearly drifted from the `generate` subcommand's option set and is now confusing/inconsistent.
**Fix:** Either (a) remove the default-action block entirely and require users to type `handover generate ...` explicitly (clearer mental model), or (b) keep the default action but mirror the full option set from the `generate` subcommand, or (c) refactor the option list into a helper applied to both registrations so they cannot drift.

---

_Reviewed: 2026-05-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
