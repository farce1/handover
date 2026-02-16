---
phase: 02-language-parsing
plan: 01
subsystem: parsing
tags: [tree-sitter, wasm, zod, ast, language-detection]

# Dependency graph
requires:
  - phase: 01-project-foundation
    provides: "Zod schema-first pattern, project structure, package.json"
provides:
  - "Rich Zod symbol schemas (FunctionSymbol, ClassSymbol, ImportInfo, ExportInfo, ConstantSymbol, ParsedFile)"
  - "Extension-based language detection for tree-sitter and regex languages"
  - "ParserService with WASM-safe lifecycle, lazy grammar loading, extractor registry"
  - "LanguageExtractor abstract base class with extract() and extractFromSource()"
  - "AST node-walking and text-extraction utility functions"
affects: [02-language-parsing, 03-static-analysis]

# Tech tracking
tech-stack:
  added: [web-tree-sitter, tree-sitter-wasms]
  patterns: [singleton-init, lazy-grammar-loading, wasm-memory-safety, extractor-registry]

key-files:
  created:
    - src/parsing/types.ts
    - src/parsing/language-map.ts
    - src/parsing/parser-service.ts
    - src/parsing/extractors/base.ts
    - src/parsing/utils/node-helpers.ts
    - src/parsing/utils/text-extract.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Used tree-sitter-wasms prebuilt WASM grammars instead of self-building with tree-sitter-cli (avoids Docker requirement)"
  - "Created new ParsedFileSchema in src/parsing/types.ts instead of modifying existing SourceFileSchema for backward compatibility"
  - "Used createRequire for WASM path resolution in ESM (works in both dev tsx and built modes)"
  - "Import Tree type directly from web-tree-sitter rather than using Parser.Tree namespace syntax"

patterns-established:
  - "Singleton init via stored promise: ParserService.initPromise gates Parser.init() to single call"
  - "Lazy grammar loading: WASM grammars loaded on first file of that language, cached in Map"
  - "WASM memory safety: tree.delete() in try/finally blocks for every parsed tree"
  - "Extractor registry: ParserService.registerExtractor(langId, extractor) decouples parsing from extraction"
  - "Source slicing over node.text: getText() uses source.slice(startIndex, endIndex) for efficiency"

# Metrics
duration: 5min
completed: 2026-02-16
---

# Phase 2 Plan 1: Parsing Infrastructure Summary

**Tree-sitter WASM parser service with rich Zod symbol schemas, extension-based language detection, and base extractor interface for 4 tree-sitter + 16 regex-fallback languages**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-16T20:32:28Z
- **Completed:** 2026-02-16T20:37:39Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Rich Zod schemas capturing full symbol detail: generics, decorators, docstrings, visibility, async markers, parameters with types
- Extension-based language map covering 12 tree-sitter extensions and 16 regex-fallback extensions, with special .d.ts handling
- ParserService with WASM-safe lifecycle: singleton init, lazy grammar loading, try/finally tree cleanup, extractor registry
- LanguageExtractor abstract base with both tree-sitter (extract) and regex (extractFromSource) abstract methods
- Cursor-based AST walking utilities and safe text extraction functions for docstrings, decorators, and comment stripping

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create symbol Zod schemas** - `07a6a91` (feat)
2. **Task 2: Create language map and ParserService with WASM memory safety** - `b24d150` (feat)
3. **Task 3: Create base extractor interface and utility modules** - `d32633d` (feat)

## Files Created/Modified

- `src/parsing/types.ts` - Zod schemas for ParsedFile, FunctionSymbol, ClassSymbol, ImportInfo, ExportInfo, ConstantSymbol, FieldSchema, ParameterSchema, ParseErrorSchema; all types derived via z.infer
- `src/parsing/language-map.ts` - EXTENSION_MAP with tree-sitter and regex entries, getLanguageInfo() with .d.ts special case, isSupportedFile()
- `src/parsing/parser-service.ts` - ParserService class with init(), parse(), parseFile(), registerExtractor(), dispose(); WASM path resolution via createRequire
- `src/parsing/extractors/base.ts` - ExtractorResult interface, LanguageExtractor abstract class with extract(), extractFromSource(), emptyResult()
- `src/parsing/utils/node-helpers.ts` - walkChildren, findChildByType, findChildrenByType, getFieldNode, hasChildOfType
- `src/parsing/utils/text-extract.ts` - getText, getTextTrimmed, getDocstringAbove, getDecoratorTexts, stripCommentMarkers
- `package.json` - Added web-tree-sitter (dependency) and tree-sitter-wasms (devDependency)

## Decisions Made

- **tree-sitter-wasms over self-built WASM:** Used prebuilt WASM grammar binaries from the tree-sitter-wasms package instead of building with tree-sitter-cli. Avoids Docker/Emscripten requirement for development and CI. The package includes all needed grammars (typescript, tsx, javascript, python, rust, go).
- **Separate ParsedFileSchema:** Created new rich schemas in `src/parsing/types.ts` rather than modifying existing `src/domain/schemas.ts`. Keeps backward compatibility with Phase 1 code. Phase 3 analyzers will consume ParsedFile.
- **createRequire for WASM resolution:** Used `createRequire(import.meta.url)` to resolve WASM file paths from the tree-sitter-wasms package. This works correctly in ESM context and handles node_modules resolution.
- **Direct Tree type import:** Imported `Tree` directly from web-tree-sitter instead of using `Parser.Tree` namespace syntax, which TypeScript treats as a type-only namespace and rejects.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed JSDoc comment containing block comment syntax**
- **Found during:** Task 3 (text-extract.ts utility)
- **Issue:** A JSDoc comment contained literal `/* */` syntax in its list items which caused TypeScript to parse the comment as prematurely closed, resulting in 12 compilation errors.
- **Fix:** Rewrote the JSDoc comment to describe the handled formats without using literal block comment syntax.
- **Files modified:** src/parsing/utils/text-extract.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** d32633d (Task 3 commit)

**2. [Rule 3 - Blocking] Fixed Parser.Tree namespace type error**
- **Found during:** Task 2 (parser-service.ts)
- **Issue:** `Parser.Tree` used as return type but TypeScript's module declaration exports `Parser` as a class, not a namespace. `Parser.Tree` is not valid -- `Tree` is a separate export.
- **Fix:** Imported `Tree` directly from web-tree-sitter and used it as the return type.
- **Files modified:** src/parsing/parser-service.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** b24d150 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were necessary for compilation. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Parsing infrastructure complete and compiling cleanly
- ParserService ready to accept language-specific extractors via registerExtractor()
- Plans 02-03 can now implement TypeScript, Python, Rust, Go, and regex-fallback extractors that plug into this foundation
- All shared schemas, utilities, and base classes are in place

## Self-Check: PASSED

- All 7 created files exist on disk
- All 3 task commit hashes verified in git log
- `npx tsc --noEmit` passes with zero errors
- web-tree-sitter in dependencies, tree-sitter-wasms in devDependencies

---
*Phase: 02-language-parsing*
*Completed: 2026-02-16*
