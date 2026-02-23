# Pitfalls Research

**Domain:** v5.0 Remote and Advanced MCP for an existing TypeScript CLI and MCP server
**Researched:** 2026-02-23
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Streaming QA Without Cancellation and Progress Control

**What goes wrong:**
Long-running QA streams keep generating after users move on, creating duplicate work, stalled UX, and provider cost spikes.

**Why it happens:**
Teams implement token streaming but skip MCP `notifications/cancelled` and progress semantics, assuming transport disconnect equals cancel.

**How to avoid:**
- Implement MCP cancellation handling end-to-end for streamed QA requests.
- Treat disconnect as transport failure, not business-level cancel.
- Emit periodic MCP progress notifications for long tool calls.
- Enforce request max timeout even when progress arrives.

**Warning signs:**
- CPU/API usage remains high after client closes stream.
- Users see delayed or duplicate final answers.
- Server logs show continued generation for abandoned request IDs.

**Phase to address:**
RMT-04 (streaming MCP QA responses)

---

### Pitfall 2: Broken JSON-RPC Correlation Across SSE and JSON Modes

**What goes wrong:**
Responses get attached to the wrong request, streams close early, or clients hang waiting for a response that never arrives.

**Why it happens:**
When adding optional HTTP transport, implementation mixes request/notification/response handling and does not preserve strict JSON-RPC ID correlation under concurrent streams.

**How to avoid:**
- Guarantee one authoritative request lifecycle map keyed by JSON-RPC `id`.
- In Streamable HTTP mode, keep SSE stream open until the response for the originating request is sent.
- In JSON-response mode, explicitly return 405 for GET SSE attempts.
- Add protocol tests for concurrent streamed requests and out-of-order event delivery.

**Warning signs:**
- Intermittent client timeouts despite server completing work.
- "Unknown request id" or orphaned-response logs.
- Reproducible failures only under concurrent tool calls.

**Phase to address:**
RMT-04 first, then harden in RMT-02

---

### Pitfall 3: HTTP Transport Enabled Without Rebinding and Origin Protections

**What goes wrong:**
Local/hosted MCP endpoint is reachable from malicious web origins, enabling DNS rebinding or unauthorized browser-mediated tool calls.

**Why it happens:**
Teams expose HTTP quickly for remote use and skip mandatory header validation and host binding controls.

**How to avoid:**
- Validate `Origin` on all Streamable HTTP requests.
- Bind local defaults to `127.0.0.1`/`localhost`, not `0.0.0.0`.
- Require auth for all remote HTTP MCP connections.
- Add explicit allowed-host allowlist when binding to public interfaces.

**Warning signs:**
- Endpoint works from unrelated browser tabs/sites.
- Server started with `0.0.0.0` and no auth in non-dev mode.
- Security scans detect permissive host/origin policy.

**Phase to address:**
RMT-02 (optional HTTP transport)

---

### Pitfall 4: Session IDs Treated as Authentication

**What goes wrong:**
Any caller holding or guessing a session ID can act as another client session, inject events, or resume streams incorrectly.

**Why it happens:**
MCP session lifecycle is confused with auth lifecycle; session identifiers are used as trust proof instead of request-scoped auth checks.

**How to avoid:**
- Keep auth and session concerns separate; authorize every inbound request.
- Generate cryptographically strong, non-deterministic session IDs.
- Bind session state to authenticated principal, not session ID alone.
- Expire and rotate sessions; handle HTTP 404 session expiry by re-init.

**Warning signs:**
- Successful requests with only `Mcp-Session-Id` and no auth checks.
- Session IDs visible in logs and reused across identities.
- Multi-node deployments show cross-user event leakage.

**Phase to address:**
RMT-02

---

### Pitfall 5: Remote Regeneration Tool Is Non-Idempotent and Unbounded

**What goes wrong:**
Multiple remote `generate` triggers overlap, causing race conditions in output docs, stale index state, or prolonged lock contention.

**Why it happens:**
RMT-01 is implemented as a direct shell-style execution path without job control, dedupe keys, or per-request guardrails.

**How to avoid:**
- Make regeneration a queued job with single-flight deduplication.
- Define idempotency behavior (same request key returns existing in-flight/completed job).
- Return structured job status and progress; avoid blocking tool calls indefinitely.
- Enforce max runtime, cancellation hooks, and clear error states.

**Warning signs:**
- Two quick regenerate calls produce inconsistent outputs.
- Persistent `cache`/index mismatch after remote trigger.
- "Works locally, flakes remotely" reports tied to parallel invocations.

**Phase to address:**
RMT-01 (with streaming progress surfaced in RMT-04)

---

### Pitfall 6: Remote Tool Surface Lacks High-Risk Confirmation and Scope Guardrails

**What goes wrong:**
The model can invoke destructive/expensive tools (like full regeneration) without explicit user acknowledgment, causing surprise cost and trust failures.

**Why it happens:**
Tool security guidance is treated as UI-only concern; server accepts any authenticated tool call without operation-level policy.

**How to avoid:**
- Mark high-impact tools with explicit confirmation policy in client UX.
- Enforce server-side permission checks by operation, not only connection-level auth.
- Rate-limit and audit high-cost tool invocations.
- Fail closed on unknown/malformed arguments.

**Warning signs:**
- Unexpected regeneration events in logs.
- Users report actions they did not intend to authorize.
- Tool call volume spikes from automated prompt loops.

**Phase to address:**
RMT-01 and RMT-02

---

### Pitfall 7: Local Embedding Path Drifts From Index Contract

**What goes wrong:**
Search quality collapses or indexing fails after switching to local embeddings because vector dimensions/model behavior no longer match existing index assumptions.

**Why it happens:**
RMT-03 adds Ollama path but omits strict embedding metadata validation and migration rules when model/dimensions change.

**How to avoid:**
- Persist embedding provider, model, dimensions, and truncate policy as index metadata.
- Fail fast when metadata differs; require explicit reindex.
- Use `/api/embed` (current endpoint) and treat `/api/embeddings` as legacy.
- Validate multi-input embedding output shape before write.

**Warning signs:**
- Sudden drop in semantic retrieval relevance after provider switch.
- Mixed-dimension errors or silent empty-result retrieval.
- Index works only after manual DB wipe/rebuild.

**Phase to address:**
RMT-03

---

### Pitfall 8: Local Embedding Fallback Leaks Privacy and Breaks Offline Promise

**What goes wrong:**
When local model is missing/unloaded, system silently falls back to remote provider, violating offline expectations and potentially leaking sensitive docs.

**Why it happens:**
Fallback logic prioritizes "always succeed" over explicit data locality policy.

**How to avoid:**
- Add explicit `embeddingMode` policy (`local-only`, `local-preferred`, `remote-only`).
- In `local-only`, fail with actionable remediation (pull model, start service).
- Surface endpoint/model identity in logs and status output.
- Add preflight checks for Ollama reachability and model availability.

**Warning signs:**
- Network egress during supposedly offline indexing.
- Different retrieval quality between runs with same corpus.
- Users discover cloud usage only from billing/traffic logs.

**Phase to address:**
RMT-03

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Implement streaming as plain text chunks outside MCP notifications | Fast demo output | Protocol drift, client incompatibility, brittle parsing | Never |
| Add HTTP transport without auth because "internal network only" | Faster rollout | Security incidents, blocked enterprise adoption | Never |
| Treat remote regeneration as synchronous tool call | Simpler implementation | Timeouts, retries causing duplicate runs, poor UX | MVP demo only, not release |
| Auto-fallback from local embeddings to remote without explicit policy | Fewer immediate failures | Privacy violations, non-deterministic behavior | Never |
| Reuse one timeout for all operations | Easy config | Either premature aborts or runaway long jobs | Only in early prototype |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MCP Streamable HTTP | Missing `MCP-Protocol-Version` on subsequent HTTP requests | Send negotiated protocol header on all post-init requests |
| MCP Streamable HTTP | Assuming GET SSE is always available | Support both: SSE GET when enabled, or 405 in JSON-only mode |
| MCP Sessions | Using session ID as auth credential | Authenticate every request and treat session as state cursor only |
| Ollama embeddings | Using deprecated `/api/embeddings` path in new code | Use `/api/embed` and support list input + dimensions contract |
| Remote regenerate tool | No idempotency key / dedupe key | Queue and dedupe jobs; return status handle |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Streaming token event on every tiny delta without rate control | High CPU, chatty logs, jittery UX | Coalesce output updates and throttle progress notifications | Noticeable at >20 concurrent streams |
| Full regeneration triggered for minor remote actions | Long queue times, wasted compute | Detect no-op state, incremental regenerate/reindex paths | Obvious beyond medium repos |
| HTTP transport with no backpressure strategy | Memory growth during long responses | Bound buffers and enforce per-session in-flight limits | Reproducible under parallel remote clients |
| Local embedding model cold-start on each request | First query latency spikes | Preflight warm model and tune `keep_alive` | Painful for interactive remote workflows |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No Origin validation on HTTP MCP | DNS rebinding and browser-driven abuse | Validate Origin and restrict allowed hosts |
| Exposing remote regenerate without operation-level authorization | Unauthorized expensive/critical actions | Enforce per-tool authz and confirmation flows |
| Logging session IDs, tokens, or full tool arguments | Credential and data leakage | Redact sensitive headers/arguments in logs |
| Trusting tool annotations from untrusted servers/clients | Policy bypass via spoofed metadata | Treat annotations as untrusted hints, enforce server policy |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Streaming appears frozen for long operations | Users cancel healthy jobs | Send periodic progress and heartbeat updates |
| Regeneration returns immediately with no status | Users cannot tell if action succeeded | Return job ID + status endpoint + completion notification |
| Transport mode is implicit | Hard-to-debug client/server mismatch | Surface active transport and protocol version in diagnostics |
| Local embedding errors are low-level socket text | Users cannot self-recover | Show actionable remediation (`ollama pull ...`, start service, reindex) |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **RMT-04 Streaming QA:** Stream works on happy path, but cancellation race handling untested — verify cancel during active generation and ignore late responses.
- [ ] **RMT-04 Streaming QA:** Progress is emitted, but token/progress flood control missing — verify bounded notification rate.
- [ ] **RMT-02 HTTP transport:** Endpoint responds, but Origin/Host validation absent — verify rebinding protections in local and hosted modes.
- [ ] **RMT-02 HTTP transport:** Sessions work single-node, but resume/reconnect behavior fails in multi-node — verify deterministic session handling.
- [ ] **RMT-01 Remote regenerate:** Tool triggers generate, but concurrent triggers conflict — verify queueing and idempotency behavior.
- [ ] **RMT-03 Local embeddings:** Ollama path works, but metadata mismatch does not force reindex — verify fail-fast and remediation path.
- [ ] **RMT-03 Local embeddings:** Offline mode documented, but hidden remote fallback still enabled — verify explicit policy and egress tests.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Streaming jobs continue after client cancel | MEDIUM | Add cancellation propagation; terminate provider call; add regression test for cancel-mid-stream |
| HTTP transport exposed insecurely | HIGH | Disable remote endpoint, patch Origin/host/auth checks, rotate credentials, audit access logs |
| Remote regenerate race corruption | MEDIUM | Stop concurrent jobs, rebuild generated docs and index, deploy queue + single-flight guard |
| Embedding/index contract mismatch | MEDIUM | Persist new metadata schema, force full reindex, block mixed-dimension writes |
| Silent local->remote fallback leakage | HIGH | Disable fallback by policy, notify users, rotate/clean logs if sensitive text may have egressed |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Streaming without cancellation/progress control | RMT-04 | Cancel active stream; assert no post-cancel generation or late answer rendering |
| JSON-RPC correlation errors across SSE/JSON | RMT-04 + RMT-02 | Run concurrent streamed calls; verify every response maps to correct request ID |
| HTTP transport without rebinding/origin protection | RMT-02 | Security test: cross-origin request rejected; localhost binding defaults confirmed |
| Session IDs treated as auth | RMT-02 | Requests with valid session but invalid auth are rejected |
| Non-idempotent/unbounded remote regenerate | RMT-01 | Fire duplicate trigger requests; confirm dedupe and stable final artifacts |
| Missing high-risk tool guardrails | RMT-01 + RMT-02 | Verify permission checks and confirmation flow for regeneration tool |
| Local embedding/index contract drift | RMT-03 | Change embedding model; verify fail-fast and explicit reindex requirement |
| Silent local embedding fallback | RMT-03 | In local-only mode with offline network, verify hard failure and no outbound calls |

## Sources

- MCP Specification (2025-06-18): Transports — https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP Specification (2025-06-18): Lifecycle — https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- MCP Specification (2025-06-18): Cancellation — https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/cancellation
- MCP Specification (2025-06-18): Progress — https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/progress
- MCP Specification (2025-06-18): Tools — https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP Specification (2025-06-18): Pagination — https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/pagination
- MCP Specification (latest): Security Best Practices — https://modelcontextprotocol.io/specification/latest/basic/security_best_practices
- MCP TypeScript SDK Server Guide (main, fetched 2026-02-23) — https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/server.md
- Ollama API (main, fetched 2026-02-23) — https://raw.githubusercontent.com/ollama/ollama/main/docs/api.md

---
*Pitfalls research for: v5.0 Remote and Advanced MCP (RMT-01..RMT-04)*
*Researched: 2026-02-23*
