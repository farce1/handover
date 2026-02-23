# Architecture Research

**Domain:** Handover v5.0 Remote and Advanced MCP integration
**Researched:** 2026-02-23
**Confidence:** HIGH for internal integration points, MEDIUM for remote transport hardening specifics

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                              Client Entry Layer                              │
├───────────────────────────────────────────────────────────────────────────────┤
│  handover generate   handover reindex/search   handover serve               │
│                                                         │                    │
│                                                         ├── stdio transport  │
│                                                         └── HTTP transport   │
├───────────────────────────────────────────────────────────────────────────────┤
│                            MCP Application Layer                             │
├───────────────────────────────────────────────────────────────────────────────┤
│  Resources (docs/analysis)   Tools (search, regenerate)   Prompts (QA flow) │
│                   │                     │                         │           │
│                   └───────────────┬─────┴──────────────┬──────────┘           │
│                                   │                    │                      │
│                          QA + Search Services      Generate Service           │
├───────────────────────────────────────────────────────────────────────────────┤
│                           Data + Provider Layer                              │
├───────────────────────────────────────────────────────────────────────────────┤
│  Vector query-engine   embedder providers   DAG orchestrator + renderers     │
│         │                      │                      │                       │
│         └────────────── .handover/search.db ◄────────┴── output markdown     │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `src/cli/serve.ts` | Boot MCP runtime and wire registrations | Load config, preflight, start MCP server |
| `src/mcp/server.ts` | Server and transport lifecycle | `McpServer` + transport adapter(s) |
| `src/mcp/tools.ts` | Action surface for MCP clients | Tool handlers with strict input validation |
| `src/mcp/prompts.ts` | Guided QA workflows over indexed docs | Prompt orchestration around `answerQuestion()` |
| `src/qa/answerer.ts` | Retrieval + synthesis logic | `searchDocuments()` + provider completion |
| `src/vector/*` | Chunk, embed, index, query | sqlite-vec + embedding provider abstraction |
| `src/cli/generate.ts` | Canonical doc regeneration pipeline | DAG static analysis -> rounds -> rendering |

## Recommended Project Structure

```
src/
├── mcp/                         # MCP protocol layer (transports + registrations)
│   ├── server.ts                # START HERE: transport-agnostic server bootstrap
│   ├── tools.ts                 # semantic_search + new remote regeneration tools
│   ├── prompts.ts               # workflow prompts; add streaming-aware QA prompt path
│   ├── resources.ts             # docs + analyzer resource exposure
│   ├── preflight.ts             # serve safety checks before startup
│   ├── workflow-checkpoints.ts  # persisted prompt checkpoints
│   └── job-runner.ts            # NEW: long-running MCP tool execution + progress
├── services/                    # NEW: reusable app services decoupled from CLI I/O
│   ├── generate-service.ts      # wraps runGenerate pipeline for programmatic use
│   └── qa-service.ts            # wraps answerQuestion with streaming callbacks
├── vector/                      # indexing/search foundation reused by MCP + CLI
│   ├── reindex.ts
│   ├── query-engine.ts
│   ├── embedder.ts
│   └── vector-store.ts
├── providers/                   # LLM + embedding provider implementations
└── cli/                         # command adapters only (argument parsing + UX)
```

### Structure Rationale

- **`mcp/` stays protocol-only:** register capabilities, validate payloads, map errors; no DAG orchestration logic here.
- **`services/` is the key v5 seam:** remote MCP and local CLI share the same generation/QA business logic.
- **`cli/` remains a thin adapter:** avoid coupling long-running UX behavior (spinners/stdout) to MCP execution paths.

## Architectural Patterns

### Pattern 1: Service Extraction for Remote-Safe Execution

**What:** Move "do the work" logic out of CLI handlers into service modules. CLI and MCP both call services.
**When to use:** RMT-01 (remote regeneration) and RMT-04 (streaming QA) where CLI assumptions break MCP constraints.
**Trade-offs:** Slight module churn now, significantly lower duplication/rework later.

**Example:**
```typescript
// Pseudocode shape
// cli/generate.ts -> services/generate-service.ts
// mcp/tools.ts (regenerate_docs) -> services/generate-service.ts
```

### Pattern 2: Transport Adapter Boundary

**What:** Keep MCP registrations transport-agnostic; transport implementation selected at bootstrap (stdio or HTTP).
**When to use:** RMT-02 optional HTTP transport.
**Trade-offs:** One extra abstraction layer, but avoids branching logic spread across all tools/prompts.

**Example:**
```typescript
type McpTransportMode = 'stdio' | 'http';
startMcpServer({ mode, registerHooks });
```

### Pattern 3: Progress/Streaming via MCP Notifications

**What:** For long operations, emit progress notifications tied to request metadata rather than printing output.
**When to use:** RMT-04 streaming QA and RMT-01 regeneration progress.
**Trade-offs:** Requires cooperative client support; fallback remains final non-streamed result payload.

**Example:**
```typescript
if (extra._meta?.progressToken !== undefined) {
  await extra.sendNotification({
    method: 'notifications/progress',
    params: { progressToken: extra._meta.progressToken, progress, total, message },
  });
}
```

## Data Flow

### Request Flow

```
[MCP client tool/prompt call]
    ↓
[mcp/tools.ts or mcp/prompts.ts handler]
    ↓
[service layer (qa-service / generate-service)]
    ↓
[vector + provider + DAG subsystems]
    ↓
[structured MCP response (+ optional progress notifications)]
```

### State Management

```
[Disk-backed state]
    ↓
(.handover/output markdown, .handover/search.db, workflow checkpoints)
    ↓
[Stateless MCP handlers + short-lived per-request job state]
    ↓
[Client-visible progress/result]
```

### Key Data Flows

1. **RMT-04 streaming QA flow:** prompt/tool request -> retrieval (`query-engine`) -> provider synthesis with token/progress callbacks -> MCP progress notifications -> final cited answer.
2. **RMT-01 remote regenerate flow:** tool request -> generate service launches DAG pipeline -> progress events mapped to MCP notifications -> docs rewritten + optional reindex -> completion payload.
3. **RMT-03 local embedding flow:** query/reindex path -> embedding provider router -> OpenAI (`/v1/embeddings`) or local Ollama (`/api/embed` or `/v1/embeddings`) -> vector store operations.
4. **RMT-02 HTTP flow:** HTTP POST/GET at single MCP endpoint -> same tool/prompt handlers as stdio -> optional SSE response stream for long-running calls.

## Integration Points

### New Components

| Component | Integration Pattern | Notes |
|---------|---------------------|-------|
| `src/services/generate-service.ts` | Shared domain service called by CLI + MCP | Prevents reusing CLI renderer/logging in MCP context |
| `src/services/qa-service.ts` | Shared QA orchestration with callback hooks | Enables streaming and non-streaming from same core |
| `src/mcp/job-runner.ts` | Long-running task coordinator for tools | Handles progress, cancellation, and concurrency guard |
| `src/mcp/transports/http.ts` | HTTP adapter around MCP server | Optional transport selected by config/flags |
| `src/vector/embedding-router.ts` | Embedding backend selection | Routes OpenAI vs local provider without changing callers |

### Modified Existing Components

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `src/cli/serve.ts` <-> `src/mcp/server.ts` | Direct function call | Add transport mode/host/port and security defaults |
| `src/mcp/tools.ts` <-> `src/cli/generate.ts` | Replace direct CLI invocation with service call | Avoid stdout contamination and terminal renderer assumptions |
| `src/mcp/prompts.ts` <-> `src/qa/answerer.ts` | Add streaming callback contract | Keep existing final response format backward-compatible |
| `src/vector/embedder.ts` <-> `src/config/schema.ts` | Config-driven provider routing | Extend embedding config beyond current OpenAI-only enum |
| `src/mcp/resources.ts` <-> analysis execution | Keep lazy read-only behavior | Do not broaden to mutating actions |

## Build Order (Dependency-Aware for RMT-01..RMT-04)

1. **Foundation extraction (prerequisite, no feature flag):** introduce `generate-service` and `qa-service`, keep CLI behavior unchanged.
   - Why first: every target feature needs CLI-independent execution paths.
2. **RMT-04 streaming MCP QA (priority target):** add progress/token streaming in QA prompt/tool handlers using MCP notifications.
   - Depends on: qa service callback seam.
3. **RMT-03 local embedding provider path:** add embedding router + config extensions + Ollama path.
   - Depends on: minimal config/schema updates; unblocks offline QA/search/reindex for remote deployments.
4. **RMT-01 remote regeneration tool:** add `regenerate_docs` MCP tool with guarded job runner (single active run, progress, cancellation).
   - Depends on: generate service + (recommended) progress framework from RMT-04.
5. **RMT-02 optional HTTP transport:** add transport adapter and secure defaults (Origin validation, localhost bind default, auth hook).
   - Depends on: stable tool/prompt/resource handlers and service boundaries from steps 1-4.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Calling CLI handlers directly from MCP tools

**What people do:** invoke `runGenerate()` inside tool handlers.
**Why it's wrong:** CLI code is terminal-UX oriented and may write stdout; MCP stdio requires protocol-only stdout.
**Do this instead:** call service modules that return structured events/results.

### Anti-Pattern 2: Baking transport conditionals into every tool

**What people do:** `if (http) { ... } else { ... }` inside each registration.
**Why it's wrong:** multiplies complexity and drifts behavior between transports.
**Do this instead:** single transport adapter boundary in server bootstrap.

### Anti-Pattern 3: Hard-switching embeddings without dimension validation

**What people do:** swap embedding model/provider against existing DB.
**Why it's wrong:** vector dimension mismatch corrupts search behavior.
**Do this instead:** enforce embedding model+dimension metadata checks and require reindex on mismatch.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Local/team (stdio, single user) | Current process model is sufficient; prefer stdio by default |
| Hosted small remote (HTTP, tens of sessions) | Add per-session limits, request timeouts, tool concurrency caps |
| Larger remote deployment | Externalize job state and queue; avoid in-process long-run task contention |

### Scaling Priorities

1. **First bottleneck:** long-running regeneration requests blocking process; mitigate via job runner and concurrency caps.
2. **Second bottleneck:** provider/embedding latency and retries; mitigate via progress notifications + cancellation propagation.

## Sources

- Internal codebase: `src/cli/serve.ts`, `src/mcp/server.ts`, `src/mcp/tools.ts`, `src/mcp/prompts.ts`, `src/qa/answerer.ts`, `src/vector/embedder.ts`, `src/vector/reindex.ts`, `src/config/schema.ts`.
- Project context: `.planning/PROJECT.md` (v5 milestone goals and priority ordering).
- MCP spec transports (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18/basic/transports (HTTP + SSE behavior and security requirements).
- MCP tools spec (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18/server/tools.
- MCP TypeScript SDK protocol docs (`v1.x`): https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/docs/protocol.md (progress notifications and cancellation).
- MCP TypeScript SDK server docs (`v1.x`): https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/docs/server.md (stdio vs Streamable HTTP patterns).
- Ollama API docs: https://raw.githubusercontent.com/ollama/ollama/main/docs/api.md (`/api/embed`).
- Ollama OpenAI compatibility: https://docs.ollama.com/openai (`/v1/embeddings`).

---
*Architecture research for: Handover v5.0 Remote and Advanced MCP*
*Researched: 2026-02-23*
