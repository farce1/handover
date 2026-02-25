# Phase 20: HTTP Security and Access Controls - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Enforce origin, bind, and authentication guardrails for HTTP MCP endpoints so non-local deployments are protected by default. This phase adds security layers on top of the Streamable HTTP transport delivered in Phase 19. New MCP tools, resources, or transport modes are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Origin policy
- CORS allowlist configured via `serve.http.allowedOrigins` in config
- Default when unset: deny all cross-origin requests (same-origin only)
- Support explicit origin strings (e.g., `https://example.com`) — no wildcard `*` by default
- Wildcard `*` available as explicit opt-in for development, with a logged warning
- Rejected origins receive structured JSON error with remediation guidance listing the config field to update

### Bind defaults
- Default bind address: `127.0.0.1` (localhost only) — safe by default
- Binding to `0.0.0.0` or non-loopback addresses requires explicit config or CLI flag
- When binding to non-loopback: emit a startup warning noting the endpoint is network-accessible
- No interactive confirmation — keep CI/pipeline-safe, warnings only

### Authentication model
- Bearer token authentication via `serve.http.auth.token` in config or `HANDOVER_AUTH_TOKEN` env var
- Auth is required for non-localhost bind addresses; optional (but recommended) for localhost
- If non-localhost bind is active and no auth is configured: refuse to start with remediation message
- Standard `Authorization: Bearer <token>` header validation
- No hook-based or plugin auth in this phase — keep the model simple and auditable

### Rejection responses
- All security rejections use structured JSON matching existing MCP error patterns (code/message/action)
- Origin rejection: 403 with allowed-origins config hint
- Auth failure: 401 with "provide Authorization: Bearer header" guidance
- Missing auth on non-localhost: startup refusal (not a runtime response)
- Remediation messages reference the specific config field or env var to set

### Claude's Discretion
- Exact CORS header implementation details (preflight handling, allowed methods/headers)
- Timing-safe token comparison approach
- Log verbosity levels for security events
- Config validation ordering (bind check before auth check, or combined)

</decisions>

<specifics>
## Specific Ideas

- Follow the existing structured error/remediation pattern established in Phases 18-19 (code/message/action payloads)
- Security defaults should be "safe by default, opt-out for development" — never the reverse
- Keep the auth model simple enough that a single env var is sufficient for basic deployments

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-http-security-and-access-controls*
*Context gathered: 2026-02-25*
