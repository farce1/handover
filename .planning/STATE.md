# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.
**Current focus:** v4.0 MCP Server & Semantic Search (Phase 12-15)

## Current Position

Phase: 12 of 15 (Vector Storage Foundation)
Plan: 3 of 3 (completed)
Status: Phase 12 complete
Last activity: 2026-02-21 — completed 12-03 (Reindex Pipeline)

Progress: [██████████████████░░] 81% (30/37 total plans across all milestones)

## Performance Metrics

**v1.0 Velocity:**

- Total plans completed: 9
- Average duration: ~5 min/plan
- Total execution time: ~0.7 hours
- Timeline: 3 days (2026-02-16 to 2026-02-18)

**v2.0 Velocity:**

- Total plans completed: 8
- Average duration: ~3.6 min/plan
- Total execution time: ~29 min
- Timeline: 2 days (2026-02-18 to 2026-02-19)

**v3.0 Velocity:**

- Total plans completed: 10
- Average duration: ~4.5 min/plan
- Total execution time: ~45 min
- Timeline: 4 days (2026-02-16 to 2026-02-20)

**v4.0 Velocity:**

| Phase | Plan | Name                            | Duration | Date       |
| ----- | ---- | ------------------------------- | -------- | ---------- |
| 12    | 01   | Vector Storage Foundation       | 5 min    | 2026-02-21 |
| 12    | 02   | Markdown-aware Document Chunker | 6 min    | 2026-02-21 |
| 12    | 03   | Reindex Pipeline                | 4 min    | 2026-02-21 |

- Total plans completed: 3
- Average duration: ~5 min/plan
- Total execution time: ~15 min
- Timeline: Started 2026-02-21

## Accumulated Context

### Decisions

All v1.0, v2.0, and v3.0 decisions archived in PROJECT.md Key Decisions table.

v4.0 architectural approach:

- MCP server as separate entry point (clean separation from core DAG orchestrator)
- Incremental indexing with content-hash (reuse existing AnalysisCache pattern)
- Embedding provider as standalone class (not extending BaseProvider - different use case)
- SQLite + sqlite-vec for vector storage (zero-config, runs in-process)
- Phase ordering: Storage → Search → MCP → Advanced (validates quality at each step)

v4.0 implementation decisions (12-01):

- better-sqlite3 over async drivers (synchronous API ideal for CLI tools)
- Embedding metadata in schema_metadata table (enables startup dimension validation)
- JSON embedding serialization (sqlite-vec native format, easier debugging)
- Full content in auxiliary columns (enables text retrieval from search results)

v4.0 implementation decisions (12-02):

- Sliding window approach over recursive splitting (predictable chunk sizes with natural boundaries)
- Pure TypeScript chunker (avoided LangChain dependency - saved ~5MB for ~200 lines)
- Created types.ts as blocking fix (plan 12-02 executed before 12-01 completion)

v4.0 implementation decisions (12-03):

- Embedding provider standalone (BaseProvider is for LLM completions, not embeddings)
- SHA-256 content hashing for fingerprints (consistent with AnalysisCache pattern)
- Progress bar to stderr (critical for MCP stdout cleanliness)

### Pending Todos

None.

### Blockers/Concerns

External setup still required from v1.0:

- GitHub Sponsors enrollment (FUNDING.yml ready, account enrollment needed)
- npm trusted publishing OIDC config on npmjs.com
- RELEASE_PLEASE_TOKEN (GitHub fine-grained PAT) as repo secret
- CODECOV_TOKEN as repo secret

v4.0 critical pitfalls:

- ✅ Phase 12: stdout corruption in MCP servers (enforced stderr logging throughout)
- ✅ Phase 12: embedding dimension validation (stored in schema, verified on startup)
- ✅ Phase 12: markdown-aware chunking (preserves code blocks, tables, headers)
- Phase 13: top-k over global threshold (portable across queries)
- Phase 14: MCP resource pagination (never unbounded resource lists)

## Session Continuity

Last session: 2026-02-21
Stopped at: Completed 12-03-PLAN.md (Reindex Pipeline) - Phase 12 complete
Resume file: .planning/phases/12-vector-storage-foundation/12-03-SUMMARY.md
