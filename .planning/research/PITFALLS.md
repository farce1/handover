# Pitfalls Research

**Domain:** GitHub Action distribution, init wizard upgrade, source→doc dependency graph, cost telemetry, model routing, eval harness — adding these to an existing TypeScript CLI with DAG orchestrator, 8 LLM providers, sqlite-vec search, and MCP server
**Researched:** 2026-05-11
**Confidence:** HIGH — GitHub Actions pitfalls from official docs and toolkit/action-versioning.md; LLM-as-judge pitfalls from evidentlyai.com and Cameron Wolfe's LLM evaluation guide; cache key and model routing pitfalls from codebase inspection (round-cache.ts already includes model in hash); telemetry PII pitfalls from OpenTelemetry GenAI spec; eval drift from statsig golden dataset guide; concurrency pitfalls from GitHub docs; sticky comment pitfalls from anthropics/claude-code-action issue tracker. Codebase read confirms init.ts TTY guard and --yes exist; confirms RoundCache.computeHash includes model; confirms no telemetry persistence layer yet.

---

## Critical Pitfalls

### Pitfall 1: GitHub Action Triggers on Every Push — LLM Cost Explosion

**What goes wrong:**
The `handover/regenerate-docs@v1` action ships with `on: push` (or `on: pull_request`) in its example workflow. A team with 20 commits per day triggers full LLM regeneration — 6 AI rounds across 14 renderers — on every push. At $15/million input tokens for Claude Opus, a 50-file codebase costs ~$0.40 per run. 20 runs/day = $8/day = $240/month. Teams don't notice until the bill arrives.

**Why it happens:**
Action authors write example workflows with the most common trigger (`on: push`) without thinking about the LLM cost profile. Users copy the example verbatim. Unlike CPU minutes, LLM costs are invisible in the GitHub Actions billing dashboard until they're already spent via the user's own API key.

**How to avoid:**
- The action's `README.md` must lead with a cost warning section showing estimated cost per run at current model pricing.
- The example workflow in `README.md` must use `on: schedule` (cron) for the scheduled-refresh mode and `on: pull_request` for PR-preview mode — never bare `on: push`.
- Add an `inputs.dry-run` flag that runs analysis without calling LLMs (file scan + diff only) to let teams test the action cheaply.
- The action itself should log estimated cost at the start of the run before any LLM calls: `Estimated run cost: ~$0.40 (50 files × claude-opus-4-6)`.
- Document that PR-preview mode should use `--since ${{ github.event.pull_request.base.sha }}` to only regenerate docs for changed files, not the whole codebase.

**Warning signs:**
- Action README shows `on: push` in the primary example.
- No `dry-run` input documented.
- No cost estimate in the action's output log.
- No `paths:` filter on the trigger to limit runs to source file changes.

**Phase to address:**
GitHub Action phase — draft the action YAML and README before writing any action logic; establish cost model and trigger design as first deliverables.

---

### Pitfall 2: GITHUB_TOKEN Scope Mistakes — Silent Failures Opening PRs and Commenting

**What goes wrong:**
PR-preview mode needs `pull-requests: write` to post a comment. Scheduled-refresh mode needs `contents: write` to push a branch and `pull-requests: write` to open a PR. The action ships with `permissions: read-all` (inherited from the repo's workflow default or from the calling workflow). The PR comment step silently fails or throws a 403 with a misleading message. On protected `main` branches, even `contents: write` is not enough — the GITHUB_TOKEN cannot push directly to protected branches regardless of permissions declared.

**Why it happens:**
Actions declare minimum permissions in `action.yml` but composite actions cannot set `permissions:` — only top-level workflow files can. The action docs must instruct callers to set permissions, but authors assume the action framework handles it. The protected-branch restriction is a separate system entirely (branch protection rules, not token scopes) and is not surfaced clearly in the permissions docs.

**How to avoid:**
- Document the required calling-workflow permissions block explicitly in the action README with copy-paste YAML:
  ```yaml
  permissions:
    contents: write      # push branch for scheduled-refresh mode
    pull-requests: write # open PR and post comments
  ```
- Add a preflight step inside the action that attempts a `gh api /repos/{owner}/{repo}` call with the provided token and checks the `permissions` response field. If `pull_requests` is not `write`, exit with `::error::GITHUB_TOKEN lacks pull-requests:write permission. Add permissions block to your workflow.`
- For scheduled-refresh mode, document that `GITHUB_TOKEN` cannot push to protected branches. The action must offer a `token` input that accepts a PAT for this case, with a clear note that the PAT needs `repo` scope.
- Test both modes in the action's own CI using `act` or a dedicated test repository.

**Warning signs:**
- Action README has no `permissions:` block in its example workflow.
- The action fails silently when the comment API returns 403 — no `::error::` annotation.
- No mention of protected branch limitations in the action docs.
- No `token` input parameter in `action.yml` for PAT override.

**Phase to address:**
GitHub Action phase — permissions model must be finalized before writing the comment/PR-creation steps.

---

### Pitfall 3: Concurrency Footgun — Overlapping Runs on Fast PRs

**What goes wrong:**
A developer pushes two commits rapidly to a PR branch. Two action runs start simultaneously: run A (older commit) and run B (newer commit). Both call LLMs. Both open or update the same PR comment. Run A finishes last and overwrites run B's result with stale output. With no concurrency control, costs are doubled for zero benefit.

The inverse also occurs: a scheduled-refresh run starts, a developer simultaneously pushes a hotfix triggering PR-preview mode — both run at the same time against the same codebase, same LLM budget.

**Why it happens:**
Without a `concurrency:` block, GitHub Actions runs every triggered workflow independently. Action authors assume users will configure concurrency; users don't know they need to.

**How to avoid:**
- The action's example workflow must include a `concurrency:` block:
  ```yaml
  concurrency:
    group: handover-${{ github.ref }}
    cancel-in-progress: true
  ```
- For scheduled-refresh mode, use a different group key that does not include `github.ref` to prevent the schedule cron from being cancelled by a PR push:
  ```yaml
  concurrency:
    group: handover-scheduled-refresh
    cancel-in-progress: false  # never cancel an in-progress refresh; queue instead
  ```
- Document this distinction in the action README: PR-preview should cancel-in-progress (always reflect latest commit); scheduled-refresh should not (allow the refresh to complete).

**Warning signs:**
- Example workflow has no `concurrency:` block.
- Action comment shows timestamps from two different runs within minutes of each other on the same PR.
- Action has no idempotency mechanism for the PR comment (creates new comment each run instead of updating).

**Phase to address:**
GitHub Action phase — include concurrency config in the example workflow template before publishing.

---

### Pitfall 4: PR Comment Spam — New Comment Every Push Instead of Sticky Update

**What goes wrong:**
PR-preview mode posts a new comment on every push to the PR. After 10 pushes, the PR has 10 "Handover docs preview" comments, making the PR review thread unreadable. GitHub has no comment deduplication built in.

**Why it happens:**
The naive implementation calls `gh pr comment --body "..."` which always creates a new comment. The find-and-update pattern requires two steps (find existing comment by marker, then edit or create) and is not obvious from the `gh` CLI docs.

**How to avoid:**
- Use a hidden HTML comment as a unique marker to find-and-update:
  ```markdown
  <!-- handover-docs-preview -->
  ## Handover Documentation Preview
  ...
  ```
- Implementation: use `gh api /repos/{owner}/{repo}/issues/{pr_number}/comments` to list comments, find one containing the marker, then use `gh api PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}` to update it, or create new if not found.
- Alternatively, use the `marocchino/sticky-pull-request-comment@v2` action or `peter-evans/create-or-update-comment@v5` action for the find-and-update operation — these are well-maintained and handle the idempotency pattern correctly.
- GitHub comment body limit is 65,536 characters. If the diff output exceeds this, truncate with a `... (truncated, see full diff in action logs)` note. Exceeding the limit causes a silent 422 error.

**Warning signs:**
- `gh pr comment` is used without a prior find step.
- PR review threads show multiple "Handover docs preview" comments from the bot.
- No HTML marker comment in the body template.
- Comment body is constructed from the full regenerated output without length capping.

**Phase to address:**
GitHub Action phase — implement the sticky comment pattern before the PR-preview integration test.

---

### Pitfall 5: @v1 Tag Drift — Users Silently Get Breaking Changes

**What goes wrong:**
The action ships as `handover/regenerate-docs@v1`. A minor version bump (v1.1.0) renames an input from `api-key-env` to `apiKeyEnv`. The `v1` tag is force-pushed to point to v1.1.0. All existing users' workflows break silently at their next run with a confusing "Input 'api-key-env' is not defined" error. GitHub does not warn users when a major-version tag moves.

**Why it happens:**
The GitHub Actions versioning contract states: `@v1` means "any v1.x.x release that maintains backward compatibility." Authors confuse `v1.1.0` (minor bump = additive only) with a rename (breaking change = must be v2).

**How to avoid:**
- Treat all `action.yml` input renames, type changes, and removals as breaking changes requiring a `v2` tag. Minor version bumps may only add new optional inputs with defaults.
- Automate the major-version tag update with a release workflow step:
  ```bash
  git tag -fa v1 -m "Update v1 tag to ${{ github.ref_name }}"
  git push origin v1 --force
  ```
  This step runs only on releases that are confirmed non-breaking.
- Keep a `CHANGELOG.md` in the action repo with a `## Breaking Changes` section that is checked in PR review before any release.
- Pin the action itself to a SHA in the handover repo's own CI:
  ```yaml
  uses: handover/regenerate-docs@<sha> # v1.0.0
  ```
  This provides a model for users and surfaces breaking changes before users hit them.

**Warning signs:**
- Input parameters are renamed between minor versions.
- No automated check that `@v1` compatibility contract is maintained.
- CHANGELOG.md lacks a breaking-changes section.
- The action's own test workflow uses `@v1` (floating tag) rather than a pinned SHA.

**Phase to address:**
GitHub Action phase — establish versioning policy and tag automation before first publish.

---

### Pitfall 6: Marketplace Listing Rejection — Missing or Duplicate Branding

**What goes wrong:**
The `action.yml` `branding:` block is missing, uses an icon name that does not exist in the Feather Icons set, or uses a color outside the allowed set. GitHub rejects the listing silently (it shows as invalid) or the action publishes without proper branding, appearing broken in the Marketplace. A name collision with an existing Marketplace action or a GitHub organization name also blocks listing.

**Why it happens:**
GitHub's allowed icon set (Feather Icons subset) and allowed color set (`white`, `yellow`, `blue`, `green`, `orange`, `red`, `purple`, `gray-dark`) are documented but not enforced during action development — only at listing time.

**How to avoid:**
- Include a valid `branding:` block in `action.yml` from day one:
  ```yaml
  branding:
    icon: refresh-cw   # valid Feather Icons name
    color: blue        # one of: white yellow blue green orange red purple gray-dark
  ```
- Verify the icon name against the Feather Icons list at feathericons.com before publishing.
- Run `gh api /marketplace/actions` to check for name collisions before committing to the action name.
- Test the listing in a personal fork's repository before publishing from the `handover` org to catch validation issues without affecting the public listing.

**Warning signs:**
- `action.yml` has no `branding:` block.
- Icon name is not in Feather Icons (e.g., `sparkles` is not in Feather).
- Action name contains "GitHub" (prohibited by Marketplace policies).
- The action repo contains workflow files at `.github/workflows/` alongside `action.yml` — this blocks listing (Marketplace requires a single-purpose repo or the action to be in a subdirectory).

**Phase to address:**
GitHub Action phase — validate `action.yml` structure and branding before first publish attempt.

---

### Pitfall 7: Init Wizard Re-Run in --yes Mode With Existing Scope Config Silently Wins

**What goes wrong:**
v8.0 upgrades `handover init` to add scope auto-detect (include/exclude patterns), `.gitignore` patches, and provider detection. A user who already has a customized `.handover.yml` with tuned `include`/`exclude` patterns runs `handover init --yes` in a CI onboarding script. The current implementation exits early with "already exists - skipping." The v8.0 upgrade adds new auto-detect features but does not clearly distinguish "upgrade existing config" from "initialize from scratch."

**Why it happens:**
The `--yes` guard (line 22-24 of `init.ts`) correctly skips creation if `.handover.yml` exists. But the new scope auto-detect feature is designed to populate `include`/`exclude` in new configs. If the upgrade path allows `--yes --upgrade` to merge into existing config, the merge logic can overwrite user-curated patterns. If it does not, the new features never reach existing users who call `init --yes` in setup scripts.

**How to avoid:**
- Make the behavior explicit with named flags: `--yes` (non-interactive, no-overwrite, skip if exists) vs `--yes --upgrade` (non-interactive, merge new auto-detect results into existing config without removing existing keys).
- The `--upgrade` path must be additive-only: it may add keys that are missing but never overwrite keys the user has already set.
- Write a unit test: "running init --yes --upgrade on an existing config with custom include patterns must not change those patterns."
- Log every change `--upgrade` makes: `Added exclude pattern: "dist/**" (auto-detected from .gitignore)`.

**Warning signs:**
- `handover init --yes` on an existing config produces a different `.handover.yml` than before (check with `git diff`).
- The v8.0 init phase has no test for the "upgrade existing config" path.
- `--upgrade` silently removes user-curated `exclude` entries.

**Phase to address:**
Init wizard upgrade phase — define the `--upgrade` contract before implementing scope auto-detect.

---

### Pitfall 8: .gitignore Patch Conflicts — Appending Duplicate or Contradicting Rules

**What goes wrong:**
The init wizard upgrade adds `.handover/` and `.handover.yml` to `.gitignore` if they are not already present. A user's existing `.gitignore` already contains `!.handover/docs/` (a negation rule to track generated docs in version control). The wizard appends `.handover/` without checking for existing negation rules, which silently overrides the negation and causes the user's tracked generated docs to disappear from git.

The wizard also patches `.gitignore` every time it runs, eventually creating duplicate entries (`/.handover/` appears three times).

**Why it happens:**
`.gitignore` patching is treated as an append operation. Negation rules are invisible to a simple `includes(".handover")` check. Idempotency requires reading and parsing the existing file, not just appending.

**How to avoid:**
- Before patching `.gitignore`, read the entire file and check for: (a) the exact pattern already present (skip), (b) a negation pattern that conflicts (warn: `Skipping .gitignore patch: found !.handover/ negation rule — your generated docs appear to be tracked intentionally`), (c) no mention of the pattern (append).
- Use the most specific pattern possible: `.handover/cache/` and `.handover/search.db` rather than the whole `.handover/` directory, to avoid conflicting with users who track generated docs.
- Write a test: "patching an already-patched .gitignore produces no diff on second run."
- Write a test: "patching a .gitignore containing !.handover/ emits a warning and makes no changes."

**Warning signs:**
- `.gitignore` has duplicate `.handover/` entries after multiple `init` runs.
- User reports that generated docs disappeared from git after running init.
- The patch logic uses `appendFileSync` without a prior existence check.

**Phase to address:**
Init wizard upgrade phase — implement idempotent .gitignore patching before the scope auto-detect feature touches the filesystem.

---

### Pitfall 9: Provider Auto-Detection Picks the Most Expensive Provider by Coincidence

**What goes wrong:**
The v8.0 init upgrade adds provider detection: if `ANTHROPIC_API_KEY` is set in the environment, it pre-selects Anthropic. If multiple provider keys are set (e.g., a developer has both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in their shell), the wizard picks the first one by detection order. If detection order is alphabetical and Anthropic comes first, the user is defaulted to claude-opus-4-6 ($15/M input tokens) when they intended to use GPT-4o-mini ($0.15/M input tokens).

In CI, environment variable leakage is a separate risk: the wizard reads `process.env` and logs "Detected provider: anthropic (from ANTHROPIC_API_KEY)". The log line itself does not leak the key value, but logging which env vars are present can be a security signal in public CI logs.

**Why it happens:**
Provider detection is a convenience feature. The ordering of the detection logic is an implementation detail that becomes a UX behavior. Developers do not think about the cost implications of the default selection order.

**How to avoid:**
- When multiple providers are detected, do not auto-select. Instead: in interactive mode, present the list with a note showing which keys were found, and let the user choose. In `--yes` mode, explicitly document which provider wins (cheapest? alphabetical? first?) and log it clearly.
- Recommended policy for `--yes` mode: if multiple keys found, prefer the cheapest detected provider (by default model cost from `PROVIDER_PRESETS`) and log: `Multiple providers detected. Selected: openai (cheapest detected option). Override with --provider=<name>.`
- Do not log the names of env vars that were checked but not found. Only log the selected provider.
- The interactive mode should show the hourly cost estimate next to each provider option using `PROVIDER_PRESETS` pricing data that already exists in the codebase.

**Warning signs:**
- Init wizard auto-selects a provider without asking when multiple API keys are set.
- `--yes` mode selects Anthropic (most expensive) over cheaper alternatives when both keys are present.
- Init log output includes the names of env vars that were scanned but empty.

**Phase to address:**
Init wizard upgrade phase — define the provider selection precedence policy before implementing detection.

---

### Pitfall 10: Dependency Graph Format Not Versioned — Silent Stale Graph After Analyzer Changes

**What goes wrong:**
REGEN-03 builds a source→doc dependency graph. The graph is persisted to disk (e.g., `.handover/dependency-graph.json`). In v8.1, an analyzer is refactored to emit a new edge type or rename an existing one. The graph file on disk is not invalidated because the persisted format has no schema version field. Regeneration logic reads the stale graph, finds no changes to the new edge type (which doesn't exist in the stale format), and skips re-rendering documents that actually depend on changed source files. Users get silently stale docs.

**Why it happens:**
The existing `RoundCache` already has a `CACHE_VERSION = 2` constant and handles migration. But the dependency graph is a new artifact type and developers forget to apply the same versioning discipline.

**How to avoid:**
- The persisted graph format must include a `graphVersion: number` field at the top level, mirroring the existing `CACHE_VERSION` pattern in `round-cache.ts`.
- When the analyzer version changes (tracked via a hash of the analyzer source files or an explicit `ANALYZER_VERSION` constant), invalidate the graph by deleting `.handover/dependency-graph.json` and rebuilding.
- Write a migration test: "loading a graph with a lower graphVersion must trigger a full rebuild, not silently use stale edges."
- Add the analyzer version hash to the graph invalidation key, not just the source file hashes. This prevents the "same source, new analyzer output" stale graph.

**Warning signs:**
- `.handover/dependency-graph.json` has no version field.
- The graph loading code has no version check before use.
- An analyzer refactor does not include a CHANGELOG entry mentioning graph invalidation.
- No test for "graph version mismatch triggers rebuild."

**Phase to address:**
Dependency graph (REGEN-03) phase — include graph versioning in the schema design before writing the graph builder.

---

### Pitfall 11: Over-Approximation Defeats the Purpose of Surgical Regen

**What goes wrong:**
The dependency graph is built with a conservative heuristic: if a source file is imported anywhere in the analysis pipeline, all 14 renderers depend on it. A change to `utils/logger.ts` (imported by many modules) marks all 14 renderers as needing regeneration. The surgical regen saves nothing; it is equivalent to a full regeneration on nearly every change.

**Why it happens:**
Building an accurate source→renderer dependency graph requires understanding which analyzer uses which source files and which renderer uses which analyzer output. Taking the transitive closure without pruning produces a dense graph where almost everything depends on almost everything.

**How to avoid:**
- Track dependencies at the analyzer level first, not at the source file level. Each analyzer declares which file patterns it consumes (`src/**/*.ts`, `package.json`). Each renderer declares which analyzer outputs it depends on. The graph is: changed source file → affected analyzers → affected renderers.
- Files that are infrastructure (logger, config loader, types) should be explicitly excluded from the dependency graph's source nodes. Their changes affect all renderers and should trigger a full rebuild — which is correctly handled as "no optimization applies, run everything."
- Measure the surgical regen skip rate in tests: on a change to a single leaf file, assert that fewer than 14 renderers are triggered. If all 14 are triggered for every leaf-file change, the feature provides no value.
- Write a benchmark test: "change to `render-01-overview.ts` source triggers only the overview renderer, not all 14."

**Warning signs:**
- Every file change triggers all 14 renderers in the dependency graph.
- Graph has no concept of "infrastructure file" that is excluded from surgical scoping.
- No test asserting that a single-file change produces a partial renderer selection.

**Phase to address:**
Dependency graph (REGEN-03) phase — define the analyzer→renderer dependency model before building the graph traversal logic.

---

### Pitfall 12: Cost Telemetry File Grows Without Bound

**What goes wrong:**
Per-renderer cost telemetry is persisted to `.handover/telemetry.jsonl` (or similar). Every `handover generate` run appends new entries. After 6 months of daily use on a large repo, the file is hundreds of megabytes. The `handover` CLI starts slowly because it reads the full file to compute trend summaries. The user's `.handover/` directory balloons unexpectedly.

**Why it happens:**
Append-only log files are the easiest persistence pattern. Rotation is an afterthought. The cost of slow startup is invisible until the file is large.

**How to avoid:**
- Persist telemetry as a size-bounded ring buffer or with explicit rotation: keep the last N runs (e.g., 100) or truncate to the last 90 days. Implement rotation in the write path, not the read path.
- Alternatively, aggregate per-renderer cost into a compact summary file (one row per renderer with rolling averages) rather than raw per-run records. Raw per-run records belong in a separate, optional verbose log.
- Set a hard file size limit (e.g., 5MB) checked before appending. If exceeded, rotate (rename to `.handover/telemetry.jsonl.bak`, start fresh).
- The cost trend display command should not require loading the full file — use the aggregate summary for display and only read raw logs for export/debug.
- Test: "after 200 simulated runs, telemetry file size stays below configured limit."

**Warning signs:**
- Telemetry write path uses `appendFileSync` with no size check.
- The trend display reads the entire JSONL file on startup.
- No rotation logic in the codebase.
- No maximum file size documented for `.handover/` directory contents.

**Phase to address:**
Cost telemetry phase — design the persistence format with rotation before writing the first entry.

---

### Pitfall 13: Prompt Content Leaks Into Telemetry Records

**What goes wrong:**
A developer adds per-renderer cost telemetry that records `{ renderer, model, inputTokens, outputTokens, cost, timestamp }` — all safe. A later addition logs the `promptSummary` or `outputSnippet` for debugging. The codebase being analyzed contains internal API keys, passwords in config files, or PII in source comments. These values end up in `.handover/telemetry.jsonl`, a file that developers may share or commit by accident.

The existing publish-safety CI check (`npm pack --dry-run | grep credentials`) only checks the npm package, not the `.handover/` directory content.

**Why it happens:**
The boundary between "metadata about an LLM call" and "content of an LLM call" blurs during debugging. Developers add prompt snippets to help diagnose quality issues and forget to remove them.

**How to avoid:**
- The telemetry schema (Zod) must explicitly exclude all content fields: no `prompt`, no `output`, no `context`, no `fileName`, no `fileContent`. Allowed fields: `renderer`, `model`, `provider`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `estimatedCostUsd`, `durationMs`, `runId`, `timestamp`.
- Enforce via TypeScript type: `TelemetryRecord` must not extend any type that includes prompt content. Code review checklist item: "Does the telemetry record contain any content from source files or LLM outputs?"
- Add a test: "TelemetryRecord type has no field whose name contains 'prompt', 'output', 'content', or 'context'."
- The `.gitignore` patch from the init wizard must include `.handover/telemetry.jsonl` (already should include `.handover/` generally, but be explicit).

**Warning signs:**
- `TelemetryRecord` type has an `outputSnippet` or `prompt` field.
- The telemetry file contains strings longer than 100 characters (a sign of content leaking in).
- Telemetry write path receives the `RoundResult` object directly rather than an extracted metrics subset.

**Phase to address:**
Cost telemetry phase — define the `TelemetryRecord` schema in Zod before writing any telemetry records.

---

### Pitfall 14: Cheap Model Produces Malformed JSON → Falls Back to Expensive Model → Cost Goes Up

**What goes wrong:**
Config-driven model routing assigns `ollama/llama3.1:8b` for the overview renderer (cheap, local) and `claude-opus-4-6` for the architecture renderer (expensive, high quality). The Zod validation for the overview renderer's output schema fails because llama3.1:8b produces trailing commas, wraps JSON in markdown fences, or omits required fields. The retry logic falls back to the configured fallback provider (claude-opus-4-6). The user configured cheap routing to save money; they instead pay full price for every retry.

This is a real failure mode: the `src/ai-rounds/validator.ts` and `src/ai-rounds/retry.ts` already implement retry logic. If the fallback provider in the retry chain is the global expensive default rather than a renderer-specific fallback, the routing cost saving is negated.

**Why it happens:**
Model routing config specifies the target model but not the fallback model. Retry logic uses the global provider config as the fallback. The interaction between per-renderer routing and global retry policy is an implicit coupling that is not obvious at design time.

**How to avoid:**
- Per-renderer model routing config must include an explicit `fallback` field:
  ```yaml
  renderers:
    overview:
      model: ollama/llama3.1:8b
      fallback: claude-haiku-4-5   # not claude-opus-4-6
    architecture:
      model: claude-opus-4-6
      # no fallback — fail fast if expensive model fails
  ```
- If no explicit fallback is specified for a renderer, the fallback must be the same renderer's configured model (i.e., retry with the same cheap model, not escalate to global default).
- Log every fallback occurrence: `Renderer 'overview': cheap model failed Zod validation (attempt 1/3), retrying with same model`. After max retries, log: `Renderer 'overview': exhausted retries on ollama/llama3.1:8b, not falling back to global provider`.
- Measure and alert: if more than 20% of cheap-model calls fall back, surface a warning: "Model llama3.1:8b fails validation frequently — consider using a stronger model for this renderer."

**Warning signs:**
- Per-renderer model config has no `fallback` field.
- Retry logic in `ai-rounds/retry.ts` uses the global `config.provider` as the fallback without checking for a renderer-level override.
- No test for "cheap model Zod failure does not escalate to global expensive model."
- Cost telemetry shows expensive model usage on renderers configured for cheap models.

**Phase to address:**
Model routing phase — define the routing config schema including explicit fallback before implementing the routing logic.

---

### Pitfall 15: Cache Key Does Not Include Renderer-Level Model Override

**What goes wrong:**
The existing `RoundCache.computeHash()` includes the `model` in the cache key. This is correct for single-model runs. With per-renderer model routing, renderer A uses `model=claude-haiku-4-5` and renderer B uses `model=claude-opus-4-6`. If the cache key is computed at the round level (not the renderer level) using the global model, a cached result from a global-model run is incorrectly served to a renderer using a different model.

Confirmed risk: `round-cache.ts` computes the hash from `{ roundNumber, model, analysisFingerprint, priorRoundHashes }`. The `model` here is the global config model. If model routing overrides the model per renderer, the renderer-level model is not in the cache key.

**Why it happens:**
The cache was designed for a single-model pipeline. Model routing is a new feature that introduces per-renderer model variation. The cache key design does not anticipate this variation.

**How to avoid:**
- When model routing is active, the cache key computation must use the renderer-specific model, not the global config model. Extend `computeHash` to accept an optional `rendererModel` parameter that overrides `model` in the hash input when present.
- Add a test: "two renderers with different configured models produce different cache keys for the same analysis fingerprint."
- Migration: if a cached round was computed with the global model but the config now has per-renderer routing, treat the cache as stale (the existing `CACHE_VERSION` bump mechanism handles this if the version is bumped when routing is introduced).

**Warning signs:**
- `computeHash()` is called without a renderer-specific model parameter when routing is active.
- A renderer serves a response that was cached for a different model.
- No test for "cache key varies by renderer model."

**Phase to address:**
Model routing phase — extend the cache key contract before wiring routing into the renderer pipeline.

---

### Pitfall 16: Eval Judge Is the Same Model Family as the Generator — Score Inflation

**What goes wrong:**
The eval harness uses `claude-opus-4-6` as both the document generator and the LLM-as-judge. Research shows GPT-4 and Claude models exhibit 5–25% self-enhancement bias (narcissistic bias): the judge systematically rates its own outputs higher than outputs from other models. The eval harness surfaces inflated scores. When the generator is switched from Claude to a competitor model, scores drop — but the drop is partly the model being worse and partly the judge no longer favoring its own outputs. The eval is not measuring document quality; it is measuring judge-generator alignment.

**Why it happens:**
Using the same provider for judge and generator is the path of least resistance (same API key, same SDK). The score inflation is not visible in absolute scores — it only becomes apparent in A/B comparisons or when the generator model changes.

**How to avoid:**
- Use a different model family for judge than for generator. If the generator is Claude, the judge should be OpenAI or Gemini. Make this configurable via:
  ```yaml
  eval:
    judge:
      provider: openai
      model: gpt-4o
  ```
- At minimum, use a different Claude model tier (e.g., generator is claude-opus-4-6, judge is claude-haiku-4-5). This reduces narcissistic bias while keeping a single provider.
- Document the judge model as a versioned configuration alongside the rubric. A rubric change or judge model change should trigger a golden-set re-evaluation to establish a new baseline, not just incremental scoring.
- Add a comment in the eval harness code: `// NOTE: judge model is intentionally a different family from the generator to reduce narcissistic bias.`

**Warning signs:**
- `eval.judge.provider` defaults to the same value as `config.provider`.
- No config option to specify a different judge provider.
- Eval scores never vary even when the generator model is changed.

**Phase to address:**
Eval harness phase — define judge/generator separation in the config schema before writing the scoring loop.

---

### Pitfall 17: Rubric Not Versioned Alongside Code — Score Drift Not Attributable

**What goes wrong:**
The eval rubric (criteria for scoring: completeness, accuracy, actionability, clarity) is defined as a prompt string in `src/eval/rubric.ts`. The rubric is modified in a commit that also changes a renderer. The golden set scores change. It is impossible to tell whether the renderer improved, the rubric became stricter, or both. Over six months, the rubric drifts to reflect what the current model produces well, not what good documentation actually looks like. Scores become meaningless.

**Why it happens:**
Rubrics are treated as implementation details of the eval code, not as data artifacts that need independent versioning. Changes to the rubric do not trigger golden-set re-evaluation.

**How to avoid:**
- Store the rubric as a versioned artifact: `src/eval/rubric-v1.md` (not embedded in TypeScript). The rubric version is part of the eval record schema: `{ rubricVersion: "v1", rendererVersion: "...", judgeModel: "...", score: ... }`.
- Any commit that modifies the rubric must: (a) increment the rubric version, (b) re-evaluate all golden-set fixtures against the new rubric, and (c) record the new baseline scores. CI fails if golden-set scores exist for the old rubric version but not the new one.
- The CHANGELOG entry for any rubric change must explain why the rubric changed and what the expected score delta is.
- Write a test: "eval records older than the current rubric version are flagged as incomparable, not silently included in trend averages."

**Warning signs:**
- Rubric is an inline string in the TypeScript eval code with no version field.
- A rubric change does not produce a new baseline in CI.
- Trend averages mix records with different rubric versions.

**Phase to address:**
Eval harness phase — version the rubric as a first-class artifact before running the first eval.

---

### Pitfall 18: Golden Set Rot — Stale Fixtures Produce Meaningless Scores

**What goes wrong:**
The golden set is created from a snapshot of the handover codebase at v8.0 launch. By v8.3, the codebase has evolved significantly. The golden fixtures now describe a code structure that no longer exists. The eval runs against the current codebase, compares to the old golden expected outputs, and every renderer shows "degraded" scores — not because quality dropped, but because the expected output is stale. The team stops trusting the eval. It runs in CI but no one looks at it.

**Why it happens:**
Golden sets require active maintenance. Developers update source code but forget to update golden fixtures. The eval harness continues to run and produces scores but the scores stop being meaningful.

**How to avoid:**
- Golden fixtures must be tied to a specific snapshot of the source files, not to the live codebase. The golden fixture includes: the input source snapshot hash, the expected output (or expected score), and an expiry date (e.g., `validUntil: "2026-09-01"`).
- Add a CI check: if any golden fixture's input source hash no longer matches the current codebase, mark that fixture as "needs refresh" and fail with an informative message rather than silently scoring against a stale snapshot.
- Schedule a quarterly golden-set refresh in the project backlog. The refresh process: run the generator against the current codebase, human-review the outputs, promote the best outputs as the new golden baseline.
- Keep the golden set small (5–10 renderers, not all 14) to make refresh tractable. A small, actively maintained golden set is more valuable than a large, stale one.

**Warning signs:**
- Golden fixtures reference source file hashes from months ago that no longer exist.
- Eval scores trend downward monotonically without any renderer changes.
- No expiry date or refresh ticket in the golden-set metadata.
- Golden fixture count matches the total number of renderers (14) — too large to maintain manually.

**Phase to address:**
Eval harness phase — build the golden-set refresh workflow and expiry checking before populating the initial golden set.

---

### Pitfall 19: Eval Harness Adds Minutes to CI — Dev Frustration and Bypass

**What goes wrong:**
The eval harness runs in observability mode (non-blocking). Even non-blocking, it still adds 3–5 minutes to every PR CI run because it calls the judge LLM for each of 14 renderers. Developers start skipping the eval by labeling PRs with `skip-eval` or similar patterns. The "observability mode, never blocking" promise becomes "nobody looks at it, nobody maintains it."

**Why it happens:**
LLM judge calls are slow (5–15 seconds each) and cannot be parallelized easily against rate limits. 14 renderers × 10 seconds = 2+ minutes of waiting even with parallelism. Developers optimize for fast CI feedback loops.

**How to avoid:**
- Run eval as a separate, async CI job that does not block the PR merge. Use `needs: [quality]` but mark the eval job as `continue-on-error: true` so it never gates merge.
- Use `if: github.event_name == 'schedule'` to run full eval only on the nightly/weekly schedule, not on every PR. On PRs, run only the eval fixtures for renderers that were modified in the PR diff.
- Cache judge responses keyed by `(generatorOutput hash, rubricVersion, judgeModel)`. If the generator output hasn't changed, the judge score is identical — no LLM call needed.
- Target a total eval CI time of under 60 seconds per PR by: (a) only eval changed renderers, (b) cache judge responses, (c) run on schedule for full eval.

**Warning signs:**
- Eval job is in the `needs:` chain for the merge-required status check.
- Every PR triggers eval for all 14 renderers regardless of what changed.
- No judge response cache.
- CI wall clock time increases by more than 2 minutes after eval harness is added.

**Phase to address:**
Eval harness phase — design the CI integration (separate job, schedule-gated full run) before writing the harness itself.

---

### Pitfall 20: "Observability Mode" Is Silent — Nobody Knows the Feature Exists

**What goes wrong:**
The eval harness ships in "observability mode, non-blocking." It runs in CI, produces scores, and... silently succeeds. No score is shown in the PR, no badge updates, no summary is posted. Developers merge PRs not knowing whether quality improved or degraded. The feature provides no value because its output is invisible.

**Why it happens:**
"Non-blocking" is interpreted as "no output." The design goal was to avoid blocking merges; it accidentally suppresses all visibility.

**How to avoid:**
- The eval job must post a PR comment or job summary (using `$GITHUB_STEP_SUMMARY`) showing per-renderer scores, delta from baseline, and any regressions. Use the sticky comment pattern (see Pitfall 4) so the comment is updated, not spammed.
- Use GitHub Actions annotations (`::notice::` for improvements, `::warning::` for regressions) so scores appear inline in the Actions log.
- The PR comment template:
  ```
  ## Handover Eval Results (observability only — non-blocking)
  | Renderer | Score | Delta | Status |
  |----------|-------|-------|--------|
  | overview | 8.2/10 | +0.3 | improved |
  | architecture | 7.1/10 | -0.8 | regressed ⚠️ |
  ```
- Define "regression" as a configurable threshold (e.g., more than 1.0 point drop from baseline). Regressions surface as warnings, never failures.

**Warning signs:**
- Eval job produces no output in the GitHub Actions summary.
- No PR comment or annotation from the eval job.
- Developers cannot tell whether the eval ran or what it scored.
- The eval's `observability mode` means it writes to a file that no one reads.

**Phase to address:**
Eval harness phase — design the visibility mechanism (job summary, PR comment) before implementing the scoring loop.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use `on: push` in example workflow | Action works on first try | LLM cost explosion for active repos; teams hit unexpected bills | Never — always use `on: pull_request` or `on: schedule` in examples |
| Skip concurrency block in example workflow | Less YAML to write | Duplicate LLM calls on fast pushes; double cost, stale comments | Never — one `concurrency:` block prevents this entirely |
| Use `gh pr comment` without find-and-update | Simple implementation | PR thread spam after 10+ pushes; unreadable reviews | Never — use sticky comment pattern from day one |
| Force-push `v1` tag with breaking input changes | No new major version to document | Existing users' workflows break silently | Never — rename = breaking change = v2 |
| Same model for judge and generator | Single API key, simple setup | Score inflation; eval measures alignment not quality | Acceptable for initial prototype only; fix before golden-set baseline |
| Inline rubric string in TypeScript | Fast to iterate | Rubric drift; score changes not attributable to rubric vs code | Never — version rubric as a separate file from day one |
| Append-only telemetry log without rotation | Simple write path | Unbounded file growth; slow startup; unexpected disk usage | Acceptable if file size is bounded by a constant hard limit checked at write time |
| Cheap model fallback to global expensive model | Retry always succeeds | Cost routing negated; user pays more, not less | Never — explicit per-renderer fallback or same-model retry only |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `GITHUB_TOKEN` + protected branch | Assume `contents: write` is enough to push | Require a PAT `token` input for protected-branch pushes; document this in action README |
| `GITHUB_TOKEN` + composite action | Declare `permissions:` in action.yml | `permissions:` only works in top-level workflow files; document required block for callers |
| `gh pr comment` + idempotency | Call `gh pr comment` on every push | Use HTML marker + `gh api PATCH` to update existing comment; or use `marocchino/sticky-pull-request-comment@v2` |
| `RoundCache.computeHash()` + model routing | Pass global `config.model` to hash | Pass renderer-specific model when routing is active; extend signature with optional `rendererModel` param |
| Eval judge + same provider as generator | Default judge to `config.provider` | Add separate `eval.judge.provider` config; default to a different provider family |
| `.gitignore` patch + negation rules | Append pattern without reading existing file | Parse existing file; detect negation conflicts; skip if conflict found; warn user |
| Telemetry + PII | Include `outputSnippet` for debugging | Zod schema enforces allowed fields only; no content fields permitted in `TelemetryRecord` |
| Dependency graph + analyzer refactor | No graph version field | Include `graphVersion` and analyzer hash in persisted graph; invalidate on version mismatch |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full eval on every PR (14 LLM judge calls) | CI adds 3–5 minutes per PR | Only eval changed renderers on PR; full eval on schedule | With any repo that has active PR volume |
| Reading full telemetry JSONL for trend display | Slow `handover generate` startup after months of use | Use compact summary file for display; raw log for export only | After ~100 runs or file exceeds 1MB |
| Dependency graph over-approximation (all 14 renderers on every change) | Surgical regen saves nothing | Track at analyzer→renderer level, not source file level | Any change to a widely-imported utility file |
| No concurrency control on action triggers | Two simultaneous LLM runs per PR push | `concurrency: group: handover-${{ github.ref }}, cancel-in-progress: true` | Any repo with >1 commit per minute on active PRs |
| Judge response cache miss on every eval run | Eval is slow even when generator output didn't change | Cache keyed by `(output hash, rubricVersion, judgeModel)` | Any eval run where generator output is identical to prior run |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Log `::add-mask::` omitted for `inputs.token` in action | PAT leaks in GitHub Actions logs | Always call `core.setSecret(inputs.token)` at the start of the action |
| Telemetry records include prompt content | Source code secrets leak to `.handover/telemetry.jsonl` | Zod schema enforces metadata-only fields; no content fields |
| Provider detection logs env var scan results | Reveals credential environment shape in public CI logs | Log only the selected provider, not which env vars were scanned |
| `GITHUB_TOKEN` PAT stored in workflow YAML | Credential in source control | Always use `${{ secrets.HANDOVER_TOKEN }}` reference; never inline |
| `.handover/` not in `.gitignore` | Cached LLM outputs and telemetry committed to public repo | Init wizard `.gitignore` patch adds `.handover/cache/` and `.handover/telemetry.jsonl` at minimum |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Action runs on every push, no cost warning | Surprise LLM bill at month end | Cost estimate in action log on startup; cost warning in README; default to schedule/PR triggers |
| Init auto-picks most expensive provider when multiple keys set | User pays $15/M when they expected $0.15/M | Multi-key detection asks user to choose; `--yes` picks cheapest; log selected provider clearly |
| Eval scores never visible in PR | Feature exists but provides no behavioral change | Post job summary + sticky PR comment with score table and delta from baseline |
| Cheap model fails silently, expensive model substituted | User believes routing saved money; it didn't | Log every fallback occurrence; surface in cost telemetry with `fallbackCount` field |
| Rubric changes without notification | Score drops look like quality regressions | CHANGELOG entry required for rubric changes; include expected score delta |
| Golden set expires silently | Eval scores measure old codebase; team loses trust | Fixture expiry dates; CI warning when fixture input hash no longer matches source |

---

## "Looks Done But Isn't" Checklist

- [ ] **GitHub Action — cost safeguard**: Verify example workflow uses `on: pull_request` or `on: schedule`, not `on: push`. Verify `paths:` filter limits to source files.
- [ ] **GitHub Action — permissions**: Verify README has copy-paste `permissions:` block. Verify action has `token` input for PAT override. Verify preflight checks token scope.
- [ ] **GitHub Action — sticky comment**: Verify PR comment uses HTML marker for idempotency. Verify body is capped at <65,536 chars. Verify no duplicate comments after 5 pushes to same PR.
- [ ] **GitHub Action — versioning**: Verify `action.yml` has `branding:` block with valid Feather icon and color. Verify release workflow updates `v1` tag. Verify no input renames in minor versions.
- [ ] **Init wizard — upgrade safety**: Verify `--yes` on existing config with customized `include`/`exclude` produces no diff. Verify `.gitignore` patch is idempotent (second run = no change). Verify negation rule conflict produces warning not overwrite.
- [ ] **Dependency graph — versioning**: Verify `.handover/dependency-graph.json` has `graphVersion` field. Verify analyzer hash is part of invalidation key. Verify graph rebuild test exists.
- [ ] **Model routing — cache key**: Verify `RoundCache.computeHash()` uses renderer-specific model when routing is active. Verify test: different models → different cache keys.
- [ ] **Model routing — fallback**: Verify per-renderer config has explicit `fallback` field. Verify retry logic does not escalate to global provider when renderer has cheap-model override.
- [ ] **Cost telemetry — schema**: Verify `TelemetryRecord` Zod schema has no content fields. Verify rotation logic exists. Verify `.handover/telemetry.jsonl` is in `.gitignore`.
- [ ] **Eval harness — judge separation**: Verify `eval.judge.provider` defaults to a different family from `config.provider`. Verify rubric is versioned as a separate file with `rubricVersion` field.
- [ ] **Eval harness — visibility**: Verify eval job posts to `$GITHUB_STEP_SUMMARY` or PR comment. Verify eval job is not in the merge-required status check chain.
- [ ] **Eval harness — golden set**: Verify fixtures have input source hashes and expiry dates. Verify CI warns when fixture input hash is stale.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| LLM cost explosion from `on: push` trigger | MEDIUM (bill already incurred) | Add `paths:` filter and switch to `on: pull_request`; add concurrency cancel-in-progress; estimate and document cost per run |
| @v1 tag moved with breaking input change | HIGH (all existing users broken) | Publish v2 immediately; add v1-compat shim that maps old input names to new; post GitHub advisory for the action |
| PR comment spam (10+ bot comments on one PR) | LOW | Delete all bot comments via `gh api DELETE`; implement sticky comment pattern; add test |
| Telemetry file >100MB | LOW | Rotate: `mv telemetry.jsonl telemetry.jsonl.bak && touch telemetry.jsonl`; add rotation to write path |
| Golden set entirely stale | MEDIUM | Delete all fixtures; re-run generator on current codebase; human-review top 5–10 outputs; promote as new golden set; schedule quarterly refresh |
| Cheap model fallback to expensive model silently | LOW | Add `fallbackCount` to telemetry; add log line at each fallback; add per-renderer fallback config field |
| Dependency graph stale after analyzer refactor | LOW | Delete `.handover/dependency-graph.json`; re-run; add version field and test to prevent recurrence |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| LLM cost explosion from push trigger (1) | GitHub Action phase | Example workflow uses `on: pull_request` or `on: schedule`; cost estimate logged |
| GITHUB_TOKEN scope mistakes (2) | GitHub Action phase | Preflight step checks token scope; PAT `token` input exists; README has permissions block |
| Concurrency footgun — overlapping runs (3) | GitHub Action phase | Example workflow has `concurrency:` block; cancel-in-progress differentiated by mode |
| PR comment spam — no sticky update (4) | GitHub Action phase | After 5 test pushes to a PR, exactly 1 bot comment exists and was updated each time |
| @v1 tag drift — silent breaking changes (5) | GitHub Action phase | Release workflow force-pushes v1 tag only for non-breaking changes; input renames trigger v2 |
| Marketplace listing rejection (6) | GitHub Action phase | `action.yml` has valid `branding:` block; name collision check run before publish |
| Init re-run clobbers scope config (7) | Init wizard upgrade phase | `--yes` on existing config with custom patterns produces zero diff |
| .gitignore patch conflicts (8) | Init wizard upgrade phase | Second init run produces zero .gitignore diff; negation rule conflict logs warning and skips |
| Provider auto-detection picks expensive model (9) | Init wizard upgrade phase | With multiple keys set, `--yes` selects cheapest and logs selection |
| Dependency graph not versioned (10) | REGEN-03 phase | Graph file has `graphVersion` field; version mismatch test triggers rebuild |
| Over-approximation defeats surgical regen (11) | REGEN-03 phase | Single leaf-file change triggers <14 renderers; test asserts partial renderer selection |
| Telemetry file grows without bound (12) | Cost telemetry phase | After 200 simulated runs, file size is below configured limit |
| Prompt content leaks into telemetry (13) | Cost telemetry phase | `TelemetryRecord` Zod schema has no content fields; `git grep` for `prompt\|output\|content` in TelemetryRecord |
| Cheap model fallback to expensive (14) | Model routing phase | Test: cheap model Zod failure does not escalate to global expensive provider |
| Cache key missing renderer model (15) | Model routing phase | Test: same fingerprint + different renderer models = different cache keys |
| Eval judge same family as generator (16) | Eval harness phase | `eval.judge.provider` config defaults to different family; test asserts different provider used |
| Rubric not versioned (17) | Eval harness phase | Rubric is a versioned file; eval records include `rubricVersion`; version increment required for rubric changes |
| Golden set rot (18) | Eval harness phase | Fixtures include input source hash and expiry date; CI warns on stale fixture hash |
| Eval adds minutes to CI (19) | Eval harness phase | Eval job is not in merge-required check chain; PR eval only runs changed renderers; full eval on schedule |
| Observability mode is silent (20) | Eval harness phase | Eval job posts to `$GITHUB_STEP_SUMMARY`; PR comment shows score table with delta from baseline |

---

## Sources

- GitHub Actions toolkit action-versioning.md — major version tag management: https://github.com/actions/toolkit/blob/main/docs/action-versioning.md
- GitHub Docs — Controlling permissions for GITHUB_TOKEN: https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token
- GitHub Community — Allowing github-actions[bot] to push to protected branch (Discussion #25305): https://github.com/orgs/community/discussions/25305
- GitHub Docs — Control the concurrency of workflows and jobs: https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs
- Blacksmith blog — Protect prod, cut costs: concurrency in GitHub Actions: https://www.blacksmith.sh/blog/protect-prod-cut-costs-concurrency-in-github-actions
- marocchino/sticky-pull-request-comment — idempotent PR comment pattern: https://github.com/marocchino/sticky-pull-request-comment
- peter-evans/create-or-update-comment — find-and-update pattern: https://github.com/peter-evans/create-or-update-comment
- anthropics/claude-code-action issue #960 — sticky comment find-existing bug: https://github.com/anthropics/claude-code-action/issues/960
- EvidentlyAI — LLM-as-a-Judge complete guide (narcissistic bias, score inflation): https://www.evidentlyai.com/llm-guide/llm-as-a-judge
- Cameron Wolfe — Using LLMs for Evaluation (self-enhancement bias data): https://cameronrwolfe.substack.com/p/llm-as-a-judge
- Statsig — Golden datasets: Creating evaluation standards: https://www.statsig.com/perspectives/golden-datasets-evaluation-standards
- Medium — Nobody warns you about eval drift: 7 ways benchmarks rot: https://medium.com/@hadiyolworld007/nobody-warns-you-about-eval-drift-7-ways-benchmarks-rot-54020a8682b3
- OpenTelemetry GenAI — tracing AI agents without leaking PII: https://maketocreate.com/opentelemetry-genai-tracing-ai-agents-without-leaking-pii/
- GitHub Actions Publishing guide — Marketplace branding requirements: https://docs.github.com/actions/creating-actions/publishing-actions-in-github-marketplace
- Codebase inspection — `src/cache/round-cache.ts` (confirms `model` in cache key hash; confirms `CACHE_VERSION` migration pattern)
- Codebase inspection — `src/cli/init.ts` (confirms TTY guard and `--yes` guard exist; no gitignore patching yet; no provider detection from env vars yet)
- Codebase inspection — `src/providers/presets.ts` (confirms pricing data available for cost estimates in init wizard)
- Codebase inspection — `src/context/tracker.ts` (confirms cost tracking exists at run level; no per-renderer telemetry persistence yet)

---
*Pitfalls research for: v8.0 Distribution & Smarter Regen — GitHub Action, init wizard upgrade, dependency graph, cost telemetry, model routing, eval harness on existing TypeScript CLI*
*Researched: 2026-05-11*
