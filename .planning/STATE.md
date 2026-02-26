# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute - within minutes, not hours.
**Current focus:** v6.0 Codex Auth & Validation — Phase 21: Auth Infrastructure

## Current Position

Milestone: v6.0 Codex Auth & Validation
Phase: 21 of 26 (Auth Infrastructure)
Plan: 02 of 02
Status: In progress
Last activity: 2026-02-26 — completed 21-01 auth types + token store foundation

Progress: [█████░░░░░] 50%

## Performance Metrics

**v5.0 Velocity (most recent):**
- Total plans completed: 12
- Total tasks completed: 28
- Average duration: ~3.8 min/plan
- Total execution time: ~45 min
- Timeline: 3 days (2026-02-23 to 2026-02-25)

**v6.0 Velocity:**
- Total plans completed: 1
- Average duration: ~2 min/plan
- Total execution time: ~2 min

## Accumulated Context

### Decisions

Key decisions from research locked for v6.0:
- Anthropic = API key only, permanently (ToS enforcement active since Jan 9, 2026; server-side blocked)
- Codex OAuth uses PKCE browser flow; `@openai/codex-sdk` or `openid-client` for implementation
- Credential storage: `~/.handover/credentials.json` at 0600 permissions (file baseline); OS keychain deferred to v7.0
- Auth resolution order: CLI flag > env var > credential store > interactive prompt
- Concurrency = 1 enforced in factory for subscription auth (subscription rate limits are message-weighted, not token-rate)
- Proactive token refresh: 5-minute buffer before each LLM round to prevent mid-run expiry
- Gemini provider is independent of auth work; can proceed in parallel or after Phase 21
- Phase 22 (Gemini) depends on Phase 21 foundation for config schema consistency
- [Phase 21]: AuthError.noCredential now always lists env export, auth login, and handover init remediation paths.
- [Phase 21]: TokenStore enforces chmod(0o600) after every write so existing credential files remain restricted.
- [Phase 21]: Credential reads are fail-closed: invalid payloads are deleted and treated as unauthenticated.

### Pending Todos

None.

### Blockers/Concerns

Research flags for planning:
- Phase 23: `@openai/codex-sdk` exact API surface needs a 30-minute spike before implementation (method signatures for OAuth login not confirmed)
- Phase 24: `refreshCallback` design for mid-generation 401 during streaming needs validation (stream-abandon-and-retry vs mid-stream token swap)
- Phase 24: Single-use refresh token rotation risk in concurrent CLI processes — verify scope against Codex CLI open-source repo before Phase 24

External setup still required (unchanged from v5.0):
- GitHub Sponsors enrollment
- npm trusted publishing OIDC config
- RELEASE_PLEASE_TOKEN repo secret
- CODECOV_TOKEN repo secret

## Session Continuity

Last session: 2026-02-26
Stopped at: Completed 21-01-PLAN.md
Resume file: .planning/phases/21-auth-infrastructure/21-02-PLAN.md
