---
phase: 29-search-qa-ux-polish
plan: 02
subsystem: search
tags: [search, qa, osc8, cli]

requires:
  - phase: 29-search-qa-ux-polish
    provides: search UX metadata and constants from plan 29-01
provides:
  - TTY-gated OSC8 source links in fast search output and QA footnotes
  - QA answer-path stats footer with duration, token count, and source count
  - answer-result stats contract for downstream CLI rendering without touching clarification path
affects: [search-cli-tty-output, qa-answer-output, source-link-navigation]

tech-stack:
  added: []
  patterns: [tty-gated-link-rendering, qa-answer-stats-contract]

key-files:
  created:
    - .planning/phases/29-search-qa-ux-polish/29-02-SUMMARY.md
  modified:
    - src/qa/answerer.ts
    - src/cli/search.ts

key-decisions:
  - "Kept QA stats only on the `answer` variant and preserved clarification as a separate no-stats path."
  - "Added `formatSourceLink` helper with explicit TTY gate so piped/CI output remains plain text."
  - "Rendered QA stats with shared `formatDuration`/`formatTokens` utilities and dim styling to avoid visual noise."

patterns-established:
  - "Output-mode rendering pattern: branch on TTY to emit OSC8 links while preserving plain source paths for non-interactive consumers."

requirements-completed:
  - SRCH-04
  - SRCH-05

duration: 8 min
completed: 2026-03-02
---

# Phase 29 Plan 02 Summary

**Added OSC8 clickable source links and QA answer telemetry footer while preserving plain-path output and clarification behavior.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-02T14:24:00Z
- **Completed:** 2026-03-02T14:32:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended `AnswerQuestionResult` answer variant with stats (`durationMs`, token usage, unique source count/files).
- Added TTY-aware OSC8 link formatting for fast search results and QA citation/source output.
- Added dimmed QA stats footer (`Answer in ... using ... from ... sources`) plus source file list after answer content.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend QA answer result with stats metadata** - `17cf3e6` (feat)
2. **Task 2: Add OSC8 links and QA stats rendering in CLI search** - `e33ce63` (feat)

## Files Created/Modified

- `src/qa/answerer.ts` - added answer-path `stats` object and unique source-file derivation.
- `src/cli/search.ts` - added `formatSourceLink`, threaded `isTty/outputDir`, upgraded footnote rendering, and appended QA stats footer.

## Decisions Made

- Preserved existing citation formatting contract and post-processed source segments for OSC8 only when TTY is true.
- Used `config.output` as the base for absolute file link resolution in both fast and QA modes.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

- None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three phase plans are now implemented and summarized.
- Phase 29 is ready for verification and tracking updates.

## Self-Check: PASSED

- `npx tsc --noEmit` passed.
- `npm test` passed.
- Code path confirms stats render only for `result.kind === 'answer'`; clarification output remains unchanged.

---
*Phase: 29-search-qa-ux-polish*
*Completed: 2026-03-02*
