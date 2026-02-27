---
phase: 23-codex-auth-commands
plan: 01
subsystem: auth
tags: [oauth, pkce, codex, token-refresh, providers]
requires:
  - phase: 21-auth-infrastructure
    provides: Auth types, TokenStore, and resolveAuth baseline
provides:
  - PKCE browser OAuth login with localhost callback handling
  - StoredCredential refresh token support for OAuth lifecycle
  - Proactive subscription token refresh before expiry
  - Provider factory subscription concurrency enforcement
affects: [auth, providers, cli]
tech-stack:
  added: [openid-client, open]
  patterns: [loopback PKCE callback server, background token refresh within auth resolution]
key-files:
  created:
    - src/auth/pkce-login.ts
    - src/auth/pkce-login.test.ts
  modified:
    - package.json
    - package-lock.json
    - src/auth/types.ts
    - src/auth/token-store.ts
    - src/auth/resolve.ts
    - src/providers/factory.ts
key-decisions:
  - "Use openid-client discovery with hard-coded endpoint fallback for resilient Codex OAuth token flows."
  - "Keep refresh failures non-fatal and continue with current token to preserve run continuity when refresh endpoint fails transiently."
patterns-established:
  - "Subscription auth resolves through refreshIfNeeded() before returning credential-store token to runtime call sites."
  - "Provider factory applies authMethod-aware concurrency override so subscription mode always runs at 1."
requirements-completed: [CDX-01, CDX-04, CDX-05]
duration: 4 min
completed: 2026-02-27
---

# Phase 23 Plan 01: Codex OAuth Plumbing Summary

**Codex subscription auth now has end-to-end PKCE login plumbing, persisted refresh token support, proactive refresh logic, and enforced single-concurrency runtime safety.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-27T10:06:00Z
- **Completed:** 2026-02-27T10:09:55Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Added `pkceLogin()` with browser OAuth authorization, localhost callback capture, timeout handling, and secure token persistence.
- Extended auth credential shape/validation to include optional `refreshToken` while preserving backward compatibility.
- Added subscription token proactive refresh in `resolveAuth()` with 5-minute buffer and safe fallback behavior.
- Enforced `concurrency = 1` in provider factory when `authMethod: subscription` for both preset and custom providers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend credential schema and implement PKCE login flow** - `d124981` (feat)
2. **Task 2: Add proactive refresh and subscription concurrency guard** - `802eaec` (feat)

**Plan metadata:** `pending` (docs)

## Files Created/Modified
- `package.json` - adds runtime dependencies for OAuth discovery/PKCE and browser launch.
- `package-lock.json` - locks transitive dependency graph updates.
- `src/auth/types.ts` - adds optional `refreshToken` on `StoredCredential`.
- `src/auth/token-store.ts` - validates optional refresh token semantics.
- `src/auth/pkce-login.ts` - implements Codex PKCE browser login + callback server flow.
- `src/auth/resolve.ts` - adds `refreshIfNeeded()` with five-minute pre-expiry refresh strategy.
- `src/providers/factory.ts` - enforces subscription concurrency override to `1`.
- `src/auth/pkce-login.test.ts` - validates callback flow, timeout, headless mode, and re-auth prompt behavior.
- `src/auth/resolve.test.ts` - validates refresh/no-refresh decision paths.
- `src/providers/factory.test.ts` - validates subscription concurrency override for preset/custom providers.

## Decisions Made
- Chose openid-client as the canonical OAuth primitive for PKCE and refresh grants, with hard-coded endpoint fallback if discovery fails.
- Preserved runtime continuity by warning and using current token when refresh attempt fails, instead of hard-failing before request execution.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Authentication Gates
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth runtime plumbing and subscription safeguards are complete.
- Ready for Plan 23-02 user-facing CLI command surface (`handover auth login` and `handover auth status`).

## Self-Check: PASSED
