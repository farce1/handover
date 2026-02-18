# Feature Research

**Domain:** OSS infrastructure and developer experience for a TypeScript CLI tool (handover-cli)
**Researched:** 2026-02-18
**Confidence:** HIGH — GitHub community standards are well-documented via official docs; badge and CI patterns verified via official sources; llms.txt is MEDIUM (proposed standard, real adoption); AGENTS.md is MEDIUM (emerging convention, 60k+ repos)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that every serious open source project has. Missing any of these signals "hobby project" or "abandoned." GitHub's own community health checklist covers most of these explicitly.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| CONTRIBUTING.md | GitHub surfaces it as a tab in repo UI; every OSS tool expects it; contributors will look for it before submitting a PR | LOW | Should cover: local setup, test commands, PR process, commit convention, architecture overview. Distill from AGENTS.md + PRD.md — don't duplicate, consolidate. |
| GitHub issue templates (bug, feature, docs) | GitHub community health checklist requires them; prevents low-quality bug reports; guides contributors to give useful information | LOW | Use YAML form syntax (.yml in .github/ISSUE_TEMPLATE/). Three templates minimum: bug-report, feature-request, documentation. Add config.yml to disable blank issues. |
| GitHub PR template | Sets expectations before contributors submit; reduces back-and-forth on PRs | LOW | Single PULL_REQUEST_TEMPLATE.md in .github/. Checklist format: tests pass, changelog updated, docs updated if needed. |
| CHANGELOG.md | Users and integrators need to know what changed; breaking change visibility; professional signal | MEDIUM | Follow Keep a Changelog format (keepachangelog.com). Seed with existing version history. Don't fully automate yet — manual is fine for v0.x. |
| CODE_OF_CONDUCT.md | GitHub community health checklist item; sets norms for a welcoming project; blocks bad actors from claiming ambiguity | LOW | Use Contributor Covenant v2.1 verbatim. No customization needed — the standard text is the point. Place in repo root or .github/. |
| SECURITY.md | GitHub community health checklist item; GitHub uses it to route security reports; required for responsible disclosure | LOW | Cover: how to report a vuln privately (GitHub private vuln reporting), expected response time, what NOT to open as a public issue. |
| CI: lint + typecheck + build | Every serious npm package runs this on PRs; contributors expect to see CI pass before merge | MEDIUM | GitHub Actions workflow. Node.js matrix (20, 22). npm ci, tsc --noEmit, npm run build. Run on push to main and all PRs. |
| CI: tests | Contributors expect CI runs tests; required for trust in contributions | MEDIUM | Integration tests need API keys — gate them behind HANDOVER_INTEGRATION=1 env var. Unit/static tests run always. Document this clearly. |
| README badges (CI status, npm version, license, downloads) | Social proof; signals active project; users scan badges before reading; absence reads as "is this even maintained?" | LOW | Already in README but need to verify links work correctly. CI badge requires ci.yml workflow to exist. npm downloads badge via shields.io. |
| npm package.json `bugs` and `homepage` fields | npm package health; package consumers check these | LOW | Add bugs URL and homepage URL to package.json. Currently likely missing. |
| .github/FUNDING.yml | GitHub shows a "Sponsor" button when present; signals project is maintained and seeking support | LOW | Single entry: `github: [username]`. Requires GitHub Sponsors to be enabled on the account. |

### Differentiators (Competitive Advantage)

Features that distinguish a well-maintained, standout OSS project from the median. Not expected, but noticed and valued by the developer community.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| docs/ folder with structured user + contributor docs | Handover's core pitch is "understand any codebase quickly" — the project itself should model that; in-repo markdown works for LLMs natively without a docs site | MEDIUM | Structure: docs/user/, docs/contributor/, docs/architecture/. Distills AGENTS.md + PRD.md into navigable, cross-linked docs. Retires monolithic files. |
| llms.txt at repo root | Emerging standard (proposed Sept 2024, 60k+ early adopters by 2025); Anthropic, Cursor docs already serve it; directly aligned with handover's value proposition — a tool about LLM documentation should be LLM-friendly | LOW | Plain markdown file. H1 = project name. Blockquote = concise summary. Sections linking to key docs with descriptions. Companion llms-full.txt with flattened content is optional but valuable. |
| AGENTS.md (LLM coding agent instructions) | 60,000+ repos adopt this; Cursor, Claude Code, GitHub Copilot send it with every LLM API call; handover already has one — surfacing and properly structuring it is differentiating | LOW | Handover already has AGENTS.md. Goal is to optimize it: clear headings, build commands, test commands, coding conventions, PR process — all structured for machine parsing. Don't conflate with CONTRIBUTING.md (human-facing). |
| Dependabot configuration | Automated dependency PRs keep project secure; OpenSSF Scorecard checks for this; signals maintenance maturity | LOW | .github/dependabot.yml. npm ecosystem, weekly schedule, group updates. Scores on OpenSSF Scorecard's Dependency-Update-Tool check. |
| OpenSSF Scorecard badge | Security credibility signal; increasingly checked by enterprise adopters; GitHub Action runs automatically | MEDIUM | Add scorecard.yml GitHub Actions workflow. Badge links to scorecard.dev results. Improves on Token-Permissions, Branch-Protection, Security-Policy, SAST checks automatically. |
| npm automated publish workflow | Reduces friction for releases; shows project is actively shipped | MEDIUM | GitHub Actions workflow triggered on GitHub Release creation. Uses npm's OIDC trusted publishing (no long-lived NPM_TOKEN needed as of 2025). Runs CI checks first. |
| Conventional commits enforcement | Machine-readable commit history; enables automated CHANGELOG generation later; signals professional development practice | MEDIUM | commitlint + @commitlint/config-conventional in CI. Reject PRs with non-conforming commit messages. Educate in CONTRIBUTING.md. |
| CodeQL security scanning | OpenSSF Scorecard SAST check; GitHub provides it free for public repos; catches real vulnerabilities | LOW | GitHub Actions workflow: .github/workflows/codeql.yml. GitHub provides the action (github/codeql-action). Runs on push/PR and weekly schedule. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like good ideas but create maintenance burden, scope creep, or signal the wrong thing at this stage.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Dedicated docs site (Docusaurus, VitePress, MkDocs) | Looks professional; auto-generates nav; searchable | Maintenance overhead; CI pipeline complexity; separate deployment; the project's own tool (handover) is the answer to this eventually; in-repo markdown serves LLMs better today | In-repo docs/ folder in markdown. Migrate to docs site only when user base demands navigation that markdown can't provide. |
| Discord / Slack community server | Community building; real-time support | Requires moderation time handover doesn't have; GitHub Discussions achieves 80% of the value with zero infrastructure overhead | Enable GitHub Discussions instead when community activity warrants it. |
| Fully automated semantic release (semantic-release package) | Zero-touch version management; CHANGELOG auto-generation | At v0.x, manual control over what constitutes a release is valuable; semantic-release adds config complexity and requires consistent commit message discipline across all contributors; the ROI only appears at v1+ with multiple contributors | Manual CHANGELOG + GitHub Release creation. Adopt semantic-release when the project reaches v1 and has multiple active contributors. |
| CODEOWNERS file | Auto-assigns reviewers; clear ownership | Only one maintainer currently; adds friction with no benefit until team grows | Add when second maintainer joins. |
| Issue labels management tooling (GitHub CLI label sync) | Consistent labels across repos | Complexity for one-person project; GitHub defaults are sufficient | Use default labels plus 2-3 custom ones (e.g., "llm-provider", "documentation"). |
| Comprehensive SBOM generation | Supply chain transparency; OpenSSF Scorecard check | High complexity for little gain at v0.x; npm audit provides adequate dependency vulnerability scanning | npm audit in CI is sufficient. Add SBOM when enterprise adopters specifically request it. |
| All-in-one monorepo tooling (Nx, Turborepo) | Scale and caching | Handover is not a monorepo and has no plans to be; adds irrelevant complexity | Stay with npm workspaces if multi-package ever needed. |

---

## Feature Dependencies

```
CI workflow (lint + typecheck + build)
    └──required before──> automated npm publish workflow
                              └──required before──> release tagging

CONTRIBUTING.md
    └──distilled from──> AGENTS.md (existing) + PRD.md (existing)
    └──links to──> docs/ folder content

docs/ folder
    └──replaces/distills──> AGENTS.md (monolithic internal doc)
    └──replaces/distills──> PRD.md (90KB requirements doc)

llms.txt
    └──links to──> docs/ folder markdown files
    └──references──> README.md

AGENTS.md (optimized)
    └──complements──> CONTRIBUTING.md (AGENTS.md = machine-facing, CONTRIBUTING.md = human-facing)

GitHub issue templates
    └──enhances──> CONTRIBUTING.md (template references contributing guidelines)

.github/FUNDING.yml
    └──requires──> GitHub Sponsors enabled on account (external dependency)

OpenSSF Scorecard badge
    └──requires──> scorecard.yml GitHub Actions workflow
    └──improves score via──> SECURITY.md, Dependabot, CodeQL, Branch Protection

CodeQL workflow
    └──improves──> OpenSSF Scorecard SAST check
    └──independent of──> other CI workflows (can add anytime)

Dependabot
    └──improves──> OpenSSF Scorecard Dependency-Update-Tool check
    └──requires──> active maintainer merging PRs (ongoing commitment)
```

### Dependency Notes

- **docs/ folder requires AGENTS.md + PRD.md distillation:** The docs/ content is derived from existing internal docs. Must read and restructure existing content, not write from scratch.
- **CI workflow must precede npm automated publish:** Trust in the automated publish comes from CI passing first. Never publish without CI gating.
- **CONTRIBUTING.md and AGENTS.md are siblings, not duplicates:** CONTRIBUTING.md is human-readable onboarding for contributors. AGENTS.md is machine-parseable instructions for LLM coding agents. Keep both, optimize for their respective audiences.
- **llms.txt links to docs/ — create docs/ first:** llms.txt is an index. It's only valuable if the docs it links to are already good.

---

## MVP Definition

This is a brownfield project — the CLI already exists and works. The "MVP" here is the minimum set of OSS infrastructure that takes the project from "published tool" to "credible open source project that welcomes contributors."

### Launch With (Phase 1 — Community Health Baseline)

These unblock contributors and satisfy GitHub's community health checklist. No contributor will submit a PR until these exist.

- [ ] CONTRIBUTING.md — establishes the contributor path; without it, contributors don't know where to start
- [ ] GitHub issue templates (bug, feature, docs) + config.yml — structured issue reporting; without templates, issues are noise
- [ ] GitHub PR template — sets review expectations before submission
- [ ] CODE_OF_CONDUCT.md — signals the project is safe to contribute to
- [ ] SECURITY.md — required for responsible disclosure; GitHub routes security reports here
- [ ] README badges working correctly (CI, npm version, license, downloads) — credibility signals visible immediately

### Add After Phase 1 (Phase 2 — CI/CD + Automation)

These require Phase 1 community health baseline to exist and make sense in context.

- [ ] GitHub Actions CI workflow (lint + typecheck + build + tests) — gating contributions on passing CI
- [ ] GitHub Actions automated npm publish workflow — reduced release friction
- [ ] Dependabot configuration — automated dependency security
- [ ] .github/FUNDING.yml — enables sponsor button
- [ ] CHANGELOG.md (seeded with history) — version history for users

### Add After Phase 2 (Phase 3 — Documentation + LLM-Friendliness)

These require CI to exist (so docs are tested/linted in CI) and require Phase 1 community files to reference.

- [ ] docs/ folder structure with user and contributor docs (distilled from AGENTS.md + PRD.md)
- [ ] llms.txt (and optionally llms-full.txt) — LLM-friendly project description
- [ ] AGENTS.md optimization — structure for machine parsing, not human reading
- [ ] CodeQL security scanning workflow
- [ ] OpenSSF Scorecard badge + workflow

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| CONTRIBUTING.md | HIGH — unblocks all contributors | LOW | P1 |
| Issue templates (3x) + config.yml | HIGH — structures community communication | LOW | P1 |
| PR template | HIGH — reduces review friction | LOW | P1 |
| CODE_OF_CONDUCT.md | HIGH — community hygiene | LOW | P1 |
| SECURITY.md | HIGH — responsible disclosure | LOW | P1 |
| CI: lint + typecheck + build | HIGH — gating correctness | MEDIUM | P1 |
| CI: test (with integration gate) | HIGH — confidence in contributions | MEDIUM | P1 |
| CHANGELOG.md | HIGH — version history for users | MEDIUM | P1 |
| .github/FUNDING.yml | MEDIUM — sustainability signal | LOW | P1 |
| docs/ folder (user + contributor docs) | HIGH — LLM-first readability; distills existing monolithic docs | MEDIUM | P1 |
| llms.txt | HIGH — directly aligned with product mission; emerging standard | LOW | P1 |
| AGENTS.md optimization | HIGH — 60k+ repos; LLM tools send it every call | LOW | P1 |
| Dependabot | MEDIUM — security hygiene, low maintenance | LOW | P2 |
| Automated npm publish workflow | MEDIUM — reduces release friction | MEDIUM | P2 |
| CodeQL scanning | MEDIUM — security credibility | LOW | P2 |
| OpenSSF Scorecard badge + workflow | LOW-MEDIUM — enterprise trust signal | MEDIUM | P2 |
| Conventional commits enforcement in CI | LOW-MEDIUM — future CHANGELOG automation | MEDIUM | P3 |
| GitHub Discussions | LOW — community building | LOW | P3 |

**Priority key:**
- P1: Must have — project is not credibly OSS without these
- P2: Should have — meaningful quality and trust improvements
- P3: Nice to have — premature at v0.x, worthwhile at v1+

---

## Competitor Feature Analysis

Examining feature patterns from comparable TypeScript/Node.js CLI tools with strong OSS infrastructure: `eslint`, `prettier`, `tsx`, `zx`, `tldr`, and smaller tools like `degit`.

| Feature | eslint/prettier (mature) | tsx/zx (modern, smaller) | Our Approach |
|---------|--------------------------|--------------------------|--------------|
| CONTRIBUTING.md | Detailed, multi-section | Concise, practical | Concise + practical. Link to detailed docs/ pages. |
| Issue templates | YAML form syntax | YAML form syntax | YAML form syntax (.yml). Three templates. |
| CI workflow | Complex matrix, many jobs | Simple: lint, typecheck, test | Simple first. Node 20 + 22. Expand later. |
| Changelog | Automated (semantic-release) | Manual or semi-auto | Manual to start. Seed with history. |
| Docs site | Full docusaurus/vitepress | In-repo markdown | In-repo markdown. Handover's output can document itself later. |
| Security policy | Yes | Sometimes | Yes — required for community health checklist. |
| llms.txt | Not yet (too large/mature) | No | Yes — differentiating given handover's domain. |
| AGENTS.md | Not applicable (not LLM-first) | Rarely | Yes — handover already has one; optimize it. |
| Funding | GitHub Sponsors + OpenCollective | GitHub Sponsors | GitHub Sponsors via FUNDING.yml. |
| Dependabot | Yes | Sometimes | Yes — low effort, high trust signal. |
| OpenSSF Scorecard | Yes (eslint) | No | Aspire to it in Phase 2. |
| Code of conduct | Contributor Covenant | Contributor Covenant | Contributor Covenant v2.1. |

---

## Sources

- [GitHub: About community profiles for public repositories](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories) — MEDIUM confidence (official GitHub docs)
- [GitHub: About issue and pull request templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates) — HIGH confidence (official GitHub docs)
- [GitHub: Setting guidelines for repository contributors](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors) — HIGH confidence (official GitHub docs)
- [GitHub: Displaying a sponsor button in your repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository) — HIGH confidence (official GitHub docs)
- [GitHub: Building and testing Node.js](https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-nodejs) — HIGH confidence (official GitHub docs)
- [OpenSSF Scorecard checks documentation](https://github.com/ossf/scorecard/blob/main/docs/checks.md) — HIGH confidence (official OSSF repo)
- [llms.txt specification](https://llmstxt.org/) — MEDIUM confidence (proposed standard, not IETF/W3C; adoption real but limited)
- [AGENTS.md open format](https://github.com/agentsmd/agents.md) — MEDIUM confidence (emerging convention, 60k+ repos, adopted by major coding tools)
- [semantic-release documentation](https://semantic-release.gitbook.io/) — HIGH confidence (official docs)
- [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/) — HIGH confidence (official specification)
- [Shields.io](https://shields.io/) — HIGH confidence (official service)
- [InfoQ: AGENTS.md Emerges as Open Standard](https://www.infoq.com/news/2025/08/agents-md/) — MEDIUM confidence (industry news)
- [Bluehost: What Is llms.txt? (2026 Guide)](https://www.bluehost.com/blog/what-is-llms-txt/) — LOW-MEDIUM confidence (secondary source for adoption data)

---

*Feature research for: Handover CLI — OSS infrastructure and developer experience*
*Researched: 2026-02-18*
