# Project Research Summary

**Project:** handover-cli — OSS infrastructure and developer experience
**Domain:** OSS CLI Tool — documentation, CI/CD, contributor experience, LLM-friendliness
**Researched:** 2026-02-18
**Confidence:** HIGH

## Executive Summary

handover-cli is a published TypeScript CLI tool that already works and ships on npm. The goal of this research cycle is not to build the product — it is to transform a working tool into a credible open source project that welcomes contributors, surfaces itself to AI coding assistants, and sustains quality through automation. The research across all four areas converges on a single recommendation: build the OSS infrastructure in three sequential phases (community health baseline, CI/CD automation, docs and LLM accessibility), each building on the last, with strict discipline against over-engineering at this stage.

The recommended approach is straightforward because the domain is well-documented. GitHub's community health file system, GitHub Actions CI/CD patterns, and conventional commits tooling are all mature and have clear correct answers. The only genuinely new element is LLM accessibility infrastructure (llms.txt, AGENTS.md optimization), which is an emerging standard with real adoption but less prescriptive guidance. The architecture research is particularly clear: files go in `.github/` for community health, `docs/user/` and `docs/contributor/` for audience-segmented docs, and two separate workflow files for CI versus publish. The most important architectural decision is distilling AGENTS.md and PRD.md into structured documents rather than leaving monolithic files that neither humans nor LLMs can navigate efficiently.

The dominant risk is not technical — it is scope. handover-cli has rich existing internal docs (AGENTS.md at 105+ lines, a 90KB PRD.md) that create the temptation to build elaborate documentation structures before any external contributors exist. The pitfalls research is emphatic: build documentation in proportion to audience. For a v0.1.0 project with zero known external contributors, the correct scope is community health baseline plus CI plus structured docs. Defer VitePress, docs sites, GOVERNANCE.md, CODEOWNERS, and semantic release automation until the project demonstrates demand for them. The 15-minute test governs every decision: can a new contributor clone, install, run tests, and find their first issue in 15 minutes? If a file doesn't serve that test, it's premature.

## Key Findings

### Recommended Stack

The OSS infrastructure stack is fully settled. The runtime stack (TypeScript, Commander.js, Vitest, tsup) is unchanged — this research covers the wrapper layer only. For CI/CD: GitHub Actions with `actions/checkout@v4`, `actions/setup-node@v4`, and a Node.js matrix of 20 and 22 (both current LTS; Node 18 reached EOL April 2025). For release automation: `googleapis/release-please-action@v4` with `release-type: node` — the PR-based workflow adds a human review gate before each npm publish, which is the right choice for a small-team project. For commit quality: `husky@9.1.7` + `@commitlint/cli@20.4.1` + `lint-staged@16.2.7` + `prettier@3.8.1`. For linting: `eslint@10.0.0` with `typescript-eslint@8.56.0` (the unified package, not the old split packages). For coverage: `codecov/codecov-action@v5`. All versions verified via npm registry.

**Core technologies:**
- `googleapis/release-please-action@v4`: changelog automation and release PRs — PR-based review gate before npm publish; replaces archived `google-github-actions` org
- `husky@9` + `@commitlint/config-conventional`: enforce conventional commits locally — directly enables release-please automation
- `lint-staged@16` + `prettier@3.8.1`: format only staged files on commit — keeps contributor PRs clean without slow full-repo checks
- `eslint@10` + `typescript-eslint@8.56.0`: flat config linting — ESLint v10 drops `.eslintrc.*`; use `eslint.config.mjs`
- `codecov/codecov-action@v5`: coverage reporting — free for OSS; integrates with Vitest LCOV output
- `llms.txt` spec v1: LLM-friendly project manifest — adopted by Anthropic, Cursor, LangChain; directly aligned with handover's domain

**What NOT to use:**
- `google-github-actions/release-please-action` — archived August 2024; use `googleapis/` org
- `standard-version` — unmaintained since 2022
- `semantic-release` at this stage — auto-publishes with no checkpoint; wrong for solo/small team
- `.eslintrc.json` / `.eslintrc.js` — deprecated format dropped in ESLint v10
- `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` separately — old pattern; use unified `typescript-eslint@8`
- VitePress or Docusaurus at launch — 4-6 hour setup with deployment overhead; defer until user base demands it

### Expected Features

The features research separates three categories with clear prioritization. The "MVP" for this project is the minimum set that takes handover-cli from "published tool" to "credible OSS project that welcomes contributors."

**Must have — table stakes (P1):**
- CONTRIBUTING.md — unblocks all contributors; without it contributors don't know where to start
- GitHub issue templates (bug, feature, docs) + config.yml — YAML form syntax enforces structure; prevents noise issues
- GitHub PR template — sets review expectations before submission
- CODE_OF_CONDUCT.md — Contributor Covenant v2.1; customize enforcement section (not boilerplate)
- SECURITY.md — GitHub private advisory workflow; realistic SLA for solo maintainer
- CI: lint + typecheck + build + tests (with integration gate) — gating contributions on passing CI
- CHANGELOG.md — seeded with v0.1.0 entry in prose, maintained manually until conventional commits discipline is established
- .github/FUNDING.yml — GitHub Sponsors button; one line
- docs/ folder with user/ and contributor/ subdirectories — distilled from existing AGENTS.md and PRD.md
- llms.txt — directly aligned with handover's value proposition; adds after docs exist
- AGENTS.md optimization — restructure for AI agent operational consumption, not human reading

**Should have — differentiators (P2):**
- Dependabot configuration — automated dependency security; low effort
- Automated npm publish workflow — reduce release friction; use after CI is proven
- CodeQL security scanning — GitHub provides free; improves OpenSSF Scorecard
- OpenSSF Scorecard badge + workflow — enterprise trust signal

**Defer to v2+ (P3):**
- Conventional commits enforcement in CI — enforce after manual habit established over 3+ releases
- GitHub Discussions — only when community activity warrants infrastructure
- Dedicated docs site (VitePress/Docusaurus) — add only when markdown navigation becomes insufficient
- CODEOWNERS — only when second maintainer joins
- Semantic release automation — only after multiple contributors and established commit discipline

### Architecture Approach

The OSS infrastructure architecture has four distinct layers: a README/entry layer for first-contact users, a `.github/` layer for contributor community health, an LLM accessibility layer (llms.txt, AGENTS.md), and a `docs/` layer segmented by audience. These layers communicate strictly forward — README links to docs/, CONTRIBUTING.md links to docs/contributor/, never backward. The critical architectural decision is the build order: CI workflows come first (so all subsequent work is validated automatically), then community health files, then docs/ distillation, then llms.txt last (because it indexes docs that must exist first).

**Major components:**
1. `.github/` layer — community health files (CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, FUNDING.yml, ISSUE_TEMPLATE/, PULL_REQUEST_TEMPLATE.md) and CI workflows
2. `docs/user/` layer — getting-started.md, configuration.md, providers.md, output-documents.md; answers "how do I use this?"
3. `docs/contributor/` layer — architecture.md, development.md, adding-providers.md, adding-analyzers.md; answers "how does this work?"
4. LLM accessibility layer — llms.txt at root (curated index of 8-12 files max), AGENTS.md revised to AI-operational rules only
5. CI layer — `ci.yml` (quality gate on every push/PR), `release.yml` (publish on release PR merge)

**Key pattern: docs/ audience segmentation.** `docs/user/` and `docs/contributor/` are strictly separate — no cross-links. A user looking for provider setup should never encounter DAG orchestrator internals. A contributor reading architecture docs should not need to wade through end-user configuration docs.

**Key pattern: AGENTS.md vs CONTRIBUTING.md distinction.** CONTRIBUTING.md is human-facing onboarding (setup, PR process, links). AGENTS.md is machine-facing operational rules (what to do, what not to do, where things live). Both must exist; neither should duplicate the other.

### Critical Pitfalls

1. **Over-engineering docs for an early-stage project** — Build in proportion to audience. At v0.1.0 with zero known contributors, the right scope is community health baseline, CI, and structured docs. Ask "would a real contributor be blocked without this?" before adding any file. Warning: no docs site, no GOVERNANCE.md, no RFC templates until contributor pressure demands them.

2. **Monolithic internal docs that never get distilled** — AGENTS.md and PRD.md must be broken into purpose-specific documents, not just linked from CONTRIBUTING.md. Each concept gets exactly one permanent home; everything else links. When distilling, delete content from the source — the monolith should shrink, not accumulate new links. After distillation, retire or redirect the originals.

3. **CI that breaks on API key requirements** — Integration tests require `HANDOVER_INTEGRATION=1` plus live API keys. CI must run only unit/smoke tests unconditionally; integration tests are gated. Failure to do this means all external contributor PRs fail immediately, destroying the CI badge signal.

4. **Stale README badges before CI exists** — Add the CI badge only in the same commit as the working CI workflow. npm version and downloads badges are safe immediately (dynamic). Coverage badge requires Codecov to be configured first. More than 10 badges is badge bloat; aim for 4: npm version, CI status, license, coverage.

5. **CONTRIBUTING.md as a wall of text** — CONTRIBUTING.md should be 300-400 lines maximum. It is a gateway document with links, not a full reference. Lead with: local setup in 3 commands, where to find good first issues, how to submit a PR. Architecture and extension guides live in docs/contributor/ and are linked, not embedded. Apply the 15-minute test before publishing.

## Implications for Roadmap

Based on combined research, three phases emerge with clear dependency ordering. The architecture research explicitly documents a build order; the features research groups items into three priority tiers that map directly to phases; the pitfalls research identifies which concerns belong to which phase.

### Phase 1: Community Health Baseline

**Rationale:** No contributor will submit a PR until the community health files exist. These are the minimum set that satisfies GitHub's community health checklist and signals that the project is safe and ready to accept contributions. All files in this phase are low-complexity and have no dependencies on other phases. GitHub surfaces CONTRIBUTING.md, CODE_OF_CONDUCT.md, and SECURITY.md in the repository UI automatically — these have immediate visibility.

**Delivers:** A project that appears credible and welcoming to first-time contributors. GitHub community health score reaches 100%.

**Addresses (from FEATURES.md P1 low-complexity items):**
- CONTRIBUTING.md (stub — finalized in Phase 3 when docs/ links are available)
- CODE_OF_CONDUCT.md (Contributor Covenant v2.1, customized enforcement)
- SECURITY.md (GitHub private advisory, realistic SLA)
- .github/FUNDING.yml
- GitHub issue templates: bug-report.yml, feature-request.yml, docs-improvement.yml + config.yml
- GitHub PR template

**Avoids:**
- CONTRIBUTING.md as wall of text (Pitfall 5) — stub it at 300-400 lines with placeholder links to docs/ that will be filled in Phase 3
- Code of Conduct without enforcement mechanism (Pitfall 10) — customize the enforcement section before publishing
- Security disclosure process that doesn't work (Pitfall 9) — use GitHub private advisory workflow, not email
- Issue templates too rigid (Pitfall 6) — 4-5 fields maximum, 3 required

**Research flag:** Standard patterns. No deeper research needed. All files follow GitHub-documented conventions.

### Phase 2: CI/CD Automation

**Rationale:** CI must exist before automated npm publishing can be trusted. The quality gate (ci.yml) must be proven before the release workflow (release.yml) is wired up. This phase is also a prerequisite for meaningful README badges — the CI badge should only be added when the workflow it references is live. Branch protection rules enforcing CI checks should be enabled in this phase.

**Delivers:** Automated quality gate on all PRs, automated CHANGELOG and release PRs via release-please, npm publish automation, working README badges.

**Uses (from STACK.md):**
- GitHub Actions `ci.yml` with Node.js matrix 20 and 22
- `googleapis/release-please-action@v4` (release-type: node)
- `codecov/codecov-action@v5` with Vitest LCOV output
- `husky@9` + `@commitlint/cli@20.4.1` + `lint-staged@16` + `prettier@3.8.1`
- `eslint@10` + `typescript-eslint@8.56.0` (eslint.config.mjs flat config)

**Addresses (from FEATURES.md P1/P2):**
- CI: lint + typecheck + build + tests (with integration gate)
- Automated npm publish workflow
- README badges (CI, npm version, license, coverage)
- Dependabot configuration
- CHANGELOG.md seeded with v0.1.0 prose entry
- .github/FUNDING.yml (enable Sponsors button)

**Avoids:**
- CI broken on API key requirements (Pitfall 3) — split unit/integration tests; CI runs without `HANDOVER_INTEGRATION=1`
- Stale badges before CI exists (Pitfall 4) — CI badge added in same commit as working workflow
- GitHub Actions permissions too broad (Pitfall 13) — `permissions: read-all` at top level, elevate only where needed
- CHANGELOG retroactive backfill gone wrong (Pitfall 8) — single v0.1.0 prose entry; manual habit before automation

**Research flag:** Standard patterns. GitHub Actions + release-please + codecov are well-documented. No deeper research needed.

### Phase 3: Docs and LLM Accessibility

**Rationale:** This phase distills the existing monolithic internal docs (AGENTS.md, PRD.md) into the audience-segmented docs/ structure and writes llms.txt as a final index. It must come after Phase 2 so the CI workflow validates docs in linting passes. It must come after Phase 1 so community health files already exist and CONTRIBUTING.md can be finalized with working links. llms.txt is written last within this phase because it indexes docs that must exist first.

**Delivers:** Navigable user and contributor documentation, LLM-accessible project manifest, optimized AGENTS.md, finalized CONTRIBUTING.md with working links.

**Architecture implementation:**
- `docs/user/`: getting-started.md, configuration.md, providers.md, output-documents.md
- `docs/contributor/`: architecture.md, development.md, adding-providers.md, adding-analyzers.md
- `llms.txt` at root: 8-12 curated links, 4-5 H2 sections
- `AGENTS.md` revised: AI-operational rules only, links to docs/contributor/architecture.md
- CONTRIBUTING.md finalized: replace stub links with real docs/ paths

**Addresses (from FEATURES.md P1 docs + LLM items):**
- docs/ folder with user and contributor docs
- llms.txt (and optionally llms-full.txt)
- AGENTS.md optimization
- CodeQL security scanning workflow (can be added here — independent of docs)
- OpenSSF Scorecard badge + workflow (aspirational; add if time permits)

**Avoids:**
- Monolithic internal docs that never get distilled (Pitfall 2) — explicit distillation task; AGENTS.md shrinks as content moves
- llms.txt without content strategy (Pitfall 7) — docs/ exists and is structured before llms.txt is written
- Duplicate docs creating drift (Pitfall 12) — single source of truth; map each concept to one file before writing
- Anti-pattern: per-module docs alongside code — architecture context belongs in docs/contributor/, not src/
- Anti-pattern: AGENTS.md as a human doc — trim to AI-operational content; human narrative to docs/contributor/architecture.md

**Research flag:** The llms.txt and AGENTS.md optimization work is less prescriptive than the other phases (emerging standard, MEDIUM confidence sources). During planning, verify the actual content of existing AGENTS.md and PRD.md to scope the distillation effort accurately. The docs/ content is derived from existing internal docs — read and restructure, do not write from scratch.

### Phase Ordering Rationale

- **Community health before CI:** GitHub community health checklist visibility is immediate; contributors will arrive at the repo (from npm page, search) before CI is configured. Phase 1 ensures the repo looks credible on day one after this work begins.
- **CI before docs:** The docs/ build is the most significant writing effort. Having CI lint and check docs as they're written catches issues early. The CHANGELOG.md is seeded in Phase 2, establishing the release habit before Phase 3 documentation work begins.
- **Docs after CI, not before:** llms.txt depends on docs/ existing. CONTRIBUTING.md finalization depends on docs/ paths being stable. The architecture research build order is explicit: CI workflows first, community health second, docs/contributor/ third, docs/user/ fourth, llms.txt last.
- **Conventional commits enforcement (P3) deferred:** The pitfalls research is clear that automation amplifies process, not replaces it. Establish the manual CHANGELOG habit through at least 3 releases before adding commitlint CI enforcement.

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 3 (Docs distillation):** The scope depends on what's actually in AGENTS.md and PRD.md today. These files have not been audited for this research. Before planning Phase 3 tasks, read both source documents and map each major section to its target destination file. This prevents scope surprise. The distillation effort is MEDIUM complexity — not hard, but time-consuming if the monoliths are large.

- **Phase 2 (Codecov setup):** The project's Vitest configuration needs `@vitest/coverage-v8` and `coverage.reporter: ['lcov']` for Codecov integration. Verify these are in place or add them to Phase 2 scope.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Community health):** All files follow GitHub-documented conventions with verbatim templates available. CONTRIBUTING.md is the only file requiring project-specific content; the rest are boilerplate with customized contact details.
- **Phase 2 (CI/CD):** GitHub Actions + release-please + husky/commitlint/lint-staged are mature, well-documented, and the STACK.md research includes complete workflow skeletons ready to use.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry; official docs for GitHub Actions; workflow skeletons verified against official examples |
| Features | HIGH | GitHub community health file specs are official docs; badge patterns verified; llms.txt is MEDIUM (emerging standard, real adoption) |
| Architecture | HIGH | GitHub file discovery behavior verified via official docs; docs/ segmentation pattern observed across multiple reference projects (GitHub CLI, oclif) |
| Pitfalls | HIGH | Pitfalls are well-established community knowledge; CI/API key split is project-specific and directly verifiable in existing test structure |

**Overall confidence:** HIGH

The research domain is mature. GitHub Actions, community health files, conventional commits, and release automation are all stable, well-documented patterns with clear correct answers. The only MEDIUM-confidence elements are llms.txt (emerging standard) and AGENTS.md optimization (60k+ repo adoption but less prescriptive guidance). These are handled in Phase 3, which has a research flag.

### Gaps to Address

- **AGENTS.md and PRD.md content audit:** The distillation scope for Phase 3 is unknown without reading both source documents. Before finalizing Phase 3 task breakdown, audit these files to determine the volume of content to be restructured and how many docs/ files will be needed.

- **Vitest coverage configuration:** STACK.md specifies `codecov/codecov-action@v5` requires Vitest LCOV output via `@vitest/coverage-v8`. The current Vitest configuration in the project has not been verified to emit LCOV format. This is a Phase 2 prerequisite that needs verification before the CI workflow is finalized.

- **GitHub Sponsors account status:** .github/FUNDING.yml requires GitHub Sponsors to be enabled on the account. If the account has not applied for Sponsors, FUNDING.yml will produce a broken page. Verify before adding to Phase 1 or note as a conditional item.

- **npm package name verification:** Pitfalls research notes that the npm version badge must use the published name (`handover-cli`, not `handover`). The README badge URLs should be audited at Phase 2 start to confirm the correct package name.

## Sources

### Primary (HIGH confidence)
- [googleapis/release-please-action](https://github.com/googleapis/release-please-action) — v4 current; release-type: node
- [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) — commit message spec
- [npm registry — husky@9.1.7, lint-staged@16.2.7, @commitlint/cli@20.4.1, prettier@3.8.1, eslint@10.0.0, typescript-eslint@8.56.0](https://www.npmjs.com/) — versions verified
- [GitHub Docs — Community Health Files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) — file placement and discovery
- [GitHub Docs — Issue Forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms) — YAML form syntax
- [GitHub Docs — FUNDING.yml](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository) — format verified
- [ESLint flat config](https://eslint.org/blog/2025/03/flat-config-extends-define-config-global-ignores/) — v10 drops .eslintrc.*
- [llms.txt specification](https://llmstxt.org/) — spec v1 requirements
- [OpenSSF Scorecard checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md) — scorecard check list

### Secondary (MEDIUM confidence)
- [oleksiipopov.com — npm Release Automation comparison](https://oleksiipopov.com/blog/npm-release-automation/) — release-please vs semantic-release vs changesets
- [GitHub CLI (cli/cli)](https://github.com/cli/cli) — reference OSS structure for docs/ segmentation pattern
- [oclif](https://github.com/oclif/oclif) — reference TypeScript CLI OSS structure
- [AGENTS.md open format](https://github.com/agentsmd/agents.md) — emerging convention, 60k+ repos
- [GitHub Open Source Guides: Best Practices for Maintainers](https://opensource.guide/best-practices/) — documentation pitfalls
- [contributing.md: How to Build a CONTRIBUTING.md](https://contributing.md/how-to-build-contributing-md/) — CONTRIBUTING.md structure

### Tertiary (LOW confidence)
- [llms.txt in 2026: What It Does and Doesn't Do](https://searchsignal.online/blog/llms-txt-2026) — adoption signals, needs validation
- [Bluehost: What Is llms.txt? (2026 Guide)](https://www.bluehost.com/blog/what-is-llms-txt/) — adoption data for llms.txt

---
*Research completed: 2026-02-18*
*Ready for roadmap: yes*
