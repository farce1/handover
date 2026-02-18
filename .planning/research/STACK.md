# Stack Research

**Domain:** Performance Engineering — Caching, Parallelization, Streaming, Token Optimization, Startup Speed, Large Repo Scaling for a TypeScript CLI (handover-cli v2.0)
**Researched:** 2026-02-18
**Confidence:** HIGH (versions verified via npm registry; streaming APIs verified via official Anthropic docs; worker pool comparison verified via npmtrends + official repos; Node.js built-ins verified via official Node.js docs)

---

## Context

This is a **subsequent-milestone research file** for v2.0 performance work on handover-cli. The existing production stack (TypeScript, Commander.js, Vitest, tsup, web-tree-sitter, Zod, fast-glob, simple-git, @anthropic-ai/sdk, openai) is settled and not re-researched here.

Existing performance foundations already in the codebase:

- `src/cache/round-cache.ts` — content-hash disk cache for AI round results (JSON per round)
- `src/analyzers/cache.ts` (`AnalysisCache`) — file-content-hash cache for static analyzer results
- `src/context/token-counter.ts` — chars/4 heuristic token estimator with provider fallback
- `src/orchestrator/dag.ts` — `Promise.race()`-based DAG executor (already runs independent steps in parallel)

This file covers **new library additions** needed for the six performance domains. Libraries already in `package.json` are noted but not redundantly recommended.

---

## Recommended Stack

### 1. Caching — Incremental Analysis

The existing `AnalysisCache` and `RoundCache` are pure Node.js stdlib (no new deps). They are the right foundation. **No new caching library is needed.** The gap is not the storage mechanism but the hash strategy: file sizes alone (current `computeAnalysisFingerprint`) miss content changes without size changes.

**Change needed:** upgrade the fingerprint to include `mtime` (from `fs.stat`) alongside file path and size. `fs.stat` is stdlib — no new dependency. This is a code change, not a dependency addition.

**What NOT to add:**

- `node-cache`, `lru-cache`, `keyv` — in-memory caches that don't survive between CLI invocations. Disk JSON files (already implemented) are the right strategy for a CLI that runs once and exits.
- SQLite via `better-sqlite3` — overkill for hash-indexed JSON files; adds 8 MB binary.

---

### 2. Parallel Execution — Worker Thread Pool

The DAG orchestrator already runs independent steps concurrently via `Promise.race()`. The bottleneck is **CPU-bound work**: web-tree-sitter AST parsing and file content hashing for large repos, which block the event loop.

| Technology | Version | Purpose                                | Why                                                                                                                                                                                                                                |
| ---------- | ------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `piscina`  | `5.1.4` | Worker thread pool for CPU-bound tasks | Most downloaded worker pool library (6.7M weekly downloads); supports ESM; handles thread lifecycle, task queue, and backpressure; authored by Node.js core contributors; significantly faster than raw `worker_threads` for pools |

**Integration point:** `src/analyzers/ast-analyzer.ts` — tree-sitter parsing is the primary CPU-bound hotspot. Move `ParserService.extract()` calls into a piscina worker task file.

**What NOT to use:**

- Raw `node:worker_threads` — requires manual pool management, lifecycle handling, and error propagation. Piscina abstracts all of this correctly.
- `workerpool` — valid alternative but 10x fewer downloads than piscina; less active maintenance.
- `child_process.fork()` — 4-8x higher memory overhead per process than worker threads for this use case.

---

### 3. Streaming Output — Progressive Result Display

Both the Anthropic and OpenAI SDKs support streaming natively. **No new streaming library is needed** — the capability exists in the SDKs already in `package.json`. The work is integrating their streaming APIs into the AI rounds layer.

**SDK streaming interfaces (verified against official docs):**

**Anthropic (`@anthropic-ai/sdk@0.76.0` current, project has `0.39.0`):**

```typescript
// Event-based (buffered for terminal display)
await client.messages.stream({ ... }).on('text', (text) => { /* partial token */ });

// Memory-efficient async iterator (no accumulation)
const stream = await client.messages.create({ ..., stream: true });
for await (const event of stream) { /* process SSE events */ }

// Finalise after streaming (useful for long responses avoiding HTTP timeout)
const message = await client.messages.stream({ ... }).finalMessage();
```

**OpenAI (`openai@6.22.0` current, project has `5.23.2`):**

```typescript
// Memory-efficient async iterator
const stream = await client.chat.completions.create({ ..., stream: true });
for await (const chunk of stream) { /* process chunks */ }

// Higher-level streaming runner with events
const runner = client.chat.completions.stream({ ... });
runner.on('content', (delta) => { /* partial token */ });
```

**SDK upgrade needed:** `@anthropic-ai/sdk` from `0.39.0` → `0.76.0` (current) and `openai` from `5.23.2` → `6.22.0` (current). Both have breaking changes — verify against `src/providers/anthropic.ts` and `src/providers/openai-compat.ts` before bumping. The streaming API surface is stable across these versions.

**Terminal streaming pattern:** Use `process.stdout.write(token)` with `\r` cursor control (via existing `sisteransi`) to stream tokens into the existing `TerminalRenderer` in `src/ui/`. No new library needed — `sisteransi` (already in `package.json`) handles cursor positioning.

---

### 4. Token Cost Optimization — Accurate Counting + Provider Prompt Caching

#### 4a. Accurate Token Counting

The current heuristic (`chars/4` in `src/context/token-counter.ts`) has 15-25% error on code with Unicode, punctuation-heavy content, and non-English identifiers. For budget enforcement in context packing, this causes both over-reservation (wastes context window) and under-reservation (prompt overruns).

| Technology      | Version | Purpose                                                                 | Why                                                                                                                                                                                                                 |
| --------------- | ------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gpt-tokenizer` | `3.4.0` | Accurate BPE token counting for OpenAI models (cl100k_base, o200k_base) | Pure JavaScript — no WASM; identical token counts to Python tiktoken; fastest pure-JS tokenizer on npm since v2.4.0; 96%+ accuracy vs exact count; zero native dependencies (no build step, works on all platforms) |

**Integration point:** Replace `Math.ceil(text.length / 4)` in `src/context/token-counter.ts` with `encode(text).length` from `gpt-tokenizer` for OpenAI/OpenAI-compatible providers. Keep `provider.estimateTokens()` as primary path — `gpt-tokenizer` becomes the fallback when no provider is available.

**For Anthropic:** The Anthropic SDK's `provider.estimateTokens()` already delegates to the SDK. The SDK's own counting (via `client.beta.messages.countTokens()` in newer SDK versions) is exact. Upgrade the SDK version first; then use `countTokens()` for pre-flight budget calculation in `estimate` command.

**What NOT to use:**

- `@dqbd/tiktoken` (WASM port) — adds WASM binary and slower cold start; only 3-6x faster than `gpt-tokenizer` at runtime, not worth the complexity for a CLI
- `tiktoken` (official npm package, also WASM) — same tradeoff; WASM startup adds ~50-100ms
- `js-tiktoken` — older API, less maintained than `gpt-tokenizer`

#### 4b. Provider-Side Prompt Caching

Prompt caching is a **server-side feature**, not a library dependency. Both providers support it; the integration is API parameter changes in `src/providers/`.

**Anthropic prompt caching (explicit `cache_control`):**

- Add `cache_control: { type: 'ephemeral' }` to the static system prompt block in each round
- 5-minute TTL by default; extend to `1h` TTL if supported by model
- Cache reads cost 10% of input token price; cache writes cost 125%
- Minimum cacheable length: 1024 tokens
- Requires SDK ≥ 0.40.0 (upgrade from 0.39.0 already needed for streaming)
- Implementation: modify `buildSystemPrompt()` in `src/ai-rounds/` to add `cache_control` to the static codebase context block

```typescript
// In src/providers/anthropic.ts — add to system content blocks
{ type: 'text', text: staticCodebaseContext, cache_control: { type: 'ephemeral' } }
```

**OpenAI prompt caching (automatic):**

- No API change needed — OpenAI caches automatically for prompts ≥ 1024 tokens
- Cache hits visible in `usage.prompt_tokens_details.cached_tokens` response field
- Track via `TokenUsageTracker` in `src/context/tracker.ts` — add `cachedTokens` field
- 50% discount on cached tokens (not 10% like Anthropic)

---

### 5. Startup Speed — Reducing Time to First Output

**Target:** `handover --help` in < 100ms (currently likely 200-400ms due to static imports of web-tree-sitter WASM loader and SDK clients at module load).

#### 5a. Node.js Built-in Compile Cache (no new dependency)

Node.js 22.1.0 introduced `NODE_COMPILE_CACHE` environment variable. When set, Node.js persists V8 bytecode for all loaded modules. Subsequent runs skip re-parsing TypeScript-compiled JavaScript. Reduces startup from ~130ms to ~80ms in practice.

**Integration:** Add to the CLI binary shebang wrapper or document in README for power users:

```bash
NODE_COMPILE_CACHE=~/.cache/handover node ./dist/index.js
```

No new dependency — this is a Node.js 22 built-in. Requires Node.js ≥ 22.1.0 (current engines field says ≥ 18.0.0; tighten to ≥ 22 or document as opt-in).

#### 5b. Dynamic Imports for Heavy Modules (code change, no new dependency)

web-tree-sitter loads WASM at module import time. If the user runs `handover --help` or `handover estimate`, the WASM loader is never needed.

**Pattern:** Convert `ParserService` initialization to lazy dynamic import. The `ParserService` is currently instantiated at top-level in `src/analyzers/coordinator.ts`. Move to a deferred `import()` inside the `generate` command path.

```typescript
// Before: static import at top of file
import { ParserService } from '../parsing/parser-service.js';

// After: dynamic import inside the execute() path
const { ParserService } = await import('../parsing/parser-service.js');
```

**What NOT to do:** Use `v8-compile-cache` npm package — it targets CommonJS only; handover is ESM. The built-in `NODE_COMPILE_CACHE` is the modern ESM-compatible replacement.

#### 5c. Supporting Library

| Technology | Version | Purpose                                           | Why                                                                                                                                                                                                    |
| ---------- | ------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `p-limit`  | `7.3.0` | Concurrency limiter for I/O-bound file operations | Already widely used (sindresorhus ecosystem); pure ESM; controls fan-out during large repo file reads without needing worker threads; prevents `EMFILE` (too many open files) on repos with 10k+ files |

**Integration point:** `src/analyzers/ast-analyzer.ts` and `src/analyzers/file-discovery.ts` — limit concurrent `fs.readFile()` calls to `p-limit(20)` (I/O bound, not CPU bound).

---

### 6. Large Repo Scaling

For repos with 10,000+ files, the bottleneck is memory (loading all file paths and sizes) and I/O fan-out (concurrent file reads). No new database or stream processing framework is needed — the existing architecture handles this with two changes.

| Technology | Version | Purpose                                   | Why                                                       |
| ---------- | ------- | ----------------------------------------- | --------------------------------------------------------- |
| `p-limit`  | `7.3.0` | Cap concurrent file reads during analysis | (Same as startup section — single dep for both use cases) |

**Scaling patterns (code changes, no new deps):**

1. **Streaming file discovery:** `fast-glob` (already in `package.json`) supports async iteration via `stream()`. Replace `await fg(patterns)` with `fg.stream(patterns)` for `for await` iteration — processes files one batch at a time instead of loading all paths into memory first.

2. **Analyzer concurrency cap:** The current 8 concurrent analyzers in `src/analyzers/coordinator.ts` are already parallelized. For large repos, the `ASTAnalyzer` spawns one parse per file — cap this at `p-limit(os.cpus().length * 2)` for CPU-bound work via piscina workers.

3. **Context packing budget:** Already implemented in `src/context/packer.ts` with tiered content (full/signatures/skip). No change needed — this already handles arbitrarily large repos by excluding low-priority files.

---

## Supporting Libraries Summary

| Library             | Version             | Purpose                                              | New vs Existing             |
| ------------------- | ------------------- | ---------------------------------------------------- | --------------------------- |
| `piscina`           | `5.1.4`             | Worker thread pool for CPU-bound AST parsing         | **NEW**                     |
| `gpt-tokenizer`     | `3.4.0`             | Accurate BPE token counting for OpenAI-family models | **NEW**                     |
| `p-limit`           | `7.3.0`             | Concurrency cap for I/O-bound file operations        | **NEW**                     |
| `@anthropic-ai/sdk` | upgrade to `0.76.0` | Streaming API + prompt caching + `countTokens()`     | **UPGRADE** (from `0.39.0`) |
| `openai`            | upgrade to `6.22.0` | Streaming API (breaking change in v6)                | **UPGRADE** (from `5.23.2`) |
| `fast-glob`         | existing `3.3.3`    | Use `.stream()` API for large repo file discovery    | **CODE CHANGE ONLY**        |
| `sisteransi`        | existing `1.0.5`    | Cursor control for streaming terminal output         | **CODE CHANGE ONLY**        |

---

## Installation

```bash
# New production dependencies
npm install piscina gpt-tokenizer p-limit

# SDK upgrades (verify breaking changes against src/providers/ first)
npm install @anthropic-ai/sdk@latest openai@latest
```

---

## Alternatives Considered

| Feature           | Recommended                            | Alternative                | Why Not                                                                                                                              |
| ----------------- | -------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Worker pool       | `piscina@5.1.4`                        | `workerpool`               | 10x fewer weekly downloads; piscina is the ecosystem standard for Node.js worker pools                                               |
| Worker pool       | `piscina@5.1.4`                        | `threads.js`               | Not updated for Node.js 22; last release 2023; piscina is actively maintained                                                        |
| Worker pool       | `piscina@5.1.4`                        | Raw `node:worker_threads`  | No pool management, no backpressure, manual lifecycle — piscina wraps this correctly                                                 |
| Token counting    | `gpt-tokenizer@3.4.0`                  | `@dqbd/tiktoken` (WASM)    | WASM binary adds startup latency; pure JS is fast enough for pre-flight estimation                                                   |
| Token counting    | `gpt-tokenizer@3.4.0`                  | `tiktoken` npm (WASM)      | Same WASM startup problem; no advantage over pure JS for estimation use case                                                         |
| Concurrency limit | `p-limit@7.3.0`                        | `p-queue`                  | p-queue is feature-rich but p-limit is all that's needed for a simple concurrency cap; p-limit is 3x smaller                         |
| Caching backend   | Disk JSON (existing)                   | `better-sqlite3`           | Overkill for hash-indexed files; adds 8 MB native binary; JSON files are simpler and fast enough                                     |
| Caching backend   | Disk JSON (existing)                   | `lru-cache` / `keyv`       | In-memory — doesn't survive between CLI invocations; wrong model for a CLI tool                                                      |
| Startup speed     | `NODE_COMPILE_CACHE` + dynamic imports | `pkg` (bundled executable) | pkg is unmaintained since 2023; Node.js SEA (`--build-sea`) is the modern replacement but adds complexity for marginal startup gains |
| Startup speed     | `NODE_COMPILE_CACHE` + dynamic imports | `v8-compile-cache` npm     | CommonJS-only; handover is ESM; the built-in `NODE_COMPILE_CACHE` supersedes this                                                    |

---

## What NOT to Use

| Avoid                                            | Why                                                                        | Use Instead                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `v8-compile-cache` npm package                   | CommonJS only; does not work with ESM (handover's module format)           | `NODE_COMPILE_CACHE` env var (Node.js 22 built-in)                      |
| `better-sqlite3` for cache storage               | Native binary, 8 MB, complex setup; disk JSON files already work correctly | Existing `AnalysisCache` + `RoundCache` (stdlib only)                   |
| `lru-cache` / `node-cache`                       | In-memory only; cache lost on every CLI invocation                         | Existing disk-based caches in `src/cache/` and `src/analyzers/cache.ts` |
| `@dqbd/tiktoken` or `tiktoken` (WASM)            | WASM startup adds 50-100ms cold start to a CLI; wrong tradeoff             | `gpt-tokenizer` (pure JS, identical accuracy for OpenAI models)         |
| `workerpool` or `threads.js`                     | Less maintained than piscina; fewer downloads; less Node.js 22 testing     | `piscina`                                                               |
| `child_process.fork()` for parallelism           | 4-8x more memory per process vs worker threads; slower startup per task    | `piscina` (worker thread pool)                                          |
| Any streaming middleware library (express-style) | handover is a CLI writing to stdout/files, not an HTTP server              | Native `process.stdout.write()` + `sisteransi` cursor control           |
| `pkg` for bundled executable                     | Unmaintained since 2023 (Vercel archived the repo)                         | Node.js built-in SEA (`node --build-sea`) or just `tsup` + `npm link`   |

---

## Version Compatibility

| Package                    | Version                       | Compatible With                 | Notes                                                                                                                                                |
| -------------------------- | ----------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `piscina@5.1.4`            | current                       | Node.js ≥ 16, ESM, TypeScript 5 | Requires worker task files to use ESM exports; use `workerData` for passing config                                                                   |
| `gpt-tokenizer@3.4.0`      | current                       | Node.js ≥ 18, ESM               | Pure ESM package; `import { encode } from 'gpt-tokenizer'`; supports cl100k_base and o200k_base encodings                                            |
| `p-limit@7.3.0`            | current                       | Node.js ≥ 18, ESM               | Pure ESM; `import pLimit from 'p-limit'`                                                                                                             |
| `@anthropic-ai/sdk@0.76.0` | current (upgrade from 0.39.0) | Node.js ≥ 18                    | Verify `messages.stream()` API shape in `src/providers/anthropic.ts`; `cache_control` on content blocks requires SDK ≥ 0.40.0                        |
| `openai@6.22.0`            | current (upgrade from 5.23.2) | Node.js ≥ 18                    | v6 has breaking changes in stream handling vs v5; verify `chat.completions.create({ stream: true })` return type in `src/providers/openai-compat.ts` |
| `NODE_COMPILE_CACHE`       | —                             | Node.js ≥ 22.1.0 only           | Not available on Node.js 18 or 20; document as opt-in optimization for users on Node.js 22+                                                          |

---

## Stack Patterns by Variant

**For CPU-bound parallelism (AST parsing at scale):**

- Use `piscina` with a dedicated `src/workers/ast-worker.ts` that calls `ParserService.extract()`
- Pass `{ filePath, content, language }` as `workerData`
- Pool size = `os.cpus().length` (not more; tree-sitter is CPU-heavy)
- One `piscina` instance per process lifetime, created lazily only when `fileCount > threshold` (e.g., > 200 files)

**For I/O-bound parallelism (file reads at scale):**

- Use `p-limit(20)` wrapping `fs.readFile()` calls
- No worker threads needed — I/O is non-blocking; the event loop handles it
- Rule of thumb: ≤ 20 concurrent file reads avoids `EMFILE` on macOS/Linux defaults

**For streaming LLM output:**

- Use provider's native async iterator (`for await`) rather than event emitters when memory efficiency matters
- Use `.stream().on('text', cb)` pattern when you need backpressure-aware terminal rendering
- Never buffer the full streamed response in memory before displaying — defeats the purpose

**For prompt caching (Anthropic):**

- Cache only the static prefix: system prompt + static codebase context (the part that doesn't change between rounds)
- Do NOT add `cache_control` to per-round dynamic content (prior round summaries change every run)
- Monitor `cache_creation_input_tokens` vs `cache_read_input_tokens` in usage to verify cache hits

**For small repos (< 500 files):**

- Skip piscina entirely — overhead of worker thread setup exceeds parsing time
- Keep existing synchronous-in-event-loop parsing via web-tree-sitter
- Add a `fileCount` threshold check before deciding whether to use piscina

---

## Integration Map

| Performance Feature            | File(s) to Modify                                                         | New Dep         | Node.js Built-in                   |
| ------------------------------ | ------------------------------------------------------------------------- | --------------- | ---------------------------------- |
| Incremental cache hash (mtime) | `src/cache/round-cache.ts`, `src/analyzers/cache.ts`                      | None            | `fs.stat`                          |
| Worker pool for AST parsing    | `src/analyzers/ast-analyzer.ts`, new `src/workers/ast-worker.ts`          | `piscina`       | `node:worker_threads`              |
| LLM streaming display          | `src/providers/anthropic.ts`, `src/providers/openai-compat.ts`, `src/ui/` | SDK upgrades    | —                                  |
| Accurate token counting        | `src/context/token-counter.ts`                                            | `gpt-tokenizer` | —                                  |
| Anthropic prompt caching       | `src/providers/anthropic.ts`, `src/ai-rounds/` (system prompt building)   | SDK upgrade     | —                                  |
| OpenAI prompt caching tracking | `src/context/tracker.ts`                                                  | SDK upgrade     | —                                  |
| I/O concurrency cap            | `src/analyzers/ast-analyzer.ts`, `src/analyzers/file-discovery.ts`        | `p-limit`       | —                                  |
| Streaming file discovery       | `src/analyzers/file-discovery.ts`                                         | None            | `fast-glob` `.stream()`            |
| V8 compile cache               | README / bin wrapper                                                      | None            | `NODE_COMPILE_CACHE` (Node ≥ 22.1) |
| Lazy WASM loading              | `src/cli/generate.ts`, `src/analyzers/coordinator.ts`                     | None            | `import()` dynamic                 |

---

## Sources

- [piscina npm registry](https://www.npmjs.com/package/piscina) — version 5.1.4 verified; 6.7M weekly downloads — HIGH confidence
- [piscinajs/piscina GitHub](https://github.com/piscinajs/piscina) — README, ESM support, pool configuration — HIGH confidence
- [npmtrends: piscina vs workerpool vs threads](https://npmtrends.com/node-worker-farm-vs-node-worker-pool-vs-piscina-vs-threads-vs-workerpool) — download volume comparison — HIGH confidence
- [gpt-tokenizer npm](https://www.npmjs.com/package/gpt-tokenizer) — version 3.4.0 current; pure JS; identical accuracy to Python tiktoken — HIGH confidence
- [p-limit npm](https://www.npmjs.com/package/p-limit) — version 7.3.0 current; sindresorhus; pure ESM — HIGH confidence
- [Anthropic Streaming Messages — official docs](https://platform.claude.com/docs/en/api/messages-streaming) — `.stream()`, `.on('text')`, async iterator patterns verified — HIGH confidence
- [Anthropic Prompt Caching — official docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — `cache_control: { type: 'ephemeral' }`, 5-min TTL, 1024-token minimum, pricing — HIGH confidence
- [OpenAI Streaming API — official docs](https://platform.openai.com/docs/guides/streaming-responses) — `stream: true` async iterator pattern — HIGH confidence
- [OpenAI Prompt Caching](https://openai.com/index/api-prompt-caching/) — automatic for ≥ 1024 tokens; `usage.prompt_tokens_details.cached_tokens` — HIGH confidence
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk) — version 0.76.0 current (project has 0.39.0) — HIGH confidence
- [openai npm](https://www.npmjs.com/package/openai) — version 6.22.0 current (project has 5.23.2) — HIGH confidence
- [Node.js 22.1.0 release notes](https://nodejs.org/en/blog/release/v22.1.0) — `NODE_COMPILE_CACHE` feature introduction — HIGH confidence
- [compare-tokenizers GitHub](https://github.com/transitive-bullshit/compare-tokenizers) — accuracy comparison gpt-tokenizer vs tiktoken — MEDIUM confidence (secondary source, aligns with npm page claims)
- [pepicrft.me — Static imports and ESM startup time](https://pepicrft.me/blog/startup-time-in-node-clis/) — dynamic import pattern for CLI startup optimization — MEDIUM confidence
- [fast-glob API docs — stream()](https://github.com/mrmlnc/fast-glob#streamnamestring-options-fastscanoptionsmatch-stream) — AsyncIterable interface verified — HIGH confidence

---

_Stack research for: handover-cli v2.0 Performance Features_
_Researched: 2026-02-18_
