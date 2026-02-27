# Phase 23: Codex Auth Commands - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

PKCE browser OAuth flow and `handover auth` CLI command group for OpenAI Codex subscription authentication. Users can log in via browser, check auth status, and tokens are managed transparently. Generate integration and onboarding are Phase 24.

</domain>

<decisions>
## Implementation Decisions

### OAuth flow experience
- Auto-open the default browser when user runs `handover auth login openai` — no URL printed by default
- Show animated spinner with "Waiting for authentication..." in terminal while waiting for browser callback
- Spin up a temporary localhost HTTP server on a random port to receive the OAuth redirect callback
- Server shuts down after receiving the callback

### CLI output & flags
- `handover auth status` uses a structured table format (columns: Provider, Auth Method, Status, Expires) — similar to `docker context ls`
- No token expiry info in the `handover generate` startup banner — just show `Auth: subscription`; expiry is visible via `auth status` only

### Token refresh visibility
- Token refresh is completely silent — happens in background, user sees no difference during normal operation
- Refresh activity may be visible in debug/verbose logging but never in standard output

### Error handling
- Corrupted or invalid stored credentials: silently delete and prompt user to run `auth login` again (consistent with Phase 21 fail-closed approach)

### Claude's Discretion
- Whether to add `--json` flag to auth commands (based on existing CLI patterns in codebase)
- Whether `handover auth login` takes provider as required argument or prompts interactively when omitted
- Whether `handover auth status` shows all configured providers or just the active one
- Token refresh failure strategy (fail immediately vs try current token first)
- Headless environment fallback (print URL for manual copy vs fail with message)
- Auth timeout duration for browser callback
- 5-minute proactive refresh buffer: fixed or configurable
- Re-auth behavior when valid tokens already exist (confirmation prompt vs silent overwrite)
- Success feedback approach (terminal only vs terminal + browser page)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow patterns established by `gh auth login` and existing handover CLI conventions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 23-codex-auth-commands*
*Context gathered: 2026-02-27*
