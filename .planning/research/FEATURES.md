# Feature Research

**Domain:** TypeScript CLI tool — GitHub Action distribution, init wizard upgrade, source-doc dependency graph, cost telemetry, model routing, eval harness
**Researched:** 2026-05-11
**Milestone:** v8.0 Distribution & Smarter Regen
**Confidence:** HIGH (GitHub Actions official docs + toolkit versioning guide; Anthropic eval docs fetched directly; LLM routing patterns from LogRocket/AWS official blogs; existing codebase read directly)

---

## Context: What Already Exists

The existing Handover CLI has (relevant to v8.0):

- `handover init`: @clack/prompts wizard, provider select + apiKeyEnv text prompt, auto-detects project name/language from package.json/tsconfig/Cargo.toml/go.mod. Writes `.handover.yml`. `--yes` guard in CI. No scope auto-detect, no monorepo awareness, no .gitignore patching.
- `handover generate`: `--since <ref>` incremental via git diff+status, content-hash cache, `--only` renderer filter. 14 document renderers, 6 AI rounds with known `requiredRounds[]` per renderer.
- `TokenUsageTracker`: per-round token/cost/time, cache savings display, model cost table. In-memory only — reset each `generate` run. Not persisted, not per-renderer.
- `DOCUMENT_REGISTRY`: each renderer declares `requiredRounds[]` (e.g. `03-architecture` needs rounds 1,2,3,4). `computeRequiredRounds()` expands transitive round deps. No source→renderer dependency tracking exists yet.
- Config schema (`HandoverConfigSchema`): `provider`, `model`, `apiKeyEnv`, `output`, `include/exclude`, `costWarningThreshold` (threshold only, no persistence), no per-renderer model override.

---

## Feature 1: GitHub Action `handover/regenerate-docs@v1`

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| PR-preview mode on `pull_request` trigger | Any doc-gen CI tool posts results as PR comments — developers expect to see output without leaving GitHub | MEDIUM | Trigger on `pull_request: [opened, synchronize]`; post/update comment on the PR |
| Sticky (upsert) comment — find-and-update on re-runs | Spamming new comments on every push is anti-UX; teams expect one authoritative comment per PR | LOW | Use `<!-- handover-docs-preview -->` HTML sentinel in comment body to identify and update; peter-evans/find-comment + create-or-update-comment is the established pattern |
| Structured summary table in comment body | Terraform/Atlantis/Infracost established that PR comment = header + summary table + collapsible detail | LOW | Table: document name, status (unchanged/updated/new), token cost; `<details>/<summary>` for full diff |
| Scheduled-refresh mode (cron + manual `workflow_dispatch`) | Doc staleness is a known pain; teams want automated refresh without manual triggering | MEDIUM | `on: schedule` + `workflow_dispatch`; use peter-evans/create-pull-request for idempotent PR creation |
| Idempotent scheduled PR: update existing, skip if no diff | Without idempotency, cron creates duplicate PRs on every run — users lose trust immediately | LOW | peter-evans/create-pull-request is idempotent by design: fixed branch name, updates existing PR, closes automatically if diff disappears |
| Action inputs: `token`, `anthropic-key` (or provider variants), `base-branch` | Users must be able to configure secrets and target branch without forking the action | LOW | Standard `inputs:` block in action.yml |
| `@v1` major-version tag with force-update on releases | GitHub's own toolkit docs prescribe moving `v1` tag to current stable minor; `@v1` is the user-facing stable reference | LOW | `git tag -fa v1 -m "..."` + `git push origin v1 --force` in release workflow |
| Concurrency control to cancel stale PR runs | Without concurrency groups, slow doc-gen runs accumulate on rapid pushes | LOW | `concurrency: group: handover-${{ github.head_ref }} cancel-in-progress: true` |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Doc diff in PR comment (added/removed sections) | Shows what actually changed in docs, not just that docs ran — actionable for reviewers | HIGH | Need to compare new output against committed docs; git diff on generated files; truncate at ~40KB to stay under GitHub's 65,536-char comment limit |
| Comment includes per-run cost line | Transparency about LLM spend reassures cost-conscious teams; no other doc-gen action does this | LOW | Append `> Cost: $0.023 · 14 docs · claude-opus-4-5` to comment footer; uses existing TokenUsageTracker output |
| `workflow_dispatch` with `--only` renderer input | Ad-hoc regeneration of a single document (e.g. only `arch`) without full run | LOW | Pass `only: architecture` input to the CLI invocation |
| Step summary (`$GITHUB_STEP_SUMMARY`) output | Visible in Actions run detail without needing to read the PR comment | LOW | Write markdown table to `$GITHUB_STEP_SUMMARY`; independent of PR comment |
| `pull_request_target` support for fork PRs | Fork contributors can trigger doc preview on their PRs without exposing secrets | HIGH | `pull_request_target` runs in base repo context; requires careful secret scoping to avoid secret exfiltration |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Committing docs back to the PR branch in PR-preview mode | Seems convenient — docs always up to date in the branch | Creates commit loops (action triggers itself), pollutes PR history with automated commits, breaks squash-merge workflows | Post comment with diff only; scheduled-refresh mode handles commits via separate PR |
| Failing the PR if docs are out of date | CI "enforces" documentation | Blocks PRs over subjective doc quality; devs disable or ignore the check immediately — destroys trust | Non-blocking comment; scheduled refresh as separate concern |
| Multiple comment threads per renderer | Granular feedback | Notification spam; GitHub PR comment volume becomes noise | Single upserted comment with collapsible sections per renderer |
| Automatic merge of the doc-refresh PR | Reduces friction | Bypasses required review; violates branch protection for main; token needs `repo` scope which is excessive | Create PR and leave it for human merge; label it `automated` for filtering |

### Complexity: MEDIUM overall. Largest unknown: `pull_request_target` for fork safety (can defer to v2).

### Dependencies on Existing Capabilities
- Requires `handover generate` to run headlessly (already works via `--yes` equivalent in non-interactive CI)
- Requires `ANTHROPIC_API_KEY` (or provider key) as secret input — no new auth work needed
- Per-run cost line requires `TokenUsageTracker.getTotalCost()` output piped to action step output — new plumbing, small

---

## Feature 2: `handover init` Wizard Upgrade

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Detect existing `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env vars and pre-select provider | `gh auth login` checks for existing tokens; `vercel link` detects `.vercel/` config; users expect the wizard to not ask what it can detect | LOW | `process.env` check before prompt; if `ANTHROPIC_API_KEY` set, default to anthropic without asking |
| Scope auto-detect for monorepos (`packages/`, `apps/`, workspace roots) | Nx, Turborepo, pnpm workspaces all produce multi-package repos; init should detect and offer per-package config or root config | MEDIUM | Check `pnpm-workspace.yaml`, `nx.json`, `turbo.json`, `packages/*/package.json` glob; if found, ask "Configure for root or specific package?" |
| `.gitignore` patching to add `.handover/cache/` | Every new tool that writes to the repo must patch `.gitignore` — npm, supabase init, create-next-app all do this; missing it means cache artifacts get committed | LOW | `existsSync('.gitignore')` then append if pattern not present; show diff in wizard confirmation |
| Smart defaults: pre-fill model from detected provider's best option | Today wizard shows provider but not model; users don't know claude model names | LOW | Add model select step after provider; pre-populate with current recommended model per provider |
| Idempotency: re-run safe, no silent overwrite | `supabase init` fails if `supabase/` exists; `npm init` prompts before overwriting; must not clobber an existing `.handover.yml` without confirmation | LOW | Already handled for interactive mode; `--yes` guard already in place — no change needed here |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `--ci` flag that outputs `HANDOVER_PROVIDER` and `HANDOVER_API_KEY_ENV` as step outputs | CI setup wizards (Vercel, Netlify) emit env var names to parent processes; enables programmatic consumption by the GitHub Action setup step | LOW | Print `echo "provider=anthropic" >> $GITHUB_OUTPUT` style; only active when `isCI()` |
| Detect Azure OpenAI via `AZURE_OPENAI_ENDPOINT` env var | Azure OpenAI is common in enterprise; auto-select `azure-openai` provider and pre-fill `baseUrl` | LOW | Check `process.env.AZURE_OPENAI_ENDPOINT`; map to config |
| Post-init validation: call provider with a 1-token ping to confirm key works | `supabase login` validates credentials; `vercel link` verifies project access; wizard should confirm key works before ending | MEDIUM | Optional step after config write; spinner + "Verifying API key..." + check result; skip if `--yes` |
| Suggest `handover generate --only overview` as first run hint | First-run UX that teaches incremental usage from the start | LOW | Change outro message; no code change to generate |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-commit `.handover.yml` after init | One less step for user | Commits on behalf of user without review; unexpected git state change | Show `git add .handover.yml && git commit -m "chore: add handover config"` hint in outro |
| Provider auto-selection without confirmation | "Zero config" appeal | Silent selection hides the decision; user doesn't learn what was chosen; debugging auth failures is harder | Pre-select in prompt but show selection; one-key confirm |
| Wizard that asks > 5 questions | Thorough setup | Research (nodejs-cli-apps-best-practices) shows wizard abandonment rises sharply after 4-5 prompts | Keep to: provider (with env-var hint), API key env var, scope (root/package), model — 4 steps max |

### Complexity: LOW-MEDIUM overall. Provider detection and .gitignore patching are LOW; monorepo scope detection is MEDIUM.

### Dependencies on Existing Capabilities
- Extends existing `src/cli/init.ts` — additive changes only
- Monorepo scope detection requires checking for `pnpm-workspace.yaml`, `nx.json`, `turbo.json` — no new deps
- `.gitignore` patching is pure Node.js fs — no new deps

---

## Feature 3: Source→Doc Dependency Graph (REGEN-03)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Map source file change → affected renderers only | Core REGEN-03 requirement; Nx `affected` is the canonical mental model — "only run what changed" | HIGH | Build a static map: source file glob pattern → renderer IDs; on `--since <ref>` incremental run, intersect changed files with map to get affected renderer set |
| Skip unaffected renderers entirely (not just cache-hit) | Cache-hit still charges for round tokens when round is shared; skipping at the renderer selection level is the true saving | MEDIUM | Integrate with existing `resolveSelectedDocs()` + `computeRequiredRounds()`; filter before round execution |
| `handover generate --dry-run` shows which docs would regenerate | Nx shows `nx affected --dry-run`; users need to trust the graph before relying on it | LOW | Print "Would regenerate: [03-arch, 05-features]" and exit; reuse resolver output |
| Persist the source→renderer mapping in `.handover/dep-graph.json` | Graph must survive between runs; computed once, updated on config change | LOW | Write after first analysis; invalidate on config change (include/exclude) or missing file |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `handover graph` subcommand for interactive inspection | esbuild metafile + `esbuild-dependency-graph` library show "what depends on what"; surfacing this for docs is novel | MEDIUM | Print table: source glob → renderer IDs; useful for debugging unexpected rebuilds |
| Heuristic category mapping (e.g. `src/**` → all, `*.test.ts` → testing, `*.md` → overview/getting-started) | Most changes are localized; 80% case is test changes only regenerating testing doc | MEDIUM | Define a default category map in config; allow override via `.handover.yml` `depGraph:` key |
| Round-level skipping: if no affected renderer needs round N, skip that round's LLM call | 6 rounds × $cost each; architecture round is expensive; if only test files changed, skip rounds 3,4 | HIGH | Requires `computeRequiredRounds()` on the filtered renderer set; already architected in registry.ts — needs wiring |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| AST-level source import tracing (like Nx project graph) | Maximum precision — only rebuild docs that reference changed modules | AST parsing at scale adds significant startup time; TypeDoc/sphinx-js experience shows incremental AST dependency tracking is fragile and often more expensive than heuristic approaches | File-glob-to-renderer heuristic map is 90% accurate at 10% the complexity; full AST tracing is v9+ work |
| Real-time file watcher mode for auto-regen | Developer ergonomics | Conflicts with `Persistent background daemon` out-of-scope decision; disk cache already makes reruns fast | `--watch` flag can be explored separately; not v8.0 |

### Complexity: HIGH for round-level skipping; MEDIUM for renderer-level skipping; LOW for dry-run.

### Dependencies on Existing Capabilities
- Requires `resolveSelectedDocs()` from `src/renderers/registry.ts` — already exists
- Requires `computeRequiredRounds()` from `src/renderers/registry.ts` — already exists
- Requires `--since <ref>` git diff output — already exists via `src/cache/git-fingerprint.ts`
- New: dep-graph.json persistence in `.handover/`

---

## Feature 4: Per-Renderer Cost Telemetry (Persisted, Trend-Friendly)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Persist cost/tokens/time per run to `.handover/telemetry.jsonl` (append-only) | In-memory-only cost display (current state) is ephemeral; mature CLI tools (liteLLM, Langfuse) persist per-operation cost as first-class data | LOW | JSONL append: `{timestamp, runId, renderer, model, inputTokens, outputTokens, cost, durationMs}`; one line per renderer per run |
| Per-renderer cost breakdown in generate output | `liteLLM` shows per-request cost; developers need to know which renderer is expensive to route it to a cheap model | LOW | Extend existing `ci-renderer.ts` / `renderer.ts` end-of-run display; already have `TokenUsageTracker.getRoundCost()` — need to attribute rounds to renderers |
| `handover cost` subcommand: shows last-N runs summary | Cost trend visibility is table stakes for any tool that bills per-use; Langfuse, LangSmith both surface this as a primary UI element | MEDIUM | Read from `.handover/telemetry.jsonl`; compute per-renderer averages, trend (up/down), total per run |
| Cost per run stored as machine-readable JSON (not just terminal display) | Enables CI budget checks, custom dashboards, scripting | LOW | Already captured in JSONL — machine-readable by design |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Trend detection: flag if a renderer's cost increased >20% vs 30-run rolling average | Regression detection (liteLLM/Cribl pattern) catches prompt changes that accidentally bloat cost | MEDIUM | Read last 30 runs from JSONL; compute rolling average per renderer; warn if current > 1.2× average |
| `handover cost --since <date>` budget report | Teams need monthly spend visibility; AWS/GCP both surface this as standard cost tooling | MEDIUM | Filter JSONL by timestamp; group by date; sum costs; print table |
| Budget alert threshold in config (`costWarningThreshold` already in schema) | `costWarningThreshold` exists but is not wired to telemetry — connect it | LOW | Compare run total against threshold; warn in terminal and write to step summary in CI |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Remote telemetry / phone-home to a hosted dashboard | SaaS cost analytics appeal | Privacy red line for open source CLI tool; users have confidential codebases; any remote telemetry requires explicit opt-in with clear disclosure and would need auth infrastructure | Local JSONL only; users can build their own dashboards on top |
| SQLite for telemetry storage | Structured queries, richer analytics | JSONL append is sufficient for trend analysis; SQLite adds schema migration complexity; telemetry data is time-series append — JSONL is the right primitive | Stay with JSONL; use `readline` streaming for large files |

### Complexity: LOW for persistence + display; MEDIUM for trend detection + `handover cost` subcommand.

### Dependencies on Existing Capabilities
- `TokenUsageTracker` already computes per-round cost — need to attribute rounds to renderers
- `TokenUsageTracker.estimateCost()` already exists — reuse
- `HandoverConfigSchema.costWarningThreshold` already exists — wire to telemetry check
- New: `.handover/telemetry.jsonl` file; `handover cost` CLI command

---

## Feature 5: Config-Driven Per-Renderer Model Routing

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `renderers:` key in `.handover.yml` that maps renderer ID to model override | Config-driven routing is the dominant production pattern (RouteLLM, LiteLLM, Gemini semantic router all use YAML config); users expect to express routing as config, not code | LOW | Add `renderers: { "03-architecture": { model: "claude-opus-4-6" }, "07-dependencies": { model: "claude-haiku-4-5" } }` to `HandoverConfigSchema` |
| Global `model:` as default, per-renderer override wins | LiteLLM pattern: global default + per-route override; simple precedence rule, no surprises | LOW | Resolver: `rendererConfig.model ?? globalConfig.model ?? providerDefault` |
| Validate that per-renderer model is from same provider | Prevent cross-provider model routing (different API keys, different token counting) without explicit base URL config | LOW | Zod refine: if `renderers.X.model` is set, it must be compatible with `provider`; or accept any string and fail at runtime with clear error |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Preset named tiers: `tier: cheap | standard | best` as shorthand | Users don't know model names across providers; tier aliases map to current recommended model per provider per tier | MEDIUM | `cheap` → haiku/gpt-4o-mini/gemini-flash; `standard` → sonnet/gpt-4o/gemini-pro; `best` → opus/gpt-4.1 |
| Document complexity classification as auto-routing hint | LogRocket + AWS routing guides both identify "task complexity" as the primary routing signal; synthesis-heavy renderers (architecture, edge-cases) should default to best tier | MEDIUM | Annotate each renderer in DOCUMENT_REGISTRY with `complexity: 'synthesis' | 'extraction' | 'structural'`; use as default routing hint when no explicit config |
| Per-renderer model shown in generate output and telemetry | Transparency: user should see "arch using claude-opus-4-6, deps using claude-haiku-4-5" | LOW | Add model column to per-renderer summary; already have model in TokenUsageTracker |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Router LLM (a model that decides which model to use) | Dynamic routing appeal | Adds a meta-LLM call before every renderer run — doubles latency for low-value routing decisions; overkill for 14 known renderers with stable complexity profiles | Config-driven static routing; complexity annotation on renderers is sufficient |
| Cross-provider routing (e.g. some renderers use OpenAI, others Anthropic) | Cost optimization | Requires multiple API keys, multiple auth flows, different token counting; complexity multiplies; current architecture assumes single-provider per run | Single-provider model selection within same provider's model family; cross-provider is v9+ |
| Confidence-based cascading (try cheap model, escalate if confidence low) | Adaptive cost optimization | Generated docs don't have a "confidence score" — Zod validation catches structural failures but not quality; retry logic creates non-deterministic cost and latency | Static routing with explicit quality gate via eval harness (Feature 6) |

### Complexity: LOW for YAML config + resolver; MEDIUM for tier aliases and complexity annotations.

### Dependencies on Existing Capabilities
- `HandoverConfigSchema` Zod schema — additive new key
- `src/providers/` factory must respect per-renderer model override — new `modelForRenderer()` resolver
- `TokenUsageTracker` model-based pricing table already exists — ensure all tier models are in table

---

## Feature 6: Eval Harness — Golden Set + Scoring Rubric (Observability Mode)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Golden set: a versioned set of 20-50 test cases (source snapshot → expected doc properties) | Anthropic, Inspect-AI, DeepEval all converge on: golden set = curated cases + rubric + versioned together; 50 cases catch shocking amounts of regression | MEDIUM | Store in `.handover/eval/golden/` as JSONL; each case: `{id, sourceSnapshot, rendererIds, assertions[]}` |
| Rubric assertions: string-contains, section-present, min-word-count, no-hallucination markers | Code-based grading is "fastest, most reliable, most scalable" (Anthropic docs); LLM-judge is for nuanced quality only | LOW | `type: contains | not-contains | min-length | section-present | regex`; evaluated without LLM calls |
| LLM-as-judge for quality dimensions: completeness, accuracy, clarity | Rubric-based evals using LLM-as-judge achieve 80-90% agreement with human evaluators; use a different (cheaper) model as judge | MEDIUM | Judge prompt: structured rubric with scoring 1-5 per dimension; encourage `<thinking>` before score; discard thinking, keep score |
| `handover eval` subcommand: runs golden set, reports pass/fail per case | Standard eval harness UX (Inspect-AI, promptfoo) — subcommand that runs the full eval suite | MEDIUM | Exit 0 regardless of score (observability mode, not blocking); print scorecard to stdout; write JSON results to `.handover/eval/results/` |
| Observability mode: surfaces in CI via `$GITHUB_STEP_SUMMARY`, never fails the build | v8.0 explicit decision: "Eval harness ships as observability only; promotion to a blocking CI gate is a future milestone after rubric stabilizes" | LOW | Exit code always 0; write summary table to step summary; print scores in terminal |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Baseline comparison: compare current run against last stored baseline | Production eval pattern (Anthropic, vadim.blog): "compare against previous baseline — decide: ship, hold, or investigate" | MEDIUM | Store last-run scores in `.handover/eval/baseline.json`; print delta (↑0.3 / ↓0.1) per dimension |
| Golden set generation helper: `handover eval --seed <N>` creates N cases from current output | "Writing hundreds of test cases is hard — get Claude to help generate more" (Anthropic docs); bootstraps eval for new projects | HIGH | Use current `handover generate` output + source snapshot as seed; LLM generates assertions; human reviews before committing |
| Score dimensions matched to handover's value prop: completeness, navigability, code-accuracy | Generic rubrics (tone, privacy) don't apply; doc-specific dimensions should be: does it cover all modules? are code examples accurate? can an AI agent navigate the index? | MEDIUM | Three custom dimensions replacing generic ones; define explicit scoring criteria per dimension in rubric prompt |
| Per-renderer score in telemetry JSONL | Connects eval scores to cost telemetry — see cost vs quality tradeoff per renderer per model | LOW | Append eval scores to `.handover/telemetry.jsonl` on eval runs that include cost data |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Blocking CI gate in v8.0 | Rigorous quality enforcement | Rubric is new and will have false positives in v8.0; blocking on an unvalidated rubric destroys developer trust immediately; Anthropic docs: "judge reliability must be validated against golden dataset before scaling" | Ship as observability; promote to gate in v9.0 after rubric calibration against human labels |
| BLEU/ROUGE scores for doc quality | Familiar NLP metrics | BLEU/ROUGE measure n-gram overlap against reference text — meaningless for handover docs which are generated from scratch (no single "reference" exists); misleading low scores create false alarm | Rubric-based LLM-as-judge + structural assertions are more relevant for free-form generated docs |
| Real-time eval on every `generate` run | Catch regressions immediately | LLM-as-judge eval costs tokens; running on every generate doubles cost; defeats cost-efficiency purpose | Run eval on-demand (`handover eval`) or in nightly CI job |

### Complexity: MEDIUM for golden set + rubric + subcommand; HIGH for baseline comparison + seeding.

### Dependencies on Existing Capabilities
- Requires `handover generate` output as test fixture — exists
- Requires a configured LLM provider for LLM-as-judge — reuses existing provider infrastructure
- New: `src/eval/` module, `handover eval` CLI command, `.handover/eval/` directory structure

---

## Feature Dependencies

```
GitHub Action (Feature 1)
    └──requires──> handover generate (headless, already works)
    └──enhances──> Cost Telemetry (Feature 4) [action posts cost in comment]
    └──enhances──> Eval Harness (Feature 6) [action can run handover eval in CI]

Init Wizard Upgrade (Feature 2)
    └──independent of all other v8.0 features

Source→Doc Dep Graph (Feature 3)
    └──requires──> --since <ref> git fingerprint (already exists)
    └──requires──> DOCUMENT_REGISTRY.requiredRounds (already exists)
    └──enhances──> Cost Telemetry (Feature 4) [skipped renderers = $0 cost logged]
    └──enhances──> Model Routing (Feature 5) [graph determines which renderers run]

Cost Telemetry (Feature 4)
    └──requires──> TokenUsageTracker (already exists, in-memory)
    └──enhances──> Model Routing (Feature 5) [cost data validates routing decisions]
    └──enhances──> Eval Harness (Feature 6) [cost+quality correlation per renderer]

Model Routing (Feature 5)
    └──requires──> HandoverConfigSchema (additive extension)
    └──requires──> Cost Telemetry (Feature 4) [telemetry validates routing effectiveness]

Eval Harness (Feature 6)
    └──requires──> handover generate output (always exists after generate)
    └──enhances──> Cost Telemetry (Feature 4) [eval scores in telemetry JSONL]
```

### Dependency Notes

- **Features 3+4+5 form a coherent group**: dep graph determines WHAT runs, telemetry tracks COST of what ran, routing controls MODEL used per renderer. Build in this order within phases.
- **Feature 6 (eval) is independent of 3/4/5**: can be built in parallel or after; only needs `generate` output.
- **Feature 1 (action) can ship with just `handover generate`**: the smarter-regen features (3/4/5) are progressive enhancements to the action, not prerequisites.
- **Feature 2 (init) is fully independent**: no shared state with other v8.0 features.

---

## MVP Definition (v8.0 Scope)

### Launch With (v8.0 core — all features are in scope)

- [x] GitHub Action PR-preview mode (sticky comment, no commits to PR branch) — Feature 1
- [x] GitHub Action scheduled-refresh mode (idempotent PR creation via peter-evans/create-pull-request) — Feature 1
- [x] `@v1` versioning with force-updated major tag — Feature 1
- [x] Init wizard: provider env-var detection, scope auto-detect, .gitignore patching — Feature 2
- [x] Source→renderer dep graph with `--dry-run` — Feature 3 (renderer-level only)
- [x] Per-renderer cost telemetry persisted to `.handover/telemetry.jsonl` — Feature 4
- [x] `handover cost` summary subcommand — Feature 4
- [x] Per-renderer model config in `.handover.yml` — Feature 5
- [x] Eval harness with golden set + rubric assertions + `handover eval` subcommand (observability mode) — Feature 6

### Add After Validation (v8.x or v9.0)

- [ ] Round-level skipping in dep graph (Feature 3 differentiator) — trigger: telemetry shows rounds dominate cost
- [ ] Trend detection + budget regression alerts (Feature 4 differentiator) — trigger: telemetry data accumulates over 30 runs
- [ ] Tier aliases (`cheap/standard/best`) for model routing (Feature 5 differentiator) — trigger: user feedback on model name confusion
- [ ] Eval baseline comparison (Feature 6 differentiator) — trigger: rubric stabilizes with <10% false positive rate
- [ ] Eval-to-blocking-gate promotion (Feature 6 anti-anti-feature) — trigger: 30+ run baseline established, rubric validated against human labels
- [ ] `pull_request_target` for fork PR support (Feature 1 differentiator) — trigger: community contributors report missing preview

### Future Consideration (v9+)

- [ ] `handover eval --seed` golden set auto-generation — requires rubric stability first
- [ ] Cross-provider model routing — requires multi-provider auth per run
- [ ] AST-level source→renderer dependency tracing — requires dedicated performance profiling

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| GitHub Action (PR-preview + scheduled) | HIGH | MEDIUM | P1 |
| Init wizard upgrade | MEDIUM | LOW | P1 |
| Source→doc dep graph (renderer-level) | HIGH | MEDIUM | P1 |
| Per-renderer cost telemetry + `handover cost` | MEDIUM | LOW | P1 |
| Per-renderer model routing (config key + resolver) | HIGH | LOW | P1 |
| Eval harness (golden set + observability mode) | HIGH | MEDIUM | P1 |
| Round-level skipping in dep graph | HIGH | HIGH | P2 |
| Trend detection in telemetry | MEDIUM | MEDIUM | P2 |
| Eval baseline comparison | HIGH | MEDIUM | P2 |
| Model tier aliases | LOW | MEDIUM | P3 |
| Eval blocking gate | HIGH | LOW (logic) / HIGH (trust) | P3 |

**Priority key:** P1 = v8.0 core · P2 = v8.x after validation · P3 = v9.0+

---

## Real-World Tool Reference

| Handover Feature | Reference Tool | What We Adopt | What We Skip |
|-----------------|----------------|---------------|--------------|
| GitHub Action versioning | actions/toolkit versioning.md | `@v1` force-updated tag, `@v1.0.0` pinned variant | SHA-pinning (user's choice, not action's job) |
| PR comment idempotency | peter-evans/find-comment + create-or-update-comment | HTML sentinel `<!-- handover-preview -->` for upsert | Multiple comment threads per renderer |
| Scheduled PR creation | peter-evans/create-pull-request | Fixed branch name, idempotent update, auto-close if no diff | Auto-merge (branch protection violation) |
| PR comment format | Atlantis/Infracost/Terraform-commenter | Summary table + collapsible `<details>` for full output, 65K char limit awareness | Per-line diff annotations (Reviewdog pattern — too granular for docs) |
| Concurrency control | GitHub Actions `concurrency:` key | `group: handover-${{ github.head_ref }} cancel-in-progress: true` | Queue-based concurrency (incompatible with cancel-in-progress) |
| Init wizard UX | nodejs-cli-apps-best-practices + create-next-app | ≤4 prompts, env-var pre-detection, `--yes` for CI | Auto-commit, >5 questions |
| Dependency graph | Nx `affected` | Renderer-level "what would rebuild?" dry-run | AST import tracing (Bazel-style full graph) |
| Cost telemetry | LiteLLM / Langfuse / Cribl | JSONL append, per-operation granularity, trend detection | Remote telemetry, SQLite schema |
| Model routing | RouteLLM / LiteLLM YAML config | Config-driven static routing, global default + per-renderer override | Router LLM, cross-provider cascading |
| Eval harness | Anthropic develop-tests docs + Inspect-AI | Code-based assertions first, LLM-as-judge for nuanced dims, observability mode, rubric versioned with golden set | BLEU/ROUGE, blocking gate before rubric stabilizes |

---

## Sources

- [GitHub Actions Toolkit — action-versioning.md](https://github.com/actions/toolkit/blob/main/docs/action-versioning.md) — `@v1` pattern, force-updated major tag (HIGH confidence — official)
- [peter-evans/create-pull-request](https://github.com/peter-evans/create-pull-request) — idempotent PR creation, fixed branch, auto-close on no diff (HIGH confidence — official)
- [GitHub Docs — Concurrency control](https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs) — `cancel-in-progress` with `head_ref` group key (HIGH confidence — official)
- [GitHub community discussion — 65536 char comment limit](https://github.com/orgs/community/discussions/41331) — 65,536 unicode char hard limit on PR/issue comment bodies (HIGH confidence — GitHub Community official)
- [Anthropic — Define success criteria and build evaluations](https://platform.claude.com/docs/en/docs/test-and-evaluate/develop-tests) — code-based grading hierarchy, LLM-as-judge patterns, rubric design (HIGH confidence — official Anthropic docs, fetched directly)
- [LogRocket — LLM routing in production](https://blog.logrocket.com/llm-routing-right-model-for-requests/) — config-driven rule-based routing, anti-patterns, fallback requirements (MEDIUM confidence — verified against multiple routing guides)
- [Vadim's Blog — Production evals for LLM systems](https://vadim.blog/2026/02/03/building-production-evals-for-llm-systems) — three-layer scoring (hard gates, soft composite, diagnostics), observability vs blocking gates (MEDIUM confidence — practitioner blog, consistent with Anthropic official patterns)
- [nodejs-cli-apps-best-practices](https://github.com/lirantal/nodejs-cli-apps-best-practices) — zero-config auto-detection, `--yes` flag conventions, ≤5 prompt guidance (MEDIUM confidence — widely cited community resource)
- [Nx — Run Only Tasks Affected by a PR](https://nx.dev/docs/features/ci-features/affected) — mental model for "what would rebuild" dry-run, `nx show --dry-run` pattern (HIGH confidence — official Nx docs)
- [RouteLLM](https://github.com/lm-sys/routellm) — YAML config-driven routing, cost vs quality tradeoffs (MEDIUM confidence — official repo + LMSYS blog)

---
*Feature research for: v8.0 Distribution & Smarter Regen*
*Researched: 2026-05-11*
