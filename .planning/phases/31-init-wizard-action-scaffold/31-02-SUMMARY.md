---
phase: 31-init-wizard-action-scaffold
plan: 02
subsystem: cli
tags: [init-wizard, provider-detection, gitignore, upgrade-diff, tdd-green]

requires:
  - phase: 21-auth-infrastructure
    provides: TokenStore — credential read used for Codex subscription detection
  - phase: 31-init-wizard-action-scaffold (Plan 01)
    provides: Failing test scaffold src/cli/init-detectors.test.ts that this plan turns GREEN
provides:
  - detectProviders / cheapestDetected / patchGitignore / computeUpgradeDiff exports
  - DetectedProvider, UpgradeBucket, UpgradeDiff types
  - Locked Codex subscription cost rank (CODEX_SUBSCRIPTION_RANK = 0.001)
affects: [31-05]

tech-stack:
  added: []
  patterns:
    - "Pure-function detector module (no side effects beyond fs writes within patchGitignore)"
    - "Three-bucket schema diff via HandoverConfigSchema.parse({}) snapshot + JSON.stringify equality"

key-files:
  created:
    - src/cli/init-detectors.ts
  modified: []

key-decisions:
  - "Added defensive mkdirSync(cwd, { recursive: true }) inside patchGitignore before writeFileSync. Plan didn't call for this — Plan 01's memfs tests reset to an empty volume and patchGitignore('/proj', ...) requires the parent dir to exist before the write. In real-world use cwd comes from process.cwd() and always exists, so this is a no-op there. Non-deviating because Plan 01's test contract (the source of truth) needed it to pass and the code stays inside the same `try` / non-fatal envelope."
  - "Imports were added incrementally per task — node:fs subset added in Task 2, yaml + schema in Task 3. This kept each commit lint-clean instead of polluting Task 1 with unused-import suppressions."

patterns-established:
  - "Boolean env-var check only (T-31-01): grep enforces exactly one `process.env[` occurrence in the module"
  - "yaml v2 parse + post-parse object guard for prototype-safety (T-31-02)"

requirements-completed: [INIT-01, INIT-03, INIT-04, INIT-05]

duration: 13min
completed: 2026-05-12
---

# Phase 31, Plan 02: init-detectors GREEN Module Summary

**src/cli/init-detectors.ts (260 lines) — provider detection, idempotent gitignore patching, and three-bucket upgrade diff turning all 11 Plan 01 RED tests GREEN**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-05-12T06:49Z
- **Completed:** 2026-05-12T06:53Z
- **Tasks:** 3
- **Files modified:** 1 (created)

## Accomplishments
- 4 exports (`detectProviders`, `cheapestDetected`, `patchGitignore`, `computeUpgradeDiff`) + 3 types
- All 11 unit tests from Plan 01 GREEN; 1 it.skip integration stays skipped for Plan 05
- Locked Codex subscription rank `CODEX_SUBSCRIPTION_RANK = 0.001` per CONTEXT.md D-02
- All five threat-model mitigations verified by grep gates:
  - T-31-01: exactly one `process.env[` read in the module
  - T-31-02: `Array.isArray(raw)` + `typeof raw !== 'object'` guard before iteration; no `passthrough`/`strict`
  - T-31-03: cwd/entries documented as internal-only in JSDoc + comment
  - T-31-04: `AbortSignal.timeout(500)` bounds the Ollama probe
  - T-31-05: `Array.isArray(json.data)` shape validation on Ollama response

## Task Commits

Each task was committed atomically:

1. **Task 1: detectProviders + cheapestDetected** — `30d6c73` (feat)
2. **Task 2: patchGitignore** — `0afe6b0` (feat)
3. **Task 3: computeUpgradeDiff** — `3c0e0fc` (feat)

## Files Created/Modified
- `src/cli/init-detectors.ts` (new) — 260 lines, 4 exports + 3 types, single import block

## Decisions Made
- **Defensive `mkdirSync(cwd, { recursive: true })` in patchGitignore.** Plan 01's memfs tests start with a totally empty volume, so `writeFileSync('/proj/.gitignore', ...)` fails on missing parent dir. The fix preserves the non-fatal envelope (`try`/`catch`) and is conditional on `!existsSync(cwd)`, so it's a no-op in production where `process.cwd()` always exists. Plan 02's tests were the contract — this met them.
- **Incremental import additions per task.** Instead of dumping the full import block in Task 1 and using `void` to silence unused-import warnings, each task added only the imports it used. Task 1: defaults + presets + TokenStore. Task 2: +node:fs, node:path. Task 3: +yaml, schema. Result: clean lint on every commit boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule: Test contract correctness] mkdirSync added inside patchGitignore**
- **Found during:** Task 2 (`patchGitignore` test run)
- **Issue:** 2 of 4 patchGitignore tests failed with ENOENT — memfs's empty-volume starting state has no `/proj` directory, so `writeFileSync('/proj/.gitignore', ...)` fails.
- **Fix:** Added `if (!existsSync(cwd)) mkdirSync(cwd, { recursive: true });` immediately before the write. Stays inside the existing `try`/`catch` so production failures remain non-fatal.
- **Files modified:** `src/cli/init-detectors.ts`
- **Verification:** All 4 patchGitignore tests pass (`0afe6b0`).
- **Committed in:** `0afe6b0`

**2. [Rule: Lint hook compliance] Imports added incrementally instead of upfront**
- **Found during:** Task 1 (planning the commit)
- **Issue:** Plan asked for a single static import block including imports Task 1 doesn't use yet. ESLint `no-unused-vars` would reject the commit.
- **Fix:** Each task adds only the imports it actually uses. Task 1: defaults/presets/TokenStore. Task 2: node:fs subset + node:path. Task 3: yaml + HandoverConfigSchema.
- **Files modified:** `src/cli/init-detectors.ts`
- **Verification:** No lint errors at any commit boundary; final import block is the same surface the plan called for.
- **Committed in:** all three task commits (incremental)

---

**Total deviations:** 2 auto-fixed (1 test-contract correctness, 1 lint compliance)
**Impact on plan:** No scope change; both fixes preserve the documented behavior, trust boundaries, and security gates.

## Issues Encountered
- Initial patchGitignore tests failed due to missing parent dir in memfs (resolved in commit `0afe6b0`). Documented as a deviation rather than a bug — production callers never hit this path because `process.cwd()` is always a real existing directory.

## User Setup Required
None.

## Next Phase Readiness
- Plan 05 (Wave 2) can `import { detectProviders, cheapestDetected, patchGitignore, computeUpgradeDiff } from './init-detectors.js'` and wire them into `runInit()`.
- Plan 03 (monorepo nx/turbo detection) remains independent and parallel-eligible within Wave 1.
- The `it.skip` runInit integration test (line 154 in init-detectors.test.ts) is the activation point for Plan 05.

---
*Phase: 31-init-wizard-action-scaffold*
*Plan: 02*
*Completed: 2026-05-12*
