# Phase 5: UX Responsiveness - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the 30-90 second LLM wait feel interactive through live progress indicators, streaming token output, parallel round execution, and file coverage visibility. This phase delivers UX improvements to the existing generate command — no new commands, no new features.

</domain>

<decisions>
## Implementation Decisions

### Progress display

- Compact single-line progress that updates in place: e.g. "Round 3/6 ◆ 1,247 tokens (3,891 total) · 12.3s"
- Show both current round token count AND cumulative session total
- Elapsed time only — no estimated remaining time
- When a round completes, replace the progress line with a static summary: "✓ Round 3 · 1,247 tokens · 14.2s" — completed rounds stack visibly

### Streaming output

- Streaming is hidden by default — user sees only the compact progress line while tokens arrive
- Opt-in via a CLI flag to see raw token stream as it generates
- When streaming is visible, show completion immediately as each parallel round finishes

### Parallel round UX

- When one parallel round finishes before the other, show its completion immediately while the other continues
- Completion summary should show time saved by parallelism: e.g. "Parallel execution saved ~12s"

### File coverage indicator

- Show file coverage before rounds start, setting expectations upfront
- Summary only — one line with counts, no per-type or per-directory breakdown
- Separate counts for analyzed, cached, and ignored files: e.g. "142 files: 104 analyzing, 28 cached, 10 ignored"

### Claude's Discretion

- Streaming output position relative to progress line (above, below, or replacing)
- Streaming output format (raw JSON tokens vs extracted text)
- Whether streaming uses existing --verbose flag or gets a dedicated --stream flag
- Parallel round display format (stacked lines, combined line, or other)
- Whether to explicitly message the user about parallel execution
- Whether to list changed filenames or just show the count on incremental runs

</decisions>

<specifics>
## Specific Ideas

- Completed round summaries should stack as rounds finish, giving a visual log of the session
- Parallel time savings should be quantified in the completion output — make the optimization visible to the user
- File coverage at the start creates a "scope contract" — user knows what's being processed before the wait begins

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 05-ux-responsiveness_
_Context gathered: 2026-02-18_
