# Stack Research

**Domain:** GitHub Action distribution + wizard upgrade + dependency graph + cost telemetry + model routing + eval harness (handover-cli v8.0)
**Researched:** 2026-05-11
**Confidence:** HIGH

---

## Context: What Already Exists (Do Not Re-research)

The following are already installed and validated in handover-cli. These are NOT re-researched here.

- `@clack/prompts@^1.0.1` — interactive CLI prompts (already in use in `src/cli/init.ts`)
- `better-sqlite3@^12.6.2` — synchronous SQLite (already used for `search.db` via sqlite-vec)
- `zod@^4.3.6` — schema validation (already used throughout; Zod v4 syntax confirmed)
- `vitest@^4.0.18` — test runner (already installed)
- `simple-git@^3.32.2` — git operations
- `tsup@^8.0.0` — TypeScript bundler

The new milestone adds **six** capability areas. Only new package choices are researched below.

---

## Recommended Stack

### 1. GitHub Action: Distribution Mechanism

**Verdict: Composite action wrapping `npx handover-cli` — NOT a JS action.**

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Composite action (`runs.using: composite`) | — | Action type | handover-cli is an npm package already distributed on npm. A composite action simply calls `npm install --global handover-cli` or `npx handover-cli` via shell steps. No bundling, no dist/ commit, no Node version lock-in. Composite actions run shell steps on the runner directly and support `actions/setup-node` for Node version control. |
| `actions/setup-node` | `v4` | Node version pinning | Pins Node version on the runner before npx/npx call. Use `node-version: '22'` to match supported Node 22 engine. SHA-pin in workflow using `@v4` + SHA for OpenSSF Scorecard compliance. |
| `peter-evans/create-pull-request` | `v8.1.1` (latest as of 2026-05-11) | Scheduled-refresh mode: open doc-refresh PR | The canonical action for "commit changes then open a PR." Needs `contents: write` and `pull-requests: write` permissions. Version verified on 2026-05-11. |
| `peter-evans/find-comment` | `v4` | PR-preview mode: find existing bot comment | Find-then-upsert pattern avoids duplicate comments on re-runs. Use `body-includes: <!-- handover-preview -->` as the unique marker. |
| `peter-evans/create-or-update-comment` | `v5.0.0` (latest as of 2026-05-11) | PR-preview mode: post/update docs-diff comment | Upserts on the comment found by `find-comment`. Use `edit-mode: replace` to keep the PR comment fresh without accumulating duplicates. |

**Why composite over JavaScript action:**

A JavaScript action requires bundling all runtime dependencies into `dist/` (committed to the action repo) and locking to a specific `node20` or `node24` runtime via `runs.using`. Since handover-cli is already an npm package, a JS action would duplicate the package and add a complex ncc/tsup build pipeline inside the action repo. Composite actions avoid all of this by delegating to `npx handover-cli@latest` (or a pinned version input), with the npm package itself carrying the full runtime. Composite is simpler to maintain, correct for this use case, and immune to the ncc/Node24 compatibility issue noted below.

**Why NOT a JavaScript action:** `@vercel/ncc@0.38.4` (used to bundle JS actions into a single `dist/index.js`) has a confirmed open issue with Node.js 24 compatibility — CI testing covers only Node 18/20 and the issue was closed as "not planned." GitHub requires `node24` for new actions starting June 2026. The composite path sidesteps this entirely.

**action.yml structure for composite:**

```yaml
# .github/actions/handover-regenerate-docs/action.yml
name: 'Handover Regenerate Docs'
description: 'Regenerate handover documentation via CLI'
author: 'handover'
branding:
  icon: 'refresh-cw'
  color: 'blue'

inputs:
  version:
    description: 'handover-cli version to use'
    required: false
    default: 'latest'
  mode:
    description: 'pr-preview | scheduled-refresh'
    required: true
  github-token:
    description: 'GitHub token'
    required: false
    default: ${{ github.token }}
  provider:
    description: 'LLM provider'
    required: false
    default: 'anthropic'

runs:
  using: 'composite'
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
    - name: Install handover-cli
      shell: bash
      run: npm install -g handover-cli@${{ inputs.version }}
    - name: Run handover generate
      shell: bash
      run: handover generate
      env:
        ANTHROPIC_API_KEY: ${{ inputs.api-key }}
```

**Required GITHUB_TOKEN permissions:**

| Mode | Permissions Required |
|------|----------------------|
| PR-preview | `pull-requests: write` (to post/update comment) |
| Scheduled-refresh | `contents: write`, `pull-requests: write` |

**Marketplace listing requirements (verified):**
- Action must live in repository root or a named subdirectory; one action per repo for top-level listing
- `name`, `description`, `branding.icon` (Feather v4.28 icon name), `branding.color` are required for marketplace display
- README.md in the action directory is indexed by the marketplace
- `node24` runtime required for new JS actions from June 2026; composite actions are unaffected

---

### 2. `handover init` Wizard Upgrade

**Verdict: Stay on `@clack/prompts@^1.3.0` — upgrade existing dependency.**

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@clack/prompts` | `^1.3.0` (upgrade from `^1.0.1`) | Interactive wizard prompts | Already used in `src/cli/init.ts`. v1.3.0 adds `autocompleteMultiselect`, `path` selector, and `multiselect`. The v8.0 wizard needs multi-provider detection (multiselect), path input for custom output dir, and .gitignore patch confirmation (confirm). All covered. ESM-only matches `"type": "module"`. |

**Why not switch to alternatives:**

| Library | Why Not |
|---------|---------|
| `inquirer@12.x` | 100KB+ unpacked, 30+ transitive deps. Heavier than clack. clack is already installed and covers all needed prompt types. |
| `@inquirer/prompts` (modular) | Correct architecture but project is already on clack. Switching provides no functional gain for v8.0 scope. |
| `prompts` (terkelg) | Last release 2023, low activity. Not recommended for new work in 2026. |
| `enquirer` | Last major release 2020, maintenance stalled. Avoid. |

**New prompt types needed for wizard upgrade:**

The v8.0 wizard additions require:

1. `multiselect` — select which `.gitignore` patterns to add (already available in `@clack/prompts@^1.3.0`)
2. `autocompleteMultiselect` — provider detection: show detected providers with auto-selected defaults (new in v1.3.0)
3. `path` — custom output directory selection (new in v1.3.0)
4. `confirm` — confirm .gitignore patch, scope auto-detect choices (already available)

Upgrade is a `^` bump; no API breaking changes between 1.0.x and 1.3.0. The `isCI()` and `isTTY()` guards already used in `src/cli/init.ts` continue to work unchanged.

**Integration point:** `src/cli/init.ts` — existing file, extend `p.group()` block.

---

### 3. Source→Doc Dependency Graph (REGEN-03)

**Verdict: Hand-rolled `Map<string, Set<string>>` structure persisted as JSON — no graph library.**

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Native `Map<string, Set<string>>` | — | In-memory dependency graph | The source→doc graph is a simple bipartite DAG: source files are one vertex set, document renderers are the other. No cycles. No graph algorithms beyond reachability traversal needed. A `Map<sourcePath, Set<rendererName>>` covers 100% of the use case: "given this set of changed source files, which renderers need to re-run?" |
| `JSON.stringify` / `JSON.parse` | — | Serialization to `.handover/dep-graph.json` | The graph needs to survive between runs. The existing cache pattern (`.handover/cache/*.json`) uses plain JSON. Same pattern here. Map→JSON via `Object.fromEntries`, Set→Array for serialization. Reconstruction is trivial. |

**Why not graphology:**

`graphology@0.26.0` (2.7MB unpacked) is an excellent graph library — 863K weekly downloads, actively maintained (issues as recent as March 2025), full TypeScript support, includes `graphology-dag` for topological sort. However, it is overkill for this use case:

- The handover dep graph has ~14 renderer nodes and hundreds of source file nodes — small scale
- The only algorithm needed is "given N changed source nodes, enumerate all adjacent renderer nodes" — one-level reachability, solved with `Map.get()`
- `graphology-dag@0.4.1` was last published ~2 years ago (separate package from core graphology)
- Adding a 2.7MB runtime dependency for a problem solvable with 30 lines of TypeScript adds installation weight to every `npx handover-cli` user

Use graphology only if the graph grows to require topological sort, cycle detection, or visualization. Add as a future upgrade if complexity warrants it.

**Implementation sketch:**

```typescript
// src/deps/graph.ts
export type DepGraph = Map<string, Set<string>>; // sourcePath → Set<rendererName>

export function buildDepGraph(manifest: DepManifest): DepGraph { ... }
export function affectedRenderers(graph: DepGraph, changedPaths: string[]): Set<string> {
  const affected = new Set<string>();
  for (const path of changedPaths) {
    for (const renderer of graph.get(path) ?? []) affected.add(renderer);
  }
  return affected;
}

// Serialization: .handover/dep-graph.json
export function serializeGraph(graph: DepGraph): Record<string, string[]> {
  return Object.fromEntries([...graph].map(([k, v]) => [k, [...v]]));
}
export function deserializeGraph(raw: Record<string, string[]>): DepGraph {
  return new Map(Object.entries(raw).map(([k, v]) => [k, new Set(v)]));
}
```

**Storage path:** `.handover/dep-graph.json` — same pattern as `.handover/cache/analysis.json`. Written after each full generate run, read before incremental runs.

**Integration points:** `src/orchestrator/dag.ts` (DAGOrchestrator consumes the graph to skip steps), `src/renderers/registry.ts` (renderer names as graph vertex IDs), `src/cli/generate.ts` (writes graph after full run).

---

### 4. Per-Renderer Cost Telemetry Persistence

**Verdict: Append to existing `better-sqlite3` database — extend `.handover/search.db` with a `telemetry` table or create `.handover/telemetry.db`.**

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `better-sqlite3` | `^12.6.2` (already installed) | Time-series telemetry persistence | Already installed for sqlite-vec search. Adding a `renderer_runs` table for time-series cost data costs zero new dependencies. Synchronous API fits the existing pattern. Supports range queries for trend display (`SELECT * FROM renderer_runs WHERE renderer = ? ORDER BY ran_at DESC LIMIT 30`). |

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS renderer_runs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at     TEXT NOT NULL,          -- ISO-8601 timestamp
  run_id     TEXT NOT NULL,          -- unique per generate invocation
  renderer   TEXT NOT NULL,          -- renderer name from DOCUMENT_REGISTRY
  model      TEXT NOT NULL,
  provider   TEXT NOT NULL,
  input_tok  INTEGER NOT NULL,
  output_tok INTEGER NOT NULL,
  cache_read INTEGER NOT NULL DEFAULT 0,
  cost_usd   REAL NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  mode       TEXT NOT NULL DEFAULT 'full'  -- 'full' | 'incremental' | 'skipped'
);
CREATE INDEX IF NOT EXISTS idx_renderer_runs_renderer ON renderer_runs(renderer, ran_at);
```

**Why not NDJSON append:**

NDJSON (newline-delimited JSON) is appropriate when: the data is log-like, never queried backward, and consumed by external tooling (e.g., shipped to a log aggregator). For handover's use case — trend display in CLI, "how has cost of renderer X changed over last N runs?" — random-access range queries are needed. NDJSON requires reading the entire file and filtering in memory; SQLite handles this in microseconds via the indexed query above. The project already has `better-sqlite3` installed, so there is no additional dependency cost.

**Why not a separate `.handover/telemetry.db`:**

The search.db already has `better-sqlite3` open. Extending it avoids a second database connection. However, keeping telemetry in a separate file (`.handover/telemetry.db`) makes it easier to delete/reset independently and avoids touching the vector index schema. Use a separate file.

**Integration points:** `src/context/tracker.ts` (existing cost tracking at round level — extend to per-renderer level), `src/renderers/registry.ts` (renderers report elapsed + token data), `src/cli/generate.ts` (opens telemetry db, passes writer to renderers).

---

### 5. Config-Driven Per-Renderer Model Routing

**Verdict: Pure Zod schema extension — no new packages needed.**

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `zod@^4.3.6` (already installed) | — | Schema extension for per-renderer routing config | Extend `HandoverConfigSchema` in `src/config/schema.ts` with a `renderers` record mapping renderer names to overrides. Zod v4's `.extend()` and `z.record()` cover this cleanly. No new library needed. |

**Proposed schema addition:**

```typescript
// Add to HandoverConfigSchema in src/config/schema.ts
const RendererOverrideSchema = z.object({
  model: z.string().optional(),    // override model for this renderer
  provider: z.enum([...providers]).optional(),  // override provider
  skip: z.boolean().optional(),    // permanently skip this renderer
}).strict();

// Inside HandoverConfigSchema:
renderers: z.record(z.string(), RendererOverrideSchema).optional().default({}),
```

**Config usage in `.handover/config.json`:**

```json
{
  "renderers": {
    "file-index": { "model": "claude-haiku-4-5" },
    "architecture": { "model": "claude-opus-4-6" },
    "security-audit": { "provider": "openai", "model": "gpt-4o" }
  }
}
```

**Version constraint note:** The existing codebase uses Zod v4 (`^4.3.6`). Zod v4 deprecated `.merge()` — use `.extend()` instead. The proposed schema uses `.extend()` consistent with current codebase patterns. No version bump needed.

**Integration points:** `src/config/schema.ts` (schema addition), `src/renderers/registry.ts` (renderer execution reads config override before selecting provider/model), `src/providers/factory.ts` (factory accepts per-call override).

---

### 6. Eval Harness

**Verdict: `vitest-evals@^0.8.0` + `autoevals@^0.0.132` as devDependencies — extend existing vitest infrastructure.**

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `vitest-evals` | `^0.8.0` (547KB unpacked) | Eval harness runner integrating with existing vitest setup | Maintained by Sentry (getsentry/vitest-evals). Provides `describeEval()` — a vitest wrapper that runs test cases against a `task` function, applies `scorers`, and reports aggregate pass/fail with threshold. Runs inside existing `vitest` setup with no second test runner. OBSERVABILITY mode: run with a separate `vitest.config.eval.ts` that never sets coverage thresholds, keeping eval runs non-blocking. |
| `autoevals` | `^0.0.132` (1.1MB unpacked) | LLM-as-judge scorers | Braintrust-maintained scorer library. Provides `Factuality`, `ClosedQA`, and `LLMClassifier` scorers that call an LLM judge to assess output quality. Works with any provider by setting `OPENAI_API_KEY` or Anthropic key. Integrates directly into `vitest-evals` scorer array. |

**Why not promptfoo:**

`promptfoo@0.121.11` has an unpacked size of **25.6MB** (verified via `npm info`) and ~85 direct dependencies (full transitive tree was 1179 deps in a recent version). It is designed as a standalone CLI + server for prompt evaluation — heavyweight for embedding as a devDependency in a CLI package. The `promptfoo.evaluate()` Node API works but adds 25MB to devDependency install, which inflates CI install time and conflicts with handover's lean-dep philosophy.

**Why not promptfoo-action:**

The `promptfoo/promptfoo-action` GitHub Action is purpose-built for evaluating prompt changes on PRs. It is the right tool if handover were a prompt-template product, but handover's eval target is *rendered document quality*, not prompt parameters. The vitest-evals + autoevals combination evaluates document output against golden references in the existing test infrastructure.

**Why not Inspect-AI:**

Python-only. handover-cli is a TypeScript/Node project with zero Python infrastructure. Cross-language eval harness is out of scope.

**Why not viteval:**

Under active breaking-changes development toward v1. `v0` branch only; 50 GitHub stars. Not suitable for production CI integration. Revisit when v1 stabilizes.

**Golden set storage:**

Store golden sets as `.json` files under `src/eval/golden/`:

```
src/eval/golden/
  overview-small-ts-project.json     # input: repo snapshot hash, expected: quality criteria
  architecture-monorepo.json
  security-audit-node-app.json
```

Each golden file is a JSON array of `{ input, expected, meta }` test case objects consumed by `describeEval`'s `data` function. Committed to the repo. Updating golden expectations is a deliberate PR-reviewed change.

**Observability mode pattern:**

```typescript
// src/eval/vitest.config.eval.ts — separate config, never imported by main vitest.config.ts
export default defineConfig({
  test: {
    include: ['src/eval/**/*.eval.ts'],
    // NO coverage thresholds — eval failures are informational
    reporter: ['verbose', 'junit'],
    outputFile: '.handover/eval-results.xml',
  },
});
```

CI job:

```yaml
- name: Run eval harness (observability)
  run: npx vitest run --config src/eval/vitest.config.eval.ts
  continue-on-error: true   # never blocks CI
```

**Integration points:** New `src/eval/` directory, separate vitest config, CI job that posts eval score summary as a comment on PRs (uses `peter-evans/create-or-update-comment` from the Action stack above).

---

## Installation Summary

```bash
# Upgrade existing dependency (init wizard multiselect/path support):
npm install @clack/prompts@^1.3.0

# New devDependencies (eval harness — development only):
npm install -D vitest-evals@^0.8.0 autoevals@^0.0.132

# New runtime devDependencies for action repo (separate repo from handover-cli):
# @actions/core@3.0.1, @actions/github@9.1.1 — only if composite action
# needs scripted Octokit calls (not needed for pure shell composite)
```

**No new runtime production dependencies required** for dependency graph, cost telemetry, or model routing — all use existing `better-sqlite3`, `Map`, and `zod` already in the bundle.

---

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| Action type | Composite action (shell + npx) | JavaScript action (`node24` + ncc) | Only if the action needs complex GitHub API scripting beyond what shell + `@actions/github-script` can provide. The ncc/Node24 compatibility gap makes JS actions risky in 2026. |
| Action type | Composite action | Docker action | If handover-cli required a specific OS environment or binary dependencies. Node CLI on a runner doesn't need Docker. |
| PR comment upsert | `peter-evans/create-or-update-comment@v5` | `actions/github-script` with inline Octokit | GitHub-script is fine but requires inline JS in YAML. peter-evans actions are purpose-built, SHA-pinnable, and have no inline code. |
| Graph storage | Native Map+JSON | `graphology@0.26.0` | Use graphology if: (a) the graph needs topological sort for renderer ordering (currently handled by the existing DAGOrchestrator), (b) graph exceeds 500+ nodes, or (c) cycle detection becomes necessary. |
| Telemetry storage | SQLite (`better-sqlite3`) | NDJSON append file | Use NDJSON if: the telemetry needs to be consumed by external log aggregation tools (Datadog, Splunk, etc.) or if backward-scan queries are not needed. For CLI trend display, SQLite is strictly better. |
| Telemetry storage | SQLite | Parquet (via DuckDB) | Parquet + DuckDB is the right choice at 100K+ rows and when analytics tooling (Jupyter, Metabase) is involved. Overkill for a CLI tool's per-run metrics. |
| Prompts library | `@clack/prompts@^1.3.0` (upgrade) | `@inquirer/prompts` | `@inquirer/prompts` is modular and well-maintained. Prefer it only if starting a new CLI from scratch. Switching handover mid-project for no functional gain adds churn. |
| Eval harness | `vitest-evals` + `autoevals` | `promptfoo` as devDep | Use promptfoo if the eval focus shifts from document quality to prompt parameter comparison/A-B testing between providers. Its YAML config is powerful for that use case. Too heavy (25MB) for embedded devDep. |
| Eval harness | `vitest-evals` + `autoevals` | Promptfoo via npx in CI | `npx promptfoo@latest eval` in CI is a valid middle ground — no devDep install weight, but loses TypeScript integration with the eval test code. Viable as a future upgrade if vitest-evals proves insufficient. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@vercel/ncc` for action bundling | Issue #1297: Node.js 24 compatibility blocked (closed "not planned"). GitHub requires node24 for new actions from June 2026. | Composite action with `npx` — sidesteps bundling entirely |
| `node16` or `node20` in `runs.using` | Deprecated by GitHub. node20 deprecation announced Sep 2025; node24 required from June 2026. | `runs.using: composite` (node-agnostic) or `node24` if a JS action is used |
| `graphology` | 2.7MB runtime dep for a problem solvable with `Map<string, Set<string>>`. Adds install weight for all CLI users. | Native Map + JSON serialization |
| `promptfoo` as devDependency | 25.6MB unpacked, 85+ direct deps. CI install time penalty unjustified for observability-only eval. | `vitest-evals@^0.8.0` + `autoevals@^0.0.132` (total: ~1.7MB) |
| `viteval` | Pre-v1, active breaking changes, 50 stars. No production stability guarantee. | `vitest-evals@^0.8.0` (Sentry-maintained, 0.8.0 stable, Apache-2.0) |
| `inquirer` / `enquirer` for wizard | `inquirer` is heavyweight; `enquirer` last major release 2020, maintenance stalled. | `@clack/prompts@^1.3.0` (already installed, just upgrade) |
| NDJSON file for telemetry | No index, full-file-scan for trend queries, no atomicity guarantees on concurrent writes. | `better-sqlite3` with indexed `renderer_runs` table (already installed) |
| Parquet + DuckDB for telemetry | Engineering overkill for < 10K rows/year of per-render metrics. | `better-sqlite3` |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@clack/prompts@^1.3.0` | `"type": "module"` (ESM-only since v1.x) | Project is `"type": "module"`. ESM import `import * as p from '@clack/prompts'` unchanged from v0.x API. |
| `vitest-evals@^0.8.0` | `vitest@^4.0.18` | Requires vitest as peer dependency. Project already has `vitest@^4.0.18`. Confirmed compatible. |
| `autoevals@^0.0.132` | Node >= 18, any LLM provider with API key in env | Uses `fetch` for LLM judge calls. Node 18+ has native fetch. No bundler conflicts. |
| `better-sqlite3@^12.6.2` | Node 20/22 (prebuilt binaries) | Already installed for sqlite-vec. Adding a second table is schema-only change, no version bump needed. |
| `peter-evans/create-pull-request@v8.1.1` | GitHub Actions runner ubuntu-latest | Verified latest stable on 2026-05-11. SHA-pin for OpenSSF Scorecard compliance. |
| `peter-evans/find-comment@v4` | GitHub Actions runner | Latest stable. Pair with `create-or-update-comment@v5`. |
| `peter-evans/create-or-update-comment@v5.0.0` | GitHub Actions runner | Latest stable as of Oct 2025. |
| `actions/setup-node@v4` | GitHub Actions composite | Standard, SHA-pin required for Scorecard compliance. |

---

## Sources

- GitHub Actions metadata syntax (official docs, fetched 2026-05-11): `runs.using` valid values = `composite`, `node20`, `node24`. `node16` removed.
- GitHub Actions node24 deprecation of node20: GitHub Changelog, Sep 2025 — node20 deprecated; node24 required for new actions from June 2026
- `@vercel/ncc` Node24 issue: github.com/vercel/ncc/issues/1297 — closed "not planned" (MEDIUM — GitHub issue thread, fetched 2026-05-11)
- `@actions/core@3.0.1`, `@actions/github@9.1.1`, `@actions/exec@3.0.0`: npm registry versions verified 2026-05-11 (HIGH)
- `peter-evans/create-pull-request@v8.1.1`: Release verified 2026-05-11 via WebFetch (HIGH)
- `peter-evans/find-comment@v4`, `peter-evans/create-or-update-comment@v5.0.0`: README and release verified 2026-05-11 (HIGH)
- `@clack/prompts@1.3.0`: npm registry + Context7 docs verified 2026-05-11 — `multiselect`, `autocompleteMultiselect`, `path` confirmed in v1.3.0 (HIGH)
- `graphology@0.26.0`: npm registry, 2.7MB unpacked, ~863K weekly downloads, last published ~1 year ago (MEDIUM — active but slow-moving)
- `graphology-dag@0.4.1`: Last published ~2 years ago, separate from core graphology (MEDIUM)
- `better-sqlite3@12.9.0` (latest, project uses `^12.6.2`): Context7 `/wiselibs/better-sqlite3` docs verified synchronous INSERT API (HIGH)
- `vitest-evals@0.8.0`: npm registry (547KB unpacked, no listed production dependencies), GitHub getsentry/vitest-evals confirmed Sentry-maintained Apache-2.0 (HIGH)
- `autoevals@0.0.132`: npm registry (1.1MB unpacked), Braintrust-maintained, Factuality + ClosedQA scorers confirmed (HIGH)
- `promptfoo@0.121.11`: npm info shows 25,651,962 bytes unpacked (~25.6MB), confirmed heavyweight (HIGH — npm registry)
- Zod v4 `.extend()` vs deprecated `.merge()`: zod.dev/v4 release notes (HIGH — official docs)

---

*Stack research for: v8.0 Distribution & Smarter Regen (GitHub Action, init wizard, dep graph, cost telemetry, model routing, eval harness)*
*Researched: 2026-05-11*
