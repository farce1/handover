# Architecture Research

**Domain:** OSS Infrastructure — Documentation, Contributor Onboarding, LLM Accessibility for a TypeScript CLI
**Researched:** 2026-02-18
**Confidence:** HIGH (GitHub official docs verified; llms.txt spec verified at llmstxt.org; community health file placement verified via GitHub docs)

---

## Standard Architecture

### System Overview

The OSS infrastructure for handover is organized into four distinct component layers. Each layer has clear ownership, communicates upward to users/contributors/LLMs, and has explicit file locations.

```
┌────────────────────────────────────────────────────────────────────┐
│                        CONSUMER LAYER                               │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────────┐ │
│  │  End Users  │  │   Contributors   │  │    LLMs / AI Agents    │ │
│  │ (npm/npx)   │  │ (fork+PR)        │  │ (docs ingestion)       │ │
│  └──────┬──────┘  └────────┬─────────┘  └───────────┬────────────┘ │
└─────────┼──────────────────┼────────────────────────┼──────────────┘
          │                  │                         │
          ▼                  ▼                         ▼
┌─────────────────┐ ┌────────────────────┐ ┌──────────────────────┐
│   README.md     │ │  .github/ Layer    │ │  LLM Accessibility   │
│   (root)        │ │                    │ │  Layer               │
│                 │ │ CONTRIBUTING.md    │ │                      │
│ Quick start     │ │ CODE_OF_CONDUCT.md │ │ llms.txt (root)      │
│ Provider table  │ │ SECURITY.md        │ │ AGENTS.md (revised)  │
│ CLI reference   │ │ FUNDING.yml        │ │ docs/ (structured)   │
│ Links to docs/  │ │ ISSUE_TEMPLATE/    │ │                      │
│                 │ │ PULL_REQUEST_      │ │                      │
│                 │ │ TEMPLATE.md        │ │                      │
└────────┬────────┘ └────────┬───────────┘ └──────────┬───────────┘
         │                   │                         │
         └───────────────────┼─────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                       DOCS/ LAYER                                   │
│                                                                     │
│  docs/                                                              │
│  ├── user/                    # End-user documentation              │
│  │   ├── getting-started.md   # Installation + first run            │
│  │   ├── configuration.md     # Config file reference               │
│  │   ├── providers.md         # LLM provider setup guides           │
│  │   └── output-documents.md  # What the 14 docs mean               │
│  └── contributor/             # Contributor documentation           │
│      ├── architecture.md      # System design (distilled AGENTS.md) │
│      ├── development.md       # Setup, build, test workflow          │
│      ├── adding-providers.md  # How to add an LLM provider          │
│      └── adding-analyzers.md  # How to add a static analyzer        │
└────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────┐
│                       CI LAYER (.github/workflows/)                 │
│                                                                     │
│  ci.yml           — lint, typecheck, build, test (on push/PR)      │
│  release.yml      — npm publish (on version tag push)              │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| README.md (root) | First contact: what, why, quick start, links | Consumers → docs/, .github/ |
| .github/CONTRIBUTING.md | How to contribute: setup, PR process, architecture summary | Contributors → docs/contributor/ |
| .github/ISSUE_TEMPLATE/ | Bug report, feature request, docs improvement forms | Contributors → maintainers |
| .github/PULL_REQUEST_TEMPLATE.md | PR quality checklist | Contributors → CI |
| .github/workflows/ci.yml | Automated quality gate (lint, typecheck, build, test) | All pushes/PRs |
| .github/workflows/release.yml | npm publish automation on tag | Maintainers → npm |
| .github/FUNDING.yml | GitHub Sponsors button | GitHub UI → sponsors |
| .github/CODE_OF_CONDUCT.md | Community norms (Contributor Covenant) | GitHub UI → contributors |
| .github/SECURITY.md | Vulnerability reporting process | Users → maintainers |
| docs/user/ | In-depth user guides | End users, README links |
| docs/contributor/ | Deep architecture and dev workflow | Contributors, CONTRIBUTING links |
| llms.txt (root) | Machine-readable project description for LLM context | LLMs, AI coding assistants |
| AGENTS.md (revised) | AI agent working guidelines (operational, not educational) | AI agents working in the codebase |
| CHANGELOG.md (root) | Version history, user-facing changes | Users, automated release tooling |

---

## Recommended Project Structure

```
handover/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug-report.yml          # Structured form: reproduction, expected, actual
│   │   ├── feature-request.yml     # Structured form: problem, solution, alternatives
│   │   └── docs-improvement.yml    # Structured form: which doc, what's wrong
│   ├── workflows/
│   │   ├── ci.yml                  # Lint + typecheck + build + test
│   │   └── release.yml             # npm publish on tag push
│   ├── CODE_OF_CONDUCT.md          # Contributor Covenant (standard)
│   ├── CONTRIBUTING.md             # Setup + PR process + architecture links
│   ├── FUNDING.yml                 # GitHub Sponsors configuration
│   ├── PULL_REQUEST_TEMPLATE.md    # PR checklist
│   └── SECURITY.md                 # Vulnerability reporting
├── docs/
│   ├── user/
│   │   ├── getting-started.md      # Installation, first run, quick wins
│   │   ├── configuration.md        # Config file schema reference
│   │   ├── providers.md            # API key setup per LLM provider
│   │   └── output-documents.md     # What each of 14 docs contains
│   └── contributor/
│       ├── architecture.md         # DAG, analyzers, providers, renderers (distilled from AGENTS.md)
│       ├── development.md          # Clone, build, test, debug
│       ├── adding-providers.md     # BaseProvider pattern, required methods
│       └── adding-analyzers.md     # Analyzer interface, coordinator registration
├── src/                            # Unchanged
├── tests/                          # Unchanged
├── AGENTS.md                       # Revised: AI-agent operational guidelines only
├── CHANGELOG.md                    # Version history (new)
├── LICENSE                         # Existing MIT
├── README.md                       # Existing — links added to docs/ and .github/
├── llms.txt                        # Machine-readable project summary (new)
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

### Structure Rationale

- **.github/ for community health files:** GitHub searches `.github/` before root before `docs/` for CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md. Placing them in `.github/` keeps root uncluttered and is the GitHub-recommended location (source: GitHub docs, HIGH confidence).
- **docs/user/ vs docs/contributor/ split:** Two distinct audiences with different mental models. User docs answer "how do I use this?" Contributor docs answer "how does this work?" Mixing them creates cognitive friction. Pattern used by GitHub CLI, oclif, and similar (MEDIUM confidence — observed across multiple projects).
- **llms.txt at root:** The llms.txt spec (llmstxt.org) specifies `/llms.txt` at the root of the project/site. It requires an H1 title, optional summary blockquote, and H2-delimited sections with links to key documents. One file acts as a table of contents for LLMs ingesting the repo (HIGH confidence — spec verified).
- **AGENTS.md revised (not retired):** AGENTS.md serves a different purpose than CONTRIBUTING.md — it is operational guidance for AI coding agents working inside the codebase (tool restrictions, patterns to follow, what not to do). The content currently in AGENTS.md that explains architecture for humans moves to `docs/contributor/architecture.md`. AI-operational rules stay in AGENTS.md.
- **CHANGELOG.md at root:** Standard location. GitHub releases UI links to it. Users expect it here.
- **CI workflows in .github/workflows/:** GitHub Actions only discovers workflows at this path (not configurable). Two workflows are distinct concerns (quality gate vs. publish) and should be separate files to avoid accidental coupling.

---

## Architectural Patterns

### Pattern 1: Community Health Files in .github/

**What:** GitHub's community health file system discovers files in `.github/` first, then root, then `docs/`. Placing all community health files in `.github/` keeps root clean while GitHub still surfaces them in the UI.

**When to use:** Always — this is the canonical GitHub recommendation for OSS projects.

**Trade-offs:** Slightly less discoverable for people browsing the file tree, but GitHub UI surfaces them prominently in the sidebar.

**Example:**
```
.github/
├── CODE_OF_CONDUCT.md      # GitHub links in "Insights > Community" tab
├── CONTRIBUTING.md         # GitHub links on new issue/PR forms
└── SECURITY.md             # GitHub links in "Security" tab
```

### Pattern 2: docs/ Folder with Audience Segmentation

**What:** Split docs/ into `user/` and `contributor/` subdirectories. Each subdirectory serves one audience exclusively.

**When to use:** When a project has both end users (who install the tool) and contributors (who modify the code). The handover CLI has both audiences.

**Trade-offs:** Requires discipline to keep the split clean. Worth it: prevents a user looking for "how to configure providers" from wading through "how the DAG orchestrator works."

**Example:**
```
docs/
├── user/           # Everything an npm user needs
│   └── providers.md    → "Set ANTHROPIC_API_KEY=..."
└── contributor/    # Everything a code contributor needs
    └── architecture.md → "DAG orchestrator uses Kahn's algorithm..."
```

### Pattern 3: llms.txt as Documentation Index

**What:** A single file at the root that acts as a curated table of contents for LLMs. Uses H1 title, blockquote summary, and H2 sections with links to key markdown files. An LLM can read llms.txt first to orient itself, then follow links to specific docs.

**When to use:** Any project that wants AI coding assistants to understand it quickly. Especially appropriate for handover, which positions itself as an AI tooling product.

**Trade-offs:** Requires maintenance when docs are added/removed. Minor burden — it's a short file.

**Example:**
```markdown
# handover

> Generate a complete knowledge base from any codebase with a single command.

## Documentation

- [Getting Started](docs/user/getting-started.md): Installation and first run
- [Configuration](docs/user/configuration.md): Config file reference
- [LLM Providers](docs/user/providers.md): Provider setup

## Contributing

- [Architecture](docs/contributor/architecture.md): System design
- [Development](docs/contributor/development.md): Local setup and testing
```

### Pattern 4: Two-Stage CI Workflow

**What:** Separate the quality gate (ci.yml) from the publish workflow (release.yml). The quality gate runs on every push and every PR. The publish workflow runs only on version tag pushes (e.g., `v*`).

**When to use:** Any npm package. Prevents accidental publishes and keeps CI feedback fast.

**Trade-offs:** Two files to maintain rather than one. The clarity is worth the small overhead.

**Example ci.yml structure:**
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  quality:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
      - run: npm test
```

---

## Data Flow

### Documentation Authoring Flow

```
AGENTS.md (existing, monolithic)
  + PRD.md (existing, monolithic)
    ↓ (distill and restructure)
docs/contributor/architecture.md    # System design for humans
docs/contributor/development.md     # Dev workflow for humans
AGENTS.md (revised)                 # AI operational rules only
```

### User Discovery Flow

```
npm search / Google / GitHub search
    ↓
README.md (first impression, quick start)
    ↓
docs/user/getting-started.md (installation details)
docs/user/providers.md (API key setup)
docs/user/configuration.md (advanced config)
```

### Contributor Discovery Flow

```
GitHub "Contribute" button / Issues
    ↓
.github/CONTRIBUTING.md (setup instructions + links)
    ↓
docs/contributor/development.md (local dev workflow)
docs/contributor/architecture.md (system design)
docs/contributor/adding-providers.md (specific extension points)
```

### LLM Ingestion Flow

```
AI agent receives task related to handover codebase
    ↓
llms.txt (orientation: what this is, key files)
    ↓
AGENTS.md (operational rules: do this, not that)
    ↓
docs/contributor/architecture.md (DAG, patterns, conventions)
    ↓
src/ (actual code)
```

### CI Quality Gate Flow

```
Developer opens PR
    ↓
ci.yml triggered
    ├── npm run typecheck (tsc --noEmit)
    ├── npm run build (tsup)
    └── npm test (vitest, integration gated behind HANDOVER_INTEGRATION=1)
    ↓
All green → PR can be merged
```

### Key Data Flows

1. **Content reuse:** AGENTS.md and PRD.md are sources; docs/contributor/ files are outputs. No duplication — originals retired after distillation.
2. **Cross-linking:** README.md → docs/user/ → (no further links needed). README.md → .github/CONTRIBUTING.md → docs/contributor/ → src/. Each layer links forward, never backward.
3. **CI to release:** ci.yml quality gate must pass before release.yml publish is triggered (enforced via branch protection or separate trigger conditions).

---

## Scaling Considerations

This is a documentation and CI infrastructure question, not a runtime scaling question. The relevant scaling axis is "repository complexity as the project grows."

| Scale | Architecture Adjustments |
|-------|--------------------------|
| v0.1 (current) | All files flat in .github/ and docs/ — no subdirectory complexity needed beyond user/contributor split |
| v0.x growth (more providers, analyzers) | docs/contributor/ grows organically. One file per major extension point (already planned: adding-providers.md, adding-analyzers.md) |
| v1.0+ (community grows) | Add GOVERNANCE.md if multiple maintainers emerge. Add docs site (Docusaurus/Nextra) as wrapper around existing markdown — no rewrite needed since docs are already in markdown |
| Large community | Issue triage automation (GitHub Actions: auto-label, stale bot). Discussion templates. Separate SUPPORT.md |

### Scaling Priorities

1. **First pressure point:** CONTRIBUTING.md becomes too long as architecture grows. Mitigation: CONTRIBUTING.md is a gateway document with links, not a full reference. It stays short; detail lives in docs/contributor/.
2. **Second pressure point:** llms.txt becomes stale as docs are added. Mitigation: Reviewers check llms.txt as part of PR checklist whenever docs/ is modified.

---

## Anti-Patterns

### Anti-Pattern 1: Documentation Alongside Code (Per-Module Docs)

**What people do:** Add README.md files inside src/ai-rounds/, src/providers/, etc., to explain each module.

**Why it's wrong:** Creates a maintenance nightmare — docs are scattered, hard to discover, and GitHub doesn't surface them. For a TypeScript CLI with a CLI-first audience, users never read src/ files. The architecture docs belong in docs/contributor/architecture.md as a unified document.

**Do this instead:** Use AGENTS.md for AI agent guidance, docs/contributor/architecture.md for human contributor guidance. Use clear module-level JSDoc comments in source for inline documentation (visible in IDE, TypeDoc-generatable).

### Anti-Pattern 2: Monolithic CONTRIBUTING.md

**What people do:** Put everything in CONTRIBUTING.md — setup, testing, architecture, PR process, coding conventions, provider implementation guide, analyzer guide.

**Why it's wrong:** CONTRIBUTING.md becomes 2000+ lines and nobody reads it. New contributors are overwhelmed before they write a line of code.

**Do this instead:** CONTRIBUTING.md is a 300-400 line gateway document: prerequisites, quick setup (10 commands to first test run), PR checklist, and links to docs/contributor/ for depth. Architecture and extension guides live separately.

### Anti-Pattern 3: CI Workflow That Runs Integration Tests Unconditionally

**What people do:** Add `npm test` to CI and let it fail for contributors who don't have API keys.

**Why it's wrong:** Handover's integration tests require `HANDOVER_INTEGRATION=1` and API keys. If CI runs tests without this guard, all PRs from external contributors fail immediately. This is documented in the project: "integration tests only, gated behind HANDOVER_INTEGRATION=1."

**Do this instead:** CI runs `npm test` normally (vitest will skip integration tests without the env var). Only a separate, secrets-enabled workflow step optionally runs integration tests on the main branch using repository secrets. This is explicitly called out in CONTRIBUTING.md.

### Anti-Pattern 4: llms.txt as Full Documentation

**What people do:** Dump the entire README into llms.txt, or link every single file in the repo.

**Why it's wrong:** Defeats the purpose. llms.txt is a curated index, not a full dump. An LLM given 50 links has no meaningful orientation. The spec emphasizes curation.

**Do this instead:** llms.txt links to 8-12 essential files maximum. Each link has a one-sentence description of what's in it. Group under 4-5 H2 sections (Quick Start, Documentation, Contributing, Architecture).

### Anti-Pattern 5: Keeping AGENTS.md as a Human Doc

**What people do:** Revise AGENTS.md to be a combined human/AI document that explains the architecture fully.

**Why it's wrong:** AGENTS.md is read by AI agents executing tasks. It should be dense with operational rules (what to do, what not to do, where things live). Architecture explanation for humans belongs in docs/contributor/architecture.md, where it can be narrative and thorough.

**Do this instead:** Keep AGENTS.md short and directive (current 105-line format is close to ideal). Move architecture explanation content to docs/contributor/architecture.md. Add a single link in AGENTS.md: "For architecture context: docs/contributor/architecture.md."

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| npm registry | Publish via `npm publish` in release.yml workflow | Use `NODE_AUTH_TOKEN` secret from npm; consider OIDC trusted publishing |
| GitHub Actions | Triggered on push, PR, and tag events | ci.yml and release.yml are separate files |
| GitHub Sponsors | .github/FUNDING.yml with `github: [username]` | Surfaces sponsor button in repo UI |
| Contributor Covenant | CODE_OF_CONDUCT.md links to v2.1 at contributor-covenant.org | Don't copy the full text; link instead |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| README.md ↔ docs/user/ | README links to docs; docs do not link back to README | One-way: README is entry, docs are depth |
| CONTRIBUTING.md ↔ docs/contributor/ | CONTRIBUTING links to docs; docs are standalone | CONTRIBUTING is 300-400 lines max |
| llms.txt ↔ all docs | llms.txt links to key files; files do not reference llms.txt | llms.txt is a generated index, not a document |
| AGENTS.md ↔ docs/contributor/ | AGENTS.md links to architecture.md; architecture.md does not link to AGENTS.md | Separation of AI-operational vs. human-educational concerns |
| ci.yml ↔ release.yml | release.yml has no dependency on ci.yml at workflow level | Branch protection rules enforce quality gate separately |
| docs/user/ ↔ docs/contributor/ | No cross-links | Audience separation is strict |

---

## Build Order Implications

The components have a clear dependency order for implementation. Building in the wrong order causes rework.

```
1. CI workflows (.github/workflows/)
   — needed first so all subsequent work gets validated automatically

2. Community health files (.github/ root files)
   — CODE_OF_CONDUCT, SECURITY, FUNDING are boilerplate;
     CONTRIBUTING needs architecture docs to link to (chicken-and-egg;
     stub CONTRIBUTING first, fill links as docs/ is built)

3. GitHub issue + PR templates (.github/ISSUE_TEMPLATE/, PULL_REQUEST_TEMPLATE.md)
   — independent of docs/, can be done in parallel with docs/

4. docs/contributor/ (distilling AGENTS.md + PRD.md content)
   — requires understanding the codebase (already done);
     CONTRIBUTING.md links here, so docs/contributor/ must exist before
     CONTRIBUTING.md is finalized

5. docs/user/
   — independent of docs/contributor/;
     requires understanding the CLI from a user perspective

6. llms.txt
   — written last: indexes the docs that now exist;
     needs final file paths to link correctly

7. AGENTS.md revision
   — trim to AI-operational content only after docs/contributor/architecture.md
     exists to absorb the human-educational content
```

**Critical dependency:** Do not finalize CONTRIBUTING.md before docs/contributor/ exists. CONTRIBUTING.md's primary value is as a gateway with working links. Stub it early; finalize it last.

---

## Sources

- [GitHub Community Health Files — Official Docs](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) — HIGH confidence
- [llms.txt Specification — llmstxt.org](https://llmstxt.org/) — HIGH confidence
- [Building and Testing Node.js — GitHub Actions Docs](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs) — HIGH confidence
- [GitHub CLI (cli/cli) — Reference OSS project structure](https://github.com/cli/cli) — MEDIUM confidence (observed pattern)
- [oclif — Reference TypeScript CLI OSS structure](https://github.com/oclif/oclif) — MEDIUM confidence (observed pattern)
- [Mintlify: What is llms.txt?](https://www.mintlify.com/blog/what-is-llms-txt) — MEDIUM confidence (secondary source confirming spec)
- [Semantic-release GitHub Actions](https://semantic-release.gitbook.io/semantic-release/recipes/ci-configurations/github-actions) — MEDIUM confidence

---

*Architecture research for: Handover OSS Infrastructure*
*Researched: 2026-02-18*
