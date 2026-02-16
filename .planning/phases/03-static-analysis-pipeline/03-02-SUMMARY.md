---
phase: 03-static-analysis-pipeline
plan: 02
subsystem: analysis
tags: [file-tree, dependency-graph, todo-scanner, env-scanner, smol-toml, static-analysis]

# Dependency graph
requires:
  - phase: 03-static-analysis-pipeline
    provides: "Zod schemas (FileTreeResult, DependencyResult, TodoResult, EnvResult), AnalyzerFn<T> signature, AnalysisContext, isBinaryFile utility"
provides:
  - "analyzeFileTree() -- STAT-01: file/dir counts, sizes, line counts, extension breakdown, largest files, directory tree"
  - "analyzeDependencies() -- STAT-02: package.json/Cargo.toml/go.mod/requirements.txt/pyproject.toml parsing with dev/prod separation"
  - "scanTodos() -- STAT-04: 10-marker TODO scanning with categorization and issue reference extraction"
  - "scanEnvVars() -- STAT-05: .env file detection and env var reference scanning across 4 language patterns"
affects: [03-03, 03-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [batch-50 file processing for memory efficiency, per-manifest try-catch for graceful degradation, CATEGORY_MAP for configurable marker-to-category mapping]

key-files:
  created:
    - src/analyzers/file-tree.ts
    - src/analyzers/dependency-graph.ts
    - src/analyzers/todo-scanner.ts
    - src/analyzers/env-scanner.ts
  modified: []

key-decisions:
  - "Batch size of 50 files for concurrent readFile operations -- balances throughput with memory pressure"
  - "CATEGORY_MAP as Record<string, TodoItem['category']> for type-safe marker-to-category mapping"
  - "ENV_REFERENCE_REGEX combines all 5 language patterns into a single regex with alternation for single-pass scanning"
  - "Directory tree limited to top 3 levels plus largest files to keep output manageable for large codebases"

patterns-established:
  - "Analyzer error envelope: try-catch at top level returns { success: false, error, elapsed } -- never throws"
  - "Batch-50 pattern: process files in batches of 50 via Promise.all for memory-bounded concurrency"
  - "Internal parser functions: per-format parsers are module-private, only the analyzer function is exported"

# Metrics
duration: 3min
completed: 2026-02-16
---

# Phase 3 Plan 2: Simple Analyzers Summary

**Four static analyzers: FileTree with line counting, DependencyGraph parsing 5 manifest formats, TodoScanner with 10-marker categorization and issue refs, EnvScanner with multi-language env var detection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T21:44:34Z
- **Completed:** 2026-02-16T21:48:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- FileTree analyzer (STAT-01) counts files, directories, lines, and sizes with extension breakdown, top-20 largest files, and a depth-limited directory tree
- DependencyGraph analyzer (STAT-02) parses all 5 manifest formats (package.json, Cargo.toml, go.mod, requirements.txt, pyproject.toml) with dev vs production separation and graceful malformed-manifest handling
- TodoScanner (STAT-04) matches all 10 marker types (TODO, FIXME, HACK, XXX, NOTE, WARN, DEPRECATED, REVIEW, OPTIMIZE, TEMP) with category mapping and #123/JIRA-456 issue reference extraction
- EnvScanner (STAT-05) detects .env files, parses variable definitions, and scans source code for env var references across TypeScript, Python, Rust, and Go patterns

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement FileTree and DependencyGraph analyzers** - `7e3106e` (feat)
2. **Task 2: Implement TodoScanner and EnvScanner analyzers** - `8e22e63` (feat)

## Files Created/Modified
- `src/analyzers/file-tree.ts` - STAT-01: analyzeFileTree() -- directory structure, file types, sizes, line counts, extension breakdown, largest files
- `src/analyzers/dependency-graph.ts` - STAT-02: analyzeDependencies() -- 5 manifest format parsers with dev/prod separation and graceful error handling
- `src/analyzers/todo-scanner.ts` - STAT-04: scanTodos() -- 10-marker scanning with category mapping and issue reference extraction
- `src/analyzers/env-scanner.ts` - STAT-05: scanEnvVars() -- .env file detection and multi-language env var reference scanning

## Decisions Made
- Batch size of 50 files for concurrent readFile operations balances throughput with memory pressure
- CATEGORY_MAP uses TodoItem['category'] type directly for compile-time safety
- ENV_REFERENCE_REGEX combines all 5 language patterns into a single regex with alternation for single-pass scanning
- Directory tree limited to top 3 depth levels plus largest file entries to keep output manageable
- parseRequirementsTxt uses imperative loop instead of filter-map chain to avoid TypeScript type narrowing issues with null filtering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type narrowing in parseRequirementsTxt**
- **Found during:** Task 1 (DependencyGraph implementation)
- **Issue:** Functional filter-map chain with `as const` type literal caused TS2322/TS2677 errors -- the `type: 'production' as const` narrowed too tightly for the DependencyInfo union type in the filter predicate
- **Fix:** Rewrote parseRequirementsTxt as an imperative loop with explicit push, avoiding the type narrowing issue entirely
- **Files modified:** src/analyzers/dependency-graph.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors in the file
- **Committed in:** 7e3106e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor implementation approach change. Identical functionality, different code style to satisfy TypeScript's type system.

## Issues Encountered
- Pre-existing type errors exist in `src/analyzers/git-history.ts` (from a future plan). These are out of scope and do not affect the four analyzers built in this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four simple analyzers compile and conform to the AnalyzerFn<T> signature
- Plans 03-03 (git-history) and 03-04 (coordinator) can now import these analyzers
- The batch-50 pattern and error-envelope pattern are established for remaining analyzers

## Self-Check: PASSED

All files verified on disk. All 2 task commits found in git history.

---
*Phase: 03-static-analysis-pipeline*
*Completed: 2026-02-16*
