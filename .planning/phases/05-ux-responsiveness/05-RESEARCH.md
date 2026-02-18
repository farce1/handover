# Phase 5: UX Responsiveness - Research

**Researched:** 2026-02-18
**Domain:** Terminal UI / LLM streaming / DAG parallelism / file coverage display
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Progress display

- Compact single-line progress that updates in place: e.g. "Round 3/6 ◆ 1,247 tokens (3,891 total) · 12.3s"
- Show both current round token count AND cumulative session total
- Elapsed time only — no estimated remaining time
- When a round completes, replace the progress line with a static summary: "✓ Round 3 · 1,247 tokens · 14.2s" — completed rounds stack visibly

#### Streaming output

- Streaming is hidden by default — user sees only the compact progress line while tokens arrive
- Opt-in via a CLI flag to see raw token stream as it generates
- When streaming is visible, show completion immediately as each parallel round finishes

#### Parallel round UX

- When one parallel round finishes before the other, show its completion immediately while the other continues
- Completion summary should show time saved by parallelism: e.g. "Parallel execution saved ~12s"

#### File coverage indicator

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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 5 delivers four independent UX improvements to the `generate` command: a live token counter with elapsed timer, opt-in streaming output, visual parallel round execution, and a file coverage indicator. All four features layer on top of existing infrastructure — the `TerminalRenderer`, `DisplayState`, `AnthropicProvider`/`OpenAICompatibleProvider`, `DAGOrchestrator`, and `PackedContext` — without adding new commands or top-level pipeline steps.

The codebase is already well-suited for this phase. The `TerminalRenderer` already does in-place line rewrites via `sisteransi`. The `DAGOrchestrator` already executes rounds 5 and 6 in parallel when their deps are met. The `PackedContext` already carries the metadata needed to display file coverage (fullFiles, signatureFiles, skippedFiles). The primary engineering work is: (1) plumbing a per-token callback from the streaming API through the provider layer to the renderer, (2) wiring the elapsed timer into the spinner tick, (3) surfacing parallelism savings in the completion output, and (4) emitting the file coverage line at the right moment in generate.ts.

The critical architectural constraint: both providers use structured output via tool_use / function_call. Streaming in tool_use mode returns `input_json_delta` events, not `text_delta`. The streaming feature must handle this: either stream the raw JSON token-by-token (low value for the user), or display a token-count progress bar without displaying the raw tokens (which are unreadable JSON fragments). The locked decision says streaming is opt-in and by default only the progress line is shown — this aligns well with tool_use streaming, where the primary user-visible value is the token counter, not the raw output.

**Primary recommendation:** Add an `onToken` callback to `doComplete()` in both providers; drive the live progress line from the spinner interval (already ticking at 80ms) plus elapsed-time tracking already in `RoundDisplayState`; use `PackedContext.metadata` for the file coverage line; compute parallel savings in `onComplete()` from per-round timing data.

---

## Standard Stack

### Core (already installed — no new packages needed)

| Library             | Version | Purpose                             | Why Standard                                             |
| ------------------- | ------- | ----------------------------------- | -------------------------------------------------------- |
| `@anthropic-ai/sdk` | ^0.39.0 | Anthropic streaming API             | Already installed; `messages.stream()` available         |
| `openai`            | ^5.23.2 | OpenAI streaming API                | Already installed; `chat.completions.stream()` available |
| `sisteransi`        | 1.0.5   | Cursor control for in-place updates | Already drives TerminalRenderer                          |
| `picocolors`        | 1.1.1   | Color output                        | Already drives all UI components                         |

### No New Dependencies Required

All four UX features can be implemented using the existing stack. No npm installs needed.

**Installation:**

```bash
# No new packages — all dependencies already present
```

---

## Architecture Patterns

### Recommended Structure Changes

```
src/
├── providers/
│   ├── base.ts               # Add onToken to LLMProvider interface
│   ├── base-provider.ts      # Thread onToken through complete() → doComplete()
│   ├── anthropic.ts          # Implement streaming with input_json_delta counting
│   └── openai-compat.ts      # Implement streaming with chunk counting
├── ui/
│   ├── types.ts              # Add streamingTokens, roundStartMs to RoundDisplayState
│   │                         # Add fileCoverage to DisplayState
│   ├── components.ts         # Update renderRoundBlock for live counter format
│   │                         # Add renderFileCoverage()
│   └── renderer.ts           # Wire elapsed-time into spinner tick; add onToken handler
└── cli/
    └── generate.ts           # Emit file coverage line; compute parallel savings;
                              # wire --stream flag
```

### Pattern 1: Live Token Counter via Streaming Callback

**What:** Add `onToken?: (tokenCount: number) => void` to `doComplete()`. Both provider implementations call `onToken` once per token delta received. The `TerminalRenderer` stores the running count in `RoundDisplayState.streamingTokens` and the spinner interval (already ticking at 80ms) re-renders the progress line on each tick.

**When to use:** Default behavior — always active when provider supports streaming. The user sees the counter update every ~80ms without seeing raw token text.

**Key insight for Anthropic provider:** `messages.stream()` with `tool_choice: {type: 'tool', name: ...}` returns `content_block_delta` events with `delta.type === 'input_json_delta'`. The token text is JSON fragments, but we can count characters arriving (or use `message_delta` usage fields at end). The practical approach: count `input_json_delta` delta characters as a proxy for streaming tokens, then replace with actual `usage.output_tokens` from `finalMessage()`.

**Example (Anthropic streaming with tool_use):**

```typescript
// Source: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/README.md
protected async doComplete<T>(
  request: CompletionRequest,
  schema: z.ZodType<T>,
  onToken?: (count: number) => void,
): Promise<CompletionResult & { data: T }> {
  // Use streaming API when onToken callback provided
  if (onToken) {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
      tools: [{ name: 'structured_response', /* ... */ }],
      tool_choice: { type: 'tool', name: 'structured_response' },
      temperature: request.temperature ?? 0.7,
    });

    let charCount = 0;
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'input_json_delta'
      ) {
        charCount += event.delta.partial_json.length;
        // Rough token estimate: 4 chars/token
        onToken(Math.ceil(charCount / 4));
      }
    }

    const message = await stream.finalMessage();
    // Extract tool block and parse as before...
  }
  // Fall back to non-streaming (existing code) when no callback
}
```

**Example (OpenAI streaming):**

```typescript
// Source: https://context7.com/openai/openai-node/llms.txt
if (onToken) {
  let tokenCount = 0;
  const runner = this.client.chat.completions.stream({
    /* ... */
  });
  runner.on('chunk', (chunk) => {
    // tool_calls argument deltas arrive in chunk.choices[0].delta.tool_calls
    const argDelta = chunk.choices[0]?.delta?.tool_calls?.[0]?.function?.arguments ?? '';
    tokenCount += Math.ceil(argDelta.length / 4);
    onToken(tokenCount);
  });
  const completion = await runner.finalChatCompletion();
  // Extract tool_calls[0].function.arguments and parse...
}
```

### Pattern 2: Elapsed Timer in Spinner Tick

**What:** The spinner interval already fires every 80ms in `TerminalRenderer`. Add a `roundStartMs` field to `RoundDisplayState`. In the spinner tick, compute `elapsedMs = Date.now() - rd.roundStartMs` before re-rendering. The existing `formatDuration()` function already handles seconds/minutes formatting.

**Current state:** `rd.elapsedMs` exists but is only set on round _completion_ (from `result.duration`). For live display, we need to derive it dynamically in the spinner tick.

**When to use:** Always — this is the default live counter behavior (no streaming needed).

**Example:**

```typescript
// In TerminalRenderer.startSpinner() interval callback:
for (const [, rd] of state.rounds) {
  if (rd.status === 'running' && rd.roundStartMs) {
    rd.elapsedMs = Date.now() - rd.roundStartMs; // live update
  }
}
```

### Pattern 3: File Coverage Indicator

**What:** The `PackedContext.metadata` already contains `fullFiles`, `signatureFiles`, `skippedFiles`, `totalFiles`. Emit a single line after `onAnalyzersDone` and before the first round starts, using these values.

**Mapping to user-visible terminology:**

- "analyzing" = `fullFiles + signatureFiles` (files sent to LLM in any form)
- "cached" = rounds that hit cache (not file-level — this needs clarification, see Open Questions)
- "ignored" = `skippedFiles` (files with `tier: 'skip'`)

**Best moment to display:** After `packedContext` is assigned in the static-analysis step, immediately before `displayState.phase = 'ai-rounds'`. At that point `packedContext.metadata` is populated.

**Example component:**

```typescript
export function renderFileCoverage(metadata: PackedContext['metadata']): string {
  const analyzing = metadata.fullFiles + metadata.signatureFiles;
  const total = metadata.totalFiles;
  const ignored = metadata.skippedFiles;
  return `  ${pc.dim('◆')} ${total} files: ${analyzing} analyzing, ${ignored} ignored`;
}
```

Note: "cached" in the CONTEXT.md refers to round-level caching, not file-level. The file coverage line shows files scope before rounds run, so "cached" count cannot be known yet. The planner should resolve whether "cached" means something at the file packer level (currently no such concept) or if that term should be omitted from the file coverage line.

### Pattern 4: Parallel Round Savings

**What:** Compute time saved by parallelism in `onComplete()`. Store start times per round in `RoundDisplayState.roundStartMs` and end times (or use `result.duration`). Parallel savings = `sum(sequential durations) - wall_clock_time_for_parallel_group`.

**Rounds 5 and 6 already run in parallel** via the `DAGOrchestrator` (both declare `deps: ['ai-round-2']`). No dep declaration changes needed. The savings computation is purely display logic.

**Example:**

```typescript
// In generate.ts onComplete:
const r5 = displayState.rounds.get(5);
const r6 = displayState.rounds.get(6);
if (r5 && r6 && r5.status !== 'cached' && r6.status !== 'cached') {
  const parallelDuration = Math.max(r5.elapsedMs, r6.elapsedMs);
  const sequentialDuration = r5.elapsedMs + r6.elapsedMs;
  const savedMs = sequentialDuration - parallelDuration;
  if (savedMs > 1000) {
    // Append to completion: "Parallel execution saved ~12s"
  }
}
```

### Pattern 5: Opt-in Streaming Flag

**What:** Add `--stream` flag to the `generate` command in `src/cli/index.ts`. Pass it through `GenerateOptions` to `runGenerate`. When `options.stream` is true, provide `onToken` callbacks to providers; when false (default), `onToken` is undefined and providers fall back to non-streaming `messages.create()`.

**Claude's discretion: Recommend `--stream` as a dedicated flag** (not reusing `--verbose`) because:

- `--verbose` already has a defined meaning (debug output to stderr, round cache keys, etc.)
- `--stream` is a distinct user intent (see generated tokens, not debug info)
- The two flags should be independently composable

**Streaming output format recommendation: extracted text only, not raw JSON.** The `input_json_delta` events contain JSON fragments like `"projectName": "han`. Displaying raw fragments is noisy. Better: extract readable text from the JSON as it accumulates, or simply display a pulsing indicator. The simplest viable approach: when `--stream` is active, show the streaming token count updating faster/more visibly, plus a note that streaming is active. The "raw token stream" from the locked decision likely means the token text visible to the user in some form — displaying a clean extraction or just the counter is preferable.

**Recommendation for streaming output position:** Below the progress line, in a dedicated second line. When a round completes, the streaming line is cleared and the summary line replaces the progress line.

### Anti-Patterns to Avoid

- **Re-rendering from a streaming callback directly:** Calling `renderer.onRoundUpdate()` on every token would flood at ~100+ tokens/second, causing visual flicker. Route tokens through the 80ms spinner interval instead — accumulate the count and let the spinner redraw.
- **Blocking the round on stream processing:** The streaming API returns a stream object; the round's result still comes from `finalMessage()`. Don't return early from `doComplete()` before calling `finalMessage()`.
- **Changing round dependency declarations:** Rounds 5 and 6 already declare `deps: ['ai-round-2']` and already run in parallel. No dep changes needed. The "audit and fix dep declarations" plan item may refer to verifying that `wrapWithCache` doesn't accidentally serialize them — it does not, since it wraps each step independently.

---

## Don't Hand-Roll

| Problem                 | Don't Build                  | Use Instead                                              | Why                                                  |
| ----------------------- | ---------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| In-place line rewrites  | Custom ANSI escape sequences | `sisteransi.erase.lines()` + `cursor.*`                  | Already used in TerminalRenderer; handles edge cases |
| Token streaming         | Custom SSE parsing           | `client.messages.stream()` / `chat.completions.stream()` | SDK handles reconnect, error, backpressure           |
| Elapsed time formatting | Custom formatter             | `formatDuration()` in `src/ui/formatters.ts`             | Already handles seconds/minutes; zero-cost reuse     |
| Token count formatting  | Custom formatter             | `formatTokens()` in `src/ui/formatters.ts`               | Already handles K/M suffixes                         |
| Parallel execution      | Custom worker threads        | `DAGOrchestrator` via `Promise.race()`                   | Already executes rounds 5+6 in parallel              |

**Key insight:** Streaming with tool_use returns JSON deltas, not human-readable text. The user-visible streaming feature is primarily about the _counter_, not raw text display.

---

## Common Pitfalls

### Pitfall 1: Streaming + Tool Use = No Text Delta Events

**What goes wrong:** Developer enables streaming and listens for `text_delta` events, gets nothing, concludes streaming doesn't work.

**Why it happens:** When `tool_choice: {type: 'tool', name: '...'}` is set, the model responds entirely via a tool_use block. The streaming delta type is `input_json_delta`, not `text_delta`. The `text` event on the helper API also won't fire.

**How to avoid:** Listen for `content_block_delta` with `delta.type === 'input_json_delta'` for Anthropic. For OpenAI, listen for `chunk.choices[0].delta.tool_calls[0].function.arguments` deltas. Use the character count as a proxy for token count, and replace with actual usage from `finalMessage()`.

**Warning signs:** `stream.on('text', handler)` fires zero times; stream completes but no text was received.

### Pitfall 2: Token Count Mismatch Between Stream and Final

**What goes wrong:** The running token count shown during streaming differs significantly from the actual token count in the `usage` field of the final message.

**Why it happens:** Character-based estimation (chars/4) is a rough heuristic. The actual output token count from the API is authoritative. For tool_use responses, the output token count includes schema overhead not reflected in the argument JSON characters.

**How to avoid:** Treat the streaming count as a "live estimate". When the round completes, replace the displayed count with `usage.outputTokens` from the final result. There will be a visible "snap" on completion — this is acceptable and expected.

### Pitfall 3: Spinner Interval Referencing Stale State

**What goes wrong:** After a round completes, the spinner interval still tries to update `rd.elapsedMs` for that round, overwriting the final duration stored in `result.duration`.

**Why it happens:** The `startSpinner()` interval captures `this.currentState` but updates round display state in-place. If the interval fires after `onStepComplete` has set `rd.status = 'done'` but before the next render, it may update `elapsedMs` with a stale value.

**How to avoid:** Guard elapsed-time updates: `if (rd.status === 'running' && rd.roundStartMs)`. Only update `elapsedMs` for rounds still in `running` status.

### Pitfall 4: Parallel Savings Calculation with Cached Rounds

**What goes wrong:** Rounds 5 and 6 are both cached on a re-run; the parallelism savings message incorrectly fires with duration 0.

**Why it happens:** Cached rounds set `rd.elapsedMs = 0` and `rd.status = 'cached'`. The savings formula `max(r5, r6)` gives 0 for cached runs, and `sum - max = 0`, so no savings are shown — but the code must not accidentally show "saved 0s".

**How to avoid:** Only emit the parallel savings message when both rounds ran (not cached) and `savedMs > threshold (e.g. 2000ms)`.

### Pitfall 5: Streaming Breaks the Retry Logic

**What goes wrong:** The streaming version of `doComplete()` doesn't honor the retry path in `BaseProvider.complete()` → `retryWithBackoff()`, because the stream is opened directly inside `doComplete()` rather than being retried by the backoff wrapper.

**Why it happens:** `retryWithBackoff` wraps a function call. If `doComplete` opens a stream and the stream errors mid-way, the error bubbles up to `retryWithBackoff` correctly — this is fine. But if `doComplete` does partial work before the error, the `onToken` count will be mid-stream on retry.

**How to avoid:** Reset the token count in `onToken` before each attempt. The `retryWithBackoff` call wraps the entire `doComplete`, so each retry starts fresh.

---

## Code Examples

Verified patterns from official sources:

### Anthropic Streaming with Tool Use (input_json_delta)

```typescript
// Source: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/README.md
// and https://context7.com/anthropics/anthropic-sdk-typescript/llms.txt

const stream = this.client.messages.stream({
  model: this.model,
  max_tokens: request.maxTokens ?? 4096,
  system: request.systemPrompt,
  messages: [{ role: 'user', content: request.userPrompt }],
  tools: [
    {
      name: 'structured_response',
      description: 'Return the analysis result as structured data',
      input_schema: inputSchema,
    },
  ],
  tool_choice: { type: 'tool' as const, name: 'structured_response' },
  temperature: request.temperature ?? 0.7,
});

let estimatedTokens = 0;
for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
    estimatedTokens += Math.ceil(event.delta.partial_json.length / 4);
    onToken?.(estimatedTokens);
  }
}

const message = await stream.finalMessage();
// message.usage.output_tokens is the authoritative count
```

### OpenAI Streaming with Function Calls

```typescript
// Source: https://context7.com/openai/openai-node/llms.txt

const runner = this.client.chat.completions.stream({
  model: this.model,
  messages: [
    { role: 'system', content: request.systemPrompt },
    { role: 'user', content: request.userPrompt },
  ],
  tools: [{ type: 'function' as const, function: { name: 'structured_response' /* ... */ } }],
  tool_choice: { type: 'function' as const, function: { name: 'structured_response' } },
  temperature: request.temperature ?? 0.3,
  max_tokens: request.maxTokens ?? 4096,
});

let estimatedTokens = 0;
runner.on('chunk', (chunk) => {
  const argDelta = chunk.choices[0]?.delta?.tool_calls?.[0]?.function?.arguments ?? '';
  if (argDelta) {
    estimatedTokens += Math.ceil(argDelta.length / 4);
    onToken?.(estimatedTokens);
  }
});

const completion = await runner.finalChatCompletion();
// completion.usage?.completion_tokens is authoritative
```

### Live Progress Line Format

```typescript
// Implementing the locked decision format:
// "Round 3/6 ◆ 1,247 tokens (3,891 total) · 12.3s"

function renderRoundProgressLine(
  rd: RoundDisplayState,
  totalRounds: number,
  cumulativeTokens: number,
  spinnerFrame: number,
): string {
  const frame = SPINNER_FRAMES.frames[spinnerFrame % SPINNER_FRAMES.frames.length];
  const elapsed = (rd.elapsedMs / 1000).toFixed(1);
  const roundTokens = rd.streamingTokens ?? 0;
  return (
    `Round ${rd.roundNumber}/${totalRounds} ` +
    `${pc.magenta(frame)} ` +
    `${roundTokens.toLocaleString()} tokens ` +
    `${pc.dim(`(${cumulativeTokens.toLocaleString()} total)`)} ` +
    `${pc.dim('·')} ${elapsed}s`
  );
}
```

### File Coverage Indicator

```typescript
// Implementing the locked decision format:
// "142 files: 104 analyzing, 28 cached, 10 ignored"
// Note: "cached" at file level doesn't exist; omit unless plan decides otherwise

export function renderFileCoverage(metadata: {
  totalFiles: number;
  fullFiles: number;
  signatureFiles: number;
  skippedFiles: number;
}): string {
  const analyzing = metadata.fullFiles + metadata.signatureFiles;
  const ignored = metadata.skippedFiles;
  const sep = pc.dim(' · ');
  return (
    `  ${pc.dim('◆')} ` +
    `${metadata.totalFiles} files${sep}` +
    `${pc.cyan(String(analyzing))} analyzing${sep}` +
    `${pc.dim(String(ignored))} ignored`
  );
}
```

### Parallel Savings Computation

```typescript
// In generate.ts, before renderer.onComplete():
function computeParallelSavings(rounds: Map<number, RoundDisplayState>): number | null {
  const r5 = rounds.get(5);
  const r6 = rounds.get(6);
  if (!r5 || !r6) return null;
  if (r5.status === 'cached' || r6.status === 'cached') return null;
  if (r5.status !== 'done' || r6.status !== 'done') return null;

  const parallelWallTime = Math.max(r5.elapsedMs, r6.elapsedMs);
  const sequentialTime = r5.elapsedMs + r6.elapsedMs;
  const savedMs = sequentialTime - parallelWallTime;
  return savedMs > 2000 ? savedMs : null; // Only show if > 2s
}
```

---

## State of the Art

| Old Approach                      | Current Approach                                  | Impact                                         |
| --------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Non-streaming `messages.create()` | `messages.stream()` with async iteration          | Token-by-token delta events available          |
| Timer only set on completion      | `roundStartMs` + spinner tick update              | Live elapsed time without extra API calls      |
| File count only in banner         | `PackedContext.metadata` with tier breakdown      | Full analyzing/ignored counts already computed |
| Sequential round display          | DAG already parallel; display needs to reflect it | No DAG changes; display-only work              |

**Key current version notes (HIGH confidence, verified via Context7):**

- `@anthropic-ai/sdk` 0.39.x: `messages.stream()` returns `MessageStream`; supports `for await` on events; `input_json_delta` is the delta type for tool_use content blocks.
- `openai` 5.23.x: `chat.completions.stream()` returns a runner; `.on('chunk', ...)` fires for each SSE chunk; tool call argument deltas are in `chunk.choices[0].delta.tool_calls[0].function.arguments`.
- Both SDKs: the streaming helper collects the full response internally; `finalMessage()` / `finalChatCompletion()` returns the complete object including `usage`.

---

## Open Questions

1. **"Cached" in the file coverage line**
   - What we know: `PackedContext.metadata` has `fullFiles`, `signatureFiles`, `skippedFiles`. There is no "cached" concept at the file-packer level. The "cached" in the CONTEXT.md example ("28 cached") likely refers to something else.
   - What's unclear: Does "cached" mean files with `tier: 'signatures'` (partial content only)? Or does it refer to files from a previous run that didn't change? Or is it a display concept that doesn't map to current data?
   - Recommendation: In the plan, define "cached" in the file coverage context. The simplest interpretation that matches existing data: omit "cached" from the file coverage line, or map "signatures" tier as "partially analyzed" instead. Alternatively, treat `signatureFiles` as "cached" (they exist in context but only as signatures, not full content).

2. **Streaming flag naming and position in the progress line**
   - What we know: CONTEXT.md says it's Claude's discretion whether to use `--verbose` or a dedicated `--stream` flag. Research recommends `--stream`.
   - What's unclear: When `--stream` is active, should the streaming tokens appear as a second line below the progress line, replace the progress line, or appear above it?
   - Recommendation: Second line below, cleared on round completion. This matches the "stacked" visual log pattern established for completed round summaries.

3. **Whether `roundStartMs` needs to be persisted through cache hits**
   - What we know: Cached rounds set `rd.status = 'cached'` and `rd.elapsedMs = 0`. The spinner tick should not overwrite this with a live elapsed time.
   - What's unclear: Should the spinner interval guard on `rd.status === 'running'` only, or also update pending rounds that haven't started yet?
   - Recommendation: Only update `elapsedMs` when `rd.status === 'running'`. Guard with `rd.roundStartMs !== undefined`.

4. **`supportsStreaming()` method on provider interface**
   - The plan mentions adding `supportsStreaming()` to the provider interface. This implies some providers may not support streaming (e.g., Ollama with certain models, or Azure configurations).
   - Recommendation: Add `supportsStreaming(): boolean` to `LLMProvider` interface. Default `true` for Anthropic and OpenAI. Fallback gracefully to non-streaming (existing `doComplete` code path) when `supportsStreaming()` returns false. This is already the right pattern since `onToken` is optional — if not provided, providers use the existing non-streaming path.

---

## Sources

### Primary (HIGH confidence)

- `/anthropics/anthropic-sdk-typescript` (Context7) — verified streaming API: `messages.stream()`, `input_json_delta` event type, `finalMessage()` usage
- `/openai/openai-node` (Context7) — verified streaming API: `chat.completions.stream()`, chunk events, `tool_calls[0].function.arguments` delta
- Direct code reading: `src/ui/renderer.ts`, `src/ui/types.ts`, `src/ui/components.ts`, `src/providers/anthropic.ts`, `src/providers/openai-compat.ts`, `src/providers/base-provider.ts`, `src/providers/base.ts`, `src/cli/generate.ts`, `src/orchestrator/dag.ts`, `src/ai-rounds/round-5-edge-cases.ts`, `src/ai-rounds/round-6-deployment.ts`, `src/context/types.ts`, `src/context/packer.ts`, `src/renderers/registry.ts`

### Secondary (MEDIUM confidence)

- sisteransi 1.0.5 `cursor` and `erase` methods — verified by running `node -e` against installed package; all methods (`cursor.up`, `cursor.save`, `cursor.restore`, `erase.lines`, `erase.line`) are available

### Tertiary (LOW confidence — training knowledge)

- General streaming UX patterns (token counters, progress lines) — from training data; validated against codebase structure but not from external docs

---

## Implementation Plan Summary (for planner)

The three sub-plans already in the phase description map cleanly:

**05-01: Live token counter and elapsed timer**

- Add `streamingTokens?: number` and `roundStartMs?: number` to `RoundDisplayState`
- Add `onToken` callback threading: `LLMProvider.complete()` → `BaseProvider.complete()` → `doComplete()`
- Both `AnthropicProvider.doComplete()` and `OpenAICompatibleProvider.doComplete()` implement streaming when `onToken` provided, fall back to non-streaming otherwise
- Update `TerminalRenderer` spinner tick to: (a) update `rd.elapsedMs` for running rounds from `roundStartMs`, (b) update `rd.streamingTokens` from latest `onToken` call
- Update `renderRoundBlock` to use the new locked-decision format during `running` status
- Set `rd.roundStartMs = Date.now()` in `orchestratorEvents.onStepStart` in `generate.ts`

**05-02: Streaming token output (opt-in)**

- Add `--stream` flag to `generate` command
- Pass `options.stream` through `GenerateOptions` → `runGenerate`
- When `options.stream` is true and round is running: display a second line with streaming indicator (e.g. decoded text or pulsing token count)
- No provider changes needed beyond the `onToken` callback already added in 05-01

**05-03: Parallel rounds 5 and 6 + file coverage indicator**

- File coverage: after `packedContext` is set in the static-analysis step, emit `renderFileCoverage()` via `renderer.append()` before transitioning to `ai-rounds` phase
- Add `fileCoverage` to `DisplayState` (or emit it directly via `append` without storing in state)
- Parallel savings: compute in `generate.ts` before calling `renderer.onComplete()` and add to completion summary
- Verify (do not change) existing `deps: ['ai-round-2']` in rounds 5 and 6 — they are already correct

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — verified all packages already installed, all streaming APIs confirmed via Context7
- Architecture: HIGH — based on direct code reading of all relevant files
- Pitfalls: HIGH — based on direct analysis of how streaming events work with tool_use mode
- Open questions: MEDIUM — genuine ambiguity about "cached" in file coverage line

**Research date:** 2026-02-18
**Valid until:** 2026-03-20 (30 days — both SDK APIs are stable)
