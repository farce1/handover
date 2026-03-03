# Phase 29: Search & QA UX Polish - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the `handover search` CLI output and MCP `semantic_search` response. Surface result quality signals, guide users on zero results, add clickable links, and enrich MCP responses. No new search capabilities — only improve how existing results are presented and communicated.

</domain>

<decisions>
## Implementation Decisions

### Quality Warning Signals
- Inline text warning displayed above results when best-match cosine distance exceeds threshold
- Show numeric distance value: `⚠ Low relevance (distance: 0.82). Try a more specific query or different --type`
- Warning includes actionable suggestion (not just a flag)

### Zero-Results Experience
- Show both available doc types AND query tips together
- Doc types sourced live from the vector store at runtime (not hardcoded)
- Include total indexed document count: `No results found (42 documents indexed). Available types: ...`
- When index is completely empty (0 documents), specifically suggest running `handover generate` first

### QA Stats Presentation
- Stats appear as a footer after the answer, not before
- Dimmed/muted visual styling (chalk.dim or similar) — present but not distracting
- Include full stats: time + tokens + sources count
- List the actual source files used after the stats line

### Search Result Layout
- Keep current result display behavior — only add the new signals (warnings, links, OSC8)
- Do not add content snippets/previews to search results

### Claude's Discretion
- Distance threshold for quality warning (tune based on testing the search implementation)
- OSC8 link target format (file path vs file path + line number — whatever the spec supports well)
- `--type` values format in `handover search --help` (match existing CLI help style)
- MCP `content` field format (raw text vs markdown — based on what the vector store already stores)

</decisions>

<specifics>
## Specific Ideas

- Quality warning format should be power-user friendly with numeric distance visible
- QA source listing similar to citation style: answer first, sources at bottom
- Empty-index case is a distinct UX from "index exists but no matches"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 29-search-qa-ux-polish*
*Context gathered: 2026-03-02*
