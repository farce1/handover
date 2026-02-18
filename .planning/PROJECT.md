# Handover — OSS Excellence

## What This Is

A project to transform the handover CLI tool from a working product into an industry-leading open source project. Handover is a TypeScript CLI that generates comprehensive, AI-powered codebase documentation through multi-round LLM analysis. This effort focuses on making the repo accessible to three audiences equally: end users who install and run it, contributors who want to improve it, and AI assistants that work within it.

## Core Value

Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

## Requirements

### Validated

- ✓ Comprehensive README with quick start, provider table, CLI reference — existing
- ✓ MIT license — existing
- ✓ Internal architecture docs (AGENTS.md) — existing
- ✓ Product requirements doc (PRD.md) — existing
- ✓ Clean modular architecture — existing
- ✓ 8 LLM provider support — existing
- ✓ npm package published as handover-cli — existing

### Active

- [ ] CONTRIBUTING.md with setup, testing, PR process, architecture overview (distilled from AGENTS.md + PRD.md)
- [ ] GitHub issue templates (bug report, feature request, documentation improvement)
- [ ] GitHub PR template with checklist
- [ ] CI/CD GitHub Actions workflows (lint, typecheck, test, build)
- [ ] CHANGELOG.md with version history
- [ ] CODE_OF_CONDUCT.md (Contributor Covenant)
- [ ] SECURITY.md with vulnerability reporting process
- [ ] In-repo docs/ folder with structured user and contributor documentation
- [ ] llms.txt for machine-readable project description
- [ ] Updated AGENTS.md optimized for LLM consumption (or replacement with llms.txt + docs/)
- [ ] GitHub Sponsors configuration (.github/FUNDING.yml)
- [ ] README badges (npm downloads, CI status, license, coverage)
- [ ] Self-documenting code improvements (clear naming, module-level comments where conventions aren't obvious)

### Out of Scope

- Dedicated docs site (Docusaurus, etc.) — decide later, start with in-repo markdown
- Discord server — not prioritized now
- Project showcase/gallery — future effort
- New CLI features — this is purely about OSS infrastructure and documentation
- Major code refactoring — only touch code for clarity, not architecture changes

## Context

- Handover is at v0.1.0, early stage but functional and published on npm
- Architecture is solid: DAG orchestrator, 8 static analyzers, 6 AI rounds, 14 document renderers, Zod-first domain model
- AGENTS.md (internal dev guide) and PRD.md (90KB product requirements) contain rich content that should be distilled into proper contributor docs rather than maintained as monolithic files
- README is already comprehensive — keep it, add links to new docs and community features
- .planning/ is currently gitignored — planning docs stay local
- Integration tests require API keys (HANDOVER_INTEGRATION=1) — CI needs to handle this gracefully

## Constraints

- **In-repo docs**: All documentation lives in the repo as markdown — no external docs site yet
- **No breaking changes**: README structure stays largely the same, just add links
- **Distill, don't duplicate**: AGENTS.md and PRD.md content gets restructured into new docs, originals retired
- **LLM-first**: All docs should be structured for both human and machine readability (clear headings, no ambiguous references, self-contained sections)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| In-repo markdown over docs site | Lower maintenance, LLMs read markdown natively, can migrate later | — Pending |
| Distill AGENTS.md + PRD.md into structured docs | Single-source-of-truth docs, retire monolithic files | — Pending |
| Keep README, add links | README is already good — additive changes only | — Pending |
| GitHub Sponsors over other funding | Native GitHub integration, low friction | — Pending |
| Badges for social proof | npm downloads, CI status, license — standard for credible OSS | — Pending |
| llms.txt standard | Emerging standard for LLM-friendly project descriptions | — Pending |

---
*Last updated: 2026-02-18 after initialization*
