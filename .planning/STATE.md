# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.
**Current focus:** v4.0 MCP Server & Semantic Search (Phase 12-15)

## Current Position

Phase: 15 of 15 (LLM Q&A + Advanced Features)
Plan: 1 of 2 (in progress)
Status: Executing phase 15
Last activity: 2026-02-22 — completed 15-01 (shared QA orchestrator + search mode contracts)

Progress: [███████████████████████░] 97% (36/37 total plans across all milestones)

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
| 13    | 01   | Query Engine Retrieval          | 1 min    | 2026-02-21 |
| 13    | 02   | CLI Search Command              | 1 min    | 2026-02-22 |
| 14    | 01   | MCP Serve Bootstrap + Preflight | 4 min    | 2026-02-22 |
| 14    | 02   | MCP Resources + Pagination      | 4 min    | 2026-02-22 |
| 14    | 03   | MCP Semantic Search + Setup Docs | 2 min   | 2026-02-22 |
| 14    | 04   | MCP Serve Wiring Gap Closure    | 16 min   | 2026-02-22 |

- Total plans completed: 8
- Average duration: ~5.4 min/plan
- Total execution time: ~43 min
- Timeline: Started 2026-02-21
| Phase 15 P01 | 5 min | 3 tasks | 5 files |

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
- [Phase 13]: Use SQL distance/source_file/chunk_index ordering for deterministic search ties
- [Phase 13]: Validate --type values against a fixed lowercase allowlist with suggestions
- [Phase 13]: Preflight missing/empty search index and instruct users to run handover reindex
- [Phase 13]: Use process.stdout.isTTY gating so search output uses subtle emphasis in TTY and plain fallback otherwise
- [Phase 13]: Keep search result output ordered as rank, relevance, source, section, snippet for deterministic scanning
- [Phase 13]: Include repeated --type examples in search help text to reinforce strict filter semantics
- [Phase 14]: Reserve stdout for MCP JSON-RPC frames only; emit serve diagnostics to stderr
- [Phase 14]: Fail fast at serve startup when generated docs are missing and remediate with handover generate
- [Phase 14]: Normalize serve startup failures to structured code/message/action payloads
- [Phase 14]: Register semantic_search during serve startup via MCP register hook wiring
- [Phase 14]: Use explicit tool-layer validation so invalid semantic_search input maps to SEARCH_INVALID_INPUT
- [Phase 14]: Standardize semantic_search success payload to query/limit/total/results and keep no-match as success
- [Phase 14]: Override SDK default resources/list handling with custom cursor-aware handlers to enforce pagination contracts.
- [Phase 14]: Sort resource catalogs by URI/title before slicing and return MCP_RESOURCE_NOT_FOUND payloads for stable client remediation.
- [Phase 14]: Attached registerMcpResources to runServe using config.output so serve preflight and resource file resolution share the same output path.
- [Phase 14]: Kept registerMcpResources and registerMcpTools in the same startMcpServer registerHooks path to preserve semantic_search while enabling resources.
- [Phase 15]: Kept QA citations derived only from retrieved metadata to prevent drift.
- [Phase 15]: Applied clarification-first branching when evidence is weak or conflicting.
- [Phase 15]: Made search output display active mode explicitly for fast and qa paths.

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

Last session: 2026-02-22
Stopped at: Completed 15-01-PLAN.md
Resume file: .planning/phases/15-llm-q-a-advanced-features/15-02-PLAN.md
