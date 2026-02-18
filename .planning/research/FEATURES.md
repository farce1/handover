# Feature Research

**Domain:** Performance improvements for an AI-powered TypeScript CLI code analysis tool (handover-cli)
**Researched:** 2026-02-18
**Confidence:** HIGH — existing codebase audited directly; performance patterns verified against Anthropic SDK docs, ESLint incremental caching, and LLM streaming patterns; token optimization techniques verified via multiple sources

---

## Context: What Is Already Built

Before categorizing features, it is essential to map what performance infrastructure already exists. The milestone is additive — these are NOT features to build:

| Component                           | Location                       | What It Does                                                                           | Status |
| ----------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------- | ------ |
| `RoundCache`                        | `src/cache/round-cache.ts`     | Content-hash disk cache for AI round results; JSON-per-round; survives process crashes | BUILT  |
| `AnalysisCache`                     | `src/analyzers/cache.ts`       | File-content-hash map; skip re-parsing unchanged files on repeat runs                  | BUILT  |
| `Promise.allSettled` in coordinator | `src/analyzers/coordinator.ts` | All 8 analyzers run concurrently; graceful degradation on individual failure           | BUILT  |
| `DAGOrchestrator` parallel dispatch | `src/orchestrator/dag.ts`      | Independent DAG steps start immediately when deps resolve via `Promise.race()`         | BUILT  |
| `TerminalRenderer` with throttle    | `src/ui/renderer.ts`           | In-place multi-line TTY updates at ~16fps; spinner ticks at 80ms                       | BUILT  |
| `compressRoundOutput()`             | `src/context/compressor.ts`    | Deterministic 2000-token inter-round compression; no LLM calls                         | BUILT  |
| `--only` selective rounds           | `src/cli/generate.ts`          | `computeRequiredRounds()` skips unneeded AI rounds based on requested docs             | BUILT  |
| `--no-cache` flag                   | `src/cli/generate.ts`          | Clears `RoundCache` before execution; forces fresh LLM calls                           | BUILT  |
| Size-based fingerprint              | `src/cache/round-cache.ts`     | `computeAnalysisFingerprint()` hashes file paths + sizes for round cache key           | BUILT  |

**The existing cache is crash-recovery, not true incremental analysis.** The `RoundCache` fingerprint uses file paths and sizes — not content hashes. Any file size change (or any new/deleted file) invalidates all 6 round caches. The `AnalysisCache` uses content hashes but only for the static analysis layer (skipping re-parsing), not for deciding which LLM rounds need re-execution.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that users of performance-sensitive CLI tools assume exist. Missing these makes handover feel slow and opaque relative to tools like `eslint --cache`, `tsc --incremental`, or `jest --watch`.

| Feature                                    | Why Expected                                                                                                                                                                                                                                                                                                                | Complexity | Notes                                                                                                                                                                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content-hash-based cache invalidation      | Users expect that only changing files triggers re-analysis, not file metadata changes. `eslint --cache` does this; TypeScript `--incremental` does this. Size-only fingerprinting invalidates on trivial changes (touch, line ending, formatting)                                                                           | MEDIUM     | **Gap identified**: `RoundCache` uses paths+sizes. Switch fingerprint to SHA-256 over file content for changed files. The `AnalysisCache` already has per-file content hashes — the round cache fingerprint should incorporate these, not recompute from sizes.  |
| Live progress during LLM rounds            | Users staring at a spinner for 30-90 seconds with no output feel the tool is hung. Every modern CLI tool with long-running async work shows incremental progress. The current `TerminalRenderer` already has the spinner infra — but rounds show only "running/done/failed" with no tokens-generated count during execution | LOW-MEDIUM | The Anthropic SDK and OpenAI-compat SDK both support streaming responses. The `LLMProvider.complete()` interface is blocking — no `onToken` callback or `stream` option. Adding streaming output requires extending the provider interface and the round runner. |
| Measurable time-to-first-output on re-runs | Users expect that if nothing changed, re-runs are fast (seconds, not minutes). The current re-run experience hits the `RoundCache` and returns cached results — but only if the fingerprint matches. Improving the fingerprint to be content-based is the prerequisite.                                                     | MEDIUM     | Prerequisite: content-hash fingerprint above. With correct invalidation, only truly-changed rounds re-execute. Unchanged rounds restore from cache in <100ms each.                                                                                               |
| `--cache` / `--no-cache` flag transparency | Users need to know whether they're seeing cached or fresh results. The current UI shows "cached" status for rounds that hit cache — this is present. Missing: cache hit/miss stats in completion summary (how many rounds were cached vs re-run)                                                                            | LOW        | Extend the completion summary in `TerminalRenderer.onComplete()` to show "X/6 rounds from cache". The `displayState` already carries round statuses including 'cached'.                                                                                          |
| Graceful handling of empty/tiny repos      | Repos with zero source files should fail fast and clearly, not run all 8 analyzers to discover nothing. The current code has an `isEmptyRepo` check but only after static analysis completes.                                                                                                                               | LOW        | Already partially addressed by `isEmptyRepo` guard. The gap: the check happens after `runStaticAnalysis()` completes (including all 8 analyzers). For truly empty repos, file discovery alone should trigger early exit.                                         |

### Differentiators (Competitive Advantage)

Features that separate handover from generic code analysis tools and make it the fastest tool for its specific use case.

| Feature                                                           | Value Proposition                                                                                                                                                                                                                                                                                                                                                          | Complexity | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Streaming token output during LLM rounds                          | Shows live text being generated during each AI round — like watching Claude "think". Transforms a 45-second wait into 45 seconds of visible progress. Makes the tool feel interactive, not batch-style. No other code analysis CLI does this.                                                                                                                              | HIGH       | Requires: (1) adding `stream` option to `LLMProvider.complete()`, (2) Anthropic SDK streaming via `client.messages.stream()`, (3) OpenAI streaming via `for await (chunk of stream)`, (4) updating the `TerminalRenderer` to display a scrolling token buffer in the round block, (5) deciding whether to stream to the display only or also to the structured output (structured output requires tool_use, which may conflict with streaming in some providers). **CRITICAL CONSTRAINT**: Anthropic tool_use with streaming is supported — `stream` + `tool_choice: {type: 'tool'}` works in the Anthropic SDK. The structured JSON must be assembled from streamed input_json_delta events. This is non-trivial. |
| Round-level incremental invalidation (only re-run changed rounds) | When a developer makes a small code change, only the round(s) whose inputs changed should re-execute. If only a test file changed, Round 5 (edge cases) re-runs but Rounds 1-3 (overview, modules, features) can remain cached. This gives 50%+ token reduction on typical incremental runs.                                                                               | HIGH       | Requires per-round input fingerprinting. Round N's cache key must incorporate: (a) the global file fingerprint for files relevant to that round, (b) the compressed output of all prior rounds that round N receives as input. This means Round 1's cache key is independent of Rounds 2-6. Round 2's key depends on Round 1's output hash. This is a cascading invalidation model, not a single global fingerprint. Implementation: `RoundCache.computeHash()` currently takes `(roundNumber, model, analysisFingerprint)` — extend to include `priorRoundOutputHash`.                                                                                                                                            |
| Changed-files-only context packing                                | On incremental re-runs, skip full file content for files that haven't changed since the last run — send only signatures (or skip entirely) unless the file is marked as changed by the `AnalysisCache`. This reduces tokens sent per re-run proportionally to change ratio. In a 1000-file repo where 10 files changed, this is potentially 90% fewer file content tokens. | HIGH       | Requires: `AnalysisCache` to expose which files changed since last run (currently only exposes `isUnchanged(path, hash)`). The `packFiles()` function in `context/packer.ts` needs a "changed files" set parameter to force changed files to `full` tier and allow unchanged files to drop to `signatures` or `skip`. This is an additive change to `packFiles()`.                                                                                                                                                                                                                                                                                                                                                 |
| Token usage summary with cache savings                            | Report: "Used 12,400 tokens (47% savings vs full re-run — 3 rounds cached)". Gives users concrete evidence of speed/cost improvement. Reinforces the value proposition on every incremental run.                                                                                                                                                                           | LOW-MEDIUM | `TokenUsageTracker` already accumulates token usage. Add a "baseline estimate" concept: at run start, compute what a full re-run would cost; at completion, show actual vs estimated. Or simpler: show "X rounds cached, saved ~Y tokens" based on average tokens per round from prior runs.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Large repo file sampling with coverage indicator                  | For repos exceeding the context window capacity (e.g., 50,000+ lines after filtering), automatically sample files weighted by importance score and show "Analyzed N of M files (top by importance)" rather than silently truncating. The current `packFiles()` silently drops low-priority files when the budget fills — no indicator is shown.                            | MEDIUM     | The `PackedContext` type should expose how many files were full/signatures/skipped. The renderer should show this as a coverage indicator. The file scorer in `context/scorer.ts` already produces priority scores — expose the coverage ratio.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Parallel document rendering                                       | Currently, the render phase writes 14 documents sequentially (`for...of` loop in `generate.ts`). Since renderers are pure functions (`doc.render(ctx)` returning a string), they can run in parallel with `Promise.all()`. Small gain (rendering is fast), but eliminates the last sequential bottleneck.                                                                  | LOW        | Replace `for (const doc of selectedDocs)` with `await Promise.all(selectedDocs.map(...))`. Requires careful handling of `displayState.renderedDocs` ordering — use a pre-allocated results array, fill by index, then append in order. INDEX still goes last.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature                                              | Why Requested                                                                     | Why Problematic                                                                                                                                                                                                                                                                                                                                                                                 | Alternative                                                                                                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Multi-threaded analyzer execution via worker_threads | "Run analyzers in true parallel threads for 8x speed"                             | The 8 analyzers already run concurrently via `Promise.allSettled()`. They are I/O-bound (file reads, git commands, tree-sitter parsing) — the bottleneck is I/O, not CPU. Worker threads add serialization overhead and complexity without meaningful speedup for I/O-bound work. The only CPU-intensive work is tree-sitter AST parsing, which is already done in the main thread efficiently. | Keep `Promise.allSettled()`. Profile before threading. If AST parsing becomes the bottleneck on very large repos, target that specific analyzer with a worker pool.                                          |
| Persistent background daemon                         | "Run handover as a daemon that watches files and pre-caches results"              | File watchers in the background drain battery, have race conditions with editors saving partial files, and add IPC complexity. The disk cache already provides instant re-run results without a daemon. Users do not run handover frequently enough to justify always-on infrastructure.                                                                                                        | The disk cache (RoundCache) is the right solution. Fast enough on re-runs without a daemon. If watch mode is needed later, it belongs as a `handover watch` command with explicit lifecycle, not a daemon.   |
| Streaming output to markdown files                   | "Stream LLM output directly to the output files as tokens arrive"                 | The output documents require complete, structured JSON from LLM tool calls before they can be rendered. The rendering phase transforms structured data into Markdown — it cannot be streamed because the Zod-validated schema output isn't known until the full response arrives. Partial streaming to files creates partial documents that would confuse consumers of the output.              | Stream tokens to the terminal display only. Write complete documents to disk only after all rounds complete.                                                                                                 |
| Distributed analysis across machines                 | "Split the codebase across multiple machines for large repos"                     | Handover's analysis is inherently sequential at the AI rounds layer — Round 2 requires Round 1's output. Distributing the static analysis phase is possible but the benefit is small (static analysis takes 5-15 seconds even for large repos). The complexity of distributed coordination far exceeds the benefit.                                                                             | For very large repos: focus on file sampling/filtering to reduce context sent to the LLM. The bottleneck is LLM round latency, not static analysis. Sampling the right files beats distributing analysis.    |
| Provider-level request batching                      | "Send all 6 rounds in one API call for efficiency"                                | The rounds are sequentially dependent — Round 2 uses Round 1's output, Round 3 uses Rounds 1+2, etc. They cannot be batched without fundamentally changing the architecture. Even if a batch API existed, the round architecture would need to be restructured to a single-pass design, losing the iterative refinement that makes the analysis high quality.                                   | The existing sequential round structure is correct. Optimize within each round (streaming, caching) rather than restructuring the round model.                                                               |
| LLM-based context compression                        | "Use an LLM to intelligently summarize prior rounds before sending to next round" | The current `compressRoundOutput()` is deterministic and token-budget-bounded. Using another LLM call for compression adds: latency (one extra API call per round = 6 extra calls), cost (the compression tokens often exceed what's saved), and non-determinism (same inputs give different compressed outputs, breaking cache invalidation).                                                  | The deterministic compressor at 2000 tokens per round is already well-tuned. The real token savings come from the incremental context packing feature (sending only changed files' full content on re-runs). |
| Aggressive file filtering to reduce context          | "Skip all test files, all docs, all config files automatically"                   | Aggressive auto-filtering removes context that rounds need for accurate analysis. Round 5 (edge cases) specifically benefits from test file analysis. Round 6 (deployment) needs config files. Filtering by file type trades analysis quality for speed — users who want speed should use `--only` to skip rounds they don't need, not filter out files that inform those rounds.               | Use `--only` to skip entire rounds. Use the importance scorer in `context/scorer.ts` to prioritize high-value files when the budget is tight, rather than blindly excluding categories.                      |

---

## Feature Dependencies

```
Content-hash fingerprint (improved invalidation)
    └──required before──> Round-level incremental invalidation
                              └──required before──> Token savings reporting
                                                        (needs baseline to compare against)

Changed-files-only context packing
    └──requires──> AnalysisCache exposing changed-file set
    └──requires──> packFiles() receiving changed-files parameter

Streaming token output (provider-level)
    └──requires──> LLMProvider interface extended with stream option
    └──requires──> AnthropicProvider streaming implementation
    └──requires──> OpenAI-compat provider streaming implementation
    └──requires──> TerminalRenderer stream buffer in round display
    └──blocks──> (nothing downstream, purely additive to UX)

Large repo file sampling indicator
    └──requires──> PackedContext exposing coverage stats
    └──builds on──> existing file scorer in context/scorer.ts

Parallel document rendering
    └──independent of──> all other features
    └──requires──> careful ordering of displayState updates

Cache hit/miss summary in completion
    └──requires──> displayState tracking cached round count
    └──builds on──> existing 'cached' round status already in displayState
```

### Dependency Notes

- **Content-hash fingerprint is a prerequisite for incremental invalidation:** Without content-based cache keys, the round cache cannot know which rounds are truly stale vs which are safe to reuse. This is the foundation feature for the "50%+ fewer tokens on incremental runs" goal.

- **Streaming conflicts with structured output assembly:** Anthropic's `tool_use` with streaming delivers structured JSON as `input_json_delta` events — partial JSON fragments. The provider must accumulate these fragments and parse the complete JSON only at stream end before validating with Zod. The terminal display can show the raw text delta as "thinking" output. Implementation must not expose partially-assembled JSON to round runners.

- **Changed-files context packing requires AnalysisCache to expose its diff:** The `AnalysisCache` currently only exposes `isUnchanged(path, hash)`. A new method `getChangedFiles(files)` returning the set of paths whose hash differs from cache is needed to feed `packFiles()`.

- **Parallel rendering is independent:** It can be delivered in isolation as a small cleanup PR. It does not depend on or conflict with any other performance feature.

---

## MVP Definition

This is a brownfield milestone. The "MVP" is the minimum set that delivers the user-visible goals: fast re-runs (seconds not minutes), responsive UX (live progress), measurable gains (2-5x faster, 50%+ fewer tokens on incremental runs).

### Launch With (Phase 1 — Cache Correctness)

The content-hash fingerprint is the enabler for everything else. Without it, incremental runs are unreliable — a formatting commit re-runs all 6 rounds unnecessarily; a pure rename does the same. Fix the foundation first.

- [ ] Content-hash-based cache invalidation — replaces size-based fingerprint in `RoundCache`; makes "fast re-runs" reliable rather than accidental
- [ ] Round-level incremental invalidation — per-round cache keys that cascade from prior round outputs; delivers the 50%+ token reduction goal
- [ ] Cache hit/miss summary in completion — shows users they got the benefit; required for "measurable gains" goal

### Add After Phase 1 (Phase 2 — UX Responsiveness)

Once cache correctness is established, improve perceived speed and responsiveness during the LLM wait.

- [ ] Live progress during LLM rounds (token counter + elapsed time update within round block) — the simplest responsiveness improvement; uses existing `TerminalRenderer` infra; does not require streaming API changes
- [ ] Streaming token output during LLM rounds — shows raw model output live; the most impactful UX change; requires provider interface extension
- [ ] Large repo file sampling coverage indicator — shows what percentage of the codebase was analyzed; addresses silent truncation problem

### Add After Phase 2 (Phase 3 — Context Efficiency)

Once UX is responsive and cache is correct, optimize what gets sent to the LLM on incremental runs.

- [ ] Changed-files-only context packing — reduces tokens sent on incremental runs to only files that changed; delivers the "50%+ fewer tokens" goal for context (complementing the round caching from Phase 1)
- [ ] Parallel document rendering — small but clean win; eliminates last sequential bottleneck; simple implementation
- [ ] Token usage summary with cache savings — concrete reporting of efficiency gains

---

## Feature Prioritization Matrix

| Feature                              | User Value                                            | Implementation Cost                                                                               | Priority |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| Content-hash cache invalidation      | HIGH — makes fast re-runs reliable                    | MEDIUM — extend `computeAnalysisFingerprint()` to hash file contents; thread through `RoundCache` | P1       |
| Round-level incremental invalidation | HIGH — 50%+ token reduction on incremental; core goal | HIGH — cascading hash design for per-round cache keys                                             | P1       |
| Cache hit/miss summary               | MEDIUM — makes the benefit visible                    | LOW — extend `displayState` and `TerminalRenderer.onComplete()`                                   | P1       |
| Live token counter in round block    | HIGH — eliminates "is it hung?" anxiety               | LOW-MEDIUM — update `DisplayState.rounds` with elapsed timer; already has spinner                 | P2       |
| Streaming token output               | HIGH — transforms perceived responsiveness            | HIGH — provider interface + 2 provider implementations + renderer update                          | P2       |
| Large repo coverage indicator        | MEDIUM — transparency for large repos                 | MEDIUM — expose `PackedContext` coverage stats; add renderer line                                 | P2       |
| Changed-files context packing        | HIGH — reduces input tokens on re-runs                | HIGH — `AnalysisCache` diff API + `packFiles()` parameter                                         | P3       |
| Parallel document rendering          | LOW — rendering is already fast (~1-2s)               | LOW — replace `for...of` with `Promise.all` + ordered results                                     | P3       |
| Token savings reporting              | MEDIUM — confirms efficiency gains                    | MEDIUM — baseline estimation logic                                                                | P3       |

**Priority key:**

- P1: Must have — enables the "fast re-runs" goal
- P2: Should have — delivers "responsive UX" goal
- P3: Nice to have — extends efficiency gains; worth delivering if phases 1+2 complete

---

## Competitor Feature Analysis

Examining how comparable tools handle these performance challenges:

| Feature            | ESLint (`--cache`)                      | TypeScript (`--incremental`)                     | Jest (`--watch`)               | Our Approach                                                                   |
| ------------------ | --------------------------------------- | ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------ |
| Cache invalidation | Content-hash per file; version-keyed    | Content-hash + dependency graph                  | File watcher + jest-haste-map  | Content-hash via existing `AnalysisCache` (extend to drive round invalidation) |
| Cache key design   | `{filePath}:{contentHash}:{ruleHashes}` | Per-file `.tsbuildinfo` with dependency tracking | Module hash map                | `{roundNumber}:{model}:{contentFingerprint}:{priorRoundHash}`                  |
| Incremental scope  | Skip unchanged files entirely           | Skip unchanged source files in compilation       | Re-run tests for changed files | Skip unchanged rounds; reduce context to changed files                         |
| Live progress      | None (batch output)                     | `--diagnostics` for verbose timing               | `--verbose` per-test streaming | Streaming token display during each AI round                                   |
| Large scale        | Sampling via `--ext` glob               | `--maxNodeModuleJsDepth`                         | `--testPathPattern`            | File importance scoring + coverage indicator                                   |
| Cache transparency | `--cache-location` + printed stats      | `.tsbuildinfo` file                              | Cache managed transparently    | Hit/miss summary in completion screen                                          |

**Key insight from ESLint's cache design:** ESLint's `--cache` stores a hash of the file content plus the ESLint version plus the rule configuration — not just file content. Changing the rules invalidates the cache without changing files. Handover's equivalent: the `model` is already in the cache key (changing models invalidates rounds), but the round-specific prompt/schema version is not. Consider adding a `roundSchemaVersion` constant to each round (bumped when prompts change) as part of the cache key.

---

## Sources

- Codebase audit: `src/cache/round-cache.ts`, `src/analyzers/cache.ts`, `src/orchestrator/dag.ts`, `src/analyzers/coordinator.ts`, `src/ui/renderer.ts`, `src/context/compressor.ts`, `src/cli/generate.ts`, `src/providers/anthropic.ts`, `src/providers/base.ts` — HIGH confidence (direct source)
- [Anthropic SDK streaming documentation](https://docs.anthropic.com/en/api/messages-streaming) — streaming `tool_use` with `input_json_delta` events — MEDIUM confidence (official docs; streaming + tool_use support verified in SDK)
- [LangChain JS streaming](https://js.langchain.com/docs/how_to/streaming_llm/) — streaming pattern with `handleLLMNewToken` callback — MEDIUM confidence (official docs)
- [ESLint incremental caching issue #20186](https://github.com/eslint/eslint/issues/20186) — ESLint's approach to content-hash caching and cache key design — HIGH confidence (official GitHub repo discussion)
- [Prompt compression techniques — Medium](https://medium.com/@kuldeep.paul08/prompt-compression-techniques-reducing-context-window-costs-while-improving-llm-performance-afec1e8f1003) — 40-60% token reduction via extractive compression — LOW confidence (secondary source; consistent with existing `compressRoundOutput()` approach which is already extractive)
- [Context window management strategies](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) — summarization vs extractive compression tradeoffs — MEDIUM confidence (verified against existing implementation)
- [LLM streaming via Vellum](https://www.vellum.ai/llm-parameters/llm-streaming) — streaming token delivery patterns — MEDIUM confidence (secondary source)
- [Monorepo AI code review tools](https://monorepo.tools/ai) — large-scale codebase analysis challenges — MEDIUM confidence (industry survey)

---

_Feature research for: Handover CLI — performance improvements milestone_
_Researched: 2026-02-18_
