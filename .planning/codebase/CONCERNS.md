# Codebase Concerns

**Analysis Date:** 2026-02-18

## Tech Debt

**Large Language Extractors (Parser Complexity):**
- Issue: Three large extractor files (TypeScript 1180 lines, Python 877 lines, Rust 748 lines, Go 702 lines) handle tree-sitter AST traversal with deeply nested switch statements and manual node walking.
- Files: `src/parsing/extractors/typescript.ts`, `src/parsing/extractors/python.ts`, `src/parsing/extractors/rust.ts`, `src/parsing/extractors/go.ts`
- Impact: Difficult to maintain, extend, and test. Changes to one language risk breaking others. Error propagation in nested extraction methods is implicit (returns null on failure).
- Fix approach: Refactor common AST walking patterns into shared utilities (`src/parsing/utils/node-helpers.ts` exists but is minimal). Extract type annotation parsing, parameter extraction, and decorator handling into reusable modules. Consider strategy pattern for language-specific logic.

**Regex Fallback Coverage Gaps:**
- Issue: `src/parsing/extractors/regex-fallback.ts` (503 lines) provides fallback extraction for unsupported languages (Java, Ruby, PHP, etc.). Regex patterns are coarse and lack accurate symbol extraction for complex constructs (generics, type parameters, nested classes).
- Files: `src/parsing/extractors/regex-fallback.ts`
- Impact: Incomplete symbol extraction for non-tree-sitter languages. Functions with complex signatures may be missed or misidentified. Generic type parameters are stripped (not captured).
- Fix approach: Expand test coverage in `tests/integration/edge-cases.test.ts` for regex fallback accuracy. Consider maintaining language-specific extractor docs for known limitations. Validate extracted symbol counts against expected baselines.

**AI Round Fallback Chain (Degradation Path):**
- Issue: Rounds 1-6 have fallback generators (`src/ai-rounds/fallbacks.ts`) that degrade to static analysis data. Round 5 (edge cases) and Round 6 (deployment) heavily rely on TODO/FIXME markers when AI analysis fails, which may not surface actual edge cases or deployment concerns.
- Files: `src/ai-rounds/fallbacks.ts`, `src/ai-rounds/round-5-edge-cases.ts`, `src/ai-rounds/round-6-deployment.ts`
- Impact: Users may receive incomplete handover documentation if API calls fail. Edge case and deployment analysis become unreliable without LLM assistance.
- Fix approach: Expand fallback heuristics beyond TODO markers (e.g., file complexity metrics, cyclomatic complexity estimates, dead code detection, unused exports). Add warnings in rendered documents when fallback mode is used. Implement quality metrics to surface when LLM data is unavailable.

**Token Budget Estimation Heuristic:**
- Issue: Token estimation uses simple `chars / 4` fallback (`src/context/token-counter.ts`) when provider estimator is unavailable. This is a rough approximation that may underestimate or overestimate actual token usage.
- Files: `src/context/token-counter.ts`, `src/context/packer.ts`
- Impact: Context packing may exceed provider token limits (causing API failures) or underutilize available budget (wasting context). Safety margin of 90% (`safetyMargin: 0.9`) provides some buffer but is not foolproof.
- Fix approach: Use provider-specific token counters (Anthropic SDK, OpenAI SDK) consistently. Validate token estimates against actual API usage in round execution. Add logging of estimated vs. actual token counts per round.

**Oversized File Heuristics (Two-Pass Strategy):**
- Issue: Files >8000 estimated tokens with score >=30 are split into signatures + sections (`src/context/packer.ts:139-209`). Section prioritization is hard-coded: exported functions (1st), edge-case functions with TODO markers (2nd). This assumes edge cases are marked and exported functions are highest priority, which may not hold for all codebases.
- Files: `src/context/packer.ts`
- Impact: Large utility files with many exports may consume disproportionate context. Unmarked edge cases are ignored. Non-exported critical functions may be skipped.
- Fix approach: Make section prioritization configurable (allow users to override strategy via CLI flags or config). Implement alternative strategies: by cyclomatic complexity, by test coverage, by git blame (recent changes). Add validation step to measure actual token consumption of packed sections.

**Memory Management for WASM Parser:**
- Issue: Parser service (WASM-based tree-sitter) requires explicit `dispose()` calls. AST analyzer calls `service.dispose()` after batch processing (`src/analyzers/ast-analyzer.ts:87`), but parsing happens in batches of 30 files. Memory leaks possible if parsing exceptions occur between tree creation and tree.delete().
- Files: `src/parsing/parser-service.ts`, `src/analyzers/ast-analyzer.ts`, `src/parsing/index.ts`
- Impact: Long-running document generation (multiple AI rounds with concurrent parsing) could accumulate WASM memory. Large codebases (>1000 files) may experience OOM crashes.
- Fix approach: Wrap tree parsing in strict try-finally blocks. Validate WASM memory release happens deterministically. Add heap monitoring for large codebase tests (e.g., `tests/integration/performance.test.ts`). Consider implementing a memory pool or bounded parser queue.

**DAG Execution Error Propagation:**
- Issue: Failed steps skip their dependents in DAG orchestrator (`src/orchestrator/dag.ts:227-232`). Subsequent steps in the pipeline may not be aware of the failure context and may produce misleading results based on missing upstream data.
- Files: `src/orchestrator/dag.ts`
- Impact: If static analysis fails, AI rounds proceed with empty/default data, producing low-quality documentation. Users may not realize analysis was incomplete.
- Fix approach: Implement error context propagation so downstream steps can check upstream status and emit warnings. Track error reasons and surface in rendered documents. Add early termination option if critical steps fail.

## Known Bugs

**Index Signature and Call Signature Extraction (TypeScript):**
- Symptoms: TypeScript interfaces with index signatures (`[key: string]: value`) or call signatures are not extracted.
- Files: `src/parsing/extractors/typescript.ts:538`
- Trigger: Parse any TypeScript interface with `[key: string]: Type` or `(arg: Type): ReturnType` as members.
- Workaround: None; these signatures are silently skipped. Severity is low if codebase uses uncommon patterns.

**Self/Cls Parameter Handling (Python):**
- Symptoms: Python `self` and `cls` parameters may be double-skipped in some extraction paths (extractTypedParameter, extractDefaultParameter, extractTypedDefaultParameter).
- Files: `src/parsing/extractors/python.ts:236-274`
- Trigger: Methods with typed default parameters (e.g., `def method(self, arg: Type = 'default')`).
- Workaround: Manual parameter documentation in method docstrings will be captured.

**Export Re-export Detection (TypeScript):**
- Symptoms: Barrel file exports (`export * from './module'`) with namespace aliases may be partially captured.
- Files: `src/parsing/extractors/typescript.ts:718-736`
- Trigger: TypeScript files using `export * as NS from './module'` syntax.
- Workaround: Explicitly name exports instead of using namespaces; they will be captured fully.

## Security Considerations

**Grammar Download from CDN (Integrity):**
- Risk: WASM grammar files are downloaded from unpkg CDN during first use. No signature verification; only basic file size validation against expected ranges.
- Files: `src/grammars/downloader.ts:63-108`
- Current mitigation: Size validation (min/max bytes) provides basic sanity check. Cached files (in `~/.handover/grammars/`) avoid repeated downloads. CDN is widely used (low compromise risk).
- Recommendations: Implement SHA256 hash verification for downloaded files. Allow users to pre-download and supply grammars via `HANDOVER_GRAMMAR_DIR` env var (already supported). Pin unpkg CDN version in manifest (`tree-sitter-wasms@0.1.13`).

**LLM API Key Exposure:**
- Risk: API keys passed via command line (`--api-key`) or environment variables. `process.env` access in `src/config/loader.js` may expose keys in error messages or debug logs.
- Files: `src/config/loader.ts`, `src/cli/index.ts`
- Current mitigation: Keys are not logged by default. `.env` files are in `.gitignore`. CLI help text does not include examples with real keys.
- Recommendations: Explicitly mask API keys in error messages (show `sk-...` only). Warn users if API key is passed on command line (use environment variable instead). Add `.env.example` file documenting required variables without values.

**Input File Path Traversal:**
- Risk: Codebase paths are passed through glob matching (`fast-glob`) and are used to construct file read operations. No explicit path sanitization.
- Files: `src/analyzers/file-discovery.ts`, `src/cli/generate.ts`, `src/context/packer.ts`
- Current mitigation: `fast-glob` is bounded to project directory by design. Tree-sitter WASM parsing is sandboxed. No `eval()` or dynamic module loading from user input.
- Recommendations: Add explicit path normalization (remove `..` traversal). Validate all file paths are within project root before reading. Unit test path traversal scenarios.

**User-Supplied Codebase Analysis (LLM Prompt Injection):**
- Risk: Source code content is passed verbatim into LLM prompts. Adversarial code comments (prompt injection) could influence model behavior.
- Files: `src/context/packer.ts:35-97`, `src/ai-rounds/runner.ts`
- Current mitigation: LLM prompts use structured schemas (Zod) for response validation. Generated prompts are templated (low likelihood of injection affecting output structure).
- Recommendations: Add input sanitization for code content passed to LLM (strip adversarial patterns). Use stricter system prompts that prevent response format deviation. Test with known prompt injection payloads.

## Performance Bottlenecks

**Large File Context Packing:**
- Problem: Files larger than 8000 tokens are split into signatures + sections, then all sections are scored and packed. For a 50MB codebase, this can result in 1000+ packed files.
- Files: `src/context/packer.ts:228-350`
- Cause: Greedy top-down packing (by score descending) does not account for context window limits on downstream AI rounds. Each round compresses output to 2000 tokens, accumulating context loss.
- Improvement path: Implement adaptive packing strategy that considers downstream round budget constraints. Profile actual token consumption across sample codebases. Pre-filter low-value files (test files, generated code) before packing.

**Batch File Reading (I/O Bound):**
- Problem: Files are read sequentially in batches of 50 (`src/context/packer.ts:16`). For a 5000-file codebase, this requires 100 batch iterations with synchronous file reads.
- Files: `src/context/packer.ts:228-350`
- Cause: Memory safety constraint (avoid overwhelming WASM parser). Batch size is hard-coded, not adaptive to available memory.
- Improvement path: Measure available heap memory and dynamically adjust batch size. Consider parallel I/O with semaphore-limited concurrency (e.g., pLimit library). Profile actual memory overhead per file.

**TODO Scanner Regex Scanning:**
- Problem: TODO/FIXME scanning uses regex matching on every source file line. For a 200-file project, this adds ~100ms overhead.
- Files: `src/analyzers/todo-scanner.ts:94-125`
- Cause: No early termination; all files are scanned even if no TODOs are expected (e.g., vendor directories). Regex is executed per line.
- Improvement path: Skip common non-source paths (node_modules, dist, vendor). Compile regex once. Consider parallel scanning. Add skip heuristic based on file size.

**Dependency Graph Construction (Quadratic Scanning):**
- Problem: Import relationship detection walks AST for all files then walks again to resolve paths. For 1000 files with deep import trees, this is O(n²) complexity.
- Files: `src/analyzers/dependency-graph.ts`
- Cause: No caching of resolved paths. Each import resolution may traverse multiple source trees.
- Improvement path: Implement path resolution cache. Lazy-load dependency graph only for requested modules. Add early termination for cyclic dependencies.

## Fragile Areas

**AST Symbol Extraction Accuracy (Language-Specific):**
- Files: `src/parsing/extractors/typescript.ts`, `src/parsing/extractors/python.ts`, `src/parsing/extractors/rust.ts`, `src/parsing/extractors/go.ts`
- Why fragile: Each language has unique AST node types and edge cases (generics in Rust, decorators in TypeScript, type annotations in Python). Manual node walking is error-prone. Changes to tree-sitter grammar versions can break extraction.
- Safe modification: Always run full integration test suite (`tests/integration/edge-cases.test.ts`) after changes. Add round-trip tests (parse code, extract symbols, render markdown, verify symbols are present). Test with real codebases, not just synthetic fixtures.
- Test coverage: AST extraction has basic coverage but lacks:
  - Decorator handling (TypeScript)
  - Generic parameter extraction (Rust, Go)
  - Property type annotations (all languages)
  - Async/await/generator detection (JavaScript/TypeScript)

**LLM Validation and Quality Checks:**
- Files: `src/ai-rounds/validator.ts`, `src/ai-rounds/quality.ts`, `src/ai-rounds/runner.ts:70-89`
- Why fragile: Validation checks for claim vs. static data mismatch. If LLM makes claims about non-existent functions, validation detects this (dropRate > 0.3). Quality checks look for required fields. Both are heuristic-based (hard-coded thresholds).
- Safe modification: Validation logic is in separate module (`validator.ts`). To adjust thresholds, update quality check constants. Test with various LLM models (different vendors have different tendencies). Add logging of validation/quality scores per round.
- Test coverage: Limited. No test for validation behavior when LLM produces wildly inaccurate data.

**Document Rendering (Context Dependency):**
- Files: `src/renderers/render-*.ts` (14 renderer files), `src/renderers/registry.ts`
- Why fragile: Each document renderer depends on precise output structure from prior AI rounds. If Round 1 output changes, downstream documents (2-6) may fail rendering. Renderer registry maintains order dependencies (`ROUND_DEPS`).
- Safe modification: Do not reorder rounds or remove intermediate rounds. Add comprehensive render tests for each document with mock AI round data. Validate all interdocument links are correct.
- Test coverage: Integration tests render full document suite but don't test individual document rendering in isolation.

**Cache Invalidation (Fingerprinting):**
- Files: `src/cache/round-cache.ts`, `src/cli/generate.ts:402-407`
- Why fragile: Cache key is based on `RoundCache.computeAnalysisFingerprint()` from file sizes/paths. If files are edited without changing size, stale cache may be used. If codebase structure changes (files renamed/moved), cache becomes invalid.
- Safe modification: Hash algorithm uses file entries (path + size). To invalidate cache, change file content (which usually changes size) or use `--no-cache` flag. Consider adding file modification times to fingerprint.
- Test coverage: No test for cache invalidation scenarios.

## Scaling Limits

**Parser WASM Memory (Large Codebases):**
- Current capacity: Batch size is 30 files per parse batch. Typical file size is 1-10KB. Total batch memory is ~300KB (compressed), ~3MB (decompressed AST).
- Limit: Large codebases (1000+ source files) approach Node.js heap limits on systems with 512MB memory. WASM memory is separate from Node.js heap but shared process. Estimated safe limit: ~5000 source files with standard batching.
- Scaling path: Implement adaptive batch sizing based on available heap. Add streaming parser that processes one file at a time. Consider off-process parsing (worker threads). Profile memory with large synthetic codebase tests.

**Context Window Packing (AI Model Input):**
- Current capacity: File content budget is `(maxTokens - 3000 overhead - 4096 output) * 0.9 safety`. For Anthropic Claude 3.5 Sonnet (200K context), this is ~178K tokens available for files.
- Limit: Average TypeScript file is ~200 tokens. Realistic packing capacity: ~890 files at full detail, ~2000 files at signatures-only tier. Codebases >2000 TypeScript files will be truncated.
- Scaling path: Implement tiered packing (full for critical modules, signatures for others, skip for test files). Add user-configurable context allocation per round. Compress across rounds more aggressively (currently 2000 tokens per prior round).

**AI Round Retry Logic (Token Budgets):**
- Current capacity: Each round allows one retry (if quality/validation fails). Retries consume 2x tokens from the token budget. With 6 rounds, worst case is 6 * 2 = 12 retries, doubling token consumption.
- Limit: API rate limits (OpenAI: 30 requests/min; Anthropic: depends on tier) and cost limits may be exceeded with aggressive retries. No built-in spending limit.
- Scaling path: Add configurable retry budgets per round. Implement exponential backoff and circuit breaker pattern for rate limits. Track cumulative spend and warn when approaching budget.

**Todo Scanning (Large Codebases with Many TODO Markers):**
- Current capacity: TODO scanner extracts all TODO/FIXME/HACK markers. Typical codebase: 10-50 TODOs. Rendering includes all in document.
- Limit: If a codebase has 1000+ TODOs, the rendered document becomes unwieldy (10+ pages).
- Scaling path: Limit displayed TODOs to top N (by severity, by module). Group by category. Implement filter by date (last 6 months). Add summary statistics only for large lists.

## Dependencies at Risk

**web-tree-sitter (WASM Parser):**
- Risk: JavaScript tree-sitter bindings are experimental/unmaintained compared to native tree-sitter. WASM binary format changes may break compatibility. Grammar versioning is pinned (`tree-sitter-wasms@0.1.13`) but updates require explicit maintenance.
- Impact: Parser failures would block entire analysis pipeline. WASM memory leaks could crash long-running processes.
- Migration plan: Keep native fallback extractor (`regex-fallback.ts`) as production safety net. Monitor `web-tree-sitter` issues on GitHub. Have plan to switch to native tree-sitter bindings if WASM becomes unsustainable.

**OpenAI SDK (openai@5.23.2):**
- Risk: OpenAI SDK major version updates may break API compatibility. Current pinned version is not the latest (5.x is recent but not LTS). API endpoints/response formats may change.
- Impact: If OpenAI changes API, SDK update is required. No current abstraction layer between SDK and prompt execution.
- Migration plan: Provider abstraction in `src/providers/` is good. Abstracting OpenAI-specific logic away is already done. To upgrade: test with new SDK version, validate schema compatibility, update provider implementation.

**Anthropic SDK (@anthropic-ai/sdk@0.39.0):**
- Risk: Same as OpenAI: SDK version pinning, API changes, response format changes.
- Impact: Medium; handled by provider abstraction.
- Migration plan: Same as OpenAI: test with new SDK, validate schema compatibility.

**fast-glob (File Discovery):**
- Risk: Glob pattern matching may have performance regressions or security issues (path traversal). Current version is stable.
- Impact: File discovery hangs or crashes on certain `.gitignore` patterns. Could impact all pipelines.
- Migration plan: If performance issues arise, implement custom glob using lower-level fs.walk. Escape special characters in paths.

**tree-sitter Grammars (Third-Party WASM Binaries):**
- Risk: Grammar binaries are downloaded from unpkg CDN. No source verification. Grammars may be outdated or have bugs.
- Impact: Symbol extraction accuracy depends on grammar quality. Outdated grammars may miss new syntax (e.g., TypeScript 5.x features).
- Migration plan: Periodically update grammar versions. Test extraction on real codebases using new syntax. Consider maintaining mirror of WASM files internally if CDN becomes unavailable.

## Missing Critical Features

**Incremental Analysis (Large Codebase Re-analysis):**
- Problem: Full analysis runs on every `handover generate` invocation. For a 5000-file codebase, this re-parses and re-analyzes everything even if only 1 file changed.
- Blocks: Users cannot quickly iterate on handover docs without waiting 5+ minutes per iteration.
- Implementation: Cache AST results per file (keyed by path + hash). On re-run, only parse files with changed content. Merge new/changed files into prior analysis. This requires persistent cache layer.

**Monorepo Module Boundary Detection:**
- Problem: Monorepos (Next.js, Turborepo, Nx) have multiple package.json files. Current detection finds packages but analysis treats monorepo as single project.
- Blocks: Documentation doesn't reflect true module structure. Each workspace is analyzed together, losing critical context.
- Implementation: Already started (see `src/cli/monorepo.ts`). Complete by: detecting workspace boundaries, running parallel analysis per workspace, merging results with inter-workspace dependency graph.

**Project Configuration Metadata Extraction:**
- Problem: Handover documents don't include critical config analysis (tsconfig.json strict settings, ESLint rules, Docker configuration, kubernetes manifests, Terraform, etc.).
- Blocks: Handover docs lack infrastructure/build context. Operator assuming default configurations.
- Implementation: Add config-analyzer (similar to ast-analyzer). Parse and extract key settings from: tsconfig.json, .eslintrc, .prettierrc, webpack.config.js, docker-compose.yml, .github/workflows, Dockerfile, etc.

**Delta/Diff Mode (Handover for PRs):**
- Problem: Handover generates docs for entire codebase. PR reviewers need focused docs on what changed.
- Blocks: Cannot use handover as part of PR review workflow.
- Implementation: Add `--since-commit` or `--diff-base` mode. Analyze only files changed since commit. Focus AI rounds on changes. Generate focused documentation.

**Custom Document Templates:**
- Problem: Document structure is hard-coded in `src/renderers/render-*.ts`. Users cannot customize output format.
- Blocks: Teams with specific documentation standards cannot adapt handover.
- Implementation: Support Handlebars/Jinja2 templates for document generation. Move renderer logic into templates. Allow users to supply custom templates via `--template-dir` flag.

**Interactive CLI Mode (Iterative Refinement):**
- Problem: Command-line flags for all options are verbose. Users cannot interactively refine analysis.
- Blocks: Exploratory analysis workflows are tedious.
- Implementation: Add interactive REPL with commands to: re-run specific rounds, adjust parameters, inspect intermediate results, export to different formats.

## Test Coverage Gaps

**Regex Fallback Extractor (Non-Tree-Sitter Languages):**
- What's not tested: Java, Kotlin, C#, C++, Ruby, PHP extraction. Tests are minimal; only basic function/class detection is verified.
- Files: `src/parsing/extractors/regex-fallback.ts`, `tests/integration/edge-cases.test.ts`
- Risk: Regex patterns may miss complex syntaxes (generics in Java, decorators in Python, etc.). Changes to regex may silently break extraction for 8+ languages.
- Priority: **High** - Affects all non-tree-sitter languages. Add per-language tests with real-world code samples.

**Parser Memory Cleanup (WASM Disposal):**
- What's not tested: WASM tree.delete() is called in finally blocks, but no test validates memory is actually released. No test for memory leaks under repeated parsing.
- Files: `src/parsing/parser-service.ts:133-136`, `src/analyzers/ast-analyzer.ts:86-87`
- Risk: Long-running processes (concurrent AI rounds) may accumulate WASM memory. OOM crashes on large codebases.
- Priority: **High** - Affects production stability. Add memory profiling tests (with `--max-old-space-size` limits).

**LLM Validation Quality Checks:**
- What's not tested: Validation logic when LLM makes completely incorrect claims. Quality check thresholds (dropRate > 0.3, acceptable quality flags) are untested.
- Files: `src/ai-rounds/validator.ts`, `src/ai-rounds/quality.ts`, `src/ai-rounds/runner.ts:70-89`
- Risk: LLM failures may go undetected, producing low-quality documentation. Fallback logic is not exercised in tests.
- Priority: **Medium** - Add test cases with synthetic bad LLM outputs. Validate retry and fallback behavior.

**Cache Invalidation:**
- What's not tested: Cache invalidation when files change. No test for stale cache detection or forced cache clearing.
- Files: `src/cache/round-cache.ts`, `src/cli/generate.ts`
- Risk: Users may use stale cached analysis without realizing files have changed.
- Priority: **Medium** - Add test for file modification scenario and `--no-cache` flag.

**DAG Orchestrator Failure Handling:**
- What's not tested: Behavior when step dependencies fail. Correct propagation of error state to downstream steps.
- Files: `src/orchestrator/dag.ts`, `src/cli/generate.ts`
- Risk: Failed upstream steps may silently proceed, producing misleading results.
- Priority: **Medium** - Add test for failure scenarios (static analysis fails, AI round fails, etc.).

**Large Codebase Performance:**
- What's not tested: Actual performance on codebases >500 files. Current perf test uses synthetic 200-file project.
- Files: `tests/integration/performance.test.ts`
- Risk: Bottlenecks may not appear until real-world usage at scale.
- Priority: **Low** - Add integration tests with real large codebases (e.g., open-source repos). Profile memory and CPU.

---

*Concerns audit: 2026-02-18*
