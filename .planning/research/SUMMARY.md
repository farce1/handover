# Project Research Summary

**Project:** Handover CLI — Subscription-based Provider Auth
**Domain:** OAuth subscription auth for TypeScript CLI tools (LLM providers)
**Researched:** 2026-02-26
**Confidence:** HIGH

## Executive Summary

This milestone was originally scoped to add subscription-based authentication (Claude Max, OpenAI Plus/Pro) to the Handover CLI. Research uncovered a hard constraint that fundamentally reshapes its scope: **Anthropic explicitly prohibits using Claude Max/Pro OAuth tokens in any third-party tool**, including the `@anthropic-ai/sdk`. This is not a technical limitation — it is an active ToS policy with server-side enforcement active since January 9, 2026. Any implementation of Claude subscription OAuth will result in server-blocked requests and risks account suspension. The Anthropic provider must remain API-key-only. This is non-negotiable and must be documented explicitly in code comments, help text, and user-facing docs.

The viable path is OpenAI-only subscription auth via the Codex OAuth flow. OpenAI permits third-party tools to implement the ChatGPT Plus/Pro subscription login using PKCE, as evidenced by Cline and OpenCode shipping it officially with OpenAI coordination. The recommended stack adds `@openai/codex-sdk` (or implements the PKCE flow directly using `openid-client`) alongside `@napi-rs/keyring` for secure credential storage. The existing `commander`-based CLI, `vitest` test suite, and provider factory are extended — no new frameworks are introduced. Auth is a construction-time concern: the access token is resolved once at startup and passed to provider constructors as a string, leaving all downstream runner/DAG/round code completely untouched.

The critical risks are operational: tokens expire in ~1 hour and must be refreshed proactively before each LLM round; subscription rate limits are message-weighted over 5-hour rolling windows (not per-minute token limits like API keys); and parallel `handover` invocations risk refresh token race conditions since OpenAI uses single-use refresh token rotation. The architecture must enforce concurrency = 1 for subscription auth, implement a clean auth resolution layer between config loading and provider construction, and always display which auth method is active at runtime so users can diagnose billing and limit issues.

---

## Key Findings

### Recommended Stack

The existing stack requires minimal additions. The `openai` SDK (`^6.25.0`) is already present and handles Codex API calls. New requirements are: `@openai/codex-sdk` for the official OpenAI subscription auth flow, and `@napi-rs/keyring` for OS keychain storage of OAuth tokens (the actively maintained replacement for the archived `keytar`). `openid-client@^6.8.2` is an alternative if implementing the PKCE flow from scratch rather than delegating to the Codex SDK, but requires Node `>=20.19.0`. The existing `commander` CLI and `vitest` suite need no replacement.

**Core technologies:**
- `@openai/codex-sdk` (latest): OpenAI subscription auth entry point — the only officially supported third-party subscription auth SDK in this domain; wraps the Codex CLI over stdin/stdout
- `@napi-rs/keyring@^1.2.0`: OS keychain storage for OAuth tokens — actively maintained `keytar` replacement; prebuilt binaries, no native compilation required
- `openid-client@^6.8.2`: PKCE OAuth 2.0 client (use if building the auth flow from scratch); requires Node `>=20.19.0`
- `openai@^6.25.0`: Already in repo at `^6.22.0`; minor version bump handles all Codex API calls
- `@anthropic-ai/sdk@0.78.0`: Unchanged — API key auth only; no subscription path is compliant or technically possible

**What NOT to use:**
- Claude Max/Pro OAuth tokens in any third-party code — ToS violation, server-side blocked since Jan 9, 2026
- `node-keytar` / `keytar` — archived December 2022; native build failures on newer Node versions
- Tokens stored in `.handover.yml` — project-scoped config files get committed to git

### Expected Features

The MVP delivers end-to-end OpenAI subscription auth: a user with ChatGPT Plus/Pro can run `handover generate` without an API key by completing a one-time browser login. All table-stakes auth CLI patterns follow the established `gh auth` / `claude auth` / `codex auth` conventions users already know.

**Must have (table stakes — P1):**
- `authMethod` config field in `.handover.yml` (`"api-key"` | `"subscription"`) — root dependency for all other auth work; defaults to `"api-key"` to protect existing users without any migration
- Credential storage module — `~/.handover/credentials.json` at 0600 permissions as baseline; OS keychain as the secure target
- `handover auth login openai` — PKCE browser OAuth flow; stores access + refresh + expiry
- `handover auth logout openai` — clears credential store entry
- `handover auth status` — shows provider, auth method, validity, and expiry per configured provider
- Auth resolution in `generate` — reads credential store when `authMethod: subscription`; CLI flag and env var override take strict precedence
- Clear error for missing subscription auth — "Run `handover auth login openai`" instead of generic API key error
- Cost display suppression — shows "subscription credits" instead of dollar amount in subscription mode

**Should have (v1.x after validation — P2):**
- Token refresh on HTTP 401 mid-generation — transparent retry with new access token
- OS keychain storage via `@napi-rs/keyring` — upgrade from file-based fallback
- Headless device code flow (`--device-code` flag) — for SSH/container environments
- `handover auth token` command — prints access token for CI injection via env var

**Defer (v2+ — P3):**
- Team/workspace shared auth tokens
- Multiple simultaneous subscription sessions (personal + work)
- Automatic subscription tier detection and model selection

### Architecture Approach

The integration adds a new **Auth Resolution Layer** sitting between config loading and provider construction, keeping the `LLMProvider` interface and all downstream runner/round/DAG code completely untouched. `createProvider()` becomes `async`, calls `resolveAuth(config)` once at startup, and passes the resulting `accessToken` string to the provider constructor — indistinguishable from an API key at the SDK level. The `OpenAICompatibleProvider` gains an optional `refreshCallback` to handle mid-generation 401s without surfacing token expiry to the base retry logic.

**Major components:**
1. `src/auth/types.ts` — `AuthToken`, `AuthMode`, `ProviderCredentials`, `OAuthTokenResponse` shared types; foundation for all auth components
2. `src/auth/token-store.ts` — `TokenStore.read()` / `write()` / `clear()`; keychain-first via `@napi-rs/keyring`, file fallback at 0600 permissions
3. `src/auth/token-refresher.ts` — `ensureFresh()` with 5-minute proactive refresh window; `refresh()` posting to token endpoint and updating the store
4. `src/auth/oauth-flow.ts` — PKCE browser flow with local redirect server on ephemeral port; 5-minute timeout before abandoning
5. `src/auth/index.ts` — `resolveAuth(config)`: dispatches API key vs OAuth path; the single entry point for all auth resolution
6. `src/cli/auth.ts` — new `handover auth` subcommand group (login / logout / status)
7. `src/providers/factory.ts` (modified) — async `createProvider()`; enforces `concurrency = 1` for subscription mode; logs override at startup
8. `src/providers/openai-compat.ts` (modified) — optional `refreshCallback` constructor parameter; handles 401 with one refresh-and-retry before surfacing error

**Build order constraint (hard dependency chain):** Types and storage (Phase 1) → token lifecycle and OAuth flow (Phase 2) → auth entry point and CLI commands (Phase 2) → config schema additions (Phase 3) → factory async change (Phase 3) → provider 401 handling and callsite `await` updates (Phase 3).

### Critical Pitfalls

1. **Claude subscription OAuth is a ToS violation enforced server-side** — Anthropic blocks `sk-ant-oat01-...` tokens in any third-party tool since January 9, 2026. Any implementation attempt fails at runtime regardless of technical quality. Establish the decision explicitly in code comments and documentation: Claude support = API key only, permanently.

2. **OAuth refresh tokens must not be stored in plaintext project config files** — Refresh tokens are long-lived and represent full account access, unlike API keys which can be scoped. They must go into the OS keychain (`@napi-rs/keyring`) or a user-scoped home-directory file at 0600 permissions — never in `.handover.yml` or any project-scoped config that could be committed to git.

3. **Token expiry mid-run corrupts 6-round analysis output** — OAuth access tokens expire in ~1 hour. Loading once at startup is insufficient for long analyses. Implement proactive refresh (5-minute buffer) before each round; classify 401 responses as refresh opportunities with one retry; save partial output with an `[INCOMPLETE: auth failed at round N]` marker if refresh fails.

4. **Subscription rate limits are not API rate limits — they require different handling** — ChatGPT Plus allows ~30-150 messages per 5-hour rolling window; a single 6-round analysis can consume 60-90+ weighted message units depending on context length. The existing `retryWithBackoff` logic (seconds-scale backoff) is wrong for subscription 429s that may require a 4+ hour wait. Surface remaining window time explicitly to users; never silently sleep >30 seconds without feedback.

5. **Credential files can be inadvertently published to npm** — npm publishes everything in the package directory unless explicitly excluded. Use the `files` allowlist in `package.json` and add `npm pack --dry-run` to the CI release workflow before any release containing new auth features. Automated bots specifically target `.claude/`, `.env`, and credential files on npm publish feeds.

---

## Implications for Roadmap

The architecture's build-order dependency chain and the feature prioritization matrix suggest a natural 4-phase structure. The "Anthropic = API key only" decision is made in Phase 1 and is not revisited.

### Phase 1: Auth Foundation
**Rationale:** All auth commands and generate-path changes depend on the credential storage abstraction and config schema. These have zero external service dependencies and must exist before any other auth component. This is also where the Claude OAuth non-decision is locked in code and docs to prevent future scope creep.
**Delivers:** `AuthToken` types, `TokenStore` implementation, `resolveAuth()` entry point, `authMethod` config field in Zod schema; no user-facing commands yet
**Addresses:** `authMethod` config field (P1), credential storage module (P1)
**Avoids:** Pitfall 1 (Claude OAuth) — decision documented here; Pitfall 2 (plaintext token storage) — storage strategy chosen here; Pitfall 5 (npm credential publish) — `files` field and `.npmignore` established here

### Phase 2: Auth Commands (Login / Logout / Status)
**Rationale:** The PKCE OAuth flow and auth CLI commands are the user-facing entry point and depend on Phase 1's storage layer. Users must be able to authenticate before the `generate` wiring can be tested end-to-end.
**Delivers:** `handover auth login openai` (PKCE browser flow + token storage), `handover auth logout openai`, `handover auth status`; developers can verify the full OAuth cycle before it is required by `generate`
**Uses:** `@openai/codex-sdk` or `openid-client` for the PKCE flow; `@napi-rs/keyring` for secure token persistence
**Implements:** `OAuthFlow`, `TokenRefresher`, `src/cli/auth.ts` (new CLI command group)
**Avoids:** Pitfall 2 (plaintext storage) — OS keychain implemented here; Pitfall 6 (auth method invisible) — `auth status` addresses this directly

### Phase 3: Generate Integration + Rate Limit Handling
**Rationale:** Once auth commands work and tokens are verified to persist and refresh correctly, `generate` is wired to use subscription tokens. This phase also enforces concurrency = 1 and implements subscription-aware rate limit messaging — both depend on the auth layer being complete and tested.
**Delivers:** `handover generate` working end-to-end on ChatGPT Plus/Pro with no API key; cost display suppression; startup auth method banner; subscription-aware 429 messaging distinct from API key 429 handling; partial-output save on mid-run auth failure
**Uses:** Async `createProvider()`, `refreshCallback` in `OpenAICompatibleProvider`, proactive `ensureFresh()` before each LLM round
**Implements:** Factory async change and all callsite `await` updates (mechanical); subscription 429 handling distinct from API key retry logic
**Avoids:** Pitfall 3 (mid-run token expiry) — proactive refresh before each round; Pitfall 4 (subscription 429 treated as API 429) — separate handling with window reset messaging

### Phase 4: Security Hardening + Release Prep
**Rationale:** Auth features are the most security-sensitive addition to date. Before releasing, verify no credential data leaks into npm publish, logs, or git. This phase applies retrospectively across all three previous phases and should be completed end-to-end before shipping to users.
**Delivers:** CI `npm pack --dry-run` check in release workflow; auth method logged at run start (method name only, never credential value); `.npmignore` / `package.json` `files` field verified; documentation of Claude API-key-only constraint in README and provider setup guides
**Avoids:** Pitfall 5 (npm credential publish); security mistake of logging full token values in debug output; Pitfall 3 (no partial save on mid-run auth failure — verified by integration test)

### Phase Ordering Rationale

- **Types and storage before commands:** `TokenStore` and `AuthToken` are imported by all auth commands and the generate path; building them first avoids circular dependencies and allows isolated unit testing of storage logic.
- **Commands before generate wiring:** Auth commands let developers verify the full OAuth flow end-to-end before it becomes a hard requirement for `generate`. Wiring `generate` to an untested auth path creates hard-to-debug integration failures on first run.
- **Security hardening last but mandatory:** The security phase validates the entire feature surface retrospectively. Placing it at the end allows it to cover all newly introduced auth code in one sweep rather than repeatedly across phases.
- **Concurrency forced to 1 in Phase 3:** This constraint belongs in the factory alongside the `generate` integration — they are causally linked and should be implemented and tested together.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Auth Commands):** The `@openai/codex-sdk` exact API surface for initiating OAuth login needs verification against the published npm package before implementation begins. The SDK may expose a direct login method or may require wrapping `openid-client` manually. Recommend a 30-minute technical spike: install the SDK, inspect exported types, confirm whether the login flow is encapsulated or must be built separately.
- **Phase 3 (Generate Integration):** The `refreshCallback` design for mid-generation 401s during streaming responses needs validation. Streaming + token replacement mid-stream is a known edge case in the OpenAI SDK — verify whether the SDK allows it or whether the stream must be abandoned and the request retried from the beginning with the new token.

Phases with standard patterns (skip deep research):
- **Phase 1 (Auth Foundation):** Credential file storage with 0600 permissions and Zod schema additions are established CLI patterns with clear implementation paths. No research needed.
- **Phase 4 (Security Hardening):** npm publish safety (files allowlist, pack --dry-run) and log redaction patterns are well-documented across the npm and security ecosystems.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Anthropic ban confirmed via official docs and The Register; OpenAI Codex OAuth confirmed via official developer docs and live implementations (Cline, OpenCode). `@napi-rs/keyring` confirmed via npm and GitHub as the active `keytar` replacement. |
| Features | HIGH | Feature set modeled on `gh auth`, `claude auth`, `codex auth` — all well-documented with consistent conventions. MVP scope is conservative and matches what Cline/OpenCode shipped for Codex OAuth. |
| Architecture | HIGH | Existing codebase read directly; all integration points confirmed from source files. Build-order dependency chain derived from code, not inference. Pattern of auth-at-construction-time is well established in CLI tooling. |
| Pitfalls | HIGH | ToS violation risk confirmed via multiple primary sources (Anthropic official, The Register, community enforcement reports from affected tools). Token security best practices from RFC 9700, Google, Auth0. Rate limit data from official OpenAI Codex pricing docs. |

**Overall confidence:** HIGH

### Gaps to Address

- **`@openai/codex-sdk` exact API surface:** The SDK exists and is confirmed as the correct dependency, but the exact method signatures for initiating OAuth login need verification against the published npm package before Phase 2 begins. Do a 30-minute technical spike during Phase 2 planning.
- **OpenAI refresh token rotation behavior in practice:** ARCHITECTURE.md confirms single-use refresh token rotation causes concurrent-process race conditions (GitHub issue #9634). The severity depends on whether this applies to CLI-scoped tokens or only to server-side sessions. Verify against the Codex CLI open-source repository before Phase 3.
- **Headless device code flow stability:** Described as "in beta" for Codex. Defer implementation until the flow is stable; document the limitation for SSH users in Phase 3 docs. Do not block Phase 3 shipping on this.
- **Subscription token lifetime confirmation:** ARCHITECTURE.md cites ~1 hour for OpenAI Codex access tokens. Verify the actual `expires_in` value returned by the token endpoint during the Phase 2 technical spike — it determines the proactive refresh window and the "runs remaining before reset" estimate surfaced to users.

---

## Sources

### Primary (HIGH confidence)
- https://code.claude.com/docs/en/legal-and-compliance — Official Anthropic ban on third-party subscription OAuth
- https://developers.openai.com/codex/auth/ — Official OpenAI Codex authentication documentation (PKCE flow, token storage format)
- https://developers.openai.com/codex/pricing/ — Official Codex subscription tier limits per 5-hour window
- https://support.claude.com/en/articles/9876003-... — Anthropic official: API and subscription are separate products with separate billing
- https://github.com/anthropics/claude-code/issues/6536 — SDK does not accept Max OAuth tokens (official repo, Anthropic response)
- https://openai.com/policies/row-terms-of-use/ — OpenAI prohibits credential sharing and account resale
- Internal codebase files read directly: `src/providers/factory.ts`, `src/providers/base-provider.ts`, `src/providers/openai-compat.ts`, `src/config/schema.ts`, `src/mcp/server.ts`, `src/mcp/tools.ts`, `src/cli/generate.ts`

### Secondary (MEDIUM confidence)
- https://cline.bot/blog/introducing-openai-codex-oauth — Cline's official Codex OAuth integration confirming third-party use is permitted
- https://docs.cline.bot/provider-config/openai-codex — Cline docs confirming Codex OAuth as a first-class supported provider
- https://github.com/openai/codex/issues/9634 — Single-use refresh token behavior in concurrent session scenarios (community-verified)
- https://github.com/anthropics/claude-code/issues/22602 — Claude Code token refresh and expiry behavior (community-verified, matches official behavior)
- https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/ — Coverage of enforcement and ToS update (confirmed against official docs)

### Tertiary (LOW confidence)
- https://www.alif.web.id/posts/claude-oauth-api-key — Claude OAuth token format details (unofficial; useful for token structure verification only)

---
*Research completed: 2026-02-26*
*Ready for roadmap: yes*
