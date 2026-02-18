# Phase 3: Docs and LLM Accessibility - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Distill AGENTS.md and PRD.md into structured docs/ for three audiences: users (how-to guides in docs/user/), contributors (architecture and extension guides in docs/contributor/), and AI assistants (llms.txt index). Finalize CONTRIBUTING.md to link into docs/. Delete PRD.md after distillation. Strip AGENTS.md to pure AI-ops.

</domain>

<decisions>
## Implementation Decisions

### User doc style

- Quick-start reference style — assumes CLI/Node familiarity, not a hand-holding tutorial
- Configuration doc organized by config file sections — walk through handover.config.ts top to bottom (each key, what it does, valid values)
- Providers doc uses overview + comparison table format — high-level explanation of the provider system, then a table comparing all providers at a glance (no per-provider deep-dive sections)
- Include inline example output snippets — users see what they'll get before running the tool

### Contributor guide depth

- Architecture doc uses narrative walkthrough style — "A handover run starts at X, flows through Y, outputs Z" — tells the story of how things connect
- Extension docs (adding-providers.md, adding-analyzers.md) use step-by-step tutorial format — walk through building one from scratch
- Reference real file paths but not line numbers — balance of precision and durability (e.g., `src/providers/openai.ts`)
- Development.md covers the full local dev workflow — clone to PR, including debugging and running specific tests

### Content distillation

- PRD.md gets deleted after distillation — content lives in docs/ now, PRD served its purpose
- AGENTS.md becomes strict AI-ops only — build/test/lint commands, file conventions, where things live. Zero narrative, pure machine-readable rules
- Content migrates via extract-and-rewrite — pull relevant content from AGENTS.md/PRD.md, rewrite for human readers in docs/ style. Not a copy-paste
- CONTRIBUTING.md becomes a hub with links — short quick-start plus links to docs/contributor/ for details. Single source of truth lives in docs/

### llms.txt approach

- Usage-first priority — lead with what handover does and how to use it; extension/contribution info secondary
- Follow the llms.txt community specification (heading, sections with links and descriptions)
- No llms-full.txt — keep it simple, AI tools follow links from llms.txt to read individual files
- 8-12 files indexed as specified in success criteria

### Claude's Discretion

- How much context per llms.txt entry (title + one-liner vs summary paragraph)
- Exact structure of the comparison table in providers.md
- How to handle edge cases in config documentation (deprecated options, experimental features)
- Tone calibration across docs (technical but approachable)

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

_Phase: 03-docs-and-llm-accessibility_
_Context gathered: 2026-02-18_
