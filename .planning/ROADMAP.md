# Roadmap: Handover

## Milestones

- ✅ **v1.0 OSS Excellence** - Phases 1-3 (shipped 2026-02-18)
- ✅ **v2.0 Performance** - Phases 4-7 (shipped 2026-02-19)
- ✅ **v3.0 Robustness** - Phases 8-11 (shipped 2026-02-20)
- ✅ **v4.0 MCP Server & Semantic Search** - Phases 12-15 (shipped 2026-02-22)
- 📋 **v5.0 Remote & Advanced MCP** - Phases 16-20 (planned)

## Phases

<details>
<summary>✅ v1.0 OSS Excellence (Phases 1-3) - SHIPPED 2026-02-18</summary>

- [x] Phase 1: Community Health (2/2 plans) - completed 2026-02-18
- [x] Phase 2: CI/CD Automation (4/4 plans) - completed 2026-02-18
- [x] Phase 3: Docs and LLM Accessibility (3/3 plans) - completed 2026-02-18

</details>

<details>
<summary>✅ v2.0 Performance (Phases 4-7) - SHIPPED 2026-02-19</summary>

- [x] Phase 4: Cache Correctness (2/2 plans) - completed 2026-02-18
- [x] Phase 5: UX Responsiveness (2/2 plans) - completed 2026-02-19
- [x] Phase 6: Context Efficiency (3/3 plans) - completed 2026-02-19
- [x] Phase 7: Cache Savings Pipeline Fix (1/1 plan) - completed 2026-02-19

</details>

<details>
<summary>✅ v3.0 Robustness (Phases 8-11) - SHIPPED 2026-02-20</summary>

- [x] Phase 8: CI Fix, Scorecard Hardening, and Test Infrastructure (3/3 plans) - completed 2026-02-19
- [x] Phase 9: Code Hardening and Pure Function Tests (3/3 plans) - completed 2026-02-19
- [x] Phase 10: Algorithm and Validation Tests (2/2 plans) - completed 2026-02-19
- [x] Phase 11: AI Round Tests and Coverage Enforcement (2/2 plans) - completed 2026-02-20

</details>

<details>
<summary>✅ v4.0 MCP Server & Semantic Search (Phases 12-15) - SHIPPED 2026-02-22</summary>

- [x] Phase 12: Vector Storage Foundation (3/3 plans) - completed 2026-02-21
- [x] Phase 13: Query Engine + CLI Search (2/2 plans) - completed 2026-02-22
- [x] Phase 14: MCP Server (Tools + Resources) (4/4 plans) - completed 2026-02-22
- [x] Phase 15: LLM Q&A + Advanced Features (2/2 plans) - completed 2026-02-22

</details>

### 📋 v5.0 Remote & Advanced MCP (Planned)

- [x] **Phase 16: Streaming QA Session Lifecycle** - Deliver resumable, cancellable QA streaming with stable final contract (completed 2026-02-23)
- [x] **Phase 17: Local Embedding Provider Routing** - Add local embedding paths with strict index compatibility validation (completed 2026-02-23)
- [x] **Phase 18: Remote Regeneration Job Control** - Expose deterministic, deduplicated regeneration jobs for MCP clients (completed 2026-02-24)
- [x] **Phase 19: HTTP Transport Parity** - Add optional Streamable HTTP transport with behavior parity to stdio (completed 2026-02-24)
- [x] **Phase 20: HTTP Security and Access Controls** - Enforce origin, bind, and auth guardrails for non-local deployments (completed 2026-02-25)

## Phase Details

### Phase 16: Streaming QA Session Lifecycle
**Goal**: Users can run long QA queries with streamed progress, cancellation, and safe resume behavior without losing response structure.
**Depends on**: Phase 15
**Requirements**: RMT-05, RMT-06, RMT-07, RMT-08
**Success Criteria** (what must be TRUE):
  1. User can start QA in streaming mode and see incremental progress during long responses.
  2. User can cancel an active streaming QA request and receive explicit cancellation confirmation.
  3. User receives the same final structured QA response shape in streaming and non-streaming modes.
  4. User can reconnect and resume a dropped streaming QA session from the last acknowledged position.
**Plans**: 2 plans

Plans:
- [x] 16-01-PLAN.md - Build durable QA streaming session core (event schema, append-only store, replay-safe manager)
- [x] 16-02-PLAN.md - Expose MCP streaming QA lifecycle tools (progress, cancellation, reconnect resume)

### Phase 17: Local Embedding Provider Routing
**Goal**: Users can choose local embedding execution with predictable routing and validation before indexing or retrieval.
**Depends on**: Phase 15
**Requirements**: RMT-18, RMT-19, RMT-20, RMT-21
**Success Criteria** (what must be TRUE):
  1. User can configure an Ollama-compatible local embedding provider path for indexing and retrieval workflows.
  2. User gets immediate, actionable validation errors when embedding model or dimensions conflict with stored index metadata.
  3. User can set embedding locality policy (`local-only`, `local-preferred`, `remote-only`) and observe routing behavior that matches the selected mode.
  4. User can run embedding provider health checks before indexing and receive clear diagnostics for failures.
**Plans**: 3 plans

Plans:
- [x] 17-01-PLAN.md - Build embedding locality config, local provider router, and shared health-check primitives
- [ ] 17-02-PLAN.md - Wire mode-aware routing and fail-fast compatibility validation into reindex and retrieval
- [x] 17-03-PLAN.md - Expose embedding health command, CLI mode overrides, and mode/provider run summaries

### Phase 18: Remote Regeneration Job Control
**Goal**: Users can trigger and monitor remote documentation regeneration safely through MCP with deterministic lifecycle behavior.
**Depends on**: Phase 16
**Requirements**: RMT-09, RMT-10, RMT-11
**Success Criteria** (what must be TRUE):
  1. User can invoke `regenerate_docs` from a remote MCP client and receive a valid job reference.
  2. User can observe deterministic job state transitions (`queued`, `running`, `completed`, `failed`) for regeneration runs.
  3. User sending duplicate regeneration requests for the same target sees single-flight behavior instead of duplicate concurrent runs.
**Plans**: 2 plans

Plans:
- [x] 18-01-PLAN.md - Build deterministic regeneration job core (contracts, target normalization, durable store, single-flight manager)
- [x] 18-02-PLAN.md - Expose regenerate_docs MCP trigger/status tools with shared executor wiring and remote usage docs

### Phase 19: HTTP Transport Parity
**Goal**: Users can run MCP over optional Streamable HTTP with the same functional behavior they get from stdio.
**Depends on**: Phase 18
**Requirements**: RMT-12, RMT-13
**Success Criteria** (what must be TRUE):
  1. User can start MCP server in stdio mode by default and opt into Streamable HTTP mode through configuration.
  2. User can access the same MCP tools, resources, and prompts over HTTP and stdio with equivalent behavior and outputs.
**Plans**: 2 plans

Plans:
- [x] 19-01-PLAN.md - Config schema extension, CLI flags, and serve transport branching
- [x] 19-02-PLAN.md - HTTP transport server implementation and docs update

### Phase 20: HTTP Security and Access Controls
**Goal**: Users can deploy HTTP MCP endpoints with explicit origin and authentication controls that protect remote usage.
**Depends on**: Phase 19
**Requirements**: RMT-14, RMT-15, RMT-16, RMT-17
**Success Criteria** (what must be TRUE):
  1. User requests from disallowed HTTP origins are rejected with remediation guidance that explains how to fix configuration.
  2. User running HTTP mode locally gets localhost-safe bind defaults unless they explicitly override the bind settings.
  3. User can configure authentication hooks or credentials for non-localhost deployments.
  4. User receives clear unauthorized diagnostics when HTTP authentication fails.
**Plans**: 2 plans

Plans:
- [ ] 20-01-PLAN.md -- Config schema extension, security middleware (origin policy + bearer auth), and startup guard with TDD
- [ ] 20-02-PLAN.md -- CLI --allow-origin flag, serve startup wiring, middleware insertion, and security docs

## Progress

| Phase                              | Milestone | Plans Complete | Status   | Completed  |
| ---------------------------------- | --------- | -------------- | -------- | ---------- |
| 1. Community Health                | v1.0      | 2/2            | Complete | 2026-02-18 |
| 2. CI/CD Automation                | v1.0      | 4/4            | Complete | 2026-02-18 |
| 3. Docs and LLM Accessibility      | v1.0      | 3/3            | Complete | 2026-02-18 |
| 4. Cache Correctness               | v2.0      | 2/2            | Complete | 2026-02-18 |
| 5. UX Responsiveness               | v2.0      | 2/2            | Complete | 2026-02-19 |
| 6. Context Efficiency              | v2.0      | 3/3            | Complete | 2026-02-19 |
| 7. Cache Savings Pipeline Fix      | v2.0      | 1/1            | Complete | 2026-02-19 |
| 8. CI Fix, Scorecard, Test Infra   | v3.0      | 3/3            | Complete | 2026-02-19 |
| 9. Code Hardening and Pure Tests   | v3.0      | 3/3            | Complete | 2026-02-19 |
| 10. Algorithm and Validation Tests | v3.0      | 2/2            | Complete | 2026-02-19 |
| 11. AI Round Tests and Coverage    | v3.0      | 2/2            | Complete | 2026-02-20 |
| 12. Vector Storage Foundation      | v4.0      | 3/3            | Complete | 2026-02-21 |
| 13. Query Engine + CLI Search      | v4.0      | 2/2            | Complete | 2026-02-22 |
| 14. MCP Server (Tools + Resources) | v4.0      | 4/4            | Complete | 2026-02-22 |
| 15. LLM Q&A + Advanced Features    | v4.0      | 2/2            | Complete | 2026-02-22 |
| 16. Streaming QA Session Lifecycle | v5.0      | 2/2            | Complete    | 2026-02-23 |
| 17. Local Embedding Provider Routing | 4/4 | Complete    | 2026-02-24 | - |
| 18. Remote Regeneration Job Control | 2/2 | Complete    | 2026-02-24 | - |
| 19. HTTP Transport Parity          | v5.0      | 2/2            | Complete | 2026-02-24 |
| 20. HTTP Security and Access Controls | 2/2 | Complete   | 2026-02-25 | - |
