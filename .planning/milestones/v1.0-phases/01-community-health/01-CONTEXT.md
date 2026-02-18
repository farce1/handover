# Phase 1: Community Health - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish all GitHub community health files so the project appears credible and welcoming to contributors. Deliverables: CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, issue templates (bug, feature, docs) with config.yml, PR template, and FUNDING.yml. No CI/CD, no documentation content, no tooling changes.

</domain>

<decisions>
## Implementation Decisions

### Contribution workflow

- Conventional Commits format (feat:, fix:, docs:, chore:) — aligns with release-please in Phase 2
- Community reviewers welcome; contributors encouraged to review each other's PRs, maintainer does final merge
- CONTRIBUTING.md includes full walkthrough: clone, install, run tests, lint, build — beginner-friendly
- Branch naming convention: type prefix (feat/description, fix/description, docs/description) matching commit types

### Issue template design

- Three YAML-form templates: bug report, feature request, docs improvement
- Blank issues disabled via config.yml — all issues must use a template
- Bug report required fields: steps to reproduce, expected vs actual behavior, version, OS/environment; optional: screenshots, logs
- Each template auto-assigns its label (bug, enhancement, documentation)

### Security & conduct

- Contributor Covenant v2.1 as the Code of Conduct
- Vulnerability reporting via GitHub's built-in private vulnerability reporting (no email)
- Response timeline: best effort — no specific SLA commitment
- Security fixes for latest published version only

### Claude's Discretion

- PR template checklist items and formatting
- Feature request and docs improvement template field design
- CONTRIBUTING.md section ordering and tone
- FUNDING.yml platform configuration
- Code of Conduct contact method details

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 01-community-health_
_Context gathered: 2026-02-18_
