# Project Research Summary

**Project:** handover-cli v2.0 — Performance Engineering Milestone
**Domain:** CLI Performance — Caching, Parallelization, Streaming, Token Optimization, Startup Speed, Large Repo Scaling
**Researched:** 2026-02-18
**Confidence:** HIGH

## Executive Summary

handover-cli is a working TypeScript CLI that runs 6 sequential LLM rounds to generate codebase documentation. The v2.0 milestone is a brownfield performance engineering effort, not a greenfield build. The tool already has substantive performance infrastructure — a disk-based round cache, a file-content-hash analysis cache, a DAG orchestrator that runs independent steps in parallel, a terminal renderer, and a deterministic context compressor. The research converges on a critical finding: the existing foundations are largely correct in design but have gaps in correctness that must be fixed before any new performance features are layered on top. The cache fingerprint uses file path and size, not content — a same-size file edit silently serves stale documentation. Round N's cache key does not include Round (N-1)'s output hash, so a re-run of Round 1 does not invalidate Rounds 2-6. These are correctness bugs, not enhancement gaps, and they must ship first.

The recommended approach sequences work in three phases tied to user-visible goals: (1) cache correctness — fix the fingerprint and cascade invalidation so fast re-runs are reliable, not accidental; (2) UX responsiveness — stream token output and show live progress so the 30-90 second LLM wait feels interactive rather than like a hang; (3) context efficiency — reduce tokens sent on incremental runs by limiting context to only changed files, add Anthropic prompt caching, and upgrade SDK versions. The stack additions are minimal: three new npm packages (piscina for CPU-bound worker threads, gpt-tokenizer for accurate token counting, p-limit for I/O concurrency caps) plus SDK upgrades to @anthropic-ai/sdk and openai. All new additions are ESM-compatible and have verified versions.

The dominant risk is correctness regression: streaming requires accumulating full JSON before Zod validation (partial JSON will throw), parallel static analysis must not share the WASM tree-sitter instance across concurrent calls, and cache key changes without cascade invalidation produce documentation that contradicts itself. The pitfalls research documents ten specific failure modes with warning signs and recovery strategies. The architecture research is explicit: do not change DAGOrchestrator for parallelism (it already handles parallel steps correctly via Promise.race — fix the dep declarations instead), do not create a client-side prompt cache manager (Anthropic's API manages this automatically), and never write streaming tokens directly to stdout outside the TerminalRenderer abstraction.

## Key Findings

### Recommended Stack

The production stack (TypeScript, Commander.js, Vitest, tsup, web-tree-sitter, Zod, fast-glob, simple-git, @anthropic-ai/sdk, openai) is unchanged. Performance work adds three new packages and upgrades two existing SDKs. No database, no streaming middleware, no in-memory cache layer — the disk JSON caches already in place are the correct model for a CLI that runs once and exits.

**Core technologies:**

- `piscina@5.1.4`: Worker thread pool for CPU-bound AST parsing — most-downloaded worker pool (6.7M weekly), ESM-native, authored by Node.js core contributors; use only when file count exceeds ~200 (avoids thread setup overhead on small repos)
- `gpt-tokenizer@3.4.0`: Accurate BPE token counting for OpenAI-family models — pure JS (no WASM), identical counts to Python tiktoken, zero native dependencies; replaces chars/4 heuristic that has 15-25% error rate
- `p-limit@7.3.0`: Concurrency cap for I/O-bound file reads — prevents EMFILE errors on repos with 10k+ files; also controls fast-glob streaming fan-out
- `@anthropic-ai/sdk` upgrade `0.39.0` → `0.76.0`: Unlocks streaming API, prompt caching (`cache_control` blocks), and `countTokens()` endpoint — verify breaking changes against `src/providers/anthropic.ts` before bumping
- `openai` upgrade `5.23.2` → `6.22.0`: v6 has breaking changes in stream handling — verify against `src/providers/openai-compat.ts` before bumping
- `NODE_COMPILE_CACHE` (Node.js 22.1+ built-in): Persists V8 bytecode across runs; reduces startup from ~130ms to ~80ms; no new dependency — document as opt-in for Node 22+ users
- Dynamic `import()` for `ParserService`: Defers WASM loader until generate command path; eliminates WASM startup cost for `--help`, `estimate`, and other non-generate commands

**What NOT to use:**

- `lru-cache` / `node-cache` / `keyv` — in-memory; cache lost on every CLI invocation; wrong model for a CLI
- `better-sqlite3` — 8 MB native binary; overkill for hash-indexed JSON files already handled by stdlib
- `@dqbd/tiktoken` / `tiktoken` npm (WASM) — 50-100ms cold start; pure JS gpt-tokenizer is accurate enough for pre-flight estimation
- `workerpool` / `threads.js` — less maintained, fewer downloads; piscina is the ecosystem standard
- `v8-compile-cache` npm package — CommonJS only; handover is ESM

### Expected Features

Features research audited the existing codebase and separated what is already built from what needs building. The existing infrastructure is substantive — what's missing is correctness in caching and responsiveness in UX.

**Must have — table stakes (P1 — cache correctness phase):**

- Content-hash-based cache invalidation — replace size-only fingerprint in `RoundCache.computeAnalysisFingerprint()` with SHA-256 or mtime+size; makes fast re-runs reliable rather than accidental
- Round-level incremental invalidation — per-round cache keys that cascade from prior round output hashes; delivers 50%+ token reduction on incremental runs; prerequisite: content-hash fingerprint
- Cache hit/miss summary in completion — "X/6 rounds from cache"; makes the efficiency gain visible to users; low complexity

**Should have — differentiators (P2 — UX responsiveness phase):**

- Live token counter + elapsed time within round block — eliminates "is it hung?" anxiety; uses existing TerminalRenderer infra without streaming API changes
- Streaming token output during LLM rounds — transforms perceived responsiveness for first runs; requires provider interface extension (`completeStream()`, `supportsStreaming()`) and TerminalRenderer `onRoundToken()` callback
- Large repo file sampling coverage indicator — surfaces how many files were analyzed vs. skipped; addresses silent truncation in `packFiles()`

**Nice to have (P3 — context efficiency phase):**

- Changed-files-only context packing — reduce tokens sent on incremental runs to only changed files' full content; requires `AnalysisCache.getChangedFiles()` API and `packFiles()` parameter extension
- Anthropic prompt caching — `cache_control: { type: 'ephemeral' }` on static context block; 70-80% token cost reduction on rounds 2-6 for Anthropic users; requires SDK upgrade
- Token usage summary with cache savings — concrete reporting: "Used 12,400 tokens (47% savings vs full re-run)"
- Parallel document rendering — replace `for...of` with `Promise.all` in render phase; small but clean elimination of last sequential bottleneck
- Accurate token counting via `gpt-tokenizer` — replaces chars/4 heuristic for OpenAI-family providers

**Defer permanently (anti-features):**

- Multi-threaded analyzer execution — analyzers already run concurrently via `Promise.allSettled`; they are I/O-bound, not CPU-bound; threading adds overhead without benefit
- Persistent background daemon — disk cache already provides fast re-runs; daemon adds battery drain, race conditions, IPC complexity
- Streaming output to markdown files — rendering requires complete, Zod-validated JSON before markdown can be produced; streaming to files creates partial documents
- Provider-level request batching — rounds are sequentially dependent by design; batching would require restructuring the round architecture

### Architecture Approach

Performance features integrate as targeted modifications to existing layers — no new top-level folders. The caching layer extends existing RoundCache and AnalysisCache. The streaming path is an additive optional capability on the provider interface (non-streaming remains the default and fallback). Prompt caching is three lines of code in `AnthropicProvider.doComplete()` — not a new cache class. The DAGOrchestrator is not modified — only round dependency declarations are audited.

**Major components and their changes:**

1. `src/cache/round-cache.ts` — extend fingerprint to content hash; add cascade invalidation; expose `getCacheStatus()` for UI
2. `src/providers/anthropic.ts` — add `cache_control` blocks to system prompt; add streaming path via `client.messages.stream()`
3. `src/providers/base.ts` + `base-provider.ts` — add optional `completeStream()` and `supportsStreaming()` to provider interface
4. `src/providers/streaming.ts` (NEW) — `StreamChunk` type and `StreamCallback` type; keep streaming types co-located with providers
5. `src/context/token-counter.ts` — replace chars/4 with `gpt-tokenizer` for OpenAI-family providers; keep provider `estimateTokens()` as primary
6. `src/ui/renderer.ts` + `types.ts` — add optional `onRoundToken()` callback; funnel all stdout through TerminalRenderer (never write streaming tokens directly)
7. `src/analyzers/ast-analyzer.ts` — add piscina worker pool for large repos (> 200 files); use p-limit for I/O concurrency cap
8. `src/ai-rounds/round-5-edge-cases.ts`, `round-6-deployment.ts` — verify dep declarations; rounds 5 and 6 have identical deps (rounds 1, 2) and can run in parallel automatically if dep declarations are correct

**Key patterns from architecture research:**

- Streaming is UX-only: accumulate full response, validate Zod schema at stream end; never parse partial JSON mid-stream
- Prompt caching is API-managed: add `cache_control` to static content block, add `betas` header; no client-side cache manager needed
- Parallel rounds via dep declarations: the DAGOrchestrator already supports parallel steps; fix the declarations, not the orchestrator
- WASM parser is a mutex resource: piscina handles per-thread isolation; never allow concurrent calls on a shared WASM instance

### Critical Pitfalls

1. **Cache invalidation based on file size alone** — A same-size edit (fixing a typo, changing a comment) returns an identical fingerprint and serves stale documentation silently. Fix: use mtime+size or SHA-256 of file content. Address before building any incremental analysis on top of the existing cache.

2. **Round N cache not invalidated when Round (N-1) changes** — The current cache key includes roundNumber + model + analysisFingerprint but not a hash of prior round output. When Round 1 re-runs (e.g., new file added), Rounds 2-6 serve cached results built on the old context. Fix: cascade-invalidate (clear rounds N, N+1, ..., 6) or include prior-round output hash in Round N's cache key. Non-negotiable correctness requirement.

3. **Streaming structured JSON before schema is complete** — Partial JSON from streaming APIs will throw in `JSON.parse()` and in Zod validation. Fix: buffer the full stream response, then parse and validate at stream end. Streaming is for UX feedback (token counter, elapsed time) only — never expose partial output to round runners or write partial JSON to cache.

4. **Shared WASM parser state under parallelism** — web-tree-sitter's WASM runtime is not safe for concurrent calls. Parallel file reads within an analyzer can interleave WASM calls, corrupting AST output silently. Fix: use piscina (one WASM instance per worker thread) or p-limit with concurrency 1 for parser access.

5. **File cache ignoring config changes** — When the user changes `.handover.yml` (model, provider, context window), the file-level cache is still valid but analysis parameters have changed. Fix: include a hash of analysis-affecting config fields in the cache key. Must be defined before cache ships, not retrofitted.

6. **Streaming token output written directly to stdout** — The TerminalRenderer uses cursor control (sisteransi) to draw in-place progress. Any direct `process.stdout.write()` from a streaming callback interleaves with cursor positioning and corrupts TTY output. Fix: route all streaming events through `TerminalRenderer.onRoundToken()`.

7. **Context compression degrading late-round quality** — Rounds 5 and 6 receive compressed output from earlier rounds. Aggressive compression that hits token count targets but loses specific module names, file paths, and function references causes Round 5 (edge cases) and Round 6 (deployment) to produce generic rather than specific documentation. Fix: validate compression quality by comparing Round 5/6 output specificity on a known codebase before and after any compression parameter changes.

## Implications for Roadmap

Based on the combined research, three phases emerge with clear dependency ordering grounded in correctness requirements, feature dependencies, and architecture build order.

### Phase 1: Cache Correctness

**Rationale:** The existing RoundCache and AnalysisCache are correct in architecture but have two correctness gaps that produce wrong documentation on real-world usage: size-only fingerprinting and missing cascade invalidation. All other performance features (incremental context packing, token savings reporting, streaming) depend on a reliable cache. Building streaming on top of a cache that silently serves stale results makes the performance improvements untrustworthy. Fix the foundation first. This phase is also the highest ROI: on re-runs of unchanged codebases, all 6 LLM calls are already skipped — making that behavior correct and reliable delivers the "fast re-runs" goal immediately without any new API calls.

**Delivers:** Fast re-runs that users can trust; elimination of stale documentation from same-size edits; cache that invalidates correctly when any round's upstream inputs change; visible confirmation of efficiency gains per run.

**Addresses (from FEATURES.md P1):**

- Content-hash-based cache invalidation
- Round-level incremental invalidation (cascading hash design)
- Cache hit/miss summary in completion screen
- Deletion detection (deleted files trigger full re-analysis)
- Config-hash invalidation (model or provider changes bust cache)

**Avoids (from PITFALLS.md):**

- Pitfall 1: cache invalidation based on file size alone — fix fingerprint algorithm first
- Pitfall 5: file cache ignoring config changes — compose cache key from file hash AND config hash
- Pitfall 8: round N cache not invalidated when round N-1 changes — implement cascade invalidation
- Pitfall 10: incremental analysis not detecting deleted files — diff current vs cached file list

**Research flag:** Standard patterns for incremental analysis (eslint --cache, tsc --incremental are well-documented reference implementations). The cascading hash design for per-round keys is non-trivial to get right — verify the design against the PITFALLS.md "looks done but isn't" checklist before implementation closes.

### Phase 2: UX Responsiveness

**Rationale:** Once cache correctness is established, address the perceived latency problem on first runs and on runs where rounds must re-execute. The 30-90 second LLM wait is the primary UX pain point. Two improvements deliver this: a live token counter + elapsed timer within each round block (LOW complexity, uses existing TerminalRenderer) and streaming token output from the LLM (HIGH complexity, requires provider interface extension). The live counter can ship independently of streaming — ship it first to unblock the UX improvement while streaming is implemented. This phase also includes parallel round execution for rounds 5 and 6 (potentially zero code change if dep declarations are already minimal) and large repo coverage indicator.

**Delivers:** Live progress during every LLM round; streaming token display during model response; parallel execution of rounds 5 and 6; coverage transparency for large repos.

**Uses (from STACK.md):**

- `@anthropic-ai/sdk@0.76.0` (upgrade) — `client.messages.stream()` for Anthropic streaming
- `openai@6.22.0` (upgrade) — `chat.completions.create({ stream: true })` for OpenAI streaming
- `sisteransi` (existing) — cursor control for in-place token counter updates
- `p-limit@7.3.0` (new) — concurrency cap for I/O fan-out in large repos

**Implements (from ARCHITECTURE.md):**

- `src/providers/streaming.ts` (new) — StreamChunk type, StreamCallback type
- `src/providers/base.ts` — `supportsStreaming()` method on provider interface
- `src/providers/base-provider.ts` — default `supportsStreaming()` returns false; `completeStream()` with non-streaming fallback
- `src/ui/renderer.ts` — `onRoundToken()` optional callback; TerminalRenderer owns all stdout
- Round 5 and 6 dep declarations — audit and remove excess deps if any

**Avoids (from PITFALLS.md):**

- Pitfall 3: streaming structured JSON before schema is complete — buffer full response, validate at stream end
- Pitfall 6: streaming tokens written directly to stdout — route all writes through TerminalRenderer
- Pitfall 7: streaming races with TerminalRenderer — TerminalRenderer is single owner of stdout in TTY mode

**Research flag:** The streaming implementation for structured output (tool_use + streaming) is the most complex element. Anthropic's `input_json_delta` streaming event for tool_use requires accumulating fragment JSON and parsing at stream end — this is documented in official Anthropic SDK docs but requires careful implementation. Plan for integration testing against the actual API before this phase closes.

### Phase 3: Context Efficiency

**Rationale:** With cache correctness established and UX responsive, the final phase optimizes what gets sent to the LLM on incremental runs. Changed-files-only context packing reduces input tokens proportionally to how little changed — in a 1000-file repo where 10 files changed, this is potentially 90% fewer file content tokens. Anthropic prompt caching eliminates re-tokenizing the static context block across all 6 rounds (70-80% cost reduction on rounds 2-6 for Anthropic users). Accurate token counting via gpt-tokenizer eliminates the 15-25% error in the chars/4 heuristic that causes context window overflows. Parallel document rendering is a small independent cleanup that can ship in this phase without coupling risk.

**Delivers:** Substantially reduced token costs on incremental runs; accurate context budget enforcement; concrete savings reporting users can see; Anthropic prompt cache hits surfaced in usage tracking.

**Uses (from STACK.md):**

- `gpt-tokenizer@3.4.0` (new) — BPE token counting for OpenAI-family providers; replaces chars/4
- `piscina@5.1.4` (new) — worker thread pool for CPU-bound AST parsing on large repos (> 200 files)
- `NODE_COMPILE_CACHE` (Node.js 22.1+ built-in) — V8 bytecode cache; document as opt-in for Node 22+ users

**Implements (from ARCHITECTURE.md):**

- `src/context/token-counter.ts` — gpt-tokenizer path for OpenAI providers; Anthropic `countTokens()` endpoint for pre-flight estimation
- `src/providers/anthropic.ts` — `cache_control: { type: 'ephemeral' }` on static context block; `betas: ['prompt-caching-2024-07-31']` header
- `src/analyzers/ast-analyzer.ts` + new `src/workers/ast-worker.ts` — piscina pool (size = os.cpus().length); threshold guard (only activate > 200 files)
- `src/analyzers/file-discovery.ts` — switch to `fast-glob` `.stream()` API for large repo file discovery
- `src/analyzers/cache.ts` — expose `getChangedFiles()` method returning set of changed paths
- `src/context/packer.ts` — accept changed-files set parameter; force changed files to `full` tier
- `src/cli/generate.ts` — `--stream` flag; lazy dynamic import of ParserService for startup speed
- `src/config/schema.ts` — `performance.promptCache`, `performance.streaming`, `performance.preciseTokenCounting` config fields

**Avoids (from PITFALLS.md):**

- Pitfall 4: context compression degrading late-round quality — capture Round 5/6 quality baseline before any compression parameter changes
- Pitfall 9: token optimization degrading quality on non-default providers — test on Anthropic + at least one alternative provider before shipping
- Pitfall WASM concurrency: serialize parser access via piscina per-thread isolation

**Research flag:** The changed-files context packing requires the AnalysisCache diff API and packFiles() parameter extension — both are non-trivial internal API changes. Plan for regression testing against the existing packer behavior. The `gpt-tokenizer` upgrade requires verifying that the existing `provider.estimateTokens()` fallback chain still works correctly for Anthropic models (Anthropic uses a different tokenizer; chars/4 is already more accurate for Claude than for GPT models).

### Phase Ordering Rationale

- **Correctness before features:** The cache correctness bugs produce wrong documentation silently. Adding streaming or incremental packing on top of a broken cache produces fast delivery of stale results. Fix the foundation first.
- **Cache P1 before streaming P2:** Streaming's main benefit (visible progress) is most valuable when rounds actually re-execute. If rounds are incorrectly cache-hitting, streaming is never invoked. Phase 1 ensures streaming is exercised correctly.
- **SDK upgrades in Phase 2 not Phase 3:** Both `@anthropic-ai/sdk` and `openai` upgrades are needed for streaming (Phase 2). Prompt caching (Phase 3) also needs the SDK upgrade but is blocked by it, not the other way around. Upgrade once in Phase 2; Phase 3 uses the already-upgraded SDK.
- **Piscina deferred to Phase 3:** CPU-bound parallelism for AST parsing is a large-repo optimization. It is not needed for correctness or basic UX. Implementing it after streaming and caching simplifies the concurrency model during the earlier phases.
- **Parallel rendering is independent:** It can ship in Phase 3 without coupling to the other Phase 3 features. If time is constrained, it defers easily to v2.1.

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 2 (Streaming structured output):** The Anthropic `tool_use` streaming pattern (accumulating `input_json_delta` events into valid JSON) is documented but requires careful implementation. The FEATURES.md research notes this as "non-trivial" and the PITFALLS.md identifies it as a critical failure mode. During Phase 2 planning, verify the current `AnthropicProvider.doComplete()` tool_use invocation pattern and confirm the streaming equivalent matches the expected schema shape.

- **Phase 3 (Changed-files context packing):** `AnalysisCache` currently exposes only `isUnchanged(path, hash)`. Adding `getChangedFiles()` requires understanding the existing cache structure. Read `src/analyzers/cache.ts` before finalizing Phase 3 tasks to scope this API change accurately.

- **Phase 2 (SDK upgrade breaking changes):** `@anthropic-ai/sdk` 0.39.0 → 0.76.0 and `openai` 5.23.2 → 6.22.0 both have breaking changes. Read the SDK changelogs and diff against `src/providers/anthropic.ts` and `src/providers/openai-compat.ts` before finalizing Phase 2 scope.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Cache correctness):** Content-hash fingerprinting and cascade invalidation are well-documented patterns (eslint --cache, tsc --incremental). The PITFALLS.md provides a complete checklist. No additional research needed — the implementation path is clear.

- **Phase 3 (Anthropic prompt caching):** The Anthropic docs for `cache_control` and the beta header are HIGH confidence (official docs). The ARCHITECTURE.md provides a concrete code example ready to implement. Standard pattern with no research gap.

- **Phase 3 (piscina worker pool for AST parsing):** The STACK.md documents the exact integration pattern: `src/workers/ast-worker.ts`, workerData shape, pool size = `os.cpus().length`, threshold guard at 200 files. No additional research needed.

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                                            |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack        | HIGH       | All package versions verified via npm registry; streaming APIs verified via official Anthropic and OpenAI docs; worker pool comparison verified via npmtrends                                    |
| Features     | HIGH       | Direct codebase audit of existing implementation; feature gaps identified from first-party source code reading; feature research is brownfield, not speculation                                  |
| Architecture | HIGH       | Existing codebase read directly (dag.ts, round-cache.ts, providers, analyzers); integration patterns grounded in source; streaming patterns MEDIUM from web sources                              |
| Pitfalls     | HIGH       | Caching and incremental analysis pitfalls are well-documented; streaming and concurrency pitfalls verified across multiple sources including 2026 arXiv preprints on context compression quality |

**Overall confidence:** HIGH

The research domain is well-covered. The existing codebase was read directly, eliminating speculation about what's already built. The new library additions (piscina, gpt-tokenizer, p-limit) are verified against npm registry and official documentation. The only MEDIUM-confidence elements are the streaming patterns from secondary sources — but these are secondary confirmations of official SDK docs, not the primary basis for recommendations.

### Gaps to Address

- **SDK upgrade scope:** The exact breaking changes in @anthropic-ai/sdk 0.39.0 → 0.76.0 and openai 5.23.2 → 6.22.0 have not been fully catalogued. Before Phase 2 implementation begins, read the SDK changelogs and diff the existing provider files. The STACK.md flags this explicitly — "verify against src/providers/anthropic.ts and src/providers/openai-compat.ts before bumping."

- **Round 5 and 6 dep declarations:** Whether rounds 5 and 6 currently over-declare dependencies (e.g., depending on rounds 3 or 4 when they don't consume those results) is unknown without reading `src/ai-rounds/round-5-edge-cases.ts` and `src/ai-rounds/round-6-deployment.ts`. This is a zero-to-2-hour investigation that could be Phase 2 scope-zero (no code change) or a small fix.

- **Anthropic prompt caching beta status:** The `betas: ['prompt-caching-2024-07-31']` header requirement may change as the feature moves from beta to GA. Verify the current API status before implementing Phase 3 prompt caching. The ARCHITECTURE.md research notes this as a MEDIUM confidence finding.

- **Quality regression baseline:** The PITFALLS.md recommends capturing Round 5 and Round 6 output on a known test codebase as ground truth before any compression optimization. This baseline does not yet exist. It should be created before Phase 3 token optimization work begins — not after.

- **piscina threshold calibration:** The STACK.md recommends activating the piscina worker pool only when file count exceeds ~200. The actual crossover point (where thread setup overhead is exceeded by parsing parallelism gains) has not been benchmarked for this specific codebase and workload. Phase 3 planning should include a brief profiling session on a representative large repo to calibrate this threshold.

## Sources

### Primary (HIGH confidence)

- Direct codebase audit: `src/cache/round-cache.ts`, `src/analyzers/cache.ts`, `src/orchestrator/dag.ts`, `src/providers/anthropic.ts`, `src/providers/base-provider.ts`, `src/ai-rounds/runner.ts`, `src/cli/generate.ts`, `src/config/schema.ts`, `src/ui/renderer.ts`, `src/context/compressor.ts` — first-party source
- [piscina npm registry](https://www.npmjs.com/package/piscina) — version 5.1.4; 6.7M weekly downloads
- [piscinajs/piscina GitHub](https://github.com/piscinajs/piscina) — ESM support, pool configuration
- [gpt-tokenizer npm](https://www.npmjs.com/package/gpt-tokenizer) — version 3.4.0; pure JS; identical accuracy to Python tiktoken
- [p-limit npm](https://www.npmjs.com/package/p-limit) — version 7.3.0; sindresorhus; pure ESM
- [Anthropic Streaming Messages — official docs](https://platform.claude.com/docs/en/api/messages-streaming) — .stream(), .on('text'), async iterator patterns
- [Anthropic Prompt Caching — official docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — cache_control, 5-min TTL, 1024-token minimum, pricing
- [OpenAI Streaming API — official docs](https://platform.openai.com/docs/guides/streaming-responses) — stream: true async iterator pattern
- [OpenAI Prompt Caching](https://openai.com/index/api-prompt-caching/) — automatic for ≥ 1024 tokens; usage.prompt_tokens_details.cached_tokens
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk) — version 0.76.0 current (project has 0.39.0)
- [openai npm](https://www.npmjs.com/package/openai) — version 6.22.0 current (project has 5.23.2)
- [Node.js 22.1.0 release notes](https://nodejs.org/en/blog/release/v22.1.0) — NODE_COMPILE_CACHE feature
- [fast-glob API docs — stream()](https://github.com/mrmlnc/fast-glob#streamnamestring-options-fastscanoptionsmatch-stream) — AsyncIterable interface
- [Context Rot: How Increasing Input Tokens Impacts LLM Performance (Chroma Research)](https://research.trychroma.com/context-rot) — context compression quality degradation
- [When Less is More: The LLM Scaling Paradox in Context Compression (arXiv 2602.09789)](https://arxiv.org/html/2602.09789) — semantic drift in compression
- [Context Discipline and Performance Correlation (arXiv 2601.11564)](https://arxiv.org/html/2601.11564v1) — 15-47% performance drop from context length increase

### Secondary (MEDIUM confidence)

- [npmtrends: piscina vs workerpool vs threads](https://npmtrends.com/node-worker-farm-vs-node-worker-pool-vs-piscina-vs-threads-vs-workerpool) — download volume comparison
- [compare-tokenizers GitHub](https://github.com/transitive-bullshit/compare-tokenizers) — accuracy comparison gpt-tokenizer vs tiktoken
- [pepicrft.me — Static imports and ESM startup time](https://pepicrft.me/blog/startup-time-in-node-clis/) — dynamic import for CLI startup optimization
- [Structured Output Streaming for LLMs (Preston Blackburn, Medium 2025)](https://medium.com/@prestonblckbrn/structured-output-streaming-for-llms-a836fc0d35a2) — streaming vs. Zod validation ordering
- [ESLint incremental caching issue #20186](https://github.com/eslint/eslint/issues/20186) — ESLint cache key design; roundSchemaVersion pattern
- [LLM Cache Invalidation Patterns in Java — Token-Aware Caching (GoPenAI, Dec 2025)](https://blog.gopenai.com/llm-cache-invalidation-patterns-in-java-token-aware-caching-bccaa10ff7c0) — config-hash invalidation pattern
- [Best practices to render streamed LLM responses (Chrome for Developers)](https://developer.chrome.com/docs/ai/render-llm-responses) — chunk-isolation and sanitization pitfalls

### Tertiary (LOW confidence)

- [Cache the prompt, not the response (Amit Kothari)](https://amitkoth.com/llm-caching-strategies/) — response vs. prompt caching distinction; consistent with observed patterns but single practitioner source
- [Reduce LLM Costs: Token Optimization Strategies (Rost Glukhov, 2025)](https://www.glukhov.org/post/2025/11/cost-effective-llm-applications/) — input vs. output token asymmetry; practitioner source

---

_Research completed: 2026-02-18_
_Ready for roadmap: yes_
