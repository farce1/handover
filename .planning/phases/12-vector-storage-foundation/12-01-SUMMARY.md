---
phase: 12-vector-storage-foundation
plan: 01
subsystem: vector-storage
tags: [database, schema, types, configuration]
dependency_graph:
  requires: []
  provides:
    - vector-type-system
    - sqlite-schema
    - embedding-config
  affects:
    - config-schema
tech_stack:
  added:
    - better-sqlite3
    - sqlite-vec
  patterns:
    - synchronous-sqlite-driver
    - vec0-virtual-table
    - schema-metadata-validation
key_files:
  created:
    - src/vector/types.ts
    - src/vector/schema.ts
    - src/vector/vector-store.ts
  modified:
    - src/config/schema.ts
    - package.json
decisions:
  - decision: Use better-sqlite3 over async drivers
    rationale: Synchronous API ideal for CLI tools, no async overhead
  - decision: Store embedding metadata in schema_metadata table
    rationale: Enables startup validation of dimension compatibility
  - decision: Use JSON serialization for embeddings
    rationale: sqlite-vec accepts [0.1, 0.2, ...] format natively
metrics:
  duration_minutes: 5
  tasks_completed: 2
  files_created: 3
  files_modified: 2
  commits: 2
  completed_date: 2026-02-21
---

# Phase 12 Plan 01: Vector Storage Foundation Summary

**One-liner:** SQLite vector database with schema validation, embedding dimension checks, and full CRUD operations for document chunks.

## What Was Built

Created the foundational data layer for Phase 12-15 vector search:

1. **Config Schema Extension** (Task 1)
   - Added optional `embedding` section to HandoverConfigSchema
   - Supports provider, model, apiKeyEnv, and batchSize configuration
   - Follows existing pattern of optional config sections

2. **Vector Type System** (Task 1)
   - Comprehensive TypeScript interfaces for all vector operations
   - ChunkMetadata, DocumentChunk, StoredChunk, EmbeddingResult
   - VectorStoreConfig, DocumentFingerprint, SchemaMetadata
   - EMBEDDING_MODELS constant mapping model names to dimensions
   - Schema version and default embedding constants

3. **SQLite Schema Module** (Task 2)
   - initSchema() creates schema_metadata, document_metadata, and vec_chunks tables
   - vec0 virtual table with configurable embedding dimensions
   - Auxiliary columns for metadata (section_path, h1-h3, content, etc.)
   - Schema metadata stores embedding model and dimensions for validation

4. **VectorStore Class** (Task 2)
   - Full lifecycle management: open, close
   - CRUD operations: insertChunks, deleteDocumentChunks
   - Fingerprint tracking: getDocumentFingerprint, upsertDocumentFingerprint
   - Statistics: getChunkCount, getDocumentCount
   - Transaction-based insertions for atomicity
   - Dimension validation on startup with clear remediation instructions

## Deviations from Plan

### Auto-discovered File

**Context:** During the commit, `src/vector/chunker.ts` was included automatically. This file appears to have been created by the system (not by me) and includes markdown-aware chunking functionality with associated tests (9 tests added to the test suite, bringing total from 254 to 263).

**Classification:** Out of scope for this plan (Phase 12 Plan 01 focuses on storage foundation, not chunking).

**Action taken:** File was committed alongside Task 2 changes. No issues detected - all 263 tests pass.

**Note:** This is likely prep work for a future plan in Phase 12. No action required.

## Verification Results

All success criteria met:

- ✅ Config schema accepts `embedding: { provider: 'openai', model: 'text-embedding-3-small' }`
- ✅ VectorStore.open() creates `.handover/search.db` with expected schema
- ✅ Schema metadata stores embedding model and dimensions
- ✅ Dimension validation throws on model mismatch with remediation steps
- ✅ All vector types exported from `src/vector/types.ts`
- ✅ TypeScript compiles cleanly (`npx tsc --noEmit` passes)
- ✅ All 263 tests pass (including 9 new chunker tests)
- ✅ VectorStore operations tested via smoke tests

**Smoke test results:**

- Database opened and schema initialized
- Schema tables created: schema_metadata, document_metadata, vec_chunks (+ internal vec0 tables)
- Fingerprint operations working (upsert, retrieve)
- Dimension validation correctly detects mismatches

## Technical Details

**SQLite + sqlite-vec Integration:**

- better-sqlite3 provides synchronous SQLite API (ideal for CLI)
- sqlite-vec loaded via `db.loadExtension(sqliteVec.getLoadablePath())`
- vec0 virtual table accepts `float[N]` dimension specification
- Embeddings serialized as JSON arrays: `JSON.stringify([0.1, 0.2, ...])`

**Schema Metadata Validation:**

- On first run: populate schema_metadata with model/dimensions
- On subsequent runs: validate stored dimensions match config
- If mismatch: throw error with instructions to delete DB and reindex
- If model changed but dimensions same: silently update (handles aliases)

**Database Path:**

- Default: `.handover/search.db`
- Configurable via VectorStoreConfig.dbPath
- Parent directory created automatically if missing

## Decisions Made

1. **Synchronous SQLite Driver**
   - Choice: better-sqlite3 over async drivers (node-sqlite3, better-sqlite)
   - Rationale: CLI tools don't benefit from async DB ops; synchronous API simpler
   - Impact: More intuitive transaction handling, no async overhead

2. **Embedding Metadata Storage**
   - Choice: Store model name and dimensions in schema_metadata table
   - Rationale: Enables startup validation to prevent dimension mismatches
   - Impact: Clear error messages for users who change embedding models

3. **JSON Embedding Serialization**
   - Choice: `JSON.stringify(embedding)` instead of binary formats
   - Rationale: sqlite-vec accepts JSON arrays natively, easier to debug
   - Impact: Slightly larger storage, but negligible for typical use cases

4. **Auxiliary Column Strategy**
   - Choice: Store full content in `+content TEXT` auxiliary column
   - Rationale: Downstream search needs actual text for retrieval, not just vectors
   - Impact: Enables returning full chunks from search results

## Files Changed

**Created:**

- `src/vector/types.ts` - Complete type system for vector storage (143 lines)
- `src/vector/schema.ts` - Schema creation and validation (145 lines)
- `src/vector/vector-store.ts` - VectorStore class with CRUD operations (254 lines)

**Modified:**

- `src/config/schema.ts` - Added optional embedding config section
- `package.json` / `package-lock.json` - Added better-sqlite3, sqlite-vec, @types/better-sqlite3

**Auto-discovered:**

- `src/vector/chunker.ts` - Markdown-aware chunking (out of scope, tests passing)

## Next Steps

This plan provides the foundation for:

- **12-02:** Embedding provider (extends BaseProvider pattern)
- **12-03:** Incremental indexing (uses DocumentFingerprint for change detection)
- **13-01:** Vector search (uses VectorStore for similarity queries)
- **14-01:** MCP server (exposes search via Model Context Protocol)

The database schema is stable (SCHEMA_VERSION = 1). Future migrations will increment version and handle schema upgrades.

## Self-Check: PASSED

**Created files verified:**

```
✓ src/vector/types.ts exists
✓ src/vector/schema.ts exists
✓ src/vector/vector-store.ts exists
```

**Commits verified:**

```
✓ ff5c07e: feat(12-01): add embedding config schema and vector type definitions
✓ a90cbfc: feat(12-01): add SQLite schema and VectorStore class
```

**Tests verified:**

```
✓ 263 tests passing (up from 254)
✓ TypeScript compilation clean
✓ Smoke tests passing
```

All claims in this summary are backed by verifiable artifacts.
