# Handover — OSS Excellence

## What This Is

An open source TypeScript CLI that generates comprehensive, AI-powered codebase documentation through multi-round LLM analysis. The v1.0 OSS milestone shipped community health files, CI/CD automation, release pipelines, and structured documentation for users, contributors, and AI assistants.

## Core Value

Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

## Requirements

### Validated

- ✓ Comprehensive README with quick start, provider table, CLI reference — existing
- ✓ MIT license — existing
- ✓ Clean modular architecture — existing
- ✓ 8 LLM provider support — existing
- ✓ npm package published as handover-cli — existing
- ✓ CONTRIBUTING.md with setup, testing, PR process, architecture links — v1.0
- ✓ GitHub issue templates (bug, feature, docs) with YAML forms — v1.0
- ✓ GitHub PR template with quality checklist — v1.0
- ✓ CI/CD workflows: lint, typecheck, test, build on Node 20+22 — v1.0
- ✓ CHANGELOG.md seeded for release-please — v1.0
- ✓ CODE_OF_CONDUCT.md (Contributor Covenant v2.1) — v1.0
- ✓ SECURITY.md with private vulnerability reporting — v1.0
- ✓ docs/user/ with getting-started, configuration, providers, output-documents — v1.0
- ✓ docs/contributor/ with architecture, development, adding-providers, adding-analyzers — v1.0
- ✓ llms.txt with 11-entry AI-readable project index — v1.0
- ✓ AGENTS.md restructured to 60-line AI-ops rules — v1.0
- ✓ PRD.md content distilled into docs/, original retired — v1.0
- ✓ FUNDING.yml for GitHub Sponsors — v1.0
- ✓ README badges: CI, npm version, downloads, license, coverage, Scorecard, CodeQL — v1.0
- ✓ Release automation: release-please with OIDC npm publish — v1.0
- ✓ DX tooling: ESLint, Prettier, commitlint, husky, Dependabot — v1.0
- ✓ Security scanning: CodeQL + OpenSSF Scorecard — v1.0

### Active

- [ ] Caching and incremental analysis — skip re-analysis for unchanged files
- [ ] Parallel analyzer execution — run analyzers concurrently
- [ ] Streaming output with live progress — no blank terminal staring
- [ ] Smarter LLM usage — fewer round trips, less redundant context, lower token costs
- [ ] Faster CLI startup — reduce initialization overhead
- [ ] Large repo scaling — handle big codebases without choking
- [ ] Output quality preserved — smarter, not degraded

## Current Milestone: v2.0 Performance

**Goal:** Full performance overhaul — make handover fast, responsive, and cost-efficient at any repo size.

**Target features:**

- Caching & incremental analysis (unchanged files skip re-analysis)
- Parallel analyzer execution
- Streaming output with live progress
- Smarter LLM usage (fewer rounds, reduced token costs)
- Faster startup time
- Large repo scaling
- Measurable benchmarks (2-5x faster, 50%+ fewer tokens on incremental runs)

### Out of Scope

- Dedicated docs site (Docusaurus, etc.) — in-repo markdown works well for LLMs; revisit when user base demands it
- Discord server — GitHub Discussions sufficient for current scale
- Project showcase/gallery — future effort
- New CLI features — this milestone was purely OSS infrastructure
- Major code refactoring — architecture is solid as-is

## Context

- Handover is at v0.1.0, early stage but functional and published on npm
- v1.0 OSS milestone shipped: 3 phases, 9 plans, 239 files, 49K lines added over 3 days
- Architecture: DAG orchestrator, 8 static analyzers, 6 AI rounds, 14 document renderers, Zod-first domain model
- CI runs on every PR; release-please automates versioning; OIDC publishes to npm with provenance
- Documentation: 4 user guides, 4 contributor guides, llms.txt, restructured AGENTS.md
- External setup still needed: CODECOV_TOKEN, RELEASE_PLEASE_TOKEN (PAT), npm trusted publishing OIDC config, GitHub Sponsors enrollment

## Constraints

- **In-repo docs**: All documentation lives in the repo as markdown — no external docs site yet
- **No breaking changes**: README structure preserved, additive changes only
- **LLM-first**: All docs structured for both human and machine readability

## Key Decisions

| Decision                                        | Rationale                                                              | Outcome |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ------- |
| In-repo markdown over docs site                 | Lower maintenance, LLMs read markdown natively, can migrate later      | ✓ Good  |
| Distill AGENTS.md + PRD.md into structured docs | Single-source-of-truth docs, retire monolithic files                   | ✓ Good  |
| Keep README, add links and badges               | README was already good — additive changes only                        | ✓ Good  |
| GitHub Sponsors over other funding              | Native GitHub integration, low friction                                | ✓ Good  |
| Badges for social proof                         | npm downloads, CI status, license, coverage, security — 7 badges total | ✓ Good  |
| llms.txt standard                               | Emerging standard for LLM-friendly project descriptions; 11 entries    | ✓ Good  |
| release-please over semantic-release            | PR-based review gate before npm publish; manifest config               | ✓ Good  |
| OIDC trusted publishing over NPM_TOKEN          | No long-lived secrets, provenance attestation included                 | ✓ Good  |
| ESLint flat config + Prettier                   | Modern config format; Prettier as single formatting authority          | ✓ Good  |
| Semicolons required (semi: true)                | Prettier enforces; AGENTS.md updated to match                          | ✓ Good  |
| CodeQL + OpenSSF Scorecard                      | Security scanning + supply chain trust signal                          | ✓ Good  |
| Dependabot grouped PRs                          | Production vs dev grouping reduces maintainer noise                    | ✓ Good  |

---

_Last updated: 2026-02-18 after v2.0 milestone started_
