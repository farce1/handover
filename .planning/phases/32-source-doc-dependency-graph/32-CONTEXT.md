# Phase 32: Source→Doc Dependency Graph - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a persisted source→renderer dependency graph that powers two new behaviors on `handover generate`:

1. **`--since <ref>` becomes surgical** — only renderers whose source dependencies changed re-run. On a single non-infrastructure file change, fewer than 14 of the 14 renderers execute.
2. **`--dry-run` previews the impact** — prints which renderers would execute and why, with zero LLM calls. Default text output is human-scannable; `--dry-run --json` emits a machine-readable contract for Phase 36's GitHub Action to consume.

The graph is persisted to `.handover/cache/dep-graph.json` (already gitignored via Phase 31 D-10's `.handover/cache` entry). The file carries a `graphVersion` integer; a missing file or version mismatch causes a safe fall back to full regeneration. Infrastructure files (logger, config loader, shared types) are explicitly excluded from source nodes so a change to `logger.ts` alone triggers nothing.

**In scope (REGEN-03..07):**
- Curated `requiredSources` field per renderer in DOCUMENT_REGISTRY
- Graph builder that expands globs into a per-renderer file list
- `--dry-run` flag (text + `--json` modes)
- Wire dep-graph filter into the existing `--since` flow at `src/cli/generate.ts:514`
- `INFRASTRUCTURE_PATHS` exclusion list, co-located with the graph builder
- `INDEX` renderer status reports `reused` for skipped renderers
- `GRAPH_VERSION` constant + version-mismatch fall-back to full regen

**Out of scope for Phase 32:**
- Skipping AI rounds 1–6 on `--since` (rounds always run; round skipping deferred — see Deferred Ideas)
- `--force-regen <renderer>` flag (deferred — see Deferred Ideas)
- Per-package monorepo scope picker (already deferred from Phase 31)
- Telemetry, routing, eval (Phases 33–35)
- User-overridable infrastructure list in `.handover.yml` (curated only for v8.0)

</domain>

<decisions>
## Implementation Decisions

### Graph construction (REGEN-03, REGEN-05)

- **D-01:** Source→renderer dependencies are a **curated static map**. Each renderer declares its dependencies explicitly; no runtime provenance tracking. Predictable, audit-friendly, fast to ship. Maintenance cost is accepted: the engineer who adds/edits a renderer also updates its `requiredSources`.
- **D-02:** Each renderer's source globs live **inline on `DocumentSpec`** as a new `requiredSources: string[]` field. Add the field to `DocumentSpec` in `src/renderers/types.ts`; populate it for every entry in `src/renderers/registry.ts` alongside the existing `requiredRounds`. Co-location ensures the field is updated when a renderer changes — mirrors Phase 31 D-26 ("all new init code goes in `src/cli/init-detectors.ts`"). Reviewers see `requiredRounds` + `requiredSources` in one diff hunk.
- **D-03:** Glob syntax uses **`fast-glob`** (already a critical dep — `.planning/codebase/STACK.md` line 71). Pattern format mirrors how `src/analyzers/file-discovery.ts` already consumes it; no new globbing library introduced.
- **D-04:** **Unclaimed files** — when `--since` reports a changed file that no renderer's `requiredSources` matches, the system **falls back to a full regen**. Conservative by design: false positives (over-regen) are tolerable; false negatives (silently stale docs) are not. Aligned with ROADMAP success criterion #5 (no-graph → full regen).
- **D-05:** **Persisted graph contents** — `.handover/cache/dep-graph.json` stores the **expanded/computed file list per renderer**, not the curated globs. Shape (sketch — planner finalizes):
  ```json
  {
    "graphVersion": 1,
    "builtAt": "2026-05-13T12:34:56Z",
    "renderers": {
      "03-architecture": ["src/orchestrator/dag.ts", "src/ai-rounds/runner.ts", "..."],
      "06-modules": ["..."]
    },
    "infrastructurePaths": ["src/utils/**", "..."]
  }
  ```
  Curated globs are source-of-truth in code; the JSON is the resolved snapshot used at `--since`-time lookups. No re-globbing inside `--since`.
- **D-06:** **Cache rebuild trigger** — the graph is **rebuilt on every full `handover generate` run** (i.e., any run without `--since`). `--since` runs read the graph and never write it. Predictable: doing a full run refreshes the graph for next time. First-time users on `--since` with no prior graph get the full-regen safety fallback (success criterion #5). [User trusted Claude's recommendation here — see Claude's Discretion.]
- **D-07:** **`graphVersion` policy** — `const GRAPH_VERSION = 1` exported from the dep-graph module. Bump manually when the JSON schema or interpretation rules change. Mirrors `CACHE_VERSION` in `src/cache/round-cache.ts:18`. Reviewer-friendly: a PR that changes graph format requires bumping the constant. [Claude's Discretion.]

### Skip scope (REGEN-03, REGEN-07)

- **D-08:** **Skipping applies to renderers only** for Phase 32. All 6 AI rounds always execute on `--since`. Rationale: success criterion #1 says "fewer than 14 renderers execute" — it does not require round skipping. Round skipping would require a `round → renderer` transitive map plus careful invalidation of the compressed-round-output chain (each round reads the prior round's compressed output via `src/context/compressor.ts`); deferring it keeps Phase 32's blast radius small. Cost-savings on `--since` come from: (a) skipping renderer write work, (b) skipping any LLM calls renderers make at their own layer, (c) the existing round-cache (`src/cache/round-cache.ts`) continuing to provide content-hash-based skip on unchanged rounds.
- **D-09:** **Skipped renderers leave their prior output file in place** on disk. The INDEX document (`src/renderers/render-00-index.ts`) reports them as `reused` status. Add a new `'reused'` variant to the `DocumentStatus` enum in `src/renderers/types.ts` alongside the existing `'full'`, `'partial'`, `'static-only'`. Users get a consistent doc set; no stale-file ambiguity, no I/O thrash from idempotent re-writes.
- **D-10:** **`renderer code itself` changes** — if the source of `src/renderers/render-03-architecture.ts` changes, that renderer's output IS affected even when no source-data file changed. The renderer source paths (`src/renderers/render-*.ts`) self-reference: each renderer's `requiredSources` includes its own file. Pragmatic and correct.

### Infrastructure exclusion (REGEN-06)

- **D-11:** **Curated explicit list**, not heuristic. Maintain `INFRASTRUCTURE_PATHS: string[]` (glob patterns) in the dep-graph module. The graph builder filters resolved source nodes against this list; any file matching is excluded from every renderer's effective deps. Predictable, directly testable against success criterion #4. [Claude's Discretion — user trusted recommendation; explicit-over-clever pattern aligns with Phase 31 D-09..D-13 for `.gitignore`.]
- **D-12:** **Initial seed list** (tight, conservative — better to under-exclude than over-exclude):
  - `src/utils/**` (logger, errors, rate-limiter — pure infra per `src/utils/` map)
  - `src/config/loader.ts`
  - `src/config/defaults.ts`
  - `src/config/schema.ts`
  - `src/domain/types.ts`
  - `src/domain/entities.ts`
  - `**/types.ts` (type-only barrel files anywhere in the tree)
  Excludes `src/orchestrator/`, `src/renderers/registry.ts`, `src/analyzers/coordinator.ts` etc. — these ARE high fan-in but they encode WHAT the project does and should still trigger relevant renderers. Each addition justified by "this file has zero semantic content about WHAT the project does".
- **D-13:** **Co-location** — `INFRASTRUCTURE_PATHS` lives in the same module as the graph builder (e.g., `src/regen/dep-graph.ts` — final path is planner's call; see Code Insights). One file owns the curated renderer map + the exclusion list; reviewers see both together.
- **D-14:** **No escape-hatch flag.** A user wanting full regen runs `handover generate` without `--since`. Keeps the CLI surface narrow; matches success criterion #4 wording. `--force-regen <renderer>` captured as a Deferred Idea if user feedback later asks for it.

### `--dry-run` output (REGEN-04)

- **D-15:** **Default text output** — per-renderer list grouped into `Would execute` / `Would skip`, each `execute` line carrying the changed file(s) that triggered it. Example:
  ```
  Dry-run preview (since: HEAD~1)

  Would execute (3):
    03-ARCHITECTURE.md   ← src/orchestrator/dag.ts
    06-MODULES.md        ← src/orchestrator/dag.ts, src/cli/generate.ts
    09-EDGE-CASES.md     ← src/cli/generate.ts

  Would skip (11): 00-INDEX, 01-OVERVIEW, 02-GETTING-STARTED, 04-FILE-STRUCTURE, 05-FEATURES, 07-DEPENDENCIES, 08-ENVIRONMENT, 10-TECH-DEBT, 11-CONVENTIONS, 12-TESTING, 13-DEPLOYMENT

  Zero LLM calls made.
  ```
  Scannable, copy-pasteable, explains the "why" inline — matches success criterion #2.
- **D-16:** **`--dry-run --json` machine-readable mode** ships in Phase 32 so Phase 36's GitHub Action has a stable contract from day one. Shape (sketch — planner finalizes):
  ```json
  {
    "formatVersion": 1,
    "since": "HEAD~1",
    "graphVersion": 1,
    "wouldExecute": [
      { "renderer": "03-architecture", "filename": "03-ARCHITECTURE.md", "reasons": ["src/orchestrator/dag.ts"] }
    ],
    "wouldSkip": ["00-index", "01-overview", "..."],
    "fellBackToFullRegen": false
  }
  ```
  `formatVersion` lets Phase 36 detect compatibility. Bump on shape changes.
- **D-17:** **`--dry-run` without `--since`** — prints the full set with a note that no source filter was applied. Useful for previewing `--only` selections without paying for a full run. Output explicitly states `(no --since: dep-graph not consulted)`. Zero LLM calls either way.
- **D-18:** **`--only` + `--since` intersect semantics** — `--only` selects a renderer set; `--since` filters within that set. `handover generate --dry-run --since HEAD~1 --only architecture,modules` shows only those two, and only if their source deps changed. If neither matches, `wouldExecute` is empty with a reason. Predictable composition; matches Commander.js single-pass option parsing already in use.
- **D-19:** **Exit code** — `--dry-run` always exits 0 (preview, not validation). No "fail when empty" — that's the caller's job if they want it.

### Cross-cutting

- **D-20:** **File location for the new module** — planner's call between `src/regen/dep-graph.ts` (new dir for the smarter-regen track), `src/cache/dep-graph.ts` (alongside `round-cache.ts`), or `src/orchestrator/dep-graph.ts` (this is regen orchestration). Recommend `src/regen/` — Phases 33–34 also live in the smarter-regen track and may want adjacent modules (telemetry, routing). NO collision with `src/analyzers/dependency-graph.ts` which is the STAT-02 package-manifest analyzer — different concept entirely.
- **D-21:** **Wire-in point** — `src/cli/generate.ts:514` (the `if (options.since)` branch) is the only place that consumes the graph. Today this block computes `gitChangedFiles`; after Phase 32 it additionally calls a `filterRenderersByChangedFiles(gitChangedFiles, graph) → affectedRendererIds` helper. The render loop (later in `runGenerate`) checks affected-set membership before invoking each `DocumentSpec.render`.
- **D-22:** **No new gitignore work** — `.handover/cache/` already covered by Phase 31 D-10. Verify in plan that `dep-graph.json` lives under `.handover/cache/` (it does — ROADMAP success criterion #3).
- **D-23:** **Test coverage** — target the same 90/90/90/85 thresholds enforced in CI. Tests must cover: success criterion #1 (single-file change → fewer than 14 renderers), #2 (`--dry-run` produces output with zero LLM calls — assertable via provider-call mock), #3 (delete dep-graph → safe full regen), #4 (`logger.ts` alone changed → zero renderers), #5 (first-run no-graph → full regen).

### Claude's Discretion

- **D-06** (cache rebuild trigger), **D-07** (graphVersion policy), **D-11** (curated vs heuristic infra exclusion): user said "i trust your recommendation, that you will bring best practices and robust solution" three times. Locked in the Recommended option for each. Planner/executor may revise within the spirit of these defaults if research surfaces a concrete reason, but the user has signaled they're happy delegating these specifics.
- Exact module path (`src/regen/dep-graph.ts` vs `src/cache/dep-graph.ts` vs `src/orchestrator/dep-graph.ts`) — planner picks; recommendation is `src/regen/`.
- Exact JSON field names in `dep-graph.json` and `--dry-run --json` output beyond the sketched shape — planner finalizes with the goal of stability for Phase 36 consumption.
- Whether the graph builder runs in parallel with static analysis or as a serial post-step — planner picks based on dependency ordering.
- `--dry-run` color/formatting in TTY mode — follow existing `src/ui/` conventions (`picocolors`, `sisteransi`).
- The exact set of self-reference rules for renderer source files (e.g., does a renderer's `requiredSources` always include `src/renderers/render-NN-*.ts` automatically via a helper, or must each entry list its own path explicitly?) — planner picks; recommendation: helper that auto-prepends the renderer's own source path so the registry stays terse.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v8.0 milestone documents
- `.planning/PROJECT.md` — v8.0 milestone scope, explicit non-goals (Phase 32 is NOT eval/routing/telemetry), key decisions table
- `.planning/REQUIREMENTS.md` §"REGEN" — full specs for REGEN-03..07 (this phase owns all five)
- `.planning/ROADMAP.md` §"Phase 32: Source→Doc Dependency Graph" — phase goal, 5 success criteria, requirement mapping
- `.planning/STATE.md` §"Accumulated Context — Decisions" — v8.0 roadmap decisions (Phase 32 parallel-eligible with 31)

### Prior phase context (carried forward)
- `.planning/phases/31-init-wizard-action-scaffold/31-CONTEXT.md` — Phase 31 D-09..D-13 (gitignore patching pattern), D-26 (module co-location), D-29 (test coverage targets). Same milestone; `.handover/cache/` already gitignored.

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` — DAG-based orchestration, 14-renderer pipeline, graceful-degradation pattern
- `.planning/codebase/STACK.md` — `fast-glob@3.3.3`, `simple-git@3.31.1`, `zod@3.25.76` (validate dep-graph JSON shape with Zod)
- `.planning/codebase/STRUCTURE.md` §"Where to Add New Code" — renderer/analyzer placement rules (planner uses this to confirm `src/regen/` is the right new dir)
- `.planning/codebase/TESTING.md` — test framework (Vitest), memfs pattern, coverage thresholds

### Existing source (must read before modifying)
- `src/renderers/registry.ts` — `DOCUMENT_REGISTRY` (14 entries, `requiredRounds` per entry); the place to add `requiredSources`
- `src/renderers/types.ts` — `DocumentSpec`, `DocumentStatus` enum (add `'reused'` variant)
- `src/cli/generate.ts:500-620` — current `--since` flow: `getGitChangedFiles()`, `isGitIncremental`, packing branch. New dep-graph filter wires in here.
- `src/cli/generate.ts` (entry-point area) — Commander flag registration for `--dry-run` (new) and existing `--since`
- `src/cache/round-cache.ts:1-50` — reference pattern: `CACHE_VERSION` constant, JSON-per-entry, stale-version invalidation, `ensureGitignored()` call. New dep-graph cache MIRRORS this structure.
- `src/analyzers/coordinator.ts` — runStaticAnalysis() entry; relevant if planner decides to build the graph from analyzer outputs rather than purely from globs
- `src/analyzers/dependency-graph.ts` — **DO NOT CONFUSE**: this is STAT-02 (package manifests like `package.json`/`Cargo.toml`), NOT the source→renderer graph this phase delivers. New module must use a different filename to avoid confusion.
- `src/orchestrator/dag.ts` — DAGOrchestrator; renderer dispatch happens here, this is where the skip decision must be honored
- `src/renderers/render-00-index.ts` — INDEX renderer; needs awareness of the new `'reused'` status to label skipped docs

### External standards
- `fast-glob` glob syntax (already in use): <https://github.com/mrmlnc/fast-glob#pattern-syntax>
- Conventional Commits (commit messages): existing project convention

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`DOCUMENT_REGISTRY`** in `src/renderers/registry.ts:28` — 14 DocumentSpec entries; the canonical renderer set. Add `requiredSources: string[]` field to every entry. Each entry's `aliases` field already gives CLI-friendly names for `--only`/`--dry-run` reasoning.
- **`getGitChangedFiles()`** (referenced at `src/cli/generate.ts:515`) — already returns `{ kind: 'changed' | 'fallback', changedFiles: Set<string> }`. Phase 32's filter operates on `changedFiles`; no need to reinvent change detection.
- **`fast-glob`** (already a dep, `package.json`) — drives `src/analyzers/file-discovery.ts`. Use the same `glob.isMatch` / pattern-API for `requiredSources` expansion. No new dependency.
- **`RoundCache`** pattern in `src/cache/round-cache.ts` — `CACHE_VERSION`, `ensureGitignored()`, content-hash invalidation. **Mirror this shape** for the dep-graph cache: same `cacheDir` convention (`.handover/cache/`), same version-bump-on-schema-change discipline. Existing `ensureGitignored()` already covers `.handover/cache`.
- **`DocumentStatus`** enum in `src/renderers/types.ts` — currently `'full' | 'partial' | 'static-only'` (verify exact union at plan time). Add `'reused'` variant; downstream `renderIndex` in `src/renderers/render-00-index.ts` already iterates statuses for the INDEX table.
- **`runStaticAnalysis()`** in `src/analyzers/coordinator.ts` — emits a file-level inventory. If the graph builder needs to validate that `requiredSources` globs actually match real files in the repo, this is the inventory source.
- **`HandoverError`** in `src/utils/errors.ts` — the project's error pattern. Use for graph-loading / graph-version-mismatch error paths (though success criterion #5 says these degrade silently to full regen, not error out).
- **Commander.js** flag registration in `src/cli/index.ts` — pattern for adding `--dry-run` and any `--json` modifier. Mirror how `--since` was added (Phase 27 / v7.0).

### Established Patterns

- **Versioned JSON cache** — `CACHE_VERSION = 2` in `src/cache/round-cache.ts:18`; stale on version mismatch. Phase 32 mirrors this exactly with `GRAPH_VERSION = 1`.
- **Graceful degradation** — analyzers and rounds never throw; they return empty/fallback results. Dep-graph follows the same rule: load failure → full regen, never throw at the user.
- **Co-located test files** — `*.test.ts` next to source, `vi.hoisted()` for mock setup, `memfs` for filesystem isolation (per `.planning/codebase/TESTING.md`). New tests follow this.
- **Zod validation at boundaries** — config, API responses, analyzer outputs all validated. Dep-graph JSON should ship with a Zod schema (`DepGraphSchema` in `src/regen/`) for invariant enforcement on load.
- **DocumentSpec is THE renderer contract** — all renderer metadata is on it (`requiredRounds`, `aliases`, `category`, `render`). `requiredSources` extends the contract; consumers (registry iteration, INDEX, `--only` resolver) read it via the spec, not via a side table.
- **No silent over-eager logging** — `--verbose` gates anything beyond fatal errors; `--dry-run` output is always emitted (it's the whole point of the command).

### Integration Points

- **`src/cli/index.ts`** — Commander.js registration: add `--dry-run` (boolean) and `--json` (modifier on `--dry-run`) to the `generate` command. Existing `--since` and `--only` flags stay; their semantics combine per D-18.
- **`src/cli/generate.ts:514`** — primary wire-in: after `getGitChangedFiles()` resolves, call `filterRenderersByChangedFiles(gitChangedFiles, graph) → Set<string>`. The render loop later in `runGenerate` checks this set before each `DocumentSpec.render` call. Same flow handles `--dry-run`: print and exit before any LLM call is issued.
- **`src/renderers/registry.ts`** — add `requiredSources` to every entry; this is a 14-entry edit, conservative globs per entry.
- **`src/renderers/types.ts`** — extend `DocumentSpec` interface; extend `DocumentStatus` enum (`'reused'`).
- **`src/renderers/render-00-index.ts`** — handle the new `'reused'` status when rendering the INDEX table (icon, label).
- **`src/cache/`** vs **`src/regen/`** — new module placement is planner's call. Strong recommendation: `src/regen/` (Phases 33–35 also land here), file name `dep-graph.ts` (CACHE-style sibling) or `source-doc-graph.ts` (unambiguous). Must NOT collide with `src/analyzers/dependency-graph.ts` (STAT-02 package-manifest analyzer).
- **No `src/config/schema.ts` changes** for Phase 32. No new user-facing config keys; the curated map + INFRASTRUCTURE_PATHS are code-owned.

### Pitfalls (surfaced during discussion)

- **Don't name the new module `dependency-graph.ts`** — name collision with `src/analyzers/dependency-graph.ts` (STAT-02 package manifests). Use `dep-graph.ts` or `source-doc-graph.ts`.
- **Don't forget the renderer self-reference** — a change to `src/renderers/render-03-architecture.ts` itself should re-trigger 03-architecture. Each renderer's `requiredSources` includes its own source path (either explicitly or via a helper that auto-prepends it).
- **Don't skip rounds in v8.0** — that's a v8.x+ optimization (Deferred Idea). Phase 32's success criteria do not require it; attempting it inflates blast radius (compressed-round-output chain, round-cache cross-dependency).
- **Don't widen the infrastructure seed list aggressively** — better to under-exclude (rare false-positive renderer triggers) than over-exclude (silently stale docs). Add entries only when their omission causes a real regen-cost problem.

</code_context>

<specifics>
## Specific Ideas

- The `--dry-run` text output should be **scannable in 2 seconds** — three short blocks (`Would execute (N)`, list with arrows, `Would skip (M)`, comma list, `Zero LLM calls made.`). No box-drawing, no banners; minimal chrome.
- The `--dry-run --json` shape is an **API contract for Phase 36**. Once shipped, breaking changes require a `formatVersion` bump. Phase 36 ships in v8.0 too — keep the v0 shape simple to expand later (e.g., adding `estimatedCost` later is backward-compatible; renaming `wouldExecute` is not).
- The `INFRASTRUCTURE_PATHS` list should be **justifiable line-by-line** in the code, not handwaved. Inline comments are acceptable here ("logger has zero domain content" beats a wall of unexplained globs).
- The renderer `'reused'` status in INDEX should **carry the last-run timestamp** so users can tell at a glance how fresh each doc is — pull from the file mtime, or from a `lastRenderedAt` stored alongside the dep-graph.

</specifics>

<deferred>
## Deferred Ideas

- **Round skipping under `--since`** — extend the dep-graph to compute affected rounds (transitive from affected renderers via `requiredRounds`) and skip rounds whose output isn't needed downstream. Reason: bigger LLM-cost win, but requires careful invalidation of the compressed-round-output chain (each round reads prior round's compressed output) and a robust "skipped round's cached output is still valid" check. Trigger to revisit: telemetry (Phase 33) shows `--since` runs still cost meaningful LLM budget. Likely v8.x phase.
- **`--force-regen <renderer>` flag** — targeted opt-out of dep-graph filtering when prose itself is wrong (not when source changed). Reason: nice-to-have; full regen via no `--since` covers the same need today. Trigger to revisit: user feedback or 3+ instances of "I had to delete `dep-graph.json` to force a refresh."
- **User-overridable `.handover.yml` infrastructure list** — let users extend `INFRASTRUCTURE_PATHS` for their own project conventions. Reason: handover's own infra is the only consumer in v8.0; opening this surface adds schema churn (`HandoverConfigSchema` change) for unproven need. Trigger to revisit: handover ships as a library or a third-party adopter requests it.
- **Estimated cost / token savings in `--dry-run`** — show "would save ~$0.12 vs full run" in the rich text mode. Reason: cost estimates are imprecise (depend on provider, model, content size); risk of "actual cost was different" bug reports. Better to add after telemetry (Phase 33) gives a real per-renderer cost baseline. Trigger to revisit: after Phase 33 ships and per-renderer cost data is collected.
- **Runtime provenance refinement of the curated graph** — analyzers/rounds emit which files they actually read; graph is union of curated + observed. Reason: curated map drifts as renderers evolve; runtime confirmation catches missed deps. Trigger to revisit: post-v8.0 if curated map proves error-prone in practice.

### Reviewed Todos (not folded)

None — no pending todos surfaced for Phase 32 by `cross_reference_todos`. (Phase 35 eval-rubric and Phase 34 modelHint classification are tagged for their own phases per STATE.md.)

</deferred>

---

*Phase: 32-source-doc-dependency-graph*
*Context gathered: 2026-05-13*
