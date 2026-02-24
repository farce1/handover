# Phase 19: HTTP Transport Parity - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds optional Streamable HTTP transport for MCP while preserving stdio as the default mode and maintaining equivalent functional behavior for tools, resources, and prompts.

Scope is transport parity only. New security controls and auth policy changes are out of scope for this phase.

</domain>

<decisions>
## Implementation Decisions

### Mode selection behavior
- `handover serve` defaults to stdio when no transport mode is configured.
- HTTP mode can be enabled through config and CLI flags; CLI overrides config for the current run.
- Run one transport per process (no simultaneous stdio + HTTP in a single runtime).
- When HTTP mode is active, startup output should include explicit endpoint summary (transport, base URL, and MCP path).

### HTTP endpoint contract
- Use `/mcp` as the default HTTP MCP endpoint path.
- Keep one canonical configured MCP path (no alias paths).
- Enforce strict parity for MCP response body schemas between stdio and HTTP.
- Communicate endpoint discovery in both startup output and docs.

### Parity strictness rules
- HTTP and stdio must expose the same capability surface (tools, resources, prompts).
- Structured error schema should remain equivalent across transports.
- Ordering and cursor semantics should remain equivalent across transports.
- If parity mismatch is detected, fail with explicit remediation guidance rather than silently diverging.

### Transport error responses
- Unknown HTTP paths should return strict not-found with guidance to the configured MCP path.

### Claude's Discretion
- Select an industry-standard response for HTTP requests when server is running stdio mode, favoring explicit operator/client remediation.
- Choose validation failure contract details for invalid HTTP payloads, aligned with existing structured MCP error conventions.
- Choose terminal execution failure payload detail level in status responses (machine-readable + user guidance) using robust default patterns.

</decisions>

<specifics>
## Specific Ideas

- Prioritize robust, industry-leading defaults over custom behavior.
- Keep responses automation-friendly and deterministic across transports.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 19-http-transport-parity*
*Context gathered: 2026-02-24*
