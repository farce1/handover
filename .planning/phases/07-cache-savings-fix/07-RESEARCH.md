# Phase 7: Cache Savings Pipeline Fix - Research

**Researched:** 2026-02-19
**Domain:** TypeScript data pipeline — token usage tracking, dead code removal, CI renderer bug fix
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Cache field forwarding

- runner.ts recordRound() call must pass `cacheReadTokens: result.usage.cacheReadTokens` and `cacheCreationTokens: result.usage.cacheCreationTokens` — same pattern as inputTokens/outputTokens already passed
- round-5-edge-cases.ts recordRound() call gets the same treatment
- No schema changes needed — tracker.recordRound() already accepts these fields, and Usage schema already has them defined

#### Dead code removal

- Remove only the two items identified in the audit: `renderRenderProgress()` from components.ts and `cumulativeTokens` from DisplayState types
- Also remove `computeCumulativeTokens()` helper if it exists solely to support the dead code
- Do NOT expand scope to hunt for other dead code — this is gap closure, not a sweep

#### CI renderer fix

- `onRenderStart` should use `state.completionDocs` for the document count (already partially correct in current code with `state.completionDocs || state.renderedDocs.length`)
- The bug is upstream — whatever sets `completionDocs` on DisplayState needs to set it before onRenderStart fires

### Claude's Discretion

- Whether to add cache savings info to CI renderer's round completion log lines (parenthetical like existing cost/token format)
- Exact cleanup of any orphaned imports after dead code removal

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This phase is a focused data pipeline fix. The Anthropic provider already extracts `cacheReadTokens` and `cacheCreationTokens` from every API response (both streaming and non-streaming paths). The `TokenUsageTracker` already accepts these fields via `TokenUsage` schema and already has `getRoundCacheSavings()` and `getRoundCost()` that use them. The display layer in `generate.ts` and `components.ts` already consumes cache savings from `tracker.getRoundCacheSavings()` and populates `RoundDisplayState` cache fields. The single missing link is that `runner.ts` and `round-5-edge-cases.ts` call `tracker.recordRound()` without forwarding the cache fields from `result.usage`.

The dead code removal is straightforward: `renderRenderProgress()` in `components.ts` (exported function, never called anywhere in the codebase) and `cumulativeTokens` in the `DisplayState` interface in `types.ts` (declared optional field, never assigned or read outside its own declaration). `computeCumulativeTokens()` must be retained because it IS used inline within `renderRoundBlock()` in `components.ts` — it is NOT dead code despite the audit naming it alongside `renderRenderProgress()`.

The CI renderer bug is that `completionDocs` is set to `0` in initial display state and is only assigned after rendering completes (`displayState.completionDocs = displayState.renderedDocs.length` at line 960 in generate.ts). When `onRenderStart` fires at line 838-839 (before any docs render), `completionDocs` is still `0`. The current `state.completionDocs || state.renderedDocs.length` expression in `CIRenderer.onRenderStart` already partially handles this via the `||` fallback, but `state.renderedDocs.length` is also `0` at render start since no docs have rendered yet. The real count to show is the number of documents _about to be rendered_, which is `docsToRender.length` — but that variable is local to the render step. The fix must set `completionDocs` on `displayState` before calling `renderer.onRenderStart`.

**Primary recommendation:** Three isolated changes in three files — add two fields to one `recordRound()` call in runner.ts, add two fields to one `recordRound()` call in round-5-edge-cases.ts, remove `renderRenderProgress()` from components.ts, remove `cumulativeTokens` from types.ts, and set `displayState.completionDocs` before `renderer.onRenderStart` fires in generate.ts.

---

## Standard Stack

No new libraries required. This phase modifies existing TypeScript files in place.

### Core (in use, unchanged)

| Component         | File                                  | Role                                                                                          |
| ----------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| TokenUsageTracker | `src/context/tracker.ts`              | Stores per-round `TokenUsage` (already has cache fields)                                      |
| TokenUsage schema | `src/context/types.ts`                | Zod schema with optional `cacheReadTokens`/`cacheCreationTokens`                              |
| Usage schema      | `src/domain/schemas.ts`               | `CompletionResult.usage` — fields already defined                                             |
| executeRound      | `src/ai-rounds/runner.ts`             | Calls `tracker.recordRound()` — THE primary fix site                                          |
| analyzeModule     | `src/ai-rounds/round-5-edge-cases.ts` | Also calls `tracker.recordRound()` — secondary fix site                                       |
| generate.ts       | `src/cli/generate.ts`                 | Consumes `tracker.getRoundCacheSavings()` — already wired correctly at lines 341–349, 980–994 |
| components.ts     | `src/ui/components.ts`                | `renderRoundSavings()` and `renderCompletionSummary()` — already consume cache savings        |
| CIRenderer        | `src/ui/ci-renderer.ts`               | `onRenderStart` bug fix                                                                       |

---

## Architecture Patterns

### Pattern 1: The Data Pipeline (as it exists)

```
Anthropic API response
  └─ result.usage = {
       inputTokens, outputTokens,
       cacheReadTokens,           ← POPULATED by AnthropicProvider
       cacheCreationTokens        ← POPULATED by AnthropicProvider
     }
  └─ tracker.recordRound({        ← BROKEN: only passes input/output
       round, inputTokens, outputTokens, contextTokens, fileContentTokens, budgetTokens
       // cacheReadTokens  ← MISSING
       // cacheCreationTokens ← MISSING
     })
  └─ tracker.rounds[]             ← cache fields remain undefined
  └─ tracker.getRoundCacheSavings(roundNum) → null  (because usage.cacheReadTokens is undefined)
  └─ generate.ts line 341: if (cacheSavings) { ... }  ← branch never taken
  └─ RoundDisplayState.cacheSavingsTokens = undefined
  └─ components.ts renderRoundBlock: savings line never rendered
```

After the fix:

```
tracker.recordRound({
  round, inputTokens, outputTokens, contextTokens, fileContentTokens, budgetTokens,
  cacheReadTokens: result.usage.cacheReadTokens,   ← ADDED
  cacheCreationTokens: result.usage.cacheCreationTokens  ← ADDED
})
```

### Pattern 2: Round 5 Fan-Out Has Multiple recordRound() Calls

Round 5 is unusual. Each module analysis is a separate LLM call, and `analyzeModule()` in `round-5-edge-cases.ts` records usage independently (line 361–368). The fix must be applied there, not to the outer `executeRound5` function (which has no LLM call of its own). All module calls use round number `5` — that means the tracker will accumulate multiple `round: 5` entries. `getRoundCacheSavings(5)` uses `this.rounds.find(r => r.round === 5)` which returns only the FIRST match — meaning only the first module's savings are reflected. This is pre-existing behavior the phase does not change, but is important context: the fix for round 5 will forward cache fields, and savings will partially compute (first module only). This is acceptable given the phase scope.

### Pattern 3: Dead Code Identification

**`renderRenderProgress()` in components.ts (lines 128–130):**

```typescript
export function renderRenderProgress(docCount: number): string {
  return `${pc.dim(SYMBOLS.running)} Rendering ${docCount} documents...`;
}
```

Grep across all `.ts` files shows zero call sites. The function is exported but never imported or invoked. Safe to delete.

**`cumulativeTokens?: number` in DisplayState (types.ts line 77):**

```typescript
/** Running total of tokens across all completed + current rounds (for "(X total)" display). */
cumulativeTokens?: number;
```

Grep shows it is never assigned and never read anywhere except its own declaration. The comment suggests it was intended to track a running total for display, but `computeCumulativeTokens()` computes this on-demand from `rounds` instead. The field on DisplayState is dead. Safe to delete.

**`computeCumulativeTokens()` — NOT dead code:**
Contrary to what the audit may imply, `computeCumulativeTokens()` IS actively used:

- Defined at `components.ts` line 85
- Called at `components.ts` line 201 within `renderRoundBlock()`
- Line 258 uses the result: `const totalCount = cumulativeTokens.toLocaleString()`
  This function must be retained.

### Pattern 4: CI Renderer Bug — completionDocs Timing

In generate.ts (render step):

```typescript
// Line 835
const docsToRender = selectedDocs.filter((doc) => doc.id !== '00-index');

// Line 838–839: fires BEFORE any docs render, completionDocs still 0
if (renderer.onRenderStart) {
  renderer.onRenderStart(displayState);
}

// Line 842–854: docs render here (Promise.allSettled)

// Line 960: completionDocs set AFTER everything
displayState.completionDocs = displayState.renderedDocs.length;
```

The fix: set `displayState.completionDocs = docsToRender.length` immediately before calling `renderer.onRenderStart`. This is the count of documents _about to be rendered_. Note that this will be overwritten correctly at line 960 to reflect only the actually-rendered (non-empty) docs, so setting it here to `docsToRender.length` is a reasonable approximation for the "Rendering N documents..." message.

The `state.completionDocs || state.renderedDocs.length` expression in `CIRenderer.onRenderStart` can then be simplified to just `state.completionDocs` after the upstream fix, though keeping the `||` fallback is also acceptable.

### Claude's Discretion: Cache Savings in CI Renderer Round Lines

Current `onRoundUpdate` for completed rounds:

```typescript
const tokenStr = rd.tokens !== undefined ? formatTokens(rd.tokens) : '';
const costStr = !state.isLocal && rd.cost !== undefined ? formatCost(rd.cost) : '';
const details = [tokenStr, costStr].filter(Boolean).join(', ');
console.log(
  `${this.timestamp()} [round-${rd.roundNumber}] ${rd.name} complete${details ? ` (${details})` : ''}`,
);
```

**Recommendation: Add cache savings to CI round lines.** The CI renderer already logs per-round token/cost info. Adding cache savings here is consistent with the terminal renderer's `renderRoundSavings()` call after each done round. Suggested format: append `+Xs saved (Y%)` to the details parenthetical when `rd.cacheSavingsTokens` is set and > 0. Example output:

```
[2.1s] [round-1] Project Overview complete (12K tokens, $0.04, 8.2K saved (68%))
```

This is low-effort and consistent with existing patterns. The decision is yours — if it feels like scope creep, omit it.

---

## Don't Hand-Roll

| Problem               | Don't Build        | Use Instead                                                  |
| --------------------- | ------------------ | ------------------------------------------------------------ |
| Tracking cache tokens | Custom accumulator | `TokenUsage` schema already has optional cache fields        |
| Computing savings     | Manual math        | `tracker.getRoundCacheSavings()` already does this correctly |
| Schema validation     | Runtime checks     | Zod `optional()` fields — undefined passthrough is fine      |

---

## Common Pitfalls

### Pitfall 1: `computeCumulativeTokens()` Mistaken for Dead Code

**What goes wrong:** Deleting `computeCumulativeTokens()` because it sounds related to the dead `cumulativeTokens` field.

**Why it happens:** The naming is similar: `cumulativeTokens` (field) vs `computeCumulativeTokens()` (function). But the function is used inside `renderRoundBlock()` to produce the `(Y,YYY total)` part of the running round display line.

**How to avoid:** Grep before deleting: `grep -r "computeCumulativeTokens" src/` returns a hit at `components.ts:201`. Only delete if zero call sites.

**Warning signs:** TypeScript will error if the import is removed but the function is still called.

### Pitfall 2: Round 5 recordRound() Is in `analyzeModule()`, Not `executeRound5()`

**What goes wrong:** Adding cache fields to the wrong call site in round-5-edge-cases.ts.

**Why it happens:** The file has two levels — `executeRound5()` orchestrates, `analyzeModule()` makes actual LLM calls and records usage. The `tracker.recordRound()` call is at `analyzeModule()` line 361–368.

**How to avoid:** Search for `tracker.recordRound` in round-5-edge-cases.ts — it appears once, inside `analyzeModule()`.

### Pitfall 3: completionDocs Fix Is Upstream, Not in CIRenderer

**What goes wrong:** Trying to fix the count by reading a different field or doing extra computation inside `CIRenderer.onRenderStart`.

**Why it happens:** The CIRenderer receives `state` by reference but the count it needs (`docsToRender.length`) is local to the render step in generate.ts.

**How to avoid:** Set `displayState.completionDocs = docsToRender.length` in generate.ts before calling `renderer.onRenderStart`. The CIRenderer fix then becomes just removing the dead `|| state.renderedDocs.length` fallback (or leaving it — both are correct after the upstream fix).

### Pitfall 4: Round 5 Multi-Call Accumulation Is Pre-Existing, Not a New Bug

**What goes wrong:** Noticing that `tracker.rounds` will contain multiple entries with `round: 5` after the fix and treating this as a new regression to fix.

**Why it happens:** Round 5 fans out N module calls, each calling `recordRound({round: 5})`. This was already the case before the fix. `getRoundCacheSavings(5)` finds only the first entry. This phase does not change this behavior.

**How to avoid:** Scope check — phase is gap closure only, not a sweep.

### Pitfall 5: OpenAI/Other Providers Sending undefined for Cache Fields

**What goes wrong:** Assuming `result.usage.cacheReadTokens` might be `null` instead of `undefined` and writing defensive checks that diverge from the established pattern.

**Why it happens:** The Anthropic SDK uses `?? undefined` to convert null to undefined. The `UsageSchema` in `domain/schemas.ts` uses `.optional()`. The `TokenUsageSchema` in `context/types.ts` also uses `.optional()`. Passing `undefined` to `recordRound()` is safe — it just means `usage.cacheReadTokens` remains undefined, and `getRoundCacheSavings()` returns null (which is correct for non-Anthropic runs).

**How to avoid:** Follow the exact pattern already used for `inputTokens`/`outputTokens` — no extra null checks needed.

---

## Code Examples

### Fix 1: runner.ts — Add cache fields to recordRound() call

Source: Direct codebase reading (runner.ts lines 64–72)

Current code:

```typescript
// runner.ts line 64-72
tracker.recordRound({
  round: roundNumber,
  inputTokens: result.usage.inputTokens,
  outputTokens: result.usage.outputTokens,
  contextTokens: estimateTokensFn(promptText),
  fileContentTokens: 0,
  budgetTokens: provider.maxContextTokens(),
});
```

Fixed code:

```typescript
tracker.recordRound({
  round: roundNumber,
  inputTokens: result.usage.inputTokens,
  outputTokens: result.usage.outputTokens,
  cacheReadTokens: result.usage.cacheReadTokens,
  cacheCreationTokens: result.usage.cacheCreationTokens,
  contextTokens: estimateTokensFn(promptText),
  fileContentTokens: 0,
  budgetTokens: provider.maxContextTokens(),
});
```

### Fix 2: round-5-edge-cases.ts — Add cache fields to analyzeModule() recordRound() call

Source: Direct codebase reading (round-5-edge-cases.ts lines 361–368)

Current code:

```typescript
// round-5-edge-cases.ts line 361-368
tracker.recordRound({
  round: 5,
  inputTokens: result.usage.inputTokens,
  outputTokens: result.usage.outputTokens,
  contextTokens: estimateTokensFn(promptText),
  fileContentTokens: 0,
  budgetTokens: provider.maxContextTokens(),
});
```

Fixed code:

```typescript
tracker.recordRound({
  round: 5,
  inputTokens: result.usage.inputTokens,
  outputTokens: result.usage.outputTokens,
  cacheReadTokens: result.usage.cacheReadTokens,
  cacheCreationTokens: result.usage.cacheCreationTokens,
  contextTokens: estimateTokensFn(promptText),
  fileContentTokens: 0,
  budgetTokens: provider.maxContextTokens(),
});
```

### Fix 3: components.ts — Remove renderRenderProgress()

Source: Direct codebase reading (components.ts lines 128–130)

Remove the entire exported function block:

```typescript
// DELETE this entire block:
/**
 * Render the aggregate render start/done lines.
 * Per locked decision: "Rendering N documents..." then done — no per-doc status.
 */
export function renderRenderProgress(docCount: number): string {
  return `${pc.dim(SYMBOLS.running)} Rendering ${docCount} documents...`;
}
```

No import cleanup needed — `renderRenderProgress` is exported but never imported elsewhere.

### Fix 4: types.ts — Remove cumulativeTokens from DisplayState

Source: Direct codebase reading (types.ts line 76–78)

Remove lines:

```typescript
// DELETE these lines from DisplayState:
  /** Running total of tokens across all completed + current rounds (for "(X total)" display). */
  cumulativeTokens?: number;
```

No import cleanup needed — it's a type field, not a runtime reference.

### Fix 5: generate.ts — Set completionDocs before onRenderStart

Source: Direct codebase reading (generate.ts lines 835–839)

Current code:

```typescript
const docsToRender = selectedDocs.filter((doc) => doc.id !== '00-index');

// Emit render start (aggregate progress only — per locked decision)
if (renderer.onRenderStart) {
  renderer.onRenderStart(displayState);
}
```

Fixed code:

```typescript
const docsToRender = selectedDocs.filter((doc) => doc.id !== '00-index');

// Set completionDocs to expected count before onRenderStart so CI renderer
// can log "Rendering N documents..." with the correct count.
displayState.completionDocs = docsToRender.length;

// Emit render start (aggregate progress only — per locked decision)
if (renderer.onRenderStart) {
  renderer.onRenderStart(displayState);
}
```

Note: `completionDocs` is later overwritten at line 960 with `displayState.renderedDocs.length` (actual rendered count, excluding empty renders). This is correct — the render-start message shows expected count, completion shows actual count.

### Optional Fix 6: ci-renderer.ts — Simplify onRenderStart expression

After Fix 5, the `||` fallback in CIRenderer.onRenderStart becomes unnecessary:

Current:

```typescript
onRenderStart(state: DisplayState): void {
  console.log(
    `${this.timestamp()} [render] Rendering ${state.completionDocs || state.renderedDocs.length} documents...`,
  );
}
```

Simplified (if desired):

```typescript
onRenderStart(state: DisplayState): void {
  console.log(
    `${this.timestamp()} [render] Rendering ${state.completionDocs} documents...`,
  );
}
```

This simplification is safe but optional.

### Optional Fix 7: ci-renderer.ts — Add cache savings to round completion lines

Source: Direct codebase reading (ci-renderer.ts lines 87–103)

```typescript
onRoundUpdate(state: DisplayState): void {
  for (const [, rd] of state.rounds) {
    if (rd.status === 'cached') {
      console.log(`${this.timestamp()} [round-${rd.roundNumber}] ${rd.name} cached`);
    } else if (rd.status === 'done') {
      const tokenStr = rd.tokens !== undefined ? formatTokens(rd.tokens) : '';
      const costStr = !state.isLocal && rd.cost !== undefined ? formatCost(rd.cost) : '';
      // Add cache savings if present
      const savingsStr =
        rd.cacheSavingsTokens && rd.cacheSavingsTokens > 0 && rd.cacheSavingsPercent !== undefined
          ? `${formatTokens(rd.cacheSavingsTokens)} saved (${Math.round(rd.cacheSavingsPercent * 100)}%)`
          : '';
      const details = [tokenStr, costStr, savingsStr].filter(Boolean).join(', ');
      console.log(
        `${this.timestamp()} [round-${rd.roundNumber}] ${rd.name} complete${details ? ` (${details})` : ''}`,
      );
    } else if (rd.status === 'failed') {
      const reason = rd.retryReason ? ` (${rd.retryReason})` : '';
      console.log(`${this.timestamp()} [round-${rd.roundNumber}] ${rd.name} FAILED${reason}`);
    }
  }
}
```

---

## File Map: What Changes and Why

| File                                  | Change                                                                                                        | Why                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/ai-rounds/runner.ts`             | Add `cacheReadTokens`/`cacheCreationTokens` to `recordRound()` call (lines 64–72)                             | Plugs the pipeline break — cache fields from Anthropic response are now stored |
| `src/ai-rounds/round-5-edge-cases.ts` | Same addition in `analyzeModule()` `recordRound()` call (lines 361–368)                                       | Same fix for Round 5 fan-out path                                              |
| `src/ui/components.ts`                | Delete `renderRenderProgress()` (lines 128–130 + JSDoc block above)                                           | Dead code — never called anywhere                                              |
| `src/ui/types.ts`                     | Delete `cumulativeTokens?: number` field + comment from `DisplayState` (lines 76–78)                          | Dead field — never assigned or read                                            |
| `src/cli/generate.ts`                 | Set `displayState.completionDocs = docsToRender.length` before `renderer.onRenderStart` call (after line 835) | Fixes CI renderer seeing `0` as doc count during render start                  |
| `src/ui/ci-renderer.ts`               | Simplify `onRenderStart` (remove `                                                                            |                                                                                | state.renderedDocs.length` fallback); optionally add savings to round lines | Cleanup after upstream fix; optional savings enhancement |

**Files NOT changed:**

- `src/context/tracker.ts` — already correct
- `src/context/types.ts` — `TokenUsage` schema already has optional cache fields
- `src/domain/schemas.ts` — `UsageSchema` already has optional cache fields
- `src/providers/anthropic.ts` — already populates both cache fields
- `src/cli/generate.ts` (lines 341–349, 980–994) — already correctly consumes cache data

---

## State of the Art

| Area                              | Current State                          | After Phase 7                                  |
| --------------------------------- | -------------------------------------- | ---------------------------------------------- |
| Cache fields in API response      | Populated by AnthropicProvider         | No change                                      |
| Cache fields in tracker           | `undefined` (always) — pipeline broken | Populated when Anthropic returns cache hits    |
| `getRoundCacheSavings()` return   | Always `null`                          | Returns savings object on Anthropic cache hits |
| Terminal per-round savings lines  | Never render                           | Render when cache hits occur                   |
| Completion summary savings        | Never render                           | Render when cache hits occur                   |
| `renderRenderProgress()`          | Dead export in components.ts           | Removed                                        |
| `DisplayState.cumulativeTokens`   | Dead optional field                    | Removed                                        |
| CI `onRenderStart` document count | Shows `0` (bug)                        | Shows correct expected count                   |

---

## Open Questions

1. **Round 5 multi-entry accumulation for cache savings**
   - What we know: `tracker.getRoundCacheSavings(5)` returns savings for the first recorded round-5 entry only (because `Array.find()` stops at the first match). Round 5 calls `recordRound({round: 5})` once per module analysis.
   - What's unclear: After the fix, cache reads will be recorded per module call, but only the first module's cache savings feed into `getRoundCacheSavings(5)`.
   - Recommendation: Accept as pre-existing behavior. Phase scope is gap closure only. A future phase could address `getRoundCacheSavings()` aggregation for fan-out rounds.

2. **`onRoundUpdate` duplicate-log prevention in CIRenderer**
   - What we know: `onRoundUpdate` is called on every round state change. For the `done` branch, it fires once when the round completes (in `onStepComplete`). But there is no guard preventing it from logging the same round multiple times if `onRoundUpdate` is called again after a round is already `done`.
   - What's unclear: Whether this is a real problem in practice (the existing code has the same structure — this is not introduced by Phase 7).
   - Recommendation: Out of scope. Do not address.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase reading:
  - `src/ai-rounds/runner.ts` — confirmed `recordRound()` call at lines 64–72 (missing cache fields)
  - `src/ai-rounds/round-5-edge-cases.ts` — confirmed `recordRound()` call in `analyzeModule()` at lines 361–368 (missing cache fields)
  - `src/context/tracker.ts` — confirmed `recordRound(usage: TokenUsage)` accepts optional cache fields; `getRoundCacheSavings()` at lines 164–189; `getRoundCost()` at 195–204 already uses cache fields
  - `src/context/types.ts` — confirmed `TokenUsageSchema` has `cacheReadTokens: z.number().optional()` and `cacheCreationTokens: z.number().optional()`
  - `src/domain/schemas.ts` — confirmed `UsageSchema` has same optional cache fields
  - `src/providers/anthropic.ts` — confirmed both streaming (line 101–103) and non-streaming (lines 133–136) paths return `cacheReadTokens` and `cacheCreationTokens`
  - `src/cli/generate.ts` — confirmed display-side cache wiring at lines 341–349 (onStepComplete), 970–994 (roundSummaries); confirmed `completionDocs` bug at lines 835–839 vs 960
  - `src/ui/components.ts` — confirmed `renderRenderProgress()` has zero call sites; confirmed `computeCumulativeTokens()` IS called at line 201; confirmed cache savings rendering at lines 222–236 and 374–377
  - `src/ui/types.ts` — confirmed `cumulativeTokens?: number` has zero assignments/reads outside declaration
  - `src/ui/ci-renderer.ts` — confirmed `onRenderStart` bug and round completion log format

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new libraries, all existing TypeScript/Zod
- Architecture: HIGH — confirmed by direct source reading, no inference
- Pitfalls: HIGH — confirmed by grep (dead code) and timing trace (CI renderer bug)
- Dead code identification: HIGH — grep verified zero call sites for `renderRenderProgress` and `cumulativeTokens`
- `computeCumulativeTokens` retention: HIGH — grep confirmed call site at components.ts:201

**Research date:** 2026-02-19
**Valid until:** Stable — internal codebase, no external API changes involved
