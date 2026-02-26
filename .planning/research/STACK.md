# Stack Research

**Domain:** Subscription-based provider auth (Claude Max, OpenAI Plus/Pro, Codex) for TypeScript CLI
**Researched:** 2026-02-26
**Confidence:** HIGH

---

## The Most Important Finding (Read First)

This research reveals a fundamental constraint that shapes the entire milestone.

**Claude Max / Claude Pro subscription auth in third-party CLIs is a Terms-of-Service violation.**
Anthropic explicitly banned it. Enforcement began January 9, 2026. The official Claude Code docs state:

> "Using OAuth tokens obtained through Claude Free, Pro, or Max accounts in any other product, tool, or service — including the Agent SDK — is not permitted and constitutes a violation of the Consumer Terms of Service."

Source: https://code.claude.com/docs/en/legal-and-compliance (HIGH confidence — official Anthropic documentation)

This makes "Claude Max subscription auth" a non-starter for a published npm package. Any milestone building this must either:
1. Target OpenAI Codex OAuth only (which OpenAI permits), or
2. Reframe the milestone around improving the existing API-key-based provider flow

See "Subscription Auth Reality Matrix" below for a provider-by-provider breakdown.

---

## Subscription Auth Reality Matrix

| Provider | Product Name | Official Third-Party OAuth? | API Key Required? | Status |
|----------|-------------|----------------------------|-------------------|--------|
| Anthropic | Claude Max ($100-$200/mo) | **NO — explicitly banned** | Yes, separate billing | Enforcement active since Jan 9, 2026 |
| Anthropic | Claude Pro ($20/mo) | **NO — explicitly banned** | Yes, separate billing | Same ban applies |
| OpenAI | ChatGPT Plus ($20/mo) | **YES for Codex CLI/SDK** | Also supported | Third-party integration permitted |
| OpenAI | ChatGPT Pro ($200/mo) | **YES for Codex CLI/SDK** | Also supported | Cline, OpenCode both use it officially |
| OpenAI | API Key | N/A — is the key | Required | Separate from subscription billing |

### Anthropic — Claude Max (HIGH confidence)

The $100/$200/month Claude Max subscription provides unlimited token usage **only through**:
- Claude.ai (web/desktop/mobile)
- The official `claude` CLI (Claude Code)

It does **not** translate into API access. The `@anthropic-ai/sdk` requires a `sk-ant-...` API key from console.anthropic.com. OAuth tokens from Max accounts cannot be used with the SDK. Anthropic actively enforces this with server-side checks.

Source: https://github.com/anthropics/claude-code/issues/6536 (HIGH — official repo issue with Anthropic response)

### OpenAI Codex — ChatGPT Plus/Pro (HIGH confidence)

OpenAI takes the opposite approach. ChatGPT Plus and Pro subscriptions **include** Codex, and OpenAI explicitly supports third-party tools using Codex OAuth:

- Cline (VS Code extension) uses Codex OAuth officially, documented at https://docs.cline.bot/provider-config/openai-codex
- OpenCode shipped Codex OAuth in v1.1.11 (January 10, 2026), reportedly with OpenAI coordination
- The `@openai/codex-sdk` npm package enables programmatic Codex use from third-party apps

The OAuth flow uses PKCE, launches a browser, runs a local callback server on port 1455, and stores tokens in `~/.codex/auth.json` or the OS keychain. Tokens refresh automatically.

Source: https://cline.bot/blog/introducing-openai-codex-oauth (MEDIUM — official Cline blog)
Source: https://developers.openai.com/codex/auth/ (HIGH — official OpenAI documentation)

**Caveat:** OpenAI's Terms of Use prohibit sharing account credentials and reselling subscription access. Integrating Codex OAuth for individual end-user personal use appears permitted (as Cline does), but building a proxy service where one account serves many users would be prohibited.

---

## Recommended Stack (For OpenAI Codex OAuth Path)

This is the only viable subscription-auth path for a published npm CLI tool.

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `openai` | `^6.25.0` | OpenAI API calls (already in repo) | Already present. Also the SDK used under the hood by Codex auth flows. No new SDK needed. |
| `@openai/codex-sdk` | latest (verify on npm) | Programmatic Codex agent invocation | Official OpenAI SDK for embedding Codex in third-party tools. Wraps `@openai/codex` CLI, exchanges JSONL over stdin/stdout. Requires Node 18+. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `openid-client` | `^6.8.2` | OAuth 2.0 / OIDC client with PKCE | Use for implementing the Codex ChatGPT login flow from scratch if `@openai/codex-sdk` auth is insufficient. Full TypeScript, supports browser redirect + local callback server pattern. |
| `@napi-rs/keyring` | `^1.2.0` | Secure OS credential storage | Store OAuth tokens in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service). Actively maintained replacement for abandoned `node-keytar`. |
| `cross-keychain` | latest | Cross-platform keychain abstraction | Wraps `@napi-rs/keyring` with a simpler API. Use if you want a single abstraction over OS credential stores. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Existing `vitest` suite | Test auth flow without live credentials | Mock the browser-open step; test token storage/retrieval. No new test framework. |
| Existing `commander` | Add `handover auth login --provider openai-codex` command | Extend existing CLI command structure, do not add a new CLI framework. |
| `@openai/codex` (peer dep) | Required runtime for `@openai/codex-sdk` | The SDK wraps the CLI; it must be installed alongside the SDK. |

---

## Installation

```bash
# If building Codex OAuth subscription auth:
npm install @openai/codex-sdk

# For OAuth browser flow (only if building auth from scratch, not using codex-sdk):
npm install openid-client

# For secure token storage (add as optional dependency):
npm install @napi-rs/keyring

# Dev only — no new dev dependencies needed; extend existing vitest + commander
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@openai/codex-sdk` for Codex integration | Reverse-engineer Codex OAuth manually | Never for a production npm package. The SDK is official and supported. |
| `@napi-rs/keyring` for token storage | `keytar` | Only if the project needs to support Node versions where napi-rs has issues. `keytar` is archived (December 2022) and no longer maintained. |
| `@napi-rs/keyring` for token storage | Store tokens in `~/.config/handover/auth.json` | Acceptable fallback for simplicity; less secure than OS keychain but standard for CLIs (GitHub CLI does this too). Use `chmod 600`. |
| `openid-client` for custom OAuth flows | `passport.js` + strategy | Never for a CLI tool. Passport is server-middleware for web apps, not CLI auth flows. |
| OpenAI Codex OAuth (supported) | Claude Max OAuth (banned) | Never implement Claude Max OAuth in a published npm package. Account bans and ToS violation. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Claude Max / Pro OAuth tokens in third-party code | Explicit ToS violation since Feb 2024, enforcement since Jan 9, 2026. Account bans. Anthropic has server-side blocking. | Anthropic API keys from console.anthropic.com |
| `node-keytar` | Archived December 2022. No security patches. Native build failures on newer Node. | `@napi-rs/keyring` |
| Storing OAuth tokens in plaintext config without `chmod 600` | Security risk — other processes can read credentials | OS keychain via `@napi-rs/keyring` or file at `~/.config/handover/auth.json` with restricted permissions |
| Any "proxy" approach that routes multiple users through one subscription account | Violates OpenAI Terms of Use on credential sharing and account resale | Each end user must authenticate with their own ChatGPT account |
| Unofficial Anthropic OAuth reverse-engineering (CLIProxyAPI, opencode-anthropic-auth patterns) | ToS violation, account ban risk, no stable API contract, breaks without notice | Anthropic API keys |

---

## Stack Patterns by Variant

**If building OpenAI Codex OAuth (the only supported subscription path):**
- Add `@openai/codex-sdk` as a runtime dependency
- Add `@napi-rs/keyring` (or fallback to file-based storage) for token persistence
- Add `handover auth login --provider openai-codex` command to existing `commander` CLI
- Store auth state under a new `auth` block in config or in `~/.config/handover/`
- Keep API-key path as the default; subscription auth is opt-in

**If NOT building subscription auth (recommended given the constraint):**
- The existing API-key model is the correct path for Claude
- No new dependencies needed
- Consider improving the UX for `ANTHROPIC_API_KEY` setup instead

**If the team still wants "Claude Max support":**
- The only compliant path is: document that Claude Max users should also set up an Anthropic API key
- The API and Max subscription are separate products with separate billing
- There is no technical bridge from Max subscription credits to the Anthropic SDK

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@openai/codex-sdk` (latest) | Node `>=18` | Requires `@openai/codex` CLI installed alongside as peer dependency |
| `@napi-rs/keyring@1.2.0` | Node `>=18`, macOS/Windows/Linux | NAPI-RS native bindings. Prebuilt binaries on npm — no compilation needed. |
| `openid-client@6.8.2` | Node `>=20.19.0` or `>=22.12.0` for CJS compatibility | ESM-first. Requires `>=20.19.0` for `require(esm)` to work. |
| `openai@^6.25.0` | Existing stack | Already in repo at `^6.22.0`; minor version bump only |
| `@anthropic-ai/sdk@0.78.0` | API keys only | Does not accept OAuth tokens from Max/Pro subscriptions. API key is the only auth path. |

---

## Existing SDK Auth Capabilities

This is what the current Anthropic and OpenAI SDKs already support, for reference:

**`@anthropic-ai/sdk` (current: `0.78.0`):**
- `apiKey`: `sk-ant-...` from console.anthropic.com — **the only supported auth method for third-party tools**
- `authToken`: `Authorization: Bearer` header — exists in SDK interface but OAuth tokens from consumer plans are blocked server-side
- No built-in OAuth flow

**`openai` (current: `^6.25.0`):**
- `apiKey`: Standard OpenAI API key — works for all models at API pricing
- No built-in ChatGPT OAuth flow (Codex OAuth is handled by the Codex CLI/SDK layer, not the base OpenAI SDK)

---

## Cost Context for Documentation/UX

Handover documentation should help users understand the tradeoffs:

| Auth Method | Provider | Monthly Cost | Notes |
|-------------|----------|-------------|-------|
| Anthropic API key | Anthropic | Pay-per-token ($5/$25 per million for Opus 4.6) | The only supported third-party path |
| Claude Max | Anthropic | $100-$200/month flat | Cannot be used with third-party CLIs; only Claude.ai + official Claude Code |
| OpenAI API key | OpenAI | Pay-per-token (Codex model pricing varies) | Standard path |
| ChatGPT Plus + Codex OAuth | OpenAI | $20/month flat | Supported via `@openai/codex-sdk` |
| ChatGPT Pro + Codex OAuth | OpenAI | $200/month flat | Supported via `@openai/codex-sdk`, higher rate limits |

---

## Sources

- https://code.claude.com/docs/en/legal-and-compliance — Official Anthropic documentation on OAuth ban (HIGH)
- https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/ — Coverage of ban enforcement and ToS update (HIGH — confirmed against official docs)
- https://github.com/anthropics/claude-code/issues/6536 — GitHub issue confirming SDK does not accept Max OAuth tokens (HIGH)
- https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console — Anthropic official confirmation API and subscription are separate products (HIGH)
- https://developers.openai.com/codex/auth/ — Official Codex CLI OAuth documentation; PKCE flow, local callback server (HIGH)
- https://cline.bot/blog/introducing-openai-codex-oauth — Cline official blog on Codex OAuth integration for third-party tools (MEDIUM — no explicit OpenAI ToS quote)
- https://docs.cline.bot/provider-config/openai-codex — Cline official docs confirming Codex OAuth as a supported provider (MEDIUM)
- https://developers.openai.com/codex/pricing/ — Plans including Codex (ChatGPT Plus, Pro, Business, Enterprise) (HIGH)
- https://github.com/openai/codex/tree/main/sdk/typescript — `@openai/codex-sdk` source: requires `CODEX_API_KEY` or CLI auth (HIGH)
- https://github.com/Brooooooklyn/keyring-node — `@napi-rs/keyring` as keytar replacement (HIGH)
- https://www.npmjs.com/package/openid-client — `openid-client` v6.x API and Node compatibility (HIGH)
- https://openai.com/policies/row-terms-of-use/ — OpenAI prohibits credential sharing / account resale (HIGH — official policy)

---

*Stack research for: Subscription-based provider auth additions to handover-cli*
*Researched: 2026-02-26*
