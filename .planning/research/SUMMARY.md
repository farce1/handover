# Research Summary — v8.0 Distribution & Smarter Regen

**Project:** handover-cli
**Milestone:** v8.0 Distribution & Smarter Regen
**Domain:** TypeScript CLI — GitHub Action distribution, init wizard upgrade, source→doc dependency graph, cost telemetry, config-driven model routing, eval harness
**Researched:** 2026-05-11
**Confidence:** HIGH (all four researchers cited official docs and direct codebase reads)

---

## Executive Summary

v8.0 adds two distribution capabilities and four smart-regen capabilities to an existing, well-architected TypeScript CLI. The existing codebase already provides most of the infrastructure needed: `better-sqlite3` is installed, `@clack/prompts` is installed, `zod@^4.3.6` is in use, the DAGOrchestrator exists, round-level cost tracking exists in `TokenUsageTracker`, and incremental regen via `--since <ref>` already works. The new milestone is a set of targeted extensions, not a rewrite or a new subsystem.

The recommended implementation strategy is additive: extend existing modules in-place (init wizard, config schema, cost tracker, generate pipeline) rather than building new parallel systems. The only genuinely new modules are `src/cache/dep-graph.ts`, `src/telemetry/telemetry-writer.ts`, `src/renderers/routing.ts`, and `src/eval/*`. The GitHub Action lives in a separate repository and calls the CLI as a subprocess, keeping the CLI transport-agnostic. Four features (dep-graph, telemetry, routing, eval) form a coherent dependency chain; the init wizard and the action are both fully independent and can be started in parallel.

The three highest risks for v8.0 are: (1) the GitHub Action triggering full LLM regeneration on `on: push` and causing surprise billing, (2) the source→doc dependency graph over-approximating dependencies so that every change triggers all 14 renderers and the surgical-regen feature provides zero benefit, and (3) the eval harness running silently in CI with no visible output, making the observability feature invisible to the team. All three risks have concrete, documented mitigations in the research.

---

## Key Findings

### Recommended Stack

No new production runtime dependencies are needed for dep-graph, cost telemetry, or model routing. All three use infrastructure already in the bundle: `Map<string, Set<string>>` for the graph, `better-sqlite3` for telemetry (see telemetry format decision below), and Zod for routing config. The only additions are `@clack/prompts@^1.3.0` (bump from `^1.0.1` to get `multiselect`, `autocompleteMultiselect`, and `path` prompt types) and two devDependencies for the eval harness: `vitest-evals@^0.8.0` (Sentry-maintained) and `autoevals@^0.0.132` (Braintrust-maintained). The GitHub Action is a composite action wrapping `npx handover-cli` — not a JavaScript action — which sidesteps the `@vercel/ncc` Node.js 24 compatibility gap and eliminates the need to commit a bundled `dist/` to the action repo.

**Core technologies (new or changed):**
- `@clack/prompts@^1.3.0` (bump): adds `multiselect`, `autocompleteMultiselect`, `path` prompts for wizard upgrade — no API breaks from `^1.0.1`
- Composite action (`runs.using: composite`): wraps `npx handover-cli`; avoids ncc/Node24 gap; no dist/ commit needed
- `peter-evans/create-pull-request@v8.1.1`: idempotent scheduled-refresh PR creation
- `peter-evans/find-comment@v4` + `peter-evans/create-or-update-comment@v5.0.0`: sticky PR comment upsert pattern
- Native `Map<string, Set<string>>` + JSON: dep-graph in-memory and persisted — 30 LoC, zero new deps
- `better-sqlite3@^12.6.2` (already installed): telemetry persistence in `.handover/telemetry.db`
- `vitest-evals@^0.8.0` + `autoevals@^0.0.132` (devDeps): LLM-as-judge eval harness running inside existing vitest infra
- `zod@^4.3.6` (already installed): schema extension for per-renderer routing config; use `.extend()` not `.merge()` (v4 deprecation)

### Expected Features

All six feature areas are P1 (v8.0 core) based on the user's explicit scope choices. Round-level dep-graph skipping, trend detection in telemetry, eval baseline comparison, model tier aliases, and the eval blocking gate are explicitly deferred to v8.x/v9.0.

**Must have (table stakes for v8.0):**
- GitHub Action: PR-preview mode (sticky comment, no commits to PR branch) + scheduled-refresh mode (idempotent PR via peter-evans)
- GitHub Action: `@v1` force-updated major-version tag, concurrency control, cost line in comment footer
- Init wizard: provider env-var detection, scope auto-detect (monorepo awareness), `.gitignore` patching, smart model defaults
- Source→renderer dep graph: persisted to `.handover/cache/dep-graph.json`, `--dry-run` shows what would regenerate, renderer-level skipping only (not round-level)
- Per-renderer cost telemetry: persisted to `.handover/telemetry.db` (SQLite), `handover cost` subcommand for last-N summary
- Per-renderer model routing: `renderers:` key in `.handover.yml`, global default + per-renderer override, resolver at round creation time
- Eval harness: golden set, rubric assertions, `handover eval` subcommand, observability mode (exits 0, posts to `$GITHUB_STEP_SUMMARY`)

**Defer to v8.x after validation:**
- Round-level skipping in dep graph (HIGH complexity; trigger: telemetry shows rounds dominate cost)
- Trend detection + budget regression alerts (trigger: 30+ run baseline accumulates)
- Eval baseline comparison (trigger: rubric stabilizes with <10% false positive rate)
- Eval promotion to blocking CI gate (trigger: 30-run baseline + human label validation)
- `pull_request_target` for fork PRs (trigger: community contributor requests)
- `vitest-evals` `describeEval()` CI integration (defer until scorer validated via CLI path)

**Defer to v9+:**
- `handover eval --seed` golden set auto-generation
- Cross-provider model routing (requires multi-provider auth per run)
- AST-level source→renderer dependency tracing (Bazel-style)

### Architecture Approach

All new code is additive to the existing pipeline. The render step in `src/cli/generate.ts` is the integration nexus: it gains two new callsites for the dep-graph (load before DAG, save after render) and one for telemetry (write after render step). Routing is wired into the `wrapWithCache` closure's model resolution, replacing the flat `config.model ?? preset.defaultModel` expression. Renderers remain pure functions — they do not call LLMs and therefore routing cannot and should not be applied at the renderer level. PR-comment logic lives entirely in the action repo's `github-client.ts`; the CLI gains no GitHub API dependency.

**New files and modified files:**
1. `src/cli/init-detectors.ts` (NEW) — `detectProvider()`, `detectScope()`, `patchGitignore()`
2. `src/cli/init.ts` (MODIFIED) — extend `runInit()` and `detectProject()`
3. `src/cache/dep-graph.ts` (NEW) — `SourceDocGraph` class: `build()`, `save()`, `load()`, `affectedDocs()`
4. `src/telemetry/telemetry-writer.ts` + `src/telemetry/types.ts` (NEW) — `TelemetryWriter` + `TelemetryRecord` Zod schema + SQLite writer
5. `src/renderers/routing.ts` (NEW) — `resolveRoundModel()`
6. `src/renderers/registry.ts` (MODIFIED) — add `modelHint: 'cheap' | 'standard' | 'synthesis'` to `DocumentSpec`
7. `src/config/schema.ts` (MODIFIED) — add `renderers.routing` key
8. `src/context/tracker.ts` (MODIFIED) — add `getRoundBreakdown()`
9. `src/cli/generate.ts` (MODIFIED) — dep-graph callsites, telemetry callsite, routing in `wrapWithCache`
10. `src/cli/eval.ts` (NEW) + `src/eval/*` (NEW) — eval runner, scorer, rubric, types
11. `src/cli/index.ts` (MODIFIED) — register `eval` subcommand
12. `handover/regenerate-docs` repo (NEW, separate) — composite action, `pr-preview.ts`, `scheduled-refresh.ts`, `github-client.ts`

### Critical Pitfalls (top five for v8.0)

The following five pitfalls would most damage v8.0 if ignored, ranked by damage potential:

1. **LLM cost explosion from `on: push` trigger** — Action example workflow must use `on: pull_request` or `on: schedule`, never bare `on: push`. Include a `paths:` filter. Log estimated cost at run start. Add a `dry-run` input. A team pushing 20 times/day hits ~$240/month with no warning.

2. **Dep-graph over-approximation defeats surgical regen** — If infrastructure files (logger, config loader, types) are included in graph source nodes, every file change triggers all 14 renderers. Track dependencies at the analyzer→renderer level, not raw source file level. Exclude infrastructure files explicitly. Add a test: single leaf-file change triggers fewer than 14 renderers.

3. **Eval harness is silent in observability mode** — "Non-blocking" must not mean "no output." Eval job must post a score table to `$GITHUB_STEP_SUMMARY` and as a sticky PR comment (with delta from baseline). Use `::notice::` for improvements, `::warning::` for regressions. Without visibility, the feature provides zero value.

4. **Cache key missing renderer-level model override** — `RoundCache.computeHash()` includes `model` but uses the global config model. With per-renderer routing, two renderers using different models for the same round would incorrectly share cached results. Extend `computeHash` to accept an optional `rendererModel` parameter; ship with a `CACHE_VERSION` bump.

5. **PR comment spam — new comment on every push** — Use the `<!-- handover-docs-preview -->` HTML sentinel + `peter-evans/find-comment` + `peter-evans/create-or-update-comment` to upsert the comment. Cap comment body at 65,000 characters (GitHub hard limit is 65,536). No sticky comment = unreadable PR threads after 10 pushes.

---

## Conflicts Resolved

### Conflict 1: Dependency Graph Implementation Strategy

**Position: `src/cache/dep-graph.ts` is a new, focused module that orchestrates existing DOCUMENT_REGISTRY infrastructure.**

The FEATURES researcher correctly identified that `DOCUMENT_REGISTRY.requiredRounds[]`, `computeRequiredRounds()`, and `resolveSelectedDocs()` cover ~90% of the needed logic. The STACK researcher correctly noted that the in-memory representation is a trivial `Map<string, Set<string>>` needing ~30 LoC. The ARCHITECTURE researcher correctly identified the new module location and the `SourceDocGraph` class. These are complementary layers, not contradictions:

- The in-memory data structure is `Map<sourcePath, Set<rendererName>>` (Stack)
- The graph is built by reading `DocumentSpec.requiredRounds` from DOCUMENT_REGISTRY and correlating with changed source paths from `git-fingerprint.ts` (Features — existing infra reused)
- The new module `src/cache/dep-graph.ts` contains the `SourceDocGraph` class with `build()`, `save()`, `load()`, `affectedDocs()` (Architecture — new module, but thin)
- The persisted artifact is `.handover/cache/dep-graph.json` with a `graphVersion` field (belongs in the existing cache directory, not the root `.handover/`)

The `SourceDocGraph.build()` method reads from `DOCUMENT_REGISTRY` (existing) and the static analysis file tree (existing), producing the `Map` which is immediately serialized. The class is a namespace for the operations, not a stateful object. Approximately 60–80 LoC total.

### Conflict 2: Cost Telemetry Persistence Format

**Position: SQLite via `better-sqlite3` in a separate `.handover/telemetry.db` file.**

The FEATURES researcher argued for JSONL. The ARCHITECTURE researcher specified NDJSON at `.handover/telemetry/runs.ndjson`. The STACK researcher argued for SQLite. SQLite wins on the actual query pattern: the `handover cost` subcommand needs "last N runs per renderer" and "cost trend over time" — range scans that require filtering records. JSONL requires loading the entire file into memory. With SQLite's `idx_renderer_runs_renderer ON renderer_runs(renderer, ran_at)` index, these queries execute in microseconds regardless of file size. JSONL's only advantage is external tooling compatibility, which is explicitly out of scope.

Use a separate `.handover/telemetry.db` (not co-located in `search.db`) to allow independent deletion and schema evolution. The `renderer_runs` schema from STACK.md is adopted verbatim. Rotation is via `DELETE FROM renderer_runs WHERE ran_at < ?` keeping last 90 days or 100 runs — cleaner than JSONL ring-buffer logic. The `src/telemetry/types.ts` module still defines `TelemetryRecord` as a Zod schema for validation on write; the writer uses `better-sqlite3` INSERT rather than `appendFile`.

### Conflict 3: Eval Harness Shape

**Position: BOTH — a `handover eval` CLI subcommand that wraps the same scorer invoked by `vitest-evals` in CI. The minimum coherent v8.0 ship is the CLI subcommand only; vitest-evals CI integration is a v8.1 addition.**

The `scorer.ts` module contains the LLM-as-judge logic (using `autoevals` scorers). `vitest-evals`'s `describeEval()` calls `scorer.ts` in CI. The `handover eval` subcommand calls the same `scorer.ts` directly. The scorer is the shared unit; the two runners are thin wrappers around it. For v8.0: implement `src/eval/scorer.ts`, `src/eval/runner.ts`, `src/cli/eval.ts`, and the golden YAML cases. The `vitest.config.eval.ts` and `describeEval()` integration lands as v8.1 once the scorer is validated.

Golden cases live in `.handover/evals/golden/` as committed YAML (Architecture), not in `src/eval/golden/` as JSON (Stack). YAML is more human-readable in PR diffs, which matters for rubric review.

---

## Other Open Questions Resolved

### Per-Renderer Cost Attribution (TokenUsageTracker is per-round, not per-renderer)

`TokenUsageTracker` currently tracks at the round level. The attribution strategy: apportion round costs to renderers by `DocumentSpec.requiredRounds`. If renderer A requires rounds [1,2,3] and renderer B requires rounds [1,2], round 3 cost ($0.10) is attributed to renderer A only. Rounds shared by multiple renderers are attributed to all of them (no proration — the cost was incurred regardless). Add `getRoundBreakdown(): Map<number, { inputTokens, outputTokens, estimatedCostUsd }>` to `TokenUsageTracker`. The telemetry writer assembles per-renderer records by joining `DocumentSpec.requiredRounds` against this breakdown.

### GitHub Action Repository Location

**Position: Separate repository `handover/regenerate-docs`.**

Required for GitHub Marketplace listing (one action per repo for top-level listing). Placing it in `.github/actions/` inside this repo would prevent marketplace listing and conflate CLI codebase concerns with action-specific dependencies. The composite action calls `npx handover-cli@<version>` — the action repo has no Node.js build step.

### Per-Renderer Routing: Round Level vs Renderer Level

**Position: Routing applies at the round level, not the renderer level.**

Renderers are pure functions `(ctx: RenderContext) => string` that transform already-computed round outputs. They do not call LLMs. The user-facing config (`renderers: { "03-architecture": { model: "claude-opus-4-6" } }`) is renderer-keyed for UX clarity. The implementation resolves this to a round-level model decision: given a round number, look up all renderers that require this round, find the most expensive model hint among them (safe over-provision), and use that model for the round. `resolveRoundModel()` in `src/renderers/routing.ts` encapsulates this translation.

---

## Implications for Roadmap

Phase numbering continues from v7.0's Phase 30. The next phase is Phase 31.

### Phase 31: Init Wizard Upgrade + Action Scaffolding

**Rationale:** The init wizard is fully independent and LOW complexity — fastest win and unblocks onboarding for action users. The action repo scaffold can be started in parallel since it does not depend on any other v8.0 CLI feature.

**Delivers:** Upgraded `handover init` with provider detection, scope auto-detect, `.gitignore` patching; `handover/regenerate-docs` repo with `action.yml`, composite action structure, placeholder mode implementations.

**Features addressed:** Feature 2 (init wizard upgrade), Feature 1 scaffolding.

**Pitfalls to avoid:** Init re-run clobbering scope config (define `--upgrade` contract first); `.gitignore` patch conflicts (idempotent append, negation rule detection); provider detection picks expensive model with multiple keys (cheapest-detected policy in `--yes` mode).

**Research flag:** Standard patterns — skip phase research.

---

### Phase 32: Source→Doc Dependency Graph (REGEN-03)

**Rationale:** Must be stable before action PR-preview integrates `--since` + graph for minimal re-render scope. No other v8.0 CLI feature depends on it, so no blocking.

**Delivers:** `src/cache/dep-graph.ts` with `SourceDocGraph` class; `.handover/cache/dep-graph.json` persisted artifact (with `graphVersion` field); `generate --dry-run`; `generate --since` consulting graph for renderer-level skipping.

**Features addressed:** Feature 3 (renderer-level dep graph).

**Pitfalls to avoid:** Graph not versioned (include `graphVersion` field on day one); over-approximation defeats surgical regen (track at analyzer→renderer level, exclude infrastructure files, add test asserting <14 renderers triggered on single leaf-file change).

**Research flag:** Standard patterns — skip phase research.

---

### Phase 33: Cost Telemetry

**Rationale:** Must be built before model routing because routing decisions must record which model was actually used per renderer in the telemetry record.

**Delivers:** `src/telemetry/telemetry-writer.ts` + `src/telemetry/types.ts`; `.handover/telemetry.db` (SQLite, `renderer_runs` table with `idx_renderer_runs_renderer` index); `handover cost` subcommand; `TokenUsageTracker.getRoundBreakdown()` accessor; per-renderer cost line in generate output; `costWarningThreshold` wired to actual persisted data.

**Features addressed:** Feature 4 (cost telemetry persistence and `handover cost` subcommand).

**Pitfalls to avoid:** Prompt content leaks into telemetry records (Zod schema enforces metadata-only fields); telemetry file grows without bound (SQLite rotation keeping last 90 days or 100 runs).

**Research flag:** Standard patterns — skip phase research.

---

### Phase 34: Config-Driven Model Routing

**Rationale:** Depends on telemetry being in place so routing decisions are recorded. The cache key extension must land in this phase alongside routing logic — shipping routing without the cache key fix silently serves stale results.

**Delivers:** `src/renderers/routing.ts` with `resolveRoundModel()`; `modelHint` field on `DocumentSpec` (classified for all 14 renderers); `renderers:` key in `HandoverConfigSchema`; `CACHE_VERSION` bump; per-renderer model shown in generate output.

**Features addressed:** Feature 5 (per-renderer model routing).

**Pitfalls to avoid:** Cache key missing renderer model override (extend `computeHash` with optional `rendererModel`; add test: same fingerprint + different models = different cache keys); cheap model fallback to global expensive model (per-renderer fallback field; retry uses same cheap model, not global provider).

**Research flag:** Standard patterns — skip phase research.

---

### Phase 35: Eval Harness

**Rationale:** Eval depends on telemetry (cost of eval runs tracked) and benefits from routing (eval can test routing configs in fixtures). Most design-heavy new module; building it last lets the team use telemetry + routing data to inform which renderers to prioritize for golden cases.

**Delivers:** `src/eval/scorer.ts`, `src/eval/runner.ts`, `src/eval/rubric-v1.md` (versioned rubric file), `src/eval/types.ts`; `src/cli/eval.ts`; `.handover/evals/golden/` with 5–10 initial YAML cases (not all 14 renderers); `handover eval` subcommand (exits 0 always); eval scores posted to `$GITHUB_STEP_SUMMARY` and sticky PR comment.

For v8.0: CLI subcommand only. `vitest.config.eval.ts` + `describeEval()` CI integration deferred to v8.1.

**Features addressed:** Feature 6 (eval harness, observability mode).

**Pitfalls to avoid:** Eval judge same model family as generator (add `eval.judge.provider` config defaulting to different provider family); rubric not versioned (store as `src/eval/rubric-v1.md`, include `rubricVersion` in eval records); golden set rot (fixtures include input source hash and expiry date; keep to 5–10 cases); eval adds minutes to CI (separate async job, `continue-on-error: true`, schedule-gated full run); eval silent in observability mode (score table + delta to `$GITHUB_STEP_SUMMARY` and sticky PR comment).

**Research flag:** Needs phase research for rubric design — scoring criteria for completeness, navigability, and code-accuracy dimensions need explicit specification before writing `rubric-v1.md`. Judge model selection also needs a brief research task to confirm cross-family options.

---

### Phase 36: GitHub Action — PR-Preview + Scheduled-Refresh

**Rationale:** Lives in a separate repo and wraps the fully instrumented CLI. Core invocation works from Phase 31 scaffolding. Building last lets the team include telemetry output (cost line) in the PR comment.

**Delivers:** Complete composite `action.yml`; `pr-preview.ts` (sticky comment, cost line, truncated diff, 65K char cap); `scheduled-refresh.ts` (idempotent PR via peter-evans); `@v1` major-version tag + release workflow automation; action README with cost warning section, `permissions:` block, concurrency block, and example workflows.

**Features addressed:** Feature 1 (GitHub Action, both modes).

**Pitfalls to avoid:** LLM cost explosion (example workflow uses `on: pull_request` + `on: schedule` only with `paths:` filter); GITHUB_TOKEN scope mistakes (README copy-paste `permissions:` block; PAT `token` input for protected branches; preflight scope check); concurrency footgun (`concurrency:` block differentiated by mode); PR comment spam (HTML sentinel + peter-evans find-and-update; 65,000 char cap); `@v1` tag drift (input renames = v2, not minor bump; release workflow automation); Marketplace listing rejection (Feather `refresh-cw` icon, `blue` color, branding block from day one).

**Research flag:** Standard patterns (composite action, peter-evans actions are well-documented) — skip phase research.

---

### Phase Ordering Rationale

- Init wizard (31) first: independent, fast, confidence-builder before heavier pipeline changes.
- Dep-graph (32) second: independent of telemetry/routing, enables action's incremental mode, can run in parallel with Phase 31.
- Telemetry (33) before routing (34): routing records must flow into telemetry; telemetry provides the stable write target.
- Eval (35) last among CLI features: benefits from both telemetry and routing being stable; most design-heavy scope.
- Action (36) last: wraps fully instrumented CLI; action repo scaffolding started in Phase 31 means action development is not fully blocked on Phases 32–35.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified against npm registry on 2026-05-11; composite action pattern confirmed from official docs; `@clack/prompts@1.3.0` API confirmed via Context7; `better-sqlite3` API confirmed via Context7 |
| Features | HIGH | Feature scope confirmed from PROJECT.md; user decisions documented (Action + wizard + all four smart-regen pieces; no VS Code extension, no auth); table-stakes features cross-checked against comparable tools (Nx, LiteLLM, Atlantis) |
| Architecture | HIGH | All integration points confirmed via direct source reads of `generate.ts`, `round-cache.ts`, `tracker.ts`, `registry.ts`, `schema.ts`, `factory.ts` |
| Pitfalls | HIGH | GitHub Actions pitfalls from official docs + toolkit action-versioning.md; LLM-as-judge pitfalls from EvidentlyAI + Cameron Wolfe; codebase inspection confirmed specific risk points (round-cache hash includes model; init.ts guard exists; tracker.ts has no per-renderer telemetry yet) |

**Overall confidence:** HIGH

### Gaps to Address

- **Rubric scoring criteria:** The three eval dimensions (completeness, navigability, code-accuracy) are named but not yet specified as explicit scoring criteria. Phase 35 should begin with a rubric design research task before writing `src/eval/rubric-v1.md`.
- **`modelHint` classification per renderer:** `DocumentSpec` needs `modelHint: 'cheap' | 'standard' | 'synthesis'` for all 14 renderers. This classification is not yet done; should be a first task in Phase 34 (review each renderer's `requiredRounds[]` and assign hint accordingly).
- **Action Marketplace name collision check:** `handover/regenerate-docs` as the action name has not been verified against existing Marketplace listings. Run `gh api /marketplace/actions` before publishing.
- **`.gitignore` patch entries for SQLite telemetry:** The init wizard's `patchGitignore()` should add `.handover/telemetry.db` (the SQLite file), not `.handover/telemetry.jsonl` or `.handover/telemetry/` (the superseded NDJSON paths from ARCHITECTURE.md). Clarify this in Phase 31 implementation.

---

## Sources

### Primary (HIGH confidence)
- `src/cli/generate.ts` — pipeline integration nexus, render step structure, `wrapWithCache` closure
- `src/cache/round-cache.ts` — `computeHash()` signature, `CACHE_VERSION` pattern, `ensureGitignored()` reference pattern
- `src/context/tracker.ts` — `TokenUsageTracker` API surface, `estimateCost()`, `getRoundUsage()`
- `src/renderers/registry.ts` — `DocumentSpec` interface, `DOCUMENT_REGISTRY`, `requiredRounds`, `computeRequiredRounds()`
- `src/config/schema.ts` — `HandoverConfigSchema` current Zod definition
- `src/providers/factory.ts` — `createProvider()` signature, model resolution
- `.planning/PROJECT.md` — milestone scope, explicit non-goals, confirmed user decisions
- GitHub Actions metadata syntax (official docs): `runs.using` composite, permissions model
- GitHub Actions Toolkit action-versioning.md: `@v1` force-update pattern, breaking change contract
- `peter-evans/create-pull-request@v8.1.1`, `peter-evans/find-comment@v4`, `peter-evans/create-or-update-comment@v5.0.0`: verified 2026-05-11
- `@clack/prompts@1.3.0`: `multiselect`, `autocompleteMultiselect`, `path` confirmed via Context7
- `vitest-evals@0.8.0`: getsentry/vitest-evals GitHub, Apache-2.0, Sentry-maintained
- `autoevals@0.0.132`: npm registry, Braintrust-maintained, `Factuality` + `ClosedQA` scorers confirmed
- `better-sqlite3@12.9.0`: synchronous INSERT/SELECT API confirmed via Context7
- Zod v4 `.extend()` vs deprecated `.merge()`: zod.dev/v4 release notes

### Secondary (MEDIUM confidence)
- GitHub Actions node24 deprecation: GitHub Changelog Sep 2025 — confirms composite action is the right path
- `@vercel/ncc` Node24 issue #1297: closed "not planned" — confirms JS action path is risky
- EvidentlyAI + Cameron Wolfe: LLM-as-judge narcissistic bias (5–25% self-enhancement) — informs judge/generator separation requirement
- Statsig golden dataset guide: fixture expiry and quarterly refresh cadence
- Nx `affected` docs: mental model for dep-graph dry-run UX
- LogRocket + AWS LLM routing guides: config-driven static routing patterns
- Anthropic platform docs — define success criteria and build evaluations: code-based grading hierarchy, LLM-as-judge patterns

---

*Research completed: 2026-05-11*
*Ready for roadmap: yes*
