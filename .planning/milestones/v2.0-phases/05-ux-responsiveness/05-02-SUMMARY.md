---
phase: 05-ux-responsiveness
plan: 02
subsystem: ui
tags: [stream-flag, file-coverage, parallel-savings, terminal-ui, cli, ci-renderer]

# Dependency graph
requires:
  - phase: 05-ux-responsiveness
    plan: 01
    provides: Streaming token counter foundation and live elapsed timer in TerminalRenderer

provides:
  - --stream CLI flag on generate command enabling streaming visibility indicator
  - File coverage line (total/analyzing/ignored) rendered before AI rounds in both TTY and CI modes
  - computeParallelSavings() computing ms saved by concurrent rounds 5+6 execution
  - Completion summary includes "Parallel execution saved ~Xs" when applicable
  - CIRenderer structured logs for file coverage ([files]) and parallel savings ([perf])
  - onFileCoverage(state) method on Renderer interface implemented by both renderers

affects: [06-prompt-caching, any phase touching terminal UI or generate command]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'File coverage from PackedContext.metadata: analyzing = fullFiles + signatureFiles, ignored = skippedFiles'
    - 'Parallel savings gate: only report if both rounds done (not cached) and savedMs > 2000'
    - 'Renderer event pattern: onFileCoverage fires once after packFiles() in static-analysis step, before any round starts'
    - 'streamVisible on DisplayState: set from options.stream at init, read by renderRoundBlock to add streaming indicator line'

key-files:
  created: []
  modified:
    - src/cli/index.ts
    - src/cli/generate.ts
    - src/ui/types.ts
    - src/ui/components.ts
    - src/ui/renderer.ts
    - src/ui/ci-renderer.ts

key-decisions:
  - 'signatureFiles included in "analyzing" count alongside fullFiles — both are sent to LLM, so both represent analyzed scope'
  - 'parallel savings only shown when both r5 and r6 are done (not cached) and saved > 2s — avoids noise for cached runs'
  - 'renderFileCoverage import not needed in generate.ts — renderer.onFileCoverage handles rendering internally'
  - 'streamVisible carried on DisplayState (not passed per-call) so spinner interval re-renders also see the flag'

patterns-established:
  - 'Renderer event pattern: generate.ts populates displayState field then calls renderer.on*() — renderer decides how to present'
  - 'Parallel savings computation: pure function computeParallelSavings(rounds) returns null or ms saved'

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 5 Plan 02: --stream Flag, File Coverage Indicator, and Parallel Savings Summary

**--stream CLI flag, file coverage scope line (N files / N analyzing / N ignored) before AI rounds, and parallel execution savings in completion summary completing all four Phase 5 UX responsiveness features**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-19T08:19:29Z
- **Completed:** 2026-02-19T08:23:16Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `--stream` flag registered on `generate` command; when active, a dim "streaming..." indicator appears below the running round's progress line
- File coverage line ("142 files · 104 analyzing · 10 ignored") emitted once after context packing, before AI rounds begin, in both TTY and CI modes
- `computeParallelSavings()` computes wall-time savings from parallel rounds 5+6 and appends to completion summary when savings exceed 2 seconds
- CI renderer logs structured `[files]` and `[perf]` lines for file coverage and parallel savings
- All four Phase 5 UX criteria now met: live token counter (05-01), streaming indicator (--stream), file coverage (UX-04), parallel savings (UX-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --stream flag and file coverage indicator** - `c5b8f0d` (feat)
2. **Task 2: Parallel round savings and CI renderer updates** - `7f4f075` (feat)

## Files Created/Modified

- `src/cli/index.ts` - Added `--stream` option to generate command
- `src/cli/generate.ts` - Added `stream?` to GenerateOptions; sets `streamVisible` and `fileCoverage` on DisplayState; calls `renderer.onFileCoverage()`; computes parallel savings before `renderer.onComplete()`
- `src/ui/types.ts` - Added `fileCoverage?`, `streamVisible?`, `parallelSavedMs?` to DisplayState; added `onFileCoverage(state)` to Renderer interface
- `src/ui/components.ts` - Added `renderFileCoverage()`, `computeParallelSavings()`, `renderParallelSavings()`; updated `renderRoundBlock()` with `streamVisible?` parameter for streaming indicator; updated `renderCompletionSummary()` to include parallel savings line
- `src/ui/renderer.ts` - Implemented `onFileCoverage()` in TerminalRenderer; passes `state.streamVisible` to `renderRoundBlock`; imports `renderFileCoverage`
- `src/ui/ci-renderer.ts` - Implemented `onFileCoverage()` structured log; added parallel savings log in `onComplete()`

## Decisions Made

- `signatureFiles` included in "analyzing" count alongside `fullFiles` — both are sent to the LLM for analysis, so both represent analyzed scope (resolves research Open Question #1)
- Parallel savings threshold set at 2000ms: only show when > 2 seconds saved, avoiding noise for near-identical durations
- `streamVisible` stored on `DisplayState` rather than passed per render call — enables the 80ms spinner interval to consistently apply the flag without re-reading options
- `renderFileCoverage` not imported in `generate.ts` — the renderer interface pattern keeps rendering concerns out of the orchestration layer

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- ESLint flagged `renderFileCoverage` import in `generate.ts` as unused (pre-commit hook failure). Removed the import since `renderer.onFileCoverage()` delegates rendering to the renderer implementation. Fixed immediately, recommitted.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Phase 5 UX responsiveness features shipped: streaming token counter, live elapsed timer, --stream flag, file coverage indicator, parallel savings display
- Phase 6 (prompt caching) can build on the upgraded SDK foundation and streaming infrastructure without changes to the renderer interface
- `computeParallelSavings` is pure and testable — unit tests can be added if regression risk is identified

---

_Phase: 05-ux-responsiveness_
_Completed: 2026-02-19_
