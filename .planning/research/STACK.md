# Stack Research

**Domain:** v5.0 Remote & Advanced MCP stack additions (brownfield)
**Researched:** 2026-02-23
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@modelcontextprotocol/sdk` | `^1.26.0` (keep) | MCP server runtime for stdio + optional Streamable HTTP | Already integrated and production-ready in v1.x. Supports `StdioServerTransport` and `StreamableHTTPServerTransport` in one SDK, so v5 can stay additive without transport rewrites. |
| Node `http` (`node:http`) | Node `20/22` runtime targets (existing CI) | Host optional HTTP MCP endpoint for remote clients | No new dependency footprint. Keeps transport optional and avoids introducing framework-specific operational complexity for a CLI-first product. |
| `openai` | `^6.22.0` (keep) | Unified embedding client for cloud OpenAI and local OpenAI-compatible endpoints (Ollama `/v1/embeddings`) | Already in repo. Supports configurable `baseURL`, retries, and timeout handling; ideal for RMT-03 without adding another SDK. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | `^3.25.76` (keep) | Validate new config surface (`serve.transport`, `serve.http`, `embedding.provider=ollama`) and MCP tool I/O | Use for all new v5 config/schema contracts so behavior remains consistent with current codebase patterns. |
| `@modelcontextprotocol/inspector` | Latest (dev-only, optional) | Validate Streamable HTTP transport behavior and event flow during development | Use only while implementing/debugging RMT-02 and RMT-04; not required at runtime. |
| Ollama daemon | current stable (external runtime) | Local embedding inference path for offline/private indexing | Use only when user explicitly opts into local embeddings; keep OpenAI embeddings as default path. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Existing `vitest` integration suite | Validate remote tool behavior, transport switching, and stream output contracts | Extend integration coverage; no new testing framework needed. |
| Existing CLI (`commander`) | Expose optional HTTP transport flags/settings | Keep `serve` default as stdio; add opt-in HTTP mode to preserve backward compatibility. |

## Installation

```bash
# Required runtime additions
# None (recommended approach reuses existing dependencies)

# Optional dev tooling for transport debugging
npm install -D @modelcontextprotocol/inspector
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@modelcontextprotocol/sdk@^1.26.0` | Early migration to SDK v2 package split (`@modelcontextprotocol/server`, etc.) | Only if project explicitly schedules a broader migration. v2 is still marked pre-alpha on the main branch docs; unnecessary risk for this milestone. |
| Node `http` + SDK Streamable HTTP transport | Add Express/Hono app layer directly in handover | Only if you need framework middleware beyond MCP needs (complex auth, custom reverse-proxy behavior). For v5 scope, built-in Node HTTP is enough. |
| Reuse `openai` client with `baseURL` for Ollama | Add `ollama` npm client dependency | Only if you need Ollama-specific APIs not exposed via OpenAI-compatible endpoints. For embeddings path, OpenAI-compatible API is sufficient. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Custom JSON-RPC over ad-hoc HTTP/WebSocket | High protocol drift risk; duplicates MCP transport/session logic already solved by SDK | `StreamableHTTPServerTransport` from MCP SDK |
| Always-on HTTP mode replacing stdio | Breaks existing local MCP workflows and increases ops/security surface for users who do not need remote access | Keep stdio default, HTTP as explicit opt-in |
| Adding separate embedding SDKs per provider | Increases maintenance, retry behavior divergence, and config complexity | One embedding adapter built on existing `openai` client + configurable `baseURL` |
| Shelling out `handover generate` from MCP tool | Harder observability/error mapping and weaker type safety | Call `runGenerate`/internal pipeline entrypoints directly with bounded execution lock |

## Stack Patterns by Variant

**If local-first (default users):**
- Keep `handover serve` on stdio (`StdioServerTransport`)
- Keep non-streaming behavior unchanged unless streaming explicitly requested
- Use OpenAI embeddings default path (current behavior)

**If remote-hosted MCP (RMT-02 path):**
- Add optional Streamable HTTP endpoint (`/mcp`) with `StreamableHTTPServerTransport`
- Enforce origin validation + localhost binding by default; require explicit auth config for non-localhost
- Maintain identical tools/resources/prompts registration so business behavior stays transport-agnostic

**If offline/private embeddings (RMT-03 path):**
- Add `embedding.provider: ollama` and `embedding.baseUrl` config
- Route embedding calls to Ollama OpenAI-compatible `/v1/embeddings` via existing `openai` client
- Keep vector schema metadata strict (`model`, dimensions) to prevent mixed-vector-space corruption

**If long-form QA streaming (RMT-04 path):**
- Keep current provider `onToken` callback plumbing as token source
- Emit incremental MCP progress/log messages during QA synthesis
- Return final structured response unchanged for compatibility with non-streaming clients

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@modelcontextprotocol/sdk@1.26.0` | Node `>=18` (package), project CI Node `20/22` | Includes stdio + Streamable HTTP transport classes needed for v5. |
| `openai@6.22.0` | OpenAI API + OpenAI-compatible `baseURL` endpoints (e.g., Ollama) | Enables local embedding endpoint reuse without new SDK. |
| MCP Streamable HTTP spec (2025-06-18) | `@modelcontextprotocol/sdk@1.26.0` transport implementation | Remote mode must respect protocol/session headers and SSE/JSON response behavior. |

## Integration Points with Existing Stack

### RMT-01: Remote regeneration tool

| Existing Component | Integration Point | Why This Fit |
|--------------------|-------------------|--------------|
| `src/mcp/tools.ts` | Register `regenerate_docs` tool | Existing MCP tool registration/error payload patterns are already in place. |
| `src/cli/generate.ts` (`runGenerate`) | Invoke generation pipeline directly | Reuses DAG orchestration, caching, and renderer logic; avoids duplicate generation path. |
| `src/utils/errors.ts` + MCP structured errors | Map generation failures to deterministic tool errors | Keeps remediation quality consistent with current MCP UX. |

### RMT-02: Optional HTTP transport

| Existing Component | Integration Point | Why This Fit |
|--------------------|-------------------|--------------|
| `src/mcp/server.ts` | Extend `startMcpServer()` to support transport mode selection | Today it is stdio-only; this is the natural abstraction seam for transport strategy. |
| `src/cli/serve.ts` | Add transport options/config wiring | Existing serve preflight + hook registration can remain unchanged. |
| Existing resources/tools/prompts registration | Reuse same hooks for both stdio and HTTP | Prevents capability drift between transports. |

### RMT-03: Local embedding provider path

| Existing Component | Integration Point | Why This Fit |
|--------------------|-------------------|--------------|
| `src/config/schema.ts` (`embedding`) | Expand provider enum from `openai` to `openai|ollama` plus `baseUrl` | Keeps provider selection explicit and validated. |
| `src/vector/embedder.ts` | Replace fixed OpenAI URL with provider/baseUrl-aware client call | Single adapter can serve both cloud and local embeddings. |
| `src/vector/types.ts` (`EMBEDDING_MODELS`) | Add local model dimension handling strategy | Prevents vector DB mismatch when switching embedding models/providers. |

### RMT-04: Streaming MCP QA responses

| Existing Component | Integration Point | Why This Fit |
|--------------------|-------------------|--------------|
| `src/qa/answerer.ts` | Thread `onToken` through `provider.complete(...)` in QA path | Provider interface already supports streaming callbacks. |
| `src/mcp/prompts.ts` (or new QA tool) | Emit incremental MCP progress/log updates while QA is running | Preserves grounded QA while improving UX for long answers. |
| MCP transport layer | Stream over stdio or Streamable HTTP SSE depending on selected transport | Same server logic, transport-specific delivery handled by SDK. |

## Explicit Non-Additions for v5.0

1. Do **not** add Redis/queue infra for regeneration in this milestone.
2. Do **not** add WebSocket transport; MCP standard path is stdio + Streamable HTTP.
3. Do **not** introduce a second vector database (keep SQLite + sqlite-vec).
4. Do **not** replace current grounded QA architecture; only add streaming delivery.
5. Do **not** migrate to MCP SDK v2 package split during this milestone.

## Sources

- `https://modelcontextprotocol.io/specification/2025-06-18/basic/transports` — Streamable HTTP and stdio protocol requirements (**HIGH**)
- `https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/progress` — progress notification semantics for long-running operations (**HIGH**)
- `https://github.com/modelcontextprotocol/typescript-sdk` — v1.x recommendation and transport capabilities in official SDK docs/releases (**HIGH**)
- `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/docs/server.md` — v1 server transport guidance and deployment patterns (**HIGH**)
- `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/src/server/streamableHttp.ts` — concrete Streamable HTTP transport implementation details (**HIGH**)
- `https://docs.ollama.com/openai` — OpenAI-compatible endpoint support (`/v1/embeddings`) for local provider path (**HIGH**)
- `https://docs.ollama.com/capabilities/embeddings` — native embedding endpoint behavior and model guidance (**HIGH**)
- `https://github.com/openai/openai-node` — `baseURL` support, streaming, retries/timeouts in JS SDK (**HIGH**)

---
*Stack research for: v5.0 Remote & Advanced MCP additions*
*Researched: 2026-02-23*
