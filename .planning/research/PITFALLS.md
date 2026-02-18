# Pitfalls Research

**Domain:** Performance features for an LLM-based sequential analysis pipeline (TypeScript CLI)
**Researched:** 2026-02-18
**Confidence:** HIGH — caching/incremental analysis and parallelism pitfalls are well-documented; streaming and token optimization pitfalls verified across multiple sources

---

## Critical Pitfalls

### Pitfall 1: Cache Invalidation Based on File Size Alone

**What goes wrong:**
The existing `RoundCache.computeAnalysisFingerprint()` keys cache entries on `path + size` — not file content. A file edited and saved back to the same byte count (e.g., fixing a typo, changing a comment) returns the identical fingerprint. The stale cache is served. Handover produces documentation that doesn't reflect the change.

**Why it happens:**
Content hashing requires reading every file, which feels expensive during cache key computation. Size is fast to compute from a directory listing. The trade-off seems reasonable until a same-size edit occurs in practice.

**How to avoid:**
Hash file content (SHA-256 of the first 8KB or full file for small files) rather than size. For large files where a full hash is expensive, combine `mtime + size` — mtime changes on any write, even same-size edits. Add a `--validate-cache` mode that re-hashes and compares. Document that `--no-cache` is the escape hatch for suspected staleness.

**Warning signs:**

- `round-N.json` exists in `.handover/cache/rounds/` but the output documents feel outdated
- Users report "my comment change wasn't picked up" or "I renamed a variable but the docs still say the old name"
- Integration tests that edit a file and re-run don't detect the stale cache

**Phase to address:**
Caching and incremental analysis phase. Fix the fingerprint algorithm before building any incremental file-diff logic on top of it.

---

### Pitfall 2: Parallelizing Rounds That Have Implicit Sequential Dependencies

**What goes wrong:**
Rounds 1-6 are ordered for a reason: Round 2 reads Round 1's compressed context, Round 3 reads Round 2's, etc. Attempting to parallelize these rounds — even partially — causes later rounds to execute against incomplete prior context, producing documentation with contradictions or gaps. The DAG orchestrator correctly prevents this today, but adding "smart" parallelism inside the AI rounds layer (e.g., fetching Rounds 2 and 3 concurrently) bypasses this guarantee.

**Why it happens:**
The sequential dependency is logical, not structural. There's no compile-time enforcement preventing a developer from launching multiple round promises simultaneously. The temptation to parallelize all 6 LLM calls at once is natural when chasing latency reduction.

**How to avoid:**
Keep the sequential constraint at the orchestrator level. The correct parallelism target for this pipeline is not between dependent rounds — it is between independent work units: static analysis analyzers (already concurrent), rendering of unrelated documents (already concurrent in principle), and per-file parsing. Do not add Promise.all() across sequential rounds. Add a DAG validation assertion that rounds always have the prior round as a dependency.

**Warning signs:**

- Round 4 (architecture) references modules not yet detected by Round 2 (module detection)
- Round 3 output duplicates Round 2 content (both ran with identical context)
- Adding `await Promise.all([round2, round3])` to the runner produces outputs that feel less specific than the sequential version

**Phase to address:**
Parallelism phase. Define explicitly which work units are actually parallel-safe (static analysis, document rendering, file I/O) and which are not (dependent AI rounds).

---

### Pitfall 3: Streaming Structured JSON Output Before the Schema Is Complete

**What goes wrong:**
Anthropic and OpenAI streaming APIs emit tokens incrementally. If streaming is wired to display progress while rounds execute, the partial JSON output is not a valid response — `JSON.parse()` fails on any intermediate chunk. Attempting to display round progress by parsing mid-stream JSON throws, breaking the progress display and potentially terminating the round.

**Why it happens:**
Streaming looks straightforward for text responses ("print each chunk as it arrives"), but the AI round runner uses structured output with Zod schemas. The response is only a valid structure when the final closing brace arrives. Developers copy streaming patterns designed for chat interfaces and apply them to structured-output pipelines without accounting for this.

**How to avoid:**
Distinguish between streaming for UX feedback and streaming for structured output. For UX: use provider-level streaming to show a spinner, elapsed time, and token count as they increment — without attempting to parse the partial response. Only parse the complete response after the stream closes. For progress UX, use `onRetry` callbacks and elapsed timers rather than partial-chunk display. If displaying partial output is required, use streaming with accumulation and only display after complete JSON can be parsed.

**Warning signs:**

- `JSON.parse` errors in round execution logs
- Terminal spinner disappears mid-round and process hangs
- Streaming output shows partial JSON fragments in the terminal

**Phase to address:**
Streaming output phase. Define the streaming contract (UX feedback only vs. partial content display) before implementation begins.

---

### Pitfall 4: Aggressive Context Compression Causing Quality Degradation in Later Rounds

**What goes wrong:**
Each AI round compresses its output to 2000 tokens before passing to the next round. By Round 5 and 6, the compressed context from Rounds 1-4 is present — 4 × 2000 = 8000 tokens of accumulated compressed context. When the compression algorithm strips nuanced relationships, method signatures, or module boundaries to hit the 2000-token target, later rounds lose the precise details they need. Round 5 (edge cases) produces generic warnings; Round 6 (deployment) misses infrastructure specifics. The documentation looks complete but is shallower than a full-context run.

**Why it happens:**
Context compression is implemented once (in `src/context/compressor.ts`) and applied uniformly across all rounds. The 2000-token budget is a constant, not adaptive to what information the next round actually requires. Compression is validated by token count, not by information preservation.

**How to avoid:**
Test output quality — not just token counts — after adding any compression optimization. Run the current pipeline on a test codebase, capture ground-truth Round 5/6 outputs, then verify that optimized compression produces qualitatively equivalent output. Treat information loss as a bug, not a trade-off. Compression should preserve: specific module names, file paths, function names, and identified edge cases — not just topical summaries. Consider per-round compression budgets (Round 1 may compress more aggressively than Round 3) rather than a global 2000-token constant.

**Warning signs:**

- Round 5 edge cases say "validate user input" and "handle errors" without naming specific functions or files
- Round 6 deployment notes are generic ("uses environment variables") rather than specific ("DATABASE_URL required for PostgreSQL connection")
- Users report the optimized version produces "worse" docs than the slow original
- Quality metrics (existing `checkRoundQuality`) pass but human review shows shallower specificity

**Phase to address:**
Token optimization phase. Establish a quality regression test suite before touching any compression parameters.

---

### Pitfall 5: File Content Caching That Ignores Config Changes

**What goes wrong:**
Incremental analysis caches per-file parse results keyed on file content hash. When the user changes their `.handover.yml` — adding a provider, changing the model, adjusting context window settings — the file-level cache is still valid but the analysis parameters have changed. The cached results are used with the new config, producing output calibrated to the wrong context window, model, or token budget. Worse: the displayed token cost reflects the cached run, not the actual model being used.

**Why it happens:**
Incremental caching is designed to answer "did this file change?" — it does not account for "did the configuration that processes these files change?" The two invalidation concerns are conflated when they should be composed: cache key = file hash AND config hash.

**How to avoid:**
Compose the cache key from both the file content fingerprint and a hash of the relevant config fields (model, provider, contextWindow, outputReserve, safetyMargin). When any config field that affects analysis changes, all file-level caches are invalidated. Store the config hash alongside cached results so the invalidation reason can be logged: "Config changed: cache invalidated."

**Warning signs:**

- Switching from Claude 3.5 Sonnet to Claude 3.5 Haiku produces the same output without any API calls
- Token usage display shows 0 tokens for a fresh run on a different model
- Round outputs differ between manual full-run and cached run on the same files

**Phase to address:**
Caching and incremental analysis phase. Define the cache key schema before implementation — retrofitting config-hash invalidation into an already-shipped cache is a rewrite.

---

### Pitfall 6: Correctness Regression from Parallelizing Static Analyzers That Share State

**What goes wrong:**
The 8 static analyzers already run concurrently. Adding more parallelism (e.g., parallelizing file reads within an analyzer, or running multiple analysis passes concurrently) introduces shared-state races if any analyzer mutates a shared data structure. The WASM tree-sitter parser is the most dangerous target: `parser-service.ts` uses a single WASM instance. Concurrent parses against the same instance corrupt AST output silently — the parse appears to succeed but returns incorrect node trees.

**Why it happens:**
The AST analyzer already batches (30 files per batch, sequential batches). Developers adding parallelism inside the batch see no obvious shared state, but the `web-tree-sitter` WASM runtime is not thread-safe. Node.js is single-threaded but async parallelism can interleave WASM calls if not serialized.

**How to avoid:**
Treat the WASM parser as a mutex-guarded resource. All concurrent file parsing must go through a serialization layer (a queue or semaphore) rather than direct concurrent calls. Use `p-limit` with a concurrency of 1 for WASM parser access, or run parsers in Worker threads with one instance per thread. Test with a codebase where parallel parsing would exercise multiple languages simultaneously.

**Warning signs:**

- AST extraction returns different symbol counts on repeated runs of the same codebase
- TypeScript extractor reports 0 methods for a file that clearly has methods
- `parser-service.ts dispose()` is called before all concurrent parses complete

**Phase to address:**
Parallelism phase. Map all shared resources before expanding concurrency. The WASM parser is not the only risk — also audit the dependency graph analyzer for shared Map mutations.

---

## Moderate Pitfalls

### Pitfall 7: Streaming Progress That Races with the Terminal Renderer

**What goes wrong:**
The existing `TerminalRenderer` in `src/ui/` uses in-place cursor updates (`sisteransi`) to draw a live progress board. Adding streaming output (token counts updating per-chunk) that writes to stdout concurrently with the terminal renderer causes interleaving. Characters from the progress board and the streaming update appear on the same line, producing garbage output on any TTY that doesn't use the raw cursor-control approach exclusively.

**Why it happens:**
Streaming token display seems like a simple `process.stdout.write(count)` addition. But the terminal renderer has already moved the cursor to a specific row. A write from a different code path resets the cursor position or interleaves characters.

**How to avoid:**
Funnel all terminal writes through the `TerminalRenderer`. The renderer must be the single owner of stdout in TTY mode. Token count updates from streaming should be passed as events to the renderer, not written directly. In CI mode (non-TTY), streaming updates can write lines freely. Gate all streaming writes on `process.stdout.isTTY` being false, or route through the renderer's event interface.

**Warning signs:**

- Terminal output shows overlapping text during a round execution
- Cursor jumps to wrong position after a streaming update
- CI output looks fine but interactive terminal output is garbled

**Phase to address:**
Streaming output phase. Do not add any direct `process.stdout.write` calls outside the `TerminalRenderer` abstraction.

---

### Pitfall 8: Round Cache That Doesn't Invalidate When Prior Rounds Change

**What goes wrong:**
Round N's cached result was generated using Round (N-1)'s output as context. If Round (N-1) is invalidated and re-runs (producing different output), Round N's cache is stale — it was built on a context that no longer exists. The current `computeHash` for Round N includes `roundNumber + model + analysisFingerprint` but does not include a hash of Round (N-1)'s output. Round N is served from cache with an incorrect prior context.

**Why it happens:**
The dependency is logical (rounds depend on prior rounds' output) but the cache key only captures static inputs (files + model). The dynamic input — prior round output — is not included in the key.

**How to avoid:**
Cascade-invalidate: when Round N's cache is invalidated or re-computed, invalidate all rounds > N. Alternatively, include a hash of Round (N-1)'s result in Round N's cache key. The second approach is more precise but requires storing and loading prior-round output hashes. The cascade approach is simpler and correct: `clear rounds N, N+1, ..., 6` whenever any round upstream of N changes.

**Warning signs:**

- Round 3 output contradicts Round 2 output even though Round 2 was re-run
- Adding a new file causes Round 1 to re-run but Rounds 2-6 still serve cached results that reference the old codebase
- `--no-cache` produces substantively different output than a cached run on the same codebase

**Phase to address:**
Caching and incremental analysis phase. Implement cascade invalidation before the cache goes into production use.

---

### Pitfall 9: Token Optimization That Degrades Prompts Consistently Across Models

**What goes wrong:**
Token optimization (removing verbose context, truncating file content, compressing prior round output) is tuned against one model (e.g., Claude 3.5 Sonnet) and produces acceptable quality on that model. The same optimization produces significantly worse output on a different model (e.g., Groq Llama, Ollama) that has a smaller effective context window or different sensitivity to compressed context. The quality regression is invisible to the developer who tested only on the primary model.

**Why it happens:**
Quality is tested on the developer's default model. The LLM provider abstraction makes it easy to forget that different models behave differently at token limits, with compressed context, and with dense prompts. Groq's Llama models and Ollama local models may have lower tolerance for compressed system prompts.

**How to avoid:**
Run quality regression tests across at least 2 providers (Anthropic + one alternative) before shipping any token optimization. Define measurable quality metrics — not just "it produced output" but "Round 5 named at least N specific files and functions." Use the existing `checkRoundQuality` as the baseline and add per-provider assertions.

**Warning signs:**

- Users on Groq report generic documentation after an optimization ships
- Quality metrics pass on Anthropic but fail on OpenAI-compatible providers
- `--model ollama/mistral` produces empty arrays where Claude produces specific results

**Phase to address:**
Token optimization phase. Test matrix must include at least Anthropic Claude and one alternative before any optimization is considered complete.

---

### Pitfall 10: Incremental Analysis That Skips Re-Parsing Deleted Files

**What goes wrong:**
Incremental analysis re-parses only files that changed or were added since the last run. Deleted files are not re-parsed — they are simply absent from the new file list. But if the prior cache still contains round results that referenced those deleted files (module names, function references, dependency edges), the stale references remain in the documentation. The documentation says a module exists that has been deleted.

**Why it happens:**
Deletion detection requires comparing the current file list against the cached file list. This comparison is easy to omit — the common path is "hash new file, compare to cached hash" — without a step that checks "which cached files are no longer on disk."

**How to avoid:**
During incremental analysis, compute the diff: `(cached files) - (current files) = deleted files`. If deleted files are non-empty, invalidate all rounds that referenced those files (typically all rounds, since static analysis and context packing run globally). Document that deletion always triggers a full re-analysis — this is correct behavior, not a gap to optimize away.

**Warning signs:**

- Documentation references functions or modules from files that were deleted
- `handover generate` after deleting a module still shows that module in the feature list
- Round 2 module detection names deleted packages

**Phase to address:**
Caching and incremental analysis phase. Deletion detection is a required correctness property, not a stretch goal.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term correctness or quality problems in a performance-optimized pipeline.

| Shortcut                                                  | Immediate Benefit                  | Long-term Cost                                                               | When Acceptable                                                               |
| --------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Key cache on `path + size` instead of content hash        | Fast fingerprinting, no file reads | Same-size edits silently use stale cache; users get wrong docs               | Never for correctness-critical cache; use `mtime + size` as minimum           |
| Hardcode 2000-token compression budget for all rounds     | Simple implementation              | Uniform compression loses late-round specificity; quality degrades invisibly | Only acceptable if a quality regression test suite validates it               |
| Parallelize rounds inside the runner                      | Reduces wall-clock time            | Breaks sequential context dependency; later rounds produce generic output    | Never — parallel work units are analyzers and renderers, not dependent rounds |
| Skip cascade invalidation for dependent rounds            | Simpler cache logic                | Round N+1 served with stale context from a re-run Round N                    | Never — cascade invalidation is required for correctness                      |
| Test token optimization on one model only                 | Fast iteration                     | Quality regressions on other providers go undetected until user reports      | Only acceptable for initial prototype; two-provider tests before shipping     |
| Write streaming token counts to stdout directly           | Easy to implement                  | Interleaves with `TerminalRenderer` cursor control; corrupts TTY output      | Never in TTY mode; only in non-TTY/CI mode                                    |
| Cache rounds without including prior-round output in hash | Simpler key computation            | Stale round N when round N-1 changes                                         | Never — either cascade-invalidate or include prior hash in key                |

---

## Integration Gotchas

Common mistakes when connecting performance features to the existing pipeline components.

| Integration                                  | Common Mistake                                                                                       | Correct Approach                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `RoundCache` + `DAGOrchestrator`             | Cache hit skips the DAG step entirely, losing event emission (`onStepComplete`)                      | Cache hits must still emit orchestrator events so UI progress updates correctly        |
| Streaming + `TerminalRenderer`               | Calling `process.stdout.write()` directly from a streaming callback                                  | Pass streaming events through `TerminalRenderer`'s event interface; it owns stdout     |
| Incremental analysis + `compressRoundOutput` | Serving cached compressed context from a prior run without verifying it matches current round output | Compression is derived from round output — if round re-runs, recompute compression     |
| `p-limit` concurrency + WASM parser          | Setting concurrency > 1 for `ParserService.parse()`                                                  | WASM runtime is not safe for concurrent calls; concurrency must be 1 for parser access |
| File-level cache + config changes            | File hash unchanged when model changes from Claude to Groq                                           | Include a hash of analysis-affecting config fields in the file cache key               |
| Streaming structured output + Zod validation | Attempting Zod parse on partial stream chunks                                                        | Buffer full response, then validate; streaming is only for UX feedback                 |
| Incremental analysis + `TokenUsageTracker`   | Reporting 0 tokens for cache-hit rounds, skewing cost estimates                                      | Distinguish "from cache (0 API cost)" from "not run" in usage tracking                 |

---

## Performance Traps

Patterns that work at the current scale but break as codebase size grows — or that optimize the wrong bottleneck.

| Trap                                                                   | Symptoms                                                                               | Prevention                                                                          | When It Breaks                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Optimizing round wall-clock time when context packing dominates        | Parallelizing rounds saves seconds; context packing still takes minutes on large repos | Profile before optimizing; measure which phase actually dominates                   | At codebases > 500 files where packing is the bottleneck, not LLM calls |
| Full re-parse on every incremental run to "verify" cache               | Defeats the purpose of incremental analysis; `mtime` check is as fast as re-hashing    | Use `mtime + size` for fast staleness check; full hash only on mtime change         | Immediately — defeats the entire purpose of incremental analysis        |
| Streaming that buffers the entire response before displaying           | No perceived UX improvement; users still wait for full round completion                | Stream token count increments in real time; display time-elapsed, not chunk content | At slow API response times (>30s per round) where users need feedback   |
| Token optimization that targets input tokens but ignores output tokens | Optimizing system prompt size; output token count (and cost) unchanged                 | Track and optimize both input and output token budgets                              | Cost reduction is partial; bill doesn't decrease proportionally         |
| Parallel document rendering without output directory locking           | Two renderers write to same file path; output is truncated or corrupted                | Ensure each document has a unique output path; no two renderers write the same file | When `--only` filter is removed and all 14 documents render in parallel |

---

## Security Mistakes

Performance feature-specific security issues in an LLM analysis pipeline.

| Mistake                                                              | Risk                                                                                                                                      | Prevention                                                                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Persisting LLM round outputs to `.handover/cache/` without filtering | Round outputs contain analysis of code, which may include extracted secrets from comments or env var names that were in the analyzed code | Never cache raw source excerpts; cache only LLM-generated analysis results (already the pattern in `RoundCacheEntry`) |
| Cache directory world-readable on shared systems                     | Other users on a multi-user system can read `.handover/cache/rounds/`                                                                     | Set directory permissions to `0o700` on creation; add to docs that cache contains analysis of proprietary code        |
| Using file path in cache key without normalization                   | Symlinks, relative paths, and absolute paths for the same file produce different keys; partial cache misses                               | Normalize all file paths to repo-root-relative canonical paths before hashing                                         |
| Streaming API responses logged at DEBUG level                        | API responses in logs expose the LLM-generated analysis, which may surface extracted code content                                         | Gate verbose logging behind `--verbose`; never log raw LLM response bodies at INFO or WARN level                      |

---

## UX Pitfalls

User experience mistakes specific to adding performance features to a CLI tool.

| Pitfall                                                          | User Impact                                                               | Better Approach                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Showing "Using cached results" with no indication of cache age   | Users don't know if cache is minutes or months old; trust in output drops | Show cache timestamp: "Using cached results from 2h ago. Run with --no-cache to refresh."              |
| No progress during streaming rounds (spinner only)               | 45-second LLM call with no feedback feels like a hang                     | Show elapsed time and token count as stream progresses: "Round 3: 12.4s, ~3,200 tokens..."             |
| Cache hit silently produces same output as prior run             | Users can't tell if their recent changes were analyzed                    | Log which rounds were cache hits vs. fresh: "Round 1: cached (8h ago). Round 2: fresh (file changed)." |
| Incremental analysis re-running all rounds when any file changes | Users with large repos who change one file wait for full re-analysis      | Only invalidate rounds whose inputs include the changed file; unchanged rounds serve from cache        |
| `--no-cache` with no confirmation on large repos                 | Users accidentally re-run a 5-minute full analysis                        | Print estimated time when cache is cleared: "Cache cleared. Full re-analysis will take ~4 minutes."    |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical correctness properties specific to performance retrofitting.

- [ ] **Cache invalidation:** Cache key verified to change on same-size file edits — test by editing a comment, verifying the round re-runs
- [ ] **Cascade invalidation:** Verified that changing Round 1 output invalidates Rounds 2-6 cached results — test by clearing only Round 1 and confirming Rounds 2-6 also re-run
- [ ] **Config-hash invalidation:** Verified that changing model in `.handover.yml` forces full re-analysis — test by switching provider and confirming 0 cache hits
- [ ] **Deletion detection:** Verified that deleting a source file triggers full re-analysis — test by removing a module and confirming documentation no longer references it
- [ ] **Streaming + TTY:** Verified that streaming token display does not corrupt terminal output on an actual TTY — test by running with `--verbose` in an interactive terminal, not just in CI
- [ ] **WASM parser concurrency:** Verified that parallel file reads do not corrupt parse results — test by running on a mixed-language codebase with concurrency > 1 and comparing output to sequential run
- [ ] **Quality regression baseline:** Round 5 and Round 6 output on a known codebase captured before any compression optimization — verified that post-optimization output names the same specific files and functions
- [ ] **Multi-provider quality check:** Token optimization validated on at least Anthropic + one alternative provider — not just the default model

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall                                               | Recovery Cost | Recovery Steps                                                                                                                                                |
| ----------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stale cache from size-only fingerprinting             | LOW           | Add `--no-cache` flag (already exists); document as escape hatch; fix hash algorithm in same release                                                          |
| Cascade invalidation not implemented, stale round N+1 | MEDIUM        | Clear entire `.handover/cache/` directory; implement cascade invalidation; ship as a correctness fix with a major cache-version bump                          |
| Quality regression from compression optimization      | MEDIUM        | Revert the compression parameter change; ship a corrected version; add quality regression tests before re-attempting                                          |
| Streaming / TTY corruption                            | LOW           | Gate streaming on `process.stdout.isTTY === false`; route all writes through `TerminalRenderer`; regression is immediately visible in manual testing          |
| WASM parser race condition under parallelism          | HIGH          | Revert parallelism change; add serialization (p-limit with concurrency 1 for parser); re-test on mixed-language codebase before re-shipping                   |
| Config change not invalidating cache                  | LOW           | `--no-cache` (already exists) resolves immediately; fix in next release by including config hash in cache key                                                 |
| Deleted files still referenced in cached round output | MEDIUM        | Full cache clear resolves immediately; implement deletion detection in incremental analysis; add integration test that verifies deletion triggers re-analysis |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall                                                  | Prevention Phase                 | Verification                                                                                                   |
| -------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Cache invalidation based on file size alone              | Caching and incremental analysis | Edit a file comment (same size); confirm round re-runs                                                         |
| Parallelizing rounds with sequential dependencies        | Parallelism                      | Add DAG assertion that rounds N+1 always list round N as dep; confirm no `Promise.all` across dependent rounds |
| Streaming structured JSON before schema is complete      | Streaming output                 | Attempt to parse a mid-stream chunk; confirm `JSON.parse` is never called on partial output                    |
| Context compression degrading later round quality        | Token optimization               | Capture Round 5/6 ground truth before optimization; compare specificity after                                  |
| File cache ignoring config changes                       | Caching and incremental analysis | Change model in config; confirm 0 cache hits on next run                                                       |
| Shared WASM parser state under parallelism               | Parallelism                      | Run with concurrency > 1 on mixed-language codebase; diff output against sequential run                        |
| Streaming races with TerminalRenderer                    | Streaming output                 | Run interactively in TTY; verify no line corruption during a round                                             |
| Round N cache not invalidated when Round N-1 changes     | Caching and incremental analysis | Manually clear only round 1 cache; confirm rounds 2-6 also clear                                               |
| Token optimization quality regression on other providers | Token optimization               | Run quality test on Anthropic + at least one alternative provider                                              |
| Incremental analysis not detecting deleted files         | Caching and incremental analysis | Delete a source file; run again; verify deleted module is absent from output                                   |

---

## Sources

- [Cache the prompt, not the response — why most LLM caching fails (Amit Kothari)](https://amitkoth.com/llm-caching-strategies/) — MEDIUM confidence (practitioner analysis; core architectural distinction between response caching vs. prompt caching)
- [Context Rot: How Increasing Input Tokens Impacts LLM Performance (Chroma Research)](https://research.trychroma.com/context-rot) — HIGH confidence (primary research; demonstrates U-shaped performance curve and distractor sensitivity)
- [When Less is More: The LLM Scaling Paradox in Context Compression (arXiv 2602.09789)](https://arxiv.org/html/2602.09789) — HIGH confidence (2026 preprint; semantic drift failure mode in compression)
- [Context Discipline and Performance Correlation (arXiv 2601.11564)](https://arxiv.org/html/2601.11564v1) — HIGH confidence (2026 preprint; 15-47% performance drop from context length increase)
- [Best practices to render streamed LLM responses (Chrome for Developers)](https://developer.chrome.com/docs/ai/render-llm-responses) — HIGH confidence (official guidance; chunk-isolation sanitization pitfall)
- [Cache Invalidation: What You're Likely Doing Wrong (Trio Tech Systems)](https://triotechsystems.com/the-cache-invalidation-nightmare-what-youre-likely-doing-wrong/) — MEDIUM confidence (practitioners; thundering herd and stale data patterns)
- [LLM Cache Invalidation Patterns in Java — Token-Aware Caching (GoPenAI, Dec 2025)](https://blog.gopenai.com/llm-cache-invalidation-patterns-in-java-token-aware-caching-bccaa10ff7c0) — MEDIUM confidence (domain-specific; config-hash invalidation pattern)
- [Reduce LLM Costs: Token Optimization Strategies (Rost Glukhov, 2025)](https://www.glukhov.org/post/2025/11/cost-effective-llm-applications/) — MEDIUM confidence (practitioner; input vs. output token asymmetry)
- [Structured Output Streaming for LLMs (Preston Blackburn, Medium 2025)](https://medium.com/@prestonblckbrn/structured-output-streaming-for-llms-a836fc0d35a2) — MEDIUM confidence (practitioner; streaming vs. Zod validation ordering)
- Codebase direct analysis: `src/cache/round-cache.ts`, `src/orchestrator/dag.ts`, `src/ai-rounds/runner.ts`, `src/context/token-counter.ts`, `src/ui/`, `.planning/codebase/CONCERNS.md` — HIGH confidence (first-party source)

---

_Pitfalls research for: performance features (caching, parallelism, streaming, token optimization) in handover CLI_
_Researched: 2026-02-18_
