---
phase: 32-source-doc-dependency-graph
verified: 2026-05-13T13:05:00Z
status: gaps_found
score: 4/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "SC-2: User running `handover generate --dry-run` sees a list of which renderers would execute and why, with zero LLM calls made"
    status: partial
    reason: "Happy path (no --since) and (valid --since) both PASS — zero LLM calls, exit 0, no markdown written, no round cache. BUT the bad-ref edge case `--dry-run --since <invalid-ref>` is broken: getGitChangedFiles() throws, the dry-run branch only handles kind==='ok' (src/cli/generate.ts:136-141), the throw escapes the try block, and the process exits with code 1 instead of producing the friendly preview. Confirmed in a /tmp fixture: `node dist/index.js generate --dry-run --since some-invalid-ref` returns exit code 1 with `✗ Error: Invalid git ref \"some-invalid-ref\"...`. The dry-run path's stated invariant ('Runs BEFORE auth/provider/config/onboarding to guarantee ZERO LLM calls') is preserved, but the 'zero LLM, exit 0' contract that SC-2 implies (and that the code comment claims) is broken on a normal user typo. This is the same defect 32-REVIEW.md flagged as CR-01."
    artifacts:
      - path: "src/cli/generate.ts"
        issue: "Lines 136-141: `if (options.since) { const gitResult = await getGitChangedFiles(rootDir, options.since); if (gitResult.kind === 'ok') { changedFiles = gitResult.changedFiles; } }` does not wrap the await in try/catch. getGitChangedFiles throws (not returns 'fallback') when revparse fails (src/cache/git-fingerprint.ts:32-42), and the throw is caught by the outer handleCliError → non-zero exit."
    missing:
      - "Wrap `getGitChangedFiles(...)` in try/catch inside the dry-run early-exit branch (src/cli/generate.ts:131-150). On throw, surface a stderr warning, leave changedFiles undefined, and continue to computeDryRunDecision so it degrades gracefully (branch 1/3) and prints the standard preview with exit 0."
      - "Add an integration test in tests/integration/dry-run.test.ts asserting `--dry-run --since not-a-real-ref` exits 0 and emits a standard preview body (covers CR-01 explicitly)."

deferred: []

human_verification:
  - test: "Full real-LLM run: `handover generate` in a project with API key set → confirm `.handover/cache/dep-graph.json` is created with `graphVersion: 1` and exactly 13 non-INDEX renderer keys, ISO-8601 `builtAt`, non-empty `infrastructureFiles`."
    expected: "File exists; `jq '.graphVersion'` returns 1; `jq '.renderers | keys | length'` returns 13; `jq '.infrastructurePaths'` matches the curated D-12 seed list; `jq '.infrastructureFiles | length'` > 0."
    why_human: "Tests exercise `buildDepGraph` via mocked fast-glob (40 unit tests); no automated integration test invokes a real `buildDepGraph` against the live filesystem end-to-end. SC-3 (graph persistence) is exercised by Plan 02 unit tests but the post-run write in src/cli/generate.ts:1099-1108 is only exercised by a successful full generate run (which requires API keys + LLM budget)."
  - test: "Surgical regen in real project: commit a one-line change to a non-infra file (e.g. `src/orchestrator/dag.ts`), run `handover generate --since HEAD~1`, then inspect `handover/00-INDEX.md`."
    expected: "fewer than 14 renderers actually execute (status: 'reused' for unchanged docs); INDEX shows ≥1 row labelled `Reused (last: <ISO>)`."
    why_human: "Integration tests only exercise the `--dry-run` preview surface (no API keys), and the unit test for filterRenderersByChangedFiles uses a synthetic 3-renderer graph not the live 13-entry registry. The end-to-end story of (full run writes graph → next --since run reads it → render loop skips → INDEX shows Reused) is not covered by a single automated test; it requires a real LLM run for the seeding step."
  - test: "Per CR-02 (32-REVIEW.md flagged issue): delete one doc from a prior `handover/` directory, then run `handover generate --since HEAD~1`. Inspect the resulting INDEX."
    expected: "The missing doc is regenerated, NOT marked `Reused`. INDEX link to it resolves to an existing file."
    why_human: "Currently src/cli/generate.ts:957-977 returns `reused: true` unconditionally even when stat() of the prior output fails (it only drops the lastRenderedAt timestamp). If the prior file is missing, the INDEX would link to a non-existent file — a 'lying INDEX' regression. This is reachable when a user manually deletes a doc, and is the bug 32-REVIEW.md CR-02 raised. No automated test covers this case."
---

# Phase 32: Source→Doc Dependency Graph Verification Report

**Phase Goal:** Users running `handover generate --since <ref>` re-run only the renderers whose source dependencies changed, not all 14 renderers, and can preview the impact without spending LLM budget.

**Verified:** 2026-05-13T13:05:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1: Single non-infra file change → fewer than 14 renderers execute | ✓ VERIFIED | `filterRenderersByChangedFiles` (src/regen/dep-graph.ts:180-217) iterates changedFiles, adds only renderers whose `requiredSources` Set contains the file. Unit test `SC-1: a single non-infra file change yields fewer than all renderers in affected` (src/regen/dep-graph.test.ts:265) passes. Wired into CLI at src/cli/generate.ts:572 inside the `if (options.since)` branch; the render loop short-circuits at lines 957-977 when `filterDecision.affected` excludes the doc. All 511 tests pass. |
| 2 | SC-2: `handover generate --dry-run` shows preview with zero LLM calls | ✗ FAILED (partial) | Happy paths VERIFIED: live invocation in `/tmp/verify-phase-32` returned exit 0, produced 14-row "Would execute" preview, ended with literal "Zero LLM calls made.", and created NO `handover/*.md` files. Integration test `exits 0 with zero LLM calls and zero docs written (SC-2)` (tests/integration/dry-run.test.ts:36) passes with stripped API keys. HOWEVER: `--dry-run --since <invalid-ref>` exits 1 (reproduced live, exit code 1). The dry-run branch at src/cli/generate.ts:136-141 does not catch the throw from `getGitChangedFiles`, and the outer try-catch routes it through `handleCliError` → non-zero exit. SC-2's "zero LLM calls made" promise extends to the bad-ref case (the user is still in dry-run; no LLM should be invoked AND the CLI should not crash). This is 32-REVIEW.md CR-01. |
| 3 | SC-3: Graph persisted to `.handover/cache/dep-graph.json` with `graphVersion`; version mismatch / corrupt / deleted → full rebuild, no corrupt state | ✓ VERIFIED | `saveDepGraph` writes `JSON.stringify(graph, null, 2)` to `.handover/cache/dep-graph.json` (src/regen/dep-graph.ts:143-147). `DepGraphSchema` uses `z.literal(GRAPH_VERSION)` (line 57); version mismatch → `safeParse.success=false` → `loadDepGraph` returns `null` → callers degrade to full regen. Five `loadDepGraph` unit tests cover missing file / valid v1 / graphVersion=0 mismatch / malformed JSON / shape violation (all return null, never throw). Post-run rebuild wired in src/cli/generate.ts:1099-1108 with non-fatal try/catch. The `--dry-run` smoke run did NOT create the directory (correct: dry-run never writes). Live full-run write is not automated-tested but the code path is mechanical (`mkdir recursive` + `writeFile`). |
| 4 | SC-4: Infrastructure files (logger.ts, config loader, shared types) do not appear as source nodes — change to logger.ts alone triggers no renderer | ✓ VERIFIED | `INFRASTRUCTURE_PATHS` (src/regen/dep-graph.ts:33-41) includes `'src/utils/**'`, `'src/config/loader.ts'`, `'src/config/defaults.ts'`, `'src/config/schema.ts'`, `'src/domain/types.ts'`, `'src/domain/entities.ts'`, `'**/types.ts'` — verbatim D-12 list. Defense in depth: filtering happens at BUILD time (src/regen/dep-graph.ts:122 `matches.filter((p) => !infraSet.has(p)).sort()`) AND at LOOKUP time (line 197 `if (infraSet.has(changed)) continue;`). Registry grep: `grep -E "(src/utils\|src/config\|types\.ts)" src/renderers/registry.ts` returns 0 hits — no renderer's `requiredSources` lists infra files. Unit test `SC-4: a single infrastructure file change yields zero affected renderers and zero unclaimed` (src/regen/dep-graph.test.ts:275) passes. |
| 5 | SC-5: No existing dep-graph (first run or manually deleted) → safe full regen with no error | ✓ VERIFIED | `loadDepGraph` returns `null` when file is missing (src/regen/dep-graph.ts:160). Five callers all treat `null` as "fall back to full regen": (a) dry-run branch (src/cli/generate.ts:134) passes null to computeDryRunDecision which sets `noGraph: true, fellBackToFullRegen: !!since`; (b) `--since` branch (line 570) leaves `filterDecision = null` so the render loop short-circuit is bypassed → all docs render normally. Integration test `--since HEAD~1 with no dep-graph falls back to full regen safely (SC-5)` (tests/integration/dry-run.test.ts:120-135) passes — exit 0, `noGraph: true`, `fellBackToFullRegen: true`, `since: 'HEAD~1'`. |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/renderers/types.ts` | `DocumentSpec.requiredSources: string[]`; `DocumentStatus.status` includes `'reused'`; optional `lastRenderedAt: string` | ✓ VERIFIED | Line 50: `requiredSources: string[];` (required); line 63: `status: ... \| 'reused'`; line 65: `lastRenderedAt?: string;`. Typecheck passes. |
| `src/renderers/registry.ts` | `withSelfRef()` helper + 14 entries declaring `requiredSources` | ✓ VERIFIED | Line 28: `export const withSelfRef = ...`. `grep -c "requiredSources:" registry.ts` = 14; `grep -c "withSelfRef(" registry.ts` = 13. Zero `src/utils\|src/config\|types\.ts` leaks. |
| `src/renderers/registry.test.ts` | Tests for `withSelfRef` + DOCUMENT_REGISTRY shape invariant | ✓ VERIFIED | Vitest reports `describe('withSelfRef()')` (3 tests) and `describe('DOCUMENT_REGISTRY shape — requiredSources invariants')` (2 tests). 26/26 in file passing. |
| `src/renderers/render-00-index.ts` | `statusLabel` handles `'reused'` with mtime suffix; signature takes full DocumentStatus | ✓ VERIFIED | Line 56: `const statusLabel = (s: DocumentStatus): string =>` (full status object); lines 66-69: `case 'reused':` returns `Reused (last: ${s.lastRenderedAt})` or `'Reused'`; call site line 76 passes `statusLabel(s)`. NOTE: switch has no `default:` exhaustiveness guard (32-REVIEW.md WR-02 — quality concern, not a phase-32 must-have). |
| `src/regen/dep-graph.ts` | 7 public functions + GRAPH_VERSION + INFRASTRUCTURE_PATHS + DepGraphSchema + types | ✓ VERIFIED | 7 `^export (async )?function` matches: buildDepGraph (98), saveDepGraph (143), loadDepGraph (158), filterRenderersByChangedFiles (180), computeDryRunDecision (234), formatDryRun (326), formatDryRunJson (389). `GRAPH_VERSION = 1 as const` at line 22; INFRASTRUCTURE_PATHS at line 33; DepGraphSchema at line 56 with `z.literal(GRAPH_VERSION)`. |
| `src/regen/dep-graph.test.ts` | ≥9 describe blocks, ≥35 tests, SC-1/3/4/5 + Phase 36 snapshot | ✓ VERIFIED | 10 describe blocks; 40 tests; SC-1 test at line 265; SC-4 test at line 275; Phase 36 snapshot at line 575. All 40 pass. Per-summary: 96.93% statements / 100% functions / 90% branches / 96.73% lines coverage on dep-graph.ts. |
| `src/cli/index.ts` | `--dry-run` and `--json` flags on `generate` subcommand | ✓ VERIFIED | Line 38: `.option('--dry-run', 'Preview which renderers would execute; no LLM calls')`; line 39: `.option('--json', 'Emit JSON output (used with --dry-run)')`. |
| `src/cli/generate.ts` | dry-run early-exit BEFORE auth; --since filter call; render-loop skip; status:'reused' assembly; post-run rebuild | ⚠️ ORPHANED (partial wire) | All grep checks PASS: `if (options.dryRun)` at line 131 (BEFORE runOnboarding at 154, resolveAuth downstream); `filterRenderersByChangedFiles` import at line 32 + call at line 572 inside `else` branch of git fingerprint result; `filterDecision: FilterDecision \| null = null;` at line 320; `status: 'reused'` at line 1031; `buildDepGraph(DOCUMENT_REGISTRY` at line 1101 inside `if (!options.since)` at line 1099. WIRE-IN COMPLETE. **Wiring defect:** the dry-run branch's `getGitChangedFiles` call (line 137) has no try/catch, so a thrown `Invalid git ref` from `git-fingerprint.ts:32-42` escapes the dry-run path → exit 1 (CR-01). Similarly the `reused`-without-prior-output path (lines 962-977) returns `reused: true` even when `stat()` fails, producing an INDEX that links to a missing file (CR-02). Both are partial-wiring defects, not missing wiring. |
| `tests/integration/dry-run.test.ts` | End-to-end coverage of zero-LLM, JSON shape, no-graph fallback | ✓ VERIFIED | 4 tests passing: SC-2 happy path, Phase 36 JSON contract, --only intersection, SC-5 no-graph fallback. NO test for `--dry-run --since <bad-ref>` (CR-01 gap). NO test for `--since` with missing prior output (CR-02 gap). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| src/renderers/registry.ts | src/renderers/types.ts | `import type { DocumentSpec }` (uses new `requiredSources`) | ✓ WIRED | Line 1: `import type { DocumentSpec } from './types.js';` — usage on all 14 entries. |
| src/renderers/render-00-index.ts | src/renderers/types.ts (`'reused'` union) | `case 'reused':` in statusLabel switch | ✓ WIRED | Line 66 matches the expanded union from types.ts:63. |
| src/cli/index.ts | generate subcommand (`--dry-run`, `--json`) | `.option('--dry-run', ...)` + `.option('--json', ...)` | ✓ WIRED | Lines 38-39 inside `program.command('generate')` block. |
| src/cli/generate.ts (runGenerate top) | src/regen/dep-graph.ts (computeDryRunDecision + formatters) | early-exit conditional before auth/onboarding | ✓ WIRED (but partial — see CR-01) | Lines 131-150 fire BEFORE runOnboarding (154) and BEFORE all auth/provider work. Composes loadDepGraph + getGitChangedFiles + computeDryRunDecision + formatDryRun/formatDryRunJson. **Defect:** does NOT catch throws from getGitChangedFiles → bad ref breaks SC-2 exit-0 invariant. |
| src/cli/generate.ts (line ~572, --since branch) | src/regen/dep-graph.ts (loadDepGraph + filterRenderersByChangedFiles) | non-dry-run --since path consults graph | ✓ WIRED | Lines 570-573 inside the `else` branch (gitResult.kind === 'ok'); `if (graph) { filterDecision = ... }` pattern degrades to null when graph missing → render loop short-circuit is bypassed. |
| src/cli/generate.ts (~1101, post-render) | src/regen/dep-graph.ts (buildDepGraph + saveDepGraph) | non-fatal try/catch when `!options.since` | ✓ WIRED | Lines 1099-1108. Try/catch swallows errors and (verbose-only) logs them — matches Plan 03 spec. |
| src/cli/generate.ts (render loop) | DocumentStatus 'reused' status | `status: 'reused', lastRenderedAt` push to statuses array | ⚠️ PARTIAL | Line 1031 pushes `status: 'reused', lastRenderedAt: result.value.lastRenderedAt`. **Defect (CR-02):** the upstream check at lines 962-977 unconditionally sets `reused: true` even when `stat()` of the prior on-disk output fails — producing a 'reused' status pointing at a missing file. The TYPE is wired; the SEMANTIC correctness is not. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `--dry-run` text output | `DryRunDecision` from computeDryRunDecision | selectedDocs (from resolveSelectedDocs(options.only, DOCUMENT_REGISTRY)) + graph (from loadDepGraph) + changedFiles (from getGitChangedFiles when --since) + since | YES (live run produced 14-row preview with real renderer IDs and Zero-LLM trailer) | ✓ FLOWING |
| `--dry-run --json` output | Same DryRunDecision, projected via formatDryRunJson | Same | YES (live run produced valid JSON with `formatVersion: 1, since: null, graphVersion: null, noGraph: true` and the full 14-entry wouldExecute) | ✓ FLOWING |
| INDEX `Reused (last: ...)` rendering | DocumentStatus[] passed to renderIndex(ctx, statuses) | Promise.allSettled results from render loop; each `reused` doc pushes `{status:'reused', lastRenderedAt}` (src/cli/generate.ts:1025-1033) | Partially — lastRenderedAt comes from `stat(outputDir + filename).mtime.toISOString()`. WHEN stat fails the field stays undefined AND status stays 'reused' → INDEX renders `Reused` (no timestamp) but still links to a missing file. | ⚠️ STATIC fallback on stat-failure path (CR-02) |
| Persisted dep-graph.json (graphVersion, renderers, infrastructureFiles) | DepGraph from buildDepGraph(DOCUMENT_REGISTRY, rootDir) | fast-glob over each spec.requiredSources + INFRASTRUCTURE_PATHS | YES (mocked in 40 unit tests; not exercised against live filesystem in any automated test) | ✓ FLOWING (unit-level); ? UNCERTAIN end-to-end (deferred to human Scenario 1) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `--dry-run` exits 0 with zero LLM calls (no API keys) | `cd /tmp/verify-phase-32 && ANTHROPIC_API_KEY='' OPENAI_API_KEY='' GEMINI_API_KEY='' node dist/index.js generate --dry-run` | exit 0; 14-row "Would execute" output ending in literal `Zero LLM calls made.`; no `handover/` dir created | ✓ PASS |
| `--dry-run --json` produces Phase 36 contract | Same fixture + `--json` flag | Valid JSON parses with keys: formatVersion=1, since=null, graphVersion=null, noGraph=true, fellBackToFullRegen=false, wouldExecute (14 entries), wouldSkip (0) | ✓ PASS |
| `--dry-run --since <bad-ref>` exits 0 (SC-2 invariant) | Same fixture (git-initialized) + `--dry-run --since some-invalid-ref` | **exit 1** with `✗ Error: Invalid git ref "some-invalid-ref"` — bypasses dry-run preview entirely | ✗ FAIL (CR-01) |
| Typecheck clean | `npm run typecheck` | exit 0, no output | ✓ PASS |
| Full test suite green | `npm test` | 31 files passed / 1 skipped; 511 tests passed / 30 skipped / 0 failures | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REGEN-03 | 32-01-PLAN, 32-02-PLAN, 32-03-PLAN | `handover generate --since <ref>` consults persisted graph and re-runs only affected renderers | ✓ SATISFIED | Plan 02 ships `filterRenderersByChangedFiles` with SC-1 unit test (src/regen/dep-graph.test.ts:265). Plan 03 wires it at src/cli/generate.ts:572 inside the `--since` branch. Render loop short-circuit at lines 957-977 honors the FilterDecision. End-to-end real-LLM exercise deferred to human Scenario 2. |
| REGEN-04 | 32-03-PLAN | `handover generate --dry-run` previews renderers without LLM calls | ⚠ PARTIALLY SATISFIED | Dry-run early-exit branch exists at src/cli/generate.ts:131-150 BEFORE all auth/provider/LLM work. Integration Test 1 confirms zero LLM calls + zero markdown writes for the happy path. **Gap:** bad `--since` ref combined with `--dry-run` crashes (CR-01). REGEN-04 doesn't strictly mandate exit 0 on bad input, but SC-2 of this phase implies it. |
| REGEN-05 | 32-02-PLAN | Graph persisted to `.handover/cache/dep-graph.json` with `graphVersion` field; stale-version graphs discarded and rebuilt safely (no-graph degrades to full regen) | ✓ SATISFIED | `saveDepGraph` writes the file (src/regen/dep-graph.ts:143-147); `DepGraphSchema` uses `z.literal(GRAPH_VERSION)` (line 57); `loadDepGraph` returns null on version mismatch / missing / malformed / shape violation (5 unit tests at lines 217-263). Integration test `--since HEAD~1 with no dep-graph` passes (tests/integration/dry-run.test.ts:120). |
| REGEN-06 | 32-01-PLAN, 32-02-PLAN | Infrastructure files excluded from source nodes (defeats over-approximation) | ✓ SATISFIED | INFRASTRUCTURE_PATHS at src/regen/dep-graph.ts:33-41 matches D-12 verbatim. Filtering applied at both build time (line 122) and lookup time (line 197). No renderer's `requiredSources` lists `src/utils/`, `src/config/`, or `**/types.ts` (registry grep returns 0). SC-4 unit test at src/regen/dep-graph.test.ts:275 passes. |
| REGEN-07 | 32-01-PLAN, 32-02-PLAN, 32-03-PLAN | Single leaf-file change triggers fewer than 14 renderers — verifiable via test fixture | ✓ SATISFIED | SC-1 unit test at src/regen/dep-graph.test.ts:265 asserts `decision.affected.size < Object.keys(graph.renderers).length` (the 14-renderer requirement is the real-world projection of this property). The pure filter function correctness is proven; the CLI wire-in plumbs the decision through the render loop short-circuit (lines 957-977). End-to-end real-LLM exercise deferred to human Scenario 2. |

**Orphaned requirements check:** REQUIREMENTS.md maps exactly REGEN-03..07 to Phase 32 (line 159: "Phase 32: REGEN-03..07 (5 requirements)"). All 5 IDs appear in at least one plan's `requirements` frontmatter. Zero orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/cli/generate.ts | 136-141 | Awaited call (`getGitChangedFiles`) without try/catch in the dry-run early-exit path | 🛑 BLOCKER | Bad git ref + `--dry-run` → exits 1 instead of preview. Violates SC-2's "zero LLM, friendly preview" invariant. (CR-01) |
| src/cli/generate.ts | 962-977 | `reused: true` returned even when `stat(prior output)` fails — only `lastRenderedAt` gets set to undefined; the renderer skip still happens | ⚠️ WARNING | If a user deletes a doc from `handover/` and runs `--since`, INDEX will link to a missing file. Renders a 'lying INDEX' state. (CR-02) |
| src/renderers/render-00-index.ts | 56-71 | Non-exhaustive switch on `DocumentStatus['status']` — no `default:` / `never` assertion | ⚠️ WARNING | Future status additions silently return `undefined` from `statusLabel`; TS exhaustiveness check is not engaged. Phase 32 itself added `'reused'` — the precedent shows the file IS regularly extended. (WR-02) |
| src/renderers/render-00-index.ts | 73-77 | `String(i).padStart(2, '0')` — row number is array index, not document number | ⚠️ WARNING | When `--only` filters the doc set, displayed row numbers diverge from canonical doc numbers (e.g. `--only arch` shows `00 INDEX`, `01 arch` instead of `00 INDEX`, `03 arch`). (WR-03) |
| src/regen/dep-graph.ts | 338-345 | Dead `?? '?'` fallback in formatDryRun branch 4 (`since` cannot be undefined when reaching this branch) | ℹ️ INFO | Misleading to readers; if upstream branches ever change, the silent `'(since: ?)'` output is harder to debug than a crash. (WR-05) |
| src/renderers/render-00-index.ts | 22 | `parseInt(key.replace('r', ''), 10)` without filtering NaN | ℹ️ INFO | If extra round keys ever leak in (e.g. via JSON), NaN enters `roundsUsed` Set and YAML serialization breaks. Out-of-scope for this phase. (IN-02) |
| src/regen/dep-graph.ts | 373-376 | `stripUnclaimedPrefix` regex captures everything between `unclaimed:` and `)`, which breaks if file path contains `)` | ℹ️ INFO | Not present in this codebase; cosmetic plumbing risk. (IN-03) |

**Stub-vs-real check:** `requiredSources: []` for `00-index` (src/renderers/registry.ts:46) is a documented intentional value (INDEX always renders; informational only — D-04/D-09), enforced by `if (spec.id === '00-index') continue;` in buildDepGraph (line 114). NOT a stub.

### Human Verification Required

3 items need human testing — listed in the frontmatter `human_verification:` block. Summary:

1. **Full real-LLM run creates the graph** — exercise the post-run rebuild path (src/cli/generate.ts:1099-1108) end-to-end against a real LLM-driven generate; confirm `.handover/cache/dep-graph.json` exists with `graphVersion: 1` and 13 renderer entries.
2. **Surgical `--since` regen against real prior run** — confirm the rendered INDEX shows ≥1 `Reused (last: <ISO>)` row after a one-file change.
3. **CR-02 reproduction** — delete a doc from `handover/` then `--since` — confirm the missing doc is regenerated rather than marked Reused with a broken link.

### Gaps Summary

**One observable truth is partially failing (SC-2):** `--dry-run --since <bad-ref>` exits 1, contradicting SC-2's "Zero LLM calls" exit-0 contract (32-REVIEW.md CR-01). The happy path (no `--since`, or valid `--since`) works correctly. The defect is in the dry-run early-exit branch's unwrapped `await getGitChangedFiles(...)` (src/cli/generate.ts:136-141) — needs a try/catch to degrade to "fallback" semantics and continue producing the preview.

**One semantic-correctness defect (CR-02) does not break any of the 5 success criteria** but produces a "lying INDEX" when a user deletes a prior output and re-runs `--since`. The render loop returns `reused: true` even when `stat(prior file)` fails. Recommended fix: when stat fails, fall through and render the doc normally (correctness over efficiency for a one-off case). This is captured as a Human Verification item, not a BLOCKER gap, because it requires a manual deletion scenario to trigger AND no automated regression test catches it AND SC-1..5 do not explicitly require this case to produce correct output. However it IS a real user-facing regression and a follow-up plan or override is warranted.

**The roadmap success criteria (5 SCs) and the 5 requirement IDs (REGEN-03..07) are otherwise structurally complete:**
- 14 renderers in DOCUMENT_REGISTRY each have curated `requiredSources` (Plan 01)
- Self-contained `src/regen/dep-graph.ts` module with 7 exports, 96.93/100/90/96.73 coverage (Plan 02)
- CLI wired with `--dry-run` early-exit, `--since` graph filter, render-loop short-circuit, post-run rebuild (Plan 03)
- 4 integration tests + 40 unit tests + 5 new registry tests = 49 new tests across the phase
- 511/511 tests passing; typecheck clean; build succeeds

The phase is one fix away (CR-01) from full goal achievement. Recommend gap closure for CR-01 and a follow-up plan or accepted override for CR-02.

---

_Verified: 2026-05-13T13:05:00Z_
_Verifier: Claude (gsd-verifier)_
