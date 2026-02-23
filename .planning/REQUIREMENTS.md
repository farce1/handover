# Requirements: Handover v5.0 Remote & Advanced MCP

**Defined:** 2026-02-23
**Core Value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute - within minutes, not hours.

## v5.0 Requirements

Requirements for the v5.0 milestone. Each requirement maps to exactly one roadmap phase.

### Streaming QA (RMT-04)

- [ ] **RMT-05**: User can request QA in streaming mode and receive incremental progress updates during long responses
- [ ] **RMT-06**: User can cancel an in-flight streaming QA request and receive cancellation confirmation
- [ ] **RMT-07**: User receives the same final structured QA response contract in both streaming and non-streaming modes
- [ ] **RMT-08**: User can resume a dropped streaming QA session and continue from the last acknowledged stream position

### Remote Regeneration Tooling (RMT-01)

- [ ] **RMT-09**: User can invoke `regenerate_docs` as an MCP tool from a remote MCP client
- [ ] **RMT-10**: User can view deterministic regeneration job states (`queued`, `running`, `completed`, `failed`)
- [ ] **RMT-11**: User submitting duplicate regeneration requests for the same target gets single-flight behavior instead of duplicate concurrent runs

### HTTP Transport and Security (RMT-02)

- [ ] **RMT-12**: User can start MCP server with optional Streamable HTTP transport while stdio remains the default transport
- [ ] **RMT-13**: User can access the same MCP tools, resources, and prompts over stdio and HTTP with equivalent behavior
- [ ] **RMT-14**: User requests from disallowed HTTP origins are rejected with clear remediation messaging
- [ ] **RMT-15**: User running HTTP mode locally gets localhost-safe bind defaults unless explicitly overridden
- [ ] **RMT-16**: User can configure authentication hooks or credentials for non-localhost HTTP deployments
- [ ] **RMT-17**: User receives clear authentication failure diagnostics when HTTP requests are unauthorized

### Local Embeddings and Validation (RMT-03)

- [ ] **RMT-18**: User can configure an Ollama-compatible local embedding provider path for indexing and retrieval
- [ ] **RMT-19**: User gets fail-fast validation when embedding model or dimension does not match stored index metadata
- [ ] **RMT-20**: User can select embedding locality policy mode (`local-only`, `local-preferred`, `remote-only`)
- [ ] **RMT-21**: User can run embedding provider health checks and receive actionable diagnostics before indexing

## Future Requirements

Deferred to a later milestone (tracked, but not committed in v5.0 roadmap).

### Remote Reliability and Scale

- **RMT-22**: User can resume dropped remote regeneration streams for long-running documentation builds
- **RMT-23**: User can view transport-aware diagnostics for mixed stdio and HTTP deployments
- **RMT-24**: User can schedule automatic regeneration runs
- **RMT-25**: User can run prioritized parallel regeneration queues for high-concurrency hosted usage
- **RMT-26**: User can manage multi-tenant hosted remote MCP operations from a control plane

## Out of Scope

Explicitly excluded to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mandatory HTTP transport replacing stdio | Breaks existing local MCP workflows; v5.0 requires additive transport support |
| Third-party token passthrough from MCP client to upstream APIs | Security anti-pattern; weakens trust boundaries and auditability |
| Fire-and-forget regeneration with no progress/cancel | Poor UX for long jobs and no safe retry visibility |
| Streaming partial markdown artifacts during regeneration | Produces inconsistent docs and complicates validation pipeline |
| Always-on background auto-regeneration daemon | Adds operational complexity and race risks without milestone-critical value |

## Traceability

Filled during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RMT-05 | TBD | Pending |
| RMT-06 | TBD | Pending |
| RMT-07 | TBD | Pending |
| RMT-08 | TBD | Pending |
| RMT-09 | TBD | Pending |
| RMT-10 | TBD | Pending |
| RMT-11 | TBD | Pending |
| RMT-12 | TBD | Pending |
| RMT-13 | TBD | Pending |
| RMT-14 | TBD | Pending |
| RMT-15 | TBD | Pending |
| RMT-16 | TBD | Pending |
| RMT-17 | TBD | Pending |
| RMT-18 | TBD | Pending |
| RMT-19 | TBD | Pending |
| RMT-20 | TBD | Pending |
| RMT-21 | TBD | Pending |

**Coverage:**
- v5.0 requirements: 17 total
- Mapped to phases: 0
- Unmapped: 17

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after milestone requirements scoping*
