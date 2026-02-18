---
phase: 01-community-health
plan: 02
subsystem: community
tags: [github, issue-templates, yaml-forms, pr-template, labels]

# Dependency graph
requires: []
provides:
  - "Three YAML issue form templates: bug report, feature request, docs improvement"
  - "Template chooser config.yml disabling blank issues"
  - "PR body template auto-populating quality checklist on every PR"
  - "All three GitHub labels verified: bug, enhancement, documentation"
affects: [01-03-community-health, contributing-docs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GitHub YAML form syntax for structured issue intake"
    - "Template chooser config.yml redirecting non-template issues to Discussions"
    - "Conventional Commits types reflected in PR template Type of Change checkboxes"

key-files:
  created:
    - ".github/ISSUE_TEMPLATE/bug.yml"
    - ".github/ISSUE_TEMPLATE/feature.yml"
    - ".github/ISSUE_TEMPLATE/docs.yml"
    - ".github/ISSUE_TEMPLATE/config.yml"
    - ".github/pull_request_template.md"
  modified: []

key-decisions:
  - "Used .yml extension (not .yaml) — GitHub requires .yml for issue form templates"
  - "Blank issues disabled via config.yml; non-issue questions redirected to GitHub Discussions"
  - "documentation label created via gh CLI (bug and enhancement exist by default)"

patterns-established:
  - "YAML form templates: each template has id on every non-markdown field, validations.required on mandatory fields"
  - "Auto-labeling: labels field at top level of each template YAML"

# Metrics
duration: 1min
completed: 2026-02-18
---

# Phase 1 Plan 02: Issue Templates and PR Template Summary

**Three YAML issue form templates (bug/feature/docs) with auto-labeling, blank issues disabled, and a PR checklist template covering tests, typecheck, docs, changelog, and commit format**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-18T09:45:38Z
- **Completed:** 2026-02-18T09:46:48Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Bug report YAML form with 7 required-field validations (steps, expected, actual, version, OS, Node.js) plus optional logs — auto-labels `bug`
- Feature request YAML form with problem/solution structure — auto-labels `enhancement`
- Docs improvement YAML form with location and problem fields — auto-labels `documentation`
- config.yml disables blank issues, redirects to GitHub Discussions
- PR template with Summary, Type of Change, Checklist (10 items), and Testing Notes sections

## Task Commits

Each task was committed atomically:

1. **Task 1: Create issue templates and config** - `955a453` (feat)
2. **Task 2: Create PR template** - `1dca9fa` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `.github/ISSUE_TEMPLATE/bug.yml` - Bug report YAML form with required steps/expected/actual/version/OS/Node.js fields; auto-labels `bug`
- `.github/ISSUE_TEMPLATE/feature.yml` - Feature request YAML form with problem/solution fields; auto-labels `enhancement`
- `.github/ISSUE_TEMPLATE/docs.yml` - Docs improvement YAML form with location/problem fields; auto-labels `documentation`
- `.github/ISSUE_TEMPLATE/config.yml` - Blank issues disabled; contact link to GitHub Discussions
- `.github/pull_request_template.md` - PR checklist with tests, typecheck, docs, changelog, and Conventional Commits items

## Decisions Made
- Used `.yml` extension per GitHub's requirement for YAML issue form templates (not `.yaml`)
- `documentation` label created via `gh label create --force`; `bug` and `enhancement` exist by default on new repos
- Blank issues disabled so all contributor issues are structured and contain required context
- PR checklist references `npm test` and `npm run typecheck` to match the project's actual scripts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. All GitHub label and template configuration is automatic upon push.

## Next Phase Readiness
- Issue templates are live once pushed — GitHub reads `.github/ISSUE_TEMPLATE/` from the default branch
- PR template auto-populates on every new PR opened after merge
- Phase 01-03 (FUNDING.yml) can proceed; Sponsors account status blocker noted in STATE.md

---
*Phase: 01-community-health*
*Completed: 2026-02-18*
