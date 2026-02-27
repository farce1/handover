---
phase: 24-generate-integration-onboarding
verified: 2026-02-27T17:54:30Z
status: passed
score: 8/8 must-haves verified
---

# Phase 24: Generate Integration & Onboarding Verification Report

**Phase Goal:** Users can run `handover generate` with Codex subscription auth and are guided through provider setup on first run.
**Verified:** 2026-02-27T17:54:30Z
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Subscription mode with no stored credential throws dedicated login guidance error | ✓ VERIFIED | `AUTH_SUBSCRIPTION_NOT_LOGGED_IN` in `src/auth/resolve.ts:151`; guidance text in `src/auth/resolve.ts:150`; assertion coverage in `src/auth/resolve.test.ts` |
| 2 | Provider factory passes subscription mode into OpenAI-compatible runtime | ✓ VERIFIED | `isSubscription` computed and forwarded in `src/providers/factory.ts:87` through `src/providers/factory.ts:150` |
| 3 | Subscription 429s fail fast with rate-limit window guidance and do not use generic retry loop | ✓ VERIFIED | `PROVIDER_SUBSCRIPTION_RATE_LIMITED` mapping in `src/providers/openai-compat.ts:224` through `src/providers/openai-compat.ts:232`; retry-after parser/formatter in `src/providers/openai-compat.ts:13` through `src/providers/openai-compat.ts:55` |
| 4 | Subscription 401s map to session-expired auth remediation | ✓ VERIFIED | `AuthError.sessionExpired(...)` path in `src/providers/openai-compat.ts:235` through `src/providers/openai-compat.ts:236` |
| 5 | Banner output includes auth method and subscription runs show `subscription credits` (TTY + CI) | ✓ VERIFIED | Banner label in `src/ui/components.ts:31` through `src/ui/components.ts:32` and `src/ui/ci-renderer.ts:34` through `src/ui/ci-renderer.ts:36`; completion label in `src/ui/components.ts:351` through `src/ui/components.ts:352` and `src/ui/ci-renderer.ts:134` through `src/ui/ci-renderer.ts:135` |
| 6 | Subscription runs suppress per-round and total dollar display paths | ✓ VERIFIED | Round/total gating in `src/ui/components.ts:212`, `src/ui/components.ts:284`, `src/ui/components.ts:289`, `src/ui/components.ts:366`; CI gating in `src/ui/ci-renderer.ts:94`, `src/ui/ci-renderer.ts:132` |
| 7 | First-run onboarding wizard exists with required provider options and subscription PKCE path | ✓ VERIFIED | `runOnboarding()` in `src/cli/onboarding.ts:34`; provider options and hints in `src/cli/onboarding.ts:40` through `src/cli/onboarding.ts:63`; PKCE login path in `src/cli/onboarding.ts:96` |
| 8 | Generate command invokes onboarding only for interactive first-run context and wires auth metadata into DisplayState | ✓ VERIFIED | Gate + invocation in `src/cli/generate.ts:111` through `src/cli/generate.ts:113`; display auth fields in `src/cli/generate.ts:158` through `src/cli/generate.ts:159` |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/auth/resolve.ts` | subscription missing-auth guidance | ✓ VERIFIED | Throws `AUTH_SUBSCRIPTION_NOT_LOGGED_IN` with `handover auth login` remediation |
| `src/providers/openai-compat.ts` | subscription 429/401 handling | ✓ VERIFIED | Adds fail-fast 429 provider error and session-expired 401 mapping |
| `src/providers/factory.ts` | `isSubscription` constructor plumbing | ✓ VERIFIED | Passes auth mode to both custom and preset OpenAI-compatible provider creation |
| `src/ui/types.ts` | `authMethod` + `isSubscription` fields | ✓ VERIFIED | DisplayState carries auth metadata for renderers |
| `src/ui/components.ts` | auth-aware banner and cost suppression logic | ✓ VERIFIED | Includes auth label and subscription cost gating |
| `src/ui/ci-renderer.ts` | CI auth label + subscription credit output | ✓ VERIFIED | Banner and completion paths updated for subscription mode |
| `src/cli/onboarding.ts` | first-run setup wizard | ✓ VERIFIED | New module exports `isFirstRun()` and `runOnboarding()` |
| `src/cli/generate.ts` | onboarding trigger + auth display wiring | ✓ VERIFIED | Calls onboarding before `loadConfig()` and sets DisplayState auth fields |

### Verification Commands

- `npm run typecheck` (passed)
- `npm test` (passed, 21/21 files, 337/337 tests)
- `rg -n "AUTH_SUBSCRIPTION_NOT_LOGGED_IN|PROVIDER_SUBSCRIPTION_RATE_LIMITED|sessionExpired" src/auth/resolve.ts src/providers/openai-compat.ts` (passed)
- `rg -n "authMethod|isSubscription|subscription credits" src/ui/types.ts src/ui/components.ts src/ui/ci-renderer.ts src/ui/renderer.ts` (passed)
- `rg -n "isFirstRun|runOnboarding|pkceLogin" src/cli/onboarding.ts src/cli/generate.ts` (passed)

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| --- | --- | --- | --- |
| GEN-01 | generate works with subscription auth | ✓ SATISFIED | `resolveAuth` + provider handling + generate auth wiring |
| GEN-02 | banner shows active auth method | ✓ SATISFIED | `src/ui/components.ts` and `src/ui/ci-renderer.ts` auth label logic |
| GEN-03 | subscription displays credits instead of dollars | ✓ SATISFIED | completion + per-round cost gating in UI renderers |
| GEN-04 | missing subscription auth gives login guidance | ✓ SATISFIED | `AUTH_SUBSCRIPTION_NOT_LOGGED_IN` path in `resolveAuth` |
| GEN-05 | subscription 429 shows rate-limit window guidance | ✓ SATISFIED | fail-fast `PROVIDER_SUBSCRIPTION_RATE_LIMITED` with formatted retry-after duration |
| ONB-01 | first-run onboarding prompt exists | ✓ SATISFIED | `isFirstRun()` and onboarding trigger in `generate` |
| ONB-02 | onboarding presents provider choices | ✓ SATISFIED | provider selection options in onboarding wizard |
| ONB-03 | env-var detection skips onboarding | ✓ SATISFIED | env-var checks in `isFirstRun()` + generate gate |

### Human Verification Required

None.

### Gaps Summary

No implementation gaps found for phase 24 scope.

---

_Verified: 2026-02-27T17:54:30Z_  
_Verifier: Codex (manual execution path)_
