---
phase: 32-source-doc-dependency-graph
plan: 04
subsystem: cli
tags: [cli, generate, dry-run, dep-graph, gap-closure, regression-tests, phase-32]

# Dependency graph
requires:
  - phase: 32-source-doc-dependency-graph
    provides: dry-run early-exit branch (32-02), --since render-loop reused-branch (32-03), dep-graph integration (32-01)
provides:
  - "CR-01 closed: --dry-run --since <bad-ref> exits 0 with friendly preview + stderr warning"
  - "WR-01 closed: dry-run branch surfaces 'fallback' kind reason via '--since ignored: <reason>'"
  - "CR-02 closed: render-loop reused-branch falls through when prior on-disk doc missing (no more lying INDEX)"
  - "checkPriorOutput helper (exported from src/cli/generate.ts) for unit-level regression coverage of the reused-branch"
  - "tests/integration/setup.ts: runCLI now captures stderr on success path (exit 0), enabling assertions about warnings on the happy path"
  - "Two new regression tests (1 integration, 4 unit) — total suite 517 passing (was 512)"
affects: [phase-33-telemetry, phase-36-action, future-32-verification-rerun]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Helper extraction for testability: small pure helpers exported from large CLI handlers so individual branches can be regression-tested without standing up the full pipeline"
    - "spawnSync over execFileSync in test runners when stderr-on-success assertions are required"

key-files:
  created:
    - src/cli/generate.test.ts
  modified:
    - src/cli/generate.ts
    - tests/integration/dry-run.test.ts
    - tests/integration/setup.ts

key-decisions:
  - "Path B (unit test) chosen for CR-02 over Path A (integration test) — no LLM mock seam exists in tests/integration/, all integration tests run --dry-run only; standing up an LLM mock for one regression would expand scope beyond gap-closure boundary"
  - "Extracted checkPriorOutput helper rather than inlining the priorExists guard — enables direct regression testing without rebuilding the Promise.allSettled render closure"
  - "Updated runCLI to use spawnSync (instead of execFileSync) so stderr is captured on the exit-0 success path — required for CR-01's contract (exit 0 + stderr warning); legacy callers continue to work because stderr/exitCode shape is preserved"

patterns-established:
  - "Dry-run branch error handling: getGitChangedFiles wrapped in try/catch, both 'fallback' kind and thrown errors surface to stderr without breaking the exit-0 contract"
  - "Render-loop reused-branch: priorExists is now a hard gate before reused:true; missing prior output forces fall-through to normal render so INDEX links always resolve"

requirements-completed: [REGEN-03, REGEN-04]

# Metrics
duration: 5min
completed: 2026-05-13
---

# Phase 32 Plan 04: Gap Closure (CR-01 dry-run try/catch + CR-02 priorExists guard) Summary

**Two narrow correctness fixes in src/cli/generate.ts: dry-run --since now degrades gracefully on bad refs (exit 0 + warning), and the render-loop reused-branch refuses to claim 'reused' when the prior on-disk doc is missing — restoring the SC-2 contract and eliminating the "lying INDEX" regression.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-13T11:29:34Z
- **Completed:** 2026-05-13T11:34:46Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files modified:** 3 (1 source, 2 test); 1 created
- **Tests:** 5 passing → 517 passing (+5: 1 integration regression for CR-01, 4 unit for CR-02 helper + branch shape)

## Accomplishments

- **CR-01 closed (BLOCKER → fixed):** `handover generate --dry-run --since <bad-ref>` in a git-initialized repo now returns exit 0 with the standard 14-row preview ending in `Zero LLM calls made.`, and emits `warning: --since "<bad-ref>" could not be resolved: <reason>` to stderr. Verified end-to-end via the live `node dist/index.js generate --dry-run --since some-invalid-ref` smoke gate from the plan's acceptance criteria — exit 0 confirmed, stderr names the bad ref.
- **WR-01 closed (Warning → fixed as follow-on):** dry-run branch now also surfaces the 'fallback' discriminant ('Not a git repo' / shallow / detached) via `--since ignored: <reason>` to stderr, mirroring the non-dry-run path.
- **CR-02 closed (BLOCKER → fixed):** render-loop reused-branch (`Promise.allSettled` inner closure) now gates its early-return on `if (priorExists)`. When `stat()` fails on the prior output (user manually deleted a doc), execution falls through past the early-return block and the existing `const content = doc.render(ctx);` line runs normally — producing a non-`'reused'` `DocumentStatus` so the INDEX link always resolves.
- **Test infrastructure improvement (Rule 2 deviation):** `runCLI` in `tests/integration/setup.ts` now uses `spawnSync` instead of `execFileSync` so stderr is captured on the exit-0 success path; previously the helper hid stderr unless the process exited non-zero, which prevented assertions about warnings on the happy path.

## Task Commits

Each task was TDD (RED → GREEN), committed atomically:

1. **Task 1 RED — CR-01 regression test:** `4439a28` (test)
2. **Task 1 GREEN — CR-01 + WR-01 fix + runCLI stderr capture:** `b796138` (fix)
3. **Task 2 RED — CR-02 regression test:** `d555427` (test)
4. **Task 2 GREEN — CR-02 priorExists guard + checkPriorOutput helper:** `0d00e52` (fix)

_(Plan-level metadata commit (SUMMARY.md) committed separately by execute-plan workflow.)_

## Files Created/Modified

- `src/cli/generate.ts` (modified) — Two narrow edits:
  - Added `export async function checkPriorOutput(outputDir, filename)` helper (lines 85-103) wrapping the `stat()` call so the reused-branch can be regression-tested in isolation.
  - Dry-run early-exit branch (lines 132-159 post-fix): wrapped `getGitChangedFiles` in try/catch; the catch emits `warning: --since "${ref}" could not be resolved: ${msg}` and the 'fallback' arm emits `--since ignored: ${reason}` — both leave `changedFiles` undefined so `computeDryRunDecision` degrades gracefully.
  - Render-loop reused-branch (lines 989-1013 post-fix): replaced inline `let lastRenderedAt; try { stat() } catch {}` with `const { exists: priorExists, lastRenderedAt } = await checkPriorOutput(...)`; the `return { ..., reused: true, ... }` block is now nested inside `if (priorExists)`, with a CR-02 fix comment explaining the fall-through case.
- `src/cli/generate.test.ts` (created, 113 lines) — 5 unit tests:
  - 3 covering `checkPriorOutput` contract (exists:true with mtime, exists:false on ENOENT, exists:false on bad path).
  - 2 covering the reused-branch shape (reused:true when prior exists, reused:false when prior missing).
  - Uses `vi.mock('node:fs/promises')` + memfs (same pattern as the existing `src/cli/monorepo.test.ts`).
- `tests/integration/dry-run.test.ts` (modified) — Added `describe('handover generate --dry-run --since <bad-ref> (CR-01 regression)', ...)` block with 1 test asserting exit 0, preview text in stdout, and the bad-ref name in stderr.
- `tests/integration/setup.ts` (modified) — `runCLI` switched from `execFileSync` to `spawnSync` so stderr is captured on success (exit 0). Return shape (`stdout`/`stderr`/`exitCode`) is unchanged for legacy callers.

## Decisions Made

- **Path B (unit test) for CR-02 over Path A (integration test).** Reconnaissance via `grep -rn "vi.mock" tests/integration/ src/ai-rounds/ src/providers/` returned only 1 hit (provider mock factory documentation), confirming no LLM mock seam exists in `tests/integration/`. Building one for a single regression test would expand scope beyond the canonical gap-closure boundary, which the plan explicitly authorizes downscoping in this case.
- **checkPriorOutput helper extraction** rather than testing the closure inline. The helper is small (3 lines of logic), pure, and stat() is the entire branch's I/O surface — extracting it keeps the production path simple while making the regression unambiguously testable.
- **Update runCLI to use spawnSync (Rule 2 deviation).** CR-01's contract is "exit 0 + stderr warning"; the prior `runCLI` only surfaced stderr from the `execFileSync` thrown-error path (i.e., non-zero exit). To assert on a warning emitted on the success path, `runCLI` had to be updated. Return shape preserved so the change is transparent to all 4 existing dry-run tests (and any other integration test that consumes `runCLI`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical Test Infrastructure] runCLI did not capture stderr on exit-0 path**
- **Found during:** Task 1 (CR-01 GREEN — first run of the new regression test after the production fix landed)
- **Issue:** Test asserted `expect(result.stderr).toMatch(/--since/)` but `result.stderr` was an empty string. Root cause: `runCLI` used `execFileSync`, which only exposes stderr through the thrown error object (i.e., only on non-zero exit). On exit 0 the helper returned `{ stdout, stderr: '', exitCode: 0 }` unconditionally. Without capturing stderr on the success path, assertions about CR-01's contract (exit 0 + warning text) are impossible.
- **Fix:** Switched `runCLI` to `spawnSync`, which returns both `stdout` and `stderr` regardless of exit code. Preserved the existing return shape so the 4 pre-existing dry-run tests continue to pass without modification.
- **Files modified:** `tests/integration/setup.ts`
- **Verification:** All 5 dry-run integration tests pass (4 pre-existing + 1 new); full suite 517/517 pass; typecheck clean.
- **Committed in:** `b796138` (bundled with the CR-01 fix because the test infra change is what unblocked the GREEN gate)

---

**Total deviations:** 1 auto-fixed (Rule 2 — test infra missing critical functionality)
**Impact on plan:** Necessary for verifying CR-01's contract; zero scope creep (single 7-line change to runCLI; return shape unchanged; legacy callers transparent). No new dependencies, no new modules.

## Issues Encountered

- **Grep gate 2 heuristic mismatch (cosmetic, not a real failure):** The plan's acceptance criteria included `grep -B2 "reused: true" src/cli/generate.ts | grep -c "priorExists"` >= 1. The actual implementation has `priorExists` 5 lines above `reused: true,` (separated by `return { doc, content: '', skipped: false, ...`), so `-B2` returns 0; widening to `-B6` returns 1. The structural intent of the gate (reused:true is now nested inside `if (priorExists)`) is fully met and visually verified at lines 996-1008 — the grep window was just too narrow for the multi-line return shape. No code change needed.

## Verification Gates

All phase-level verification gates from `<verification>` in 32-04-PLAN pass:

1. **CR-01 closure** — Live smoke gate: `node dist/index.js generate --dry-run --since some-invalid-ref` in `/tmp/gap-check` (2-commit fixture) returns exit 0; stdout contains `Zero LLM calls made.`; stderr contains `some-invalid-ref`. PASS.
2. **CR-02 closure** — 4 new unit tests in `src/cli/generate.test.ts` all pass; the `falls through (reused:false) when prior output is missing` test directly asserts the regression is fixed. PASS.
3. **Test suite green** — `npm test` exit 0, **517 passing** (was 512; +5 new). PASS.
4. **Typecheck green** — `npm run typecheck` exit 0. PASS.
5. **Build green** — `npm run build` exit 0. PASS.
6. **No 32-01/02/03 surface regressions** — `git diff --stat HEAD~4..HEAD -- src/` shows changes ONLY in `src/cli/generate.ts` (+ new co-located test). No changes to `src/renderers/registry.ts`, `src/renderers/render-00-index.ts`, `src/regen/dep-graph.ts`, or `src/renderers/types.ts`. PASS.
7. **Re-verification eligibility** — Recommend follow-up `/gsd-verify-phase 32` re-run; the SC-2 partial-fail and CR-01/CR-02 BLOCKERs from `32-VERIFICATION.md`/`32-REVIEW.md` are now closed.

## Deferred Quality Items (Confirmed Still Deferred)

These items remain INTENTIONALLY DEFERRED per the gap-closure scope statement in `32-04-PLAN.md` `<scope_note>`. They are quality follow-ups, not BLOCKER-class defects, and folding them into this plan would expand the surface beyond the canonical gap-closure boundary:

- **WR-02** — Non-exhaustive `statusLabel` switch in `render-00-index.ts` (different file, different concern).
- **WR-03** — Row numbering in INDEX table (cosmetic).
- **WR-04, WR-05** — Lower-priority warnings from 32-REVIEW.md.
- **IN-01..IN-04** — Informational items from 32-REVIEW.md.

## Self-Check: PASSED

Verified the following claims hold post-commit:

- `src/cli/generate.test.ts` exists: FOUND
- `src/cli/generate.ts` modifications present: FOUND (`grep -c "priorExists"` = 2; `grep -c "checkPriorOutput"` = 2; `grep -c "could not be resolved"` = 1; `grep -c "CR-02"` = 2)
- `tests/integration/dry-run.test.ts` regression block: FOUND (`grep -c "CR-01 regression"` = 1)
- `tests/integration/setup.ts` runCLI change: FOUND (uses `spawnSync`)
- All 4 task commits in `git log`:
  - `4439a28` test(32-04): add CR-01 regression test for --dry-run --since <bad-ref> — FOUND
  - `b796138` fix(32-04): wrap getGitChangedFiles in dry-run branch try/catch (CR-01 + WR-01) — FOUND
  - `d555427` test(32-04): add CR-02 regression test for reused-with-missing-prior path — FOUND
  - `0d00e52` fix(32-04): guard render-loop reused-branch with priorExists (CR-02) — FOUND
- npm test: 517 passing
- npm run typecheck: exit 0
- npm run build: exit 0

## Next Phase Readiness

- Phase 32 gap-closure complete; all BLOCKER-class findings from `32-REVIEW.md` resolved.
- Recommend orchestrator re-run `/gsd-verify-phase 32` after this plan merges to confirm SC-2 flips from `partial` → `✓ VERIFIED` and the verification report's `gaps:` block is empty.
- No new blockers for downstream phases (33 telemetry, 34 routing, 35 eval, 36 action). The smarter-regen surface that Phase 32 ships (--dry-run + surgical --since) is now correctness-clean.

---
*Phase: 32-source-doc-dependency-graph*
*Plan: 04 (gap closure)*
*Completed: 2026-05-13*
