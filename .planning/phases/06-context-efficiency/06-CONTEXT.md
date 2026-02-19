# Phase 6: Context Efficiency - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Reduce tokens sent on incremental runs by packing only changed file content, add Anthropic prompt caching for rounds 2-6, replace the chars/4 heuristic with BPE tokenization, and render documents in parallel. The result: faster, cheaper runs with accurate token reporting.

</domain>

<decisions>
## Implementation Decisions

### Completion summary

- Show tokens sent + received AND estimated dollar cost per round
- Per-round breakdown (not just totals) — each round shows its own token count and cost
- Each round includes a savings line when savings exist: tokens saved, percentage, and dollar amount
- Skip the summary entirely on all-cached runs (no API calls made)
- On first/full runs with no savings, just show totals without mentioning savings

### Incremental run feedback

- Count summary for skipped files: "Analyzed 12 files, skipped 48 unchanged" — aggregate only, no file list
- Verbose flag (-v) reveals per-file decisions (which files were re-analyzed and why)
- Label runs explicitly: "Incremental run (3 files changed)" at the start vs "Full run"

### Savings reporting style

- Express savings in all three units: tokens, percentage, and dollars — e.g., "Saved 12,400 tokens (62%, ~$0.03)"
- Green color coding for savings amounts in terminal output
- On full runs with no savings, just show totals — don't mention savings at all

### Parallel render behavior

- Aggregate progress only: "Rendering 4 documents..." then done — no per-doc status lines
- Show time saved by parallel rendering: "Rendered 4 docs in 2.1s (saved ~4.3s vs sequential)"
- If one document fails, continue rendering the others and report the failure at the end

### Claude's Discretion

- How to handle Anthropic prompt cache vs context-packing savings breakdown (combined or separate)
- Document ordering when rendered in parallel
- What to send for unchanged files (signature-only, cached analysis, or other token-efficient approach)
- Exact format and layout of the per-round token summary table

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

_Phase: 06-context-efficiency_
_Context gathered: 2026-02-19_
