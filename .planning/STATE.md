# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** A single `handover generate` command produces a complete, cross-referenced knowledge base that eliminates the 2-4 week onboarding gap when codebases change hands.
**Current focus:** Phase 5 in progress -- AI Analysis Rounds

## Current Position

Phase: 5 of 9 (AI Analysis Rounds) -- IN PROGRESS
Plan: 3 of 4 in current phase (05-03 complete)
Status: 05-03 complete -- Rounds 3-6 parallel analysis with DAG parallelism and per-module fan-out
Last activity: 2026-02-17 -- Completed 05-03-PLAN.md (Rounds 3-6 parallel analysis)

Progress: [█████████████] 91%

## Performance Metrics

**Velocity:**
- Total plans completed: 16
- Average duration: 5min
- Total execution time: 73min

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

**Recent Trend:**
- Last 5 plans: 2min, 2min, 5min, 4min, 4min
- Trend: consistent fast execution; Rounds 3-6 parallel analysis in 4min

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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 05-03-PLAN.md
Resume file: .planning/phases/05-ai-analysis-rounds/05-04-PLAN.md
