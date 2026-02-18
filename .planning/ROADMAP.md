# Roadmap: Handover OSS Excellence

## Overview

Transform handover-cli from a working published tool into a credible open source project. Three sequential phases build on each other: community health files signal the project is safe to contribute to, CI/CD automation gates quality and automates releases, and structured documentation makes the project navigable for humans and LLMs alike. Each phase completes a coherent capability that can be verified independently.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Community Health** - Establish all GitHub community health files so the project appears credible and welcoming to contributors
- [ ] **Phase 2: CI/CD Automation** - Add quality gate workflows, release automation, badges, and dependency management
- [ ] **Phase 3: Docs and LLM Accessibility** - Distill AGENTS.md and PRD.md into structured docs/, add llms.txt, finalize CONTRIBUTING.md

## Phase Details

### Phase 1: Community Health
**Goal**: Any contributor who lands on the repo finds the minimum files needed to understand how to participate, report issues, and submit PRs
**Depends on**: Nothing (first phase)
**Requirements**: COMM-01, COMM-02, COMM-03, COMM-04, COMM-05, COMM-06, COMM-07, COMM-08, COMM-09
**Success Criteria** (what must be TRUE):
  1. A new contributor can find local setup instructions, commit conventions, and PR process in CONTRIBUTING.md without leaving the repo
  2. GitHub's community health checklist (Insights > Community Standards) shows green for CONTRIBUTING, Code of Conduct, Security policy, and Issue templates
  3. Filing a bug report, feature request, or docs improvement issue presents a structured YAML form — blank issues are disabled
  4. Submitting a PR surfaces a checklist (tests pass, changelog updated, docs updated) automatically via PR template
  5. The repo has a Sponsors button linked to GitHub Sponsors via FUNDING.yml
**Plans:** 2 plans

Plans:
- [ ] 01-01-PLAN.md — CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, FUNDING.yml
- [ ] 01-02-PLAN.md — Issue templates (bug, feature, docs, config.yml) and PR template

### Phase 2: CI/CD Automation
**Goal**: Every push and PR runs automated quality checks; releases generate changelogs and publish to npm automatically; the README displays live trust signals via badges
**Depends on**: Phase 1
**Requirements**: CICD-01, CICD-02, CICD-03, CICD-04, CICD-05, CICD-06, CICD-07, CICD-08, CICD-09
**Success Criteria** (what must be TRUE):
  1. Opening a PR triggers a CI workflow that runs lint, typecheck, and build on Node 20 and 22 — unit tests run; integration tests are skipped unless HANDOVER_INTEGRATION is set
  2. Merging to main with conventional commit messages produces a release PR via release-please that bumps the version and updates CHANGELOG.md; merging the release PR publishes to npm automatically
  3. The README displays four working badges: CI status (green), npm version, npm downloads, and license
  4. Dependabot opens weekly PRs for outdated npm dependencies
  5. CodeQL and OpenSSF Scorecard workflows run on schedule and the Scorecard badge appears in the README
**Plans:** 4 plans

Plans:
- [ ] 02-01-PLAN.md — CI quality gate workflow (ci.yml) with Node 20+22 matrix, vitest coverage config with 80% thresholds, Codecov upload
- [ ] 02-02-PLAN.md — Release workflow (release-please.yml) with manifest config, OIDC npm publish, CHANGELOG.md seed
- [ ] 02-03-PLAN.md — ESLint flat config, Prettier, commitlint, husky + lint-staged hooks, Dependabot config
- [ ] 02-04-PLAN.md — Commitlint CI step, CodeQL workflow, OpenSSF Scorecard workflow, README trust signal badges

### Phase 3: Docs and LLM Accessibility
**Goal**: Users find clear how-to guides; contributors find architecture and extension docs; AI assistants find a curated llms.txt index — all content sourced from distilled AGENTS.md and PRD.md
**Depends on**: Phase 2
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05, DOCS-06
**Success Criteria** (what must be TRUE):
  1. A user who installs handover-cli can find getting-started, configuration reference, and provider guide docs in docs/user/ without reading source code
  2. A contributor who wants to add a new provider or analyzer can follow step-by-step guides in docs/contributor/ that reference actual code structure
  3. An AI assistant reading llms.txt at the repo root gets a curated index of 8-12 files covering what handover does, how to use it, and how to extend it
  4. AGENTS.md contains only AI-operational rules (build commands, test commands, conventions, where things live) — all human narrative has moved to docs/contributor/
  5. CONTRIBUTING.md links to real docs/ paths and a first-time contributor can clone, install, run tests, and find a good-first-issue within 15 minutes
**Plans**: TBD

Plans:
- [ ] 03-01: docs/user/ — getting-started.md, configuration.md, providers.md, output-documents.md
- [ ] 03-02: docs/contributor/ — architecture.md, development.md, adding-providers.md, adding-analyzers.md
- [ ] 03-03: AGENTS.md restructure; PRD.md retirement; CONTRIBUTING.md finalization; llms.txt; package.json metadata

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Community Health | 0/2 | Not started | - |
| 2. CI/CD Automation | 0/4 | Not started | - |
| 3. Docs and LLM Accessibility | 0/3 | Not started | - |
