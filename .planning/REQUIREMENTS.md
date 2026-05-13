# Requirements: Handover v8.0 Distribution & Smarter Regen

**Defined:** 2026-05-11
**Core Value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

## v8.0 Requirements

Requirements for the v8.0 milestone. Each maps to a roadmap phase (31–36).

### Init Wizard Upgrade (INIT)

- [ ] **INIT-01**: User running `handover init` gets auto-detection of provider from environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, Codex tokens); detected provider is pre-selected
- [ ] **INIT-02**: User running `handover init` in a monorepo gets auto-detection of scope from `pnpm-workspace.yaml`, `nx.json`, `turbo.json`, or `package.json` `workspaces` field
- [ ] **INIT-03**: User's `.gitignore` is idempotently patched with `.handover/` entries — no duplicate appends, respects existing negation rules
- [ ] **INIT-04**: User can re-run `handover init --upgrade` to refresh detection and add new defaults without clobbering customized fields in existing `.handover/config.json`
- [ ] **INIT-05**: User can run `handover init --yes` in non-TTY / CI environments and get sensible defaults (cheapest detected provider, no interactive prompts, deterministic exit)

### GitHub Action `handover/regenerate-docs` (ACTN)

- [ ] **ACTN-01**: User adding the action to a PR workflow gets a sticky comment posted/updated on each PR run, showing which docs would change (no commits to the PR branch)
- [ ] **ACTN-02**: User adding the action to a scheduled workflow gets an idempotent doc-refresh PR opened or updated via `peter-evans/create-pull-request` (PR auto-closes if diff disappears)
- [ ] **ACTN-03**: Action comment is upserted using HTML sentinel (`<!-- handover-docs-preview -->`) + `peter-evans/find-comment` + `peter-evans/create-or-update-comment` — never spammed, capped at 65,000 chars with truncation indicator
- [ ] **ACTN-04**: Action PR comment includes a cost footer line (`tokens used`, `est. cost USD`, `models used`) sourced from telemetry output of the underlying `handover generate` run
- [ ] **ACTN-05**: Action is published to GitHub Marketplace under `handover/regenerate-docs` with `@v1` force-updated major-version tag, branding block (Feather `refresh-cw` icon, `blue` color), composite action structure (`runs.using: composite`), and verified name-collision-free
- [ ] **ACTN-06**: Action ships two example workflow templates (`pr-preview.yml`, `scheduled-refresh.yml`) using `on: pull_request` and `on: schedule` only (never bare `on: push`), with `paths:` filters, `concurrency:` blocks per mode, and an explicit `permissions:` block in README
- [ ] **ACTN-07**: Action accepts an optional `token` input (PAT) for scheduled-refresh runs targeting protected branches (since `GITHUB_TOKEN` cannot push to protected branches); README documents when this is required

### Source→Doc Dependency Graph (REGEN)

- [x] **REGEN-03**: User running `handover generate --since <ref>` consults the persisted source→renderer dependency graph and re-runs only renderers whose source dependencies changed (replaces today's "regenerate all renderers" behavior on `--since`)
- [x] **REGEN-04**: User can run `handover generate --dry-run` to preview which renderers would execute without making any LLM calls
- [x] **REGEN-05**: Dependency graph is persisted to `.handover/cache/dep-graph.json` with a `graphVersion` field; stale-version graphs are discarded and rebuilt safely (no-graph degrades to full regen)
- [x] **REGEN-06**: Dependency graph excludes infrastructure files (logger, config loader, shared types) from source nodes to prevent over-approximation that would defeat surgical regen
- [x] **REGEN-07**: A single leaf-file change (one non-infrastructure source file) triggers fewer than 14 renderers — verifiable via test fixture

### Cost Telemetry (TELEM)

- [ ] **TELEM-01**: User's per-renderer cost / token / time data is persisted to `.handover/telemetry.db` (SQLite via existing `better-sqlite3`) in a `renderer_runs` table with `idx_renderer_runs_renderer` index
- [ ] **TELEM-02**: User can run `handover cost` to see last-N per-renderer summary (cost USD, input/output tokens, wall time, run timestamp)
- [ ] **TELEM-03**: Telemetry records contain only metadata (model id, renderer id, tokens, cost, timestamp, cache hit flag) — never prompt content or credentials — enforced by Zod schema on write
- [ ] **TELEM-04**: Telemetry rotates automatically to bound file size — retains last 90 days OR last 100 runs per renderer (whichever yields more)
- [ ] **TELEM-05**: User's existing `costWarningThreshold` config key is wired to persisted telemetry and emits a warning when a run exceeds the threshold

### Config-Driven Model Routing (ROUTE)

- [ ] **ROUTE-01**: User can specify per-renderer model in config under a `renderers:` key (e.g. `renderers: { "03-architecture": { model: "claude-opus-4-6" } }`); schema validated via Zod `.extend()`
- [ ] **ROUTE-02**: Routing precedence is: per-renderer override → global config model → provider default; resolved at round creation time via `resolveRoundModel()`
- [ ] **ROUTE-03**: Round cache key includes the resolved renderer model — two renderers needing the same round but using different models produce different cache entries (verifiable by test asserting same fingerprint + different models = different cache keys)
- [ ] **ROUTE-04**: `CACHE_VERSION` bumps in this phase to invalidate stale entries built before per-renderer routing landed
- [ ] **ROUTE-05**: User can declare a per-renderer `fallback` model in routing config so cheap-model failures retry on a sibling cheap model rather than silently promoting to the global expensive default
- [ ] **ROUTE-06**: Per-renderer resolved model is shown in `handover generate` output (one line per renderer, plus aggregate cost line) for routing transparency
- [ ] **ROUTE-07**: `modelHint: 'cheap' | 'standard' | 'synthesis'` field is added to `DocumentSpec` and explicitly classified for all 14 existing renderers (smart defaults if user does not configure routing)

### Eval Harness (EVAL)

- [ ] **EVAL-01**: User can run `handover eval` CLI subcommand to score the latest generated docs against the golden set using LLM-as-judge
- [ ] **EVAL-02**: Eval harness ships with 5–10 initial golden YAML cases under `.handover/evals/golden/` (committed; covers a curated subset of renderers — not all 14 — to bound maintenance)
- [ ] **EVAL-03**: Eval scorer (`src/eval/scorer.ts`) uses `autoevals` scorers (`Factuality`, `ClosedQA`) combined with a versioned rubric (`src/eval/rubric-v1.md`) covering completeness, navigability, and code-accuracy dimensions
- [ ] **EVAL-04**: Eval judge model defaults to a different provider family than the generator (e.g. Anthropic generator → OpenAI judge); configurable via `eval.judge.provider` and `eval.judge.model` config keys
- [ ] **EVAL-05**: Eval records include `rubricVersion` and source fingerprint so score drift is attributable to either a rubric change, a generator change, or a source change
- [ ] **EVAL-06**: `handover eval` always exits 0 in v8.0 (observability mode — never blocks CI); promotion to a blocking gate is reserved for a future milestone after rubric stabilizes
- [ ] **EVAL-07**: Eval scores are posted to `$GITHUB_STEP_SUMMARY` AND a sticky PR comment (with delta from baseline when available, `::notice::` for improvements, `::warning::` for regressions) — observability mode must be VISIBLE, not silent
- [ ] **EVAL-08**: Golden case YAML files include an `expiry` field; expired cases produce a warning during `handover eval` runs so golden rot is surfaced before scores become meaningless

## Deferred to v8.x

Acknowledged but explicitly deferred. Each carries a "trigger" — what would have to be true to move it into v8.x scope.

### Cost Telemetry / Routing follow-ups

- **TELEM-06**: Trend detection + budget regression alerts (trigger: 30+ run baseline accumulates per renderer)
- **ROUTE-08**: Cross-provider model routing in a single run (trigger: multi-provider auth per run is in scope)

### Dep Graph follow-ups

- **REGEN-09**: Round-level skipping in dep graph (trigger: telemetry shows rounds, not renderers, dominate cost)
- **REGEN-10**: AST-level source→renderer dependency tracing, Bazel-style (trigger: file-level over-approximation proves untenable)

### Eval Harness follow-ups

- **EVAL-09**: `vitest-evals` `describeEval()` CI integration alongside the CLI subcommand (trigger: scorer validated via CLI for one full release cycle)
- **EVAL-10**: Eval baseline comparison and score-trend dashboards (trigger: rubric stabilizes with < 10% false-positive rate)
- **EVAL-11**: Promote `handover eval` to blocking CI gate (trigger: 30-run baseline + human label validation)
- **EVAL-12**: `handover eval --seed` golden set auto-generation from current docs (trigger: rubric is locked v1)

### GitHub Action follow-ups

- **ACTN-08**: `pull_request_target` support for fork PR previews (trigger: external contributor requests; requires security review)

## Out of Scope (v8.0)

Explicitly excluded from v8.0. Documented to prevent scope creep mid-milestone.

| Feature | Reason |
|---------|--------|
| VS Code extension wrapping `handover serve` | Distribution surface deferred — focus v8.0 on GitHub Action + init wizard only |
| Cursor / Claude Code / Zed rules pack | Distribution surface deferred — separate milestone candidate |
| OS keychain credential storage (AUTH-05) | Auth track on hold for v8.0; reconsider in a future auth-focused milestone |
| Headless device-code auth flow (AUTH-06) | Auth track on hold for v8.0 |
| `handover auth token` for CI/CD injection (AUTH-07) | Auth track on hold for v8.0 |
| `handover auth logout` command (AUTH-08) | Auth track on hold for v8.0 |
| Integration test suite requiring real API keys (TEST-04) | Coverage already strong at 96%+; defer integration suite to a quality-focused milestone |
| `--format json` for search output (SRCH-07) | Not in v8.0 distribution theme; defer |
| Eval harness as blocking CI gate | Explicit v8.0 decision — ship observability only; promotion is a future milestone |
| Auto-heuristic model routing (router LLM, complexity-detector) | Explicit v8.0 decision — config-driven routing only |
| `on: push` action example workflow | Pitfall avoidance — cost explosion risk; templates use `pull_request` + `schedule` only |
| Dedicated docs site (Docusaurus) — Discord — showcase | Carried forward from earlier milestones |
| Multi-threaded analyzer execution / persistent daemon | Carried forward from earlier milestones |
| Streaming output to markdown files | Carried forward from earlier milestones |
| Provider-level request batching | Carried forward from earlier milestones |
| `vitest thresholds.autoUpdate` | Blocked by upstream vitest#9227 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INIT-01 | Phase 31 | Pending |
| INIT-02 | Phase 31 | Pending |
| INIT-03 | Phase 31 | Pending |
| INIT-04 | Phase 31 | Pending |
| INIT-05 | Phase 31 | Pending |
| ACTN-07 | Phase 31 | Pending |
| REGEN-03 | Phase 32 | Complete |
| REGEN-04 | Phase 32 | Complete |
| REGEN-05 | Phase 32 | Complete |
| REGEN-06 | Phase 32 | Complete |
| REGEN-07 | Phase 32 | Complete |
| TELEM-01 | Phase 33 | Pending |
| TELEM-02 | Phase 33 | Pending |
| TELEM-03 | Phase 33 | Pending |
| TELEM-04 | Phase 33 | Pending |
| TELEM-05 | Phase 33 | Pending |
| ROUTE-01 | Phase 34 | Pending |
| ROUTE-02 | Phase 34 | Pending |
| ROUTE-03 | Phase 34 | Pending |
| ROUTE-04 | Phase 34 | Pending |
| ROUTE-05 | Phase 34 | Pending |
| ROUTE-06 | Phase 34 | Pending |
| ROUTE-07 | Phase 34 | Pending |
| EVAL-01 | Phase 35 | Pending |
| EVAL-02 | Phase 35 | Pending |
| EVAL-03 | Phase 35 | Pending |
| EVAL-04 | Phase 35 | Pending |
| EVAL-05 | Phase 35 | Pending |
| EVAL-06 | Phase 35 | Pending |
| EVAL-07 | Phase 35 | Pending |
| EVAL-08 | Phase 35 | Pending |
| ACTN-01 | Phase 36 | Pending |
| ACTN-02 | Phase 36 | Pending |
| ACTN-03 | Phase 36 | Pending |
| ACTN-04 | Phase 36 | Pending |
| ACTN-05 | Phase 36 | Pending |
| ACTN-06 | Phase 36 | Pending |

**Coverage:**
- v8.0 requirements: 37 total (5 INIT + 7 ACTN + 5 REGEN + 5 TELEM + 7 ROUTE + 8 EVAL)
- Mapped to phases: 37 / unmapped: 0 ✓
- Phase 31: INIT-01..05, ACTN-07 (6 requirements)
- Phase 32: REGEN-03..07 (5 requirements)
- Phase 33: TELEM-01..05 (5 requirements)
- Phase 34: ROUTE-01..07 (7 requirements)
- Phase 35: EVAL-01..08 (8 requirements)
- Phase 36: ACTN-01..06 (6 requirements)

---

*Requirements defined: 2026-05-11*
*Last updated: 2026-05-11 — traceability populated by roadmapper (v8.0 roadmap creation)*
