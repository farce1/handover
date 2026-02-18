# Requirements: Handover OSS Excellence

**Defined:** 2026-02-18
**Core Value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

## v1 Requirements

Requirements for the OSS excellence milestone. Each maps to roadmap phases.

### Community Health

- [ ] **COMM-01**: CONTRIBUTING.md exists with local setup, test commands, PR process, commit conventions, and architecture overview (distilled from AGENTS.md + PRD.md)
- [ ] **COMM-02**: GitHub issue template for bug reports using YAML form syntax with structured fields
- [ ] **COMM-03**: GitHub issue template for feature requests using YAML form syntax
- [ ] **COMM-04**: GitHub issue template for documentation improvements using YAML form syntax
- [ ] **COMM-05**: Issue template config.yml disables blank issues and links to discussions
- [ ] **COMM-06**: GitHub PR template with checklist (tests pass, changelog updated, docs updated)
- [ ] **COMM-07**: CODE_OF_CONDUCT.md using Contributor Covenant v2.1
- [ ] **COMM-08**: SECURITY.md with private vulnerability reporting instructions via GitHub
- [ ] **COMM-09**: .github/FUNDING.yml configured for GitHub Sponsors

### CI/CD & Automation

- [ ] **CICD-01**: GitHub Actions CI workflow: lint, typecheck, build on Node 20+22 matrix
- [ ] **CICD-02**: CI workflow runs tests with integration tests gated behind HANDOVER_INTEGRATION env var
- [ ] **CICD-03**: Conventional commits enforced via commitlint in CI
- [ ] **CICD-04**: CHANGELOG.md seeded with version history following Keep a Changelog format
- [ ] **CICD-05**: README badges: CI status, npm version, npm downloads, license
- [ ] **CICD-06**: Automated npm publish workflow triggered on GitHub Release via OIDC
- [ ] **CICD-07**: Dependabot configuration for npm ecosystem with weekly schedule
- [ ] **CICD-08**: CodeQL security scanning workflow for JavaScript/TypeScript
- [ ] **CICD-09**: OpenSSF Scorecard GitHub Actions workflow with badge in README

### Documentation & LLM Accessibility

- [ ] **DOCS-01**: docs/user/ folder with getting started guide, configuration reference, and provider guide
- [ ] **DOCS-02**: docs/contributor/ folder with architecture overview, development workflow, and adding providers guide
- [ ] **DOCS-03**: AGENTS.md restructured for LLM parsing: build commands, test commands, conventions, PR process
- [ ] **DOCS-04**: llms.txt at repo root indexing key documentation files
- [ ] **DOCS-05**: AGENTS.md and PRD.md content distilled into docs/ — originals retired or reduced to stubs
- [ ] **DOCS-06**: package.json updated with bugs URL and homepage field

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Community

- **COMM-10**: GitHub Discussions enabled for community Q&A
- **COMM-11**: CODEOWNERS file when second maintainer joins

### Automation

- **CICD-10**: Semantic-release for fully automated versioning (after v1.0)
- **CICD-11**: SBOM generation for supply chain transparency

### Documentation

- **DOCS-07**: Dedicated docs site (Docusaurus/VitePress) when user base demands it
- **DOCS-08**: Project showcase/gallery of repos documented with handover

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Discord/Slack server | Moderation overhead; GitHub Discussions achieves 80% of the value |
| Docs site (Docusaurus, etc.) | Maintenance overhead; in-repo markdown serves LLMs better at this stage |
| New CLI features | This milestone is purely OSS infrastructure |
| Major code refactoring | Only touch code for clarity, not architecture changes |
| Monorepo tooling (Nx, Turborepo) | Not a monorepo, irrelevant complexity |
| Label management tooling | GitHub defaults sufficient for single maintainer |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| COMM-01 | TBD | Pending |
| COMM-02 | TBD | Pending |
| COMM-03 | TBD | Pending |
| COMM-04 | TBD | Pending |
| COMM-05 | TBD | Pending |
| COMM-06 | TBD | Pending |
| COMM-07 | TBD | Pending |
| COMM-08 | TBD | Pending |
| COMM-09 | TBD | Pending |
| CICD-01 | TBD | Pending |
| CICD-02 | TBD | Pending |
| CICD-03 | TBD | Pending |
| CICD-04 | TBD | Pending |
| CICD-05 | TBD | Pending |
| CICD-06 | TBD | Pending |
| CICD-07 | TBD | Pending |
| CICD-08 | TBD | Pending |
| CICD-09 | TBD | Pending |
| DOCS-01 | TBD | Pending |
| DOCS-02 | TBD | Pending |
| DOCS-03 | TBD | Pending |
| DOCS-04 | TBD | Pending |
| DOCS-05 | TBD | Pending |
| DOCS-06 | TBD | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 0
- Unmapped: 24 ⚠️

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after initial definition*
