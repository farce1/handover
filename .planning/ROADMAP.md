# Roadmap: Handover

## Milestones

- ✅ **v1.0 OSS Excellence** — Phases 1-3 (shipped 2026-02-18) — `.planning/milestones/v1.0-ROADMAP.md`
- ✅ **v2.0 Performance** — Phases 4-7 (shipped 2026-02-19) — `.planning/milestones/v2.0-ROADMAP.md`
- ✅ **v3.0 Robustness** — Phases 8-11 (shipped 2026-02-20) — `.planning/milestones/v3.0-ROADMAP.md`
- ✅ **v4.0 MCP Server & Semantic Search** — Phases 12-15 (shipped 2026-02-22) — `.planning/milestones/v4.0-ROADMAP.md`
- ✅ **v5.0 Remote & Advanced MCP** — Phases 16-20 (shipped 2026-02-26) — `.planning/milestones/v5.0-ROADMAP.md`
- ✅ **v6.0 Codex Auth & Validation** — Phases 21-26 (shipped 2026-02-28) — `.planning/milestones/v6.0-ROADMAP.md`
- ✅ **v7.0 Quality, Performance & Polish** — Phases 27-30 (shipped 2026-03-02) — `.planning/milestones/v7.0-ROADMAP.md`
- 🚧 **v8.0 Distribution & Smarter Regen** — Phases 31-36 (in progress)

## Phases

<details>
<summary>✅ v1.0 through v7.0 (Phases 1-30) — SHIPPED</summary>

See milestone archives in `.planning/milestones/`.

</details>

### 🚧 v8.0 Distribution & Smarter Regen (In Progress)

**Milestone Goal:** Put `handover` where developers already work (GitHub CI + a real init wizard) and make regeneration surgical, cost-aware, and quality-tracked.

- [ ] **Phase 31: Init Wizard Upgrade + Action Scaffolding** — Provider detection, scope auto-detect, `.gitignore` patching, `--upgrade` / `--yes` modes; `handover/regenerate-docs` repo created as a composite action with `token` input defined
- [ ] **Phase 32: Source→Doc Dependency Graph** — `SourceDocGraph` class, persisted `dep-graph.json`, `--dry-run` mode, renderer-level surgical skipping for `--since` runs
- [ ] **Phase 33: Cost Telemetry** — Per-renderer cost/token/time persisted to `.handover/telemetry.db`, `handover cost` subcommand, rotation, and `costWarningThreshold` wiring
- [ ] **Phase 34: Config-Driven Model Routing** — `renderers:` config key, `resolveRoundModel()`, `modelHint` classification for all 14 renderers, `CACHE_VERSION` bump, per-renderer fallback
- [ ] **Phase 35: Eval Harness** — `handover eval` subcommand, LLM-as-judge scorer, versioned rubric, 5-10 golden YAML cases, observability mode posting to `$GITHUB_STEP_SUMMARY` and sticky PR comment
- [ ] **Phase 36: GitHub Action — PR-Preview + Scheduled-Refresh** — Complete `handover/regenerate-docs` composite action, both operational modes, cost footer, example workflows, Marketplace publish

## Phase Details

### Phase 31: Init Wizard Upgrade + Action Scaffolding
**Goal**: Users can onboard faster with a smarter `handover init` that detects their environment, and the `handover/regenerate-docs` action repo exists with its structure and input schema defined
**Depends on**: Nothing (independent; Phase 32 may proceed in parallel)
**Requirements**: INIT-01, INIT-02, INIT-03, INIT-04, INIT-05, ACTN-07
**Success Criteria** (what must be TRUE):
  1. User running `handover init` in a project with `ANTHROPIC_API_KEY` set sees Anthropic pre-selected without manually choosing a provider
  2. User running `handover init` in a monorepo (with `pnpm-workspace.yaml`, `nx.json`, `turbo.json`, or `package.json workspaces`) sees the detected scope rather than being prompted for it
  3. User who re-runs `handover init --upgrade` retains their customized `.handover/config.json` fields; only missing or stale defaults are refreshed
  4. User running `handover init --yes` in a CI environment (no TTY) receives a deterministic, prompt-free configuration using the cheapest detected provider and exits 0
  5. `.gitignore` is patched with `.handover/` entries exactly once — re-running init does not create duplicate entries and does not clobber existing negation rules
  6. The `handover/regenerate-docs` action repo scaffold exists with `action.yml` composite structure and the `token` input parameter documented, so action development can proceed independently in Phase 36
**Plans**: 5 plans
Plans:
- [ ] 31-01-PLAN.md — Wave 0: Scaffold `src/cli/init-detectors.test.ts` with 12 failing tests (RED targets for Plan 02)
- [ ] 31-02-PLAN.md — Wave 1: Implement `src/cli/init-detectors.ts` (detectProviders + patchGitignore + computeUpgradeDiff) — turns Plan 01's 11 unit tests GREEN
- [ ] 31-03-PLAN.md — Wave 1 (parallel): Add nx.json + turbo.json detection to `src/cli/monorepo.ts` + colocated `monorepo.test.ts` (8 tests)
- [ ] 31-04-PLAN.md — Wave 1 (parallel): Create external `handover/regenerate-docs` action repo with full composite `action.yml`, README, MIT LICENSE, CI workflow, and stubbed example workflows; tags v0.1.0 + floating v0
- [ ] 31-05-PLAN.md — Wave 2: Wire detectors into `runInit` (`src/cli/init.ts`), register `--upgrade` flag in `src/cli/index.ts`, bump `@clack/prompts` to ^1.3.0, activate the runInit integration test
**UI hint**: no

### Phase 32: Source→Doc Dependency Graph
**Goal**: Users running `handover generate --since <ref>` re-run only the renderers whose source dependencies changed, not all 14 renderers, and can preview the impact without spending LLM budget
**Depends on**: Nothing (parallel-eligible with Phases 31 and 33; no hard code dependency on init wizard or telemetry)
**Requirements**: REGEN-03, REGEN-04, REGEN-05, REGEN-06, REGEN-07
**Success Criteria** (what must be TRUE):
  1. User changing a single non-infrastructure source file and running `handover generate --since HEAD~1` sees fewer than 14 renderers execute — only those whose documented dependency graph traces back to the changed file
  2. User running `handover generate --dry-run` sees a list of which renderers would execute and why, with zero LLM calls made
  3. The dependency graph is persisted to `.handover/cache/dep-graph.json` with a `graphVersion` field; deleting the file or bumping `graphVersion` causes a full rebuild rather than a corrupt state
  4. Infrastructure files (logger, config loader, shared types) do not appear as source nodes in the graph — a change to `logger.ts` alone does not trigger any renderer
  5. A user with no existing dep-graph file (first run or manually deleted) gets a complete full regeneration as a safe degradation, with no error
**Plans**: TBD

### Phase 33: Cost Telemetry
**Goal**: Users can see exactly what each renderer costs per run and be alerted when a run exceeds their configured threshold, with data persisted for trend analysis
**Depends on**: Nothing (parallel-eligible with Phases 31 and 32; must PRECEDE Phase 34, which writes routing decisions to telemetry)
**Requirements**: TELEM-01, TELEM-02, TELEM-03, TELEM-04, TELEM-05
**Success Criteria** (what must be TRUE):
  1. After running `handover generate`, a user can run `handover cost` and see a per-renderer table of cost (USD), input/output tokens, wall time, and run timestamp for the last N runs
  2. Telemetry records written to `.handover/telemetry.db` contain only metadata (model id, renderer id, tokens, cost, timestamp, cache hit flag) — no prompt content or credentials appear in the database
  3. After accumulating more than 90 days of runs, old records are automatically rotated out — the database does not grow without bound
  4. A user who has set `costWarningThreshold` in their config sees a warning in the CLI output when a run exceeds that threshold, sourced from the actual persisted run data
  5. The `renderer_runs` table has an index on `(renderer, ran_at)` so `handover cost` queries complete in milliseconds regardless of history size
**Plans**: TBD

### Phase 34: Config-Driven Model Routing
**Goal**: Users can assign cheap models to boilerplate renderers and expensive models to synthesis-heavy ones via config, with routing transparently shown in generate output and cache entries correctly scoped per model
**Depends on**: Phase 33 (routing decisions must be recorded in telemetry; telemetry schema must be stable)
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05, ROUTE-06, ROUTE-07
**Success Criteria** (what must be TRUE):
  1. User adding `renderers: { "03-architecture": { model: "claude-opus-4-6" } }` to their config sees that renderer use the specified model while all others continue using the global default
  2. User running `handover generate` sees one line per renderer in the output showing the resolved model, plus an aggregate cost line — routing is not a black box
  3. A renderer configured with a `fallback` model retries on that fallback (not the global expensive default) when the primary cheap model fails
  4. Two renderers sharing the same round but using different models produce separate cache entries — a stale cache entry built before routing landed is not served to a differently-configured run (verified by `CACHE_VERSION` bump)
  5. All 14 existing renderers have an explicit `modelHint: 'cheap' | 'standard' | 'synthesis'` classification so users without explicit config get sensible model tier defaults
**Plans**: TBD

### Phase 35: Eval Harness
**Goal**: Users can run `handover eval` to score their generated docs against a golden set using LLM-as-judge, with results always visible in CI via `$GITHUB_STEP_SUMMARY` and a sticky PR comment — never blocking, always informative
**Depends on**: Phase 33 (hard — eval run costs tracked via telemetry). Typically follows Phase 34 by sequencing (eval fixtures may include routing-config variations), but Phase 35 and Phase 36 are parallel-eligible once Phase 34 lands
**Requirements**: EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVAL-05, EVAL-06, EVAL-07, EVAL-08
**Success Criteria** (what must be TRUE):
  1. User running `handover eval` against their generated docs receives a score table per golden case covering completeness, navigability, and code-accuracy dimensions — and the command exits 0 regardless of scores
  2. The eval judge uses a different provider family than the generator by default (e.g. Anthropic generator → OpenAI judge), configurable via `eval.judge.provider` and `eval.judge.model` config keys, preventing same-model narcissistic bias
  3. After a CI run, the `$GITHUB_STEP_SUMMARY` contains a score table with delta from baseline (when available), `::notice::` annotations for improvements, and `::warning::` annotations for regressions — the feature is visible, not silent
  4. A golden case YAML file with an `expiry` date in the past causes `handover eval` to emit a warning naming the expired case, so golden rot is surfaced before scores drift silently
  5. Each eval record includes `rubricVersion` and a source fingerprint, so a score change is attributable to either a rubric update, a generator change, or a source file change
**Plans**: TBD
**UI hint**: yes

### Phase 36: GitHub Action — PR-Preview + Scheduled-Refresh
**Goal**: Teams can add `handover/regenerate-docs@v1` to their GitHub workflows and get a sticky PR comment showing which docs would change (PR mode) or an auto-opened doc-refresh PR (scheduled mode), with cost transparency and no comment spam
**Depends on**: Phase 31 (action repo scaffold), Phase 33 (telemetry powers the cost footer in ACTN-04). Parallel-eligible with Phase 35 — the action wraps `handover generate`, not `handover eval`; the two sticky comments (doc-preview vs eval-score) are independent surfaces
**Requirements**: ACTN-01, ACTN-02, ACTN-03, ACTN-04, ACTN-05, ACTN-06
**Success Criteria** (what must be TRUE):
  1. A team adding the action to their PR workflow sees a single sticky comment (upserted, never duplicated) on each PR showing which docs would change, with the comment capped at 65,000 characters and a truncation indicator if exceeded
  2. A team adding the action to a scheduled workflow sees an idempotent doc-refresh PR opened or updated — if the diff disappears between runs, the PR auto-closes rather than lingering
  3. The PR comment footer includes a cost line showing tokens used, estimated cost in USD, and models used, sourced from the underlying `handover generate` telemetry output
  4. The action is listed on GitHub Marketplace under `handover/regenerate-docs` with the Feather `refresh-cw` icon, `blue` branding, composite action structure, and `@v1` major-version tag kept up to date
  5. The two shipped example workflow templates (`pr-preview.yml`, `scheduled-refresh.yml`) use only `on: pull_request` and `on: schedule` triggers (never bare `on: push`), include `paths:` filters, `concurrency:` blocks, and an explicit `permissions:` block
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-3 | v1.0 | 9/9 | Complete | 2026-02-18 |
| 4-7 | v2.0 | 8/8 | Complete | 2026-02-19 |
| 8-11 | v3.0 | 10/10 | Complete | 2026-02-20 |
| 12-15 | v4.0 | 11/11 | Complete | 2026-02-22 |
| 16-20 | v5.0 | 12/12 | Complete | 2026-02-26 |
| 21-26 | v6.0 | 13/13 | Complete | 2026-02-28 |
| 27-30 | v7.0 | 14/14 | Complete | 2026-03-02 |
| 31. Init Wizard + Action Scaffold | v8.0 | 0/5 | Planned | - |
| 32. Source→Doc Dep Graph | v8.0 | 0/? | Not started | - |
| 33. Cost Telemetry | v8.0 | 0/? | Not started | - |
| 34. Config-Driven Model Routing | v8.0 | 0/? | Not started | - |
| 35. Eval Harness | v8.0 | 0/? | Not started | - |
| 36. GitHub Action Complete | v8.0 | 0/? | Not started | - |
