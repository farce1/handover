---
phase: 32-source-doc-dependency-graph
plan: 02
subsystem: regen
tags:
  - dep-graph
  - regen
  - phase-32
  - regen-03
  - regen-05
  - regen-06
  - regen-07
requirements:
  - REGEN-03
  - REGEN-05
  - REGEN-06
  - REGEN-07
dependency_graph:
  requires:
    - src/renderers/types.ts (DocumentSpec.requiredSources field — added by Plan 01)
    - fast-glob ^3.3.3 (default export)
    - zod ^4.3.6 (z.literal, z.record, safeParse)
    - node:fs/promises + node:fs (existsSync, readFile, writeFile, mkdir)
  provides:
    - "GRAPH_VERSION = 1 (export)"
    - "INFRASTRUCTURE_PATHS (curated D-12 list, readonly string[])"
    - "DepGraphSchema (zod) + DepGraph type"
    - "FilterDecision + DryRunDecision interfaces"
    - "buildDepGraph(registry, rootDir) → Promise<DepGraph>"
    - "saveDepGraph(rootDir, graph) → Promise<void>"
    - "loadDepGraph(rootDir) → Promise<DepGraph | null>"
    - "filterRenderersByChangedFiles(changed, graph) → FilterDecision"
    - "computeDryRunDecision({ selectedDocs, graph, changedFiles, since }) → DryRunDecision"
    - "formatDryRun(decision) → string (human text, ends with 'Zero LLM calls made.')"
    - "formatDryRunJson(decision) → string (Phase 36 contract, formatVersion=1)"
  affects:
    - src/cli/generate.ts (Plan 03 — wires loadDepGraph + filter + dry-run formatters into the generate flow)
    - Phase 36 GitHub Action (consumes formatDryRunJson output verbatim)
tech_stack:
  added: []
  patterns:
    - z.literal(GRAPH_VERSION) for silent version-mismatch fallback (mirrors RoundCache CACHE_VERSION pattern)
    - safeParse-returns-null I/O boundary (loadDepGraph never throws — graceful degradation)
    - Pre-built renderer→Set<file> maps for O(1) lookup in filter (no re-globbing at --since-time)
    - Branch-based pure state machine in computeDryRunDecision (5 explicit branches, no shared mutable state)
key_files:
  created:
    - src/regen/dep-graph.ts (404 lines including doc comments)
    - src/regen/dep-graph.test.ts (642 lines, 40 tests)
  modified: []
decisions:
  - "buildDepGraph computes infrastructureFiles ONCE (before the renderer loop) and shares the Set across all renderer filters — avoids 14× redundant glob expansions"
  - "infrastructureFiles is stored as a sidecar array in dep-graph.json (separate from infrastructurePaths which stores the curated globs for audit). RESEARCH §'Public API Contracts' debated this; the dual-field approach won — globs are auditable, files are fast"
  - "computeDryRunDecision is structured as 5 explicit early-return branches rather than nested conditionals; reviewer-friendly and trivially covers all paths in tests"
  - "INDEX (00-index) is ALWAYS in wouldExecute with reason '(always renders)' regardless of branch (RESEARCH Open Question 4 — bias toward inclusion for transparency)"
  - "formatDryRun text format: '(unclaimed files forced full regen: <list>)' header line on fullRegen=true (D-15 variation); '(no dep-graph: would regen all selected docs)' on noGraph"
  - "formatDryRunJson maps wouldExecute entries from {rendererId,filename,reasons} to {renderer,filename,reasons} (renames per Phase 36 contract); wouldSkip flattens to a string[] of renderer ids (saves bytes in 65k-char PR comments)"
  - "Did NOT implement atomic-rename for saveDepGraph (T-32-B6 deferred): corrupt JSON → safeParse fails → null → safe full regen. Acceptable in v8.0; revisit if telemetry surfaces spurious full regens"
metrics:
  duration: 5m02s
  completed: "2026-05-13T12:43:30Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  new_tests_added: 40
  coverage_dep_graph_ts:
    lines: 96.73
    functions: 100
    branches: 90
    statements: 96.93
---

# Phase 32 Plan 02: Source-Doc Dependency Graph Module Summary

Phase 32 Plan 02 ships the self-contained `src/regen/dep-graph.ts` module that owns the entire smarter-regen feature: graph build, persistence, version-mismatch fall-back, infrastructure exclusion, surgical filter, and `--dry-run` formatters (text + JSON). The Phase 36 JSON contract is pinned by an in-source snapshot test so any future shape change requires a `formatVersion` bump.

## Outcome

- New module at `src/regen/dep-graph.ts` (404 LoC including JSDoc) exports 7 public functions, `GRAPH_VERSION`, `INFRASTRUCTURE_PATHS`, `DepGraphSchema`, and the `DepGraph`/`FilterDecision`/`DryRunDecision` types.
- Sibling test file `src/regen/dep-graph.test.ts` (642 LoC) ships 40 unit tests in 10 describe blocks, covering SC-1, SC-3, SC-4, SC-5, REGEN-03/05/06/07, and the Phase 36 JSON contract snapshot.
- Per-file coverage on `src/regen/dep-graph.ts`: **96.93% statements / 100% functions / 90% branches / 96.73% lines** — clears the 90/90/85/90 thresholds with margin.
- Full suite (`npm run test -- --coverage`) passes; aggregate coverage 95.99/85.6/96.95/96.2 still over thresholds (the Phase 32 module did not regress the global gate).
- `npm run typecheck` exits 0.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write src/regen/dep-graph.test.ts (RED) — all unit tests before implementation | `db60b02` | src/regen/dep-graph.test.ts |
| 2 | Implement src/regen/dep-graph.ts (GREEN) — make all 40 unit tests pass at 90/90/85/90 coverage | `9b855be` | src/regen/dep-graph.ts |

## INFRASTRUCTURE_PATHS list shipped (verbatim — cross-phase reference)

```typescript
export const INFRASTRUCTURE_PATHS: readonly string[] = [
  'src/utils/**',          // logger, errors, rate-limiter — pure infra, zero domain content
  'src/config/loader.ts',  // pure config plumbing
  'src/config/defaults.ts',// config defaults — values, not behavior
  'src/config/schema.ts',  // Zod schemas — type-shape only
  'src/domain/types.ts',   // domain type barrel — type-only
  'src/domain/entities.ts',// entity factories — type-shape construction
  '**/types.ts',           // type-only barrel files anywhere in the tree
] as const;
```

Matches D-12 seed list verbatim, including the inline justification comments. Does NOT include `src/orchestrator/`, `src/renderers/registry.ts`, or `src/analyzers/coordinator.ts` (D-12 final paragraph — those encode WHAT the project does).

## Phase 36 JSON contract (pinned)

`formatDryRunJson` produces exactly these 7 keys (asserted via `Object.keys(parsed).sort()` in the snapshot test):

```
fellBackToFullRegen | formatVersion | graphVersion | noGraph | since | wouldExecute | wouldSkip
```

Sample output for the canonical fixture:

```json
{
  "formatVersion": 1,
  "since": "HEAD~1",
  "graphVersion": 1,
  "wouldExecute": [
    {
      "renderer": "03-architecture",
      "filename": "03-ARCHITECTURE.md",
      "reasons": ["src/orchestrator/dag.ts"]
    }
  ],
  "wouldSkip": ["01-project-overview"],
  "fellBackToFullRegen": false,
  "noGraph": false
}
```

Stability contract:
- `formatVersion` is the only field Phase 36 reads first; any future shape change MUST bump this.
- `since` is `null` (JSON) when `--since` not provided.
- `graphVersion` is `null` when no graph existed at run time.
- `wouldSkip` is a FLAT string array of renderer ids (NOT objects) — saves bytes in 65k-char PR comments per ACTN-03.
- `wouldExecute` inner entries use `renderer` (not `rendererId`) per the Phase 36 contract.
- The `noGraph` and `fellBackToFullRegen` booleans are independent — both can be true (no graph + `--since` provided).

The `Object.keys(...).sort()` assertion in `Phase 36 JSON contract — fixture snapshot` is the regression guard; any drift in field set fails this test immediately.

## Behavior summary per public function

| Function | Purity | Throws? | Notes |
|----------|--------|---------|-------|
| `buildDepGraph(registry, rootDir)` | async, no shared state | propagates fast-glob errors (caller decides) | One glob per non-INDEX renderer + one for INFRASTRUCTURE_PATHS; sorted output |
| `saveDepGraph(rootDir, graph)` | async I/O | propagates write errors | Pretty-printed JSON; no gitignore patching (D-22) |
| `loadDepGraph(rootDir)` | async I/O | **never throws** | Returns null on miss/version-mismatch/malformed/shape-violation (SC-3, SC-5) |
| `filterRenderersByChangedFiles(changed, graph)` | pure sync | no | Infra short-circuit (SC-4); unclaimed → `fullRegen:true` (D-04) |
| `computeDryRunDecision({...})` | pure sync | no | 5 explicit branches; INDEX always in `wouldExecute` |
| `formatDryRun(decision)` | pure sync | no | Trailing `Zero LLM calls made.` literal (SC-2 contract) |
| `formatDryRunJson(decision)` | pure sync | no | Phase 36 contract; 7 fixed keys |

## Coverage breakdown

Per-file coverage on `src/regen/dep-graph.ts` (from `coverage/coverage-summary.json` after `npm run test -- --coverage`):

| Metric | % | Threshold | Margin |
|--------|---|-----------|--------|
| Statements | 96.93 | 90 | +6.93 |
| Functions | 100 | 90 | +10.00 |
| Branches | 90 | 85 | +5.00 |
| Lines | 96.73 | 90 | +6.73 |

Uncovered lines (336, 337, 352): minor branch fall-through in `formatDryRun` header construction when `noGraph` is true without `--since` and the `stripUnclaimedPrefix` fallback regex. Both paths are reachable but rare; they don't move the per-file gate.

## Test count by describe block

| Block | Tests |
|-------|-------|
| `GRAPH_VERSION constant` | 1 |
| `INFRASTRUCTURE_PATHS list` | 3 |
| `buildDepGraph` | 5 |
| `saveDepGraph` | 3 |
| `loadDepGraph` | 5 |
| `filterRenderersByChangedFiles` | 6 |
| `computeDryRunDecision` | 5 |
| `formatDryRun` | 6 |
| `formatDryRunJson` | 4 |
| `DepGraphSchema` | 2 |
| **Total** | **40** |

The plan estimated "~35-50 tests"; 40 lands comfortably in range. Additional `DepGraphSchema` direct shape checks (2 tests) and a 4th `formatDryRunJson` test (`since undefined → null`) were added beyond the strict minimum to keep branches above 85% threshold and exercise the JSON `null` projection paths.

## Composer guidance for Plan 03 (`src/cli/generate.ts` wire-in)

Plan 03 wires this module into the CLI. Recommended composition (Plan 03 may inline or extract a small `runDryRun` helper from `dep-graph.ts`; both are acceptable):

```typescript
// In src/cli/generate.ts (dry-run early-exit branch)
import {
  loadDepGraph,
  computeDryRunDecision,
  formatDryRun,
  formatDryRunJson,
} from '../regen/dep-graph.js';

if (options.dryRun) {
  const graph = await loadDepGraph(rootDir);
  let changedFiles: Set<string> | undefined;
  if (options.since) {
    const gitResult = await getGitChangedFiles(rootDir, options.since);
    changedFiles = gitResult.kind === 'ok' ? gitResult.changedFiles : undefined;
  }
  const decision = computeDryRunDecision({
    selectedDocs,
    graph,
    changedFiles,
    since: options.since,
  });
  process.stdout.write(options.json ? formatDryRunJson(decision) : formatDryRun(decision));
  process.exit(0);
}
```

For the `--since` branch (non-dry-run), Plan 03 uses `filterRenderersByChangedFiles(changedFiles, graph)` directly and threads `decision.affected` into the render loop. The render loop in `generate.ts` then skips docs whose id is not in `affected` (and not `00-index`), pushing `status: 'reused'` with `lastRenderedAt` from the output file's mtime.

This plan deliberately does NOT export a `runDryRun(rootDir, options)` composer — Plan 03 owns the CLI surface and that's where the composition should live (composition over hidden coupling). The module's public API is intentionally orthogonal primitives.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes triggered; no Rule 4 architectural checkpoints needed; no auth gates encountered.

Two minor additions beyond the plan's minimum:
1. Added a 10th `describe('DepGraphSchema')` block with 2 tests for direct Zod shape checks. The plan said "≥9 describe blocks"; ten ensures the Zod schema is reachable in unit tests even if `loadDepGraph` ever stops calling it.
2. Added one extra `formatDryRunJson` test (`since undefined → null` projection) to keep the JSON `null` coercion paths covered.

Both additions are pure test-surface increases — they don't change the implementation contract or deviate from the plan's `<behavior>` spec.

## Threat Flags

None. The threat model in the plan (T-32-B1 through T-32-B6) was implemented as designed:

| Threat ID | Implementation | Verified by |
|-----------|----------------|-------------|
| T-32-B1 (crafted dep-graph.json) | `DepGraphSchema.safeParse` returns null on any mismatch | `loadDepGraph` 5 tests covering missing/v0/malformed/shape-violation/valid |
| T-32-B2 (corrupt JSON crash) | `try/catch` around `JSON.parse` + safeParse | `loadDepGraph` malformed-JSON test |
| T-32-B3 (symlink escape via fast-glob) | `followSymbolicLinks: false` on every `fg()` call | `buildDepGraph` fast-glob options-assertion test |
| T-32-B4 (path traversal via crafted glob) | `accept` — patterns are code-defined constants | N/A (no user input) |
| T-32-B5 (ReDoS via crafted glob) | `accept` — picomatch is hardened; patterns are constants | N/A (no user input) |
| T-32-B6 (concurrent CI write race) | `accept` — corrupted JSON → safeParse fails → null → safe full regen. Atomic rename deferred (note for Phase 36 if telemetry shows it) | Pitfall documented; no rename impl |

No new network surface, auth path, file-access pattern outside of `.handover/cache/`, or schema change at a trust boundary was introduced.

## Known Stubs

None. Every export is fully implemented and exercised by tests.

## Deferred / Out-of-Scope Items (for Plan 03 + Phase 36 awareness)

- **Atomic-rename for `saveDepGraph`** (T-32-B6): currently a single `writeFile`. If parallel CI runs cause corrupted writes, telemetry will surface it (Phase 33). Mitigation when needed: write to `dep-graph.json.tmp` then `rename` (atomic on POSIX, mostly atomic on Windows since the rename is on the same volume). Not implemented in v8.0 because the safeParse-returns-null fallback handles the worst case (corrupt JSON → full regen).
- **`runDryRun` composer helper**: deliberately not exported. Plan 03 composes the pure primitives directly in `src/cli/generate.ts`. If Phase 36 ever needs to invoke dry-run from outside the CLI, that's the time to extract.
- **Phase 33 telemetry hooks**: `buildDepGraph` could emit a "n renderers, m infra files" metric. Not implemented in this plan — telemetry harness lands in Phase 33.

## TDD Gate Compliance

Plan declares both tasks as `tdd="true"`. Gate sequence verified in git log:

| Gate | Commit | Type | Verified |
|------|--------|------|----------|
| RED (failing test commit) | `db60b02` | `test(32-02): add failing tests for dep-graph module (RED)` | Pre-Task-2 run: `Cannot find module '/src/regen/dep-graph.js'` (module-resolution failure — canonical RED state per plan acceptance criterion) |
| GREEN (passing impl commit) | `9b855be` | `feat(32-02): implement source-doc dependency graph module (GREEN)` | Post-Task-2 run: `Test Files 1 passed (1), Tests 40 passed (40)` |
| REFACTOR | N/A | (not needed) | Implementation was clean on first pass; no refactor commit |

The RED state was confirmed by running `npx vitest run src/regen/dep-graph.test.ts` after Task 1 commit but before Task 2 commit — output showed module-resolution failure, which is the plan-specified RED indicator for a greenfield module. GREEN was confirmed after Task 2 with all 40 tests passing and per-file coverage clearing the gate.

## Self-Check: PASSED

- File `src/regen/dep-graph.test.ts` created: FOUND
  - `grep -c "^describe(" src/regen/dep-graph.test.ts` → 10 (≥9 required)
  - `grep -n "SC-1:" src/regen/dep-graph.test.ts` → line 265
  - `grep -n "SC-4:" src/regen/dep-graph.test.ts` → line 275
  - `grep -n "Phase 36 JSON contract" src/regen/dep-graph.test.ts` → line 575
  - `grep -n "vi.hoisted" src/regen/dep-graph.test.ts` → line 6
  - `grep -n "vol.reset" src/regen/dep-graph.test.ts` → line 35
- File `src/regen/dep-graph.ts` created: FOUND
  - `grep -n "export const GRAPH_VERSION = 1 as const" src/regen/dep-graph.ts` → line 22
  - `grep -n "export const INFRASTRUCTURE_PATHS" src/regen/dep-graph.ts` → line 33
  - `grep -c "'src/utils/\*\*'" src/regen/dep-graph.ts` → 1 (D-12 seed entry verbatim)
  - `grep -n "z.literal(GRAPH_VERSION)" src/regen/dep-graph.ts` → line 57 (inside DepGraphSchema)
  - `grep -n "z.record(z.string(), z.array(z.string()))" src/regen/dep-graph.ts` → line 59
  - `grep -nE "^export (async )?function ..." src/regen/dep-graph.ts` → 7 matches (buildDepGraph, saveDepGraph, loadDepGraph, filterRenderersByChangedFiles, computeDryRunDecision, formatDryRun, formatDryRunJson)
  - `grep -n "ensureGitignored" src/regen/dep-graph.ts` → only the negation note ("NOTE: NO `ensureGitignored()` call"); function is never invoked
  - `grep -n "Zero LLM calls made\." src/regen/dep-graph.ts` → line 367 (literal in formatDryRun)
- Commit `db60b02` (Task 1 RED): FOUND in `git log --oneline -5`
- Commit `9b855be` (Task 2 GREEN): FOUND in `git log --oneline -5`
- Test gate: `npx vitest run src/regen/dep-graph.test.ts` → 40/40 passing
- Per-file coverage gate (json-summary): `{"lines":96.73,"functions":100,"branches":90,"statements":96.93,"ok":true}` → exit 0
- Full suite gate: `npm run test -- --coverage` → all files passing; aggregate thresholds clear
- Typecheck gate: `npm run typecheck` → exit 0
