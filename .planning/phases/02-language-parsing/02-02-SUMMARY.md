---
phase: 02-language-parsing
plan: 02
subsystem: parsing
tags: [tree-sitter, typescript, python, ast, extractor, jsx, decorators, generics]

# Dependency graph
requires:
  - phase: 02-language-parsing
    provides: "ParserService, LanguageExtractor base, Zod symbol schemas, node-helpers, text-extract utilities"
provides:
  - "TypeScriptExtractor for TS/JS/TSX/JSX with full extraction depth (generics, decorators, JSDoc, inheritance, JSX component detection)"
  - "PythonExtractor for Python with full extraction depth (type annotations, decorators, docstrings, __all__ re-exports, UPPER_CASE constants)"
affects: [02-language-parsing, 03-static-analysis]

# Tech tracking
tech-stack:
  added: []
  patterns: [parent-docstring-lookup, position-based-node-skip, python-visibility-convention]

key-files:
  created:
    - src/parsing/extractors/typescript.ts
    - src/parsing/extractors/python.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Downgraded web-tree-sitter from 0.26.5 to 0.25.10 for tree-sitter-wasms ABI compatibility (0.26.x requires dylink.0 section, tree-sitter-wasms uses old dylink section)"
  - "JSX component detection adds @component decorator marker to signal React component functions"
  - "Python visibility follows naming convention: __name=private, _name=protected, dunder methods=public"
  - "Module-name node in import_from_statement skipped via position comparison, not identity, for web-tree-sitter compatibility"

patterns-established:
  - "Parent docstring lookup: when node is inside export_statement, check parent's preceding sibling for JSDoc"
  - "Python self/cls parameter skipping: method extraction strips first parameter when it's self or cls"
  - "Python __all__ as re-export source: module-level __all__ list literal parsed to populate reExports array"

# Metrics
duration: 15min
completed: 2026-02-16
---

# Phase 2 Plan 2: TypeScript/Python Extractors Summary

**Tree-sitter AST extractors for TypeScript/JavaScript (with JSX/TSX component detection, generics, decorators, JSDoc) and Python (with type annotations, __all__ re-exports, visibility conventions, docstrings)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-16T20:40:48Z
- **Completed:** 2026-02-16T20:56:09Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- TypeScriptExtractor handling all major TS/JS node types: function declarations, arrow functions, classes with inheritance/implements, interfaces, imports (named/default/namespace/type-only), exports (direct/named/re-export/barrel/default), enums, type aliases, constants, JSDoc docstrings, and JSX component detection
- PythonExtractor handling all major Python node types: function definitions with type annotations, decorated definitions, classes with inheritance and __init__ field extraction, both import styles, __all__-based re-exports, UPPER_CASE constants, Python docstrings, and visibility conventions
- Both extractors registered and working through the public createParserService() API
- Web-tree-sitter downgraded to 0.25.10 for WASM grammar loading compatibility with tree-sitter-wasms prebuilt binaries

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement TypeScript/JavaScript extractor** - `b7c5f57` (feat)
2. **Task 2: Implement Python extractor** - `2971b2f` (feat)

## Files Created/Modified

- `src/parsing/extractors/typescript.ts` - TypeScriptExtractor class: function/class/interface/import/export/enum/type/constant extraction with generics, decorators, JSDoc, JSX detection, and full parameter types
- `src/parsing/extractors/python.ts` - PythonExtractor class: function/class/import/constant extraction with type annotations, decorators, docstrings, __all__ re-exports, visibility conventions, and __init__ field extraction
- `package.json` - Downgraded web-tree-sitter from ^0.26.5 to ^0.25.10 for tree-sitter-wasms ABI compatibility
- `package-lock.json` - Updated lockfile for web-tree-sitter version change

## Decisions Made

- **web-tree-sitter version downgrade:** tree-sitter-wasms 0.1.13 builds WASM grammars with the old "dylink" section format, while web-tree-sitter 0.26.x expects "dylink.0" format. Downgrading to 0.25.10 resolves the ABI mismatch. The getNamedChildren null-safety utility (added in 02-03) handles the stricter type signatures in 0.25.x.
- **JSX component detection via @component marker:** Functions that return JSX elements get `@component` added to their decorators array, providing a simple signal for downstream analysis without requiring a separate component type.
- **Python visibility by naming convention:** __name (double underscore, not dunder) = private, _name = protected, everything else = public. Dunder methods (__init__, __repr__) remain public.
- **Position-based node comparison:** Used startIndex/endIndex comparison instead of identity (===) to skip module_name nodes in import_from_statement extraction, since getFieldNode may return different object references than getNamedChildren iteration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Downgraded web-tree-sitter for WASM ABI compatibility**
- **Found during:** Task 1 (TypeScript extractor)
- **Issue:** web-tree-sitter 0.26.5 could not load tree-sitter-wasms 0.1.13 WASM grammars due to dylink section format mismatch (expected dylink.0, found dylink)
- **Fix:** Downgraded web-tree-sitter to 0.25.10 which supports the old dylink format. Code already had null-safety via getNamedChildren utility from 02-03.
- **Files modified:** package.json, package-lock.json
- **Verification:** Language.load() succeeds, full extraction pipeline tested
- **Committed in:** b7c5f57 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed docstring not captured for exported declarations**
- **Found during:** Task 1 (TypeScript extractor)
- **Issue:** JSDoc comments above `export function` or `export class` were not captured because the comment is a sibling of the export_statement, not the inner function_declaration.
- **Fix:** Added getDocstring() helper that checks both the node's direct preceding sibling and the parent export_statement's preceding sibling for comments.
- **Files modified:** src/parsing/extractors/typescript.ts
- **Verification:** Docstrings correctly captured for both exported and non-exported declarations
- **Committed in:** b7c5f57 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed module_name node included as import specifier in Python**
- **Found during:** Task 2 (Python extractor)
- **Issue:** In `from typing import Optional, Dict`, the module_name "typing" appeared as an import specifier alongside the actual imported names.
- **Fix:** Added position-based comparison to skip the module_name field node when iterating namedChildren of import_from_statement.
- **Files modified:** src/parsing/extractors/python.ts
- **Verification:** Import specifiers correctly exclude module source name
- **Committed in:** 2971b2f (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All fixes necessary for correctness. The web-tree-sitter downgrade is essential for runtime functionality. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TypeScript and Python extractors complete and registered via createParserService()
- All four tree-sitter language extractors now available (TypeScript, Python, Rust, Go)
- Regex fallback extractor covers all remaining languages
- Full parsing pipeline ready for Phase 3 static analysis consumption
- All extractors produce rich ParsedFile data matching Zod schemas from Plan 01

## Self-Check: PASSED

- All 2 created files exist on disk
- All 2 task commit hashes verified in git log
- `npx tsc --noEmit` passes with zero errors
- Both extractors tested through createParserService() public API

---
*Phase: 02-language-parsing*
*Completed: 2026-02-16*
