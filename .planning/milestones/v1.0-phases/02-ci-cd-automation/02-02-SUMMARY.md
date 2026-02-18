---
phase: 02-ci-cd-automation
plan: '02'
subsystem: infra
tags: [release-please, npm, oidc, github-actions, changelog, conventional-commits]

# Dependency graph
requires:
  - phase: 01-community-health
    provides: conventional commit standards established in CONTRIBUTING.md
provides:
  - Release automation workflow via googleapis/release-please-action@v4
  - OIDC npm publish (no NPM_TOKEN needed) with provenance attestation
  - Manifest-based release config tracking root package at v0.1.0
  - CHANGELOG.md seeded and ready for release-please to append
affects: [npm-publishing, versioning, release-process]

# Tech tracking
tech-stack:
  added: [googleapis/release-please-action@v4, actions/checkout@v4, actions/setup-node@v4]
  patterns: [manifest-config-release-please, oidc-npm-publish, conditional-publish-job]

key-files:
  created:
    - .github/workflows/release-please.yml
    - release-please-config.json
    - .release-please-manifest.json
    - CHANGELOG.md
  modified: []

key-decisions:
  - 'Manifest config over standalone release-please (official recommendation, more flexible)'
  - 'PAT (RELEASE_PLEASE_TOKEN) over GITHUB_TOKEN so CI triggers on release PRs'
  - 'OIDC trusted publishing over NPM_TOKEN (no long-lived secrets, provenance included)'
  - 'bump-minor-pre-major + bump-patch-for-minor-pre-major: conservative versioning while at v0.x'
  - 'No pre-release channel: project too early, no beta audience'
  - 'npm install -g npm@latest before publish: OIDC requires npm >= 11.5.1, runners may ship older'
  - 'CHANGELOG.md seeded with header only: no retroactive entries per user decision'

patterns-established:
  - 'Conditional publish job: only runs when release_created output is true'
  - 'Separate job permissions: write-all on release job, id-token:write only on publish job'

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 2 Plan 02: Release Automation Summary

**release-please manifest config + GitHub Actions OIDC npm publish pipeline: conventional commits to main produce a release PR; merging it publishes to npm with provenance, no long-lived secrets**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T11:57:51Z
- **Completed:** 2026-02-18T12:00:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Release-please manifest config created for root package as Node type at v0.1.0
- Full release automation workflow: push to main creates/updates release PR via release-please
- OIDC npm publish on release PR merge — no NPM_TOKEN, provenance attestation included
- CHANGELOG.md seeded ready for release-please to append version entries

## Task Commits

Each task was committed atomically:

1. **Task 1: Create release-please manifest config files** - `cf21469` (chore)
2. **Task 2: Create release-please workflow with OIDC npm publish** - `a41c80a` (chore)

## Files Created/Modified

- `.github/workflows/release-please.yml` - Release automation: release-please job + conditional OIDC publish job
- `release-please-config.json` - Manifest config: root package as node type, v0.x bump rules
- `.release-please-manifest.json` - Version tracking: root package at 0.1.0
- `CHANGELOG.md` - Changelog seed with header, no retroactive entries

## Decisions Made

- Manifest config over standalone release-please (googleapis officially recommends manifest even for single package repos)
- PAT (RELEASE_PLEASE_TOKEN) required instead of GITHUB_TOKEN — GITHUB_TOKEN cannot trigger CI on release PRs by design
- OIDC trusted publishing: id-token:write permission + --provenance flag, no NPM_TOKEN secret needed
- bump-minor-pre-major + bump-patch-for-minor-pre-major: feat: bumps patch not minor, feat!: bumps minor not major while < 1.0.0
- npm install -g npm@latest before publish: OIDC trusted publishing requires npm >= 11.5.1; GitHub runners may ship older versions
- No pre-release channel configured: project too early stage, no beta audience

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

Two external configuration steps are required before the release workflow will function:

1. **npm trusted publishing:** On npmjs.com, navigate to handover-cli > Settings > Publishing access > Add trusted publisher > GitHub Actions. Link the package to this repository so OIDC authentication succeeds.

2. **GitHub PAT:** Create a fine-grained personal access token with `contents:write`, `pull-requests:write`, and `issues:write` permissions scoped to farce1/handover. Add it as a repository secret named `RELEASE_PLEASE_TOKEN`.

Without these, the workflow will fail: release-please cannot create PRs without the PAT, and npm publish will be rejected without trusted publishing configured.

## Next Phase Readiness

- Release automation complete; next plan (02-03) can add branch protection and CI status checks
- No blockers from this plan

---

_Phase: 02-ci-cd-automation_
_Completed: 2026-02-18_
