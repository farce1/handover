---
phase: 24-generate-integration-onboarding
plan: 01
subsystem: auth
tags: [subscription, openai, provider, rate-limit, oauth]
requires:
  - phase: 23-codex-auth-commands
    provides: PKCE login runtime and subscription credential storage/refresh baseline
provides:
  - Subscription-specific missing-credential auth error with login remediation
  - OpenAI-compatible provider subscription mode plumbed from factory
  - Subscription 429 fail-fast error with retry-after duration guidance
  - Subscription 401 handling mapped to session-expired auth guidance
affects: [auth, providers, cli]
tech-stack:
  added: []
  patterns: [subscription-aware provider error mapping, fail-fast subscription rate-limit handling]
key-files:
  created: []
  modified:
    - src/auth/resolve.ts
    - src/auth/resolve.test.ts
    - src/providers/factory.ts
    - src/providers/openai-compat.ts
key-decisions:
  - "Subscription mode must never fall back to generic no-credential errors when stored tokens are absent."
  - "Subscription rate limits should fail fast with provider guidance rather than entering generic retry backoff loops."
patterns-established:
  - "OpenAI-compatible provider receives isSubscription from factory to allow auth-mode-specific runtime behavior."
  - "Subscription authentication failures during completion map to AuthError.sessionExpired for consistent re-login guidance."
requirements-completed: [GEN-01, GEN-04, GEN-05]
duration: 2 min
completed: 2026-02-27
---

# Phase 24 Plan 01: Subscription Provider Auth Handling Summary

**Subscription auth now fails with explicit login/session guidance and avoids generic retry behavior for Codex rate-limit/auth failures.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T17:45:30Z
- **Completed:** 2026-02-27T17:47:25Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `AUTH_SUBSCRIPTION_NOT_LOGGED_IN` in `resolveAuth()` so missing subscription credentials point directly to `handover auth login`.
- Added `isSubscription` plumbing from provider factory into `OpenAICompatibleProvider` constructor.
- Wrapped provider completion path with subscription-specific handling for `RateLimitError` (fail-fast `PROVIDER_SUBSCRIPTION_RATE_LIMITED`) and `AuthenticationError` (`AUTH_SESSION_EXPIRED`).
- Updated auth resolve tests to validate the new subscription-specific no-credential behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Subscription-specific missing-auth error and factory isSubscription plumbing** - `b1811ae` (feat)
2. **Task 2: Subscription 429 fail-fast and 401 session-expired handling in provider** - `fd98b21` (feat)

**Plan metadata:** `pending` (docs)

## Files Created/Modified
- `src/auth/resolve.ts` - adds dedicated subscription no-token error path (`AUTH_SUBSCRIPTION_NOT_LOGGED_IN`).
- `src/auth/resolve.test.ts` - updates assertions to match subscription no-token behavior.
- `src/providers/factory.ts` - forwards `isSubscription` to OpenAI-compatible providers.
- `src/providers/openai-compat.ts` - adds subscription-aware 429/401 handling and retry-after duration formatting helpers.

## Decisions Made
- Use subscription-specific credential errors before TTY/CI fallback checks to keep remediation deterministic.
- Convert subscription 429s into non-retryable `ProviderError` so BaseProvider backoff does not apply.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Authentication Gates
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Provider/auth runtime is now subscription-aware for missing credentials, rate limits, and session expiry.
- Ready for UI/onboarding wiring in subsequent plans.

## Self-Check: PASSED
