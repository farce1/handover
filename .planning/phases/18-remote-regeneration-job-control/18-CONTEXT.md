# Phase 18: Remote Regeneration Job Control - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers remote MCP-triggered documentation regeneration with deterministic job lifecycle behavior. Users can start regeneration, track lifecycle states (`queued`, `running`, `completed`, `failed`), and get single-flight behavior for duplicate requests targeting the same scope.

Out of scope for this phase: new transport modes, auth policy expansion, and unrelated MCP capability additions.

</domain>

<decisions>
## Implementation Decisions

### Trigger response contract
- `regenerate_docs` should return a rich immediate payload: opaque job ID, initial state, target summary, and created timestamp.
- Job references are opaque IDs (no semantic information encoded in the ID string).
- Duplicate-trigger responses should use the same payload shape as new-job responses, with an explicit dedupe indicator.
- Every trigger response should include explicit next-step guidance for clients (how to check status next).

### Target scope rules
- Support named regeneration scopes in this phase (full project plus a fixed set of named targets).
- If the target is unknown, fail with a response that includes valid targets and remediation guidance.
- Target matching should be normalized (trim/case-normalize, alias-friendly) before validation.
- If target is omitted, default to full-project regeneration.

### Job status visibility
- User delegated this area to Claude for implementation decisions.

### Duplicate request semantics
- User delegated this area to Claude for implementation decisions.

### Claude's Discretion
- Decide the status-check interaction model for this phase (job-ID lookup only vs additional recent-job views).
- Decide running-state detail depth in status payloads (state-only vs stage/progress detail).
- Decide failed-job payload shape details (code/reason/remediation composition).
- Decide terminal-state retention duration for status lookups.
- Decide duplicate behavior policy details (join/reject/queue semantics, dedupe signaling, conflict handling, duplicate telemetry in status/history).

</decisions>

<specifics>
## Specific Ideas

- Favor deterministic, automation-friendly behavior in all responses.
- Prefer explicit guidance and remediation over silent fallback behavior.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 18-remote-regeneration-job-control*
*Context gathered: 2026-02-24*
