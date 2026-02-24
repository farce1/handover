# Phase 19: HTTP Transport Parity - Research

**Researched:** 2026-02-24
**Domain:** MCP Streamable HTTP transport, Express middleware, transport mode selection
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Mode selection behavior
- `handover serve` defaults to stdio when no transport mode is configured.
- HTTP mode can be enabled through config and CLI flags; CLI overrides config for the current run.
- Run one transport per process (no simultaneous stdio + HTTP in a single runtime).
- When HTTP mode is active, startup output should include explicit endpoint summary (transport, base URL, and MCP path).

#### HTTP endpoint contract
- Use `/mcp` as the default HTTP MCP endpoint path.
- Keep one canonical configured MCP path (no alias paths).
- Enforce strict parity for MCP response body schemas between stdio and HTTP.
- Communicate endpoint discovery in both startup output and docs.

#### Parity strictness rules
- HTTP and stdio must expose the same capability surface (tools, resources, prompts).
- Structured error schema should remain equivalent across transports.
- Ordering and cursor semantics should remain equivalent across transports.
- If parity mismatch is detected, fail with explicit remediation guidance rather than silently diverging.

#### Transport error responses
- Unknown HTTP paths should return strict not-found with guidance to the configured MCP path.

### Claude's Discretion
- Select an industry-standard response for HTTP requests when server is running stdio mode, favoring explicit operator/client remediation.
- Choose validation failure contract details for invalid HTTP payloads, aligned with existing structured MCP error conventions.
- Choose terminal execution failure payload detail level in status responses (machine-readable + user guidance) using robust default patterns.

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 19 adds optional Streamable HTTP transport to `handover serve` while preserving stdio as the default. The MCP TypeScript SDK (v1.26.0 — already installed) ships `StreamableHTTPServerTransport` and `createMcpExpressApp` out of the box. Express 5.2.1 is a direct SDK dependency and is already present in `node_modules`. No new production dependencies are required.

The existing codebase has a clean separation between transport wiring (`src/mcp/server.ts`), tool/resource/prompt registration (`src/mcp/tools.ts`, `resources.ts`, `prompts.ts`), and CLI startup (`src/cli/serve.ts`). The `McpServer` instance is constructed via `createMcpServer` which accepts `registerHooks`. The only change in the serve path is how the transport is selected and started — the entire tool/resource/prompt layer remains unchanged.

Config extension is straightforward: add a `serve` block to `HandoverConfigSchema` (Zod) with `transport`, `http.port`, and `http.host` fields. The CLI `serve` command needs `--transport` and `--port` flags added via Commander. The existing config precedence system (CLI > env > file > defaults) handles the override semantics naturally.

**Primary recommendation:** Implement transport selection as a thin `startMcpHttpServer` function alongside the existing `startMcpServer`, sharing the same `McpServer` instance created by `createMcpServer`. Keep the tool/resource/prompt registration layer untouched.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.26.0 (installed) | `StreamableHTTPServerTransport`, `createMcpExpressApp` | Already a project dependency; SDK bundles both |
| `express` | 5.2.1 (transitive, installed) | HTTP server for MCP endpoint | SDK direct dependency — already in node_modules |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:http` | built-in | `http.createServer` wrapping Express | When binding to a port; Express app is passed to http.createServer |
| `node:crypto` | built-in | `randomUUID()` for session IDs | Stateful mode transport (not required for stateless) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Express (`createMcpExpressApp`) | Raw `node:http` | Raw http works but requires manual JSON body parsing and DNS rebinding middleware — SDK's Express helper handles both automatically |
| Stateless transport | Stateful (session IDs) | Stateless is simpler, deterministic per-request, avoids session memory leaks; stateful adds resumability for long-lived SSE clients |

**Installation:** No new packages needed. Everything is already in `node_modules` via the SDK.

---

## Architecture Patterns

### Recommended Project Structure Changes

```
src/
├── mcp/
│   └── server.ts          # Add startMcpHttpServer() alongside existing startMcpServer()
├── config/
│   └── schema.ts          # Add serve.transport, serve.http.port, serve.http.host fields
└── cli/
    └── index.ts           # Add --transport, --port flags to 'serve' command
    └── serve.ts           # Add transport-mode branching logic
```

### Pattern 1: Transport selection at startup boundary

**What:** The CLI `runServe()` reads the resolved transport mode from config+CLI flags, then calls either `startMcpServer` (stdio path, unchanged) or `startMcpHttpServer` (new HTTP path). The `McpServer` instance and all registration hooks are identical between both paths.

**When to use:** Always — this is the correct separation of concerns for one-transport-per-process.

**Example (current stdio path — `src/mcp/server.ts`):**

```typescript
// Source: /src/mcp/server.ts (existing)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export async function startMcpServer(options: CreateMcpServerOptions = {}): Promise<void> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

**Example (new HTTP path — to be added to `src/mcp/server.ts`):**

```typescript
// Source: SDK docs https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { createServer } from 'node:http';

export interface StartMcpHttpServerOptions extends CreateMcpServerOptions {
  port?: number;
  host?: string;
  mcpPath?: string;
}

export async function startMcpHttpServer(options: StartMcpHttpServerOptions = {}): Promise<void> {
  const server = createMcpServer(options);
  const app = createMcpExpressApp({ host: options.host ?? '127.0.0.1' });
  const mcpPath = options.mcpPath ?? '/mcp';

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,  // stateless: simpler, no session memory leaks
  });

  await server.connect(transport);

  app.post(mcpPath, async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });

  app.get(mcpPath, async (req, res) => {
    await transport.handleRequest(req, res);
  });

  app.delete(mcpPath, async (req, res) => {
    await transport.handleRequest(req, res);
  });

  // Unknown paths: strict 404 with remediation
  app.use((_req, res) => {
    res.status(404).json({
      ok: false,
      error: {
        code: 'MCP_HTTP_NOT_FOUND',
        message: 'Path not found.',
        action: `Send MCP requests to ${mcpPath}.`,
      },
    });
  });

  await new Promise<void>((resolve, reject) => {
    const httpServer = createServer(app);
    httpServer.listen(options.port ?? 3000, options.host ?? '127.0.0.1', resolve);
    httpServer.on('error', reject);
  });
}
```

### Pattern 2: Config schema extension

**What:** Add an optional `serve` block to `HandoverConfigSchema`. Transport defaults to `'stdio'`. HTTP sub-block holds port and host defaults.

**When to use:** All transport-mode decisions go through config merge — this gives CLI flag override for free via the existing precedence system.

```typescript
// Source: src/config/schema.ts (new addition to HandoverConfigSchema)
const ServeConfigSchema = z
  .object({
    transport: z.enum(['stdio', 'http']).default('stdio'),
    http: z
      .object({
        port: z.number().int().min(1).max(65535).default(3000),
        host: z.string().default('127.0.0.1'),
        path: z.string().regex(/^\//).default('/mcp'),
      })
      .default({}),
  })
  .default({});
```

### Pattern 3: CLI flag override

**What:** Add `--transport` and `--port` (and optionally `--host`) to the `serve` Commander command. These get merged into `cliOverrides` before `loadConfig()` — matching the existing pattern in `runGenerate`.

**When to use:** Per-run override without changing `.handover.yml`.

```typescript
// Source: src/cli/index.ts (extended serve command)
program
  .command('serve')
  .description('Start MCP server (stdio default, or HTTP with --transport http)')
  .option('--transport <transport>', 'Transport mode: stdio (default) or http')
  .option('--port <port>', 'HTTP port (default: 3000)', Number.parseInt)
  .option('--host <host>', 'HTTP host (default: 127.0.0.1)')
  .action(async (opts) => {
    const { runServe } = await import('./serve.js');
    await runServe(opts);
  });
```

### Pattern 4: Stateless vs stateful transport

**What:** `sessionIdGenerator: undefined` = stateless mode. Each POST is handled independently. No session state in memory.

**Why stateless for this phase:** The existing MCP tool layer (QA sessions, regeneration jobs) manages all state internally (in `sessionManager`, `regenerationManager`). There is no need for transport-level session tracking. Stateless avoids memory leaks and is the correct default for tools-as-services.

**Stateful is for:** Long-lived SSE reconnection use cases, which are out of scope for this phase.

### Pattern 5: stdio mode detection — HTTP request response

**What (Claude's Discretion):** When `handover serve` is running in stdio mode and an HTTP request arrives, the correct industry standard is `503 Service Unavailable` with a JSON body explaining the transport mismatch and directing the operator to restart with `--transport http`. This follows the RFC 7231 definition of 503 ("server is currently unable to handle the request") and is automation-friendly.

**This requires:** A small HTTP listener that returns 503 only when stdio mode is active and something is polling the default port. However, the simpler and more correct approach is: when in stdio mode, do NOT start any HTTP listener at all. If an HTTP client connects to a random process that happens to own that port, that is a port conflict, not a server responsibility. The explicit startup message to stderr is the operator signal.

**Recommendation:** Do not start an HTTP listener in stdio mode. The startup stderr message is the correct remediation surface. This avoids port conflicts and is consistent with "one transport per process."

### Pattern 6: Invalid HTTP payload response

**What (Claude's Discretion):** When a POST to `/mcp` contains an invalid JSON-RPC payload (malformed JSON, missing required fields), align with the existing structured MCP error convention in `src/mcp/errors.ts`. The SDK already returns `400` with `{ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error: Invalid JSON' }, id: null }` for invalid JSON. For invalid MCP message structure, it returns `-32600 Invalid Request`.

**Recommendation:** Accept the SDK's built-in handling. Do not add a custom validation layer for HTTP payloads — the transport handles it correctly and the error codes are standard JSON-RPC.

### Anti-Patterns to Avoid

- **Double-transport per process:** Starting both `StdioServerTransport` and `StreamableHTTPServerTransport` on the same `McpServer`. The SDK does not support this and it violates the locked decision.
- **Reusing a stateless transport across requests:** `StreamableHTTPServerTransport` with `sessionIdGenerator: undefined` throws if reused. The transport must be instantiated once and reused only with stateful mode, OR a new transport must be created per request (stateless). The correct approach for this phase is a single stateless transport instance shared across requests — this is valid because the stateless guard only fires if `handleRequest` is called on an already-completed stateless transport.
- **Writing transport startup status to stdout:** In HTTP mode, startup messages must go to stderr (same as stdio mode). The HTTP server listens on a port; stdout is not the protocol channel. This is already handled by `writeToStderr` in `serve.ts`.
- **Alias paths for `/mcp`:** The locked decision prohibits alias paths. Only register one route, not `/mcp` + `/api/mcp` + `/v1/mcp`.
- **Skipping `req.body` pass-through:** `createMcpExpressApp` includes `express.json()` middleware which pre-parses the body. Pass `req.body` as the third argument to `transport.handleRequest()` to avoid double-reading the stream.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON body parsing for POST | Custom `raw-body` + `JSON.parse` pipeline | `createMcpExpressApp` (includes `express.json()`) | SDK helper adds correct content-type negotiation and handles double-read protection |
| DNS rebinding protection | Custom host header validation | `createMcpExpressApp({ host: '127.0.0.1' })` | SDK applies `localhostHostValidation()` automatically for localhost-bound servers |
| SSE streaming for GET | Custom SSE writer | `StreamableHTTPServerTransport.handleRequest` | Transport handles GET SSE, POST JSON-RPC, DELETE session lifecycle per MCP spec |
| JSON-RPC error codes | Custom `-32xxx` error factory | SDK built-in (400/405/415/406 with correct JSON-RPC codes) | Transport already implements MCP Streamable HTTP spec error contracts exactly |
| Session ID generation | Custom UUID | `randomUUID()` from `node:crypto` | Available in Node.js 14.17+ (project requires >=18.0.0) |

**Key insight:** The SDK's `StreamableHTTPServerTransport` implements the full MCP Streamable HTTP spec (POST, GET SSE, DELETE, method not allowed). The only application code required is: route wiring, port binding, unknown-path 404 handler, and transport mode selection.

---

## Common Pitfalls

### Pitfall 1: Stateless transport reuse guard

**What goes wrong:** Calling `transport.handleRequest()` on a stateless transport (`sessionIdGenerator: undefined`) more than once throws: `"Stateless transport cannot be reused across requests. Create a new transport per request."`.

**Why it happens:** The SDK enforces that stateless transports are single-use to prevent message ID collisions between concurrent clients.

**How to avoid:** For stateless mode, create one transport instance and connect it once — the `McpServer` handles the request routing. The `_hasHandledRequest` flag is set after the first `handleRequest` call on the underlying `WebStandardStreamableHTTPServerTransport`. Since this phase uses a single `McpServer` connection with a single transport, the stateless guard will only fire if the same transport object is reused after it has processed a request AND a new request comes in before the server restarts. The recommended implementation is to instantiate the transport once at server startup and leave it connected — the SDK's internal state machine handles concurrent POST requests safely in this configuration.

**Warning signs:** TypeScript compile error if `sessionIdGenerator` is omitted (it defaults to `undefined` but being explicit is clearer); runtime error `"Stateless transport cannot be reused"` if the transport is erroneously instantiated per-request in stateless mode.

### Pitfall 2: Missing GET and DELETE route handlers

**What goes wrong:** Only registering `app.post('/mcp', ...)` without `app.get` and `app.delete` handlers causes Express to return HTML 404 pages for SSE subscription attempts and session close requests, breaking MCP client reconnection and graceful shutdown.

**Why it happens:** The MCP Streamable HTTP spec defines three verbs: POST (JSON-RPC), GET (SSE subscription for server-to-client notifications), DELETE (session close). The SDK transport handles all three via `transport.handleRequest(req, res)`.

**How to avoid:** Register all three verb handlers pointing to the same `transport.handleRequest` call. The transport dispatches internally by method.

**Warning signs:** MCP clients that open SSE subscriptions (e.g., Claude Desktop in HTTP mode) silently disconnect immediately; GET returns 404 from Express default handler.

### Pitfall 3: Import paths under NodeNext moduleResolution

**What goes wrong:** Importing `StreamableHTTPServerTransport` from `'@modelcontextprotocol/sdk'` (barrel) or `'@modelcontextprotocol/sdk/server'` fails at TypeScript compile time. The SDK only exports `./server` (the server index) which does NOT re-export the HTTP transport classes.

**Why it happens:** The SDK uses explicit sub-path exports. The wildcard export `"./*": {"import": "./dist/esm/*"}` is what enables sub-path imports. Under `"moduleResolution": "NodeNext"`, explicit `.js` extensions are required.

**How to avoid:**
```typescript
// CORRECT imports for this project (NodeNext + ESM):
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
// These resolve via the ./* wildcard: ./dist/esm/server/streamableHttp.js
```

**Warning signs:** TypeScript error `Module '"@modelcontextprotocol/sdk/server"' has no exported member 'StreamableHTTPServerTransport'`.

### Pitfall 4: TypeScript types for Express 5 (no @types/express needed)

**What goes wrong:** Adding `@types/express` as a devDependency for Express 5 may install the wrong version (the DefinitelyTyped package targets Express 4). Express 5 has a different API surface and the type mismatch can cause subtle issues.

**Why it happens:** `@types/express` on npm corresponds to Express v4. Express 5 does not yet have a published `@types/express@5` package.

**How to avoid:** Do NOT install `@types/express`. The `express` sub-path import from `@modelcontextprotocol/sdk/server/express.js` returns a typed `Express` instance from the SDK's type declarations (which already depend on `express`). The SDK itself pulls in Express as a direct dependency with its own type resolution. The project's `"skipLibCheck": true` in tsconfig handles any residual type declaration conflicts.

**Warning signs:** If `@types/express` is added, TypeScript may show `Express` type conflicts between the two packages.

### Pitfall 5: stdout contamination in HTTP mode

**What goes wrong:** Writing the HTTP startup summary to `process.stdout` instead of `process.stderr` corrupts any pipe that might be consuming stdout for JSON-RPC protocol frames.

**Why it happens:** In stdio mode, stdout is the MCP wire. In HTTP mode, stdout is unused but should still be treated as clean. The existing `writeToStderr` pattern in `serve.ts` is the correct approach.

**How to avoid:** All operational log lines (startup summary, endpoint info, errors) use `process.stderr.write(...)`. The `writeToStderr` helper already exists in `serve.ts`.

**Warning signs:** CI tests that capture stdout see unexpected log output; MCP stdio clients occasionally receive corrupted frames if the same binary is tested across modes.

---

## Code Examples

Verified patterns from official sources:

### Stateless HTTP transport — minimal working pattern

```typescript
// Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from 'node:http';

const server = new McpServer({ name: 'handover', version: '0.1.0' });
const app = createMcpExpressApp({ host: '127.0.0.1' }); // enables DNS rebinding protection
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

await server.connect(transport);

app.post('/mcp', async (req, res) => {
  await transport.handleRequest(req, res, req.body); // req.body pre-parsed by createMcpExpressApp
});
app.get('/mcp', async (req, res) => {
  await transport.handleRequest(req, res);
});
app.delete('/mcp', async (req, res) => {
  await transport.handleRequest(req, res);
});

createServer(app).listen(3000, '127.0.0.1');
```

### Config schema addition — `serve` block

```typescript
// Source: pattern inferred from existing HandoverConfigSchema in src/config/schema.ts
const ServeConfigSchema = z
  .object({
    transport: z.enum(['stdio', 'http']).default('stdio'),
    http: z
      .object({
        port: z.number().int().min(1).max(65535).default(3000),
        host: z.string().default('127.0.0.1'),
        path: z.string().regex(/^\//).default('/mcp'),
      })
      .default({}),
  })
  .default({});

// Added inside HandoverConfigSchema:
// serve: ServeConfigSchema,
```

### Unknown-path 404 handler

```typescript
// Source: pattern consistent with existing McpStructuredError schema in src/mcp/errors.ts
app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    error: {
      code: 'MCP_HTTP_NOT_FOUND',
      message: 'Unknown HTTP path.',
      action: `MCP requests must target ${mcpPath}. No alias paths are supported.`,
    },
  });
});
```

### Startup summary to stderr (HTTP mode)

```typescript
// Source: pattern from existing writeToStderr in src/cli/serve.ts
writeToStderr(`MCP server listening over HTTP.`);
writeToStderr(`Transport: http`);
writeToStderr(`Base URL: http://${host}:${port}`);
writeToStderr(`MCP path: ${mcpPath}`);
writeToStderr(`Endpoint: http://${host}:${port}${mcpPath}`);
writeToStderr('Ready: POST/GET/DELETE requests accepted at MCP endpoint.');
```

### CLI serve command with transport flags

```typescript
// Source: pattern from existing Commander usage in src/cli/index.ts
program
  .command('serve')
  .description('Start MCP server over stdio (default) or HTTP transport')
  .option('--transport <transport>', 'Transport mode: stdio (default) or http')
  .option('--port <port>', 'HTTP listen port (default: 3000)', Number.parseInt)
  .option('--host <host>', 'HTTP listen host (default: 127.0.0.1)')
  .action(async (opts) => {
    const { runServe } = await import('./serve.js');
    await runServe(opts);
  });
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SSE+POST (deprecated transport) | Streamable HTTP (POST+GET+DELETE) | MCP spec 2025-03-26 | This phase implements the current spec; do not use the old `@modelcontextprotocol/sdk/server/sse.js` |
| `StreamableHTTPServerTransport` (v1 SDK) | `NodeStreamableHTTPServerTransport` (v2 SDK) | SDK v2 migration | Project is on v1 SDK (1.26.0); use `StreamableHTTPServerTransport` from `sdk/server/streamableHttp.js`. Do NOT use v2 import paths (`@modelcontextprotocol/node`) — v2 is not installed |
| Auth in transport options | External middleware (SDK v1.26 deprecates `allowedHosts` on transport) | SDK 1.26 | Use `createMcpExpressApp({ host })` for DNS rebinding protection; auth is out of scope for this phase |

**Deprecated/outdated:**
- `@modelcontextprotocol/sdk/server/sse.js`: Old SSE transport. Do not use. The MCP spec deprecated SSE-only transport in favor of Streamable HTTP.
- `transport.allowedHosts` / `transport.allowedOrigins`: Deprecated transport options. Use `createMcpExpressApp` instead.

---

## Open Questions

1. **Stateless transport reuse with concurrent requests**
   - What we know: `WebStandardStreamableHTTPServerTransport` sets `_hasHandledRequest = true` after the first call. The guard message says "create a new transport per request."
   - What's unclear: Does this guard fire for concurrent requests on the same stateless transport, or only for sequential reuse after a transport has closed? The constructor guard only protects against sequential reuse. Concurrent POST requests may be safe because the transport doesn't track per-request completion — only that `handleRequest` was ever called.
   - Recommendation: Test with two concurrent POST requests in a unit/integration test. If the guard fires for concurrent requests, switch to a stateful transport with `sessionIdGenerator: () => randomUUID()` which is designed for concurrent multi-client scenarios.

2. **Port conflict behavior in stdio mode**
   - What we know: The decision is one transport per process, no HTTP listener in stdio mode.
   - What's unclear: Should `handover serve` (stdio mode) emit a warning if the configured HTTP port is in use by another process? Or silently ignore it?
   - Recommendation: In stdio mode, do not bind any port and do not check for port conflicts. The startup stderr message describes the active transport; operators who try to HTTP-connect will see connection refused, which is the correct behavior.

3. **`@types/express` requirement for TypeScript compilation**
   - What we know: Express 5 is installed via the SDK. No `@types/express` is installed. The SDK's `express.d.ts` imports `{ Express }` from `express`.
   - What's unclear: Whether `tsc` can resolve the `Express` type from the SDK's declaration without `@types/express` installed project-level.
   - Recommendation: Run `npm run typecheck` after implementing. If types fail to resolve, install `@types/express@^5` (not `@types/express` which is v4). This is verifiable in minutes.

---

## Sources

### Primary (HIGH confidence)

- `/Users/impera/Documents/GitHub/handover/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/streamableHttp.d.ts` — `StreamableHTTPServerTransport` class, `handleRequest` signature, stateless/stateful modes, session guard behavior
- `/Users/impera/Documents/GitHub/handover/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/webStandardStreamableHttp.d.ts` — `WebStandardStreamableHTTPServerTransportOptions` full interface, `EventStore`, all configuration options
- `/Users/impera/Documents/GitHub/handover/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/webStandardStreamableHttp.js` — Runtime HTTP status codes (405, 415, 406, 404, 400, 409), `handleUnsupportedRequest` implementation
- `/Users/impera/Documents/GitHub/handover/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/express.d.ts` — `createMcpExpressApp` options, DNS rebinding behavior
- `/Users/impera/Documents/GitHub/handover/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/express.js` — Express app construction, `localhostHostValidation` automatic application
- `/Users/impera/Documents/GitHub/handover/node_modules/@modelcontextprotocol/sdk/package.json` — Version `1.26.0`, dependencies (Express 5.2.1, @hono/node-server), export map confirming `./server/*` wildcard
- `/Users/impera/Documents/GitHub/handover/src/mcp/server.ts` — Current `createMcpServer` / `startMcpServer` pattern
- `/Users/impera/Documents/GitHub/handover/src/cli/serve.ts` — Current `runServe` implementation, `writeToStderr` pattern
- `/Users/impera/Documents/GitHub/handover/src/config/schema.ts` — `HandoverConfigSchema` structure for extension
- `/Users/impera/Documents/GitHub/handover/tsconfig.json` — `"moduleResolution": "NodeNext"` confirming `.js` extension requirement

### Secondary (MEDIUM confidence)

- Context7 `/modelcontextprotocol/typescript-sdk` — SDK docs for Streamable HTTP stateless/stateful patterns, migration guide confirming v1 vs v2 class names, Express integration patterns

### Tertiary (LOW confidence)

- None — all claims verified against installed SDK source.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed installed at exact versions; no new dependencies needed
- Architecture: HIGH — transport separation, config extension, and CLI flag patterns all follow established project conventions; code paths verified in source
- Pitfalls: HIGH — verified against SDK runtime source code for stateless guard, error codes, and import paths; one open question (concurrent request behavior) flagged for test-time validation

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (SDK version stable; re-verify if `@modelcontextprotocol/sdk` is upgraded past 1.x)
