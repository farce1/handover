# Architecture Research: Subscription Auth Integration

**Domain:** Subscription-based provider authentication (Claude Max, OpenAI Codex/ChatGPT Plus)
**Researched:** 2026-02-26
**Confidence:** HIGH (existing codebase read directly; auth mechanisms confirmed via official docs and GitHub issues)

---

## Existing Architecture Baseline

Before describing the integration, here is the actual current provider pipeline as read from source:

```
CLI entry (src/cli/generate.ts)
    |
loadConfig() — src/config/loader.ts
    Layers: CLI flags > env vars > .handover.yml > Zod defaults
    |
createProvider(config) — src/providers/factory.ts
    validateProviderConfig() — fail-fast: checks API key presence in env
    switch(preset.sdkType):
      'anthropic'     -> new AnthropicProvider(apiKey, model, concurrency)
      'openai-compat' -> new OpenAICompatibleProvider(preset, apiKey, model, concurrency, baseUrl)
    |
LLMProvider (interface: src/providers/base.ts)
    complete(request, schema, options): Promise<CompletionResult & { data: T }>
    |
BaseProvider (src/providers/base-provider.ts)
    rateLimiter.withLimit(() =>
      retryWithBackoff(() => this.doComplete(request, schema, onToken))
    )
    |
provider.doComplete() — provider-specific SDK call
    AnthropicProvider: Anthropic SDK -> messages.create / messages.stream
    OpenAICompatibleProvider: OpenAI SDK -> chat.completions.create / stream
```

**MCP path:** `src/mcp/tools.ts` receives `config: HandoverConfig` and passes it to session managers, which call `createProvider(config)`. The provider creation path is shared between CLI and MCP.

**Auth today:** `apiKey` is a plain string read from `process.env[preset.apiKeyEnv]` at factory time. No refresh, no expiry, no storage — just environment lookup.

**Config schema:** `src/config/schema.ts` defines `HandoverConfigSchema` with `provider`, `model`, `apiKeyEnv`, `baseUrl` fields. Auth is entirely env-based — no auth block exists today.

---

## Subscription Auth Reality (Critical Context for Design)

### Anthropic (Claude Max/Pro) — February 2026 Policy Change

**What is available technically:** Claude Code CLI uses OAuth 2.0 with PKCE against `console.anthropic.com/api/oauth/token`. Access tokens have the format `sk-ant-oat01-...`, expire after 8 hours, and are refreshed via refresh tokens (`sk-ant-ort01-...`). Credentials are stored in `~/.claude/.credentials.json`:

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1748658860401,
    "scopes": ["user:inference", "user:profile"],
    "subscriptionType": "max",
    "rateLimitTier": "..."
  }
}
```

**The January 2026 enforcement block:** Anthropic deployed server-side blocks on January 9, 2026, that reject subscription OAuth tokens in any tool other than Claude Code CLI and claude.ai. Any request using `Authorization: Bearer sk-ant-oat01-...` in a third-party tool returns:

> "This credential is only authorized for use with Claude Code and cannot be used for other API requests."

**Conclusion for Handover:** Do NOT implement Anthropic subscription OAuth. It is ToS-prohibited and actively blocked server-side. The existing `ANTHROPIC_API_KEY` path is the only legitimate path for Anthropic in Handover.

**Source (HIGH confidence):** The Register, Feb 2026 — Anthropic clarifies ban; openclaw.rocks analysis; Claude Code official authentication docs.

### OpenAI (Codex/ChatGPT Plus/Pro)

**What is available and permitted:** OpenAI Codex CLI uses an open, documented OAuth flow. There is no ToS prohibition on third-party tools using the ChatGPT OAuth flow. The Codex CLI is open-source (github.com/openai/codex). Other tools implementing the same flow is legitimate.

**OAuth flow mechanics:** Browser-based PKCE — Codex starts a local HTTP server on port 1455, opens a browser to auth.openai.com, receives tokens via redirect. Tokens stored in `~/.codex/auth.json`:

```json
{
  "auth_mode": "chatgpt",
  "tokens": {
    "access_token": "...",
    "refresh_token": "...",
    "id_token": "...",
    "expires_at": "2024-12-31T23:59:59Z"
  }
}
```

Alternatively `cli_auth_credentials_store: keyring` uses the OS credential store (macOS Keychain, Linux libsecret, Windows Credential Vault).

**Token refresh:** Automatic during active sessions. On 401 response: client uses refresh token, gets new access token, retries. Refresh tokens can be single-use (rotate on each use), causing issues with concurrent sessions — parallel processes that both attempt refresh will cause one to fail.

**Rate limits with ChatGPT subscription:**
- Plus: 45-225 local messages / 10-60 cloud tasks per 5 hours
- Pro: 300-1500 local messages / 50-400 cloud tasks per 5 hours
- These limits are hard server-side constraints, not adjustable by concurrency config

**Source (HIGH confidence):** Codex authentication docs (developers.openai.com/codex/auth/); Codex pricing (developers.openai.com/codex/pricing/); Codex GitHub issues on token refresh.

---

## Recommended Integration Architecture

Given the policy constraints:
- **Anthropic subscription:** Only API key path — no change to existing architecture
- **OpenAI subscription:** Add OAuth auth mode — legitimate, requires new components

The architecture adds one new auth mode with a token lifecycle layer sitting between config loading and provider construction.

### System Overview

```
+------------------------------------------------------------------+
|                         Config Layer                             |
|  loadConfig()  -->  HandoverConfigSchema (Zod)                   |
|  NEW: auth.mode: 'api-key' | 'subscription-oauth'               |
+------------------------------+-----------------------------------+
                               |
+------------------------------v-----------------------------------+
|                 Auth Resolution Layer (NEW)                      |
|                                                                  |
|  resolveAuth(config): Promise<AuthToken>                         |
|      +-- AuthMode.API_KEY  -> read from env (existing path)      |
|      +-- AuthMode.OAUTH    -> TokenStore -> TokenRefresher        |
|                                                                  |
|  src/auth/types.ts                                               |
|      AuthToken { accessToken, refreshToken, expiresAt, mode }    |
|                                                                  |
|  src/auth/token-store.ts                                         |
|      read/write ~/.handover/.credentials.json                    |
|      fallback: OS keychain via keytar                            |
|                                                                  |
|  src/auth/token-refresher.ts                                     |
|      check expiresAt, refresh if within 5-min window            |
|      POST to provider's token endpoint with refresh_token        |
|      write updated tokens back to TokenStore                     |
|                                                                  |
|  src/auth/oauth-flow.ts                                          |
|      PKCE browser flow for initial token acquisition             |
|      local redirect server on ephemeral port                     |
+------------------------------+-----------------------------------+
                               | AuthToken { accessToken, ... }
+------------------------------v-----------------------------------+
|                 Provider Factory (MODIFIED)                      |
|  createProvider(config) -> Promise<LLMProvider>  (now async)     |
|  calls resolveAuth(config) internally                            |
|  existing switch on sdkType unchanged                            |
|  for subscription mode: forces concurrency = 1                   |
+------------------------------+-----------------------------------+
                               |
+------------------------------v-----------------------------------+
|              Provider Layer (MINIMALLY MODIFIED)                 |
|                                                                  |
|  AnthropicProvider -- UNCHANGED                                  |
|  OpenAICompatibleProvider -- gains optional refreshCallback      |
|      for mid-generation 401 handling                             |
+------------------------------------------------------------------+
```

### Component Boundaries

| Component | File | Responsibility | Communicates With |
|-----------|------|----------------|-------------------|
| AuthToken type | `src/auth/types.ts` | Shared data structure | All auth components |
| TokenStore | `src/auth/token-store.ts` | Read/write credentials (file or keychain) | TokenRefresher, OAuthFlow |
| TokenRefresher | `src/auth/token-refresher.ts` | Expiry check, POST refresh, update store | TokenStore, provider HTTP |
| OAuthFlow | `src/auth/oauth-flow.ts` | PKCE browser flow, local redirect server | TokenStore, OS browser |
| resolveAuth() | `src/auth/index.ts` | Entry point — dispatch API key vs OAuth | Config, TokenStore, OAuthFlow |
| createProvider() | `src/providers/factory.ts` | Modified: async, threads AuthToken | resolveAuth, all providers |
| Subscription flags | `src/providers/presets.ts` | Add `isSubscription`, override `defaultConcurrency: 1` | factory.ts |

---

## Data Flow: Auth Token Acquisition

### First Use (no stored token)

```
handover generate (config: auth.mode = 'subscription-oauth', provider = 'openai')
    |
loadConfig() -- validates config including auth fields
    |
createProvider(config)
    |
resolveAuth(config)
    |
TokenStore.read() -> null (no stored token)
    |
OAuthFlow.run('openai')
    1. Generate PKCE code_verifier + code_challenge (SHA-256)
    2. Start local HTTP server on random ephemeral port (e.g., :49832)
    3. Open browser: auth.openai.com/authorize
       ?response_type=code
       &code_challenge=<sha256(verifier)>
       &redirect_uri=http://localhost:49832/callback
    4. User authenticates in browser, grants permission
    5. OpenAI redirects: localhost:49832/callback?code=<auth_code>
    6. Exchange: POST /oauth/token
       { grant_type: 'authorization_code', code, code_verifier }
    7. Receive: { access_token, refresh_token, expires_in }
    |
TokenStore.write(credentials)  ->  ~/.handover/.credentials.json (mode 0o600)
                                   or OS keychain if available
    |
AuthToken returned to factory -> provider constructed with accessToken as apiKey string
```

### Subsequent Use (stored token, valid)

```
resolveAuth(config)
    |
TokenStore.read() -> { accessToken, refreshToken, expiresAt }
    |
TokenRefresher.checkExpiry(expiresAt)
    expiresAt - Date.now() > 5 minutes? -> return as-is
    expiresAt - Date.now() <= 5 minutes? -> proactive refresh (see refresh flow)
    |
AuthToken returned to factory
```

### Proactive Refresh (approaching expiry)

```
TokenRefresher.refresh(token, store)
    |
POST https://auth.openai.com/oauth/token
    { grant_type: 'refresh_token', refresh_token: token.refreshToken }
    |
Receive: { access_token, refresh_token, expires_in }
    |
TokenStore.write(new credentials)
    |
Return new AuthToken
```

### Mid-Generation 401 (token expired during a long request)

```
OpenAICompatibleProvider.doComplete() receives HTTP 401
    |
Caught inside doComplete() (not surfaced to BaseProvider retry logic)
    |
calls this.refreshCallback()
    -> TokenRefresher.refresh() -> TokenStore.write()
    -> returns new AuthToken
    |
Retry the original request once with new access_token in SDK client
    |
If 401 again: throw ProviderError.authExpired()
    User must run: handover auth login
```

### Storage Location Selection

```
keytar available (npm package, native bindings)?
    YES -> OS keychain (macOS Keychain, Linux libsecret, Windows Credential Vault)
    NO  -> ~/.handover/.credentials.json (chmod 600, user-scoped)
```

---

## Config Schema Changes (Additive Only)

New fields in `src/config/schema.ts`. All new fields are optional — existing configs continue working without change:

```typescript
// New discriminated union for auth block
const AuthConfigSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('api-key'),
    // existing apiKeyEnv behavior, no new fields
  }),
  z.object({
    mode: z.literal('subscription-oauth'),
    provider: z.enum(['openai']),  // anthropic excluded (ToS violation)
    credentialsPath: z.string().optional(),  // override default path
    useKeychain: z.boolean().default(true),
  }),
]);

// HandoverConfigSchema addition:
export const HandoverConfigSchema = z.object({
  // ... all existing fields unchanged ...
  auth: AuthConfigSchema.optional(),
  // auth: undefined means existing api-key behavior (backward compatible)
});
```

**Backward compatibility:** `auth` is optional. Existing `.handover.yml` files with `apiKeyEnv` and no `auth` block continue to work identically. Factory checks `config.auth?.mode === 'subscription-oauth'` and falls through to existing path if absent.

---

## Provider Factory Changes

`createProvider()` becomes async because `resolveAuth()` performs I/O (token refresh is a network call):

```typescript
// Before (existing):
export function createProvider(config: HandoverConfig): LLMProvider

// After (modified):
export async function createProvider(config: HandoverConfig): Promise<LLMProvider>
```

Internal change inside the factory:

```typescript
export async function createProvider(config: HandoverConfig): Promise<LLMProvider> {
  const authToken = await resolveAuth(config);  // new

  validateProviderConfig(config, authToken);     // updated to accept authToken

  const preset = PROVIDER_PRESETS[config.provider];
  const apiKey = authToken.accessToken;           // was: process.env[envVarName]
  const isSubscription = authToken.mode === 'subscription-oauth';

  // Hard cap concurrency to 1 for subscription auth
  const concurrency = isSubscription
    ? 1
    : (config.analysis.concurrency ?? preset.defaultConcurrency);

  switch (preset.sdkType) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, model, concurrency);
    case 'openai-compat':
      const refreshCallback = isSubscription
        ? async () => (await resolveAuth(config)).accessToken
        : undefined;
      return new OpenAICompatibleProvider(
        preset, apiKey, model, concurrency, config.baseUrl, refreshCallback,
      );
  }
}
```

**Callsites requiring `await` (all must be updated):**
- `src/cli/generate.ts`
- `src/cli/serve.ts`
- Any test setup that calls `createProvider()` directly

The change is mechanical — add `await` at each callsite. No logic changes needed at callsites.

---

## MCP Server Impact

The MCP server creates a provider at startup and reuses it across all tool calls:

```typescript
// src/cli/serve.ts — before
const provider = createProvider(config);

// src/cli/serve.ts — after
const provider = await createProvider(config);
```

**Mid-session refresh concern:** MCP servers are long-lived (hours). OAuth tokens expire in ~1 hour. The `refreshCallback` inside `OpenAICompatibleProvider.doComplete()` handles this per-request. No MCP session restart is required on token refresh. The callback captures a closure that always reads the latest credentials from `TokenStore`.

**Startup timing:** If subscription auth requires interactive login (first use), the `await createProvider()` call at startup blocks until the browser flow completes. This is acceptable behavior — MCP server start fails loudly if the user hasn't authenticated, with a clear message: "Run `handover auth login` first."

---

## New File Build Order

Dependencies must be built in this order:

```
Phase 1 — Types and storage (no external deps)
  src/auth/types.ts
      AuthToken, AuthMode, ProviderCredentials, OAuthTokenResponse types

  src/auth/token-store.ts
      TokenStore class: read(), write(), clear()
      Keychain-first strategy with file fallback
      Uses keytar (npm) for OS keychain; falls back to JSON file

Phase 2 — Token lifecycle (depends on Phase 1)
  src/auth/token-refresher.ts
      ensureFresh(token, store): check 5-min buffer, call refresh if needed
      refresh(token, store): POST to token endpoint, update store

  src/auth/oauth-flow.ts
      OAuthFlow.run(provider): PKCE flow
      local HTTP server on ephemeral port
      browser open via 'open' npm package
      5-minute timeout before abandoning

Phase 3 — Entry point (depends on Phase 1 + 2)
  src/auth/index.ts
      resolveAuth(config): Promise<AuthToken>
          if config.auth?.mode === 'subscription-oauth': OAuth path
          else: API key path (reads from env, same as today)

  src/cli/auth.ts (NEW CLI command)
      handover auth login   -> runs OAuthFlow
      handover auth logout  -> clears TokenStore
      handover auth status  -> shows token expiry

Phase 4 — Config changes (depends on Phase 3 types)
  src/config/schema.ts
      Add AuthConfigSchema, optional auth field to HandoverConfigSchema

Phase 5 — Factory changes (depends on Phase 3 + 4)
  src/providers/factory.ts
      createProvider() becomes async
      call resolveAuth(config) internally
      force concurrency = 1 for subscription mode
      pass refreshCallback to OpenAICompatibleProvider

Phase 6 — Provider changes (depends on Phase 5)
  src/providers/openai-compat.ts
      Add optional refreshCallback constructor parameter
      In doComplete(): catch 401, call refreshCallback(), update SDK client, retry once

Phase 7 — Callsite updates (depends on Phase 5)
  src/cli/generate.ts       await createProvider()
  src/cli/serve.ts          await createProvider()
  src/providers/factory.test.ts  update tests for async factory
```

---

## Architectural Patterns

### Pattern 1: Auth-Agnostic Provider Interface

The `LLMProvider` interface (`src/providers/base.ts`) does not change. Auth is resolved before the provider is constructed, and the access token is passed as a string (identical to an API key from the provider's SDK perspective). This means:

- All existing runner, round, and DAG code calling `provider.complete()` requires zero changes
- Mock providers in tests require zero changes
- The DAG orchestrator is untouched

**When to use:** Auth is a construction-time concern. Keep auth lifecycle outside the call-time interface.

### Pattern 2: Proactive Token Refresh (5-Minute Window)

Check token expiry at `resolveAuth()` time and refresh proactively if within 5 minutes of expiry. This prevents mid-generation 401s, which are harder to recover from cleanly during streaming responses.

```typescript
// src/auth/token-refresher.ts
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export async function ensureFresh(token: AuthToken, store: TokenStore): Promise<AuthToken> {
  if (token.expiresAt - Date.now() < REFRESH_BUFFER_MS) {
    return refresh(token, store);
  }
  return token;
}
```

**When to use:** Always for subscription auth. Avoids the harder mid-stream refresh problem.

### Pattern 3: Keychain-First with File Fallback

OS keychain is more secure but unavailable in headless/CI environments:

```typescript
// src/auth/token-store.ts
async write(credentials: ProviderCredentials): Promise<void> {
  if (this.useKeychain && await isKeychainAvailable()) {
    await keytar.setPassword(SERVICE_NAME, credentials.provider, JSON.stringify(credentials));
  } else {
    await writeFile(this.credentialsPath, JSON.stringify(credentials), { mode: 0o600 });
  }
}
```

**When to use:** Any CLI tool that stores secrets and must work in both interactive and CI environments.

### Pattern 4: Concurrency Override at Factory Time

Subscription plans enforce serial request limits server-side. Override concurrency to 1 in the factory when subscription auth is detected, regardless of user config:

```typescript
const concurrency = isSubscription ? 1 : (config.analysis.concurrency ?? preset.defaultConcurrency);
```

Document this override in the startup log: "Subscription auth detected: concurrency set to 1 (provider limit)."

---

## Anti-Patterns

### Anti-Pattern 1: Implementing Anthropic Subscription OAuth

**What people do:** Implement the PKCE flow to use `sk-ant-oat01-...` tokens from a Claude Max/Pro subscription, since the technical mechanism is documented.

**Why it's wrong:** Anthropic deployed server-side enforcement on January 9, 2026. Requests using subscription OAuth tokens outside Claude Code CLI are rejected with a clear error. This violates Anthropic's Consumer ToS and fails at runtime regardless of implementation quality.

**Do this instead:** Use `ANTHROPIC_API_KEY` (Console pay-per-token) for Anthropic. Document this explicitly in Handover's docs.

### Anti-Pattern 2: Storing Tokens in `.handover.yml`

**What people do:** Add `auth.accessToken` as a config field so users can paste their OAuth token directly.

**Why it's wrong:** Config files get committed to git. `.handover.yml` is project-scoped and often shared. OAuth tokens are short-lived (1-hour expiry), making manual pasting fragile. This caused real credential leaks in other tools.

**Do this instead:** Store tokens only in `~/.handover/.credentials.json` (user-scoped) or the OS keychain. Config holds only `auth.mode` and optional path overrides — never the token value.

### Anti-Pattern 3: Keeping Concurrency at 4 for Subscription Auth

**What people do:** Leave `analysis.concurrency: 4` (cloud default) when using a ChatGPT subscription that enforces serial request limits.

**Why it's wrong:** ChatGPT Plus/Pro allows only one parallel Codex request. Concurrent requests receive "usage limit reached" or queue server-side, causing timeout failures and confusing retry behavior.

**Do this instead:** Factory detects subscription auth and hard-caps concurrency to 1. This override is logged at startup and cannot be overridden by user config.

### Anti-Pattern 4: Keeping `createProvider()` Synchronous

**What people do:** Keep factory sync and do token refresh inside constructors or in `doComplete()` on every call.

**Why it's wrong:** Constructors cannot be async. Refreshing in `doComplete()` means every request pays the expiry-check cost, and concurrent calls create refresh race conditions (single-use refresh tokens become a problem with concurrency even at 1 when multiple processes run).

**Do this instead:** Make `createProvider()` async. Resolve auth once at startup. Handle mid-stream 401 as a bounded single retry inside `doComplete()`, distinct from the proactive refresh at startup.

### Anti-Pattern 5: Sharing Token State Across Processes Without Locking

**What people do:** Two `handover` invocations running simultaneously both read the credentials file, both detect expiry, and both attempt refresh. One succeeds; the other uses the rotated refresh token that is now invalid.

**Why it's wrong:** Single-use refresh tokens (OpenAI's model) cause the second refresh attempt to fail with "refresh token already used."

**Do this instead:** Use OS keychain atomics where available. For file-based storage, use a lockfile (or accept the occasional re-auth as a known edge case with a clear error message prompting `handover auth login`). Document that concurrent `handover` invocations with subscription auth are not supported.

---

## Integration Points

### External Services

| Service | Auth Method | Endpoint | Token Lifetime |
|---------|-------------|----------|----------------|
| OpenAI (subscription) | PKCE OAuth 2.0 + browser | auth.openai.com | ~1hr access / days refresh |
| Anthropic (subscription) | BLOCKED — ToS violation | N/A | N/A |
| Anthropic (API key) | Env var — existing path | N/A | Indefinite |
| OpenAI (API key) | Env var — existing path | N/A | Indefinite |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| resolveAuth() -> factory | AuthToken value object passed in | Factory does not access credentials store directly |
| TokenStore <-> TokenRefresher | File/keychain I/O | Refresher writes new tokens after refresh |
| OAuthFlow <-> TokenStore | Write-once on flow completion | Flow writes, store reads thereafter |
| factory <-> providers | Constructor injection (token as string) | Provider unaware of token origin |
| OpenAICompatibleProvider <-> TokenRefresher | Callback closure | 401 handler calls back into auth layer for new token |
| MCP server <-> provider | Single instance reused across all requests | Refresh callback transparent per-request |
| CLI auth command <-> OAuthFlow | Direct call to initiate browser flow | Used by `handover auth login` |

---

## Scaling Considerations

This is a CLI tool — scaling is per-user-process, not multi-tenant. Relevant constraints:

| Concern | Subscription Auth | API Key Auth |
|---------|-------------------|--------------|
| Concurrency | Hard cap 1 (per provider ToS) | 4 default, configurable |
| Token refresh | Required (~1hr expiry) | Not required (static) |
| Headless/CI use | File-based credential store; initial browser login required once | Works anywhere (env var) |
| Rate limits | Provider-defined, non-configurable | Per-key limits, typically higher |
| Long-running MCP | Refresh callback per 401 | No concern |
| Parallel invocations | Refresh race condition risk | No concern |

**CI/automated use:** Subscription auth is unsuitable for CI environments. Requires interactive browser login, cannot be injected via env vars, and enforces serial execution. Document API key as the correct choice for automation. The CLI should detect headless environments and warn when subscription auth is configured.

---

## Sources

- Codebase files read directly: `src/providers/base.ts`, `src/providers/base-provider.ts`, `src/providers/factory.ts`, `src/providers/anthropic.ts`, `src/providers/openai-compat.ts`, `src/providers/presets.ts`, `src/config/schema.ts`, `src/config/loader.ts`, `src/utils/errors.ts`, `src/utils/rate-limiter.ts`, `src/ai-rounds/runner.ts`, `src/mcp/server.ts`, `src/mcp/tools.ts` — HIGH confidence
- [Anthropic clarifies ban on third-party tool access to Claude, The Register, Feb 2026](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/) — HIGH confidence
- [openclaw.rocks: Anthropic OAuth ban technical details and enforcement](https://openclaw.rocks/blog/anthropic-oauth-ban) — HIGH confidence (server-side block confirmed)
- [Claude Code official authentication docs](https://code.claude.com/docs/en/authentication) — HIGH confidence (official Anthropic)
- [Claude Code GitHub issue #19456: OAuth token structure and storage](https://github.com/anthropics/claude-code/issues/19456) — HIGH confidence (community-verified field names match official behavior)
- [Claude Code GitHub issue #22602: token refresh and expiry bugs](https://github.com/anthropics/claude-code/issues/22602) — MEDIUM confidence (documents real behavior)
- [OpenAI Codex authentication docs](https://developers.openai.com/codex/auth/) — HIGH confidence (official OpenAI)
- [OpenAI Codex pricing and limits](https://developers.openai.com/codex/pricing/) — HIGH confidence (official OpenAI)
- [OpenAI Codex GitHub issue #9634: refresh token already used](https://github.com/openai/codex/issues/9634) — MEDIUM confidence (documents single-use refresh token behavior)
- [LiteLLM Claude Code Max subscription tutorial](https://docs.litellm.ai/docs/tutorials/claude_code_max_subscription) — MEDIUM confidence (third-party, technically specific)
- [alif.web.id: Claude OAuth token format and endpoint details](https://www.alif.web.id/posts/claude-oauth-api-key) — LOW confidence (unofficial, useful for token format only)

---

*Architecture research for: subscription-based provider auth integration with existing BaseProvider pipeline*
*Researched: 2026-02-26*
