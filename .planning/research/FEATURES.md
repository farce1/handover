# Feature Research

**Domain:** Remote-capable MCP server for documentation regeneration and QA
**Researched:** 2026-02-23
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **RMT-04: Long-running QA calls show progress + stream over MCP transport** | Mature MCP clients expect responsiveness on long operations; MCP spec defines progress and cancellation for in-flight requests | HIGH | Implement `notifications/progress` with monotonic progress and support `notifications/cancelled`; return final tool result only when complete |
| **RMT-01: Remote regeneration exposed as a tool with safe async behavior** | Mature MCP servers expose high-value actions as tools, not ad-hoc commands | HIGH | Regeneration is multi-minute; design as job-oriented tool execution with clear status messages and idempotent run semantics |
| **RMT-02: Optional Streamable HTTP transport in addition to stdio** | Remote MCP deployments now standardize on Streamable HTTP while local tools still rely on stdio | HIGH | Keep stdio default for compatibility; add HTTP endpoint that supports both `application/json` and `text/event-stream` |
| **Remote transport security baseline (Origin validation + auth-ready path)** | Mature hosted MCP requires transport hardening by default | HIGH | For HTTP mode: validate `Origin`, prefer localhost binding for local runs, and support auth headers/OAuth-compatible flow |
| **RMT-03: Local embedding provider path (Ollama-class)** | Mature tools offer cloud + local embedding options for privacy, offline work, and cost control | MEDIUM | Add local provider path using `/api/embed`, model configurability, and embedding dimension validation against vector index schema |
| **Transport parity for existing MCP resources/tools/prompts** | Users expect same server behavior regardless of transport | MEDIUM | Stdio and HTTP must expose identical capabilities and tool contracts; transport changes should not change semantics |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Regeneration with resumable remote UX** | Better remote reliability than fire-once tools when network drops | HIGH | Use Streamable HTTP SSE event IDs + resumable patterns so clients can recover from disconnects during long regeneration |
| **Offline-first embeddings (local default path when configured)** | Teams with compliance/privacy limits can use semantic features without cloud keys | MEDIUM | Support local Ollama embeddings as first-class provider path; cloud embedding remains optional fallback |
| **User-trust guardrails for remote mutations** | Safer than many MCP servers that over-automate write operations | MEDIUM | Keep explicit user confirmation for mutation tools (regeneration) and clear tool descriptions indicating side effects |
| **Backward-compatible protocol behavior across MCP revisions** | Reduces integration breakage across fast-moving MCP clients | MEDIUM | Honor negotiated protocol version and required HTTP headers; maintain compatibility with non-streaming clients |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Make HTTP transport mandatory and drop stdio** | "Remote is the future" simplification | Breaks mature local IDE workflows and violates MCP guidance that clients should support stdio where possible | Keep stdio-first baseline; add HTTP as opt-in (`--transport http`) |
| **Pass through third-party bearer tokens directly from client to upstream APIs** | "Simpler auth plumbing" | Explicit MCP security anti-pattern (token passthrough); weakens trust boundaries and auditability | Validate tokens for MCP server audience only; mint/use separate upstream credentials as needed |
| **Fire-and-forget regeneration without progress/cancel** | Faster implementation | Poor UX for long tasks; users cannot tell if run is alive, stuck, or safe to retry | Emit progress notifications, support cancellation, and surface deterministic terminal state |
| **Always-on background auto-regeneration daemon** | "Always fresh docs" appeal | Adds race conditions, extra resource usage, and operational complexity for little milestone value | Keep explicit regeneration tool invocation; optionally add scheduled automation later |
| **Streaming partial markdown artifacts while regeneration is still running** | Perceived immediate output | Produces partial, inconsistent docs and complicates validation | Stream status/progress only; publish artifacts when full run is complete |

## Feature Dependencies

```
[RMT-04 Streaming MCP QA]
    └──requires──> [Progress Notifications]
                       └──requires──> [Request Metadata with progressToken]
    └──requires──> [Cancellation Handling]

[RMT-01 Remote Regeneration Tool]
    └──requires──> [Tool Contract + Input Schema]
    └──requires──> [Async Job Lifecycle]
                       └──requires──> [Progress + Cancellation]
    └──enhances──> [RMT-04 Streaming UX]

[RMT-02 Optional HTTP Transport]
    └──requires──> [MCP Lifecycle Negotiation]
    └──requires──> [Streamable HTTP Endpoint]
                       └──requires──> [SSE + JSON Response Handling]
    └──requires──> [Origin Validation + Auth Hooks]
    └──must-not-conflict-with──> [Existing stdio transport]

[RMT-03 Local Embedding Provider Path]
    └──requires──> [Provider Abstraction for Embeddings]
    └──requires──> [Ollama /api/embed Integration]
    └──requires──> [Embedding Dimension Validation]
    └──enhances──> [Remote regeneration + QA freshness]
```

### Dependency Notes

- **RMT-04 requires progress tokens:** MCP progress is keyed by `progressToken`; without it, long operations degrade to opaque waits.
- **RMT-01 depends on async lifecycle:** remote regeneration should not block without visibility; it should expose deterministic running/completed/failed states.
- **RMT-02 depends on strict HTTP protocol handling:** clients send `Accept: application/json, text/event-stream`; servers must support both and preserve MCP version semantics.
- **RMT-02 must coexist with stdio:** remote support is additive for v5.0, not a replacement.
- **RMT-03 depends on vector compatibility checks:** local embedding models can change dimension/model identity; index writes must validate dimensions before upsert.

## MVP Definition

### Launch With (v5.0)

Minimum viable milestone to validate remote + advanced MCP scope.

- [ ] **RMT-04 streaming QA path** — long-form QA emits progress updates and supports cancellation
- [ ] **RMT-01 regeneration tool (remote-capable)** — tool trigger for doc regeneration with deterministic status
- [ ] **RMT-02 optional Streamable HTTP transport** — stdio unchanged, HTTP available for hosted/remote clients
- [ ] **HTTP transport hardening baseline** — Origin checks, localhost-safe defaults for local run mode, auth-ready request handling
- [ ] **RMT-03 local embeddings path** — configurable Ollama embedding model via local endpoint
- [ ] **Embedding/index validation guardrails** — reject incompatible vector dimensions with actionable remediation

### Add After Validation (v5.x)

Features to add once the v5 core proves stable in real remote usage.

- [ ] **Resumable regeneration streams** — trigger when users report dropped remote sessions during long runs
- [ ] **Remote auth UX polish (OAuth flow helpers)** — trigger when hosted deployments become common
- [ ] **Transport-aware diagnostics** — trigger when support load rises for mixed stdio/http environments
- [ ] **Embedding provider auto-health checks** — trigger when local model startup and availability become common failures

### Future Consideration (v6+)

Features to defer until remote usage patterns are mature.

- [ ] **Multi-tenant hosted control plane** — defer until there is sustained hosted demand
- [ ] **Automated schedule-based regeneration** — defer until explicit user demand exceeds manual tool invocation
- [ ] **Advanced queue orchestration for parallel regeneration jobs** — defer until concurrency pressure is real

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| RMT-04 streaming QA (progress + cancel) | HIGH | HIGH | P1 |
| RMT-01 remote regeneration tool | HIGH | HIGH | P1 |
| RMT-02 optional Streamable HTTP transport | HIGH | HIGH | P1 |
| HTTP hardening baseline (Origin/auth-ready) | HIGH | MEDIUM | P1 |
| RMT-03 local embeddings path (Ollama) | MEDIUM | MEDIUM | P1 |
| Embedding dimension/index validation | HIGH | LOW | P1 |
| Resumable regeneration stream support | MEDIUM | MEDIUM | P2 |
| Auth UX polish for hosted remotes | MEDIUM | MEDIUM | P2 |
| Transport-aware diagnostics | MEDIUM | LOW | P2 |
| Embedding provider health checks | MEDIUM | LOW | P2 |
| Schedule-based auto-regeneration | LOW | MEDIUM | P3 |
| Parallel job orchestration control plane | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for milestone acceptance
- P2: Should have after initial validation
- P3: Defer unless demand is clear

## Competitor Feature Analysis

| Feature | Claude Code MCP | Continue | Cloudflare MCP | Our Approach |
|---------|------------------|----------|----------------|--------------|
| **Remote transport** | Recommends HTTP transport for remote MCP; SSE marked deprecated in docs | Supports MCP integrations in IDE workflows, including remote endpoints | Remote MCP architecture centered on Streamable HTTP + OAuth | Keep stdio compatibility and add optional Streamable HTTP |
| **Long-running UX** | Exposes operational limits and expects practical handling for large MCP outputs | Emphasizes practical model-role separation, but less MCP job-lifecycle guidance | Emphasizes production deployment patterns for remote MCP | Use explicit progress + cancel semantics for QA and regeneration |
| **Local embeddings** | Not a built-in focus in MCP transport docs | Explicitly recommends local embeddings (e.g., Ollama `nomic-embed-text`) for local generation | Not the primary focus; docs center remote server infra | Add first-class local embedding provider path with validation |
| **Remote safety model** | Strong emphasis on auth, scopes, and user-in-loop tool safety | Focuses model/provider config safety in IDE context | Recommends scoped tools and OAuth for remote connections | Mutation tools require clear side-effect metadata and safe execution boundaries |

## Sources

- [MCP Specification 2025-06-18: Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [MCP Specification 2025-06-18: Progress](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/progress)
- [MCP Specification 2025-06-18: Cancellation](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation)
- [MCP Specification 2025-06-18: Lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)
- [MCP Specification 2025-06-18: Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP Specification 2025-06-18: Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [MCP Specification: Security Best Practices](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)
- [Anthropic Claude Code MCP docs](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [Cloudflare Agents: Model Context Protocol](https://developers.cloudflare.com/agents/model-context-protocol/)
- [Ollama API (official)](https://raw.githubusercontent.com/ollama/ollama/main/docs/api.md)
- [Ollama embedding models blog](https://ollama.com/blog/embedding-models)
- [Continue docs: Embed role](https://docs.continue.dev/customize/model-roles/embeddings)
- [Continue docs: Ollama provider](https://docs.continue.dev/customize/model-providers/top-level/ollama)

---
*Feature research for: Remote-capable MCP server for documentation regeneration and QA*
*Researched: 2026-02-23*
