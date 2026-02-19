---
phase: 08-ci-fix-scorecard-hardening-and-test-infrastructure
plan: 02
subsystem: infra
tags: [github-actions, scorecard, openssf, security, branch-protection, codeowners, dependabot]

# Dependency graph
requires:
  - phase: 08-01
    provides: CI workflow fixed, Dependabot merged, 0.x deps pinned

provides:
  - All 5 GitHub Actions workflows SHA-pinned with permissions: read-all at top level
  - CODEOWNERS file mapping all files to @farce1
  - Dependabot auto-merge workflow for patch/minor updates
  - Branch protection on main with 1 required reviewer, stale review dismissal, code owner reviews
  - Private vulnerability reporting enabled
  - Repository auto-merge enabled

affects: [09-token-counter-tests, 10-config-and-provider-tests, 11-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'All workflow actions pinned to 40-char SHA with version comment'
    - 'permissions: read-all at workflow level, write scoped to jobs that need it'
    - 'CODEOWNERS requires review from @farce1 on all PRs'
    - 'Dependabot patch/minor PRs auto-merged via gh pr merge --auto --squash'

key-files:
  created:
    - .github/CODEOWNERS
    - .github/workflows/automerge.yml
  modified:
    - .github/workflows/ci.yml
    - .github/workflows/codeql.yml
    - .github/workflows/release-please.yml
    - .github/workflows/scorecard.yml

key-decisions:
  - 'dependabot/fetch-metadata v2 resolves to v2.5.0 SHA 21025c705c08248db411dc16f3619e6b5f9ea21a'
  - 'Branch protection enforce_admins=false to avoid repo owner lockout'
  - 'restrictions=null keeps repo open to external contributors (per prior decision)'
  - 'release-please publish job gets contents: read alongside id-token: write'

patterns-established:
  - 'All new workflows must include permissions: read-all at top level'
  - 'All action uses: references must be SHA-pinned with tag comment'

# Metrics
duration: 7min
completed: 2026-02-19
---

# Phase 8 Plan 02: Scorecard Hardening Summary

**All 5 GitHub Actions workflows SHA-pinned with workflow-level `permissions: read-all`, CODEOWNERS
created, branch protection enforced on main, and Dependabot auto-merge workflow added.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-19T20:01:19Z
- **Completed:** 2026-02-19T20:08:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Pinned all 16+ action references across 5 workflows to 40-char SHA hashes with version comments
- Added `permissions: read-all` at workflow level; moved write permissions to job-level where needed
- Created `.github/CODEOWNERS` with `* @farce1` and `.github/ @farce1`
- Created `.github/workflows/automerge.yml` for Dependabot patch/minor PRs
- Enabled branch protection on main: 1 required reviewer, dismiss stale reviews, code owner reviews,
  required status checks for `Quality Gate (Node 20)` and `Quality Gate (Node 22)`
- Enabled private vulnerability reporting and Dependabot vulnerability alerts
- Enabled `allow_auto_merge` on repository via GitHub API

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin actions to SHA, restructure permissions, CODEOWNERS, automerge** - `b438d00` (chore)
2. **Task 2: Branch protection and private vulnerability reporting** - API-only, no files changed

## Files Created/Modified

- `.github/workflows/ci.yml` - Added `permissions: read-all`, SHA-pinned 5 action references
- `.github/workflows/codeql.yml` - Replaced top-level write permissions with `read-all`,
  moved `security-events: write` to `analyze` job, SHA-pinned 4 action references
- `.github/workflows/release-please.yml` - Replaced top-level write permissions with `read-all`,
  added job-level permissions to `release-please` and `publish` jobs, SHA-pinned 3 action references
- `.github/workflows/scorecard.yml` - Added `permissions: read-all`, SHA-pinned 4 action references
- `.github/workflows/automerge.yml` - New: Dependabot patch/minor auto-merge workflow
- `.github/CODEOWNERS` - New: `* @farce1` and `.github/ @farce1`

## Decisions Made

- `dependabot/fetch-metadata` v2 tag resolves to v2.5.0 (SHA `21025c705c08248db411dc16f3619e6b5f9ea21a`)
- `enforce_admins=false` to prevent repo owner lockout while branch protection is active
- `restrictions=null` keeps repository open to external contributors (consistent with prior decision)
- `release-please` publish job needs `contents: read` alongside existing `id-token: write`

## Deviations from Plan

None - plan executed exactly as written. The zsh shell bracket expansion issue for the branch
protection API call was handled inline by switching to `--input` JSON (Rule 3 auto-fix not needed
as it was a command syntax adaptation, not a code bug).

## Issues Encountered

- `gh api --field` with bracket notation (`required_pull_request_reviews[dismiss_stale_reviews]`)
  caused zsh to interpret `[...]` as a glob pattern. Resolved by switching to `--input` JSON.

## User Setup Required

None - all GitHub API changes were applied automatically. Branch protection is now active on main.

Note: The next CI run on any PR will require the `Quality Gate (Node 20)` and
`Quality Gate (Node 22)` status checks to pass before merging.

## Next Phase Readiness

- Repository now scores well on OpenSSF Scorecard: Token-Permissions, Pinned-Dependencies,
  Branch-Protection checks should all pass
- Ready for Phase 8 Plan 03: Test infrastructure setup

---

_Phase: 08-ci-fix-scorecard-hardening-and-test-infrastructure_
_Completed: 2026-02-19_
