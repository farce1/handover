---
phase: 12-vector-storage-foundation
plan: 02
subsystem: vector
tags: [chunking, markdown, tdd, retrieval]
dependency_graph:
  requires: [src/vector/types.ts]
  provides: [chunkDocument, chunkMarkdown]
  affects: []
tech_stack:
  added: []
  patterns: [TDD, sliding-window-chunking, header-hierarchy-tracking]
key_files:
  created:
    - src/vector/chunker.ts
    - src/vector/chunker.test.ts
  modified: []
decisions:
  - summary: 'Used sliding window approach instead of recursive splitting for predictable chunk sizes'
    rationale: 'Sliding window with separator-based boundaries gives better control over chunk size while maintaining natural text boundaries'
  - summary: 'Created types.ts as blocking fix instead of waiting for plan 12-01'
    rationale: 'Plan 12-02 was requested for execution but depended on types from 12-01. Applied Rule 3 (auto-fix blocking issue) to create minimal required types.'
metrics:
  duration_seconds: 346
  duration_minutes: 5.8
  completed_at: '2026-02-21T13:11:14Z'
---

# Phase 12 Plan 02: Markdown-aware Document Chunker Summary

**One-liner:** TDD implementation of markdown chunker with header-based splitting, sliding window overlap, and structure preservation for code blocks and tables.

## What Was Built

Implemented a lightweight, markdown-aware document chunker that splits handover's generated documentation into retrieval-optimized chunks while preserving semantic structure:

**Core Functions:**

- `chunkMarkdown(markdown, options?)` - Splits markdown into TextChunks with header hierarchy metadata
- `chunkDocument(content, docMeta)` - Higher-level wrapper producing DocumentChunks with full metadata (source file, doc ID, chunk index, etc.)

**Key Features:**

- Header-based section splitting (tracks h1/h2/h3 hierarchy)
- Sliding window algorithm for large sections with ~15% overlap (512 tokens/chunk, 75 tokens overlap)
- Never splits code blocks (``` fenced) or tables (| rows) - atomic structures
- YAML frontmatter stripping
- Token estimation using character/4 ratio (consistent with BaseProvider)
- Rich metadata: section_path, h1/h2/h3, chunk_index, token_count, content_preview

**Implementation Approach:**

- Pure TypeScript (no LangChain dependency - avoided ~5MB for ~200 lines of code)
- TDD methodology: RED (failing tests) → GREEN (passing implementation) → REFACTOR (cleanup)
- Separator priority: `\n\n` (paragraphs) > `\n` (lines) > ` ` (words)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Missing src/vector/types.ts dependency**

- **Found during:** Task startup (before TDD RED)
- **Issue:** Plan 12-02 imports types from `src/vector/types.ts`, but this file is created by plan 12-01 (which hasn't been executed yet)
- **Fix:** Created minimal type definitions needed for chunker (DocumentChunk, ChunkMetadata, TextChunk, ChunkOptions) with complete documentation
- **Files created:** `src/vector/types.ts` (158 lines)
- **Commit:** 17608c6
- **Rationale:** Plan 12-02 was explicitly requested for execution despite dependency ordering. Applied Rule 3 to unblock execution rather than failing.

**2. [Rule 1 - Bug] TypeScript import path missing .js extension**

- **Found during:** GREEN phase, TypeScript compilation check
- **Issue:** `import from './types'` failed with moduleResolution='node16' error
- **Fix:** Changed to `import from './types.js'`
- **Files modified:** `src/vector/chunker.ts`
- **Commit:** f014e91 (included in GREEN commit)

**3. [Rule 1 - Bug] TypeScript operator type error in progress check**

- **Found during:** GREEN phase, TypeScript compilation check
- **Issue:** `currentPosition <= chunks.length > 0 ? ...` had incorrect operator precedence
- **Fix:** Extracted `lastChunkLength` variable for clarity and correctness
- **Files modified:** `src/vector/chunker.ts`
- **Commit:** f014e91 (included in GREEN commit)

## Test Results

All 9 test cases pass (100% coverage of requirements):

1. ✓ Header-based splitting (creates separate chunks per section)
2. ✓ Nested header hierarchy (h1 > h2 > h3 tracking)
3. ✓ Code block preservation (never splits ``` fenced blocks)
4. ✓ Table preservation (never splits | rows)
5. ✓ Large section splitting with overlap (multiple chunks, ~15% overlap)
6. ✓ Empty/minimal input handling (edge cases)
7. ✓ YAML frontmatter stripping (not treated as headers)
8. ✓ DocumentChunk metadata completeness (all fields populated)
9. ✓ Content preview generation (first 200 chars)

**Test execution:** `npm test -- src/vector/chunker.test.ts` (9 passed, 0 failed, 13ms)

## Verification Checklist

- [x] All 8+ test cases pass
- [x] chunkDocument() produces DocumentChunk[] with complete metadata
- [x] chunkMarkdown() handles edge cases (empty, no headers, nested headers)
- [x] Code blocks and tables are atomic (never split)
- [x] Chunk sizes are within expected range with overlap
- [x] No external dependencies added (pure TypeScript implementation)
- [x] TypeScript compiles cleanly (`npx tsc --noEmit` passes)

## Key Implementation Details

**Header Hierarchy Tracking:**

```typescript
interface HeaderStack {
  h1?: string;
  h2?: string;
  h3?: string;
}
```

When encountering a new header, the stack resets lower levels (e.g., new ## resets h3).

**Sliding Window Algorithm:**

1. Start at position 0
2. Extract targetChars (chunkSize \* 4) worth of content
3. Try to break at separator boundary in latter half (\n\n, \n, or space)
4. Save chunk and move forward by (chunkEnd - overlapChars)
5. Repeat until content exhausted

**Token Estimation:**

```typescript
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

Same ratio as BaseProvider.estimateTokens() for consistency.

## Performance Metrics

- **Duration:** 5.8 minutes (346 seconds)
- **Test execution:** 13ms (9 tests)
- **Lines of code:** ~260 (chunker.ts: 262, chunker.test.ts: 221, types.ts: 158)
- **Commits:** 3 (types fix, tests, implementation)

## Files Changed

**Created:**

- `src/vector/chunker.ts` (262 lines) - Chunker implementation
- `src/vector/chunker.test.ts` (221 lines) - TDD test suite
- `src/vector/types.ts` (158 lines) - Type definitions (blocking fix)

**Modified:**

- None

## Impact on Codebase

**Additions:**

- 2 new exported functions (`chunkMarkdown`, `chunkDocument`)
- 8 new type definitions (DocumentChunk, ChunkMetadata, TextChunk, etc.)
- 0 new dependencies (pure TypeScript)

**No Breaking Changes**

## Next Steps

With chunking complete, the next plans in Phase 12 should:

1. **Plan 12-03:** Implement embedding provider (OpenAI text-embedding-3-small)
2. **Plan 12-04:** Build incremental indexer using AnalysisCache pattern
3. **Plan 12-05:** Create reindex CLI command

The chunker is now ready to feed into the embedding pipeline.

## Self-Check: PASSED

Verified all claims in this summary:

**Files exist:**

```bash
$ ls -la src/vector/chunker.ts src/vector/chunker.test.ts src/vector/types.ts
-rw-r--r--  1 user  staff  7214 Feb 21 13:10 src/vector/chunker.ts
-rw-r--r--  1 user  staff  6102 Feb 21 13:08 src/vector/chunker.test.ts
-rw-r--r--  1 user  staff  4321 Feb 21 13:05 src/vector/types.ts
```

**Commits exist:**

```bash
$ git log --oneline --grep="12-02" | head -5
f014e91 feat(12-02): implement markdown-aware document chunker
c02d1e9 test(12-02): add failing tests for document chunker
17608c6 fix(12-02): add missing vector types for chunker
```

**Tests pass:**

```bash
$ npm test -- src/vector/chunker.test.ts
✓ src/vector/chunker.test.ts (9 tests) 13ms
Test Files  1 passed (1)
Tests  9 passed (9)
```

**TypeScript compiles:**

```bash
$ npx tsc --noEmit
(no output - success)
```

All verification criteria satisfied.
