---
phase: 28-git-aware-incremental-regeneration
plan: 02
subsystem: cli
tags: [cli, incremental, git, renderer, display-state]

requires:
  - phase: 28-git-aware-incremental-regeneration
    provides: git fingerprint module and tests from plan 28-01
provides:
  - `handover generate --since <ref>` CLI surface and runtime integration
  - git-aware changed-file override for context packing with fallback to content-hash mode
  - incremental display labels showing `since` ref in TTY and CI renderers
affects: [phase-28-verification, incremental-regeneration-flow, generate-cli-help]

tech-stack:
  added: []
  patterns: [git-override-with-content-hash-fallback, incremental-display-ref-propagation]

key-files:
  created:
    - .planning/phases/28-git-aware-incremental-regeneration/28-02-SUMMARY.md
  modified:
    - src/cli/index.ts
    - src/cli/generate.ts
    - src/ui/types.ts
    - src/ui/components.ts
    - src/ui/ci-renderer.ts
    - src/ui/renderer.ts

key-decisions:
  - "Used a dedicated internal early-exit signal for zero-change `--since` runs instead of inline `process.exit`, preserving project CLI error-handling conventions."
  - "Kept analysis fingerprint generation unchanged while overriding only the changed-file set used by context packing."
  - "Applied git fallback warnings without failing the run, then reused existing content-hash incremental logic and cache persistence."

patterns-established:
  - "Incremental Source Pattern: `--since` can override changed files for packing while preserving standard analysis cache updates for future non-`--since` runs."
  - "Display Propagation Pattern: add incremental metadata to `DisplayState`, render in shared components, and mirror in CI logs."

requirements-completed:
  - REGEN-01
  - REGEN-02

duration: 11 min
completed: 2026-03-02
---

# Phase 28 Plan 02 Summary

**Completed end-to-end git-aware incremental regeneration by wiring `--since <ref>` through CLI parsing, analysis selection, and TTY/CI incremental display output.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-02T13:26:00Z
- **Completed:** 2026-03-02T13:37:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `--since <ref>` option to `generate` and propagated `since`/`sinceRef` fields through CLI option and display state types.
- Integrated `getGitChangedFiles` into `runGenerate` static-analysis flow with explicit fallback handling, invalid-ref error propagation, and zero-change early exit.
- Updated run labels and file coverage output to show `Incremental mode (since <ref>)` in both TTY and CI renderers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CLI and state surface for --since** - `fe65c2d` (feat)
2. **Task 2: Integrate git-aware incremental logic and render updates** - `05c2b29` (feat)

## Files Created/Modified

- `src/cli/index.ts` - added `--since <ref>` generate command option and help text.
- `src/cli/generate.ts` - integrated git fingerprint lookup, fallback behavior, early-exit path, and incremental metadata propagation.
- `src/ui/types.ts` - added `sinceRef` to `DisplayState`.
- `src/ui/components.ts` - updated run label/coverage rendering to show `since` ref context.
- `src/ui/renderer.ts` - passed `sinceRef` into file coverage rendering for TTY output.
- `src/ui/ci-renderer.ts` - updated incremental CI log line to include optional `(since <ref>)`.

## Decisions Made

- Preserved content-hash cache save behavior even during git-aware runs so subsequent non-`--since` runs keep accurate cache baselines.
- Kept invalid ref failures as hard errors (non-zero path via existing CLI error handler), while repo-context gaps remain soft fallbacks.
- Reused existing incremental UI state (`isIncremental`, counts) and extended it with `sinceRef` only for git-active incremental runs.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

- None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both phase plans are implemented and summarized.
- Phase 28 is ready for verification and phase-completion updates.

## Self-Check: PASSED

- `npx tsc --noEmit` passed.
- `npx vitest run` passed.
- `npx vitest run --coverage` passed with enforced thresholds.
- `npm run build` passed.
- `node dist/index.js generate --help | rg since` confirms `--since <ref>` option text.

---
*Phase: 28-git-aware-incremental-regeneration*
*Completed: 2026-03-02*
