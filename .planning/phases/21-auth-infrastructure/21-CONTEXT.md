# Phase 21: Auth Infrastructure - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Shared auth types, token store, and resolution layer that all auth-dependent code imports. This phase builds the foundation — no CLI commands, no OAuth flows, no generate integration. Those are Phases 23-24.

</domain>

<decisions>
## Implementation Decisions

### Config shape
- Auth method is **per-provider**, not global — different providers can have different auth methods
- Claude has flexibility on config structure (nested under provider vs top-level auth block)
- No default provider — config is empty until onboarding (Phase 24) creates it
- Single active provider at a time — no split between generation and embedding providers
- Anthropic does NOT get subscription as a valid authMethod — schema enforces API key only for Anthropic

### Credential storage
- Claude decides storage approach (file-based at ~/.handover/credentials.json with 0600 vs OS keychain)
- Credential store is for subscription tokens only — API keys stay in env vars
- Corrupted/invalid tokens are automatically deleted with a message directing user to re-authenticate
- Single provider credentials at a time — switching providers clears old tokens

### Resolution behavior
- Precedence: CLI `--api-key` flag > env var (e.g., `OPENAI_API_KEY`) > credential store > interactive prompt
- Env var always wins, even if user configured `authMethod: subscription`
- Interactive prompt triggers whenever no auth source resolves (not just first run)
- In non-interactive mode (no TTY / CI), fail with clear human-readable error message listing auth options
- Always log which auth method was used on every run (e.g., "Using OpenAI API key from env")

### Error messages
- Action-oriented tone: "Session expired. Run `handover auth login openai` to re-authenticate."
- Zero-auth error lists ALL setup options (env var, auth login, handover init)
- Colored output: red for errors, yellow for warnings, bold for commands
- Anthropic subscription attempt → not possible in schema; enforced at config validation, not runtime

### Claude's Discretion
- Config structure (nested under provider vs separate auth block)
- Storage mechanism (file vs keychain for v6.0)
- Exact auth type definitions and token store API surface
- Internal module organization within `src/auth/`

</decisions>

<specifics>
## Specific Ideas

- "I want it to be a step in CI when you first invoke the CLI — like in OpenCode" (applies to onboarding in Phase 24, but auth infrastructure must support this flow)
- Auth resolution logging should always be visible — user should know at a glance which auth path fired

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-auth-infrastructure*
*Context gathered: 2026-02-26*
