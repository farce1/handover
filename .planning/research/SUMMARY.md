# Project Research Summary

**Project:** Handover v5.0 Remote & Advanced MCP
**Domain:** Remote-capable MCP server enhancements for a TypeScript documentation CLI
**Researched:** 2026-02-23
**Confidence:** HIGH

## Executive Summary

Handover v5.0 is an additive milestone that upgrades an existing MCP-first documentation workflow for remote operation, long-running UX, and local embedding flexibility without breaking current local stdio usage. The research is consistent across stack, feature, architecture, and pitfalls: keep the current stable core (`@modelcontextprotocol/sdk` v1.x, Node 20/22, existing `openai` client, SQLite vector path), then layer in optional Streamable HTTP transport, streaming QA progress/cancellation, remote regeneration tooling, and an Ollama-compatible local embedding route.

The recommended implementation strategy is service-first and transport-agnostic: extract reusable generate/QA services, keep MCP registrations semantically identical across stdio and HTTP, and drive long operations through MCP progress/cancellation primitives instead of CLI-style terminal output. This preserves compatibility, reduces duplication, and creates a clean execution seam for both local and hosted usage.

The key risks are not feature novelty but operational correctness and security discipline: JSON-RPC request correlation under concurrent streams, cancellation propagation, origin/auth hardening for HTTP transport, regeneration idempotency, and embedding/index contract drift. The mitigation is to sequence roadmap phases around these dependencies, enforce explicit guardrails (single-flight jobs, fail-fast metadata checks, localhost defaults, per-request auth), and treat remote capabilities as opt-in rather than default behavior.

## Key Findings

### Recommended Stack

Research strongly supports reusing the existing runtime and dependency footprint instead of introducing new frameworks. The milestone can be delivered with current primitives plus small additive modules for services, job control, and transport wiring.

**Core technologies:**
- `@modelcontextprotocol/sdk@^1.26.0`: MCP runtime with stdio + Streamable HTTP in one SDK; avoids protocol rewrites.
- Node `node:http` on Node 20/22: optional HTTP endpoint hosting with no new web framework dependency.
- `openai@^6.22.0`: single embedding client for OpenAI cloud and OpenAI-compatible local endpoints via `baseURL`.
- `zod@^3.25.76`: strict validation for new config and tool contracts.
- Ollama runtime (optional): local/private embedding path when explicitly configured.

**Critical version requirements:**
- Stay on MCP SDK v1.x for v5 scope; defer v2 package-split migration.
- Preserve CI/runtime targets on Node 20/22.
- Implement MCP Streamable HTTP behavior per 2025-06-18 spec semantics.

### Expected Features

v5.0 P1 scope is clear: all four RMT tracks (RMT-01..RMT-04) are table stakes for this milestone definition, with security baseline and vector guardrails included as non-negotiable acceptance criteria.

**Must have (table stakes):**
- RMT-04 streaming QA with progress notifications and cancellation handling.
- RMT-01 remote-capable regeneration as a safe, status-aware MCP tool.
- RMT-02 optional Streamable HTTP transport while keeping stdio default.
- HTTP security baseline (Origin validation, localhost-safe defaults, auth-ready hooks).
- RMT-03 local embedding provider path (Ollama-class) plus dimension/index validation.
- Transport parity for existing tools/resources/prompts across stdio and HTTP.

**Should have (competitive):**
- Resumable regeneration stream UX for dropped remote sessions.
- Strong user-trust guardrails for mutating tools (confirmation + operation-level policy).
- Backward-compatible behavior across evolving MCP client expectations.

**Defer (v2+/later):**
- Multi-tenant hosted control plane.
- Schedule-based auto-regeneration daemon.
- Advanced queue orchestration for high parallelism.

### Architecture Approach

The recommended architecture is to keep `mcp/` protocol-focused, add `services/` as the business-logic seam, and isolate transport selection to server bootstrap. That yields a single behavior model for CLI and MCP while enabling remote-safe execution.

**Major components:**
1. `src/services/generate-service.ts` and `src/services/qa-service.ts` — shared execution core for CLI + MCP.
2. `src/mcp/job-runner.ts` — long-running job orchestration with progress, cancellation, and concurrency controls.
3. `src/mcp/transports/http.ts` + `src/mcp/server.ts` — transport adapter boundary (stdio/http) with consistent registrations.
4. `src/vector/embedder.ts` + `src/vector/embedding-router.ts` + config schema updates — provider routing and embedding contract enforcement.

### Critical Pitfalls

1. **Streaming without real cancellation/progress control** — propagate cancel end-to-end, emit bounded progress, enforce max runtime.
2. **JSON-RPC/SSE correlation errors under concurrency** — maintain authoritative request lifecycle mapping by JSON-RPC `id` and protocol-mode tests.
3. **HTTP transport exposed without rebinding/origin/auth safeguards** — localhost defaults, strict `Origin` policy, auth required for remote access.
4. **Remote regeneration races and non-idempotent runs** — queue + single-flight dedupe + deterministic job status model.
5. **Embedding/index contract drift and silent local->remote fallback** — persist model/dimension metadata, fail fast on mismatch, explicit locality policy modes.

## Implications for Roadmap

Based on cross-document dependencies and risk concentration, use a five-phase structure:

### Phase 1: Service Foundation and Execution Seams
**Rationale:** Every remote feature depends on CLI-independent services and structured execution.
**Delivers:** `generate-service` and `qa-service`; MCP handlers call services, not CLI command paths.
**Addresses:** Prerequisite for RMT-01 and RMT-04.
**Avoids:** CLI stdout/protocol leakage and duplicated logic drift.

### Phase 2: Streaming QA Core (RMT-04)
**Rationale:** Highest priority milestone feature and enables shared progress/cancel primitives.
**Delivers:** Token/progress notifications, cancellation propagation, bounded stream behavior with stable final response contract.
**Addresses:** RMT-04 table-stakes requirement.
**Avoids:** Runaway generation, stuck UX, and orphaned remote compute.

### Phase 3: Local Embedding Provider + Contract Guardrails (RMT-03)
**Rationale:** Medium build complexity with high safety impact; unblock offline/private workflows early.
**Delivers:** `openai|ollama` provider routing, base URL support, model/dimension metadata validation, explicit reindex-on-mismatch path.
**Addresses:** RMT-03 plus embedding/index validation requirements.
**Avoids:** Mixed-vector corruption and privacy-breaking implicit fallback.

### Phase 4: Remote Regeneration Tooling (RMT-01)
**Rationale:** Depends on services and benefits from existing progress/cancel infrastructure.
**Delivers:** `regenerate_docs` with queued/single-flight execution, idempotent semantics, structured status lifecycle.
**Addresses:** RMT-01 table-stakes requirement.
**Avoids:** Race conditions, duplicate runs, stale docs/index divergence.

### Phase 5: Optional HTTP Transport + Security Hardening (RMT-02)
**Rationale:** Introduce remote surface after behavior is stable; security-critical and protocol-sensitive.
**Delivers:** Streamable HTTP endpoint with stdio parity, origin checks, localhost defaults, auth hooks, protocol negotiation correctness.
**Addresses:** RMT-02 plus remote security baseline and transport parity requirements.
**Avoids:** Rebinding exposure, session/auth confusion, and request-correlation breakage.

### Phase Ordering Rationale

- Shared services first reduce rework and keep transport changes additive.
- Streaming primitives before regeneration let both long-running flows share tested progress/cancel mechanisms.
- Embedding safety before broad remote rollout prevents difficult-to-debug retrieval regressions.
- HTTP transport last contains security blast radius until tool semantics are stable.

### Research Flags

Phases likely needing deeper `/gsd-research-phase` work:
- **Phase 5 (HTTP transport/security):** highest protocol and security nuance (Origin, auth lifecycle, session handling, SSE/JSON mode interplay).
- **Phase 4 (remote regeneration job semantics):** idempotency and queue behavior need concrete policy choices for retries/deduping.

Phases with standard patterns (can likely skip extra research):
- **Phase 1 (service extraction):** straightforward internal refactor pattern.
- **Phase 2 (MCP progress/cancel wiring):** strongly specified by MCP docs and SDK patterns.
- **Phase 3 (embedding provider routing):** well-documented OpenAI-compatible endpoint strategy with clear validation rules.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Strong official-source alignment (MCP spec/SDK, OpenAI client behavior, Ollama compatibility docs). |
| Features | HIGH | Feature priorities are explicit, internally consistent, and mapped to milestone RMT requirements. |
| Architecture | HIGH | Internal integration seams are concrete; only remote hardening specifics remain implementation-sensitive. |
| Pitfalls | HIGH | Risks are specific, actionable, and tightly mapped to phases with verification criteria. |

**Overall confidence:** HIGH

### Gaps to Address

- **Remote auth model finalization:** choose concrete auth mechanism for non-localhost HTTP deployments during phase planning.
- **Resumability scope boundary:** decide whether resumable regeneration streams stay post-v5 validation or are pulled into late v5.x.
- **Concurrency policy defaults:** set explicit per-session/global in-flight limits for hosted scenarios.
- **Embedding locality policy UX:** define exact config semantics (`local-only`, `local-preferred`, `remote-only`) and failure messaging.

## Sources

### Primary (HIGH confidence)
- MCP Specification 2025-06-18 (transports, progress, cancellation, lifecycle, tools, authorization, security best practices)
- MCP TypeScript SDK docs and repository (`v1.x` server/protocol guidance)
- OpenAI Node SDK documentation (`baseURL`, retries, timeout, compatibility behavior)
- Ollama official docs (`/api/embed`, OpenAI-compatible `/v1/embeddings`)
- Internal code and milestone context (`.planning/PROJECT.md`, `src/mcp/*`, `src/cli/*`, `src/vector/*`, `src/qa/*`)

### Secondary (MEDIUM confidence)
- Competitor pattern references: Anthropic Claude Code MCP docs, Cloudflare Agents MCP docs, Continue embedding guidance.

### Tertiary (LOW confidence)
- None required for core roadmap decisions.

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
