# Phase 23: Codex Auth Commands - Research

**Researched:** 2026-02-27
**Domain:** PKCE browser OAuth, localhost callback server, `handover auth` CLI command group, proactive token refresh, subscription concurrency enforcement
**Confidence:** HIGH (OAuth endpoints verified via multiple sources; openid-client API verified via Context7; codebase integration points verified directly)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### OAuth flow experience
- Auto-open the default browser when user runs `handover auth login openai` — no URL printed by default
- Show animated spinner with "Waiting for authentication..." in terminal while waiting for browser callback
- Spin up a temporary localhost HTTP server on a random port to receive the OAuth redirect callback
- Server shuts down after receiving the callback

#### CLI output & flags
- `handover auth status` uses a structured table format (columns: Provider, Auth Method, Status, Expires) — similar to `docker context ls`
- No token expiry info in the `handover generate` startup banner — just show `Auth: subscription`; expiry is visible via `auth status` only

#### Token refresh visibility
- Token refresh is completely silent — happens in background, user sees no difference during normal operation
- Refresh activity may be visible in debug/verbose logging but never in standard output

#### Error handling
- Corrupted or invalid stored credentials: silently delete and prompt user to run `auth login` again (consistent with Phase 21 fail-closed approach)

### Claude's Discretion
- Whether to add `--json` flag to auth commands (based on existing CLI patterns in codebase)
- Whether `handover auth login` takes provider as required argument or prompts interactively when omitted
- Whether `handover auth status` shows all configured providers or just the active one
- Token refresh failure strategy (fail immediately vs try current token first)
- Headless environment fallback (print URL for manual copy vs fail with message)
- Auth timeout duration for browser callback
- 5-minute proactive refresh buffer: fixed or configurable
- Re-auth behavior when valid tokens already exist (confirmation prompt vs silent overwrite)
- Success feedback approach (terminal only vs terminal + browser page)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 23 implements the `handover auth` CLI command group and the plumbing that makes subscription tokens work at runtime. There are five concrete deliverables:

1. **`handover auth login openai`** — PKCE browser OAuth flow. Opens default browser, spins up a localhost HTTP server on a random available port to receive the OAuth redirect, waits with an animated spinner, exchanges the code for tokens, and persists them via Phase 21's `TokenStore`. The OpenAI Codex OAuth server is at `https://auth.openai.com` with client ID `app_EMoamEEZ73f0CkXaXp7hrann` and redirect URI `http://localhost:<port>/auth/callback`. Uses `openid-client` for all OAuth handshaking and PKCE mechanics.

2. **`handover auth status`** — Reads `~/.handover/credentials.json` and renders a table (Provider / Auth Method / Status / Expires) matching `docker context ls` style. No AI provider involvement; purely reads the credential store.

3. **Proactive token refresh in `resolveAuth()`** — Before each `generate` run, if `authMethod: subscription`, check token expiry. If within 5 minutes of expiry (or already expired), call `openid-client`'s `refreshTokenGrant()` and re-persist. Happens inside `resolveAuth()`, transparently.

4. **Subscription concurrency enforcement in `factory.ts`** — When `authMethod: subscription`, override `concurrency = 1` regardless of config. Single guard added to `createProvider()`.

5. **`handover auth` command group in `src/cli/index.ts`** — Register via Commander's `.addCommand()` on a parent `auth` Command with `.addCommand()` sub-commands for `login` and `status`.

The primary technical dependency not yet installed is `openid-client` (v6.x). The `open` npm package is needed for cross-platform browser launch. Both are ESM-only packages that fit the project's `"type": "module"` configuration.

**Primary recommendation:** Use `openid-client` v6 for all OAuth mechanics (PKCE generation, authorization URL construction, token exchange, token refresh). Hand-roll the localhost HTTP callback server using `node:http` (5-10 lines; no additional dep). Use `open` for browser launch. Use `@clack/prompts` `spinner()` for the waiting UX (already installed at v1.0.1).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openid-client` | `^6.x` (not yet installed) | PKCE code verifier/challenge generation, authorization URL, token exchange, token refresh | The authoritative OAuth 2.0 / OIDC client for JavaScript runtimes. Context7 verified. Used by the broader ecosystem for CLI auth flows. |
| `open` | `^10.x` (not yet installed) | Cross-platform browser launch — `open(url)` | The standard for programmatic browser opening in Node.js CLI tools. ESM-only, matches project type. |
| `node:http` | built-in | Temporary localhost HTTP server to receive OAuth callback | No dep needed; 10 lines. Node's built-in `createServer()` + `listen(0)` for random port. |
| `node:crypto` | built-in | Random state value for OAuth CSRF protection (if needed beyond openid-client's built-ins) | Already available; openid-client's `randomState()` covers this. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@clack/prompts` | `^1.0.1` (installed) | `spinner()` for "Waiting for authentication...", `confirm()` for re-auth prompt, `log.success()` for success feedback | Already installed; `SpinnerResult` has `.start(msg)`, `.stop(msg)`, `.message(msg)` |
| `picocolors` | `^1.1.0` (installed) | Colored table output in `auth status`, colored error messages | Already the project color standard |
| `node:net` | built-in | `net.createServer().listen(0)` to find a free random port before spinning up the HTTP server | Avoids hard-coded port; 3 lines |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `openid-client` | `@openai/codex-sdk` | Prior decision noted a 30-minute spike is needed to confirm `@openai/codex-sdk` OAuth API surface. After research: `@openai/codex-sdk` is a *code execution* SDK, not an OAuth library. Its auth flow is the codex CLI's internal concern, not an exportable OAuth helper. `openid-client` is the correct library. |
| `openid-client` | Manual `fetch()` to `/oauth/token` | Possible but fragile — PKCE math (S256 challenge), discovery, error handling all need to be hand-rolled. `openid-client` handles all of it correctly and is maintained. |
| `open` npm package | `child_process.exec('open <url>')` on macOS | Platform-specific and brittle. `open` package handles macOS/Windows/Linux correctly. Only 2KB dependency. |
| Random port via `listen(0)` | Hard-coded port 1455 (what Codex CLI uses) | Hard-coded port conflicts if multiple auth sessions run concurrently. `listen(0)` is the correct RFC 8252 approach for native apps. |
| `openid-client` discovery | Hard-code authorization/token endpoint URLs | Discovery adds one extra HTTP round-trip. For `https://auth.openai.com`, the metadata is at `/.well-known/openid-configuration`. Beneficial for resilience if endpoints change. However: if OpenAI's discovery endpoint is not standard (unverified), hard-coding is the fallback. |

**Installation:**
```bash
npm install openid-client open
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── auth/
│   ├── index.ts             # Public API (already exists — add pkceLogin, refreshIfNeeded)
│   ├── types.ts             # StoredCredential already has expiresAt? — no changes needed
│   ├── token-store.ts       # Already exists — no changes needed
│   ├── resolve.ts           # Add proactive refresh logic for subscription authMethod
│   ├── pkce-login.ts        # NEW: PKCE browser OAuth flow (the heavy lifting)
│   └── pkce-login.test.ts   # NEW: Tests with mocked http server and openid-client
└── cli/
    ├── index.ts             # Add 'auth' command group via .addCommand()
    ├── auth/
    │   ├── index.ts         # NEW: Commander Command for 'auth' group
    │   ├── login.ts         # NEW: 'auth login [provider]' action
    │   └── status.ts        # NEW: 'auth status' action
    └── generate.ts          # No changes — resolveAuth() already handles subscription
```

### Pattern 1: `handover auth` Command Group (Commander.js)

**What:** Register an `auth` parent Command with sub-commands `login` and `status`. Commander supports nested sub-commands natively via `.addCommand()`.

**When to use:** Any time multiple related sub-commands share a namespace (identical to how `git remote` and `git stash` work).

**Example:**
```typescript
// Source: Context7 /tj/commander.js — nested subcommands
// src/cli/auth/index.ts
import { Command } from 'commander';
import { runAuthLogin } from './login.js';
import { runAuthStatus } from './status.js';

export function makeAuthCommand(): Command {
  const auth = new Command('auth').description('Manage authentication credentials');

  auth
    .command('login [provider]')
    .description('Authenticate with a provider via browser OAuth')
    .action(async (provider?: string) => {
      const { runAuthLogin } = await import('./login.js');
      await runAuthLogin(provider);
    });

  auth
    .command('status')
    .description('Show current authentication status for all configured providers')
    .action(async () => {
      const { runAuthStatus } = await import('./status.js');
      await runAuthStatus();
    });

  return auth;
}
```

```typescript
// src/cli/index.ts — add one line
import { makeAuthCommand } from './auth/index.js';
program.addCommand(makeAuthCommand());
```

### Pattern 2: PKCE OAuth Flow with Localhost Callback

**What:** The canonical CLI OAuth pattern (RFC 8252). Spin up a localhost HTTP server on a random port, open browser to the authorization URL, wait for callback, exchange code for tokens.

**When to use:** `handover auth login openai` command.

**OpenAI Codex OAuth endpoints (MEDIUM confidence — verified via multiple GitHub sources and community forum):**
- Authorization endpoint: `https://auth.openai.com/oauth/authorize`
- Token endpoint: `https://auth.openai.com/oauth/token`
- Client ID: `app_EMoamEEZ73f0CkXaXp7hrann` (the public Codex client ID; same one Codex CLI and third-party tools use)
- Scope: `openid profile email offline_access`
- Redirect URI: `http://localhost:<port>/auth/callback`

> **SPIKE WARNING (from prior decisions):** The `@openai/codex-sdk` OAuth API surface was marked as needing a 30-minute spike. After research: `@openai/codex-sdk` is a code-execution SDK, not an OAuth library. Use `openid-client` directly. However, whether `https://auth.openai.com` exposes a standards-compliant OIDC discovery endpoint (`/.well-known/openid-configuration`) needs validation before using `client.discovery()`. If discovery fails, hard-code the endpoints as a `Configuration` object directly.

**Example (discovery path — preferred):**
```typescript
// Source: Context7 /panva/openid-client — discovery + PKCE + authorizationCodeGrant
import * as client from 'openid-client';

// Find a free port
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address() as net.AddressInfo;
      server.close(() => resolve(address.port));
    });
    server.on('error', reject);
  });
}

export async function pkceLogin(provider: 'openai'): Promise<StoredCredential> {
  const port = await getFreePort();
  const redirectUri = `http://localhost:${port}/auth/callback`;

  // Discover or hard-code configuration
  const config = await client.discovery(
    new URL('https://auth.openai.com'),
    'app_EMoamEEZ73f0CkXaXp7hrann',
    undefined,  // no client secret — public client
    client.None(), // no client authentication
  );

  // Generate PKCE params
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  // Build authorization URL
  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  // Start callback server + open browser + wait
  const callbackUrl = await waitForCallback(port, authUrl.href);

  // Exchange code for tokens
  const tokens = await client.authorizationCodeGrant(
    config,
    new URL(callbackUrl),
    { pkceCodeVerifier: codeVerifier, expectedState: state },
  );

  return {
    provider: 'openai',
    token: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : undefined,
  };
}
```

**Note:** `StoredCredential` in `src/auth/types.ts` currently has `token` and `expiresAt?`. Phase 23 adds `refreshToken?: string` to store the refresh token for proactive refresh.

### Pattern 3: Localhost HTTP Callback Server

**What:** A single-request HTTP server that captures the OAuth callback and shuts itself down.

**Example:**
```typescript
// Source: Node.js built-in http module — RFC 8252 loopback redirect pattern
import { createServer } from 'node:http';
import open from 'open';
import * as p from '@clack/prompts';

async function waitForCallback(port: number, authUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url?.startsWith('/auth/callback')) return;

      // Send success/failure page to browser
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Authentication complete. You can close this tab.</h2></body></html>');

      // Resolve with the full callback URL so openid-client can parse it
      const callbackUrl = `http://localhost:${port}${req.url}`;
      server.close();
      resolve(callbackUrl);
    });

    server.listen(port, () => {
      // Open browser — non-blocking
      open(authUrl).catch(() => {
        // Headless fallback: print URL if open() fails
        p.log.info(`Open this URL to authenticate: ${authUrl}`);
      });
    });

    server.on('error', reject);

    // Timeout after N seconds
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out'));
    }, AUTH_TIMEOUT_MS);
  });
}
```

### Pattern 4: Proactive Token Refresh in `resolveAuth()`

**What:** Before returning a subscription token, check if it expires within 5 minutes. If so, call `refreshTokenGrant()` and re-persist.

**When to use:** Inside `resolveAuth()`, after the credential store check, when `authMethod === 'subscription'`.

**Example:**
```typescript
// Source: Context7 /panva/openid-client — refreshTokenGrant
import * as client from 'openid-client';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

async function refreshIfNeeded(
  credential: StoredCredential,
  config: client.Configuration,
  store: TokenStore,
): Promise<StoredCredential> {
  if (!credential.expiresAt || !credential.refreshToken) {
    return credential; // no expiry info or no refresh token — return as-is
  }

  const expiresAt = new Date(credential.expiresAt).getTime();
  const needsRefresh = Date.now() + REFRESH_BUFFER_MS >= expiresAt;

  if (!needsRefresh) return credential;

  // Silent refresh
  logger.debug('[auth] refreshing subscription token proactively');
  const tokens = await client.refreshTokenGrant(config, credential.refreshToken);

  const refreshed: StoredCredential = {
    ...credential,
    token: tokens.access_token,
    refreshToken: tokens.refresh_token ?? credential.refreshToken,
    expiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : credential.expiresAt,
  };

  await store.write(refreshed);
  return refreshed;
}
```

### Pattern 5: Subscription Concurrency Enforcement in `factory.ts`

**What:** Override `concurrency = 1` when `authMethod === 'subscription'`. Single guard in `createProvider()`.

**When to use:** Every time a provider is created with subscription auth.

**Example:**
```typescript
// src/providers/factory.ts — add guard BEFORE concurrency is passed to provider constructor
export function createProvider(config: HandoverConfig, authResult: AuthResult): LLMProvider {
  validateProviderConfig(config);
  // ...existing code...

  // CDX-05: Subscription auth enforces concurrency=1
  const effectiveConcurrency =
    config.authMethod === 'subscription' ? 1 : (config.analysis.concurrency ?? preset.defaultConcurrency);

  // Use effectiveConcurrency instead of concurrency below
}
```

### Pattern 6: `auth status` Table Output

**What:** Read credentials.json and render a table using `picocolors` formatting, similar to `docker context ls`.

**When to use:** `handover auth status` command.

**Example output:**
```
PROVIDER    AUTH METHOD    STATUS    EXPIRES
openai      subscription   valid     2026-03-01 12:00 UTC
anthropic   api-key        -         -
```

**Implementation approach:**
- Read from `TokenStore.read()` for subscription credential
- Check configured provider from config for api-key auth
- Column widths: pad strings to fixed widths with spaces
- No external table library needed — picocolors handles headers, manual padding handles alignment

### Anti-Patterns to Avoid

- **Hard-coding port 1455:** Conflicts if Codex CLI is running. Use `listen(0)` then read assigned port.
- **Storing tokens in `StoredCredential.token` AND leaving `refreshToken` absent from the type:** Phase 23 must extend `StoredCredential` with `refreshToken?: string`. The Phase 21 interface has `token`, `provider`, `expiresAt?` — adding `refreshToken?` is backwards-compatible.
- **Calling `client.discovery()` without a fallback:** OpenAI's `https://auth.openai.com` may or may not expose a standards-compliant OIDC discovery document. Hard-code `Configuration` as a fallback if discovery throws.
- **Printing the URL to stdout by default:** Locked decision says "no URL printed by default" — the URL is only printed if `open()` fails (headless environment fallback under Claude's Discretion).
- **Token refresh logging at info level:** Token refresh MUST be silent in standard output. Log only at `debug`/`verbose` level.
- **Using `config.analysis.concurrency` directly in factory for subscription:** Must check `config.authMethod === 'subscription'` and override to 1 before constructing the provider.
- **Forgetting to shut down the callback HTTP server after receiving the code:** Memory leak and port blockage. Always call `server.close()` in the success path AND the error/timeout path.
- **Circular dependency via `pkce-login.ts` importing from `resolve.ts`:** `pkce-login.ts` should import only from `token-store.ts` and `types.ts`. `resolve.ts` imports from `pkce-login.ts` if needed, never the reverse.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PKCE code verifier/challenge generation | Custom `crypto.randomBytes` + base64url encoding | `openid-client`: `randomPKCECodeVerifier()` + `calculatePKCECodeChallenge()` | Subtle encoding requirements (base64url, no padding); `openid-client` handles edge cases |
| Authorization URL construction | Manual URLSearchParams assembly | `openid-client`: `buildAuthorizationUrl(config, params)` | Handles encoding, PKCE params, state correctly |
| Token exchange (code → tokens) | Manual `fetch()` to `/oauth/token` | `openid-client`: `authorizationCodeGrant(config, callbackUrl, checks)` | Validates state, verifies PKCE, handles error responses correctly |
| Token refresh | Manual `fetch()` to `/oauth/token` with `grant_type=refresh_token` | `openid-client`: `refreshTokenGrant(config, refreshToken)` | Handles rotating refresh tokens, error codes |
| Cross-platform browser launch | `child_process.exec('open')` | `open` npm package | Platform-specific; `open` handles macOS/Windows/Linux correctly with one call |

**Key insight:** The PKCE math (S256 challenge from verifier) is simple but error-prone. `openid-client` is the standard for this in the Node.js ecosystem. The only thing to hand-roll is the 10-line HTTP callback server using `node:http`.

---

## Common Pitfalls

### Pitfall 1: OpenAI OIDC Discovery Endpoint May Not Be Standard

**What goes wrong:** `client.discovery(new URL('https://auth.openai.com'), ...)` throws because `https://auth.openai.com/.well-known/openid-configuration` either doesn't exist or returns unexpected metadata.

**Why it happens:** OpenAI runs a custom authorization server. Their CLI (openai/codex) may hard-code endpoints rather than relying on discovery. This is unverified at research time.

**How to avoid:** Implement discovery with a try/catch fallback to a hard-coded `Configuration`:
```typescript
let config: client.Configuration;
try {
  config = await client.discovery(
    new URL('https://auth.openai.com'),
    CLIENT_ID,
    undefined,
    client.None(),
  );
} catch {
  // Fallback: hard-code known endpoints
  config = new client.Configuration(
    { issuer: 'https://auth.openai.com',
      authorization_endpoint: 'https://auth.openai.com/oauth/authorize',
      token_endpoint: 'https://auth.openai.com/oauth/token' },
    CLIENT_ID,
  );
}
```

**Warning signs:** `TypeError: fetch failed` or 404 during initial auth flow. Flag this for the spike session.

### Pitfall 2: Rotating Refresh Tokens (Single-Use)

**What goes wrong:** After using a refresh token, OpenAI issues a NEW refresh token. If the old one is persisted (because the write failed or the app crashed mid-refresh), subsequent refresh attempts get `401: refresh token already used`.

**Why it happens:** GitHub issues on the `openai/codex` repository confirm this behavior — "Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again." (Issues #6498, #9634).

**How to avoid:** After `refreshTokenGrant()` completes:
1. Update `StoredCredential.refreshToken` with the NEW refresh token from the response (if present).
2. Always persist with `store.write()` before returning the new access token.
3. If write fails, log the warning but still return the access token — the user may need to re-auth on the next run.

**Warning signs:** On refresh, always check `tokens.refresh_token` — if present, it replaces the old one.

### Pitfall 3: Browser Open Fails in Headless Environments

**What goes wrong:** `open(url)` silently succeeds (exit code 0) on macOS headless CI, but no browser actually opens. Or `open()` throws on Linux without a display.

**Why it happens:** `open` uses `xdg-open` on Linux which requires a display server. In CI or SSH sessions, no display is available.

**How to avoid:** Wrap `open()` in try/catch. On failure (or under Claude's Discretion: check `isTTY` + `isCI()`), fall back to printing the URL with `p.log.info()`. This is a "Claude's Discretion" area — determine the fallback behavior during planning.

**Warning signs:** `DISPLAY is not set` error on Linux, or user reports browser never opened.

### Pitfall 4: Callback Server Timeout Not Cleaning Up

**What goes wrong:** User closes the browser or denies authorization. The callback server keeps listening forever, blocking the CLI process from exiting.

**Why it happens:** `setTimeout` for the auth timeout is correct, but the `server.close()` call must also `reject()` the promise, not just close the server.

**How to avoid:** The timeout handler must call both `server.close()` AND `reject(new AuthError(...))`. Also call `server.close()` in any error path.

**Warning signs:** `handover auth login` hangs after browser is closed.

### Pitfall 5: `StoredCredential` Missing `refreshToken` Field

**What goes wrong:** Phase 21 defined `StoredCredential` without `refreshToken`. When Phase 23 writes OAuth tokens, the refresh token is silently dropped. Token refresh in Phase 23 (CDX-04) then always fails because there's no refresh token.

**Why it happens:** Oversight when building on the Phase 21 interface without updating it.

**How to avoid:** Phase 23 Plan 1 must extend `StoredCredential` with `refreshToken?: string`. This is backwards-compatible (Phase 21 api-key credentials don't have a refresh token; the field is optional).

**Warning signs:** `credentials.json` written without a `refreshToken` key; refresh fails with "no refresh token available".

### Pitfall 6: Concurrency Override Not Applied for All Subscription Paths

**What goes wrong:** `createProvider()` overrides concurrency to 1 for subscription, but `resolveAuth()` skips subscription validation for local providers. An edge case where provider is `openai` with `authMethod: subscription` but `isLocal` check fires incorrectly.

**Why it happens:** `factory.ts` checks `preset.isLocal` before auth checks. If the guard ordering is wrong, concurrency override could be skipped.

**How to avoid:** Apply the subscription concurrency guard AFTER the `isLocal` short-circuit but BEFORE constructing the provider. The guard should be independent of `isLocal` (local providers will never have `authMethod: subscription` after schema validation).

---

## Code Examples

Verified patterns from official sources:

### openid-client PKCE Flow (Complete)
```typescript
// Source: Context7 /panva/openid-client — verified API

import * as client from 'openid-client';
import { createServer } from 'node:http';
import net from 'node:net';
import open from 'open';

const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_ISSUER = new URL('https://auth.openai.com');
const OAUTH_SCOPE = 'openid profile email offline_access';
const AUTH_TIMEOUT_MS = 120_000; // 2 minutes — Claude's Discretion

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export async function pkceLogin(): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }> {
  const port = await getFreePort();
  const redirectUri = `http://localhost:${port}/auth/callback`;

  // Step 1: Discover or hard-code config
  const config = await client.discovery(OPENAI_ISSUER, OPENAI_CLIENT_ID, undefined, client.None());

  // Step 2: Generate PKCE + state
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  // Step 3: Build authorization URL
  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  // Step 4: Open browser + wait for callback
  const callbackUrl = await waitForCallback(port, authUrl.href, AUTH_TIMEOUT_MS);

  // Step 5: Exchange code for tokens
  const tokens = await client.authorizationCodeGrant(
    config,
    new URL(callbackUrl),
    { pkceCodeVerifier: codeVerifier, expectedState: state },
  );

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : undefined,
  };
}
```

### openid-client Refresh Token Grant
```typescript
// Source: Context7 /panva/openid-client — refreshTokenGrant

import * as client from 'openid-client';

const tokens = await client.refreshTokenGrant(config, credential.refreshToken, {
  scope: OAUTH_SCOPE,
});
// tokens.access_token — new access token
// tokens.refresh_token — new refresh token (if rotating; may be undefined if not rotating)
// tokens.expires_in — seconds until expiry
```

### Commander Nested Sub-Commands
```typescript
// Source: Context7 /tj/commander.js — .addCommand() for nested commands

import { Command } from 'commander';

const auth = new Command('auth').description('Manage auth credentials');
auth.command('login [provider]').description('...').action(handler);
auth.command('status').description('...').action(handler);

program.addCommand(auth); // in src/cli/index.ts
```

### @clack/prompts Spinner (Verified from installed v1.0.1)
```typescript
// Source: /Users/impera/Documents/GitHub/handover/node_modules/@clack/prompts/dist/index.d.mts
// SpinnerResult: { start(msg?: string): void; stop(msg?: string): void; message(msg?: string): void }

import * as p from '@clack/prompts';

const s = p.spinner();
s.start('Waiting for authentication...');
try {
  const result = await pkceLogin();
  s.stop('Authenticated successfully.');
} catch (err) {
  s.stop('Authentication failed.');
  throw err;
}
```

### auth status Table (picocolors)
```typescript
// Source: Existing pattern from src/cli/init.ts — p.note() with formatted lines
// docker context ls style: fixed-width columns

import pc from 'picocolors';

function renderAuthTable(rows: AuthStatusRow[]): string {
  const headers = ['PROVIDER', 'AUTH METHOD', 'STATUS', 'EXPIRES'];
  // Pad each column to the max width in that column
  // ...column-width calculation...
  const header = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  const separator = headers.map((_, i) => '-'.repeat(widths[i])).join('  ');
  const lines = rows.map(row =>
    [row.provider, row.authMethod, row.status, row.expires]
      .map((v, i) => v.padEnd(widths[i]))
      .join('  ')
  );
  return [pc.bold(header), separator, ...lines].join('\n');
}
```

---

## Decisions for Claude's Discretion

Research-backed recommendations for each open area:

### `--json` flag for auth commands
**Recommendation: YES for `auth status`, NO for `auth login`.**
- `auth status` benefits from `--json` for scripting (consistent with `analyze --json` pattern in existing CLI).
- `auth login` is inherently interactive; `--json` makes no sense.
- Existing CLI pattern: `analyze --json` outputs JSON to stdout. Mirror this.

### `auth login` with or without required argument
**Recommendation: Required argument `<provider>`, no interactive prompt when omitted.**
- Consistent with `gh auth login --hostname` pattern — explicit is better.
- Phase 23 scope is openai only; a prompt over a 1-item list adds noise.
- Error message when omitted: `"Provider required. Use: handover auth login openai"`

### `auth status` shows all or just active
**Recommendation: Show ALL configured providers (even if they just have api-key config).**
- `docker context ls` and `gh auth status` both show all, not just active.
- Shows `api-key` auth method for the active provider even if no credential file exists (sourced from config).
- Subscription provider shows token validity and expiry.

### Token refresh failure strategy
**Recommendation: Try current (possibly expired) token first, log a warning.**
- Rationale: If refresh fails, the current token might still work (server-side expiry tolerance). Failing immediately on refresh error would break flows unnecessarily.
- If current token also fails, the provider will return 401 → existing `ProviderError.requestFailed()` handles it, directing user to re-auth.

### Headless environment fallback
**Recommendation: Print URL with `p.log.info()` and continue waiting.**
- Detect via `!isTTY(process.stdout) || isCI()` before calling `open()`.
- Don't fail — headless users can copy/paste the URL.
- Consistent with how `gh auth login` handles `--no-browser` flag.

### Auth timeout duration
**Recommendation: 120 seconds (2 minutes).**
- Long enough for slow browser startups and user reading the auth page.
- Short enough to not hang the CLI indefinitely.
- Fixed, not configurable (adding a config option adds complexity for an edge case).

### 5-minute proactive refresh buffer: fixed or configurable
**Recommendation: Fixed at 5 minutes, not configurable.**
- 5 minutes is an industry standard (GitHub CLI, AWS CLI, etc.).
- Configurable buffers add cognitive overhead for no practical benefit.

### Re-auth behavior when valid tokens exist
**Recommendation: `p.confirm()` prompt asking "You are already logged in. Re-authenticate?"**
- Consistent with `gh auth login` which asks before overwriting.
- Default: `false` (don't re-authenticate unless user confirms).
- Skippable with a future `--force` flag if needed.

### Success feedback
**Recommendation: Terminal only (spinner stop message) + browser shows a success HTML page.**
- Both the terminal message (`s.stop('Authenticated. You can close the browser tab.')`) and the browser page ("Authentication complete. You can close this tab.") are shown.
- No system notification or other external feedback.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@openai/codex-sdk` for OAuth | `openid-client` v6 directly | Research finding (2026-02-27) | `@openai/codex-sdk` is a code-execution SDK, not an OAuth helper; `openid-client` is the correct library |
| Hard-coded port 1455 (Codex CLI approach) | `listen(0)` random port | Phase 23 design | Avoids conflicts; RFC 8252 compliant |
| OAuth callback in a browser tab only | Terminal spinner + browser page | Phase 23 design | Better UX; user sees both surfaces confirming auth state |

**Not deprecated — still current:**
- `TokenStore` from Phase 21 — only needs `refreshToken?` field added to `StoredCredential`
- `resolveAuth()` from Phase 21 — add proactive refresh logic as an internal step for subscription auth
- `createProvider()` from Phase 22 — add one guard for subscription concurrency

---

## Open Questions

1. **Does `https://auth.openai.com/.well-known/openid-configuration` exist?**
   - What we know: OpenAI Codex CLI uses `https://auth.openai.com/oauth/authorize` and `https://auth.openai.com/oauth/token` (confirmed via GitHub issues).
   - What's unclear: Whether `openid-client`'s `discovery()` works or needs hard-coded fallback.
   - Recommendation: Implement with try/catch fallback as described in Pitfall 1. The plan task should note: "attempt discovery first; fall back to hard-coded endpoints if discovery returns 404 or non-standard metadata."

2. **Does `openid-client`'s `None()` client authentication work with OpenAI's token endpoint for public clients?**
   - What we know: The client ID `app_EMoamEEZ73f0CkXaXp7hrann` is a public client (no client secret). `openid-client` has `client.None()` for public client authentication.
   - What's unclear: Whether OpenAI's token endpoint requires `client_id` in the request body even for public clients (some providers do, some don't).
   - Recommendation: Test during implementation. If `client.None()` fails, try passing `client_id` as a custom parameter to `authorizationCodeGrant`.

3. **Does the token response include a `refresh_token`?**
   - What we know: Multiple GitHub issues reference refresh token rotation behavior in OpenAI Codex, strongly implying refresh tokens ARE returned.
   - What's unclear: Whether `offline_access` scope is required to get a refresh token, or whether it's always included.
   - Recommendation: Request `offline_access` in scope (as confirmed by multiple community sources). If no refresh token is returned, proactive refresh (CDX-04) gracefully skips the refresh step.

4. **`StoredCredential` interface extension: backward compatibility**
   - What we know: Phase 21 defined `StoredCredential = { provider, token, expiresAt? }`. Phase 23 needs `refreshToken?`.
   - What's unclear: Whether `token-store.ts`'s `isValidCredential()` validator needs updating (it currently checks `provider` and `token` only — `expiresAt` and `refreshToken` are both optional, so no change needed to the validator).
   - Recommendation: Add `refreshToken?: string` to the interface in `src/auth/types.ts`. No change to `isValidCredential()`. No migration needed for existing api-key credentials.

---

## Sources

### Primary (HIGH confidence)
- Context7 `/panva/openid-client` — PKCE flow API: `randomPKCECodeVerifier`, `calculatePKCECodeChallenge`, `buildAuthorizationUrl`, `authorizationCodeGrant`, `refreshTokenGrant`, `discovery`
- Context7 `/tj/commander.js` — nested sub-commands via `.addCommand()`
- `/Users/impera/Documents/GitHub/handover/node_modules/@clack/prompts/dist/index.d.mts` — `spinner()` API (SpinnerResult: `start`, `stop`, `message`), version 1.0.1
- `/Users/impera/Documents/GitHub/handover/src/auth/types.ts` — existing `StoredCredential` interface
- `/Users/impera/Documents/GitHub/handover/src/auth/resolve.ts` — existing `resolveAuth()` to extend with refresh logic
- `/Users/impera/Documents/GitHub/handover/src/providers/factory.ts` — `createProvider()` to add subscription concurrency guard
- `/Users/impera/Documents/GitHub/handover/src/cli/index.ts` — Commander program to add `auth` command group
- `/Users/impera/Documents/GitHub/handover/src/cli/init.ts` — existing spinner + `p.note()` + `p.confirm()` usage patterns

### Secondary (MEDIUM confidence)
- GitHub issue #2798 (openai/codex) — confirmed: redirect URI pattern `http://localhost:<port>/auth/callback`, callback port 1455 in Codex CLI, authorization endpoint `https://auth.openai.com`
- OpenAI community forum: client ID `app_EMoamEEZ73f0CkXaXp7hrann`, authorization endpoint, token endpoint
- GitHub (numman-ali/opencode-openai-codex-auth) — confirms the OAuth implementation is based on official OpenAI flow
- WebSearch (multiple sources) — `open` npm package is the standard for CLI browser launch; ESM-only, v10.x

### Tertiary (LOW confidence)
- OAuth scope `openid profile email offline_access` — confirmed via multiple sources but not from official OpenAI documentation (auth docs page did not expose endpoint details)
- `https://auth.openai.com/.well-known/openid-configuration` existence — unverified; needs runtime check

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `openid-client` verified via Context7; `open` verified via npm; `@clack/prompts` spinner verified from installed package types; Commander nested commands verified via Context7
- Architecture: HIGH — patterns mirror existing codebase; auth module structure already established in Phase 21
- OAuth endpoints: MEDIUM — multiple consistent sources (GitHub issues, community forum, third-party implementations) but not official OpenAI OAuth documentation
- Pitfalls: HIGH — rotating refresh tokens verified from multiple GitHub issues on openai/codex repo

**Research date:** 2026-02-27
**Valid until:** 2026-03-13 (OAuth endpoint stability: MEDIUM — OpenAI can change endpoints, but breaking changes would be widely noticed; 2-week window is reasonable)
