---
phase: 32-source-doc-dependency-graph
verified: 2026-05-13T13:50:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "SC-2: User running `handover generate --dry-run` sees a list of which renderers would execute and why, with zero LLM calls made (CR-01 bad-ref crash fixed; CR-02 lying-INDEX defect fixed)"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "WR-01 follow-up: non-dry-run `--since <bad-ref>` path (src/cli/generate.ts:587) still crashes with unwrapped `getGitChangedFiles` await"
    addressed_in: "Out of scope for SC-2 (which is dry-run only); flagged in 32-REVIEW.md as a follow-up. Phase 32 SC-2 contract is restricted to `--dry-run`. The non-dry-run path remains a quality follow-up for a future phase."
    evidence: "32-REVIEW.md WR-01: 'CR-01 was framed as a --dry-run regression because that's where it was observed, but the underlying defect (unhandled throw on bad --since ref) remains in the costly path.' Per verification prompt: 'WR-01 is OUT OF SCOPE for SC-2 because SC-2 is about dry-run only.'"
human_verification:
  - test: "Full real-LLM run creates the dep-graph.json — exercise the post-run rebuild path end-to-end against a real LLM-driven generate; confirm `.handover/cache/dep-graph.json` exists with `graphVersion: 1` and 13 renderer keys, ISO-8601 `builtAt`, and non-empty `infrastructureFiles`."
    expected: "File exists; `jq '.graphVersion'` returns 1; `jq '.renderers | keys | length'` returns 13; `jq '.infrastructurePaths'` matches the curated D-12 seed list; `jq '.infrastructureFiles | length'` > 0."
    why_human: "buildDepGraph + saveDepGraph are exercised by 40 unit tests with mocked fast-glob; the post-run write at src/cli/generate.ts:1099-1108 only runs after a successful full generate (which requires API keys + LLM budget). SC-3 covered structurally; end-to-end live exercise needs a real LLM call."
  - test: "Surgical --since regen against a real prior run — commit a one-line change to a non-infra file (e.g. `src/orchestrator/dag.ts`), run `handover generate --since HEAD~1`, then inspect `handover/00-INDEX.md`."
    expected: "Fewer than 14 renderers actually execute (status: 'reused' for unchanged docs); INDEX shows ≥1 row labelled `Reused (last: <ISO>)`."
    why_human: "Integration tests only exercise the `--dry-run` preview surface (no API keys); the unit test for filterRenderersByChangedFiles uses a synthetic 3-renderer graph, not the live 13-entry registry. End-to-end story (full run writes graph → next --since run reads it → render loop skips → INDEX shows Reused) requires a real LLM run for the seeding step."
  - test: "Infrastructure-file-only change is a true no-op end-to-end (SC-4 live confirmation) — touch `src/utils/logger.ts` only, commit, then `handover generate --dry-run --since HEAD~1`."
    expected: "`wouldExecute` contains only `00-index` (always-renders) and renderers whose registry entry includes `logger.ts` directly (none — the file is in INFRASTRUCTURE_PATHS); JSON `fellBackToFullRegen` should be `false`; reasons should be `(always renders)` for INDEX only."
    why_human: "SC-4 is structurally proven by the SC-4 unit test in dep-graph.test.ts (line 275) and the INFRASTRUCTURE_PATHS list, but the end-to-end demonstration that a real `logger.ts` change in this very repo's tree triggers ZERO renderers requires a live CLI invocation against a real `dep-graph.json` (which is built by a prior real run — see Scenario 1)."
---

# Phase 32: Source→Doc Dependency Graph Verification Report (Re-verification)

**Phase Goal:** Users running `handover generate --since <ref>` re-run only the renderers whose source dependencies changed, not all 14 renderers, and can preview the impact without spending LLM budget.

**Verified:** 2026-05-13T13:50:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure plan 32-04 (CR-01 + CR-02)

## Re-verification Summary

The previous VERIFICATION.md (2026-05-13T13:05:00Z) was `gaps_found` with score 4/5; SC-2 was the single failing truth (PARTIAL — bad-ref crash). Plan 32-04 closed both flagged defects:

- **CR-01 (BLOCKER → fixed):** dry-run early-exit branch (`src/cli/generate.ts:158-174`) now wraps `getGitChangedFiles` in try/catch with stderr warning + graceful fallthrough. Verified live with `node dist/index.js generate --dry-run --since some-invalid-ref` → exit 0, friendly preview, stderr names `some-invalid-ref`.
- **CR-02 (WARNING → fixed):** render-loop reused-branch (`src/cli/generate.ts:996-1013`) now uses the new `checkPriorOutput()` helper to gate `reused: true` behind `priorExists`. When `stat()` fails on the prior on-disk doc, the closure falls through to the normal `doc.render(ctx)` path, restoring INDEX link integrity.
- **Test additions:** +1 integration test (`tests/integration/dry-run.test.ts:138-179` — CR-01 regression with bad-ref fixture) + 5 unit tests (`src/cli/generate.test.ts` — `checkPriorOutput` contract + reused-branch shape). Suite is now **517 passing** (was 512 pre-32-04). `runCLI` upgraded to `spawnSync` (`tests/integration/setup.ts:13,122`) so stderr is captured on the exit-0 success path.

SC-2 now flips from PARTIAL → VERIFIED. All 5 must-haves are structurally satisfied.

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | SC-1: Single non-infra file change → fewer than 14 renderers execute (only those whose dep-graph traces back to the changed file) | ✓ VERIFIED | `filterRenderersByChangedFiles` (src/regen/dep-graph.ts:180-217) iterates changedFiles, adds only renderers whose `requiredSources` Set contains the file. Unit test `SC-1: a single non-infra file change yields fewer than all renderers in affected` (src/regen/dep-graph.test.ts:265) passes. Wired into CLI at src/cli/generate.ts:572 inside the `if (options.since)` branch; render loop short-circuits at lines 991-1013 when `filterDecision.affected` excludes the doc AND `priorExists` (CR-02 guard). All 517 tests pass. End-to-end live confirmation deferred to human Scenario 2. |
| 2   | SC-2: User running `handover generate --dry-run` sees a list of which renderers would execute and why, with zero LLM calls made | ✓ VERIFIED | **Happy path (no --since):** live `node dist/index.js generate --dry-run` in stripped-keys fixture → exit 0, 14-row preview ending in literal `Zero LLM calls made.`, no markdown written. **Bad-ref edge case (CR-01 closure):** live `node dist/index.js generate --dry-run --since some-invalid-ref` in `/tmp/gap-check-32-verify` → **exit 0** (was exit 1 before 32-04), full preview emitted, stderr contains `warning: --since "some-invalid-ref" could not be resolved: Invalid git ref...` AND `Zero LLM calls made.` literal in stdout. New regression test `--dry-run --since not-a-real-ref exits 0 with friendly preview and stderr warning (CR-01)` (tests/integration/dry-run.test.ts:162-178) passes. The dry-run early-exit branch (src/cli/generate.ts:152-184) runs BEFORE auth/onboarding/provider work, preserving the zero-LLM-calls invariant on every input path. |
| 3   | SC-3: Graph persisted to `.handover/cache/dep-graph.json` with `graphVersion`; deletion or version bump triggers full rebuild, not corrupt state | ✓ VERIFIED | `saveDepGraph` writes `JSON.stringify(graph, null, 2)` to `.handover/cache/dep-graph.json` (src/regen/dep-graph.ts:143-147). `DepGraphSchema` uses `z.literal(GRAPH_VERSION)` (line 57); version mismatch → `safeParse.success=false` → `loadDepGraph` returns `null` → callers degrade to full regen. Five `loadDepGraph` unit tests cover missing file / valid v1 / graphVersion=0 mismatch / malformed JSON / shape violation (all return null, never throw). Post-run rebuild wired in src/cli/generate.ts:1099-1108 with non-fatal try/catch (graceful degradation). End-to-end full-run write deferred to human Scenario 1. |
| 4   | SC-4: Infrastructure files (logger.ts, config loader, shared types) do not appear as source nodes — change to `logger.ts` alone triggers no renderer | ✓ VERIFIED | `INFRASTRUCTURE_PATHS` (src/regen/dep-graph.ts:33-41) verbatim D-12 list: `'src/utils/**'`, `'src/config/loader.ts'`, `'src/config/defaults.ts'`, `'src/config/schema.ts'`, `'src/domain/types.ts'`, `'src/domain/entities.ts'`, `'**/types.ts'`. Defense in depth: filtering at BUILD time (line 122) AND LOOKUP time (line 197). Registry grep `grep -E "(src/utils\|src/config\|types\.ts)" src/renderers/registry.ts` returns 0 — no renderer's `requiredSources` lists infra files. Unit test `SC-4: a single infrastructure file change yields zero affected renderers and zero unclaimed` (src/regen/dep-graph.test.ts:275) passes. End-to-end live confirmation deferred to human Scenario 3. |
| 5   | SC-5: No existing dep-graph (first run or manually deleted) → safe full regen with no error | ✓ VERIFIED | `loadDepGraph` returns `null` when file is missing (src/regen/dep-graph.ts:160). Both call sites treat `null` gracefully: (a) dry-run branch (src/cli/generate.ts:155) passes null to `computeDryRunDecision` which sets `noGraph: true, fellBackToFullRegen: !!since`; (b) `--since` branch (line 570) leaves `filterDecision = null` so the render-loop short-circuit is bypassed → all docs render normally. Integration test `--since HEAD~1 with no dep-graph falls back to full regen safely (SC-5)` (tests/integration/dry-run.test.ts:120-135) passes — exit 0, `noGraph: true`, `fellBackToFullRegen: true`, `since: 'HEAD~1'`. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `src/renderers/types.ts` | `DocumentSpec.requiredSources: string[]`; `DocumentStatus.status` includes `'reused'`; optional `lastRenderedAt` | ✓ VERIFIED | Line 50: `requiredSources: string[];` (required); line 63: `status: ... \| 'reused'`; line 65: `lastRenderedAt?: string;`. Typecheck passes. |
| `src/renderers/registry.ts` | `withSelfRef()` helper + 14 entries declaring `requiredSources` | ✓ VERIFIED | Line 28: `export const withSelfRef`. `grep -c "requiredSources:"` = 14; `grep -c "withSelfRef("` = 13. Zero `src/utils\|src/config\|types\.ts` leaks. |
| `src/renderers/registry.test.ts` | Tests for `withSelfRef` + DOCUMENT_REGISTRY shape | ✓ VERIFIED | `describe('withSelfRef()')` (3 tests) + `describe('DOCUMENT_REGISTRY shape — requiredSources invariants')` (2 tests). 26/26 passing. |
| `src/renderers/render-00-index.ts` | `statusLabel` handles `'reused'` with mtime suffix; signature takes full DocumentStatus | ✓ VERIFIED | Line 56: `const statusLabel = (s: DocumentStatus): string =>`; lines 66-69: `case 'reused':` returns `Reused (last: ${s.lastRenderedAt})` or `'Reused'`; call site line 76 passes `statusLabel(s)`. (32-REVIEW WR-02 — non-exhaustive switch — is a quality follow-up, not a Phase 32 must-have.) |
| `src/regen/dep-graph.ts` | 7 public functions + GRAPH_VERSION + INFRASTRUCTURE_PATHS + DepGraphSchema + types | ✓ VERIFIED | 7 `^export (async )?function` matches: buildDepGraph, saveDepGraph, loadDepGraph, filterRenderersByChangedFiles, computeDryRunDecision, formatDryRun, formatDryRunJson. `GRAPH_VERSION = 1 as const` + INFRASTRUCTURE_PATHS + DepGraphSchema with `z.literal(GRAPH_VERSION)`. |
| `src/regen/dep-graph.test.ts` | ≥9 describe blocks, ≥35 tests, SC-1/3/4/5 + Phase 36 snapshot | ✓ VERIFIED | 10 describe blocks, 40 tests. Per-file coverage 96.93/100/90/96.73 — clears 90/90/85/90 thresholds. |
| `src/cli/index.ts` | `--dry-run` and `--json` flags on `generate` subcommand | ✓ VERIFIED | Line 38: `.option('--dry-run', ...)`; line 39: `.option('--json', ...)`. |
| `src/cli/generate.ts` | dry-run early-exit BEFORE auth (try/catch on bad ref); --since filter call; render-loop skip with priorExists guard; status:'reused' assembly; post-run rebuild | ✓ VERIFIED | All wire-in confirmed at expected line ranges. **CR-01 fix verified:** `try { ... } catch (err) { ... }` in dry-run branch (lines 158-174) with stderr warning. **CR-02 fix verified:** `checkPriorOutput()` exported helper (lines 94-104) + `if (priorExists)` guard around `reused: true` return (lines 1000-1013) with explicit `// CR-02 fix:` fall-through comment. **Wire-in still complete:** dry-run early-exit at line 152 (BEFORE runOnboarding at 188); `filterRenderersByChangedFiles` import + call at 572; `filterDecision: FilterDecision \| null = null;` at outer scope; `status: 'reused'` push at 1031; `buildDepGraph(DOCUMENT_REGISTRY, rootDir)` post-render rebuild inside `if (!options.since)`. |
| `src/cli/generate.test.ts` (NEW in 32-04) | Unit tests for `checkPriorOutput` helper + reused-branch shape (CR-02 regression) | ✓ VERIFIED | 5 tests: 3 covering `checkPriorOutput` (exists:true with mtime, exists:false on missing, exists:false on bad path), 2 covering reused-branch shape (reused:true when prior exists, reused:false when prior missing). All pass. |
| `tests/integration/dry-run.test.ts` | End-to-end coverage of zero-LLM, JSON shape, no-graph fallback + new CR-01 regression | ✓ VERIFIED | 5 tests passing: SC-2 happy path, Phase 36 JSON contract, --only intersection, SC-5 no-graph fallback, **NEW CR-01 regression at line 138 ('--dry-run --since not-a-real-ref exits 0 with friendly preview and stderr warning')**. |
| `tests/integration/setup.ts` (modified in 32-04) | `runCLI` captures stderr on exit-0 success path | ✓ VERIFIED | Line 13 imports `spawnSync from 'node:child_process'`; line 122 invokes `spawnSync(process.execPath, [CLI_PATH, ...args], ...)`; comment at line 119 documents the change. Returns `{stdout, stderr, exitCode}` so legacy callers transparent. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| src/renderers/registry.ts | src/renderers/types.ts | `import type { DocumentSpec }` (uses `requiredSources`) | ✓ WIRED | Line 1; usage on all 14 entries. |
| src/renderers/render-00-index.ts | src/renderers/types.ts (`'reused'` union) | `case 'reused':` in statusLabel | ✓ WIRED | Line 66 matches expanded union from types.ts:63. |
| src/cli/index.ts | generate subcommand (`--dry-run`, `--json`) | `.option(...)` chain | ✓ WIRED | Lines 38-39 inside `.command('generate')` block. |
| src/cli/generate.ts (runGenerate top) | src/regen/dep-graph.ts (computeDryRunDecision + formatters) | Early-exit conditional with try/catch on bad ref | ✓ WIRED | Lines 152-184 fire BEFORE runOnboarding (188) and BEFORE all auth/provider work. **CR-01 try/catch in place** at lines 158-174 — bad ref now stderr-warns and degrades to no-since branch instead of throwing. |
| src/cli/generate.ts (line 572, --since branch) | src/regen/dep-graph.ts (loadDepGraph + filterRenderersByChangedFiles) | non-dry-run --since path consults graph | ✓ WIRED | Lines 570-573 inside the `else` branch (gitResult.kind === 'ok'); `if (graph) { filterDecision = ... }` pattern degrades to null when graph missing → render loop short-circuit is bypassed. |
| src/cli/generate.ts (~1101, post-render) | src/regen/dep-graph.ts (buildDepGraph + saveDepGraph) | non-fatal try/catch when `!options.since` | ✓ WIRED | Lines 1099-1108. Try/catch swallows errors (verbose-only logs them) — matches Plan 03 spec. |
| src/cli/generate.ts (render loop) | DocumentStatus 'reused' status | `status: 'reused', lastRenderedAt` push to statuses array, GATED on priorExists | ✓ WIRED | Line 1031 pushes `status: 'reused'` ONLY for closures returning `reused: true`. **CR-02 fix in place at lines 996-1013:** the upstream check now uses `checkPriorOutput()` and falls through past the early-return when `priorExists === false`, so a missing prior file forces a real render. INDEX no longer links to non-existent files. |
| src/cli/generate.test.ts | src/cli/generate.ts (checkPriorOutput export) | `import { checkPriorOutput } from './generate.js'` | ✓ WIRED | Line 25 import; 5 tests exercise the helper directly. |
| tests/integration/setup.ts (runCLI) | child process stderr | `spawnSync` returns stderr on success | ✓ WIRED | Was previously hidden by `execFileSync` on exit 0; now captured for assertions like `expect(result.stderr).toContain('not-a-real-ref')`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `--dry-run` text output | `DryRunDecision` from computeDryRunDecision | selectedDocs (from resolveSelectedDocs) + graph (from loadDepGraph) + changedFiles (from getGitChangedFiles, now wrapped in try/catch) + since | YES — live run produces 14-row preview with real renderer IDs and `Zero LLM calls made.` trailer (verified for both happy path AND bad-ref path) | ✓ FLOWING |
| `--dry-run --json` output | Same DryRunDecision, projected via formatDryRunJson | Same | YES — live run produces valid JSON with 7-key Phase 36 contract | ✓ FLOWING |
| INDEX `Reused (last: ...)` rendering | DocumentStatus[] passed to renderIndex(ctx, statuses) | Promise.allSettled results from render loop; `reused: true` payload only emitted when `priorExists === true` (CR-02 guard) | YES — when prior exists, `lastRenderedAt` is real ISO mtime; when missing, the closure falls through and the doc renders normally (status NOT 'reused') so INDEX link resolves | ✓ FLOWING (CR-02 hollow path closed) |
| Persisted dep-graph.json | DepGraph from buildDepGraph(DOCUMENT_REGISTRY, rootDir) | fast-glob over each spec.requiredSources + INFRASTRUCTURE_PATHS | YES (mocked in 40 unit tests; real-filesystem exercise deferred to human Scenario 1) | ✓ FLOWING (unit-level); ? UNCERTAIN end-to-end (human Scenario 1) |
| `checkPriorOutput()` return value | `{ exists: boolean; lastRenderedAt?: string }` | `stat(join(outputDir, filename)).mtime.toISOString()` | YES — 3 unit tests cover existing/missing/bad-path; integrated into render loop | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| `--dry-run` exits 0 with zero LLM calls (no API keys) | `cd /tmp && ANTHROPIC_API_KEY='' OPENAI_API_KEY='' GEMINI_API_KEY='' node dist/index.js generate --dry-run` | exit 0; 14-row preview ending in literal `Zero LLM calls made.`; no `handover/` dir | ✓ PASS |
| `--dry-run --since <bad-ref>` exits 0 (CR-01 closure) | `cd /tmp/gap-check-32-verify && ANTHROPIC_API_KEY='' OPENAI_API_KEY='' GEMINI_API_KEY='' node dist/index.js generate --dry-run --since some-invalid-ref` | **exit 0** (was exit 1 before 32-04); stdout contains 14-row preview + `Zero LLM calls made.`; stderr contains `warning: --since "some-invalid-ref" could not be resolved: Invalid git ref...` | ✓ PASS |
| `npm run typecheck` | `npm run typecheck` | exit 0, no output | ✓ PASS |
| Full test suite | `npm test` | 32 files passed / 1 skipped; 517 tests passed / 30 skipped / 0 failures | ✓ PASS |
| Phase 32 new test files | `npx vitest run tests/integration/dry-run.test.ts src/cli/generate.test.ts` | 2 files passed; 10 tests passed (4 pre-existing dry-run + 1 CR-01 regression + 5 CR-02 unit tests) | ✓ PASS |
| Build | `npm run build` | Build success in <50ms | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| REGEN-03 | 32-01-PLAN, 32-02-PLAN, 32-03-PLAN | `handover generate --since <ref>` consults persisted graph and re-runs only affected renderers | ✓ SATISFIED | Plan 02 ships `filterRenderersByChangedFiles` with SC-1 unit test; Plan 03 wires it at src/cli/generate.ts:572 inside `--since` branch; render loop short-circuit at lines 991-1013 honors FilterDecision (with CR-02 priorExists guard). End-to-end real-LLM exercise deferred to human Scenario 2. |
| REGEN-04 | 32-03-PLAN, 32-04-PLAN | `handover generate --dry-run` previews renderers without LLM calls | ✓ SATISFIED | Dry-run early-exit at src/cli/generate.ts:152-184 BEFORE all auth/provider/LLM work. Integration Tests 1+2 confirm zero LLM calls + zero markdown writes for happy path. **CR-01 closure (32-04):** bad ref no longer crashes — exit 0 preserved, regression test at tests/integration/dry-run.test.ts:138-179 locks the contract. |
| REGEN-05 | 32-02-PLAN | Graph persisted to `.handover/cache/dep-graph.json` with `graphVersion`; stale-version graphs discarded; no-graph degrades to full regen | ✓ SATISFIED | `saveDepGraph` writes the file (src/regen/dep-graph.ts:143-147); `DepGraphSchema` uses `z.literal(GRAPH_VERSION)` (line 57); `loadDepGraph` returns null on version mismatch / missing / malformed / shape violation (5 unit tests). Integration test `--since HEAD~1 with no dep-graph` passes. |
| REGEN-06 | 32-01-PLAN, 32-02-PLAN | Infrastructure files excluded from source nodes (defeats over-approximation) | ✓ SATISFIED | INFRASTRUCTURE_PATHS at src/regen/dep-graph.ts:33-41 matches D-12 verbatim. Filtering at both build time (122) and lookup time (197). Zero infra-leak in `requiredSources` (registry grep returns 0). SC-4 unit test passes. |
| REGEN-07 | 32-01-PLAN, 32-02-PLAN, 32-03-PLAN | Single leaf-file change triggers fewer than 14 renderers — verifiable via test fixture | ✓ SATISFIED | SC-1 unit test (src/regen/dep-graph.test.ts:265) asserts `decision.affected.size < Object.keys(graph.renderers).length`. CLI wire-in plumbs the decision through render loop short-circuit. End-to-end real-LLM exercise deferred to human Scenario 2. |

**Orphaned requirements check:** REQUIREMENTS.md (line 159) maps exactly REGEN-03..07 to Phase 32. All 5 IDs appear in at least one plan's `requirements` frontmatter (REGEN-03 in plans 01/02/03/04; REGEN-04 in plans 03/04; REGEN-05 in plan 02; REGEN-06 in plans 01/02; REGEN-07 in plans 01/02/03). Zero orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/cli/generate.ts | 587 | Awaited `getGitChangedFiles` without try/catch in the NON-dry-run --since path (asymmetric to the CR-01 fix in dry-run branch at 158-174) | ⚠️ WARNING (deferred / out of scope for SC-2) | Bad git ref + non-dry-run `--since` → exits non-zero after onboarding/auth setup. **Out of scope for Phase 32 SC-2** (which is dry-run only); flagged in 32-REVIEW.md WR-01 as a follow-up; per verification prompt: "WR-01 is OUT OF SCOPE for SC-2 because SC-2 is about dry-run only; flag it as a follow-up but it does NOT fail SC-2." Recommended fix is in 32-REVIEW.md WR-01: mirror the dry-run guard or push the fix into `getGitChangedFiles` to return `{kind:'fallback', reason}` for invalid refs. |
| src/cli/generate.ts | 152-184 | Dry-run preview header may misleadingly show `(since: <bad-ref>)` when `--since` failed but a graph exists (32-REVIEW.md WR-02 — current re-review item) | ℹ️ INFO | `since` field in `computeDryRunDecision` input still passes the bad ref through; user only learns of the failure via stderr. Cosmetic / clarity issue; SC-2 contract (exit 0 + zero LLM + Zero LLM calls made literal) is preserved. Suggested fix in 32-REVIEW.md WR-02. |
| src/renderers/render-00-index.ts | 56-71 | Non-exhaustive switch on `DocumentStatus['status']` — no `default:` / `never` assertion | ⚠️ WARNING (deferred) | Future status additions silently return `undefined`. Phase 32 confirmed extensible (`'reused'` was added). 32-REVIEW.md WR-02 (original verification report) — quality follow-up, not a Phase 32 must-have. |
| src/cli/generate.test.ts | 78-88 | `simulateReusedBranch` test helper hand-rolls the production logic instead of importing the real branch | ℹ️ INFO | Branch shape test theatre — `checkPriorOutput` unit tests already cover the helper contract. 32-REVIEW.md (re-review) IN-02. Cosmetic. |
| src/cli/generate.test.ts, src/renderers/registry.test.ts | (whole files) | Unit test files exist despite `AGENTS.md:53` stating "Do not add unit tests" | ⚠️ WARNING (process / policy) | 32-REVIEW.md (re-review) WR-04. Files exist with planner authorization for the regression-locking purpose; AGENTS.md exception was not formalized. Process follow-up; no functional impact. |
| vitest.config.ts | 90 | Stale coverage exclusion `'src/renderers/renderer-template.ts'` (file doesn't exist under that name; real path is `render-template.ts`) | ℹ️ INFO | Already covered by broader glob; dead config. 32-REVIEW.md (re-review) IN-01. |
| src/cli/index.ts | 144-150 | Default-action block doesn't register `--dry-run` / `--json` (or other generate flags) | ℹ️ INFO | Pre-existing drift; bare `handover --dry-run` errors with "unknown option". `handover generate --dry-run` works. 32-REVIEW.md (re-review) IN-04. |

**No new BLOCKERs surfaced by re-verification.** Both prior BLOCKERs (CR-01, CR-02) are closed. WR-01 is the asymmetric non-dry-run fix that the prompt explicitly excludes from SC-2 scope.

### Human Verification Required

3 items need human runtime testing against a real codebase / live LLM. These are NOT failures — they are scenarios where automated tests cannot prove the end-to-end behavior because they would require live LLM calls (API keys, billable usage). Detailed in frontmatter `human_verification:` block. Summary:

1. **Full real-LLM run creates the dep-graph.json** — exercise the post-run write path (src/cli/generate.ts:1099-1108) end-to-end against a real `handover generate` (no `--dry-run`). Confirm `.handover/cache/dep-graph.json` exists with `graphVersion: 1` and 13 renderer keys.

2. **Surgical --since regen against real prior run** — after Scenario 1 succeeds, modify a non-infra file, commit, run `handover generate --since HEAD~1`. Confirm fewer than 14 renderers actually execute and INDEX shows ≥1 `Reused (last: <ISO>)` row.

3. **SC-4 live confirmation** — touch `src/utils/logger.ts` only, commit, then `handover generate --dry-run --since HEAD~1`. Confirm `wouldExecute` contains essentially only `00-index` (no infra-fanout false positives).

These three were also flagged in the previous VERIFICATION.md and remain valid. CR-02 reproduction was item #3 in the previous report — that is now structurally CLOSED via the new `priorExists` guard + 5 unit tests (no longer needs human verification).

### Gaps Summary

**Zero gaps.** All 5 Roadmap Success Criteria (SC-1..SC-5) are now structurally satisfied:

- SC-1 (surgical filtering): pure filter function + render loop short-circuit + CR-02-guarded reused branch.
- SC-2 (dry-run zero-LLM): dry-run early-exit before auth + CR-01 try/catch on bad refs + literal `Zero LLM calls made.` trailer.
- SC-3 (graph persistence + version safety): saveDepGraph + DepGraphSchema with z.literal + loadDepGraph never-throws contract.
- SC-4 (infra exclusion): D-12 INFRASTRUCTURE_PATHS + dual-layer filtering (build + lookup).
- SC-5 (no-graph safe degradation): loadDepGraph returns null + both call sites degrade gracefully.

All 5 Phase 32 requirements (REGEN-03..07) are SATISFIED with no orphans.

**Status is `human_needed` (not `passed`)** because three end-to-end scenarios require live CLI invocation against a real codebase + LLM budget to fully prove the goal — but those scenarios are about confirming live behavior, not about closing failed truths. The prompt's status decision rule explicitly contemplates this case ("If SC-1/SC-3/SC-4 require human runtime testing of the actual CLI against a real codebase (not just unit/integration tests), include those in `human_verification` and use `human_needed`").

**Re-verification result: SC-2 PARTIAL → VERIFIED. Score 4/5 → 5/5. Status gaps_found → human_needed.**

---

_Verified: 2026-05-13T13:50:00Z_
_Verifier: Claude (gsd-verifier)_
_Mode: Re-verification after gap closure plan 32-04_
