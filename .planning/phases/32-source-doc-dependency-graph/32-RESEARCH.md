# Phase 32: Source→Doc Dependency Graph - Research

**Researched:** 2026-05-13
**Domain:** TypeScript CLI — build-time source-to-renderer map, persisted JSON cache, surgical `--since` filtering, `--dry-run` preview
**Confidence:** HIGH (CONTEXT.md decisions are locked; codebase patterns are verified in-tree)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Verbatim from `32-CONTEXT.md <decisions>`:

- **D-01:** Curated static map (no runtime provenance). Predictable, audit-friendly.
- **D-02:** `requiredSources: string[]` lives inline on `DocumentSpec` in `src/renderers/types.ts`; populate every entry in `src/renderers/registry.ts`.
- **D-03:** Glob syntax via `fast-glob` (already a dep — see `src/analyzers/file-discovery.ts`).
- **D-04:** Unclaimed file (not matching any renderer's `requiredSources`) → **safe full regen**.
- **D-05:** Persisted graph stores the **expanded/computed file list per renderer**, not the curated globs. No re-globbing at `--since`-time.
- **D-06:** Graph rebuilt on every full `handover generate` (any run without `--since`). `--since` is read-only.
- **D-07:** `const GRAPH_VERSION = 1` exported from the dep-graph module. Bump manually on schema change. Mirrors `CACHE_VERSION = 2` at `src/cache/round-cache.ts:16`.
- **D-08:** Skipping applies to **renderers only**. AI rounds always execute on `--since`.
- **D-09:** Skipped renderers leave their prior output in place; INDEX reports `'reused'`. Add `'reused'` to the `DocumentStatus['status']` union in `src/renderers/types.ts`.
- **D-10:** Each renderer's `requiredSources` includes its own source path (helper auto-prepend OK).
- **D-11..D-14:** Curated `INFRASTRUCTURE_PATHS` list co-located with graph builder. No escape-hatch flag.
- **D-15..D-19:** `--dry-run` text format is scannable; `--dry-run --json` has `formatVersion`; exit 0 always; `--only` + `--since` intersect.
- **D-20:** New module **recommended at `src/regen/dep-graph.ts`**. MUST NOT collide with `src/analyzers/dependency-graph.ts` (STAT-02 package-manifest analyzer).
- **D-21:** Wire-in point — `src/cli/generate.ts:514` (`if (options.since)` branch). New helper `filterRenderersByChangedFiles(changedFiles, graph) → Set<rendererId>`.
- **D-22:** No new gitignore work — `.handover/cache` already covered by Phase 31 D-10.
- **D-23:** Tests cover all 5 success criteria; coverage thresholds match vitest.config.ts (see "Project Constraints" below).

### Claude's Discretion

Verbatim from `32-CONTEXT.md <decisions>` § "Claude's Discretion":

- D-06 (cache rebuild trigger), D-07 (graphVersion policy), D-11 (curated vs heuristic infra exclusion) — user delegated. Recommendation locked.
- Exact module path (`src/regen/dep-graph.ts` vs alternatives) — planner picks; recommendation `src/regen/`.
- Exact JSON field names in `dep-graph.json` and `--dry-run --json` output — planner finalizes for Phase 36 stability.
- Whether graph builder runs in parallel with static analysis or as a serial post-step — planner picks based on dependency ordering.
- `--dry-run` color/formatting in TTY mode — follow `src/ui/` conventions (`picocolors`, `sisteransi`).
- Renderer self-reference helper API — planner picks; recommendation: helper auto-prepends so registry stays terse.

### Deferred Ideas (OUT OF SCOPE)

Verbatim from `32-CONTEXT.md <deferred>`:

- **Round skipping under `--since`** — defer to v8.x (REGEN-09 trigger: telemetry shows rounds dominate cost).
- **`--force-regen <renderer>` flag** — defer; full regen via no-`--since` covers the need today.
- **User-overridable `.handover.yml` infrastructure list** — defer until external adopter requests it.
- **Estimated cost / token savings in `--dry-run`** — defer until Phase 33 (telemetry) provides a per-renderer cost baseline.
- **Runtime provenance refinement of curated graph** — defer to post-v8.0 (REGEN-10).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REGEN-03 | `handover generate --since <ref>` consults persisted graph; re-runs only affected renderers | §"Wire-In Points" §"Public API Contracts" — `filterRenderersByChangedFiles` + render-loop guard at `generate.ts:894-917` |
| REGEN-04 | `handover generate --dry-run` previews which renderers would execute, zero LLM calls | §"--dry-run wiring" — flag registration in `src/cli/index.ts`, early-exit branch before any provider/auth setup in `generate.ts` |
| REGEN-05 | Graph persisted at `.handover/cache/dep-graph.json` with `graphVersion`; stale → safe rebuild | §"Public API Contracts" — Zod schema + `loadDepGraph()` returns `null` on mismatch/missing → full regen |
| REGEN-06 | Infrastructure files excluded — `logger.ts` alone triggers nothing | §"INFRASTRUCTURE_PATHS application" — apply exclusion at materialization time (filter resolved file lists) AND at filter-lookup time (skip infra hits in `filterRenderersByChangedFiles`) |
| REGEN-07 | Single non-infra file change → fewer than 14 renderers execute (verifiable) | §"Test Strategy Per Success Criterion" — fixture test SC-1 in `src/regen/dep-graph.test.ts` |

</phase_requirements>

## Summary

Phase 32 ships a small new module (`src/regen/dep-graph.ts`, target ~400 LoC + tests) that holds three concerns: (a) a 14-entry materialized renderer→files map built once per full `generate` run, (b) a `loadDepGraph()` / `saveDepGraph()` pair using the existing `.handover/cache/` directory and Zod-validated JSON on disk, (c) a pure `filterRenderersByChangedFiles()` lookup helper called from the existing `--since` branch. Two CLI changes wire it in: `--dry-run` flag on the `generate` subcommand and one new conditional in the render loop. The `DocumentSpec` interface gets one new field (`requiredSources: string[]`), and 14 registry entries get conservative glob lists.

**Primary recommendation:** Build a single self-contained module that owns the entire feature. Keep `src/cli/generate.ts` edits to two small chunks (flag plumbing + render-loop guard). All risky reasoning (glob expansion, infra filter, version mismatch handling, JSON shape) is co-located behind a narrow public API: `buildDepGraph`, `saveDepGraph`, `loadDepGraph`, `filterRenderersByChangedFiles`, `formatDryRun`, `formatDryRunJson`. The Zod schema is the boundary between disk and runtime — corrupted/old JSON is silently rejected and the system falls back to full regen.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Curated source→renderer globs | Renderer registry (`src/renderers/registry.ts`) | — | DocumentSpec is THE renderer contract; co-location ensures globs update with the renderer (D-02) |
| Glob materialization (build phase) | Regen module (`src/regen/dep-graph.ts`) | fast-glob (lib) | Reuse existing `fast-glob` dep; build once per full run (D-06) |
| Infrastructure exclusion | Regen module | — | Co-located with graph builder so reviewers see curated map + exclusion list together (D-13) |
| JSON persistence + version check | Regen module | Cache dir convention (`.handover/cache/`) | Mirrors `RoundCache` pattern at `src/cache/round-cache.ts` |
| Schema validation at load boundary | Regen module | zod (lib) | Established pattern — config, analyzer outputs, AI rounds all validate with Zod |
| `--since` filter lookup | Regen module (pure function) | — | Read-only; called from `generate.ts:514` (D-21) |
| Render-loop skip decision | `src/cli/generate.ts` (existing render step) | Regen module | Existing render `Promise.allSettled` loop (lines 894-917) checks affected-set membership before invoking `doc.render(ctx)` |
| `--dry-run` text/JSON formatting | Regen module | `src/ui/` (picocolors) | Pure formatter; emits and exits before auth/provider/cache initialization |
| INDEX `'reused'` rendering | `src/renderers/render-00-index.ts` | — | Renderer-tier responsibility; reused docs are still INDEX entries |
| CLI flag registration | `src/cli/index.ts` | commander.js | Existing flag-registration site (D-21) |

## Standard Stack

### Core (already in tree — no new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fast-glob` | `^3.3.3` `[VERIFIED: package.json]` | Glob expansion of `requiredSources` at build time | Already drives `src/analyzers/file-discovery.ts`; D-03 mandates reuse |
| `zod` | `^4.3.6` `[VERIFIED: package.json — note STACK.md says 3.25.76, stale]` | Boundary validation of `dep-graph.json` shape | Established pattern (config, analyzer outputs, AI rounds) |
| `simple-git` | `^3.32.2` `[VERIFIED: package.json]` | Already used by `getGitChangedFiles` — Phase 32 does NOT call git directly | Phase 32 consumes the existing `GitFingerprintResult` |
| `commander` | (current) | `--dry-run` flag registration in `src/cli/index.ts` `generate` subcommand | Mirrors existing `--since` / `--only` registration |
| `node:fs/promises`, `node:path` | (built-in) | Read/write `.handover/cache/dep-graph.json` | Mirrors `RoundCache.set`/`get` pattern at `round-cache.ts:130-143` |
| `vitest` | `^4.0.18` `[VERIFIED: package.json]` | Tests | Project standard |
| `memfs` | `^4.56.10` `[VERIFIED: package.json]` | Filesystem isolation in unit tests | Established (see `src/cli/init-detectors.test.ts:1-11`) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain `Set.has()` for membership at `--since`-time | `picomatch` direct pattern matching | `picomatch@4.0.4` IS available transitively via fast-glob, but adding it as a direct dep is unnecessary — D-05 already mandates materialization, so plain set membership is correct and faster |
| In-place sync glob (`fg.globSync`) | Async (`fg.glob`) | Use **async** — matches existing `src/analyzers/file-discovery.ts:104` pattern; graph build is non-blocking |
| Storing `graphVersion` as `z.literal(1)` (strict) | `z.number().int()` + manual check | Use **`z.literal(GRAPH_VERSION)`** so any other value fails Zod validation → silent fall-back. Cleaner than a manual integer-range check |

**Verified versions (npm view, 2026-05-13):**

| Package | Installed | Latest | Notes |
|---------|-----------|--------|-------|
| `fast-glob` | 3.3.3 | 3.3.3 `[ASSUMED — current]` | Stable, no API change planned |
| `zod` | 4.3.6 | 4.3.6 `[ASSUMED — current]` | v4 API `z.record(keys, values)` confirmed via Context7 `/colinhacks/zod` |

> Note: `[ASSUMED]` rows above were not re-verified against the npm registry in this research session (no network call). Planner should confirm with `npm view fast-glob version` / `npm view zod version` if version drift is a concern. The CONTEXT.md cited `zod@3.25.76` from STACK.md which is **stale** — actual installed version is v4 per package.json.

**Pattern fact:** `fast-glob` exposes helper functions `generateTasks`, `isDynamicPattern`, `escapePath`, `convertPathToPattern` — **but no `isMatch`** `[VERIFIED: Context7 /mrmlnc/fast-glob — see README "Helpers" section]`. The CONTEXT noted "`fg.isMatch()` for membership testing" as a possibility; this method does not exist in fast-glob. Use plain `Set.has()` on the materialized file list instead (which is what D-05 already mandates — no rework needed).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      handover generate (CLI entry)                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ Commander.js parses --dry-run --since --only
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  generate.ts: runGenerate(options)                                  │
│                                                                     │
│  ┌─ [DRY-RUN BRANCH] (NEW) ──────────────────────────────────────┐  │
│  │ if (options.dryRun) {                                          │  │
│  │   const graph = await loadDepGraph(...);                       │  │
│  │   const changed = options.since                                │  │
│  │     ? await getGitChangedFiles(...).changedFiles               │  │
│  │     : undefined;                                               │  │
│  │   const decision = computeDryRunDecision(                      │  │
│  │     selectedDocs, graph, changed, options.since                │  │
│  │   );                                                           │  │
│  │   process.stdout.write(options.json                            │  │
│  │     ? formatDryRunJson(decision)                               │  │
│  │     : formatDryRun(decision));                                 │  │
│  │   process.exit(0);  // zero LLM calls                          │  │
│  │ }                                                              │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                             │                                       │
│                             ▼                                       │
│  ┌─ [--SINCE BRANCH] (generate.ts:514) ───────────────────────────┐  │
│  │ if (options.since) {                                           │  │
│  │   const gitResult = await getGitChangedFiles(...);             │  │
│  │   const graph = await loadDepGraph(rootDir);   // (NEW)        │  │
│  │   const decision = graph                                       │  │
│  │     ? filterRenderersByChangedFiles(           // (NEW)        │  │
│  │         gitResult.changedFiles, graph)                         │  │
│  │     : { affected: ALL_RENDERER_IDS, fullRegen: true,           │  │
│  │         reasons: 'no-graph' };                                 │  │
│  │   // pass decision into render step via closure or DAG ctx     │  │
│  │ }                                                              │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                             │                                       │
│                             ▼                                       │
│  ┌─ STATIC ANALYSIS + AI ROUNDS (unchanged) ──────────────────────┐  │
│  │ runStaticAnalysis → packFiles → rounds 1-6 (DAG)               │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                             │                                       │
│                             ▼                                       │
│  ┌─ RENDER STEP (generate.ts:809-1004) ───────────────────────────┐  │
│  │ For each doc in selectedDocs (exclude 00-index):               │  │
│  │   if (decision && !decision.affected.has(doc.id)) {            │  │
│  │     statuses.push({ ..., status: 'reused' });    // (NEW)      │  │
│  │     continue;                                                  │  │
│  │   }                                                            │  │
│  │   const content = doc.render(ctx);                             │  │
│  │   writeFile(...);                                              │  │
│  │ // Build graph if this was a FULL run (D-06)                   │  │
│  │ if (!options.since) {                                          │  │
│  │   const graph = await buildDepGraph(                           │  │
│  │     DOCUMENT_REGISTRY, rootDir);                               │  │
│  │   await saveDepGraph(rootDir, graph);                          │  │
│  │ }                                                              │  │
│  │ // INDEX renders last with new 'reused' status awareness       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

src/regen/dep-graph.ts (NEW)
├── GRAPH_VERSION constant (1)
├── INFRASTRUCTURE_PATHS (curated glob list)
├── DepGraphSchema (zod)
├── buildDepGraph(registry, rootDir) → DepGraph        # async, runs fast-glob per renderer
├── saveDepGraph(rootDir, graph) → void                # writes JSON, no gitignore write (D-22)
├── loadDepGraph(rootDir) → DepGraph | null            # returns null on miss/stale/corrupt
├── filterRenderersByChangedFiles(changed, graph)      # pure
│     → { affected: Set<id>, fullRegen: boolean,
│         reasons: Map<id, string[]>, unclaimed: string[] }
├── computeDryRunDecision(selectedDocs, graph, ...)    # composes filter + dry-run state
├── formatDryRun(decision) → string                    # text mode (D-15)
└── formatDryRunJson(decision) → string                # JSON mode (D-16)
```

**Data flow on `--since HEAD~1`:**
1. `getGitChangedFiles` returns `Set<string>` of repo-relative paths (verified: `src/cache/git-fingerprint.test.ts:90` asserts `['a.ts', 'b.ts']`).
2. `loadDepGraph` reads `.handover/cache/dep-graph.json`, validates with Zod, returns `null` on missing/stale/corrupt → `--since` falls back to full regen (success criterion #5).
3. `filterRenderersByChangedFiles` iterates `changedFiles`: for each, check infra match (skip), then check renderer-list membership. Any file unclaimed by any renderer → `fullRegen: true`.
4. Render loop honors `decision.affected`: skipped docs get status `'reused'` and INDEX reflects this.
5. After render, **no graph rebuild** (D-06 — `--since` is read-only).

**Data flow on full `handover generate` (no `--since`):**
1. Render proceeds normally for all selected docs.
2. **After** the render loop succeeds, build the graph (D-06) and persist it. Failure to write is non-fatal (mirror `RoundCache.ensureGitignored` pattern at `round-cache.ts:211-213`).

### Recommended Project Structure

```
src/regen/                          # NEW directory (Phases 33-35 also expected here)
├── dep-graph.ts                    # Public API: build, save, load, filter, format
└── dep-graph.test.ts               # Co-located unit tests
                                    # Use memfs for fs isolation, vi.mock for fast-glob deterministic returns
```

The CONTEXT and STRUCTURE.md "Where to Add New Code" do **not** prescribe `src/regen/` (greenfield). D-20 explicitly says planner picks; recommendation is `src/regen/`. Filename `dep-graph.ts` (terse, matches D-20 rec) — must NOT be `dependency-graph.ts` (collision with `src/analyzers/dependency-graph.ts`).

### Pattern 1: Versioned JSON cache with version-mismatch silent reset

**What:** A pure data file with an integer version constant; readers reject any file whose version differs from the current constant, treating the disk state as missing.
**When to use:** Cache shapes that change rarely but evolve over time, where a silent rebuild is cheaper than a migration.
**Example (mirror `src/cache/round-cache.ts:93-122`):**

```typescript
// Source: src/cache/round-cache.ts:93-122 — RoundCache.get() pattern, adapted
export async function loadDepGraph(rootDir: string): Promise<DepGraph | null> {
  const filePath = join(rootDir, '.handover', 'cache', 'dep-graph.json');
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = DepGraphSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;          // covers version mismatch (z.literal)
    return parsed.data;                         // and corrupt/old shape
  } catch {
    return null;                                 // covers JSON parse errors
  }
}
```

### Pattern 2: Glob materialization at build time

**What:** Run fast-glob once per renderer with that renderer's `requiredSources` patterns. Filter the result against `INFRASTRUCTURE_PATHS`. Store the resulting file list verbatim in the JSON. No globbing at lookup time.
**When to use:** When the same patterns will be tested against many changed files, and the file set is moderately stable between runs.
**Example:**

```typescript
// Mirror src/analyzers/file-discovery.ts:104-111 — fg() invocation pattern
import fg from 'fast-glob';
import { isFileInfrastructure } from './infrastructure-paths.js';

async function expandRendererSources(
  patterns: string[],
  rootDir: string,
): Promise<string[]> {
  const matches = await fg(patterns, {
    cwd: rootDir,           // returns repo-relative paths (matches git's path form)
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.handover/**'],
  });
  return matches.filter((p) => !isFileInfrastructure(p)).sort();
}
```

**Critical CWD invariant:** fast-glob with `cwd: rootDir` returns **relative** paths (e.g. `src/orchestrator/dag.ts`). `getGitChangedFiles` also returns relative paths (verified at `src/cache/git-fingerprint.test.ts:90`). The two forms align — `Set.has()` membership works directly. Do NOT pass `absolute: true` to fast-glob; if you do, normalize before storing.

### Pattern 3: Helper-prepend for renderer self-reference

**What:** A helper that takes a renderer's source path and a list of other globs and returns the combined list with the renderer's own path inserted at the head.
**When to use:** Every `requiredSources` entry in the registry (D-10).
**Example:**

```typescript
// New helper in src/renderers/registry.ts, near DOCUMENT_REGISTRY
const withSelfRef = (rendererPath: string, otherSources: string[]): string[] =>
  [rendererPath, ...otherSources];

// Usage in DOCUMENT_REGISTRY:
{
  id: '03-architecture',
  // ...
  requiredSources: withSelfRef('src/renderers/render-03-architecture.ts', [
    'src/orchestrator/**',
    'src/ai-rounds/runner.ts',
    'src/ai-rounds/round-4-architecture.ts',
  ]),
}
```

Alternative considered: derive the path automatically from the `id` (e.g. `id: '03-architecture'` → `src/renderers/render-03-architecture.ts`). **Rejected** because INDEX is `00-index` whose renderer file is `render-00-index.ts` (matches) but `01-project-overview` whose renderer is `render-01-overview.ts` (does NOT match — filename is `render-01-overview.ts`, registry id is `01-project-overview`). The `id` ≠ `filename minus prefix` mapping means automatic derivation is fragile. Explicit path is safer.

### Anti-Patterns to Avoid

- **Re-globbing at `--since`-time** — violates D-05. Materialize once, store the resolved file list, do `Set.has()` lookups.
- **Mutating the registry shape outside D-02** — `requiredSources` is the only new field; do not add side maps. Reviewer-friendly diff.
- **Writing dep-graph during `--since` runs** — violates D-06. Only full runs refresh the graph.
- **Throwing on graph load failure** — violates success criterion #5 and the project's graceful-degradation pattern (`.planning/codebase/ARCHITECTURE.md`). Return `null`, fall back to full regen.
- **Using a blanket `.handover/` gitignore entry** — violates Phase 31 D-10 (Phase 35 commits `.handover/evals/golden/`). The existing `.handover/cache` entry is the correct scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Glob pattern matching | A custom string matcher | `fast-glob` (D-03) | Already a dep; handles `**`, brace expansion, negation, dot-files correctly |
| JSON cache versioning | Manual integer compare + error message | `z.literal(GRAPH_VERSION)` in Zod schema + `safeParse` returns `null` | One pattern handles version + shape + corruption in a single failure mode |
| Path normalization | Custom relative-path math | `cwd: rootDir` option to fast-glob → returns relative paths matching git's form | Aligns with `getGitChangedFiles` output without extra work |
| Gitignore patching for `dep-graph.json` | A second `ensureGitignored` call | **Nothing — already covered** (Phase 31 D-10 added `.handover/cache`) | D-22 explicit |

**Key insight:** This phase's main risk is data layout, not algorithms. Trust the existing patterns (Zod at boundaries, mirror `RoundCache`, fast-glob with the same CWD as analyzers) and keep the new code small.

## Module Placement Decision

**Recommended path:** `src/regen/dep-graph.ts` (new directory).

**Rationale:**
- D-20 explicitly suggests this; user agreed in their three "trust your recommendation" delegations.
- Adjacent phases 33–35 also operate in the "smarter-regen" track and may want sibling modules (`src/regen/telemetry.ts`, `src/regen/routing.ts`, `src/regen/eval.ts`). Establishing `src/regen/` now creates a clean home.
- `src/cache/dep-graph.ts` was considered — it would sit next to `round-cache.ts` and `git-fingerprint.ts`. **Rejected** because the new module owns more than caching (it owns `--dry-run` formatting, infra exclusion, the filter function). "Regen" describes the responsibility better than "cache."
- `src/orchestrator/dep-graph.ts` was considered. **Rejected** because the orchestrator is generic DAG infrastructure; this module is specific to renderer/source semantics.
- The collision risk is `src/analyzers/dependency-graph.ts` (STAT-02). Filename `dep-graph.ts` is sufficient differentiation and matches CONTEXT D-20's recommendation. Avoid `dependency-graph.ts` and `source-doc-graph.ts` (longer, no win).

**No changes to STRUCTURE.md "Where to Add New Code"** for this phase — the rule for `src/regen/` can be added when Phases 33–35 land (or by this phase's documentation pass).

## Public API Contracts

### `GRAPH_VERSION` and `INFRASTRUCTURE_PATHS`

```typescript
// src/regen/dep-graph.ts
export const GRAPH_VERSION = 1 as const;

/**
 * Curated infrastructure file patterns. Files matching any pattern here
 * are excluded from every renderer's effective dependency set.
 * See D-12 for the rationale per entry.
 */
export const INFRASTRUCTURE_PATHS: readonly string[] = [
  'src/utils/**',          // logger, errors, rate-limiter — zero domain content
  'src/config/loader.ts',  // pure config plumbing
  'src/config/defaults.ts',
  'src/config/schema.ts',
  'src/domain/types.ts',
  'src/domain/entities.ts',
  '**/types.ts',           // type-only barrel files anywhere
] as const;
```

### `DepGraphSchema` (zod)

```typescript
import { z } from 'zod';

export const DepGraphSchema = z.object({
  graphVersion: z.literal(GRAPH_VERSION),       // mismatch → safeParse fails → loadDepGraph returns null
  builtAt: z.string(),                          // ISO 8601; not strictly validated, informational
  renderers: z.record(z.string(), z.array(z.string())),
  infrastructurePaths: z.array(z.string()),     // snapshot of INFRASTRUCTURE_PATHS at build time
});

export type DepGraph = z.infer<typeof DepGraphSchema>;
```

**Note on zod v4:** `z.record(keyType, valueType)` takes **two arguments** in v4 (verified via Context7 `/colinhacks/zod`). Do not use the v3 single-argument form.

### `buildDepGraph(registry, rootDir): Promise<DepGraph>`

```typescript
export async function buildDepGraph(
  registry: readonly DocumentSpec[],
  rootDir: string,
): Promise<DepGraph> {
  const renderers: Record<string, string[]> = {};
  for (const spec of registry) {
    if (spec.id === '00-index') continue;        // INDEX has no source deps
    const matches = await fg(spec.requiredSources, {
      cwd: rootDir,
      onlyFiles: true,
      dot: false,
      followSymbolicLinks: false,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.handover/**'],
    });
    renderers[spec.id] = matches
      .filter((p) => !isFileInfrastructure(p))
      .sort();
  }
  return {
    graphVersion: GRAPH_VERSION,
    builtAt: new Date().toISOString(),
    renderers,
    infrastructurePaths: [...INFRASTRUCTURE_PATHS],
  };
}
```

### `saveDepGraph` / `loadDepGraph`

```typescript
export async function saveDepGraph(rootDir: string, graph: DepGraph): Promise<void> {
  const dir = join(rootDir, '.handover', 'cache');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'dep-graph.json'), JSON.stringify(graph, null, 2), 'utf-8');
  // NOTE: NO ensureGitignored() call — Phase 31 D-10 already added .handover/cache
}

export async function loadDepGraph(rootDir: string): Promise<DepGraph | null> {
  const filePath = join(rootDir, '.handover', 'cache', 'dep-graph.json');
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = DepGraphSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

### `filterRenderersByChangedFiles` (the central filter)

```typescript
export interface FilterDecision {
  /** Renderer IDs whose dependencies were touched */
  affected: Set<string>;
  /** True when an unclaimed file forced a full regen (D-04) */
  fullRegen: boolean;
  /** For each affected renderer, which changed files triggered it (for --dry-run reasons) */
  reasons: Map<string, string[]>;
  /** Files in changedFiles that didn't match any renderer (and weren't infra) */
  unclaimed: string[];
}

export function filterRenderersByChangedFiles(
  changedFiles: ReadonlySet<string>,
  graph: DepGraph,
): FilterDecision {
  const affected = new Set<string>();
  const reasons = new Map<string, string[]>();
  const unclaimed: string[] = [];

  // Pre-build renderer→Set<file> for O(1) membership
  const rendererSets = new Map<string, Set<string>>();
  for (const [id, files] of Object.entries(graph.renderers)) {
    rendererSets.set(id, new Set(files));
  }

  for (const changed of changedFiles) {
    if (isFileInfrastructure(changed)) continue;    // logger.ts alone → no-op (success criterion #4)
    let claimed = false;
    for (const [id, files] of rendererSets) {
      if (files.has(changed)) {
        claimed = true;
        affected.add(id);
        const r = reasons.get(id) ?? [];
        r.push(changed);
        reasons.set(id, r);
      }
    }
    if (!claimed) unclaimed.push(changed);
  }

  return {
    affected,
    fullRegen: unclaimed.length > 0,           // D-04: any unclaimed → full regen
    reasons,
    unclaimed,
  };
}
```

**Signature decision rationale:** Returning a structured `FilterDecision` (not just a `Set<string>`) lets `--dry-run` text mode show which file triggered which renderer (D-15) and lets the caller distinguish "skipped because unclaimed → full regen" from "skipped because no match → renderer reuse." A bare `Set` return would force re-deriving these from raw inputs.

**`fullRegen: true` semantics:** Callers interpret this as "execute ALL renderers, but `reasons` map still records what we know." The `affected` set is populated even on `fullRegen: true` (claimed files still claim renderers) — but the caller should ignore `affected` and run everything. `--dry-run` shows this with a banner: `(unclaimed files forced full regen)`.

**`isFileInfrastructure` implementation:** A separate small helper inside `dep-graph.ts` that uses `picomatch` via fast-glob's internal — but since fast-glob has no `isMatch` export, do this with a tight regex pre-compile of the curated INFRASTRUCTURE_PATHS list, OR simpler: at build time, also compute a `Set<string>` of all infrastructure file paths (one glob expansion over the curated list) and store as a sidecar in memory. At filter time, plain `Set.has()`. Pseudocode:

```typescript
let infraFileSet: Set<string> | null = null;
async function getInfrastructureFileSet(rootDir: string): Promise<Set<string>> {
  if (infraFileSet) return infraFileSet;
  const files = await fg([...INFRASTRUCTURE_PATHS], {
    cwd: rootDir, onlyFiles: true, dot: false,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.handover/**'],
  });
  infraFileSet = new Set(files);
  return infraFileSet;
}
```

But `filterRenderersByChangedFiles` is called at `--since`-time and must not re-glob (D-05 spirit applies). Solution: persist the infrastructure file set INSIDE `dep-graph.json` already (`graph.infrastructurePaths` exists in the schema — repurpose it from "snapshot of patterns" to "snapshot of expanded infra file list"). Or add a parallel `infrastructureFiles` field. Recommendation: **add a new `infrastructureFiles: string[]` field to the JSON shape** (and the Zod schema) — the snapshot of expanded paths. `infrastructurePaths` keeps the curated glob list for human auditability. The filter function then takes both arrays and does `Set.has()`.

Revised schema:

```typescript
export const DepGraphSchema = z.object({
  graphVersion: z.literal(GRAPH_VERSION),
  builtAt: z.string(),
  renderers: z.record(z.string(), z.array(z.string())),
  infrastructurePaths: z.array(z.string()),   // curated globs (audit trail)
  infrastructureFiles: z.array(z.string()),   // expanded file list for fast lookup
});
```

Revised signature: `filterRenderersByChangedFiles(changedFiles, graph)` — uses `graph.infrastructureFiles` internally; no module-level state, no re-globbing.

### `--dry-run` formatters

```typescript
export interface DryRunDecision {
  since: string | undefined;                  // ref string or undefined
  graphVersion: number | null;                // null when no graph loaded
  wouldExecute: Array<{ rendererId: string; filename: string; reasons: string[] }>;
  wouldSkip: Array<{ rendererId: string; filename: string }>;
  fellBackToFullRegen: boolean;
  noGraph: boolean;                           // true when graph missing/stale and --since used
}

export function formatDryRun(d: DryRunDecision): string { /* text — see D-15 */ }
export function formatDryRunJson(d: DryRunDecision): string {
  return JSON.stringify({
    formatVersion: 1,                          // CONTRACT for Phase 36
    since: d.since ?? null,
    graphVersion: d.graphVersion,
    wouldExecute: d.wouldExecute,
    wouldSkip: d.wouldSkip.map(s => s.rendererId),
    fellBackToFullRegen: d.fellBackToFullRegen,
    noGraph: d.noGraph,
  }, null, 2) + '\n';
}
```

### Last-run timestamp for `'reused'` INDEX rendering

**Question raised in research focus #5b:** does `'reused'` need a stored `lastRenderedAt`?

**Recommendation: use file `mtime`** from the output directory, NOT a sidecar in the graph. Rationale:
- `mtime` of `handover/03-ARCHITECTURE.md` is the truth — if the user manually edited the file, `mtime` reflects it. A stored `lastRenderedAt` could lie.
- Avoids extending `dep-graph.json` for non-graph concerns.
- INDEX rendering already happens after all other docs in `runGenerate` (`generate.ts:994`); it can stat each file synchronously (already in `node:fs`).

`render-00-index.ts` change: when a `DocumentStatus['status'] === 'reused'`, read the mtime of `join(outputDir, status.filename)` and render `Reused (last: 2026-05-13T14:23:11Z)` or human-friendly `Reused (2 hours ago)`. Pass `outputDir` into `renderIndex` as an extra arg (already takes a non-standard `statuses` arg — see registry.ts:39 shim comment) or attach mtime to `DocumentStatus` before calling `renderIndex`. Simpler: extend `DocumentStatus` interface with optional `lastRenderedAt?: string` and populate it in `generate.ts` at line 944 (the `else if (result.value.skipped)` branch becomes the `'reused'` branch; the new branch reads mtime via `node:fs`).

```typescript
// In src/renderers/types.ts (D-09 extension)
export interface DocumentStatus {
  id: string;
  filename: string;
  title: string;
  status: 'complete' | 'partial' | 'static-only' | 'not-generated' | 'reused';
  reason?: string;
  lastRenderedAt?: string;                    // ISO 8601, only set for 'reused'
}
```

**Correction note:** CONTEXT D-09 mentions `'full'` and `'partial'` in the existing enum. The actual `DocumentStatus['status']` union in `src/renderers/types.ts:62` is `'complete' | 'partial' | 'static-only' | 'not-generated'`. There is no `'full'`. Phase 32 adds `'reused'`. Update existing `statusLabel` switch in `render-00-index.ts:56-67` (currently 4 cases) to add the 5th case.

## Wire-In Points

| Site | File:line | Change |
|------|-----------|--------|
| Flag registration: `--dry-run` | `src/cli/index.ts:25-40` (the `generate` command block) | Add `.option('--dry-run', 'Preview which renderers would execute; no LLM calls')` and `.option('--json', 'JSON output (currently used with --dry-run)')` |
| Generate options type | `src/cli/generate.ts:55-65` (`GenerateOptions`) | Add `dryRun?: boolean; json?: boolean` |
| Dry-run early exit | `src/cli/generate.ts:108-122` (top of `runGenerate`, after `if (options.verbose)`) | New conditional: if `options.dryRun`, run `runDryRun(rootDir, options)` and return. This avoids ALL provider/auth/onboarding flow → zero LLM calls (success criterion #2) |
| Dep-graph load on `--since` | `src/cli/generate.ts:514` (`if (options.since)` branch) | After `getGitChangedFiles` resolves: `const graph = await loadDepGraph(rootDir);` then `const decision = graph ? filterRenderersByChangedFiles(gitResult.changedFiles, graph) : null;` (null means no graph → full regen below) |
| Render-loop skip | `src/cli/generate.ts:905-917` (the `Promise.allSettled` over `docsToRender`) | Inside the `.map(async (doc) => ...)`, before `doc.render(ctx)`: if `decision && !decision.fullRegen && !decision.affected.has(doc.id)`, return `{ doc, skipped: true, reused: true, durationMs: 0 }`. Status processing loop at 926-960 handles new branch → push `status: 'reused'` with `lastRenderedAt` from mtime |
| Status assembly | `src/cli/generate.ts:926-960` | Add new branch for `reused: true`. Pull `mtime` from `join(outputDir, doc.filename)` via `stat()` from `node:fs/promises`; convert to ISO string |
| Graph rebuild on full run | `src/cli/generate.ts:1001` (just before `return { generatedDocs, outputDir }` in the render step) | If `!options.since`, `await saveDepGraph(rootDir, await buildDepGraph(DOCUMENT_REGISTRY, rootDir))`. Wrap in try/catch — non-fatal (mirror `ensureGitignored` graceful-degradation pattern at `round-cache.ts:211-213`) |
| INDEX `'reused'` rendering | `src/renderers/render-00-index.ts:56-67` | Extend `statusLabel` switch with `case 'reused': return ...`. Render `Reused` with optional `lastRenderedAt` suffix |
| DocumentSpec field | `src/renderers/types.ts:43-51` | Add `requiredSources: string[]` to the interface |
| DocumentStatus union | `src/renderers/types.ts:58-64` | Add `'reused'` to the `status` union, add optional `lastRenderedAt?: string` |
| 14 registry entries | `src/renderers/registry.ts:28-158` | Add `requiredSources: withSelfRef(...)` to each entry (including `00-index`, which can declare `[]` or `['src/renderers/render-00-index.ts']` — but since INDEX always renders, the value is informational; recommend `[]` for clarity) |
| `withSelfRef` helper | `src/renderers/registry.ts` (top of file) | New tiny pure function — `(rendererPath: string, otherSources: string[]) => [rendererPath, ...otherSources]` |
| New module + tests | `src/regen/dep-graph.ts` + `src/regen/dep-graph.test.ts` | Greenfield; entire phase logic lives here |

**Notes on coverage exclusions (vitest.config.ts):**
- `src/cli/generate.ts`, `src/cli/index.ts`, `src/renderers/render-*.ts`, `src/renderers/types.ts` are **excluded** from coverage. Wire-in edits in these files do not need to hit thresholds — but `requiredSources` field correctness in `src/renderers/registry.ts` IS covered by the existing `src/renderers/registry.test.ts` (registry IS measured).
- `src/regen/dep-graph.ts` is **not excluded** — new file. Must hit 90/90/85/90 thresholds in `src/regen/dep-graph.test.ts`.

## Test Plan Per Success Criterion

**Test framework:** Vitest 4.0.18 (verified), memfs 4.56.10 for filesystem isolation, `vi.mock` / `vi.hoisted` for fast-glob and simple-git stubs (pattern matches `src/cache/git-fingerprint.test.ts` and `src/cli/init-detectors.test.ts`).

| SC | Behavior | Test location | Approach |
|----|----------|---------------|----------|
| SC-1 | Single non-infra file change → fewer than 14 renderers execute | `src/regen/dep-graph.test.ts` — `describe('filterRenderersByChangedFiles')` | Build a graph fixture with 14 renderer entries; call `filterRenderersByChangedFiles(new Set(['src/orchestrator/dag.ts']), fixtureGraph)`. Assert `decision.affected.size < 14`, `decision.fullRegen === false`, `decision.unclaimed.length === 0` |
| SC-2 | `--dry-run` produces output with zero LLM calls | `src/regen/dep-graph.test.ts` — `describe('formatDryRun')` covers formatter purity. **Plus integration test** in `tests/integration/edge-cases.test.ts` or a new `tests/integration/dry-run.test.ts`: run CLI with `--dry-run --static-only=false` and assert (a) `result.exitCode === 0`, (b) `result.stdout` contains "Would execute" / "Would skip" / "Zero LLM calls", (c) no `.handover/cache/round-*.json` is written, (d) no `handover/*.md` is written, (e) provider mock (if any) was never called. For unit-level provider-call assertion, can also assert that the dry-run branch in `runGenerate` exits BEFORE `resolveAuth()` line 246 — covered by code-path test in dep-graph.test.ts on `runDryRun` helper |
| SC-3 | Persisted graph with `graphVersion`; missing/stale → safe rebuild | `src/regen/dep-graph.test.ts` — `describe('loadDepGraph')` | Cases: (a) file missing → returns `null`; (b) file with `graphVersion: 0` → returns `null` (Zod literal mismatch); (c) file with invalid JSON → returns `null`; (d) file with valid v1 shape → returns parsed `DepGraph`. memfs sets up each fixture |
| SC-4 | `logger.ts` alone changed → zero renderers | `src/regen/dep-graph.test.ts` — extend SC-1 test | Build fixture graph; call filter with `new Set(['src/utils/logger.ts'])`. Assert `decision.affected.size === 0`, `decision.unclaimed.length === 0` (infra files don't count as unclaimed), `decision.fullRegen === false`. Also assert that the build step itself excludes `src/utils/logger.ts` from any renderer's file list (so even if a misconfigured renderer had `src/utils/**` in `requiredSources`, the result wouldn't include logger). This double-guards REGEN-06 |
| SC-5 | First-run / deleted graph → safe full regen, no error | `src/regen/dep-graph.test.ts` — `describe('--since fallback when graph missing')` | memfs starts with empty `.handover/cache/`. Call `loadDepGraph` → returns `null`. Call code path that handles `null` graph (the wrapping `computeDryRunDecision` or the wire-in branch). Assert that the decision sets `fullRegen: true` and `noGraph: true`. Integration counterpart: spawn CLI with `--since HEAD~1` in a fixture repo with no graph file; assert exit code 0 and that all 14 markdowns get written (full regen happened) |

**Additional unit tests needed for 90/90/85/90:**
- `buildDepGraph` with vi.mock'd fast-glob returning canned matches (covers happy path + infrastructure filtering)
- `saveDepGraph` roundtrip with memfs (covers JSON shape stability)
- `formatDryRun` snapshot test for the text format (D-15 example output)
- `formatDryRunJson` snapshot test for the JSON shape (D-16 contract — Phase 36 will pin against this)
- `withSelfRef` pure-function test in `src/renderers/registry.test.ts` (existing test file)
- `INFRASTRUCTURE_PATHS` matches `logger.ts` and does NOT match `src/orchestrator/dag.ts` (regression guard for D-12)

## Runtime State Inventory

Phase 32 is **not** a rename/refactor/migration phase — it adds new functionality. Brief inventory for completeness:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New file `.handover/cache/dep-graph.json` (created by full runs after Phase 32 ships) | None — fresh data file; missing → safe fallback |
| Live service config | None — Phase 32 has no external services | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None | None |

**Backward compatibility:** Existing users upgrading to Phase 32-shipped handover will not have `dep-graph.json`. First `handover generate --since X` falls back to full regen (success criterion #5). First full `handover generate` writes the graph for subsequent `--since` runs to use.

## Common Pitfalls

### Pitfall 1: CWD mismatch between fast-glob expansion and git's changed-file form

**What goes wrong:** fast-glob with default options returns paths relative to the process CWD, but git might return paths relative to the repo root. Set intersection silently fails — `Set.has()` returns false even when the file IS the same.
**Why it happens:** Two configurable systems with different default base directories. Easy to miss in unit tests if `rootDir === process.cwd()`.
**How to avoid:** Always pass `cwd: rootDir` to fast-glob. `getGitChangedFiles(rootDir, ref)` passes `rootDir` to `simpleGit(rootDir)` so git's output is repo-relative (verified at `src/cache/git-fingerprint.test.ts:90` — `['a.ts', 'b.ts']` form). Add an integration test that uses a fixture in `/tmp/some-repo` (i.e., not the project root) to catch this.
**Warning signs:** Empty `affected` set on a known-changed file; `unclaimed` array contains paths the user expects to be claimed.

### Pitfall 2: Path separator on Windows

**What goes wrong:** fast-glob normalizes returned paths to forward slashes; git via `simple-git` also returns forward slashes on Windows (verified by their respective docs). But if any code path uses `path.join`, the result may have backslashes on Windows, breaking `Set.has()`.
**Why it happens:** Mixing `node:path` operations with glob/git output.
**How to avoid:** Treat all stored and looked-up paths as forward-slash strings. Do NOT pass them through `path.join` before comparison. If a path must be joined (e.g. for `stat()` to read mtime), join into a separate variable used only for filesystem access; the lookup key stays unchanged.
**Warning signs:** Tests pass on macOS/Linux but `--since` on Windows skips nothing or skips everything.

### Pitfall 3: Renamed files

**What goes wrong:** `git status` reports renames as `{ from: 'old.ts', to: 'new.ts' }`. `getGitChangedFiles` (verified at `src/cache/git-fingerprint.ts:60-62`) currently captures only `rename.to`. If a file moved from `src/old/path.ts` to `src/new/path.ts`, only the new path is in `changedFiles`. The old path doesn't appear. Renderers that depend on the old location of the file (i.e. `requiredSources` still listing it) won't be flagged.
**Why it happens:** Phase 32 reads the graph that was built BEFORE the rename. The graph's file list contains `src/old/path.ts`; the changed-files set contains only `src/new/path.ts`. Neither matches.
**How to avoid:** Accept this edge case for v8.0 — a rename will look like an addition + a "deletion" (deletion captured via `status.deleted`, which IS in `changedFiles`). The deleted path WILL match the graph's old entry and trigger affected renderers. The new path is unclaimed → triggers full regen via D-04. **This is correct conservative behavior.** Document it.
**Warning signs:** Renames followed by `--since` causing unexpected full regens — but per D-04, this IS the design.

### Pitfall 4: Deleted files

**What goes wrong:** A `git rm src/foo.ts` shows up in `changedFiles` (via `status.deleted`). If `src/foo.ts` was in some renderer's file list in the graph, the renderer is flagged (correct). If it wasn't claimed by anything, it's unclaimed → full regen (also correct). Same logic handles deletions and additions symmetrically.
**Why it happens:** Not a bug — design works.
**How to avoid:** Add a test case for `changedFiles = new Set(['src/foo.ts'])` where `src/foo.ts` is BOTH in the graph (for some renderer) AND no longer on disk. Assert `decision.affected.has('that-renderer')` is true. Don't try to `fs.stat` the file before lookup — that would be wrong.

### Pitfall 5: Graph staleness after Phase 31's `--upgrade`

**What goes wrong:** If a user runs `handover init --upgrade` (Phase 31) which doesn't touch the graph file, and then `handover generate --since HEAD~1`, the graph might reference files that were renamed/deleted since the last full run. Stale files in `graph.renderers[id]` produce false negatives.
**Why it happens:** Graph is only refreshed on full `generate` runs (D-06). Long `--since` streaks compound staleness.
**How to avoid:** This is acceptable — D-04 protects: if a changed file is unclaimed (because the graph references stale paths), the system falls back to full regen. Worst case is occasional false-positive full regens. Document this in the user-facing message when a full regen happens: `(graph may be stale; full regen recommended periodically — handover generate refreshes the graph)`.

### Pitfall 6: Race between graph rebuild and concurrent CI runs

**What goes wrong:** Two parallel `handover generate` runs (e.g. matrix CI) might race on `dep-graph.json` writes.
**Why it happens:** Plain JSON file, no locking.
**How to avoid:** `fs.promises.writeFile` is atomic-ish on POSIX, but cross-process write-write races on macOS/Linux can interleave. Mitigation: write to `dep-graph.json.tmp` then `rename` (atomic on POSIX). Implementation note for planner. If skipped, the worst case is a corrupted JSON → next read returns `null` → safe fallback to full regen.

### Pitfall 7: `--only` + `--since` intersection emptiness

**What goes wrong:** User runs `--only architecture --since HEAD~1`, but the architecture renderer's source deps didn't change. The intersection is empty.
**Why it happens:** D-18 says `--only` selects, `--since` filters within. Composing yields empty.
**How to avoid:** Print a clear message: `No renderers in --only selection have changed sources since HEAD~1. Exiting with code 0 (no work).` Do NOT throw. Do NOT regenerate. This is correct behavior; `--dry-run --only X --since Y` shows the same empty result with a reason.
**Warning signs:** User confused why "nothing happens" — message must be explicit.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `handover generate --since X` regenerates all 14 renderers | This phase: filter to affected only | Phase 32 (v8.0) | LLM-cost reduction on incremental runs; baseline for Phase 33 telemetry |
| No `--dry-run` mode | `--dry-run [--json]` mode added | Phase 32 (v8.0) | Foundation for Phase 36 GitHub Action PR-preview comment |
| `DocumentStatus['status']` had 4 values | Add `'reused'` (5th value) | Phase 32 (v8.0) | INDEX surface reflects skip decisions |
| `DocumentSpec` had no source declaration | Adds `requiredSources: string[]` field | Phase 32 (v8.0) | Renderer contract now describes its inputs |

**Deprecated/outdated:**
- `[VERIFIED: STACK.md vs package.json]` STACK.md claims `zod 3.25.76` — actual installed version is `^4.3.6`. This is a stale codebase doc, not a Phase 32 concern (out of scope to fix here), but planner should be aware: write Zod code using v4 API (e.g. `z.record(keyType, valueType)` two-argument form).
- TESTING.md is dated 2026-02-18 and claims "No coverage thresholds in vitest.config.ts." The current `vitest.config.ts` (verified) DOES have thresholds `lines: 90, functions: 90, branches: 85, statements: 90`. CONTEXT D-23 stated "90/90/90/85 (lines/funcs/branches/statements)" — the **correct order** is `lines: 90, functions: 90, branches: 85, statements: 90`. Match the actual config, not CONTEXT's prose.

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist at the project root (verified — `Read` returned "File does not exist"). No CLAUDE.md-derived constraints apply.

**Coverage thresholds (from `vitest.config.ts`):**
- `lines: 90`
- `functions: 90`
- `branches: 85`
- `statements: 90`

**Coverage exclusions impacting Phase 32:**
- `src/cli/index.ts`, `src/cli/generate.ts` — excluded; wire-in edits don't move coverage numbers but ARE exercised by integration tests
- `src/renderers/types.ts`, `src/renderers/render-*.ts` — excluded; new `'reused'` rendering NOT directly measured (but registry IS)
- `src/regen/dep-graph.ts` — **NOT excluded** (new file); MUST hit thresholds via `src/regen/dep-graph.test.ts`
- `src/renderers/registry.ts` — **NOT excluded**; existing `registry.test.ts` must keep passing after `requiredSources` is added (likely just a type-shape update)

## Validation Architecture

**Test framework**

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 `[VERIFIED: package.json]` |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/regen/dep-graph.test.ts` |
| Full suite command | `npm run test` (uses `vitest run`) |
| Build before test | `npm run build` required for integration tests against `dist/` |

**Phase Requirements → Test Map**

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REGEN-03 | `--since` filter narrows renderer set | unit | `npx vitest run src/regen/dep-graph.test.ts -t "filterRenderersByChangedFiles"` | ❌ Wave 0 |
| REGEN-04 | `--dry-run` emits preview, no LLM calls | unit + integration | unit: `npx vitest run src/regen/dep-graph.test.ts -t "formatDryRun"`; integration: `npx vitest run tests/integration/dry-run.test.ts` | ❌ Wave 0 |
| REGEN-05 | Graph version mismatch → safe rebuild | unit | `npx vitest run src/regen/dep-graph.test.ts -t "loadDepGraph"` | ❌ Wave 0 |
| REGEN-06 | `logger.ts` excluded | unit | `npx vitest run src/regen/dep-graph.test.ts -t "infrastructure exclusion"` | ❌ Wave 0 |
| REGEN-07 | Single-file change < 14 renderers (fixture) | unit + integration | unit fixture in dep-graph.test.ts; integration via `tests/integration/dry-run.test.ts` | ❌ Wave 0 |

**Sampling Rate**

- **Per task commit:** `npx vitest run src/regen/dep-graph.test.ts --coverage` (covers REGEN-03/05/06/07 unit-level)
- **Per wave merge:** `npm run test` (full suite, catches regressions in registry.test.ts and any integration tests)
- **Phase gate:** Full suite green + `npm run typecheck` clean before `/gsd-verify-work`

**Wave 0 Gaps**

- [ ] `src/regen/dep-graph.test.ts` — covers REGEN-03/05/06/07
- [ ] `tests/integration/dry-run.test.ts` (or extend existing `tests/integration/edge-cases.test.ts`) — covers REGEN-04 end-to-end
- [ ] No framework install needed (vitest + memfs already present)

**Validation Dimensions Mapped to Success Criteria**

| Dimension | Coverage | Maps to SC |
|-----------|----------|------------|
| Functional correctness | Each pure function in `dep-graph.ts` has direct unit tests | SC-1, SC-3, SC-4, SC-5 |
| Behavioral / integration | CLI `--dry-run` + CLI `--since` end-to-end in fixture repo | SC-1, SC-2, SC-5 |
| Regression | Existing `src/renderers/registry.test.ts` still passes after `requiredSources` added; existing `src/cache/git-fingerprint.test.ts` still passes (untouched) | All |
| Edge case | Pitfalls 1-7 enumerated above — each gets at least one test | SC-1, SC-4, SC-5 |
| Performance | Not a primary concern (graph build is one-time per full run); a smoke assertion that `buildDepGraph` over 14 entries completes in < 2s on a typical project | SC-2 (zero-call posture) |
| Contract stability | `formatDryRunJson` snapshot test pins the Phase 36 contract; any breaking change requires `formatVersion` bump | SC-2 (downstream contract) |

## Phase 36 Forward Compatibility — `--dry-run --json` shape

Phase 36's GitHub Action will read this output to produce the PR-preview comment (ACTN-01). The shape MUST be stable. Recommended v0:

```json
{
  "formatVersion": 1,
  "since": "HEAD~1",
  "graphVersion": 1,
  "wouldExecute": [
    {
      "renderer": "03-architecture",
      "filename": "03-ARCHITECTURE.md",
      "reasons": ["src/orchestrator/dag.ts", "src/cli/generate.ts"]
    }
  ],
  "wouldSkip": ["01-project-overview", "02-getting-started"],
  "fellBackToFullRegen": false,
  "noGraph": false
}
```

**Stability contract:**
- `formatVersion` is the **only** field Phase 36 reads first; any future shape change MUST bump this.
- `since` is `null` when `--since` not provided (per D-17).
- `graphVersion` is `null` when no graph existed at run time (allows Phase 36 to surface "no graph yet" state).
- `wouldExecute[].reasons` is always an array of strings (changed file paths). Phase 36 will join with comma for comment display.
- `wouldSkip` is a flat string array of renderer IDs (NOT objects). This is intentional — saves bytes in PR comments, which are capped at 65,000 chars per ACTN-03.
- `noGraph` distinguishes "no `--since` provided" from "no graph file present." `fellBackToFullRegen` is true in either case but only the latter sets `noGraph: true`.

**Fields explicitly NOT in v0** (future-additive — safe to add later without bumping `formatVersion`):
- `estimatedCost` — defer until Phase 33 (telemetry) provides per-renderer baselines.
- `model-hint` — Phase 34 adds `modelHint` to DocumentSpec; surface in dry-run after Phase 34.
- `evalVerdict` — Phase 35 owns this; not relevant to dry-run.

**Fields that would require a breaking bump** (advise planner to avoid): renaming `wouldExecute`/`wouldSkip`, changing `reasons` to an object, removing `fellBackToFullRegen`.

## Code Examples

### Reading mtime for `'reused'` INDEX entries

```typescript
// Source: pattern derived from src/renderers/utils.ts existing structure
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

async function getLastRenderedAt(outputDir: string, filename: string): Promise<string | undefined> {
  try {
    const s = await stat(join(outputDir, filename));
    return s.mtime.toISOString();
  } catch {
    return undefined;   // File missing — caller renders without timestamp
  }
}
```

### `--dry-run` early-exit branch (sketch)

```typescript
// Source: pattern derived from src/cli/generate.ts:108-122 ordering — runs BEFORE any auth/provider work
export async function runDryRun(rootDir: string, options: GenerateOptions): Promise<void> {
  const selectedDocs = resolveSelectedDocs(options.only, DOCUMENT_REGISTRY);
  const graph = await loadDepGraph(rootDir);
  let changedFiles: Set<string> | undefined;
  if (options.since) {
    const r = await getGitChangedFiles(rootDir, options.since);
    if (r.kind === 'ok') changedFiles = r.changedFiles;
  }
  const decision = computeDryRunDecision({ selectedDocs, graph, changedFiles, since: options.since });
  const out = options.json ? formatDryRunJson(decision) : formatDryRun(decision);
  process.stdout.write(out);
  // exit 0 (D-19); caller (runGenerate) returns immediately
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Adding `picomatch` as a direct dep is unnecessary (transitive via fast-glob) | Standard Stack > Alternatives | Low — D-05 mandates materialization, plain `Set.has()` is sufficient; no API gap |
| A2 | `fs.promises.writeFile` is atomic-enough for `dep-graph.json` without `rename` dance | Pitfall 6 | Low — corrupted JSON → safe `null` return; planner may choose to add tmp+rename pattern |
| A3 | File mtime is a sufficient `lastRenderedAt` proxy for INDEX `'reused'` rendering | Public API Contracts > Last-run timestamp | Low — mtime can be wrong if user edits docs by hand, but that's a feature (shows real freshness, not last-render time) |
| A4 | The existing `vitest.config.ts` thresholds `90/90/85/90` will apply to `src/regen/dep-graph.ts` without further config | Project Constraints | Verified — file not in coverage exclusion list |
| A5 | Plotting all 14 renderers' `requiredSources` patterns is a planner exercise, not research; this RESEARCH.md provides the helper (`withSelfRef`) and the rule (D-10), planner picks the specific globs per renderer | Wire-In Points | Medium — if `requiredSources` are mis-curated (too narrow), some real changes won't trigger renderer regen. Mitigated by D-04: unclaimed files force full regen. **Plan should include a curation pass** where the planner reads each renderer to identify what it reads (analyzers, rounds, registry, types) |
| A6 | The graph-rebuild step (`saveDepGraph` after full run) does NOT need to run inside the DAG — it can be a post-step appended to the render execute body. The render step already runs at the end of the DAG, so the new write happens AFTER all renderers complete | Wire-In Points | Low — wrapping in try/catch makes it non-fatal; if graph write fails, next run does it |

## Open Questions (RESOLVED)

1. **Should `INFRASTRUCTURE_PATHS` apply to changed-file paths only, or also strip infra files from each renderer's expanded list at build time?**
   - What we know: D-11 says graph builder "filters resolved source nodes against this list." That implies build-time filtering of each renderer's expanded list.
   - What's also needed: a separate at-lookup check on `changedFiles` (so `src/utils/logger.ts` in changedFiles short-circuits to "no match"). Both ARE needed (defense in depth).
   - **RESOLVED:** apply BOTH (build-time filter on expanded lists + lookup-time filter on changedFiles via `graph.infrastructureFiles`). The double-guard is cheap and aligns with success criterion #4. Plan 02 `buildDepGraph` + `filterRenderersByChangedFiles` both apply the filter.

2. **Should `--dry-run` (no `--since`) consult the graph at all?**
   - What we know: D-17 says "no source filter was applied. Output explicitly states `(no --since: dep-graph not consulted)`."
   - **RESOLVED:** when only `--dry-run` (no `--since`), output lists ALL selected renderers (or `--only`-filtered set) as `wouldExecute` with no reasons. `graphVersion` is still surfaced (so users see whether a graph file exists). No actual filtering happens. Implemented in Plan 02 `computeDryRunDecision` branch 2.

3. **Should the wire-in at `generate.ts:514` modify the existing branch, or refactor into a helper?**
   - What we know: D-21 says "after `getGitChangedFiles` resolves, call `filterRenderersByChangedFiles(...)`." That's a minimal addition.
   - **RESOLVED:** minimal addition (no helper extraction); the function is small and pure. Future phases (35 eval, 36 action) may warrant a helper. Implemented in Plan 03 Edit D.

4. **Should `00-index` appear in `wouldSkip` even though it always renders?**
   - What we know: INDEX always renders (it's the summary of statuses). It has no `requiredSources`.
   - **RESOLVED:** include `00-index` in `wouldExecute` always (with `reasons: ['(always renders)']`) so the count matches user expectation (14 docs, not 13). Bias toward inclusion for transparency. Implemented in Plan 02 `computeDryRunDecision` branch 4 and asserted in Plan 03 Task 2 integration tests.

5. **What's the right `requiredSources` for the analyzers-shaped renderers (07-dependencies, 12-testing, 13-deployment, 08-environment)?**
   - These renderers consume static analyzer outputs (package manifests, test files, env vars).
   - **RESOLVED:** include the analyzer source files (e.g. `src/analyzers/dependency-graph.ts` for 07-dependencies), the inventoried file types (e.g. `package.json`, `Cargo.toml` for 07-dependencies), and the renderer's own source. Per-renderer curation table delivered in Plan 01 `<renderer_to_source_curation>` block.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build, test, runtime | ✓ | (project standard) | — |
| `fast-glob` | Graph build | ✓ | 3.3.3 | — |
| `zod` | Schema validation | ✓ | 4.3.6 | — |
| `simple-git` | (consumed indirectly via `getGitChangedFiles`) | ✓ | 3.32.2 | — |
| `vitest` | Tests | ✓ | 4.0.18 | — |
| `memfs` | Filesystem mocking | ✓ | 4.56.10 | — |
| `git` CLI | (runtime — simple-git wraps it) | ✓ (assumed in dev/CI) | — | `getGitChangedFiles` already returns `{kind:'fallback'}` if not a repo |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — entire phase uses already-installed packages. **No `package.json` change required for Phase 32.**

## Security Domain

Phase 32 is greenfield CLI tooling reading the local repo and writing one JSON cache file. ASVS surface is small.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 32 does not touch auth |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | All operations are local-fs |
| V5 Input Validation | **yes** | `DepGraphSchema` (Zod) validates JSON on load → corrupt input rejected silently |
| V6 Cryptography | no | No crypto |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via crafted `requiredSources` glob | Tampering | Patterns are code-defined (registry constants), not user input — no traversal surface |
| Path traversal via crafted `dep-graph.json` file paths | Tampering | The graph JSON is read by `loadDepGraph`, validated by Zod (strings only). Stored paths are repo-relative; the only filesystem operations on them are `Set.has()` comparisons (no fs read). No traversal risk |
| Symlink escape during fast-glob expansion | Tampering | `followSymbolicLinks: false` in fast-glob options (matches `file-discovery.ts:109`) |
| Corrupted cache crashes generate | Denial of Service | `safeParse` returns failure → `loadDepGraph` returns `null` → full regen. Worst case is one slow run |
| Cache poisoning via malicious commit to `.handover/cache/dep-graph.json` | Tampering | `.handover/cache/` is gitignored (Phase 31 D-10) — file cannot be committed in normal workflow. If a user force-adds it, Zod validation rejects malformed entries. The "worst" valid attack is making the cache claim a renderer's deps include benign files → triggers regen when not needed (mild DoS / cost) |

## Sources

### Primary (HIGH confidence)

- **`./32-CONTEXT.md`** — locked decisions D-01..D-23, code insights, pitfalls
- **`.planning/REQUIREMENTS.md` §REGEN** — REGEN-03..07 specs verbatim
- **`.planning/ROADMAP.md` §Phase 32** — goal, 5 success criteria, requirement mapping
- **`./vitest.config.ts`** — coverage thresholds, exclusion list (verified exclusion of cli/generate.ts, render-*.ts; non-exclusion of registry.ts)
- **`./package.json`** — `fast-glob@^3.3.3`, `zod@^4.3.6`, `simple-git@^3.32.2`, `vitest@^4.0.18`, `memfs@^4.56.10`
- **`src/cache/git-fingerprint.ts` + `git-fingerprint.test.ts`** — confirms changed-file paths are repo-relative, set-based deduplication, fallback semantics, rename handling
- **`src/cache/round-cache.ts:16,93-145,187-214`** — mirror pattern for `CACHE_VERSION`, JSON read/write, gitignore
- **`src/renderers/registry.ts`** — 14 entries to extend with `requiredSources`
- **`src/renderers/types.ts:43-64`** — DocumentSpec and DocumentStatus shape
- **`src/renderers/render-00-index.ts:56-67`** — statusLabel switch to extend
- **`src/cli/generate.ts:514`** — wire-in point; lines 894-917 are the render loop
- **`src/cli/index.ts:25-40`** — `generate` command flag registration
- **`src/analyzers/file-discovery.ts:104-111`** — fast-glob invocation pattern with `cwd: rootDir`
- **Context7 `/mrmlnc/fast-glob`** — confirmed: no `isMatch` helper; helpers are `generateTasks`, `isDynamicPattern`, `escapePath`, `convertPathToPattern`
- **Context7 `/colinhacks/zod`** — confirmed `z.record(keyType, valueType)` two-argument form in v4; `z.literal()` accepts single values
- **`.planning/phases/31-init-wizard-action-scaffold/31-CONTEXT.md` D-09..D-13** — gitignore patching pattern; `.handover/cache` already covered

### Secondary (MEDIUM confidence)

- **`.planning/codebase/STACK.md`** — STACK.md cites zod 3.25.76 which is stale (actual: 4.3.6 per package.json). Other version claims align with package.json.
- **`.planning/codebase/STRUCTURE.md` §"Where to Add New Code"** — no rule for `src/regen/` (greenfield); does not contradict D-20

### Tertiary (LOW confidence — flagged for planner validation)

- **Per-renderer curation of `requiredSources` globs** — research provides the helper and the rule; the 14 specific lists are a planner curation pass. Recommend planner read each `render-NN-*.ts` to identify what it actually reads.
- **Whether to atomically rename `dep-graph.json.tmp` → `dep-graph.json`** — research recommends but doesn't mandate; non-fatal failure mode either way.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified in `package.json`; APIs verified in Context7
- Architecture: HIGH — wire-in points read at exact line ranges; render loop confirmed
- Pitfalls: HIGH — path-form alignment verified in `git-fingerprint.test.ts`; rename handling traced through `git-fingerprint.ts:60-62`
- JSON shape contract for Phase 36: MEDIUM — recommendation made; planner finalizes
- Per-renderer `requiredSources`: LOW — explicit curation deferred to planner

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (30 days; codebase is stable; fast-glob and zod APIs are mature)

## RESEARCH COMPLETE
