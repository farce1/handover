# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** A single `handover generate` command produces a complete, cross-referenced knowledge base that eliminates the 2-4 week onboarding gap when codebases change hands.
**Current focus:** Phase 6 in progress -- Document Synthesis

## Current Position

Phase: 6 of 9 (Document Synthesis)
Plan: 4 of 4 in current phase (06-01, 06-02, 06-03 complete)
Status: All 14 document renderers complete -- batch 1 (INDEX, overview, getting-started, file-structure, deps, tech-debt, testing) + batch 2 (architecture, features, modules, environment, edge-cases, conventions, deployment)
Last activity: 2026-02-17 -- Completed 06-02-PLAN.md (batch 1 document renderers)

Progress: [██████████████░] 96%

## Performance Metrics

**Velocity:**
- Total plans completed: 19
- Average duration: 4min
- Total execution time: 85min

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
| 06-03 | 2 tasks | 4min | 4min |

**Recent Trend:**
- Last 5 plans: 4min, 4min, 4min, 4min, 4min
- Trend: consistent fast execution; Phase 6 AI-heavy renderers complete

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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 06-03-PLAN.md (AI-heavy document renderers)
Resume file: .planning/phases/06-document-synthesis/06-02-PLAN.md
