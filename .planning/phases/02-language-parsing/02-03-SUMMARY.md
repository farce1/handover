---
phase: 02-language-parsing
plan: 03
subsystem: parsing
tags: [tree-sitter, rust, go, regex, language-extraction, wasm]

# Dependency graph
requires:
  - phase: 02-language-parsing
    provides: "ParserService, LanguageExtractor base, Zod schemas, language map, AST utilities"
provides:
  - "RustExtractor: full Rust AST extraction (functions, structs, enums, traits, impl blocks, use declarations, attributes, rustdoc)"
  - "GoExtractor: full Go AST extraction (functions, methods with receivers, structs, interfaces, imports, constants, Go doc comments)"
  - "RegexFallbackExtractor: regex-based extraction for 12+ unsupported languages grouped by C-like, Ruby-like, PHP families"
  - "Public parsing API: createParserService() factory and parseFile() convenience function"
  - "getNamedChildren() null-safe utility for web-tree-sitter namedChildren iteration"
affects: [03-static-analysis]

# Tech tracking
tech-stack:
  added: []
  patterns: [language-family-regex, per-language-extractor-instance, dynamic-import-resilience, null-safe-ast-iteration]

key-files:
  created:
    - src/parsing/extractors/rust.ts
    - src/parsing/extractors/go.ts
    - src/parsing/extractors/regex-fallback.ts
    - src/parsing/index.ts
  modified:
    - src/parsing/utils/node-helpers.ts
    - src/parsing/utils/text-extract.ts

key-decisions:
  - "Separate RegexFallbackExtractor instances per language (pre-configured with langId) rather than shared instance, since extractFromSource() interface doesn't pass langId"
  - "Dynamic import with try-catch for TS/Python extractors in createParserService(), enabling graceful degradation when plan 02-02 extractors don't exist yet"
  - "Added getNamedChildren() null-safe utility to node-helpers.ts to handle web-tree-sitter's (Node | null)[] typing for namedChildren"
  - "Rust enums recorded both as ClassSymbol (for method attachment via impl) and ExportInfo with kind 'enum'"
  - "Go embedded struct fields mapped to extends[] array (mixin/inheritance semantics)"

patterns-established:
  - "Language family grouping: C-like, Ruby-like, PHP regex patterns shared across syntax-similar languages"
  - "Two-pass AST extraction: first pass extracts declarations, second pass attaches impl/method to ClassSymbol targets"
  - "Visibility by convention: Go uses uppercase-first-letter export convention, Rust uses visibility_modifier nodes"
  - "Null-safe AST iteration: getNamedChildren() filters nulls from web-tree-sitter's namedChildren arrays"

# Metrics
duration: 9min
completed: 2026-02-16
---

# Phase 2 Plan 3: Rust/Go Extractors, Regex Fallback, and Public Parsing API Summary

**Tree-sitter extractors for Rust (structs, traits, impl blocks, attributes) and Go (receivers, interfaces, visibility-by-casing), regex fallback for 12+ languages by family pattern, and public createParserService()/parseFile() API**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-16T20:41:13Z
- **Completed:** 2026-02-16T20:50:53Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Rust extractor handling function_item, struct_item, enum_item, trait_item, impl_item, use_declaration, const_item with full attribute and rustdoc support
- Go extractor handling function_declaration, method_declaration, type_spec (struct/interface), import_declaration, const/var_declaration with Go visibility convention and doc comments
- Regex fallback covering Java, Kotlin, C#, C/C++, Swift, Dart, Scala, Ruby, PHP, Lua, R with doc comment extraction and parse error reporting
- Public API at src/parsing/index.ts exporting createParserService() and parseFile() for Phase 3 consumption
- Null-safety fix for web-tree-sitter namedChildren iteration applied across all extractor and utility code

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement Rust extractor** - `002236e` (feat)
2. **Task 2: Implement Go extractor** - `2c3225a` (feat)
3. **Task 3: Implement regex fallback extractor and public parsing API** - `94fddc0` (feat)

## Files Created/Modified

- `src/parsing/extractors/rust.ts` - RustExtractor class: functions with generics/async/unsafe, structs with fields, enums with variants, traits with bounds, impl block method attachment, use declarations with scoped lists and aliases, const/static extraction, rustdoc and attribute collection
- `src/parsing/extractors/go.ts` - GoExtractor class: functions with multi-return and Go 1.18+ generics, methods attached to receiver structs, structs with embedded fields as inheritance, interfaces with method specs, imports with aliases/blank/dot, exported const/var by uppercase convention, Go doc comments
- `src/parsing/extractors/regex-fallback.ts` - RegexFallbackExtractor class: C-like/Ruby-like/PHP pattern families, parameter extraction with bracket depth tracking, doc comment extraction scanning backwards, keyword filtering, parse error on empty extraction
- `src/parsing/index.ts` - Public API: createParserService() factory registering all extractors, parseFile() convenience function, type re-exports for Phase 3
- `src/parsing/utils/node-helpers.ts` - Added getNamedChildren() null-safe utility, updated findChildByType/findChildrenByType/hasChildOfType to use it
- `src/parsing/utils/text-extract.ts` - Updated getDecoratorTexts() to use getNamedChildren() for null safety

## Decisions Made

- **Per-language regex instances:** Each regex-fallback language gets its own RegexFallbackExtractor instance pre-configured with its langId, rather than sharing a single instance. This is because the LanguageExtractor.extractFromSource() interface doesn't pass langId, and ParserService looks up extractors by langId from the registry.
- **Dynamic imports for TS/Python:** Used dynamic import() with try-catch for TypeScript and Python extractors in createParserService(), since plan 02-02 (which creates those extractors) may not have run yet. This allows the public API to work with whatever extractors are available.
- **getNamedChildren utility:** Created a null-safe wrapper for web-tree-sitter's namedChildren property, which is typed as (Node | null)[] in some versions. Applied throughout all extractor and utility code for type safety.
- **Rust enums as ClassSymbol:** Rust enums are recorded as ClassSymbol (enabling impl block method attachment) and also as ExportInfo with kind 'enum' for correct export classification.
- **Go embedded fields as extends:** Go struct embedded fields (type-only, no name) are mapped to the ClassSymbol extends[] array, modeling Go's composition-as-inheritance pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed null-safety in web-tree-sitter namedChildren iteration**
- **Found during:** Task 1 (Rust extractor) and Task 2 (Go extractor)
- **Issue:** web-tree-sitter types namedChildren as (Node | null)[], causing TypeScript strict null check errors when iterating and passing children to utility functions
- **Fix:** Created getNamedChildren() utility that filters nulls with a type guard. Updated all namedChildren iterations in extractors and utility modules to use it.
- **Files modified:** src/parsing/utils/node-helpers.ts, src/parsing/utils/text-extract.ts, src/parsing/extractors/rust.ts, src/parsing/extractors/go.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 94fddc0 (Task 3 commit, consolidated)

**2. [Rule 3 - Blocking] Handled missing TS/Python extractors from unexecuted plan 02-02**
- **Found during:** Task 3 (public parsing API)
- **Issue:** Plan 02-03 specifies registering TypeScriptExtractor and PythonExtractor in createParserService(), but plan 02-02 (which creates those files) hasn't been executed yet. Static import of python.ts would fail (file doesn't exist).
- **Fix:** Used dynamic import() with try-catch for both extractors, with a computed string path for Python to bypass TypeScript's static module resolution check. Both extractors are registered when available, silently skipped when not.
- **Files modified:** src/parsing/index.ts
- **Verification:** `npx tsc --noEmit` passes; createParserService() registers Rust, Go, and regex extractors; TS/Python registration will activate once 02-02 runs
- **Committed in:** 94fddc0 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for compilation and correct API behavior. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Language parsing layer complete for Rust and Go with full tree-sitter extraction
- Regex fallback ready for all remaining languages (Java, Ruby, PHP, C#, etc.)
- Public API at `src/parsing/index.ts` provides clean entry points for Phase 3 static analyzers
- Plan 02-02 (TypeScript/Python extractors) still needs execution -- when run, those extractors will automatically register via dynamic imports in createParserService()
- All code compiles cleanly with `npx tsc --noEmit`

## Self-Check: PASSED

- All 4 created files exist on disk
- All 3 task commit hashes verified in git log
- `npx tsc --noEmit` passes with zero errors
- Rust, Go, regex-fallback extractors and public API all present

---
*Phase: 02-language-parsing*
*Completed: 2026-02-16*
