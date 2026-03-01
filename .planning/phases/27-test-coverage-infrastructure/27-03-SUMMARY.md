---
phase: 27-test-coverage-infrastructure
plan: 03
subsystem: testing
tags: [coverage, auth, mcp, vitest, mocks]

requires:
  - phase: 27-test-coverage-infrastructure
    provides: baseline pure-function coverage improvements from plan 27-02
provides:
  - expanded auth coverage for refresh/token edge cases and gemini fallback auth resolution
  - new `mcp/tools.test.ts` covering `createRegenerationToolHandlers` success and failure paths
  - improved full-suite coverage baseline to 85%+ lines/functions/statements
affects: [phase-27-04, coverage-branch-gap, mcp-tool-reliability]

tech-stack:
  added: []
  patterns: [mocked manager injection for MCP handler tests, auth token edge-case assertions with concrete output checks]

key-files:
  created:
    - .planning/phases/27-test-coverage-infrastructure/27-03-SUMMARY.md
    - src/mcp/tools.test.ts
  modified:
    - src/auth/resolve.ts
    - src/auth/resolve.test.ts
    - src/auth/pkce-login.test.ts

key-decisions:
  - "Added explicit config-driven `apiKeyEnv` support in resolveAuth to align auth resolution behavior with config schema and embedder behavior."
  - "Validated token refresh helper edge cases via real return-value assertions (string `expires_in`, blank refresh token, invalid access token fallback)."
  - "Tested `createRegenerationToolHandlers` through injected manager fakes rather than integration-level MCP server registration."

patterns-established:
  - "Auth Resolution Precedence Pattern: cli flag > configured env var > provider default env var > subscription token store > interactive prompt."
  - "MCP Handler Payload Pattern: validate `structuredContent` shape for both success and error responses."

requirements-completed: []

duration: 12 min
completed: 2026-03-01
---

# Phase 27 Plan 03: Mock-Heavy Coverage Expansion Summary

**Auth resolution/login edge cases and MCP regeneration tool handlers now have deterministic unit coverage, including provider-specific env fallback and structured error payloads.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-01T19:16:00Z
- **Completed:** 2026-03-01T19:28:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Expanded `resolveAuth` tests with gemini `GOOGLE_API_KEY` fallback, custom `apiKeyEnv`, refresh fallback path, invalid refresh payload handling, and non-TTY credential behavior.
- Expanded `pkceLogin` tests with cancel path, string/missing `expires_in`, missing `refresh_token`, and headless re-auth with existing credentials.
- Added `src/mcp/tools.test.ts` with regeneration trigger/status success/error/validation cases plus lifecycle mapping checks for all four job states.

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand auth resolve/pkce coverage and edge-case handling** - `c4467ed` (test)
2. **Task 2: Add MCP regeneration tool handler tests** - `6046d36` (test)

## Files Created/Modified
- `src/auth/resolve.ts` - respects `config.apiKeyEnv` before provider default env var mapping.
- `src/auth/resolve.test.ts` - added provider/env/refresh edge-case coverage and store error behavior checks.
- `src/auth/pkce-login.test.ts` - added helper edge-case coverage for token response parsing and headless behavior.
- `src/mcp/tools.test.ts` - new test suite for `createRegenerationToolHandlers` success/error paths.

## Decisions Made
- Implemented a small auth bugfix (`config.apiKeyEnv` precedence) to support the new coverage scenario and align runtime behavior with config contract.
- Kept MCP test scope focused on `createRegenerationToolHandlers` (unit-testable seam) and intentionally skipped `registerMcpTools` integration behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `resolveAuth` ignored configured `apiKeyEnv`**
- **Found during:** Task 1 test expansion (`custom apiKeyEnv` case)
- **Issue:** `resolveAuth` only checked provider-default env vars and did not honor explicit config override.
- **Fix:** Updated `resolveAuth` to resolve env var from `config.apiKeyEnv` first, then fallback to provider defaults.
- **Files modified:** `src/auth/resolve.ts`, `src/auth/resolve.test.ts`
- **Verification:** `npx vitest run src/auth/resolve.test.ts src/auth/pkce-login.test.ts src/mcp/tools.test.ts` passes.
- **Committed in:** `c4467ed`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Improved correctness without scope creep; behavior now matches schema/user-config expectations.

## Issues Encountered
- Full-suite coverage remains blocked on branch metric (`75.16%` vs current threshold `80%`) despite line/function/statement metrics now exceeding 85%.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan `27-04` can execute threshold-raise attempts using the improved baseline (`85.19` lines, `85.16` functions, `85.51` statements).
- Branch-coverage gap remains the primary blocker and must be resolved or formally deferred via gap closure planning.

## Self-Check: PASSED
- Target suites pass: `src/auth/resolve.test.ts`, `src/auth/pkce-login.test.ts`, `src/mcp/tools.test.ts`.
- New `src/mcp/tools.test.ts` exists and asserts `structuredContent` for success/error flows.
- `git log --oneline --all --grep="27-03"` returns both task commits.

---
*Phase: 27-test-coverage-infrastructure*
*Completed: 2026-03-01*
