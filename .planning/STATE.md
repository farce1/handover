# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute - within minutes, not hours.
**Current focus:** v6.0 Subscription Auth & Validation

## Current Position

Milestone: v6.0 Subscription Auth & Validation
Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-26 — Milestone v6.0 started

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

**v5.0 Velocity:**

- Total plans completed: 12
- Total tasks completed: 28
- Average duration: ~3.8 min/plan
- Total execution time: ~45 min
- Timeline: 3 days (2026-02-23 to 2026-02-25)

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
- [Phase 16]: Lifecycle tools return deterministic session metadata (sessionId/state/lastSequence/events) for cursor-safe clients.
- [Phase 16]: Progress notifications are emitted from canonical stream events only when _meta.progressToken is present.
- [Phase 16]: Resume validates lastAckSequence bounds and returns structured remediation for invalid cursors.
- [Phase 17-local-embedding-provider-routing]: local-preferred fallback now requires explicit confirmation in interactive flows and fails with remediation in non-interactive contexts
- [Phase 17-local-embedding-provider-routing]: embedding health checks now centralize Ollama connectivity and model readiness diagnostics via /api/version and /api/show
- [Phase 17-local-embedding-provider-routing]: Health-check failures now print structured JSON diagnostics before CLI exit formatting.
- [Phase 17-local-embedding-provider-routing]: Reindex and search now accept per-run --embedding-mode overrides for locality policy control.
- [Phase 17-local-embedding-provider-routing]: Reindex/search outputs include deterministic embedding mode/provider route summary lines.
- [Phase 17-local-embedding-provider-routing]: Reindex and retrieval now resolve embedding providers through EmbeddingRouter in non-interactive mode for deterministic locality behavior.
- [Phase 17-local-embedding-provider-routing]: Retrieval now hard-blocks model/dimension metadata mismatches and directs users to reindex before retrying search.
- [Phase 17-local-embedding-provider-routing]: Reindex result contract now carries resolved embedding route metadata so CLI output uses runtime route truth.
- [Phase 17-local-embedding-provider-routing]: Reindex route metadata is returned for no-op, partial-failure, and success paths to keep provider visibility deterministic.
- [Phase 18-remote-regeneration-job-control]: Normalized target aliases map to fixed canonical keys with remediation for unknown targets.
- [Phase 18-remote-regeneration-job-control]: Regeneration jobs persist queued before execution, then transition running and exactly one terminal state.
- [Phase 18-remote-regeneration-job-control]: Duplicate requests for the same normalized target join the existing in-flight job with explicit dedupe metadata.
- [Phase 18-remote-regeneration-job-control]: Status polling is job-ID only via regenerate_docs_status for deterministic remote automation.
- [Phase 18-remote-regeneration-job-control]: Regeneration failures are mapped to MCP structured errors with code/message/action payloads.
- [Phase 18-remote-regeneration-job-control]: Regeneration executor runs generate/reindex in subprocesses with piped stdio to protect MCP protocol output.
- [Phase 19-http-transport-parity]: `serve.transport` now defaults to `stdio` with optional HTTP mode via config and per-run CLI overrides.
- [Phase 19-http-transport-parity]: Serve startup now branches by resolved transport and prints deterministic HTTP endpoint discovery lines when HTTP mode is active.
- [Phase 19-http-transport-parity]: Streamable HTTP transport now serves POST/GET/DELETE on one configured MCP path and returns structured remediation for unknown paths.
- [Phase 20]: Default Origin policy denies cross-origin requests unless allowlisted or wildcarded explicitly.
- [Phase 20]: Bearer auth token checks now use SHA-256 normalization with timingSafeEqual for constant-length comparison.
- [Phase 20]: HTTP startup now fails on non-loopback hosts without HANDOVER_AUTH_TOKEN or serve.http.auth.token configured.
- [Phase 20-http-security-and-access-controls]: The --allow-origin flag is repeatable and replaces config allowedOrigins for the current run.
- [Phase 20-http-security-and-access-controls]: HTTP startup resolves auth token once (env first, then config) and passes it into server middleware wiring.
- [Phase 20-http-security-and-access-controls]: Origin policy middleware is always installed before bearer auth and MCP route handlers.

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

v5.0 deferred runtime validation:

- Real-client streaming QA timing and reconnect/resume behavior checks
- Local embedding runtime fallback and route-visibility checks in provider-backed environments
- End-to-end remote regeneration trigger/status lifecycle against live MCP clients
- Add formal `19-VERIFICATION.md` artifact to close phase verification documentation gap

## Session Continuity

Last session: 2026-02-26
Stopped at: v6.0 milestone initialized, defining requirements
Resume file: Continue requirements definition and roadmap creation
