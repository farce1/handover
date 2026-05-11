# Architecture Research — v8.0 Integration Design

**Domain:** TypeScript CLI — Distribution & Smarter Regeneration (v8.0)
**Researched:** 2026-05-11
**Confidence:** HIGH (all findings from direct source read of referenced modules)

---

## System Overview (existing, for reference)

```
+------------------------------------------------------------------+
|  CLI Layer  src/cli/index.ts → generate.ts / init.ts / ...      |
+------------------------------------------------------------------+
|  Config  src/config/schema.ts + loader.ts   (Zod-first)         |
+------------------------------------------------------------------+
|  DAG Orchestrator  src/orchestrator/dag.ts  (Kahn's algorithm)  |
+------------------+-----------------------------------------------+
|  Analyzers (8,∥) |  AI Rounds  src/ai-rounds/  (6 rounds)       |
|  src/analyzers/  |  Providers  src/providers/  (LLMProvider)    |
|                  |  Context    src/context/tracker.ts            |
|                  |  Cache      src/cache/round-cache.ts          |
+------------------+-----------------------------------------------+
|  Renderers  src/renderers/registry.ts  (14 docs, ∥ allSettled)  |
+------------------------------------------------------------------+
|  .handover/  cache/  rounds/  search.db  config.json  docs/     |
+------------------------------------------------------------------+
```

---

## Feature-by-Feature Integration Design

---

### Feature 1 — GitHub Action `handover/regenerate-docs@v1`

#### Integration Points (existing modules touched)

- `src/cli/generate.ts` — invoked via `npx handover-cli generate`; the `--since` flag (v7.0) enables PR-preview mode by scoping to the merge-base diff; `--only` enables scoped runs; no changes to this file
- `src/cli/index.ts` — no changes; the action calls the existing binary as a subprocess
- `.handover/docs/` output directory — the action reads generated docs to diff against the base SHA for PR-comment content
- `src/cache/git-fingerprint.ts` — already used by `--since`; action passes the PR merge-base SHA as the `--since` ref

#### New Components

The action lives in a **separate repository** (`handover/regenerate-docs`), not inside this codebase. It follows the standard GitHub JavaScript action pattern.

```
handover/regenerate-docs/             <- separate repo
+-- action.yml                        <- action manifest
+-- src/
|   +-- main.ts                       <- entry; branches on event type
|   +-- modes/
|   |   +-- pr-preview.ts             <- PR-comment mode
|   |   +-- scheduled-refresh.ts      <- cron/manual PR-open mode
|   +-- github-client.ts              <- Octokit wrapper (comment + PR creation)
+-- dist/main.js                      <- bundled with @vercel/ncc or tsup
+-- package.json
```

**Separation of concerns:**

- `action.yml` declares inputs (`api-key`, `provider`, `model`, `only`, `since`, `github-token`, `mode`) and sets the Node.js runtime
- `main.ts` reads `github.event_name` (`pull_request` vs `schedule`/`workflow_dispatch`) to branch into `pr-preview.ts` or `scheduled-refresh.ts`
- `pr-preview.ts`: runs `handover generate --since <merge-base>` via `execa`, captures the diff of `.handover/docs/` vs base SHA using `git diff`, posts the diff as a PR comment via Octokit `@octokit/rest`
- `scheduled-refresh.ts`: runs `handover generate` unconditionally, commits changed docs files, opens a PR via Octokit
- The `handover` binary is invoked via `npx handover-cli@<version>` — no Docker image needed; Node.js is present on all GitHub-hosted runners
- PR-comment posting logic lives entirely in `github-client.ts` in the action repo, not in the `handover` CLI — the CLI remains transport-agnostic

**`action.yml` shape (key fields):**

```yaml
name: 'Handover Regenerate Docs'
description: 'Generate or preview handover documentation'
inputs:
  api-key:
    required: true
  provider:
    default: 'anthropic'
  model:
    required: false
  only:
    required: false
  since:
    required: false
  github-token:
    required: true
    default: ${{ github.token }}
  mode:
    description: 'pr-preview | scheduled-refresh'
    default: 'pr-preview'
runs:
  using: 'node20'
  main: 'dist/main.js'
```

#### Data Flow Changes

- **Reads:** existing `.handover/docs/` output; git history via `--since`
- **Writes:** nothing new inside the handover repo; the action writes a PR comment via the GitHub API and optionally a commit with updated docs
- **State:** entirely within GitHub Actions context (`GITHUB_TOKEN`, event payload); no new state in `.handover/`

#### Build Order Dependency

- No dependency on other v8.0 features for the core invocation
- PR-preview mode works best after the source→doc dependency graph is available (Feature 3), but can ship independently using `--since` on the merge-base
- Can be worked in parallel with Features 3–6 after the CLI interface is stable

---

### Feature 2 — `handover init` Wizard Upgrade

#### Integration Points (existing modules touched)

- `src/cli/init.ts` — primary file to extend; the `runInit()` function and the `detectProject()` helper at the bottom of the file are the extension points
- `src/config/schema.ts` (`HandoverConfigSchema`) — no structural changes needed; init writes whatever config subset it detects; the schema already has `include`/`exclude` array fields
- `src/config/defaults.ts` — reference for `DEFAULT_API_KEY_ENV`; no changes needed
- `src/cache/round-cache.ts` — the `ensureGitignored()` private method is the reference pattern for idempotent `.gitignore` patching; init wizard reuses the same append-once approach

#### New Components

All new code lives in `src/cli/init.ts` or a sibling module:

```
src/cli/
+-- init.ts               <- existing; extend runInit() and detectProject()
+-- init-detectors.ts     <- NEW: isolated detector functions
```

**`init-detectors.ts` exports:**

```typescript
// Provider detection: checks process.env for known API key variable names
// Returns provider name if a matching key is present, undefined otherwise
export function detectProvider(): string | undefined

// Scope detection: infers include/exclude patterns from the detected language
// Returns patterns suitable for writing into HandoverConfig.include/exclude
export function detectScope(language: string): { include: string[]; exclude: string[] }

// .gitignore patch: idempotent append of handover-specific entries
// Follows RoundCache.ensureGitignored() pattern exactly: read, check, append
export async function patchGitignore(projectRoot: string): Promise<void>
```

**Detector organization:**

- `detectProvider()` checks `process.env` for `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, etc. in priority order; the result is surfaced as a `hint` on the provider select prompt, not a forced default — the user still makes the choice
- `detectScope()` takes the language string already produced by the existing `detectProject()` and returns sensible exclude additions (Python: `__pycache__/`, `*.pyc`; Node: `dist/` already in `.gitignore` but `.next/`, `build/` may not be; Rust: `target/`)
- `patchGitignore()` exactly mirrors `RoundCache.ensureGitignored()`: read existing content, check if entries are already present using line-level string comparison, append with proper leading-newline handling, non-fatal on write failure

**Idempotency contract for `.gitignore` patches:**

- Check for `.handover/cache`, `.handover/telemetry`, `.handover/*.json` before appending
- Use the same guard pattern as `RoundCache._gitignoreChecked`: function-scoped idempotency, not instance-scoped
- Failure is logged at `logger.warn` level; init completes normally regardless

#### Data Flow Changes

- **Reads:** `process.env`, `package.json`, `tsconfig.json`, `Cargo.toml`, `go.mod`, `.gitignore`
- **Writes:** `.handover.yml` (existing behavior), `.gitignore` (new patch)
- **No new `.handover/` artifacts**

#### Build Order Dependency

- Independent; can be built first or in parallel
- Provider detection logic could pre-populate routing model defaults (Feature 5) when init writes `.handover.yml`, but this integration is additive and can be done after Feature 5 is built

---

### Feature 3 — Source→Doc Dependency Graph (REGEN-03)

#### Integration Points (existing modules touched)

- `src/cache/round-cache.ts` — the dep-graph JSON lives as a peer of `round-N.json` in `.handover/cache/`; uses the same `analysisFingerprint` computed in `generate.ts` as its invalidation key
- `src/cli/generate.ts` — two new callsites: (a) before DAG construction, load the existing graph and compute affected docs from `changedFiles`; (b) after the render step's `Promise.allSettled`, build and save a fresh graph
- `src/renderers/registry.ts` — `DocumentSpec.requiredRounds` is the round→doc mapping that the graph builder consumes; no changes to the registry itself
- `src/analyzers/coordinator.ts` — the graph reads `StaticAnalysisResult.fileTree.directoryTree` (already available after the static-analysis step) to enumerate source paths

#### New Components

```
src/cache/
+-- round-cache.ts          <- existing, unchanged
+-- git-fingerprint.ts      <- existing, unchanged
+-- dep-graph.ts            <- NEW: source→doc graph serialization

.handover/cache/
+-- rounds/                 <- existing
+-- dep-graph.json          <- NEW: persisted graph artifact (gitignored by existing rule)
```

**`dep-graph.ts` design:**

```typescript
export interface DepGraph {
  version: number;
  analysisFingerprint: string;   // invalidation key — same value as round cache
  generatedAt: string;
  // sourcePath → array of doc filenames (e.g. "src/cli/init.ts" → ["02-GETTING-STARTED.md"])
  edges: Record<string, string[]>;
}

export class SourceDocGraph {
  // Build: called after render step completes
  // Associates each rendered doc with the source files that fed its required rounds
  static build(
    staticAnalysis: StaticAnalysisResult,
    roundResults: Map<number, RoundExecutionResult<unknown>>,
    renderedDocs: DocumentSpec[],
    analysisFingerprint: string,
  ): DepGraph

  // Persist to .handover/cache/dep-graph.json
  async save(cacheDir: string): Promise<void>

  // Load; returns null if file is missing or fingerprint does not match
  static async load(cacheDir: string, fingerprint: string): Promise<DepGraph | null>

  // Query: given a set of changed source paths, return affected doc filenames
  static affectedDocs(graph: DepGraph, changedFiles: Set<string>): Set<string>
}
```

**How `generate --since` consults the graph:**

1. `--since` produces `changedFiles: Set<string>` via `git-fingerprint.ts` (existing)
2. Before building the DAG, call `SourceDocGraph.load(cacheDir, analysisFingerprint)`
3. If graph is valid, call `SourceDocGraph.affectedDocs(graph, changedFiles)` to get a `Set<string>` of affected doc filenames
4. Pass the affected-docs set into the render step — only those docs are re-rendered; others are not re-rendered (left as-is in the output directory)
5. If no valid graph exists (first run, cache cleared, fingerprint mismatch), fall back to full regen — safe degradation, consistent with existing round-cache miss behavior

**Composition with content-hash cache:**

- The dep-graph uses the same `analysisFingerprint` as round caches as its stale-check key
- When the fingerprint changes (source content changed), the graph is stale; a fresh graph is written after the render step completes
- The dep-graph operates at the doc-selection level, on top of the existing round-level cache — it does not replace round caching

#### Data Flow Changes

- **Reads:** `StaticAnalysisResult`, `roundResults Map`, `DocumentSpec[]` from registry, `changedFiles` from `--since` path
- **Writes:** `.handover/cache/dep-graph.json` (new file, written after render step)
- **State:** persists between runs in `.handover/cache/`; covered by existing `.gitignore` rule for `.handover/cache`

#### Build Order Dependency

- No upstream v8.0 feature dependency
- Should be built before Feature 6 (eval harness) so that eval runs can benefit from surgical regen when running golden cases
- Should be stable before the GitHub Action's PR-preview mode integrates `--since` + dep-graph for minimal re-render scope

---

### Feature 4 — Per-Renderer Cost Telemetry (Persisted)

#### Integration Points (existing modules touched)

- `src/context/tracker.ts` (`TokenUsageTracker`) — extended with `getRoundBreakdown()`: returns a `Map<number, { inputTokens, outputTokens, estimatedCostUsd }>` keyed by round number; existing `estimateCost()` logic is reused unchanged
- `src/cli/generate.ts` — two callsites: (a) the render step's `Promise.allSettled` loop already collects `durationMs` per doc; add a `telemetryWriter.record()` call after the loop; (b) pass `tracker` into the telemetry assembly function
- `src/renderers/registry.ts` — `DocumentSpec.requiredRounds` is used to apportion round costs to each rendered doc

#### New Components

```
src/telemetry/
+-- telemetry-writer.ts    <- NEW: write NDJSON records to .handover/telemetry/
+-- types.ts               <- NEW: TelemetryRecord Zod schema

.handover/telemetry/
+-- runs.ndjson            <- NEW: append-only, one JSON line per generate run
```

**`TelemetryRecord` shape (Zod schema in `src/telemetry/types.ts`):**

```typescript
const TelemetryRecordSchema = z.object({
  version: z.literal(1),
  runId: z.string(),              // crypto.randomUUID()
  generatedAt: z.string(),        // ISO-8601
  provider: z.string(),
  model: z.string(),
  sinceRef: z.string().optional(),
  renderers: z.array(z.object({
    docId: z.string(),            // matches DocumentSpec.id
    docFilename: z.string(),
    durationMs: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    estimatedCostUsd: z.number(),
    rounds: z.array(z.number()), // which rounds contributed to this doc
    status: z.enum(['full', 'cached', 'skipped']),
  })),
  totals: z.object({
    durationMs: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    estimatedCostUsd: z.number(),
  }),
});
```

**Format rationale — NDJSON (newline-delimited JSON):**

- One line per run: `fs.appendFile` with a single `JSON.stringify(record) + '\n'`; no parse-and-rewrite on every run
- Query patterns (trend analysis) can stream-parse or `grep` without loading the entire file
- Retention: no automatic pruning in v8.0; a `handover telemetry` subcommand or `--prune-telemetry` flag is a future milestone concern

**`TelemetryWriter` interface:**

```typescript
export class TelemetryWriter {
  constructor(private readonly telemetryDir: string) {}

  // mkdir -p if needed, then appendFile with one JSON line
  async record(record: TelemetryRecord): Promise<void>

  // Read and parse the last N lines for display/query
  async query(limit?: number): Promise<TelemetryRecord[]>
}
```

#### Data Flow Changes

- **Reads:** `TokenUsageTracker` round breakdown (existing data, new accessor); `displayState.rounds` cost map (already assembled in `generate.ts`)
- **Writes:** `.handover/telemetry/runs.ndjson` (new file, appended after render step completes)
- **State:** append-only time-series in `.handover/telemetry/`; should be added to `.gitignore` patch in Feature 2's `patchGitignore()`

#### Build Order Dependency

- **Must be built before Feature 5 (model routing)** — routing decisions must record which model was actually used per renderer; that data lives in the telemetry record
- **Must be built before Feature 6 (eval harness)** — eval run costs flow into the same telemetry stream; eval runs are tagged with `runId` so they are distinguishable from normal generate runs

---

### Feature 5 — Config-Driven Per-Renderer Model Routing

#### Integration Points (existing modules touched)

- `src/config/schema.ts` (`HandoverConfigSchema`) — new optional `renderers` top-level key
- `src/providers/factory.ts` (`createProvider()`) — extended to accept an optional `modelOverride?: string` parameter; when supplied, creates a provider configured for the override model while keeping the same base provider credentials and preset
- `src/renderers/registry.ts` (`DocumentSpec`) — new optional `modelHint: 'cheap' | 'standard' | 'synthesis'` field added to each spec entry; used by the router to resolve config-driven model mapping
- `src/cache/round-cache.ts` (`computeHash()`) — the `model` parameter already flows into the round cache hash (see line: `createHash('sha256').update(JSON.stringify({ roundNumber, model, analysisFingerprint, priorRoundHashes }))`); routing injects the routed model name at round creation time in `generate.ts`, so cache keys change automatically when routing changes — no structural change needed to `RoundCache`
- `src/cli/generate.ts` — the `wrapWithCache` closure's `modelName = config.model ?? preset?.defaultModel ?? 'default'` line is replaced with `resolveRoundModel(roundNum, DOCUMENT_REGISTRY, config.renderers?.routing, baseModel)`

**Critical design decision — routing applies at the round level, not the renderer level:**

Renderers are pure functions (`(ctx: RenderContext) => string`) that transform already-computed round outputs into markdown. They do not call LLMs. Therefore "per-renderer model routing" means: route the AI rounds that exclusively serve cheap renderers to cheaper models, and route rounds that feed synthesis-heavy renderers to more expensive models.

The mapping:
- `cheap` renderers (e.g. `07-dependencies`, `08-environment`) require only rounds 1, 2, 6
- `synthesis` renderers (e.g. `03-architecture`, `05-features`) require rounds 1–4
- If a round feeds both `cheap` and `synthesis` renderers, the more expensive routing wins (safe over-provision)

#### New Components

**Schema addition in `src/config/schema.ts`:**

```typescript
const RendererRoutingSchema = z.object({
  cheap: z.string().optional(),       // model override for rounds serving 'cheap' docs only
  synthesis: z.string().optional(),   // model override for rounds serving 'synthesis' docs
});

// Added to HandoverConfigSchema (optional, backward-compatible):
renderers: z.object({
  routing: RendererRoutingSchema.optional(),
}).optional(),
```

**New routing module:**

```
src/renderers/
+-- registry.ts     <- MODIFY: add modelHint to DocumentSpec interface
+-- routing.ts      <- NEW: resolveRoundModel()
```

**`routing.ts` exports:**

```typescript
// Given a round number and the full registry + routing config,
// returns the model to use for that round.
// Falls back to baseModel if no routing config is set or no hint matches.
export function resolveRoundModel(
  roundNumber: number,
  registry: DocumentSpec[],
  routingConfig: RendererRoutingConfig | undefined,
  baseModel: string,
): string
```

**Round cache key impact:**

`computeHash()` in `src/cache/round-cache.ts` already includes `model` in its hash input. `resolveRoundModel()` is called at round step creation time in `generate.ts`, replacing the flat `config.model ?? preset.defaultModel` expression. The cache key automatically reflects the routed model — no structural change to `RoundCache` is needed.

#### Data Flow Changes

- **Reads:** `HandoverConfig.renderers.routing`, `DOCUMENT_REGISTRY` (for `modelHint` lookup), `PROVIDER_PRESETS` (for validation of override model names)
- **Writes:** round cache entries keyed on the routed model (existing mechanism); routing decisions recorded in telemetry (Feature 4 dependency)
- **State:** no new artifacts; routing config lives in `.handover.yml`

#### Build Order Dependency

- **Depends on Feature 4 (telemetry)** — routing decisions (which model was used for which round) are recorded in `TelemetryRecord.renderers[].status` and the model field
- Independent of Feature 3 (dep-graph)

---

### Feature 6 — Eval Harness (Golden Set + Scoring Rubric)

#### Integration Points (existing modules touched)

- `src/cli/index.ts` — new `eval` subcommand registered alongside `generate`, `search`, `serve`, `reindex`
- `src/cli/generate.ts` (`runGenerate()`) — eval harness calls `runGenerate()` directly with a dedicated output dir; no changes to `runGenerate()` itself; the function already accepts a `GenerateOptions` object
- `src/providers/base.ts` / `src/providers/factory.ts` — the eval scorer makes one LLM call using the existing `LLMProvider.complete()` interface with a Zod schema for the score JSON; the configured provider is reused (no new credential surface)
- `src/context/tracker.ts` (`TokenUsageTracker`) — eval run costs flow through the existing tracker; cost is surfaced in the eval summary output and in the telemetry record (Feature 4 dependency)

#### New Components

```
src/cli/
+-- eval.ts                          <- NEW: runEval() command handler

src/eval/
+-- types.ts                         <- NEW: Zod schemas — EvalCase, EvalResult, EvalRun
+-- scorer.ts                        <- NEW: scoreDocs() — LLM-as-judge against rubric
+-- runner.ts                        <- NEW: runEvalSuite() — orchestrates cases
+-- rubric.ts                        <- NEW: DEFAULT_RUBRIC string constant + rubric loader

.handover/evals/
+-- golden/                          <- NEW: committed golden cases (YAML, tracked in git)
|   +-- case-001.yml
+-- runs/                            <- NEW: eval run outputs (gitignored)
    +-- <run-id>/
        +-- docs/                    <- generated docs for this run
        +-- result.json              <- EvalResult for this run
```

**Golden set location decision — `.handover/evals/golden/` committed to git:**

- Committed (not gitignored) — the golden set is the source of truth for quality regression detection
- YAML format: human-readable, diff-friendly, easy to review in PRs
- Each `case-NNN.yml` defines: `id`, `description`, `repoFixture` (path to a small fixture directory under `golden/`), `targetDocs` (defaults to all), `minScores` (optional, reserved for future promotion to blocking mode)

**`EvalCase` schema:**

```typescript
const EvalCaseSchema = z.object({
  id: z.string(),
  description: z.string(),
  repoFixture: z.string(),       // path relative to .handover/evals/golden/
  targetDocs: z.array(z.string()).optional(),
  minScores: z.record(z.string(), z.number()).optional(), // docId → min score 0-100
});
```

**`scorer.ts` — LLM-as-judge pattern:**

- Calls `provider.complete()` with a rubric prompt asking for a Zod-validated JSON score (0–100) and reasoning per dimension
- Rubric dimensions: factual accuracy, completeness, clarity, actionability
- The rubric lives in `rubric.ts` as an exported string constant; a `--rubric <path>` flag allows custom rubrics
- `scorer.ts` takes a `provider: LLMProvider` parameter — fully consistent with how AI rounds use providers; no new provider surface

**`runEval` CLI subcommand:**

```bash
handover eval [--golden .handover/evals/golden] [--run-id <id>] [--output .handover/evals/runs]
```

- Reads golden cases from YAML files, runs `runGenerate()` against each fixture with a scoped output dir, scores each doc set, writes `result.json`
- In CI: exits 0 always (observability mode in v8.0); prints score summary to stdout for visibility
- Future promotion to blocking: add `--fail-below <threshold>` flag that exits non-zero; this is explicitly a post-v8.0 concern per the milestone spec

#### Data Flow Changes

- **Reads:** `.handover/evals/golden/*.yml` (committed), repo fixtures
- **Writes:** `.handover/evals/runs/<run-id>/` (gitignored); eval summary to stdout; telemetry record (Feature 4)
- **State:** golden cases committed to git; run outputs gitignored under `.handover/evals/runs/`

#### Build Order Dependency

- **Depends on Feature 4 (telemetry)** — eval runs are logged as telemetry records so cost of eval runs is trackable over time
- **Depends on Feature 5 (model routing)** — eval can test routing behavior by specifying different routing configs in golden case fixtures; without routing, the eval harness still works but cannot test routing correctness
- Independent of Feature 3 (dep-graph) and Feature 1 (GitHub Action)

---

## Suggested Build Order

```
Feature 2  (init wizard)     <- no dependencies; quick win; unblocks onboarding
    |
    +-- Feature 3  (dep-graph) <- no feature deps; enables surgical regen
    |                              can run in parallel with Feature 2
    |
Feature 4  (telemetry)       <- depends on stable render step; unblocks 5 and 6
    |
Feature 5  (model routing)   <- depends on telemetry (4)
    |
Feature 6  (eval harness)    <- depends on telemetry (4) and routing (5)
    |
Feature 1  (GitHub Action)   <- depends on stable CLI + ideally dep-graph (3)
                                 built in separate repo; can be scaffolded in
                                 parallel after CLI interface is stable
```

**Dependency summary:**

| Feature | Depends On | Enables |
|---------|------------|---------|
| Init wizard (2) | nothing | better onboarding for action users |
| Dep-graph (3) | stable render step | surgical regen in action PR-preview mode |
| Telemetry (4) | stable render step | model routing log (5), eval cost tracking (6) |
| Model routing (5) | telemetry (4) | eval can test routing configs (6) |
| Eval harness (6) | telemetry (4), routing (5) | quality gates in future milestone |
| GitHub Action (1) | stable CLI + dep-graph (3) ideally | distribution |

**Parallelization opportunity:** Feature 1 (action repo setup, `action.yml`, Octokit scaffolding) can be worked in parallel with Features 3–6 because it lives in a separate repository. The core invocation (`npx handover-cli generate`) works against the current CLI. The dep-graph integration into PR-preview mode is additive and can land in a subsequent point release.

---

## New Files and Modified Files Summary

| Component | Location | New vs Modified |
|-----------|----------|-----------------|
| Action manifest + entry | `handover/regenerate-docs` repo | NEW (separate repo) |
| Octokit PR/comment client | `handover/regenerate-docs/src/github-client.ts` | NEW (separate repo) |
| Init detector functions | `src/cli/init-detectors.ts` | NEW |
| `runInit()` extension | `src/cli/init.ts` | MODIFIED |
| Source→doc dep-graph | `src/cache/dep-graph.ts` | NEW |
| Dep-graph artifact | `.handover/cache/dep-graph.json` | NEW (runtime artifact) |
| Dep-graph integration | `src/cli/generate.ts` | MODIFIED (2 callsites) |
| Telemetry writer | `src/telemetry/telemetry-writer.ts` | NEW |
| Telemetry schema | `src/telemetry/types.ts` | NEW |
| Telemetry artifact | `.handover/telemetry/runs.ndjson` | NEW (runtime artifact) |
| Telemetry callsite | `src/cli/generate.ts` | MODIFIED (1 callsite after render step) |
| `TokenUsageTracker` accessor | `src/context/tracker.ts` | MODIFIED (add `getRoundBreakdown()`) |
| Renderer model hint | `src/renderers/registry.ts` | MODIFIED (add `modelHint` to `DocumentSpec`) |
| Renderer routing logic | `src/renderers/routing.ts` | NEW |
| Config schema | `src/config/schema.ts` | MODIFIED (add `renderers.routing`) |
| Round model resolution | `src/cli/generate.ts` | MODIFIED (`wrapWithCache` model selection) |
| Eval CLI command | `src/cli/eval.ts` | NEW |
| Eval types/schemas | `src/eval/types.ts` | NEW |
| Eval scorer | `src/eval/scorer.ts` | NEW |
| Eval runner | `src/eval/runner.ts` | NEW |
| Eval rubric | `src/eval/rubric.ts` | NEW |
| Golden cases | `.handover/evals/golden/` | NEW (committed YAML) |
| Eval run outputs | `.handover/evals/runs/` | NEW (gitignored) |
| CLI command registration | `src/cli/index.ts` | MODIFIED (add `eval` subcommand) |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Parallel Orchestrator for Eval

**What people do:** Create a second `DAGOrchestrator` instance inside `runEval()` with different step definitions to control which rounds run.

**Why it's wrong:** Duplicates the DAG logic, causes divergence from the main generate pipeline, and eval results no longer reflect real generate behavior.

**Do this instead:** `runEval()` calls `runGenerate()` directly with a fixture root and a redirected output path. The eval harness is a thin wrapper around the existing pipeline.

### Anti-Pattern 2: Telemetry in the Round Cache Layer

**What people do:** Add telemetry writes to `RoundCache.set()` so every cache write is tracked automatically.

**Why it's wrong:** Round cache is a low-level content-addressed store; coupling it to telemetry violates single-responsibility and makes the cache harder to test. Telemetry is a run-level concern.

**Do this instead:** Write telemetry once at the end of the render step in `generate.ts`, aggregating data from `TokenUsageTracker` and `displayState.rounds`. The telemetry record is assembled at the CLI layer where all per-run data is already available.

### Anti-Pattern 3: Model Routing at the Renderer Level

**What people do:** Pass a different `LLMProvider` instance into each renderer's `render()` function call to use cheaper models for cheap docs.

**Why it's wrong:** Renderers are pure functions `(ctx: RenderContext) => string`. They transform already-computed round outputs. They do not call LLMs. Injecting a provider into a renderer would be dead code and would break the clean render-context model.

**Do this instead:** Apply routing at round step creation time in `generate.ts`. The routed model flows into the round's `LLMProvider`, the round cache hash (via the existing `model` parameter in `computeHash()`), and the telemetry record.

### Anti-Pattern 4: GitHub PR-Comment Logic Inside the CLI

**What people do:** Add an `--post-github-comment` flag to `handover generate` that calls the GitHub API directly.

**Why it's wrong:** Introduces GitHub API credentials and `@octokit/rest` as a runtime dependency of the CLI, which is used in non-CI environments where GitHub API access is irrelevant.

**Do this instead:** The CLI remains transport-agnostic. PR-comment logic lives entirely in the action repo's `github-client.ts`. The action calls the CLI as a subprocess and handles GitHub API calls itself.

### Anti-Pattern 5: Separate Config System for Eval

**What people do:** Add a separate `eval.config.yml` alongside `.handover.yml` for eval-specific settings.

**Why it's wrong:** Creates a second config surface, duplicates provider/model settings, and bypasses the existing Zod-first config loading path.

**Do this instead:** Eval reads `.handover.yml` for provider/model settings (same path as generate). Eval-specific settings (golden path, run output path) are CLI flags with sensible defaults rooted at `.handover/evals/`.

---

## Sources

- Direct source read (all findings HIGH confidence):
  - `src/cli/generate.ts` — pipeline integration nexus, cache wiring, `wrapWithCache` closure, render step
  - `src/cli/init.ts` — `runInit()` function, `detectProject()` helper
  - `src/cache/round-cache.ts` — `computeHash()` signature, `ensureGitignored()` pattern, cache entry shape
  - `src/context/tracker.ts` — `TokenUsageTracker` API, `estimateCost()`, `getRoundUsage()`
  - `src/providers/base.ts` — `LLMProvider` interface
  - `src/providers/factory.ts` — `createProvider()` signature, model resolution
  - `src/providers/presets.ts` — `ProviderPreset` shape, pricing data
  - `src/config/schema.ts` — `HandoverConfigSchema` Zod definition
  - `src/renderers/registry.ts` — `DocumentSpec` interface, `DOCUMENT_REGISTRY`, `ROUND_DEPS`
- Architecture docs: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/STACK.md`, `.planning/codebase/INTEGRATIONS.md`
- Project context: `.planning/PROJECT.md`

---

*Architecture research for: v8.0 Distribution & Smarter Regen integration design*
*Researched: 2026-05-11*
