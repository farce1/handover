---
phase: 17-local-embedding-provider-routing
plan: 03
subsystem: cli
tags: [embedding-health, locality-routing, commander, diagnostics]
requires:
  - phase: 17-local-embedding-provider-routing
    provides: embedding locality schema, router, and shared health checker primitives from plan 01
provides:
  - explicit `handover embedding-health` command for manual readiness checks
  - structured JSON diagnostics on local health failure with check-level details and remediation
  - per-run `--embedding-mode` overrides for reindex/search with visible mode/provider summaries
affects: [reindex-ux, search-ux, local-embedding-operations]
tech-stack:
  added: []
  patterns: [structured-cli-failure-json, per-run-locality-override, deterministic-route-summary-lines]
key-files:
  created: [src/cli/embedding-health.ts]
  modified: [src/cli/index.ts, src/cli/reindex.ts, src/cli/search.ts]
key-decisions:
  - "Health-check failures print structured JSON diagnostics first, then exit via existing CLI error handling"
  - "Reindex and search accept --embedding-mode per run and apply the override before execution"
  - "Reindex/search summaries always include a deterministic embedding mode/provider line"
patterns-established:
  - "Manual diagnostics commands should emit automation-friendly JSON on failures"
  - "Operational CLI commands should expose active embedding route context in their run summaries"
requirements-completed: [RMT-20, RMT-21]
duration: 4 min
completed: 2026-02-23
---

# Phase 17 Plan 03: Embedding Health Command and CLI Routing Visibility Summary

**CLI users can now run explicit embedding health checks with structured failure diagnostics and see per-run embedding mode/provider context directly in reindex and search command output.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T20:09:06Z
- **Completed:** 2026-02-23T20:13:18Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `runEmbeddingHealth()` in `src/cli/embedding-health.ts` and wired `handover embedding-health` in the CLI entrypoint.
- Implemented structured JSON diagnostics for failed local health checks with check-level status and remediation guidance.
- Added `--embedding-mode <local-only|local-preferred|remote-only>` to both `reindex` and `search` command definitions.
- Applied per-run embedding mode overrides in command handlers and surfaced deterministic mode/provider summary lines in command output.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add manual embedding health-check CLI command with structured failure output** - `3d82692` (feat)
2. **Task 2: Add per-run embedding mode overrides and mode/provider run-summary visibility** - `09d6876` (feat)

## Files Created/Modified

- `src/cli/embedding-health.ts` - New manual embedding health-check command with structured failure payload output.
- `src/cli/index.ts` - Registered `embedding-health` command and added `--embedding-mode` options to `reindex` and `search`.
- `src/cli/reindex.ts` - Added per-run embedding mode override handling and embedding route summary line.
- `src/cli/search.ts` - Added per-run embedding mode override handling and embedding route summary banner.

## Decisions Made

- Printed failure diagnostics as deterministic JSON before raising CLI errors so automation can parse check-level failures reliably.
- Kept override handling in command handlers by mutating loaded config for the current invocation to avoid persistent config side effects.
- Standardized route visibility as `Embedding route: mode ..., provider ...` to keep output predictable across operational commands.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration.** See `17-local-embedding-provider-routing-USER-SETUP.md` for:
- Environment/runtime setup for local Ollama endpoint availability
- Pulling the chosen embedding model before local checks/indexing
- Verification steps for local provider readiness

## Next Phase Readiness

- Plan 03 deliverables are complete and verified for CLI command surface and output behavior.
- Phase 17 remains in progress overall until remaining phase plans are completed.

---
*Phase: 17-local-embedding-provider-routing*
*Completed: 2026-02-23*

## Self-Check: PASSED

- FOUND: `.planning/phases/17-local-embedding-provider-routing/17-03-SUMMARY.md`
- FOUND: `.planning/phases/17-local-embedding-provider-routing/17-local-embedding-provider-routing-USER-SETUP.md`
- FOUND: `3d82692`
- FOUND: `09d6876`
