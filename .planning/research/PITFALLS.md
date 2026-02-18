# Pitfalls Research

**Domain:** OSS documentation and infrastructure for a TypeScript CLI tool
**Researched:** 2026-02-18
**Confidence:** HIGH (documentation pitfalls well-established; CI/CD patterns verified against official GitHub docs; LLM accessibility from multiple sources)

---

## Critical Pitfalls

### Pitfall 1: Over-Engineering Docs for an Early-Stage Project

**What goes wrong:**
The project adds elaborate documentation structures — a docs/ site, multiple nested docs/ folders, detailed governance docs, an RFC process, a contributor ladder, a Discord server — before it has any contributors. The result is a maintenance burden with zero audience. Every new file is a liability unless someone reads it.

**Why it happens:**
Mimicking "industry-leading" projects (React, Rust, Go) without accounting for the fact those projects had thousands of contributors before their elaborate infrastructure existed. The documentation aspiration front-runs the community reality.

**How to avoid:**
Build documentation in proportion to the audience. For handover at v0.1.0 with zero known contributors, the correct set is: CONTRIBUTING.md, issue templates, CI/CD, CHANGELOG, and SECURITY.md. Stop there. Do not add a docs/ site, GOVERNANCE.md, RFC templates, or a contributor ladder until contributor pressure demands them. Ask: "Would a real contributor be blocked without this?" If no, defer.

**Warning signs:**
- Writing documentation for "future contributors" that don't exist yet
- Creating more than 3 community health files before the first external PR
- GOVERNANCE.md on a solo project
- docs/ folder with more than 5 files before 100 npm downloads/month
- Any file whose primary audience is hypothetical ("when we have a steering committee...")

**Phase to address:**
Documentation phase (all phases). Every phase should ask "is this necessary at our current scale?" before adding a new file.

---

### Pitfall 2: Monolithic Internal Docs That Never Get Distilled

**What goes wrong:**
AGENTS.md and PRD.md stay as 90KB+ monolithic files. They contain excellent content but require reading 10,000 words to extract one relevant fact. New contributors don't read them, LLMs can't chunk them efficiently, and they accumulate drift as the code evolves. The project has rich internal knowledge that is practically inaccessible.

**Why it happens:**
The original authors know the content and don't notice the navigation problem. Distillation requires effort with no immediate visible payoff. The monoliths grow because it's easier to append than to restructure.

**How to avoid:**
Distill, don't just link. The content in AGENTS.md and PRD.md must be broken into purpose-specific documents: CONTRIBUTING.md gets the "how to work on this" content, docs/architecture.md gets the system design content, docs/ai-rounds.md gets the pipeline design content. The monoliths then become deprecated or redirects. Explicitly retire the originals or they'll accumulate new content and the distilled docs will drift.

**Warning signs:**
- CONTRIBUTING.md that says "see AGENTS.md for details" (redirect, not distillation)
- AGENTS.md still growing after new docs are added
- New contributor opens AGENTS.md, closes it after 2 minutes
- Any "comprehensive" single-file documentation over 500 lines

**Phase to address:**
CONTRIBUTING.md / contributor docs phase. Must happen before the docs/ structure is finalized so the distilled content lands in the right place.

---

### Pitfall 3: CI That Breaks on API Key Requirements

**What goes wrong:**
The test suite requires `HANDOVER_INTEGRATION=1` plus a live API key. CI runs fail because external contributors have no access to secrets. The result is either: (a) CI always shows red, destroying the badge signal, or (b) integration tests are excluded from CI with no documentation explaining why, confusing contributors who see incomplete coverage.

**Why it happens:**
Integration tests are written locally where API keys are available. CI is added after the fact without accounting for the gating requirement.

**How to avoid:**
Split tests into two categories from the start: unit/smoke tests (no API keys, always run) and integration tests (gated by `HANDOVER_INTEGRATION=1`, skipped in CI unless secrets are configured). The CI workflow must explicitly skip the integration gate and run the unit layer. Document this split in CONTRIBUTING.md so contributors understand the two test tiers. For forks and external PRs, unit tests pass; integration tests are not expected to pass.

**Warning signs:**
- CI badge showing failing state in README
- `.github/workflows/ci.yml` that unconditionally runs `npm test` with no secret guard
- Test output saying "0 tests ran" in CI logs
- CONTRIBUTING.md that says "tests require an API key" with no guidance on running unit tests independently

**Phase to address:**
CI/CD phase. Must be resolved before any CI workflow goes live.

---

### Pitfall 4: Stale README Badges Before CI Exists

**What goes wrong:**
The README already references CI badge URLs (the handover README currently has a CI status badge pointing to a workflow that may not exist yet). These badges show "unknown" or "failing" state, which signals project abandonment or dysfunction to every new visitor — the opposite of the intended social proof effect.

**Why it happens:**
Badges are added optimistically before the underlying workflow exists, or the workflow name/branch referenced in the badge URL doesn't match the actual workflow file.

**How to avoid:**
Add badges only after the underlying system is working. The CI badge should be added in the same commit as the working CI workflow. The npm version and downloads badges are safe to add immediately (they're dynamic and always accurate). Coverage badges require a coverage reporter to be configured first (Codecov, Coveralls) — don't add them until that's done.

**Warning signs:**
- Badge showing "no status" or grey/unknown state
- README badge URL pointing to `ci.yml` but workflow file is named differently
- Coverage badge with 0% or unknown reading
- More than 10 badges (badge bloat correlates with decreased project trust)

**Phase to address:**
CI/CD phase. Audit all badge URLs against actual workflow names before merging.

---

### Pitfall 5: CONTRIBUTING.md as a Wall of Text

**What goes wrong:**
CONTRIBUTING.md is written as a comprehensive guide covering everything: code style, commit format, PR process, architecture overview, testing, CI, local setup. It reads like a policy document rather than a guide for someone who wants to make their first contribution. Contributors open it, find no clear "start here," and close it.

**Why it happens:**
Maintainers know everything and try to document everything. The document grows by accretion — each section is individually reasonable but the whole is unusable. There's no prioritization of what a first-time contributor actually needs in their first 15 minutes.

**How to avoid:**
Structure CONTRIBUTING.md around the contributor journey, not completeness. Lead with: (1) local setup in 3 commands, (2) where to find good first issues, (3) how to submit a PR. Put architecture details in a separate docs/ file linked from CONTRIBUTING.md. Use the "inverted pyramid" — the most critical information first, details last or linked out.

**Warning signs:**
- CONTRIBUTING.md over 300 lines with no table of contents
- First section is "Philosophy" or "Project Goals" (delays actionable content)
- Setup instructions buried after multiple sections of guidelines
- No "good first issue" label or mention of where to find starter tasks
- Architecture explanation duplicating what's in AGENTS.md without distillation

**Phase to address:**
CONTRIBUTING.md phase. Apply the "15-minute test" — can a new contributor clone, install, run tests, and identify their first issue in 15 minutes using only CONTRIBUTING.md?

---

### Pitfall 6: Issue Templates That Are Too Long or Too Rigid

**What goes wrong:**
Issue templates with 15 required fields scare away bug reporters. The project ends up with no bug reports rather than imperfect bug reports. Alternatively, templates with no required fields produce unactionable "it doesn't work" reports that maintainers have to triage back-and-forth.

**Why it happens:**
Templates are written to solve the maintainer's triage problem, not the reporter's friction problem. The template designer imagines a complex production bug, not a simple "I couldn't install this" report.

**How to avoid:**
Bug report template: 4-5 fields maximum. Required: (1) what you expected to happen, (2) what actually happened, (3) handover version, (4) node version, (5) reproduction steps. Optional: everything else. Feature request template: 2 fields — what problem it solves, what you'd like to see. Keep templates to one screenful without scrolling.

**Warning signs:**
- Issue template over 40 lines of markdown
- More than 3 "required" fields
- Template fields that require running commands to fill in ("output of `handover --version --debug --verbose`")
- Zero issues filed in the first month after adding templates (over-friction signal)

**Phase to address:**
Issue templates phase. Review after first 5 real issues are filed and prune aggressively.

---

## Moderate Pitfalls

### Pitfall 7: llms.txt Without an Actual Content Strategy

**What goes wrong:**
An llms.txt file is created as a marketing/signal move, but the underlying docs it references are not structured for machine consumption. The file lists URLs that return HTML, not markdown. The project gets a checkmark for "AI-accessible" while providing no actual value to LLM consumers.

**Why it happens:**
llms.txt is an emerging standard with low adoption verification. Projects add it because it looks good in a "OSS infrastructure" checklist without understanding what makes it useful.

**How to avoid:**
llms.txt should reference the actual markdown files that exist in the repo, not the GitHub HTML rendering. The content those files contain must be self-contained — each section should make sense without cross-file context. For handover, the right llms.txt references are: README.md (install and usage), CONTRIBUTING.md (contributor workflow), docs/architecture.md (system design). Add llms.txt after the referenced docs exist and are structured for chunk-level consumption.

**Warning signs:**
- llms.txt referencing docs/ pages that don't exist yet
- Referenced docs contain heavy cross-references ("see AGENTS.md section 4.2")
- llms.txt added before other docs are written (premature optimization)
- File lists more than 10 entries (likely padding rather than curating)

**Phase to address:**
LLM accessibility phase, which should come after core docs are written and structured.

---

### Pitfall 8: CHANGELOG Retroactive Backfill Gone Wrong

**What goes wrong:**
The project tries to retroactively reconstruct a CHANGELOG from git history after release. The backfill is inaccurate (git commits don't map cleanly to user-facing changes), inconsistent (mix of terse and verbose entries), and time-consuming. Alternatively, the project adopts automated conventional commit tooling (semantic-release, standard-version) mid-project which requires retroactive commit history compliance that doesn't exist.

**Why it happens:**
CHANGELOG is an afterthought. The project didn't start with a change documentation habit, then tries to establish one from scratch.

**How to avoid:**
For handover at v0.1.0: write a single entry for v0.1.0 covering the initial release features in prose. Don't try to reconstruct what changed from git log. Going forward, maintain CHANGELOG.md manually as part of every release — add a new section as changes accumulate, update it as a required step in the release process. Do NOT adopt automated tooling (semantic-release, changesets) until you've had the manual habit for 3+ releases. Automation amplifies process, it doesn't replace process.

**Warning signs:**
- CHANGELOG with 50+ entries all dated the same day (mass backfill)
- Using semantic-release on first setup attempt
- Entries that read like git commit messages rather than user-facing descriptions
- CHANGELOG that references internal refactors as user-facing changes

**Phase to address:**
CHANGELOG phase. Establish the manual habit first.

---

### Pitfall 9: Security Disclosure Process That Doesn't Work

**What goes wrong:**
SECURITY.md exists but the disclosed email address is wrong, not monitored, or the response SLA is aspirational rather than realistic ("we respond within 24 hours" when the project is maintained by one person with a day job). Alternatively, SECURITY.md tells reporters to file a GitHub issue — exposing the vulnerability publicly before a fix exists.

**Why it happens:**
SECURITY.md is a checklist item. It gets written without thinking through the actual workflow: who monitors the inbox, what's a realistic response time, how is the advisory published.

**How to avoid:**
Use GitHub's private security advisory workflow — it's built into GitHub, doesn't require a separate email, and provides a private space for coordinated disclosure. SECURITY.md should say: "Use GitHub's private security advisory feature at [link]. We'll respond within [realistic SLA]." For a solo maintainer: 7 days for initial response is reasonable. Do not promise 24-hour response. Do not list an email that isn't actively monitored.

**Warning signs:**
- SECURITY.md with a Gmail address for disclosure
- Response SLA of 24 hours for a solo-maintained project
- SECURITY.md telling reporters to file a GitHub issue
- No mention of the GitHub private advisory workflow

**Phase to address:**
SECURITY.md phase.

---

### Pitfall 10: CODE_OF_CONDUCT Without Enforcement Mechanism

**What goes wrong:**
CODE_OF_CONDUCT.md is added as a boilerplate paste of the Contributor Covenant. It lists an enforcement email that isn't monitored, or the enforcement section says "contact the maintainers at [email]" but there's no guidance on what "contact" means or what happens next. The document signals community safety without providing it.

**Why it happens:**
CODE_OF_CONDUCT is a checklist item in "OSS infrastructure" checklists. It's copy-pasted with minimal customization.

**How to avoid:**
Customize the enforcement section with: (1) a working contact method, (2) a realistic response timeline, (3) what happens after a report (private reply within N days, then...). For a solo project, this is simple: "Report via [private GitHub advisory or email]. I'll respond within 7 days." The key is specificity — vague enforcement is the same as no enforcement for potential reporters.

**Warning signs:**
- Enforcement contact is a generic "maintainers@..." email
- Enforcement section copied verbatim from the Contributor Covenant template with placeholder text
- No mention of what a reporter should expect as a response
- CoC added 3 years after project starts (late additions signal it was a checkbox, not a commitment)

**Phase to address:**
CODE_OF_CONDUCT phase. Customize before publishing.

---

## Minor Pitfalls

### Pitfall 11: PR Template Checklist Bloat

**What goes wrong:**
PR template contains 15 checklist items that don't apply to most contributions ("I have updated the changelog," "I have added tests," "I have updated the docs," "I have run the benchmarks," "I have reviewed the security implications"). Contributors either ignore the checklist entirely or spend 10 minutes checking boxes that don't apply to their typo fix.

**How to avoid:**
5-7 checklist items maximum. Only items that genuinely apply to most PRs. Use `<!-- optional -->` HTML comments next to items that only apply sometimes. Link to CONTRIBUTING.md for detailed guidelines rather than embedding them in the template.

**Phase to address:**
Issue/PR templates phase.

---

### Pitfall 12: Duplicate Docs Creating Drift

**What goes wrong:**
The same information appears in multiple places: AGENTS.md documents the provider architecture, CONTRIBUTING.md also documents the provider architecture, and docs/providers.md documents it a third time. Within 6 months, all three diverge from the actual code and from each other.

**How to avoid:**
Single source of truth. Each piece of information lives in exactly one place. Other docs link to it, not duplicate it. When distilling AGENTS.md, decide where each concept lives permanently — then delete it from AGENTS.md, not copy it. The monolith becomes empty and gets retired.

**Phase to address:**
CONTRIBUTING.md / docs/ distillation phase. Map every major concept to exactly one file before writing.

---

### Pitfall 13: GitHub Actions Workflow Permissions Too Broad

**What goes wrong:**
Workflow uses `permissions: write-all` or doesn't explicitly set permissions, giving every step write access to the repository. For a public repo accepting PRs from external contributors, this creates supply chain risk — a compromised action in the workflow could write to the repo.

**How to avoid:**
Follow principle of least privilege. Set `permissions: read-all` at the top level, then elevate specific jobs only as needed. For a CI-only workflow (lint, typecheck, test, build), no write permissions are needed. If release automation is added later, scope write permissions to that job only.

**Warning signs:**
- `permissions: write-all` anywhere in the workflow
- No `permissions` key in workflow YAML (defaults to write for most events)
- Using `actions/checkout` with `persist-credentials: true` when not needed

**Phase to address:**
CI/CD phase. Set permissions explicitly from the start.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems specific to OSS documentation.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Link to AGENTS.md instead of distilling | Saves time now | New contributors don't read AGENTS.md; LLMs can't parse it efficiently | Never: do the distillation |
| Copy-paste Contributor Covenant without customizing enforcement | Quick CoC checkbox | No real enforcement mechanism; reporters feel unsafe | Never: customize enforcement section |
| Add llms.txt before docs are structured | Early adopter signal | References docs that don't exist or aren't LLM-readable | Never at v0.1.0: write the docs first |
| Skip unit/integration test split | Simpler test config | CI breaks on external PRs; badge shows red permanently | Never: split at the start |
| Add all badges before CI exists | Looks polished | Broken/unknown badge signals project dysfunction | Never: add badges when their source is live |
| Automated CHANGELOG on day one | Appears professional | Requires conventional commits discipline not yet established | Only after 3+ manual release cycles |
| 15-item PR template | Comprehensive | Contributors ignore it entirely | Only for complex contributions; use conditional items |
| Monolithic CONTRIBUTING.md | Thorough | Wall of text; contributors find no entry point | Only if structured with a clear TL;DR section at top |

---

## Integration Gotchas

Common mistakes when connecting OSS infrastructure to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| CI badge in README | Pointing to wrong workflow name or branch | Match badge URL exactly to `workflow_name` in `.github/workflows/filename.yml` |
| npm version badge | Using package name that doesn't match npm publish name | Verify `handover-cli` (not `handover`) is the published name |
| GitHub Actions secrets | Hardcoding API keys in workflow YAML | Store as GitHub repo secrets; access via `${{ secrets.KEY_NAME }}` |
| Codecov/coverage badge | Adding badge before reporter is configured | Set up reporter first, verify it uploads, then add badge |
| Private security advisory | Not enabling GitHub private advisory feature | Enable in repo Settings > Security > Private vulnerability reporting |
| GitHub Sponsors (FUNDING.yml) | Creating before GitHub Sponsors is approved | Apply for Sponsors first; FUNDING.yml with unapproved handle shows broken page |

---

## Performance Traps

Not directly applicable to a documentation/infrastructure project, but documentation maintenance has scale concerns.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Monolithic docs | Increasing time to find specific info; duplicate content appearing | Single-source-of-truth rule | At 5+ contributing docs authors |
| Manual CHANGELOG | Releases delayed because CHANGELOG takes too long to write | Use structured release notes in PRs | At 10+ releases/year |
| No automated CI enforcement | Style drift, typecheck failures merged undetected | Required CI checks before merge | First PR from an external contributor |
| LLM-unfriendly cross-references | AI assistants cannot answer questions about the codebase | Self-contained section headers; explicit path references | When AI tools become primary contributor discovery mechanism |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces specific to this project.

- [ ] **CONTRIBUTING.md:** Often missing the local test setup that explains the `HANDOVER_INTEGRATION=1` split — verify a new contributor can run at least some tests without an API key
- [ ] **CI workflow:** Often marked done but not actually gating PRs — verify "Require status checks to pass before merging" is enabled in branch protection settings
- [ ] **Issue templates:** Often added but `.github/ISSUE_TEMPLATE/config.yml` is missing, so users still see the blank issue option — verify the chooser appears with the right template descriptions
- [ ] **SECURITY.md:** Often lists an email but GitHub private advisory reporting is not enabled — verify both paths work
- [ ] **README badges:** Often pointing to correct workflow name but wrong branch (`main` vs `master`) — verify each badge URL loads correctly, not just 200 OK
- [ ] **llms.txt:** Often references files that exist but aren't self-contained — verify each linked file reads coherently in isolation (no dangling "see section X" references)
- [ ] **CHANGELOG.md:** Often has a "Unreleased" section with no release date — verify v0.1.0 entry has an actual date and describes user-facing changes, not internal refactors
- [ ] **AGENTS.md:** Often "updated" without actually removing distilled content — verify monolith shrinks as content moves to structured docs, not just grows with new links

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Over-documented too early | LOW | Archive unused files, add "not actively maintained" notice, remove from CONTRIBUTING.md links |
| Monolith not distilled | HIGH | Full content audit; map each section to target file; move in batches; add redirects from old file |
| CI broken due to API keys | LOW | Add `if: secrets.HANDOVER_INTEGRATION` guard to integration test step; rerun workflow |
| Broken badges | LOW | Fix badge URL to match actual workflow name; check branch reference matches default branch |
| Stale CONTRIBUTING.md drift | MEDIUM | Quarterly "docs audit" issue; assign to next milestone; verify against actual repo state |
| llms.txt pointing to non-existent docs | LOW | Remove entries for files that don't exist; add back when files are written |
| CHANGELOG backfill | MEDIUM | Write a single v0.1.0 entry for initial release; don't reconstruct every commit; start fresh from current version |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Over-engineering docs for early stage | Every phase | "Would a real contributor be blocked without this?" check before adding any file |
| Monolithic docs not distilled | CONTRIBUTING.md / docs/ structure phase | AGENTS.md shrinks as content moves; no sections in CONTRIBUTING.md say "see AGENTS.md" |
| CI broken on API key requirements | CI/CD phase | External contributor test: run CI on a fork with no secrets configured; unit tests pass |
| Stale badges before CI exists | CI/CD phase | All badge URLs verified to render correct state before README is merged |
| CONTRIBUTING.md as wall of text | CONTRIBUTING.md phase | 15-minute test: new contributor can clone, install, find an issue without reading more than CONTRIBUTING.md |
| Issue templates too rigid | Issue templates phase | 5 real issues filed without maintainer needing to ask for more info |
| llms.txt without content strategy | LLM accessibility phase | Each linked file reads coherently in isolation; no dangling cross-references |
| CHANGELOG retroactive backfill | CHANGELOG phase | v0.1.0 entry written in prose; subsequent releases add entries as changes land |
| Security disclosure that doesn't work | SECURITY.md phase | Test the disclosure path end-to-end before publishing |
| CoC without enforcement mechanism | CODE_OF_CONDUCT phase | Enforcement section customized with working contact and realistic SLA |
| PR template checklist bloat | Issue/PR templates phase | Count checklist items; max 7; verify all apply to most PRs |
| Duplicate docs creating drift | Distillation phase | Each concept appears in exactly one file; all others link |
| GitHub Actions permissions too broad | CI/CD phase | `permissions` explicitly set in every workflow; least privilege verified |

---

## Sources

- [GitHub Open Source Guides: Best Practices for Maintainers](https://opensource.guide/best-practices/) — MEDIUM confidence (official GitHub guidance)
- [GitHub Docs: Community Health Files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) — HIGH confidence (official GitHub documentation)
- [contributing.md: How to Build a CONTRIBUTING.md](https://contributing.md/how-to-build-contributing-md/) — MEDIUM confidence (community resource, multiple sources agree)
- [GitHub Actions Secrets Security (NeoVa Solutions, 2025)](https://www.neovasolutions.com/2025/02/06/github-actions-how-to-secure-secrets-and-credentials-in-ci-cd/) — MEDIUM confidence (verified against GitHub official docs pattern)
- [llms.txt in 2026: What It Does and Doesn't Do](https://searchsignal.online/blog/llms-txt-2026) — LOW confidence (single source; confirms adoption signals but not impact)
- [The Complete Guide to llms.txt (GetPublii)](https://getpublii.com/blog/llms-txt-complete-guide.html) — LOW confidence (single source)
- [Software Antifragility: 5 Open Source Projects That Learned from Failure](https://www.softwareantifragility.com/p/5-open-source-projects-that-learned) — MEDIUM confidence (post-mortem analysis, multiple project examples)
- [Changesets vs Semantic Release (Brian Schiller)](https://brianschiller.com/blog/2023/09/18/changesets-vs-semantic-release/) — MEDIUM confidence (practitioner analysis, well-regarded)
- [Handsontable: Common Causes of Failed Open Source Projects](https://handsontable.com/blog/the-most-common-causes-of-failed-open-source-software-projects) — MEDIUM confidence (industry blog, corroborated by research)
- [OpenSSF Open Source Project Security Baseline, 2025](https://openssf.org/press-release/2025/02/25/openssf-announces-initial-release-of-the-open-source-project-security-baseline/) — HIGH confidence (official security foundation release)
- [Open Source Maintainer Burnout (The Register, 2025)](https://www.theregister.com/2025/02/16/open_source_maintainers_state_of_open/) — MEDIUM confidence (current reporting, corroborated by multiple sources)
- [Why Modern Open Source Projects Fail (Coelho & Valente, 2017)](https://arxiv.org/abs/1707.02327) — MEDIUM confidence (academic; patterns remain relevant)
- [dwyl/repo-badges: README badge best practices](https://github.com/dwyl/repo-badges) — MEDIUM confidence (practitioner resource, widely referenced)

---

*Pitfalls research for: OSS infrastructure and documentation for handover CLI*
*Researched: 2026-02-18*
