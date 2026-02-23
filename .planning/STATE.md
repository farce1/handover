# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute - within minutes, not hours.
**Current focus:** Phase 16 execution in progress for v5.0 Remote & Advanced MCP

## Current Position

Phase: 16 of 20 (Streaming QA Session Lifecycle)
Plan: 1 of 2 in current phase
Status: In Progress
Last activity: 2026-02-23 - completed 16-01 streaming QA session lifecycle core

Progress: [███████████████████████░] 97% (38/39 plans completed; phase 16 plan 02 remaining)

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

| Phase | Plan | Name                                 | Duration | Date       |
| ----- | ---- | ------------------------------------ | -------- | ---------- |
| 12    | 01   | Vector Storage Foundation            | 5 min    | 2026-02-21 |
| 12    | 02   | Markdown-aware Document Chunker      | 6 min    | 2026-02-21 |
| 12    | 03   | Reindex Pipeline                     | 4 min    | 2026-02-21 |
| 13    | 01   | Query Engine Retrieval               | 1 min    | 2026-02-21 |
| 13    | 02   | CLI Search Command                   | 1 min    | 2026-02-22 |
| 14    | 01   | MCP Serve Bootstrap + Preflight      | 4 min    | 2026-02-22 |
| 14    | 02   | MCP Resources + Pagination           | 4 min    | 2026-02-22 |
| 14    | 03   | MCP Semantic Search + Setup Docs     | 2 min    | 2026-02-22 |
| 14    | 04   | MCP Serve Wiring Gap Closure         | 16 min   | 2026-02-22 |
| 15    | 01   | Shared QA Orchestrator + Search Modes | 5 min   | 2026-02-22 |
| 15    | 02   | MCP Prompt Workflows + Reindex UX    | 0 min    | 2026-02-22 |

- Total plans completed: 11
- Average duration: ~4.4 min/plan
- Total execution time: ~48 min
- Timeline: 2 days (2026-02-21 to 2026-02-22)
| Phase 16 P01 | 2 min | 3 tasks | 3 files |

## Accumulated Context

### Decisions

All v1.0-v3.0 decisions are archived in PROJECT.md.

v4.0 architectural approach:

- MCP server as separate entry point (clean separation from core DAG orchestrator)
- Incremental indexing with content-hash (reuse existing AnalysisCache pattern)
- Embedding provider as standalone class (not extending BaseProvider)
- SQLite + sqlite-vec for local vector storage
- Phase ordering: Storage -> Search -> MCP -> Advanced

Milestone closure decisions:

- v4.0 marked shipped with audit status `tech_debt` (runtime human validation deferred, no implementation blockers)
- ROADMAP condensed to milestone-level summaries with detailed execution history archived
- Next milestone scope moved to remote and advanced MCP capabilities (v5.0)

v5.0 roadmap decisions:

- Phase numbering continues from 16 through 20 (no reset)
- Requirement coverage fixed at 17/17 mapped (RMT-05 through RMT-21)
- Delivery order set to Streaming QA -> Local Embeddings -> Remote Regeneration -> HTTP Parity -> HTTP Security
- [Phase 16]: Kept final stream payload as strict wrapper around AnswerQuestionResult to avoid contract drift.
- [Phase 16]: Persisted events before publication so live streaming and replay share one source of truth.
- [Phase 16]: Applied single terminal transition guard across manager and store to prevent double finalization.

### Pending Todos

None.

### Blockers/Concerns

External setup still required:

- GitHub Sponsors enrollment (FUNDING.yml ready, account enrollment needed)
- npm trusted publishing OIDC config on npmjs.com
- RELEASE_PLEASE_TOKEN (GitHub fine-grained PAT) as repo secret
- CODECOV_TOKEN as repo secret

v4.0 deferred runtime validation:

- Full provider-backed generate -> reindex validation
- Semantic relevance quality checks on populated real indexes
- MCP client interoperability matrix (Claude Desktop/Cursor/VS Code)

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 16-01-PLAN.md
Resume file: .planning/phases/16-streaming-qa-session-lifecycle/16-02-PLAN.md
