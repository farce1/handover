# Phase 3: Docs and LLM Accessibility - Research

**Researched:** 2026-02-18
**Domain:** Markdown documentation authoring, llms.txt specification, AGENTS.md restructuring, open-source contributor onboarding
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### User doc style

- Quick-start reference style — assumes CLI/Node familiarity, not a hand-holding tutorial
- Configuration doc organized by config file sections — walk through handover.config.ts top to bottom (each key, what it does, valid values)
- Providers doc uses overview + comparison table format — high-level explanation of the provider system, then a table comparing all providers at a glance (no per-provider deep-dive sections)
- Include inline example output snippets — users see what they'll get before running the tool

#### Contributor guide depth

- Architecture doc uses narrative walkthrough style — "A handover run starts at X, flows through Y, outputs Z" — tells the story of how things connect
- Extension docs (adding-providers.md, adding-analyzers.md) use step-by-step tutorial format — walk through building one from scratch
- Reference real file paths but not line numbers — balance of precision and durability (e.g., `src/providers/openai.ts`)
- Development.md covers the full local dev workflow — clone to PR, including debugging and running specific tests

#### Content distillation

- PRD.md gets deleted after distillation — content lives in docs/ now, PRD served its purpose
- AGENTS.md becomes strict AI-ops only — build/test/lint commands, file conventions, where things live. Zero narrative, pure machine-readable rules
- Content migrates via extract-and-rewrite — pull relevant content from AGENTS.md/PRD.md, rewrite for human readers in docs/ style. Not a copy-paste
- CONTRIBUTING.md becomes a hub with links — short quick-start plus links to docs/contributor/ for details. Single source of truth lives in docs/

#### llms.txt approach

- Usage-first priority — lead with what handover does and how to use it; extension/contribution info secondary
- Follow the llms.txt community specification (heading, sections with links and descriptions)
- No llms-full.txt — keep it simple, AI tools follow links from llms.txt to read individual files
- 8-12 files indexed as specified in success criteria

### Claude's Discretion

- How much context per llms.txt entry (title + one-liner vs summary paragraph)
- Exact structure of the comparison table in providers.md
- How to handle edge cases in config documentation (deprecated options, experimental features)
- Tone calibration across docs (technical but approachable)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 3 is a pure documentation and restructuring phase — no code changes to production source. The work divides into four distinct streams: (1) authoring docs/user/ for end users, (2) authoring docs/contributor/ for code contributors, (3) restructuring AGENTS.md into strict AI-ops format and deleting PRD.md, and (4) creating llms.txt at the repo root.

The llms.txt community specification is a well-established markdown convention (originated 2024, 844K+ adopters by Oct 2025) with a simple, validated format. It uses an H1, optional blockquote summary, H2 file-list sections each containing bullet-linked resources with colon-separated descriptions. No build tooling is required — it's a static file authored by hand. The "Optional" H2 section has semantic meaning: content inside it may be skipped by LLMs needing shorter context.

AGENTS.md restructuring follows a clear pattern: strip all narrative prose, design rationale, and background context; retain only machine-actionable content (commands, file locations, naming rules, PR process). This is the AGENTS.md spec's stated purpose — "extra technical context coding agents need that would clutter a README." CONTRIBUTING.md should act as a navigational hub pointing into docs/contributor/, not a complete documentation source.

**Primary recommendation:** Create all files as plain markdown, author manually (no generators), structure around the locked decisions. The only external standard to follow precisely is the llms.txt spec from llmstxt.org — everything else is internal convention.

---

## Standard Stack

### Core

No libraries required. All deliverables are static markdown files authored by hand.

| Tool              | Version    | Purpose                          | Why Standard                           |
| ----------------- | ---------- | -------------------------------- | -------------------------------------- |
| Markdown          | CommonMark | All documentation format         | GitHub renders natively, no build step |
| YAML front-matter | —          | Optional metadata blocks in docs | Standard for programmatic consumption  |

### Supporting

No npm packages needed for this phase. The existing repo infrastructure (git, GitHub, npm) handles everything.

### Alternatives Considered

| Instead of                     | Could Use                               | Tradeoff                                                             |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------------- |
| Hand-authored markdown         | VitePress/Docusaurus                    | Framework adds build complexity; locked decision is in-repo markdown |
| Single llms.txt                | llms-full.txt (concatenated)            | Locked decision: no llms-full.txt, keep simple                       |
| CONTRIBUTING.md as full source | docs/ as source, CONTRIBUTING.md as hub | Locked decision: docs/ is source of truth                            |

**Installation:** None required.

---

## Architecture Patterns

### Recommended docs/ Folder Structure

```
docs/
├── user/
│   ├── getting-started.md     # Quick-start: npx install → first run
│   ├── configuration.md       # Walk through .handover.yml key by key
│   └── providers.md           # Provider system overview + comparison table
└── contributor/
    ├── architecture.md        # Narrative walkthrough of a handover run
    ├── development.md         # Clone → install → run → debug → PR
    ├── adding-providers.md    # Step-by-step: build a new provider
    └── adding-analyzers.md    # Step-by-step: build a new analyzer
```

Root-level files to touch:

- `llms.txt` — new, at repo root
- `AGENTS.md` — restructure in place (strip narrative, keep AI-ops)
- `CONTRIBUTING.md` — new file (doesn't exist yet)
- `PRD.md` — delete after distillation
- `package.json` — add `bugs` and `homepage` fields

### Pattern 1: llms.txt Canonical Format

**What:** The llmstxt.org community specification for AI-readable site/project indexes.
**When to use:** The llms.txt at repo root.

```markdown
# handover

> Brief one-paragraph summary of what handover is and does.

Optional additional context (not a heading, can be a list or paragraph).

## Docs

- [Getting started](docs/user/getting-started.md): Install and run handover in under 5 minutes
- [Configuration reference](docs/user/configuration.md): All .handover.yml options explained
- [Providers](docs/user/providers.md): Supported LLM providers and comparison

## Contributing

- [Architecture](docs/contributor/architecture.md): How a handover run flows end-to-end
- [Development](docs/contributor/development.md): Local dev workflow from clone to PR
- [Adding providers](docs/contributor/adding-providers.md): Step-by-step guide to adding a new provider
- [Adding analyzers](docs/contributor/adding-analyzers.md): Step-by-step guide to adding a new analyzer

## Optional

- [AGENTS.md](AGENTS.md): AI-operational rules for coding agents
- [CONTRIBUTING.md](CONTRIBUTING.md): Quick contributor orientation
```

Source: [llmstxt.org specification](https://llmstxt.org/) + [AnswerDotAI/llms-txt GitHub](https://github.com/AnswerDotAI/llms-txt)

**Key spec rules:**

- H1 is the only required section
- Blockquote (`>`) is for the project summary
- H2 sections hold file lists as bullet-linked resources
- Entry format: `- [Name](url): one-liner description`
- "Optional" H2 has semantic meaning: LLMs may skip it for shorter context
- No H3 headings in file lists

### Pattern 2: AGENTS.md AI-Ops-Only Restructure

**What:** Strip all human narrative; retain only machine-actionable rules.

Keep:

- Build/test/lint commands with exact flags
- File naming conventions (rules, not explanations)
- Directory map (where things live)
- PR process steps
- Explicit prohibitions (don't add unit tests, don't bypass DAG)

Remove (moves to docs/contributor/):

- Project overview paragraphs
- Architecture explanation prose
- Design rationale ("this is the core innovation")
- Key patterns explanations with why context

```markdown
# AGENTS.md

## Commands

\`\`\`bash
npm run dev -- generate # Run CLI in dev mode (tsx)
npm run build # Production build (tsup -> dist/)
npm run typecheck # Type checking only (tsc --noEmit)
npm test # Run tests (vitest)
npm run lint # ESLint
npm run format # Prettier
\`\`\`

## File conventions

- Source files: kebab-case.ts
- Renderers: render-NN-name.ts
- AI rounds: round-N-name.ts
- Test files: \*.test.ts
- Imports: always use .js extension (ESM)

## Where things live

- src/providers/ — LLM provider implementations
- src/analyzers/ — Static analyzers
- src/ai-rounds/ — AI analysis rounds
- src/renderers/ — Document renderers
- src/orchestrator/ — DAG executor
- src/config/ — Config schema and loader

## Rules

- No unit tests — integration tests only, gated behind HANDOVER_INTEGRATION=1
- No console.log — use logger from src/utils/logger.ts
- No process.exit() inline — use handleCliError() for CLI errors
- No DAG bypass — all pipeline steps must be registered as DAG steps
- No new dependencies without justification
- No duplicate retry/rate-limit logic — BaseProvider owns it
  \`\`\`
```

Source: [agents.md specification](https://agents.md/) + [OpenAI Codex AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md/)

### Pattern 3: CONTRIBUTING.md as Navigation Hub

**What:** Short file that gets a contributor oriented in <5 minutes and points them to docs/.
**Structure:**

1. One-paragraph project description
2. Prerequisites (Node >= 18, API key for integration tests)
3. Quick-start steps (clone, install, build, test — 4 commands)
4. Where to look (bulleted links into docs/contributor/)
5. Good-first-issue pointer and PR process one-liner

```markdown
# Contributing to handover

[1-paragraph: what handover does, why contributions matter]

## Prerequisites

- Node >= 18
- An LLM API key (for integration tests — Anthropic default)

## Quick start

\`\`\`bash
git clone https://github.com/farce1/handover.git
cd handover
npm install
npm run build
\`\`\`

Run tests: `HANDOVER_INTEGRATION=1 npm test` (requires API key)

## Guides

- [Architecture overview](docs/contributor/architecture.md) — understand how handover works
- [Development workflow](docs/contributor/development.md) — full clone-to-PR guide
- [Adding a provider](docs/contributor/adding-providers.md) — step-by-step
- [Adding an analyzer](docs/contributor/adding-analyzers.md) — step-by-step

## Finding work

Look for `good first issue` labels in GitHub Issues.

Submit PRs against `main`. Follow [conventional commits](https://www.conventionalcommits.org/).
```

### Pattern 4: package.json bugs + homepage Fields

**What:** Standard npm package fields for published packages.

```json
{
  "bugs": {
    "url": "https://github.com/farce1/handover/issues"
  },
  "homepage": "https://github.com/farce1/handover#readme"
}
```

Source: [npm package.json docs](https://docs.npmjs.com/cli/v9/configuring-npm/package-json/)

### Anti-Patterns to Avoid

- **Copy-pasting from AGENTS.md/PRD.md:** Locked decision is extract-and-rewrite. Prose written for different audiences reads wrong in the new context.
- **llms.txt with H3 or nested structure:** The spec does not define H3 behavior in file lists. Keep flat: H1 → H2 sections → bullet lists.
- **llms.txt with inline content blobs:** The no-llms-full.txt decision means entries link to files, not embed content. Short descriptions only.
- **CONTRIBUTING.md as documentation source:** It's a hub. Full content lives in docs/contributor/. Duplicating creates two sources of truth to maintain.
- **AGENTS.md narrative retention:** Any sentence that explains "why" rather than "what/how" belongs in docs/, not AGENTS.md.
- **Line numbers in contributor docs:** Locked decision is file paths only (e.g., `src/providers/openai.ts`) to avoid rot.

---

## Don't Hand-Roll

| Problem          | Don't Build                 | Use Instead               | Why                                                                          |
| ---------------- | --------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| llms.txt index   | Custom format               | Standard llmstxt.org spec | AI tools and crawlers expect the spec format                                 |
| Doc site         | VitePress/Docusaurus/MkDocs | Hand-authored markdown    | Locked decision; no build complexity needed yet                              |
| Config reference | Auto-generated from schema  | Hand-authored doc         | Schema names ≠ good doc prose; Zod doesn't output user-friendly descriptions |

**Key insight:** This phase has no complex tooling. Every deliverable is a markdown file authored by hand. The risk is quality (wrong content, wrong audience, wrong tone) not complexity.

---

## Common Pitfalls

### Pitfall 1: Scope Creep into Code Changes

**What goes wrong:** While restructuring AGENTS.md, tempted to update code to match new doc claims, or to fix gaps discovered during writing.
**Why it happens:** Docs research reveals inconsistencies between code and description.
**How to avoid:** Docs describe the codebase as it is, not as it should be. File issues for gaps. This phase is write-only for docs.
**Warning signs:** Any `src/` file being opened in an editor.

### Pitfall 2: AGENTS.md Over-Strip

**What goes wrong:** Removing too much from AGENTS.md such that an AI coding agent lacks context to work effectively on the codebase.
**Why it happens:** "Zero narrative" instruction taken too literally; strips conventions that agents need.
**How to avoid:** Keep all naming rules, all "don't do X" prohibitions, all commands with flags. Only remove background/rationale prose. Test by asking: "Could a coding agent, reading only this, make a correct code change?"
**Warning signs:** AGENTS.md becomes shorter than ~40 lines.

### Pitfall 3: llms.txt Entry Count Undershoot

**What goes wrong:** Indexing only 5-6 files when success criteria requires 8-12.
**Why it happens:** Only indexing the docs/ files written in this phase; forgetting README.md and AGENTS.md are also indexable.
**How to avoid:** Plan entry count before writing. The 8-12 target is: 3 user docs + 4 contributor docs + README + AGENTS.md + CONTRIBUTING.md = 10. Within range.
**Warning signs:** Fewer than 8 entries in llms.txt.

### Pitfall 4: CONTRIBUTING.md 15-Minute Clone-to-Good-First-Issue Goal

**What goes wrong:** CONTRIBUTING.md fails the success criteria that "a first-time contributor can clone, install, run tests, and find a good-first-issue within 15 minutes."
**Why it happens:** Forgetting to actually label GitHub issues with `good first issue`, or writing instructions that assume repo-specific knowledge.
**How to avoid:** Verify good-first-issue labeled issues exist before writing the pointer. Confirm test command works without config.
**Warning signs:** The quick-start commands require undocumented setup.

### Pitfall 5: Provider Comparison Table Missing Edge Cases

**What goes wrong:** providers.md comparison table has incomplete data — missing `custom` provider row, or wrong env var names.
**Why it happens:** Copy from README without cross-checking against `src/providers/presets.ts`.
**How to avoid:** Source comparison table data from `src/providers/presets.ts` (the authoritative registry), not README (which may lag). All 8 providers: anthropic, openai, ollama, groq, together, deepseek, azure-openai, custom.
**Warning signs:** Table has 7 rows (custom is missing) or different env var names than presets.ts.

### Pitfall 6: Config Doc Missing Keys

**What goes wrong:** configuration.md omits config keys that exist in the schema.
**Why it happens:** Walking through README's config table rather than `src/config/schema.ts`.
**How to avoid:** Generate config doc from `src/config/schema.ts` as the authoritative source. All keys: provider, model, apiKeyEnv, baseUrl, timeout, output, audience, include, exclude, context, analysis.concurrency, analysis.staticOnly, project.name, project.description, project.domain, project.teamSize, project.deployTarget, contextWindow.maxTokens, contextWindow.pin, contextWindow.boost, costWarningThreshold.
**Warning signs:** Fewer than 20 config entries documented.

### Pitfall 7: PRD.md Deleted Before Content Extracted

**What goes wrong:** PRD.md is deleted at the start of the phase before relevant content is distilled into docs/.
**Why it happens:** Misreading the locked decision as "delete PRD.md first."
**How to avoid:** Extract-and-rewrite first, delete last. PRD.md contains the domain model, pipeline architecture, and LLM-optimized principles that belong in architecture.md.
**Warning signs:** architecture.md is missing the pipeline description or DAG run-order.

---

## Code Examples

### llms.txt Entry Format (verified from llmstxt.org spec)

```markdown
- [Resource Name](relative/or/absolute/url): One-line description of what this file covers
```

For a repo file:

```markdown
- [Getting started](docs/user/getting-started.md): Install and run handover in under 5 minutes
```

### Full llms.txt Structure for handover (draft)

```markdown
# handover

> CLI tool that generates a 14-document knowledge base from any codebase. Runs static analysis across 8 dimensions, packs files into a context window, and executes 6 rounds of LLM analysis via a DAG orchestrator. Supports 8 providers. Single `npx` command.

Works with any language. Output is cross-referenced markdown readable by humans and AI tools.

## Docs

- [Getting started](docs/user/getting-started.md): Install and generate your first knowledge base
- [Configuration reference](docs/user/configuration.md): All .handover.yml options with defaults and valid values
- [Providers](docs/user/providers.md): Supported LLM providers, env vars, and provider comparison

## Contributing

- [Architecture](docs/contributor/architecture.md): How a handover run flows from CLI entry to 14 output documents
- [Development](docs/contributor/development.md): Local dev workflow — clone to PR
- [Adding a provider](docs/contributor/adding-providers.md): Step-by-step guide to implementing a new LLM provider
- [Adding an analyzer](docs/contributor/adding-analyzers.md): Step-by-step guide to implementing a new static analyzer

## Optional

- [README](README.md): Project overview, quick start, and feature summary
- [CONTRIBUTING.md](CONTRIBUTING.md): Contributor quick-start and navigation
- [AGENTS.md](AGENTS.md): AI-operational rules for coding agents working on this repo
```

Total entries: 11. Within the 8-12 success criteria.

### Authoritative Config Keys (from src/config/schema.ts)

The config doc must cover all these keys, organized by the group they appear in:

```
Top-level: provider, model, apiKeyEnv, baseUrl, timeout, output, audience, include, exclude, context, costWarningThreshold
project.*: name, description, domain, teamSize, deployTarget
analysis.*: concurrency, staticOnly
contextWindow.*: maxTokens, pin, boost
```

Config loading precedence (from src/config/loader.ts):

```
CLI flags > Environment variables (HANDOVER_PROVIDER, HANDOVER_MODEL, HANDOVER_OUTPUT) > .handover.yml > Zod defaults
```

### Authoritative Provider Data (from src/providers/presets.ts)

```
anthropic  — ANTHROPIC_API_KEY  — default: claude-opus-4-6  — cloud  — sdkType: anthropic
openai     — OPENAI_API_KEY     — default: gpt-4o            — cloud  — sdkType: openai-compat
ollama     — (none)             — default: (user-supplied)   — local  — sdkType: openai-compat
groq       — GROQ_API_KEY       — default: llama-3.3-70b-versatile — cloud — sdkType: openai-compat
together   — TOGETHER_API_KEY   — default: meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo — cloud
deepseek   — DEEPSEEK_API_KEY   — default: deepseek-chat     — cloud  — sdkType: openai-compat
azure-openai — AZURE_OPENAI_API_KEY — default: gpt-4o        — cloud  — sdkType: openai-compat
custom     — LLM_API_KEY        — (user-supplied)            — varies — sdkType: openai-compat
```

Note: "custom" provider is 8th entry (exists in schema enum but not in PROVIDER_PRESETS registry — documented separately in providers.md as the escape hatch).

### Architecture Narrative Entry Point (from src/cli/index.ts + AGENTS.md)

The narrative walkthrough for architecture.md should follow this flow:

```
Entry: src/cli/index.ts (Commander.js)
  → runGenerate() in src/cli/generate.ts
  → loadConfig() in src/config/loader.ts (precedence: CLI > env > .handover.yml > defaults)
  → Static analyzers (8 concurrent) in src/analyzers/coordinator.ts
      → FileTree, DepGraph, GitHistory, TodoScan, EnvScan, AST, Tests, Docs
  → Context packing in src/context/ (score files, pack to token budget)
  → DAG orchestration in src/orchestrator/dag.ts (Kahn's topological sort)
      → 6 AI rounds in src/ai-rounds/ (round-1 through round-6)
      → Each round: BaseProvider.complete() with retry + rate-limit
  → 14 renderers in src/renderers/ (render-00 through render-13)
  → Output: handover/*.md
```

Extension points for contributor docs:

- **New provider:** Extend `BaseProvider` in `src/providers/base-provider.ts`, implement `doComplete()` and `isRetryable()`, add preset to `src/providers/presets.ts`, register in `src/providers/factory.ts`
- **New analyzer:** Add file to `src/analyzers/`, implement the coordinator interface in `src/analyzers/coordinator.ts`, add to the concurrent execution group

---

## State of the Art

| Old Approach                  | Current Approach           | Notes                                                                          |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| robots.txt for AI crawlers    | llms.txt for AI assistants | Different purpose: robots.txt controls crawling, llms.txt guides understanding |
| Full-content llms-full.txt    | Link-indexed llms.txt      | Decision locked: no llms-full.txt                                              |
| AGENTS.md as narrative readme | AGENTS.md as strict AI-ops | 2025 convention crystallized around machine-readable format                    |

**The llms.txt spec is stable.** It was introduced in 2024, adopted by 844K+ sites by Oct 2025, and is used by Anthropic's own docs, Cloudflare, and Stripe. The format is unlikely to change in ways that break existing files.

---

## Claude's Discretion Recommendations

### llms.txt Entry Length

**Recommendation: title + one-liner (not a paragraph)**

The spec example shows: `[Resource Name](url): Brief description of all attributes, classes, headers...`

Keep descriptions to one sentence (under 20 words). AI tools use them to decide whether to follow the link, not as content. The file should stay under 50 lines total.

### Providers Comparison Table Columns

**Recommendation:** Use these columns for providers.md:

| Provider | Env var | Default model | Local? | Context window | Pricing tier |
| -------- | ------- | ------------- | ------ | -------------- | ------------ |

"Pricing tier" (Free/Low/$$/$$$ style) is more useful than exact per-token costs (which change frequently). Source from presets.ts for env var, default model, and local status.

### Edge Cases in Config Documentation

**Recommendation:** Document all keys that exist in schema.ts. For `custom` provider: note it uses `LLM_API_KEY` by default but `apiKeyEnv` overrides it. For `baseUrl` and `apiKeyEnv`: note these are primarily for `custom` provider but can override any provider. No keys are deprecated in the current schema. No experimental flags exist.

### Tone Calibration

**Recommendation:** Technical-terse for reference docs (configuration.md, providers.md), narrative-friendly for architecture.md and development.md. Concrete-not-jargony: prefer "runs 6 AI analysis rounds" over "executes a DAG-orchestrated multi-round LLM inference pipeline."

---

## Open Questions

1. **Does `custom` provider need a preset entry in presets.ts?**
   - What we know: `custom` appears in the schema enum but is absent from `PROVIDER_PRESETS`. The factory presumably handles it differently.
   - What's unclear: How the custom provider gets instantiated — may need to check `src/providers/factory.ts` before writing adding-providers.md.
   - Recommendation: Read `src/providers/factory.ts` during plan execution, before writing adding-providers.md.

2. **Should llms.txt use relative or absolute URLs?**
   - What we know: The spec example uses both (some relative, some absolute GitHub raw URLs). For a GitHub-hosted repo, relative paths work when GitHub renders the file.
   - What's unclear: Whether AI tools follow relative links from llms.txt or expect absolute URLs.
   - Recommendation: Use relative paths (e.g., `docs/user/getting-started.md`). GitHub renders them as links. AI tools that can't resolve relative paths are handling the spec incorrectly.

3. **GitHub Issues: Are there existing `good first issue` labels?**
   - What we know: CONTRIBUTING.md success criteria requires a contributor to find a good-first-issue within 15 minutes.
   - What's unclear: Whether labeled issues exist yet in the repo.
   - Recommendation: Check during plan execution. If no labeled issues exist, the plan should include creating 1-2 as part of this phase, or the CONTRIBUTING.md should point to Issues generally with advice on how to ask for a good first issue.

---

## Sources

### Primary (HIGH confidence)

- [llmstxt.org specification](https://llmstxt.org/) — full spec including example, Optional section semantics, file entry format
- [AnswerDotAI/llms-txt GitHub](https://github.com/AnswerDotAI/llms-txt) — canonical specification repository
- `src/config/schema.ts` — authoritative config key source
- `src/providers/presets.ts` — authoritative provider data source
- `src/config/loader.ts` — config precedence order
- `src/cli/index.ts` — CLI entry point and command structure
- [npm package.json docs](https://docs.npmjs.com/cli/v9/configuring-npm/package-json/) — bugs and homepage field semantics

### Secondary (MEDIUM confidence)

- [agents.md specification](https://agents.md/) — AGENTS.md AI-ops format and what to include vs exclude
- [OpenAI Codex AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md/) — AGENTS.md best practices
- [Diátaxis framework](https://diataxis.fr/) — documentation type theory (tutorials/how-to/reference/explanation) informing structure
- [llmstxt.org FastHTML example](https://llmstxt.org/) — verified concrete example of the format in practice

### Tertiary (LOW confidence)

- WebSearch: adoption statistics (844K sites, Oct 2025) — single source, not independently verified
- WebSearch: good-first-issue label conventions — common knowledge, multiple consistent sources

---

## Metadata

**Confidence breakdown:**

- llms.txt spec: HIGH — verified against official llmstxt.org spec and example
- Config documentation: HIGH — sourced directly from src/config/schema.ts
- Provider data: HIGH — sourced directly from src/providers/presets.ts
- AGENTS.md restructure: HIGH — spec verified against agents.md official site
- Architecture walkthrough order: MEDIUM — traced from src/cli/index.ts entry point, full factory.ts chain not traced
- CONTRIBUTING.md pattern: HIGH — standard open-source practice, multiple consistent sources

**Research date:** 2026-02-18
**Valid until:** 2026-05-18 (90 days — llms.txt spec stable, config schema stable, no fast-moving dependencies)
