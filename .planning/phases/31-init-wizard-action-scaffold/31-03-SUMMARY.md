---
phase: 31-init-wizard-action-scaffold
plan: 03
subsystem: cli
tags: [monorepo-detection, nx, turbo, init-wizard, regression-tests]

requires: []
provides:
  - detectMonorepo() now returns tool 'nx' or 'turbo' for nx.json / turbo.json
  - Colocated regression test suite for the 5 pre-existing detectors (was uncovered)
affects: [31-05]

tech-stack:
  added: []
  patterns:
    - "File-existence-only detectors for tool markers (no parse step needed for nx/turbo JSONs)"

key-files:
  created:
    - src/cli/monorepo.test.ts
  modified:
    - src/cli/monorepo.ts

key-decisions:
  - "Inserted nx + turbo blocks between Lerna and Cargo (provider-precedence order from CONTEXT.md). Renumbered Cargo (#4 → #6) and Go (#5 → #7) section comments so the visual ordering stays contiguous."
  - "Did NOT modify vitest.config.ts coverage exclude list — adding tests for an excluded file is permitted and useful; removing the exclude requires explicit justification per PATTERNS.md §Coverage Exclusion Protocol (deferred to a later refactor)."

patterns-established:
  - "Memfs + vi.mock('node:fs', ...) hermetic pattern carried over to monorepo.test.ts (no node:fs/promises, no node:os — monorepo uses sync fs only)"

requirements-completed: [INIT-02]

duration: 4min
completed: 2026-05-12
---

# Phase 31, Plan 03: Monorepo nx + turbo Detection Summary

**detectMonorepo() now recognizes 7 tools (npm/pnpm/lerna/cargo/go/nx/turbo) and has its first regression test suite — INIT-02 satisfied at the detection layer**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-12T06:54Z
- **Completed:** 2026-05-12T06:55Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- 2 new file-existence detectors land in `src/cli/monorepo.ts`: nx.json → 'nx', turbo.json → 'turbo'
- JSDoc union comment on `MonorepoDetection.tool` extended to the full set
- 8 new regression tests pin the public detector contract (5 existing tools + 2 new tools + 1 negative case)
- Bazel intentionally NOT added (CONTEXT.md D-06)
- Full repo regression: 442 passed, 1 skipped (Plan 05 deferred integration), 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: monorepo.test.ts colocated regression suite + RED nx/turbo** — `53b37bf` (test)
2. **Task 2: nx + turbo detectors in monorepo.ts** — `5979f3a` (feat)

## Files Created/Modified
- `src/cli/monorepo.test.ts` (new) — 94 lines, 8 tests
- `src/cli/monorepo.ts` (modified) — +13 lines, -3 lines (2 new detector blocks + union comment + section renumbering)

## Decisions Made
- **Block placement between Lerna and Cargo.** Followed the planner's insertion site exactly. Existing comments for Cargo and Go updated from `// 4.` / `// 5.` to `// 6.` / `// 7.` so the visible enumeration stays contiguous after the inserts.
- **vitest coverage exclude list untouched.** `src/cli/monorepo.ts` remains excluded. Adding tests gives us regression safety without the protocol overhead of justifying an exclude-list change.

## Deviations from Plan
None — plan executed exactly as written. Task 1 produced the expected RED state (2 fails, 6 passes); Task 2 turned both fails GREEN with no incidental changes.

## Issues Encountered
None.

## User Setup Required
None.

## Next Phase Readiness
- Plan 05 (Wave 2) imports `detectMonorepo` from this module to display the detected tool to the user during `handover init`.
- The 8-test suite gives Plan 05 confidence that wiring layer changes can't silently break detection.
- INIT-02 detection-layer work is complete; wizard display + confirmation lives in Plan 05.

---
*Phase: 31-init-wizard-action-scaffold*
*Plan: 03*
*Completed: 2026-05-12*
