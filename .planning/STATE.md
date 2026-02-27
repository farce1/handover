# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute - within minutes, not hours.
**Current focus:** v6.0 Codex Auth & Validation — Phase 24: Generate Integration & Onboarding

## Current Position

Milestone: v6.0 Codex Auth & Validation
Phase: 23 of 26 (Codex Auth Commands)
Plan: 02 of 02
Status: Complete
Last activity: 2026-02-27 - completed phase 23 verification after PKCE auth + auth CLI delivery

Progress: [██████████] 100%

## Performance Metrics

**v5.0 Velocity (most recent):**
- Total plans completed: 12
- Total tasks completed: 28
- Average duration: ~3.8 min/plan
- Total execution time: ~45 min
- Timeline: 3 days (2026-02-23 to 2026-02-25)

**v6.0 Velocity:**
- Total plans completed: 7
- Average duration: ~2.6 min/plan
- Total execution time: ~18 min

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
- [Phase 21]: resolveAuth precedence is fixed as CLI flag > env var > credential store (subscription only) > interactive prompt.
- [Phase 21]: HandoverConfigSchema now defaults authMethod to api-key and rejects anthropic+subscription during validation.
- [Phase 21]: validateProviderConfig now performs structural checks only; resolveAuth callers own credential validation.
- [Phase 21]: Auth-dependent runtime paths import resolveAuth from src/auth/index.ts and pass AuthResult into createProvider.
- [Phase 22]: Gemini provider uses `@google/genai` native SDK with `responseSchema` + `responseMimeType: application/json` for structured round outputs.
- [Phase 22]: Gemini auth supports env fallback order `GEMINI_API_KEY` then `GOOGLE_API_KEY` while preserving global precedence order.
- [Phase 22]: Gemini embedding path is fixed at 1536 dimensions (`gemini-embedding-001` + `outputDimensionality`) to maintain existing index compatibility.
- [Phase 23]: PKCE login now runs browser OAuth with localhost callback + headless URL fallback and persists access/refresh/expiry tokens.
- [Phase 23]: Subscription credential refresh is proactive (5-minute buffer) and fail-soft on refresh errors.
- [Phase 23]: `handover auth` command group is wired into CLI with `login <provider>` and `status [--json]`.

### Pending Todos

None.

### Blockers/Concerns

Research flags for planning:
- Phase 24: `refreshCallback` design for mid-generation 401 during streaming needs validation (stream-abandon-and-retry vs mid-stream token swap)
- Phase 24: Single-use refresh token rotation risk in concurrent CLI processes — verify scope against Codex CLI open-source repo before Phase 24

External setup still required (unchanged from v5.0):
- GitHub Sponsors enrollment
- npm trusted publishing OIDC config
- RELEASE_PLEASE_TOKEN repo secret
- CODECOV_TOKEN repo secret

## Session Continuity

Last session: 2026-02-27
Stopped at: Phase 24 context gathered
Resume file: .planning/phases/24-generate-integration-onboarding/24-CONTEXT.md
