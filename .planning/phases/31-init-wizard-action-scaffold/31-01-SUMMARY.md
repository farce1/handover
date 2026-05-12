---
phase: 31-init-wizard-action-scaffold
plan: 01
subsystem: testing
tags: [vitest, memfs, tdd, init-wizard, red-tests]

requires:
  - phase: 21-auth-infrastructure
    provides: TokenStore class — mocked in this test file for deterministic Codex subscription detection
provides:
  - Failing (RED) test file src/cli/init-detectors.test.ts that Plan 02 turns GREEN
  - Locked-in module surface for src/cli/init-detectors.ts (DetectedProvider, UpgradeDiff, four function signatures)
  - Memfs mock pattern propagated from src/auth/token-store.test.ts
affects: [31-02, 31-05]

tech-stack:
  added: []
  patterns:
    - "RED-test scaffold preceding implementation (TDD Wave 0)"
    - "vi.mock('../auth/token-store.js') for deterministic credential-store mocking"

key-files:
  created:
    - src/cli/init-detectors.test.ts
  modified: []

key-decisions:
  - "Dropped existsSync / fsPromises / readFile / TokenStore imports from the verbatim header — ESLint flags unused imports in Task 1's body; Task 2 re-adds readFileSync and yaml stringify on demand. The PATTERNS.md directive applies to the *mock setup pattern*, not the import surface — the lint contract is authoritative."
  - "Compact test bodies — file lands at 164 lines (under the plan's min_lines: 200 estimate). All 12 it() blocks, all 4 describes, and every named assertion from RESEARCH.md §9.4 are present. The 200-line target was a planner estimate; functional truths are met."

patterns-established:
  - "Init-detectors test scaffolding pattern: memfs + node:os mock + TokenStore mock, then describe-per-pure-function"
  - "Skipped integration skeleton (it.skip) marking the contract that a later Wave turns on"

requirements-completed: [INIT-01, INIT-02, INIT-03, INIT-04, INIT-05]

duration: 8min
completed: 2026-05-12
---

# Phase 31, Plan 01: Wave 0 RED Test Scaffold Summary

**Failing test file src/cli/init-detectors.test.ts with 12 named tests (1 skipped) — the RED target Plan 02 implements against**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-12T06:46Z
- **Completed:** 2026-05-12T06:48Z
- **Tasks:** 2
- **Files modified:** 1 (created)

## Accomplishments
- Memfs mock block in place (node:fs, node:fs/promises, node:os) plus deterministic TokenStore mock
- 4 detectProviders tests covering env-var detection, multi-provider cost sort, Ollama probe outright-win, empty fallback
- 4 patchGitignore tests covering create, idempotence, negation bailout, literal-already-covered skip
- 3 computeUpgradeDiff tests covering customized / missing / unknown buckets against real HandoverConfigSchema keys (output, audience)
- 1 skipped runInit --yes integration skeleton documenting the Plan 05 contract
- Test run fails on module resolution (`Cannot find module './init-detectors.js'`) — the expected RED state, never on syntax/type/lint

## Task Commits

Each task was committed atomically:

1. **Task 1: detectProviders RED scaffold** — `28bc3db` (test)
2. **Task 2: patchGitignore + computeUpgradeDiff + runInit skeleton** — `0cedb66` (test)

## Files Created/Modified
- `src/cli/init-detectors.test.ts` (new) — 164 lines, 4 describe blocks, 12 it() blocks (1 it.skip)

## Decisions Made
- **Header import reduction (deviation from verbatim copy).** Plan said "COPY VERBATIM lines 1-29 from src/auth/token-store.test.ts" but Task 1's body uses none of `existsSync / fsPromises / readFile / TokenStore`. ESLint's `no-unused-vars` rule rejected the verbatim header. Dropped the unused imports — Task 2 re-added what it actually consumed (`readFileSync`, `stringify as stringifyYaml`). The PATTERNS.md directive about the verbatim pattern was about the *mock setup block* (the three `vi.mock` calls), which is preserved exactly. The lint contract overrides cargo-culting unused imports.
- **No padding to hit min_lines: 200.** File comes in at 164 lines. Every named test from RESEARCH.md §9.4 is present; the line-count target was a planner estimate. Choosing concise over verbose — verifier can flag if needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule: Lint hook compliance] Removed unused imports from copied header block**
- **Found during:** Task 1 (pre-commit eslint hook)
- **Issue:** `existsSync`, `fsPromises`, `readFile`, `TokenStore` imported per plan's verbatim-copy directive but never used in Task 1's 4 tests. ESLint `@typescript-eslint/no-unused-vars` rejected the commit.
- **Fix:** Dropped the 4 unused imports. Task 2 re-imported `readFileSync` (for assertion reads) and `stringifyYaml` (for diff input construction) when it actually needed them.
- **Files modified:** `src/cli/init-detectors.test.ts`
- **Verification:** Pre-commit hooks pass on both Task 1 (`28bc3db`) and Task 2 (`0cedb66`); `npx vitest run` still produces the expected `Cannot find module` RED state.
- **Committed in:** `28bc3db` (Task 1 commit)

**2. [Rule: Formatter compliance] Prettier reformatted arrow params and stubGlobal indent**
- **Found during:** Task 1 commit (pre-commit prettier hook)
- **Issue:** `d => d.provider` → `(d) => d.provider`; single-line `vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ... }))` → multi-line.
- **Fix:** Accepted prettier output. No semantic change.
- **Files modified:** `src/cli/init-detectors.test.ts`
- **Verification:** Tests still target the same surface; grep-based acceptance criteria (`describe('detectProviders'`, etc.) all still pass.
- **Committed in:** `28bc3db` (Task 1 commit) — prettier ran via husky pre-commit

---

**Total deviations:** 2 auto-fixed (1 lint compliance, 1 formatter compliance)
**Impact on plan:** No scope change. The verbatim-copy directive was nuance-corrected against the project's lint contract. RED state preserved.

## Issues Encountered
None — both deviations were resolved by the pre-commit hooks before either commit landed.

## User Setup Required
None.

## Next Phase Readiness
- Plan 02 (Wave 1) has a complete failing-test target: 11 unit tests covering detectProviders (4), patchGitignore (4), computeUpgradeDiff (3) — each one a discrete contract assertion for the module Plan 02 creates.
- Plans 03 and 04 are unblocked and parallel-eligible with Plan 02 within Wave 1.
- Module surface locked: `DetectedProvider`, `UpgradeBucket`, `UpgradeDiff` types plus `detectProviders`, `cheapestDetected`, `patchGitignore`, `computeUpgradeDiff` function signatures — Plan 02 must implement these exactly.

---
*Phase: 31-init-wizard-action-scaffold*
*Plan: 01*
*Completed: 2026-05-12*
