---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: Codex Auth & Validation
status: milestone_complete
last_updated: "2026-02-28T18:05:10.046Z"
progress:
  total_phases: 15
  completed_phases: 15
  total_plans: 36
  completed_plans: 36
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute - within minutes, not hours.
**Current focus:** Planning next milestone (v7.0 draft goals captured in PROJECT.md)

## Current Position

Milestone: v6.0 Codex Auth & Validation
Phase: None (milestone archived)
Plan: None
Status: Milestone complete
Last activity: 2026-02-28 - archived v6.0 milestone artifacts and prepared next milestone handoff

Progress: [██████████] 100%

## Performance Metrics

**v5.0 Velocity (most recent):**
- Total plans completed: 12
- Total tasks completed: 28
- Average duration: ~3.8 min/plan
- Total execution time: ~45 min
- Timeline: 3 days (2026-02-23 to 2026-02-25)

**v6.0 Velocity:**
- Total plans completed: 13
- Average duration: ~8.5 min/plan (includes human validation checkpoints)
- Total execution time: ~110 min

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
- [Phase 24]: Subscription mode now throws AUTH_SUBSCRIPTION_NOT_LOGGED_IN before generic no-credential fallback. — Ensures users get direct handover auth login remediation instead of api-key guidance in subscription mode.
- [Phase 24]: Subscription 429 and 401 responses are mapped to fail-fast ProviderError/AuthError handling in OpenAICompatibleProvider. — Avoids generic retry loops for subscription rate-limits and gives explicit session-expired re-auth guidance.
- [Phase 24]: DisplayState now carries authMethod and isSubscription so renderers can present auth-mode-aware output. — Keeps auth display/cost behavior centralized and backward-compatible via optional fields.
- [Phase 24]: Subscription runs suppress dollar cost lines and show subscription credits across TTY and CI renderers. — Avoids misleading dollar amounts when billing is subscription-based while preserving token/performance visibility.
- [Phase 24]: Onboarding now runs before loadConfig only for interactive first-run sessions (TTY + non-CI + no config/env). — Allows generate to consume newly written .handover.yml immediately while preserving non-interactive automation behavior.
- [Phase 24]: Onboarding provider flow differentiates continuation behavior: subscription/ollama continue immediately, API-key flows stop after export guidance. — Prevents confusing auth failures and keeps UX aligned with each provider's credential mechanism.
- [Phase 25]: CI now enforces npm publish safety by failing on `credentials.json` or `.handover/` paths in `npm pack --dry-run` output.
- [Phase 25]: Auth resolution regression tests assert sensitive env/CLI/subscription values never appear in logger output.
- [Phase 25]: Provider setup docs now explicitly state Anthropic is API key only and does not support OAuth/subscription auth.
- [Phase 26]: Runtime validation is executed through two requirement-mapped runbooks (CLI + MCP) with scenario-level PASS/FAIL/SKIP gates.
- [Phase 26]: Manual checkpoint approval is captured by updating runbook scenario result markers and treated as phase verification evidence.
- [Phase 26]: All deferred runtime requirements VAL-01 through VAL-06 are now marked complete in REQUIREMENTS.md traceability.
- [Milestone v6.0]: Closed via proceed-anyway path with known requirements bookkeeping drift (`AUTH-01` through `AUTH-04`) captured in MILESTONES.md.

### Pending Todos

None.

### Blockers/Concerns

None.

External setup still required (unchanged from v5.0):
- GitHub Sponsors enrollment
- npm trusted publishing OIDC config
- RELEASE_PLEASE_TOKEN repo secret
- CODECOV_TOKEN repo secret

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed v6.0 milestone archival and release tagging
Resume file: $gsd-new-milestone
