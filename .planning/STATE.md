# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.
**Current focus:** v4.0 MCP Server & Semantic Search (Phase 12-15)

## Current Position

Phase: 12 of 15 (Vector Storage Foundation)
Plan: Ready to plan Phase 12
Status: Roadmap complete, ready to plan Phase 12
Last activity: 2026-02-20 — v4.0 roadmap created with 4 phases

Progress: [████████████████░░░░] 73% (27/37 total plans across all milestones)

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

- Total plans completed: 0
- Status: Ready to plan Phase 12

## Accumulated Context

### Decisions

All v1.0, v2.0, and v3.0 decisions archived in PROJECT.md Key Decisions table.

v4.0 architectural approach:

- MCP server as separate entry point (clean separation from core DAG orchestrator)
- Incremental indexing with content-hash (reuse existing AnalysisCache pattern)
- Embedding provider extends BaseProvider (consistent retry/rate-limit patterns)
- SQLite + sqlite-vec for vector storage (zero-config, runs in-process)
- Phase ordering: Storage → Search → MCP → Advanced (validates quality at each step)

### Pending Todos

None.

### Blockers/Concerns

External setup still required from v1.0:

- GitHub Sponsors enrollment (FUNDING.yml ready, account enrollment needed)
- npm trusted publishing OIDC config on npmjs.com
- RELEASE_PLEASE_TOKEN (GitHub fine-grained PAT) as repo secret
- CODECOV_TOKEN as repo secret

v4.0 critical pitfalls to address:

- Phase 12: stdout corruption in MCP servers (enforce stderr logging)
- Phase 12: embedding dimension validation (store in schema, verify on startup)
- Phase 12: markdown-aware chunking (preserve code blocks, tables, headers)
- Phase 13: top-k over global threshold (portable across queries)
- Phase 14: MCP resource pagination (never unbounded resource lists)

## Session Continuity

Last session: 2026-02-21
Stopped at: Phase 12 context gathered
Resume file: .planning/phases/12-vector-storage-foundation/12-CONTEXT.md
