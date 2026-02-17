# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** A single `handover generate` command produces a complete, cross-referenced knowledge base that eliminates the 2-4 week onboarding gap when codebases change hands.
**Current focus:** All 9 phases complete -- Ready for npm publish.

## Current Position

Phase: 9 of 9 (Integration Hardening)
Plan: 4 of 4 in current phase (09-01, 09-02, 09-03, 09-04 complete)
Status: All plans complete. Package publish-ready with validation suite and README.
Last activity: 2026-02-17 -- Completed 09-04-PLAN.md (validation tests + README)

Progress: [████████████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 31
- Average duration: 5min
- Total execution time: 142min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-01 | 3 tasks | 3min | 3min |
| 01-02 | 2 tasks | 3min | 3min |
| 01-03 | 3 tasks | 4min | 4min |
| 02-01 | 3 tasks | 5min | 5min |
| 02-02 | 2 tasks | 15min | 15min |
| 02-03 | 3 tasks | 9min | 9min |
| 03-01 | 3 tasks | 4min | 4min |
| 03-02 | 2 tasks | 3min | 3min |
| 03-03 | 2 tasks | 3min | 3min |
| 03-04 | 3 tasks | 5min | 5min |
| 04-01 | 2 tasks | 2min | 2min |
| 04-02 | 2 tasks | 2min | 2min |
| 04-03 | 2 tasks | 2min | 2min |
| 05-01 | 2 tasks | 5min | 5min |
| 05-02 | 2 tasks | 4min | 4min |
| 05-03 | 2 tasks | 4min | 4min |
| 05-04 | 2 tasks | 4min | 4min |
| 06-01 | 2 tasks | 4min | 4min |
| 06-02 | 2 tasks | 4min | 4min |
| 06-03 | 2 tasks | 4min | 4min |
| 06-04 | 3 tasks | 4min | 4min |
| 07-01 | 2 tasks | 5min | 5min |
| 07-02 | 3 tasks | 5min | 5min |
| 07-03 | 2 tasks | 5min | 5min |

| 08-01 | 2 tasks | 6min | 6min |
| 08-02 | 2 tasks | 4min | 4min |
| 08-03 | 2 tasks | 6min | 6min |

| 09-01 | 2 tasks | 4min | 4min |
| 09-02 | 2 tasks | 3min | 3min |
| 09-03 | 2 tasks | 8min | 8min |
| 09-04 | 2 tasks | 3min | 3min |

**Recent Trend:**
- Last 5 plans: 4min, 3min, 8min, 3min
- Trend: consistent execution; all Phase 09 plans complete

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 9-phase comprehensive roadmap derived from 91 requirements following data-flow dependency order
- [Roadmap]: Phase 8 (Providers/Reliability) depends on Phase 5 not Phase 7, enabling parallel work with Terminal UX
- [Phase 01]: Schema-first: Zod schemas are single source of truth, types derived via z.infer
- [Phase 02]: tree-sitter-wasms prebuilt WASM grammars over self-building (avoids Docker requirement)
- [Phase 02]: New ParsedFileSchema in src/parsing/types.ts, existing SourceFileSchema kept for backward compatibility
- [Phase 02]: createRequire for WASM path resolution in ESM context
- [Phase 02]: Per-language RegexFallbackExtractor instances (langId pre-configured, since extractFromSource has no langId param)
- [Phase 02]: Dynamic import with try-catch for TS/Python extractors in createParserService() (graceful when 02-02 not yet run)
- [Phase 02]: getNamedChildren() null-safe utility for web-tree-sitter namedChildren iteration
- [Phase 02]: Downgraded web-tree-sitter to 0.25.10 for tree-sitter-wasms ABI compatibility (dylink vs dylink.0)
- [Phase 02]: JSX component detection via @component decorator marker on JSX-returning functions
- [Phase 02]: Python visibility by naming convention (__name=private, _name=protected, dunder=public)
- [Phase 03]: AnalysisContext interface in types.ts (avoids circular dep with cache.ts)
- [Phase 03]: AnalyzerResult<T> as both Zod schema factory and TS interface for flexibility
- [Phase 03]: fast-glob ALWAYS_IGNORE for traversal exclusion + ignore for .gitignore post-filter
- [Phase 03]: Object.freeze for immutable shared context (STAT-09 requirement)
- [Phase 03]: Batch-50 file processing pattern for memory-bounded concurrency in analyzers
- [Phase 03]: CATEGORY_MAP with TodoItem['category'] type for compile-time safe marker-to-category mapping
- [Phase 03]: Combined multi-language ENV_REFERENCE_REGEX with alternation for single-pass env var scanning
- [Phase 03]: simpleGit named import for ESM compatibility (not default import)
- [Phase 03]: for-each-ref for branch age detection (single command vs per-branch logs)
- [Phase 03]: File ownership limited to top 30 most-changed files (N+1 performance bound)
- [Phase 03]: Empty typed fallback objects for failed analyzer results -- enables partial results via Promise.allSettled
- [Phase 03]: Lazy import for CLI analyze command action handler (fast startup pattern)
- [Phase 03]: Static-only early return in generate.ts bypasses API key validation
- [Phase 04]: chars/4 heuristic as standalone token estimator with optional LLMProvider delegation
- [Phase 04]: Test file penalty of -15 from score to deprioritize test files in context packing
- [Phase 04]: Lock files excluded entirely from scoring (zero handover value)
- [Phase 04]: Safety margin 0.9 default for token budget to avoid context window overflow
- [Phase 04]: contextWindow config key (not context) to avoid collision with existing business context string field
- [Phase 04]: Progressive truncation order for context compression: open questions -> findings -> relationships -> modules
- [Phase 04]: Warn threshold default 0.85 for token budget utilization warnings
- [Phase 05]: Temperature 0.3 for all AI analysis rounds (determinism over creativity)
- [Phase 05]: Flat Zod schemas to avoid zod-to-json-schema $ref complexity with tool_use
- [Phase 05]: Quality thresholds: 500 chars / 3-5 refs for Rounds 1-5, 200 chars / 2 refs for Round 6
- [Phase 05]: Validator scoped to file paths and import claims only (not high-level observations)
- [Phase 05]: XML-tagged prompt sections for Claude structured prompting best practices
- [Phase 05]: At most one retry per round via boolean hasRetried flag (not a counter)
- [Phase 05]: Retry triggers: validation dropRate >0.3 OR quality.isAcceptable === false
- [Phase 05]: maxTokens 4096 for Round 1, 8192 for Round 2 (module detection needs more output)
- [Phase 05]: 2000 tokens per prior round for compressed inter-round context
- [Phase 05]: Failed rounds return degraded status with static fallback (never throw)
- [Phase 05]: Round 5 per-module fan-out caps at 20 modules, batched in groups of 10
- [Phase 05]: Round 5 retries failed modules only (not entire round) with stricter prompting
- [Phase 05]: Cross-cutting convention detection threshold: pattern must appear in 2+ modules
- [Phase 05]: Round 6 includes actual file content from packed context for deployment-related files
- [Phase 05]: Deferred Proxy pattern for passing not-yet-available state to closure-based DAG step creators
- [Phase 05]: Context packing folded into static-analysis step (fast, simplifies DAG graph)
- [Phase 05]: Round results extracted via onStepComplete hook interception for inter-round passing
- [Phase 05]: Render step depends on all leaf AI rounds (R4, R5, R6) before document generation
- [Phase 06]: RenderContext as unified data bag: all round results + static analysis in one object
- [Phase 06]: DOCUMENT_REGISTRY maps 14 docs with aliases/groups/round-deps for --only optimization
- [Phase 06]: ROUND_DEPS transitive expansion ensures computeRequiredRounds includes all prerequisite rounds
- [Phase 06]: crossRef always generates links even to non-generated docs (resolve when user generates all)
- [Phase 06]: structuredBlock uses HTML comment wrappers for RAG-parseable but visually invisible AI blocks
- [Phase 06]: Mermaid builders cap nodes at 10-20 per diagram to prevent visual overload
- [Phase 06]: Architecture/Features/Conventions return empty string when primary AI round unavailable (no meaningful static fallback)
- [Phase 06]: Modules/Environment/EdgeCases/Deployment have static fallback with warning banner
- [Phase 06]: Edge cases sorted by severity (critical first) within each module
- [Phase 06]: Deployment renderer detects CI provider from file tree patterns as static fallback
- [Phase 06]: Environment variable references capped at 50 rows (consistent with report.ts pattern)
- [Phase 06]: INDEX renderer takes extra DocumentStatus[] param unlike other renderers (special case)
- [Phase 06]: Package manager detection chain: manifest packageManager field -> lock file presence -> fallback null
- [Phase 06]: Tech Debt renderer omits warning banner when static data is sufficient (unlike other renderers)
- [Phase 06]: Testing renderer categorizes test files by path patterns (unit/integration/e2e) with /unit/, __tests__, .test. conventions
- [Phase 06]: renderIndex shim in registry uses empty statuses; actual statuses passed at render-time in generate.ts
- [Phase 06]: Conditional AI round registration using requiredRounds.has(N) for --only cost optimization
- [Phase 06]: Terminal round detection for render step deps: rounds not depended upon by other registered rounds
- [Phase 06]: Render deps fallback to static-analysis when no AI rounds required
- [Phase 07]: Proxy-based SYMBOLS object for runtime NO_COLOR detection instead of static initialization
- [Phase 07]: Static import of CIRenderer in renderer.ts (ESM-compatible, no dynamic require)
- [Phase 07]: Components accept spinnerFrame parameter for animation state (pure function pattern)
- [Phase 07]: computeSecondsLeft helper encapsulated in components.ts (not exposed to renderer)
- [Phase 07]: MODEL_COSTS static table with default fallback to claude-opus-4-6 pricing (most expensive, safe default)
- [Phase 07]: onRetry callback threaded end-to-end: DAG -> round step -> executeRound -> provider.complete -> retryWithBackoff
- [Phase 07]: costWarningThreshold in config schema with no default (renderer handles default 1.00)
- [Phase 07]: Degraded round fallback path checks tracker for partial usage data before returning zero values
- [Phase 07]: Round 5 per-module fan-out receives onRetry through analyzeModule and retryFailedModules
- [Phase 07]: Logger suppress mode: setSuppressed(true) before renderer, false in finally block; error() never suppressed
- [Phase 07]: TokenUsageTracker constructed with config model for accurate per-model cost estimation
- [Phase 07]: Static-only mode uses same renderer system for consistent UX (banner + analyzers + completion)
- [Phase 07]: Removed monkey-patched onStepComplete; all DAG events in orchestratorEvents object
- [Phase 07]: costWarningThreshold defaults to 1.0 in generate.ts when not set in config
- [Phase 08]: Single OpenAICompatibleProvider class for all 6 non-Anthropic providers via configurable baseURL
- [Phase 08]: Azure OpenAI uses AzureOpenAI client class with apiVersion '2024-10-21'
- [Phase 08]: Validation order: provider-specific checks before generic API key check for most specific error first
- [Phase 08]: Tool call type narrowing via toolCall.type !== 'function' for openai v5 union type
- [Phase 08]: Ollama gets dummy apiKey 'ollama' (required by SDK, ignored by server)
- [Phase 08]: Output tokens estimated at 20% of input tokens for cost heuristic in estimate command
- [Phase 08]: Estimate command uses console.log directly, not terminal renderer (simple command, not pipeline)
- [Phase 08]: Cost entries sorted: current provider first, then ascending cost, local providers last
- [Phase 08]: Ollama label uses provider name as model since defaultModel is empty string
- [Phase 08]: wrapWithCache helper wraps each round step's execute function for transparent cache integration
- [Phase 08]: Analysis fingerprint from directoryTree file entries (not raw AnalysisContext files)
- [Phase 08]: Cached rounds set display status directly in wrapper; onStepComplete guards against overwriting
- [Phase 08]: isLocal threaded to CIRenderer for consistent cost omission across TTY and CI output modes
- [Phase 08]: MODEL_COSTS expanded to 11 entries covering all PROVIDER_PRESETS pricing data
- [Phase 09]: Binary files excluded entirely from discoverFiles() results (invisible in file tree, not just content-skipping)
- [Phase 09]: Monorepo warning via logger.warn() before logger suppression (visible in normal terminal output)
- [Phase 09]: Empty repo skips AI rounds via isEmptyRepo guard in wrapWithCache wrapper
- [Phase 09]: Render step produces minimal INDEX + overview for empty repos with clear explanation
- [Phase 09]: bin path ./dist/index.js (tsup flattens single entry to root of outDir)
- [Phase 09]: No tsup banner -- shebang preserved from source src/cli/index.ts
- [Phase 09]: unpkg CDN for grammar downloads (stable, no auth, version-pinned 0.1.13)
- [Phase 09]: HANDOVER_GRAMMAR_DIR env var for offline/corporate pre-populated grammars
- [Phase 09]: Size-based integrity check warns but does not reject (version tolerance)
- [Phase 09]: 5 validation targets cover all category types: ts-spa, python-api, go-microservice, rust-cli, mixed
- [Phase 09]: Tests run full pipeline (no --static-only) per user decision: success = all 14 docs without crashes
- [Phase 09]: HANDOVER_INTEGRATION env var gate prevents accidental CI cost and network dependency
- [Phase 09]: README documents actual config schema fields, not aspirational ones

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 09-04-PLAN.md (validation tests + README) -- ALL PHASES COMPLETE
Resume file: None -- project complete
