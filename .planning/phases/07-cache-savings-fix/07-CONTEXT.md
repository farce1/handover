# Phase 7: Cache Savings Pipeline Fix - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the broken data pipeline so cache token savings (cacheReadTokens, cacheCreationTokens) flow from Anthropic API response through runner.ts to tracker.recordRound(), enabling the existing display code to render per-round savings. Remove identified dead code. Fix CIRenderer document count bug. No new features.

</domain>

<decisions>
## Implementation Decisions

### Cache field forwarding

- runner.ts recordRound() call must pass `cacheReadTokens: result.usage.cacheReadTokens` and `cacheCreationTokens: result.usage.cacheCreationTokens` — same pattern as inputTokens/outputTokens already passed
- round-5-edge-cases.ts recordRound() call gets the same treatment
- No schema changes needed — tracker.recordRound() already accepts these fields, and Usage schema already has them defined

### Dead code removal

- Remove only the two items identified in the audit: `renderRenderProgress()` from components.ts and `cumulativeTokens` from DisplayState types
- Also remove `computeCumulativeTokens()` helper if it exists solely to support the dead code
- Do NOT expand scope to hunt for other dead code — this is gap closure, not a sweep

### CI renderer fix

- `onRenderStart` should use `state.completionDocs` for the document count (already partially correct in current code with `state.completionDocs || state.renderedDocs.length`)
- The bug is upstream — whatever sets `completionDocs` on DisplayState needs to set it before onRenderStart fires

### Claude's Discretion

- Whether to add cache savings info to CI renderer's round completion log lines (parenthetical like existing cost/token format)
- Exact cleanup of any orphaned imports after dead code removal

</decisions>

<specifics>
## Specific Ideas

- The display code in generate.ts (lines ~341-348, ~980-991) and components.ts (lines ~224-233) already handles rendering cache savings — the only missing piece is the data pipeline in runner.ts and round-5-edge-cases.ts
- Follow the exact same field names and patterns already established in the codebase: `cacheReadTokens`, `cacheCreationTokens`, `cacheSavingsTokens`, `cacheSavingsPercent`, `cacheSavingsDollars`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 07-cache-savings-fix_
_Context gathered: 2026-02-19_
