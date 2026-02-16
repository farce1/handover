---
phase: 03-static-analysis-pipeline
plan: 03
subsystem: analysis
tags: [simple-git, tree-sitter, ast, git-history, test-detection, doc-coverage, static-analysis]

# Dependency graph
requires:
  - phase: 03-static-analysis-pipeline
    provides: "03-01: Zod schemas (GitHistoryResult, ASTResult, TestResult, DocResult), AnalysisContext, file discovery, cache"
  - phase: 02-language-parsing
    provides: "ParserService with createParserService() factory, isSupportedFile(), ParsedFile type"
provides:
  - analyzeGitHistory() -- branch strategy detection, commit history, churn, contributors, file ownership
  - analyzeAST() -- batch AST extraction via Phase 2 ParserService with WASM lifecycle management
  - analyzeTests() -- test file identification across 6 frameworks with approximate test counts
  - analyzeDocs() -- README detection, docs folder discovery, inline doc coverage measurement
affects: [03-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [simple-git branch analysis with strategy detection, ParserService batch processing with init/dispose lifecycle, regex-based framework detection, extension-aware inline doc sampling]

key-files:
  created:
    - src/analyzers/git-history.ts
    - src/analyzers/ast-analyzer.ts
    - src/analyzers/test-analyzer.ts
    - src/analyzers/doc-analyzer.ts
  modified: []

key-decisions:
  - "simpleGit named import (not default) for simple-git v3 ESM compatibility"
  - "for-each-ref used for branch age detection instead of parsing individual branch logs (single command for all branches)"
  - "File ownership limited to top 30 most-changed files to avoid N+1 git-log performance issue"
  - "Test framework detection via basename matching first, config file check second, package.json third"
  - "Inline doc coverage sampled from up to 100 source files matching known doc-pattern extensions"

patterns-established:
  - "Graceful degradation: each analyzer returns success with empty data on non-critical failures (not-a-git-repo, individual file parse failures)"
  - "try/finally for WASM resource cleanup: ParserService.dispose() always called"
  - "Batch processing (30 files at a time) for memory-constrained WASM operations"
  - "performance.now() elapsed tracking in every analyzer for metrics"

# Metrics
duration: 3min
completed: 2026-02-16
---

# Phase 3 Plan 3: Complex Analyzers Summary

**Four complex analyzers: GitHistory with branch strategy detection and churn metrics via simple-git, ASTAnalyzer wrapping Phase 2 ParserService for batch extraction, TestAnalyzer detecting 6 test frameworks, DocAnalyzer measuring inline doc coverage**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T21:44:52Z
- **Completed:** 2026-02-16T21:48:09Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Implemented GitHistory analyzer that detects branching strategy (git-flow, feature-branch, trunk-based, unknown) with evidence, extracts commit history with configurable depth (default 6 months), calculates file churn, contributor data, activity-by-month, and file ownership for top 30 most-changed files
- Implemented ASTAnalyzer that wraps the Phase 2 createParserService() factory, processes files in batches of 30 with proper WASM init/dispose lifecycle, handles individual file parse failures gracefully, and builds aggregate summary statistics
- Implemented TestAnalyzer identifying test files across vitest, jest, mocha, pytest, go_test, and rust_test frameworks with pattern-based test counting and config file detection
- Implemented DocAnalyzer detecting READMEs, docs folders, documentation files, and measuring inline doc coverage (JSDoc, docstrings, rustdoc) across a sample of up to 100 source files

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement GitHistory and ASTAnalyzer** - `0d6aaa7` (feat)
2. **Task 2: Implement TestAnalyzer and DocAnalyzer** - `4d9243d` (feat)

## Files Created/Modified
- `src/analyzers/git-history.ts` - GitHistory analyzer (STAT-03): branch patterns, commit history, churn, contributors, file ownership via simple-git
- `src/analyzers/ast-analyzer.ts` - ASTAnalyzer (STAT-06): batch AST extraction wrapping Phase 2 ParserService with WASM lifecycle management
- `src/analyzers/test-analyzer.ts` - TestAnalyzer (STAT-07): test file detection for 6 frameworks, approximate test counts, config file and package.json scanning
- `src/analyzers/doc-analyzer.ts` - DocAnalyzer (STAT-08): README detection, docs folder discovery, doc file collection, inline documentation coverage sampling

## Decisions Made
- Used `{ simpleGit }` named import for simple-git v3 ESM compatibility (default import is not callable)
- Used `git for-each-ref` for branch age detection rather than individual per-branch log queries (single command covers all branches)
- File ownership queries limited to top 30 most-changed files to keep git operations bounded
- Test framework detection uses a priority chain: basename pattern matching first, config file existence second, package.json devDependencies third
- Inline doc coverage sampled from up to 100 files matching known doc-pattern extensions to keep analysis fast on large codebases

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed simple-git import style**
- **Found during:** Task 1 (GitHistory implementation)
- **Issue:** Plan specified `import simpleGit from 'simple-git'` but simple-git v3 exports `simpleGit` as a named export, not default. TypeScript error: "This expression is not callable."
- **Fix:** Changed to `import { simpleGit } from 'simple-git'`
- **Files modified:** src/analyzers/git-history.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 0d6aaa7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial import syntax correction. No scope change.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four complex analyzers compile and conform to AnalyzerFn<T> signature
- Plan 03-04 (coordinator, report formatting, CLI wiring) can now import all 8 analyzers
- GitHistory properly handles non-git repos with graceful degradation
- ASTAnalyzer properly manages WASM lifecycle with init/dispose in try/finally

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (0d6aaa7, 4d9243d) found in git history.

---
*Phase: 03-static-analysis-pipeline*
*Completed: 2026-02-16*
