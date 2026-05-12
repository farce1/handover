---
phase: 31-init-wizard-action-scaffold
plan: 05
subsystem: cli
tags: [init-wizard, runInit, upgrade-flag, clack-bump, wiring, integration-test]

requires:
  - phase: 31-init-wizard-action-scaffold (Plan 02)
    provides: detectProviders / cheapestDetected / patchGitignore / computeUpgradeDiff
  - phase: 31-init-wizard-action-scaffold (Plan 03)
    provides: detectMonorepo with nx + turbo support
provides:
  - User-facing `handover init` with provider auto-detection, monorepo display, --upgrade flag
  - Active runInit --yes integration test (Plan 01's it.skip is now it)
affects: [33-cost-telemetry, 34-config-driven-model-routing, 35-eval-harness]

tech-stack:
  added:
    - "@clack/prompts ^1.3.0 (bumped from ^1.0.1; CONTEXT.md D-27)"
  patterns:
    - "path.join(process.cwd(), ...) for every fs op inside init.ts — required for vi.spyOn(process, 'cwd') in integration tests to redirect into memfs"
    - "Three-branch runInit (upgrade / yes / interactive) with --upgrade checked BEFORE the fresh-init early-exit guard"
    - "Defense-in-depth guard `options.yes && !options.upgrade` at the early-exit site even when runUpgrade handles --upgrade above"

key-files:
  created: []
  modified:
    - src/cli/init.ts
    - src/cli/index.ts
    - src/cli/init-detectors.test.ts
    - package.json
    - package-lock.json

key-decisions:
  - "Defense-in-depth guard on init.ts early-exit. RESEARCH.md Open Q2 locked the `options.yes && !options.upgrade` wording. With runUpgrade taking over at the start of runInit, the guard is technically unreachable — kept it anyway because (a) it's the grep target downstream reviewers and Plan 01's test contract reference, (b) it documents the invariant explicitly, (c) cheap to keep, valuable if a future refactor changes the control flow."
  - "Plan 03's monorepo header comment uses `process.cwd()` raw (D-08 wording: `# detected: pnpm monorepo, analyzing from /path/...`). The path appears in the generated .handover.yml verbatim — this is intentional per the locked YAML header. Not a privacy concern because the file lives in the user's own repo."

patterns-established:
  - "GITIGNORE_ENTRIES module-level constant — never derived from user input (T-31-03 trust boundary maintenance)"
  - "writeUpgradedYaml helper isolates the YAML write site for the --upgrade flow so the header date is generated once per call"

requirements-completed: [INIT-01, INIT-02, INIT-03, INIT-04, INIT-05]

duration: 14min
completed: 2026-05-12
---

# Phase 31, Plan 05: runInit Wiring Summary

**`handover init` now auto-detects providers (cheapest wins), recognizes nx/turbo/etc. monorepos, idempotently patches .gitignore, and supports `--upgrade` to safely refresh stale defaults — 443/443 tests GREEN including the formerly-skipped integration target**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-12T09:42Z
- **Completed:** 2026-05-12T09:56Z
- **Tasks:** 3 (Task 1 + Task 2 done; Task 3 is a 6-scenario human-verify checkpoint pending the user)
- **Files modified:** 5 (1 rewritten, 1 extended, 1 test un-skipped, package.json + lockfile)

## Accomplishments
- `@clack/prompts ^1.0.1 → ^1.3.0` bump, lockfile regenerated, `tsc --noEmit` clean — no API breaks observed
- `--upgrade` flag registered on Commander.js init command with locked description
- `src/cli/init.ts` rewritten (~360 lines) into three composable branches:
  - `runYesMode` — D-02 cheapest-detected + D-04 anthropic fallback + D-05 Codex authMethod + D-10 patchGitignore
  - `runInteractive` — D-03 (detected) suffix + cheapest pre-select + D-07 monorepo note + D-08 YAML header comment + D-05 Codex display label
  - `runUpgrade` — D-14..D-19: three-bucket diff, table preview, confirm, D-17 deterministic one-liner under `--yes`, D-18 header, D-19 unknown-key reporting
- Plan 01's `it.skip` integration test turned on and passing — memfs + `vi.spyOn(process, 'cwd')` strategy works end-to-end against the new `path.join(process.cwd(), ...)` resolution
- T-31-S2 enforced: zero `process.env[` reads inside `init.ts` (single permitted read lives in `init-detectors.ts:detectProviders`)
- vitest.config.ts coverage exclude list untouched — `src/cli/init.ts` remains excluded per PATTERNS.md Coverage Exclusion Protocol

## Task Commits

Each task was committed atomically:

1. **Task 1: @clack bump + --upgrade flag** — `10031cf` (feat)
2. **Task 2: runInit rewrite + integration test un-skip** — `b9d4bc0` (feat)

Task 3 is a manual human-verify checkpoint — see "User Setup Required" below.

## Files Created/Modified
- `src/cli/init.ts` (rewritten, 202 → 387 lines) — three-branch runInit + helpers
- `src/cli/index.ts` (+5/-1 lines) — `--upgrade` option registered
- `src/cli/init-detectors.test.ts` (+24/-9 lines) — it.skip → it, real assertions against the live runInit module
- `package.json` (+1/-1 line) — `@clack/prompts: ^1.3.0`
- `package-lock.json` (regenerated) — dep tree resolves to 1.3.0

## Decisions Made
- **Kept the `options.yes && !options.upgrade` defense-in-depth clause** even though runUpgrade short-circuits before it. Rationale: locked by RESEARCH.md Open Q2; it is the grep target the plan's acceptance criteria specifically check for; future refactor protection costs nothing.
- **`path.join(process.cwd(), ...)` everywhere** instead of relative paths. The integration test's `vi.spyOn(process, 'cwd').mockReturnValue('/proj')` only intercepts reads/writes whose paths are constructed from `process.cwd()`. Relative paths bypass the spy because Node resolves them against the real cwd before fs handles them. This is documented inline.
- **`writeUpgradedYaml` extracted as a helper** so the `# Updated by handover init --upgrade YYYY-MM-DD` header date is computed once per call (deterministic per-run, not per-write). Single write site keeps the header logic auditable.

## Deviations from Plan
None of substance. Two micro-points worth recording:
- **`process.cwd()` raw in monorepo YAML header.** D-08 specifies the literal format `# detected: <tool> monorepo, analyzing from <cwd>`. The path goes into the file verbatim. Not a deviation — plan-locked.
- **Empty-vol-cwd-create not needed in init.ts** (unlike `patchGitignore` in Plan 02). Reason: the integration test populates `/proj/package.json` via `vol.fromJSON({ ... })`, which implicitly creates `/proj` as a directory, so `writeFileSync(join('/proj', '.handover.yml'), ...)` does not hit the empty-volume edge case Plan 02 had to guard against.

## Issues Encountered
None blocking. Vitest emits a known cosmetic warning ("vi.fn() mock did not use 'function' or 'class' in its implementation") for the TokenStore mock factory — pre-existing from Plan 01, all tests still pass, plan didn't ask for a refactor.

## User Setup Required

**Plan 05 Task 3 (human-verify) is the Phase 31 close-out checkpoint.** Before the phase can be marked fully complete, please run the 6 manual scenarios documented in `31-05-PLAN.md` lines 802-874:

1. **Scenario 1 — provider precedence with env vars (INIT-01, D-03):** Set both `ANTHROPIC_API_KEY` and `GROQ_API_KEY`, run `handover init`, confirm `(detected)` suffix appears on both and Groq is pre-selected.
2. **Scenario 2 — monorepo detection (INIT-02, D-07):** Create `pnpm-workspace.yaml` (or `nx.json` / `turbo.json`), run `handover init`, confirm the `Monorepo` note appears and the generated YAML has the `# detected: ... monorepo, analyzing from ...` comment.
3. **Scenario 3 — `--upgrade` interactive (INIT-04, D-16):** Hand-craft `.handover.yml` with customized + unknown keys, run `handover init --upgrade`, confirm the 3-column table renders and the confirm prompt appears.
4. **Scenario 4 — `--yes --upgrade` deterministic (INIT-04, D-17):** Same setup, then `handover init --upgrade --yes`. Confirm the one-line summary and exit 0.
5. **Scenario 5 — `--yes` in CI (INIT-05, D-04):** Unset all provider env vars, run `CI=1 handover init --yes`. Confirm `provider: anthropic` fallback and `.gitignore` patch.
6. **Scenario 6 — idempotent .gitignore (INIT-03):** Re-run scenario 5 twice; `.gitignore` must contain exactly one `# handover` block.

Reply with "approved" once all 6 scenarios pass, or describe any failure for fix-and-re-run.

## Next Phase Readiness
- **Phase 32 (Source→Doc Dependency Graph)** is unblocked — no dependency on init wizard.
- **Phase 33 / 34 / 35** will extend `--upgrade` via their own `UPGRADE_DEFAULTS` tables colocated with their schema additions (CONTEXT.md D-15 — scope boundary). Plan 05 satisfies the schema-only contract for v8.0.
- **Phase 36** inherits the action repo scaffold from Plan 04; transfer farce1/regenerate-docs → handover/ before Marketplace publish.
- **All 5 INIT-* requirements** (INIT-01..05) are satisfied end-to-end at the code layer; manual verification remains open.

---
*Phase: 31-init-wizard-action-scaffold*
*Plan: 05*
*Completed: 2026-05-12*
