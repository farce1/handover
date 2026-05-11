# Phase 31: Init Wizard Upgrade + Action Scaffolding - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Two deliverables packaged into one phase because both are independent of v8.0's smarter-regen track:

1. **Init wizard upgrade (INIT-01..05)** — Extend `src/cli/init.ts` with provider auto-detection from environment, monorepo scope detection, idempotent `.gitignore` patching, `--upgrade` for re-runs that preserves customized fields, and a hardened `--yes` mode for CI. Centralized detectors land in a new `src/cli/init-detectors.ts` module.

2. **GitHub Action scaffolding (ACTN-07)** — Create the `handover/regenerate-docs` repository as a composite action (`runs.using: composite`) with a complete `action.yml` (branding, inputs, runnable smoke-step placeholder), README documenting when the `token` input is required, MIT license, and CI that lints the action metadata. Both operational modes (PR-preview, scheduled-refresh) are stubbed but NOT implemented — Phase 36 finishes them.

**Out of scope for Phase 31** (carried forward from REQUIREMENTS.md / SUMMARY.md):
- The actual PR-comment and scheduled-refresh logic (Phase 36 — ACTN-01..06)
- Marketplace publish (Phase 36 — ACTN-05)
- Per-package monorepo scope picker (deferred; this phase records workspace root only)
- New schema keys for telemetry/routing/eval (those phases own them; `--upgrade` only handles keys that exist as of v8.0 phase 31)

</domain>

<decisions>
## Implementation Decisions

### Provider precedence (INIT-01)

- **D-01:** Detection scans the SAME env vars in BOTH interactive and `--yes` modes: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `TOGETHER_API_KEY`, `DEEPSEEK_API_KEY`, `AZURE_OPENAI_API_KEY`. Ollama is detected separately by probing `http://localhost:11434/v1/models` with a short timeout (< 500 ms); failure = not detected. Codex subscription is detected by reading `~/.handover/credentials.json` and confirming a non-empty `codex` token field.
- **D-02:** Precedence when multiple are detected (used in `--yes`, and as the pre-selected option in interactive mode): **Gemini → OpenAI (Codex subscription preferred over API key when both exist) → Anthropic → Groq → Together → DeepSeek → Azure OpenAI → Ollama (local) → custom**. Rationale: cheapest-detected wins per research SUMMARY.md pitfall #1. Codex subscription beats OpenAI API key because the subscription is already-paid; do not silently consume metered API quota when a flat-rate path exists.
- **D-03:** Interactive mode shows ALL provider options (not just detected ones) with a `(detected)` suffix on every detected provider. The cheapest-detected provider is pre-selected. Users can override; the wizard does NOT auto-skip the provider prompt even when only one is detected — explicit confirmation respects user intent (someone may have keys for other tools).
- **D-04:** `--yes` mode with ZERO detected providers writes a `provider: anthropic` default exactly as today and exits 0 — backward compatible. CI users with no key still get a usable config file; the `generate` step is the one that fails-loud on missing key, not init.
- **D-05:** Codex subscription detection sets `authMethod: subscription` in the written config alongside `provider: openai`. Users who picked Codex see this reflected in the summary panel: `Provider: openai (Codex subscription)`.

### Monorepo scope handling (INIT-02)

- **D-06:** `detectMonorepo()` in `src/cli/monorepo.ts` is reused as-is (already detects npm/yarn, pnpm, Lerna, Cargo, Go). NX, Turbo, Bazel are added: `nx.json` → tool: `'nx'`; `turbo.json` → tool: `'turbo'`. `pnpm-workspace.yaml` already handled.
- **D-07:** When a monorepo is detected, the wizard displays an informational line (`Detected pnpm workspace (root: /abs/path). Analysis scope: current directory.`) and prompts the user to confirm. NO per-package picker for v8.0 — keep additive surface narrow. If a user wants per-package docs, they `cd` into the package and re-run init.
- **D-08:** No new schema key is added for scope in v8.0. The information is shown to the user and noted in a YAML header comment in the generated `.handover.yml` (`# detected: pnpm monorepo, analyzing from /current/dir`). This keeps `HandoverConfigSchema` stable and avoids churning consumers who never need it.

### `.gitignore` patching (INIT-03)

- **D-09:** New centralized helper `patchGitignore(cwd, entries: string[])` lives in `src/cli/init-detectors.ts`. Extends the pattern from `src/cache/round-cache.ts:187` (`ensureGitignored`) but accepts multiple entries and writes them as a single labeled block. Existing `ensureGitignored` is NOT removed in this phase (round-cache continues to call it lazily on first cache write — runtime safety net).
- **D-10:** Entries written by init: `.handover/cache`, `.handover/telemetry.db`. NOT a blanket `.handover/` — Phase 35 will commit `.handover/evals/golden/`, and a blanket pattern would ignore committed fixtures.
- **D-11:** Block format — single section, marker-delimited so re-runs and future phases can detect ownership:
  ```
  
  # handover
  .handover/cache
  .handover/telemetry.db
  ```
- **D-12:** Idempotency: scan existing `.gitignore` for each entry; skip entries already covered (literal match OR a parent pattern that already covers them). If a `!.handover/*` negation rule exists anywhere in the file, log a one-line warning (`Found user negation rule for .handover/* — leaving .gitignore unchanged. Add cache/telemetry entries manually if needed.`) and do not modify the file. Negation handling is conservative: do NOT attempt to outsmart the user.
- **D-13:** If `.gitignore` does not exist, create it with only the handover section.

### `--upgrade` contract (INIT-04)

- **D-14:** "Customized" = the parsed value in existing `.handover.yml` differs from the current v8.0 default for that key. "Default" comparison uses the literal default value from `src/config/defaults.ts` (and `HandoverConfigSchema` defaults). Three buckets per key: **customized** (preserve), **at-default** (no-op; default unchanged from a prior version's default), **missing** (add with current default).
- **D-15:** v8.0 init handles ONLY keys present in HandoverConfigSchema as of phase 31. Later phases (33 telemetry, 34 routing, 35 eval) will extend `--upgrade` to add their new keys when they ship. Phase 31 lays the framework; subsequent phases plug into it via a `UPGRADE_DEFAULTS` table colocated with their schema additions.
- **D-16:** Interactive `--upgrade`: read existing config → compute diff → render a 3-column table (`key | current | action`) where `action` is one of `preserve (customized)`, `refresh (was default)`, `add (new key)` → confirm with `Apply these changes?` (default: yes) → write merged YAML.
- **D-17:** `--yes --upgrade`: deterministic, no confirm. Print one-line summary to stdout (`Upgraded .handover.yml — preserved 2 customized fields, refreshed 0 defaults, added 0 new keys.`). Exit 0.
- **D-18:** Comment preservation strategy: best-effort. The implementation re-serializes the entire YAML with a new header comment block (`# handover configuration\n# Updated by handover init --upgrade YYYY-MM-DD`). User-authored inline comments inside the YAML body are lost in v8.0 — accept this limitation; document in the upgrade output (`Note: handover init --upgrade does not preserve inline comments. Back up your .handover.yml first if needed.`). Deeper AST-preserving merge is deferred to v8.x.
- **D-19:** Stale keys (keys that exist in the existing config but are no longer recognized by the current schema) are left intact — Zod's `.passthrough()` is NOT enabled, but `.strip()` is the current schema behavior. To avoid silent deletion, `--upgrade` reads with `.safeParse()` and reports unknown keys: `Found unknown key 'foo' — leaving as-is. Remove manually if no longer needed.`

### Action scaffold behavior (ACTN-07)

- **D-20:** Repo `handover/regenerate-docs` is created with this v0 layout:
  ```
  handover/regenerate-docs/
  ├── action.yml          # composite, runnable smoke-test placeholder
  ├── README.md           # usage + when PAT is required
  ├── LICENSE             # MIT
  ├── .github/workflows/
  │   └── ci.yml          # lint action.yml + smoke-invoke composite
  └── examples/
      ├── pr-preview.yml          # stub — Phase 36 finalizes
      └── scheduled-refresh.yml   # stub — Phase 36 finalizes
  ```
- **D-21:** `action.yml` (Phase 31 ships the FULL metadata, not a stub):
  - `name: 'Handover Regenerate Docs'`
  - `description:` populated
  - `author: 'handover'`
  - `branding: { icon: 'refresh-cw', color: 'blue' }` (Feather icon — locked in research; required for Marketplace listing in Phase 36)
  - `inputs.token: { required: false, default: '${{ github.token }}', description: 'GitHub PAT for scheduled-refresh runs targeting protected branches. Use a PAT with contents:write and pull-requests:write when GITHUB_TOKEN cannot push.' }`
  - `inputs.mode: { required: false, default: 'pr-preview', description: 'pr-preview | scheduled-refresh — full behavior lands in v1.0' }`
  - `inputs.working-directory: { required: false, default: '.', description: 'Path to project root.' }`
  - `runs.using: composite`
  - `runs.steps:` runnable smoke step — `npx handover-cli@latest --version` followed by `npx handover-cli@latest generate --dry-run` (the `--dry-run` flag is delivered in Phase 32; until then the step prints a placeholder banner and exits 0, NOT 1, so consumer CIs don't break).
- **D-22:** Tag strategy: v0 is published as `v0.1.0` AND the floating `@v0` major-version tag. Phase 36 introduces `@v1`. Pre-1.0 consumers who pin to `@v0` see Phase 31 placeholder; Phase 36's `@v1` cutover is explicit, no surprise behavior change for unsuspecting `@v0` users.
- **D-23:** Marketplace publish is NOT done in Phase 31. Phase 36 owns ACTN-05. Phase 31 DOES perform the name-collision check as a verification step (`gh api /marketplace/actions | grep handover/regenerate-docs`) — fails fast if the slug is taken, before any meaningful work goes into the repo.
- **D-24:** Action repo is created via the GitHub API (`gh repo create handover/regenerate-docs --public --description "..."`). The repo lives under the `handover` org (assumed to exist; if it doesn't, the plan step prompts to create it or use a personal namespace). The action repo is intentionally NOT a subdirectory of the CLI repo — Marketplace listing requires one-action-per-repo (per research).
- **D-25:** Phase 31 explicitly does NOT include any `actions/checkout` or `peter-evans/*` step in the placeholder composite — those land in Phase 36 alongside the real PR-comment logic. This keeps the v0 scaffold minimal and avoids the temptation to half-implement either operational mode.

### Cross-cutting

- **D-26:** All new init code goes in `src/cli/init-detectors.ts` (new module) per SUMMARY.md architecture. `src/cli/init.ts` is modified only at integration points (call into detectors, build config from detected values, branch on `--upgrade`). This keeps `init.ts` skim-readable.
- **D-27:** `@clack/prompts` is bumped from `^0.10.1` to `^1.3.0` (multiselect + autocompleteMultiselect available; no API breaks per research). The bump is part of Phase 31 even though current init usage doesn't strictly require multiselect yet — bumping once and using new prompt types in this phase is simpler than two-step migration.
- **D-28:** TTY / CI detection: continue using `@clack/prompts`' `isTTY` + `isCI` exports (already imported in current `init.ts:2`). No custom detection logic.
- **D-29:** Test coverage targets the 90/90/90/85 thresholds — add unit tests for every detector (`detectProvider`, `detectScope`, `patchGitignore`, `upgradeConfig`) with memfs for filesystem isolation. Integration test for `runInit --yes` in a tempdir fixture covers the wired-up flow end-to-end.

### Claude's Discretion

- Detection messaging tone (one-liner format, color usage) — follow existing `runInit` panel/note conventions in `src/cli/init.ts:155-163`
- Exact diff-table column widths and chalk colors for `--upgrade` summary
- Whether the placeholder action smoke step uses `npx handover-cli@latest` (always-current) or `npx handover-cli@<pinned-version>` (reproducible). Default: `@latest` for v0 simplicity; revisit in Phase 36
- README structure for the action repo (the substantive content is Phase 36; Phase 31 needs ONLY: title, one-paragraph "preview release — full functionality in v1.0", token input documentation, link back to handover CLI repo)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v8.0 milestone documents
- `.planning/PROJECT.md` — project state, v8.0 milestone scope, explicit non-goals, key decisions table
- `.planning/REQUIREMENTS.md` — full v8.0 requirement specs (Phase 31 owns INIT-01..05 and ACTN-07)
- `.planning/ROADMAP.md` §"Phase 31: Init Wizard Upgrade + Action Scaffolding" — phase goal, success criteria
- `.planning/STATE.md` §"Pending Todos" — clarifications carried forward from research

### Research outputs (v8.0)
- `.planning/research/SUMMARY.md` — Executive summary, Key findings, Critical pitfalls (LLM cost explosion, .gitignore patch conflicts, provider auto-pick). HIGH confidence. Required reading before planning.
- `.planning/research/STACK.md` — `@clack/prompts@^1.3.0` bump rationale, composite action vs JS action decision
- `.planning/research/FEATURES.md` — Init wizard feature breakdown
- `.planning/research/ARCHITECTURE.md` — `src/cli/init-detectors.ts` module placement
- `.planning/research/PITFALLS.md` — Provider precedence pitfall, gitignore patch conflicts, scope clobbering on re-run

### Codebase maps
- `.planning/codebase/STACK.md` — current dependency versions
- `.planning/codebase/STRUCTURE.md` — `src/cli/` layout and naming conventions
- `.planning/codebase/CONVENTIONS.md` — file naming (`kebab-case.ts`), function naming (`createX()`, `detectX()`), test colocation

### Existing source (must read before modifying)
- `src/cli/init.ts` — current init flow, `runInit`, `detectProject`, `--yes` branch
- `src/cli/monorepo.ts` — `detectMonorepo()` and `MonorepoDetection` interface
- `src/config/schema.ts` — `HandoverConfigSchema`, `authMethod` enum, default values
- `src/config/defaults.ts` — `DEFAULT_API_KEY_ENV`, `DEFAULT_MODEL`, `DEFAULT_CONCURRENCY` maps
- `src/cache/round-cache.ts:187-214` — `ensureGitignored()` reference pattern for `patchGitignore()`
- `src/cli/auth/login.ts` — Codex credential file location (`~/.handover/credentials.json`)

### External standards
- GitHub Actions composite action syntax: <https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-composite-action>
- GitHub Actions metadata (`branding`, `inputs`, `runs`): <https://docs.github.com/en/actions/reference/metadata-syntax-for-github-actions>
- GitHub Marketplace listing requirements (one action per repo, branding required): <https://docs.github.com/en/actions/sharing-automations/creating-actions/publishing-actions-in-github-marketplace>
- `@clack/prompts` v1 API: <https://github.com/bombshell-dev/clack> (multiselect, autocompleteMultiselect, path prompts)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`detectMonorepo()`** in `src/cli/monorepo.ts:19` — returns `{isMonorepo, tool, workspaceRoot}`. Already handles npm/yarn, pnpm, Lerna, Cargo, Go workspaces. NX and Turbo need to be added (one-line each).
- **`ensureGitignored()`** in `src/cache/round-cache.ts:187` — reference pattern for idempotent gitignore appending. New `patchGitignore()` generalizes this for multiple entries + section header + negation detection.
- **`DEFAULT_API_KEY_ENV`** in `src/config/defaults.ts:5` — already maps every supported provider to its env var name. `detectProvider()` iterates this table to discover which providers have keys present.
- **`HandoverConfigSchema`** in `src/config/schema.ts` — Zod schema with default values; `--upgrade` compares parsed values against these defaults to identify customization.
- **`isTTY` + `isCI`** from `@clack/prompts` — already used in current init for the `--yes` guard. Continue using these.

### Established Patterns
- **CLI command structure** — `runX(options)` exported function in `src/cli/X.ts`, registered in `src/cli/index.ts` via Commander.js. Follow for any new init subflag.
- **Auto-detection helpers** — pure functions returning typed result objects (e.g., `MonorepoDetection`, `ProjectInfo`). No I/O side effects in detectors themselves; the wizard composes them.
- **Yaml writing** — `stringifyYaml(config, { lineWidth: 80 })` with leading comment block. Re-use this exact pattern for `--upgrade` writes.
- **Test pattern** — colocated `*.test.ts`, `memfs` for filesystem isolation, `vi.hoisted()` for mock setup (per `.planning/codebase/TESTING.md`).

### Integration Points
- **`src/cli/index.ts`** — Commander.js registration. New flags: `--upgrade`, behavior change for `--yes`. The existing `init` command stays; flags are additive.
- **`src/cli/init.ts:16-166`** — `runInit()`: replace `detectProject()` call with composite detector pipeline (`detectProvider()`, `detectMonorepo()`, `detectProject()`). Branch on `options.upgrade`. The `--yes` path at lines 33-50 gets the cheapest-detected-provider treatment.
- **`package.json`** — `@clack/prompts: ^1.3.0` bump (currently `0.10.1` per `.planning/codebase/STACK.md`; SUMMARY.md says `^1.0.1` is current — verify at plan time).
- **No changes** to `src/config/schema.ts` for Phase 31 scope keys. Schema additions for telemetry/routing/eval land in their respective phases.
- **Separate action repo** at `https://github.com/handover/regenerate-docs` — created in Phase 31, owned by Phase 36 for completion. The CLI repo has zero dependency on it; the action repo wraps the published `handover-cli` npm package.

</code_context>

<specifics>
## Specific Ideas

- The wizard should "feel like create-next-app" — short, polished, progressive disclosure. Current init.ts already does this; the upgrade extends the pattern rather than reworking it.
- `--upgrade` summary table should be scannable in under 3 seconds — not a wall of YAML diff. 3 columns max.
- The action repo placeholder should be RUNNABLE so early adopters who add `handover/regenerate-docs@v0` to their workflow see a smoke output and a clear "v1.0 coming soon" message, not a broken action invocation.
- Codex subscription handling is explicit, not silent: if both `OPENAI_API_KEY` and a Codex token exist, the wizard SHOWS both and asks. This avoids silently consuming metered API quota when a flat-rate subscription is available.

</specifics>

<deferred>
## Deferred Ideas

- **Per-package monorepo picker** — enumerate packages from `pnpm-workspace.yaml`/`turbo.json` and multi-select which to document. Reason: scope-stretches Phase 31; v8.0 ships with single-scope behavior. Reconsider in v8.x if users request it. (Captured per scope_guardrail — not lost.)
- **AST-preserving `--upgrade` YAML merge** — preserve user-authored inline comments and key ordering during refresh. Reason: requires a YAML CST library or custom merger; v8.0 accepts comment loss with a documented warning. Trigger to revisit: user complaint or 3+ instances of important config comments being lost.
- **Migration framework for cross-version `--upgrade`** — version-aware default tables for users skipping multiple releases. Reason: v8.0 is the first iteration; we don't yet have a version history of defaults worth migrating between. Revisit when v9.0+ ships and 2+ versions of defaults coexist in the wild.
- **`handover init --print-detection`** subcommand that only prints what would be detected (for CI debugging). Reason: nice diagnostic but not a stated INIT requirement; capture for a v8.x DX phase.
- **Codex subscription health-check during init** — verify the stored token is still valid via a probe call. Reason: handover `auth status` already does this; init reuses presence-of-credentials as the detection signal and lets the user run `handover auth status` if they want validation.

</deferred>

---

*Phase: 31-init-wizard-action-scaffold*
*Context gathered: 2026-05-11*
