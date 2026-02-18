# Phase 2: CI/CD Automation - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Every push and PR runs automated quality checks; releases generate changelogs and publish to npm automatically; the README displays live trust signals via badges. Covers CI workflows, release-please automation, code quality tooling (hooks/linting/formatting), dependency management, and security scanning.

</domain>

<decisions>
## Implementation Decisions

### CI strictness

- Node matrix: 20 + 22 (LTS only)
- Full quality gate on PRs: lint + typecheck + tests + build must all pass to merge
- Test coverage threshold: 80% minimum — blocks PRs that drop below
- Integration tests: skip unless `HANDOVER_INTEGRATION` env var is set (maintainer/nightly opt-in)

### Release flow

- Fully automatic: merge release-please PR → npm publish via OIDC, no manual step
- CHANGELOG.md starts fresh from next release — no retroactive entries
- release-please takes over changelog generation from conventional commits

### DX tooling

- Pre-commit hooks: husky + lint-staged runs ESLint fix and Prettier on staged files (auto-corrects)
- Commitlint: enforce conventional commits — reject non-conforming commit messages
- Prettier: add fresh — install and configure with standard settings, format entire codebase
- Dependabot: weekly PRs, grouped by type (one PR for production deps, one for dev deps)

### Trust signals

- Badges: CI status, npm version, npm downloads, license, Scorecard, CodeQL, coverage
- Coverage reporting service: Claude's discretion (Codecov or Coveralls — pick best fit for OSS)

### Claude's Discretion

- Pre-release channel (beta) — decide based on project maturity and need
- release-please config pattern (standalone vs manifest) — pick what fits current repo structure
- CodeQL scan scope (TS/JS only vs also Actions workflows) — decide based on value
- Badge placement in README — fit with existing structure
- Coverage service choice (Codecov vs Coveralls)

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

_Phase: 02-ci-cd-automation_
_Context gathered: 2026-02-18_
