---
phase: 02-ci-cd-automation
plan: 04
subsystem: infra
tags: [github-actions, commitlint, codeql, ossf-scorecard, sarif, badges, shields.io]

# Dependency graph
requires:
  - phase: 02-01
    provides: CI quality gate workflow (ci.yml base to extend with commitlint job)
  - phase: 02-03
    provides: commitlint.config.js (conventional commit rules that CI validates)
provides:
  - Commitlint CI validation job on PRs (fetch-depth: 0, SHA range)
  - CodeQL security scanning workflow for javascript-typescript
  - OpenSSF Scorecard workflow with published results and SARIF upload
  - README with seven trust signal badges (CI, npm version, license, downloads, coverage, Scorecard, CodeQL)
affects: [03-documentation]

# Tech tracking
tech-stack:
  added: ['github/codeql-action@v4', 'ossf/scorecard-action@v2.4.3', 'actions/upload-artifact@v4']
  patterns:
    - 'Scorecard workflow: no top-level env/defaults/permissions — job-level permissions only'
    - 'CodeQL + Scorecard both upload SARIF to GitHub security tab via upload-sarif'
    - 'Commitlint CI gate: fetch-depth: 0 required for git history traversal'
    - 'Weekly offsets: CodeQL Monday 3am UTC, Scorecard Monday 4am UTC (avoid concurrency)'

key-files:
  created:
    - .github/workflows/codeql.yml
    - .github/workflows/scorecard.yml
  modified:
    - .github/workflows/ci.yml
    - README.md

key-decisions:
  - 'CodeQL scans javascript-typescript only (not actions) — TS/JS code is the security surface'
  - 'Scorecard job-level permissions only — scorecard-action v2 enforces strict isolation'
  - 'publish_results: true enables the Scorecard badge on scorecard.dev'
  - 'All badges use shields.io for-the-badge style for visual consistency'
  - 'Scorecard weekly at 4am UTC (offset 1h from CodeQL at 3am UTC) to avoid concurrency'

patterns-established:
  - 'Security scanning: CodeQL + Scorecard both target GitHub security tab via SARIF'
  - 'Badge block: all seven trust signals in single centered <p> block in README'

# Metrics
duration: 2min
completed: 2026-02-18
---

# Phase 2 Plan 4: Security Scanning and Trust Badges Summary

**Commitlint CI gate (fetch-depth: 0), CodeQL javascript-typescript scanning, OpenSSF Scorecard with SARIF upload, and seven shields.io trust badges in README**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-18T12:07:50Z
- **Completed:** 2026-02-18T12:09:15Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `commitlint` job to `ci.yml` — validates PR commit messages using full git history (fetch-depth: 0) against the conventional commit config established in plan 02-03
- Created `codeql.yml` — scans javascript-typescript on push to main, PRs to main, and weekly (Monday 3am UTC); results uploaded to GitHub security tab
- Created `scorecard.yml` — runs on push to main and weekly (Monday 4am UTC) with strict job-level permissions, publish_results: true for badge, SARIF upload to GitHub security tab
- Updated README with three new badges: coverage (Codecov), OpenSSF Scorecard, CodeQL — total seven trust signal badges all using consistent for-the-badge style

## Task Commits

Each task was committed atomically:

1. **Task 1: Add commitlint CI step and security scanning workflows** - `3a6a6e1` (feat)
2. **Task 2: Add trust signal badges to README** - `81efa60` (feat)

**Plan metadata:** _(created after self-check)_ (docs: complete plan)

## Files Created/Modified

- `.github/workflows/ci.yml` - Added commitlint job before quality job (runs on PRs only)
- `.github/workflows/codeql.yml` - CodeQL security scanning for javascript-typescript
- `.github/workflows/scorecard.yml` - OpenSSF Scorecard with publish_results and SARIF upload
- `README.md` - Added coverage, Scorecard, and CodeQL badges (total: 7 badges)

## Decisions Made

- CodeQL language set to `javascript-typescript` only — this is the security surface area; Actions files don't warrant separate scanning
- Scorecard workflow uses job-level permissions only (no top-level `permissions:`, `env:`, or `defaults:`) — required by scorecard-action v2's strict isolation
- `publish_results: true` is required to enable the live Scorecard badge on scorecard.dev
- `persist-credentials: false` on checkout is required by scorecard-action
- Weekly schedules offset by 1 hour (CodeQL 3am, Scorecard 4am) to prevent concurrency issues
- All README badges use `shields.io` with `for-the-badge` style to match the existing four badges

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- First commit attempt failed commitlint body-max-line-length (100 char limit). Fixed by shortening body lines. No plan deviation — this is the commitlint tooling working as intended.

## User Setup Required

None - no external service configuration required beyond what was already documented in plan 02-01 (CODECOV_TOKEN). Scorecard and CodeQL use GitHub's built-in OIDC and permissions.

Note: For Scorecard badge to display, the workflow must run at least once on main after being pushed. The badge will show "unknown" until first run completes.

## Next Phase Readiness

- Phase 2 CI/CD automation is complete — all four plans executed
- Phase 3 (documentation) can proceed: the CI trust layer (quality gate, release automation, linting, security scanning) is fully in place
- README now has full badge coverage for project health signals

---

## Self-Check: PASSED

All created files and commits verified:

- `.github/workflows/ci.yml` — exists (commitlint job added)
- `.github/workflows/codeql.yml` — exists
- `.github/workflows/scorecard.yml` — exists
- `README.md` — exists (7 badges confirmed)
- `.planning/phases/02-ci-cd-automation/02-04-SUMMARY.md` — exists
- Commit `3a6a6e1` — Task 1 (workflows)
- Commit `81efa60` — Task 2 (README badges)

---

_Phase: 02-ci-cd-automation_
_Completed: 2026-02-18_
