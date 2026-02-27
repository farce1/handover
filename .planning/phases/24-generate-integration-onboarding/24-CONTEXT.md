# Phase 24: Generate Integration & Onboarding - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire Codex subscription auth into `handover generate` so it works end-to-end without an API key, and guide first-time users with no provider configured through interactive provider/auth setup. Scope covers factory wiring, banner/cost output changes, subscription-specific error handling, and first-run onboarding. Does not include new CLI commands, new providers, or auth infrastructure changes.

</domain>

<decisions>
## Implementation Decisions

### Startup banner & run output
- Auth method displayed inline with provider: e.g. "Provider: openai (subscription)" or "Provider: anthropic (api-key)"
- Label only — no extra visual distinction (no icons, colors, or token expiry in banner)
- Per-round progress output is identical for subscription and API key runs
- Final summary shows token counts but replaces dollar cost for subscription runs

### Error & rate-limit messaging
- Subscription 429 errors fail immediately with info: "Rate limited. Try again in Xm Ys." — no auto-wait, no interactive prompt
- Error formatting style is consistent across auth types — only message content differs

### Claude's Discretion
- Missing-auth error format (single line vs box) — pick the clearest presentation
- Mid-generation token expiry handling — decide between silent refresh+continue vs abort based on technical safety
- Error prefix/label strategy — whether to prefix errors with auth type for disambiguation
- Subscription-specific error phrasing

### First-run onboarding flow
- Auto-detect existing env vars (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) and skip setup for providers with detected keys — no confirmation prompt needed
- Entry point, provider selection UX, and auth method presentation are Claude's discretion
- Whether onboarding auto-starts generate or confirms and waits is Claude's discretion

### Cost & usage display
- Final summary: show token counts, replace dollar amount with subscription label (exact wording Claude's discretion)
- Per-round cost column treatment for subscription runs is Claude's discretion (dashes vs hide)
- Whether to surface remaining quota from rate-limit headers is Claude's discretion
- API key cost display may receive minor consistency improvements at Claude's discretion

</decisions>

<specifics>
## Specific Ideas

- Inline auth method in banner mirrors the existing "Provider: openai" pattern — just append the auth method in parentheses
- Subscription 429 should feel like a clear "come back later" message, not a retry loop — the 5-hour rate windows are too long to wait
- Env var auto-detection should feel seamless — if `OPENAI_API_KEY` is set, just use it, don't ask

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 24-generate-integration-onboarding*
*Context gathered: 2026-02-27*
