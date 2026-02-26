# Feature Research

**Domain:** Subscription-based provider authentication for CLI tools
**Researched:** 2026-02-26
**Confidence:** HIGH (subscription policies and CLI auth patterns verified against official sources and live policy enforcement)

## Context: What Already Exists

The existing Handover CLI (v0.1.x) already has:
- API key-based auth for 8 providers (`anthropic`, `openai`, `ollama`, `groq`, `together`, `deepseek`, `azure-openai`, `custom`)
- Config loading via `.handover.yml` + env vars + CLI flags (layered precedence)
- `resolveApiKey()` reads API key from environment variable at runtime
- `validateProviderConfig()` fails fast if key not set
- `createProvider()` instantiates provider from config
- No auth storage, no auth commands, no session management

Everything below describes only features needed for the NEW subscription auth milestone.

---

## Critical Finding: Anthropic Policy (HIGH confidence)

**Claude Max/Pro subscription OAuth is banned for third-party tools.** Anthropic updated terms on 2026-02-19 to explicitly prohibit using OAuth tokens obtained through Claude Free, Pro, or Max accounts in any tool other than the official Claude Code CLI and Claude.ai. Server-side fingerprinting was deployed on 2026-01-09 to detect and block non-official clients.

**What this means for handover:** The `anthropic` provider with subscription auth is NOT implementable without violating Anthropic's terms. OpenAI Codex (ChatGPT Plus/Pro) subscription auth IS implementable and actively supported. This shapes what the feature set can deliver.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in a CLI with subscription auth. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **`handover auth login [provider]` command** | Every CLI with subscription auth (gh, codex, claude) exposes `auth login`; users copy this pattern | MEDIUM | Opens browser OAuth flow (PKCE); for headless, fall back to device code flow. Returns success/error message. |
| **`handover auth logout [provider]` command** | Paired with login; users expect to clear credentials | LOW | Deletes stored token for named provider; warns if no active session |
| **`handover auth status` command** | Users need to verify what is authenticated without running a generate job | LOW | Shows: provider name, auth method (api-key vs subscription), subscription tier if discoverable, token expiry if applicable |
| **Auth method selector in config** | When user has both an API key env var AND subscription auth, the tool needs to know which to use | LOW | Add `authMethod: "api-key" \| "subscription"` field to `.handover.yml` / config schema; default to `"api-key"` to not break existing users |
| **Subscription auth path through `generate` command** | The whole point is that `handover generate` works without an API key if subscription auth is active | MEDIUM | `generate` must check credential store before checking env var API key; provider factory wires the right client |
| **Graceful error when no auth exists** | Current error is "missing API key" — this is confusing to subscription users who have never set a key | LOW | Detect subscription auth attempt in config, provide clear message: "Run `handover auth login openai` to authenticate with your subscription" |
| **Secure credential storage** | Users expect tokens not stored in plaintext in config files | MEDIUM | macOS Keychain preferred; fallback to `~/.handover/credentials.json` with 0600 permissions; never write tokens to `.handover.yml` |
| **Token refresh on 401** | Subscription tokens expire (OpenAI Codex tokens auto-refresh on active sessions) | MEDIUM | On HTTP 401 from provider: attempt token refresh before surfacing error to user; refresh is transparent |
| **Precedence: env var API key overrides subscription** | Power users and CI pipelines must be able to override subscription auth with an explicit API key | LOW | Auth resolution order: CLI `--api-key` flag > env var (`OPENAI_API_KEY`) > subscription token from credential store. This matches how Codex handles it (they have an issue where the reverse caused problems, so explicit ordering matters). |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Clear "free tier vs subscription" cost display** | Subscription users do not pay per-token; showing a $0.00 cost or "subscription" badge instead of a dollar amount is genuinely useful and removes confusion | LOW | When auth method is `subscription`, suppress cost tracker output and show "subscription credits" label instead of dollar cost |
| **Multi-provider subscription auth in one tool** | Other CLI tools authenticate with only their own provider; handover supports multiple providers — users can pick the subscription they already pay for | MEDIUM | Auth store keyed by provider; each provider holds its own token independently; no conflicts |
| **Auth method visible in startup banner** | Users can see at a glance whether a run is consuming API credits vs subscription credits | LOW | Extend existing banner display with auth method indicator alongside provider/model |
| **Headless device code flow support** | Developers running handover over SSH or in containers can authenticate via device code without browser access on the target machine | MEDIUM | Device code flow is in beta for Codex; support `--device-code` flag in `auth login`; poll token endpoint until user completes browser flow on another device |
| **`handover auth token` command** | CI/CD users need a way to export a long-lived token to inject via env var | LOW | Prints the current access token to stdout; user can set `HANDOVER_AUTH_TOKEN` in CI secrets; follows claude `setup-token` pattern |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Claude Max/Pro subscription OAuth support** | Claude Max is the most popular subscription; developers want to use $100-$200/month plans they already pay for | Explicitly prohibited by Anthropic's updated Terms of Service (Feb 2026); server-side fingerprinting blocks non-official clients regardless of technical implementation | Support only providers that explicitly permit third-party subscription auth (OpenAI Codex); document Anthropic restriction clearly |
| **Proxy/relay architecture to "launder" subscription tokens** | Workaround for Anthropic ban via CLIProxyAPI-style relay | Still violates Anthropic ToS; accounts get banned; project becomes legally exposed | Do not implement; document why in code comments and help text |
| **Store subscription tokens in `.handover.yml`** | "Simple" config-file-centric design | Tokens in YAML committed to git = immediate credential exposure; YAML config is meant to be committed | Store in OS keychain or `~/.handover/credentials.json` (separate from project config, in home dir) |
| **Auto-login on first `generate` run without any auth configured** | "Zero friction" onboarding | Unexpected browser pop-ups during automated runs (CI, pre-commit hooks) are disruptive; user may be mid-run | Fail fast with a clear message directing user to run `handover auth login [provider]` explicitly |
| **Subscription rate limit retry with automatic backoff hiding from user** | "Just works" expectation | Subscription rate limits (5-hour rolling windows) can pause jobs for minutes; silent retry obscures this from users who may think the tool hung | Show explicit "Rate limited — waiting Xs (subscription limit)" message; let user cancel; do not silently sleep for >30s without feedback |

---

## Feature Dependencies

```
[Auth Method Config Field]
    └──required-by──> [generate: subscription auth path]
    └──required-by──> [auth login command]
    └──required-by──> [auth status command]

[auth login command]
    └──requires──> [OAuth PKCE browser flow]
                       └──optional-fallback──> [Device code flow]
    └──requires──> [Credential storage layer]
                       └──requires──> [OS keychain OR ~/.handover/credentials.json]
    └──produces──> [Stored token (access + refresh + expiry)]

[generate: subscription auth path]
    └──requires──> [Auth method selector in config]
    └──requires──> [Credential storage layer] (read)
    └──requires──> [Token refresh on 401]
    └──requires──> [Auth resolution precedence logic]

[Token refresh on 401]
    └──requires──> [Stored refresh token] (from auth login)

[auth token command]
    └──requires──> [Credential storage layer] (read)

[auth logout command]
    └──requires──> [Credential storage layer] (delete)

[Cost display suppression]
    └──requires──> [Auth method selector in config]
    └──enhances──> [generate: startup banner]
```

### Dependency Notes

- **Auth method config field is the root dependency:** everything else gates on knowing whether the user intends subscription or api-key auth. This field must be added to the Zod schema before any other auth work.
- **Credential storage is shared infrastructure:** `auth login`, `auth logout`, `auth status`, `auth token`, and `generate` all depend on a credential store abstraction. Build it once as a module used by all auth commands.
- **Auth resolution precedence must not break existing users:** the default `authMethod` must be `"api-key"`, so zero existing users are affected unless they explicitly set `authMethod: "subscription"`.
- **Token refresh depends on login having stored a refresh token:** if user logged in before refresh was supported, refresh will fail gracefully and prompt re-login.

---

## MVP Definition

### Launch With (v1, this milestone)

Minimum viable product — lets a user with an OpenAI Plus/Pro subscription run `handover generate` without an API key.

- [ ] **`authMethod` config field** — schema addition; defaults to `"api-key"`; required before all other work
- [ ] **Credential storage module** — `~/.handover/credentials.json` with 0600 perms as baseline; OS keychain as stretch goal
- [ ] **`handover auth login openai`** — browser OAuth PKCE flow; stores access + refresh + expiry
- [ ] **`handover auth logout openai`** — clears credential store entry
- [ ] **`handover auth status`** — shows auth method and login state per configured provider
- [ ] **Auth resolution in `generate`** — reads credential store when `authMethod: subscription`; respects env var override precedence
- [ ] **Clear error for missing subscription auth** — "Run `handover auth login openai` to authenticate" instead of generic API key error
- [ ] **Cost display suppression for subscription mode** — shows "subscription credits" instead of dollar amount

### Add After Validation (v1.x)

Features to add once core subscription auth is working and users are testing it.

- [ ] **Token refresh on 401** — trigger: first report of session expiry during a generate run
- [ ] **OS keychain storage (macOS Keychain, Windows Credential Manager)** — trigger: user reports `credentials.json` security concern
- [ ] **Headless device code flow** — trigger: first user running handover over SSH hits browser-open failure
- [ ] **`handover auth token` command for CI export** — trigger: first CI/CD integration request

### Future Consideration (v2+)

Features to defer until subscription auth is stable and adoption is visible.

- [ ] **Team/workspace shared auth tokens** — defer: complex; requires org-level OAuth scope negotiation
- [ ] **Multiple simultaneous subscription sessions (personal + work)** — defer: profile/workspace concept not yet in handover
- [ ] **Automatic subscription tier detection and model selection** — defer: requires plan introspection API that may not exist in stable form

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `authMethod` config field | HIGH | LOW | P1 |
| Credential storage module | HIGH | MEDIUM | P1 |
| `auth login openai` command | HIGH | MEDIUM | P1 |
| `auth logout openai` command | HIGH | LOW | P1 |
| `auth status` command | HIGH | LOW | P1 |
| Auth resolution in `generate` | HIGH | MEDIUM | P1 |
| Clear error for missing subscription auth | HIGH | LOW | P1 |
| Cost display suppression for subscription | MEDIUM | LOW | P1 |
| Token refresh on 401 | HIGH | MEDIUM | P2 |
| OS keychain storage | MEDIUM | MEDIUM | P2 |
| Headless device code flow | MEDIUM | MEDIUM | P2 |
| `auth token` command for CI | MEDIUM | LOW | P2 |
| Team/workspace shared tokens | LOW | HIGH | P3 |
| Multiple simultaneous sessions | LOW | HIGH | P3 |
| Automatic tier detection | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for milestone acceptance
- P2: Should have, add when core is working
- P3: Defer until subscription auth has real adoption

---

## User Journey: "I Have a ChatGPT Plus Subscription"

This is the complete flow from zero to working `handover generate` with subscription credits:

```
1. User has ChatGPT Plus ($20/month), no OPENAI_API_KEY set
2. User sets authMethod: subscription in .handover.yml
3. User runs: handover auth login openai
   → Browser opens to accounts.openai.com OAuth consent screen
   → User grants access
   → Browser redirects to localhost:PORT/callback
   → CLI captures code, exchanges for access+refresh tokens
   → Tokens written to ~/.handover/credentials.json (mode 0600)
   → Terminal: "Logged in to OpenAI (ChatGPT Plus)"
4. User runs: handover auth status
   → Terminal: "openai  subscription (ChatGPT Plus)  active  expires 2026-04-01"
5. User runs: handover generate
   → Config loaded; authMethod=subscription detected for openai
   → Credential store read; valid token found
   → AnthropicProvider/OpenAICompatProvider instantiated with subscription token
   → Banner shows: "OpenAI  gpt-4o  subscription credits"
   → Pipeline runs normally
   → Completion shows: "subscription credits" (not "$X.XX")
6. Token expires mid-session
   → HTTP 401 received from OpenAI
   → Refresh token used to obtain new access token
   → Credentials.json updated
   → Request retried transparently
   → User sees no interruption
```

---

## Competitor Feature Analysis

| Feature | GitHub CLI (`gh auth`) | Claude Code (`claude auth`) | OpenAI Codex CLI | Our Approach |
|---------|------------------------|------------------------------|------------------|--------------|
| **Login command** | `gh auth login` (browser + device code) | `claude auth login` (browser only) | `codex login` (browser + device code `--device-auth`) | `handover auth login [provider]` with browser + `--device-code` flag |
| **Logout command** | `gh auth logout` | `/logout` slash command (in REPL) | `codex logout` | `handover auth logout [provider]` |
| **Status command** | `gh auth status` (shows token scopes, expiry) | `claude auth status` | `codex auth status` | `handover auth status` (shows method + expiry per provider) |
| **Token storage** | OS keychain (default), falls back to `~/.config/gh/hosts.yml` | macOS Keychain | `~/.codex/auth.json` or OS keychain (configurable) | `~/.handover/credentials.json` (baseline), OS keychain (v1.x upgrade) |
| **CI/CD export** | `GH_TOKEN` env var; `gh auth token` prints token | `CLAUDE_CODE_OAUTH_TOKEN` env var | `OPENAI_API_KEY` env var override | `handover auth token` prints token; `HANDOVER_AUTH_TOKEN` env var |
| **Precedence** | Env var `GH_TOKEN` beats stored token | `ANTHROPIC_API_KEY` env var = API mode; no env var = subscription | Env var `OPENAI_API_KEY` conflicts with stored session (known bug) | Env var always wins; `authMethod: subscription` only used when no env var present |

---

## Sources

- [Using Claude Code with Pro or Max plan — Claude Help Center](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
- [Anthropic clarifies ban on third-party tool access to Claude — The Register (2026-02-20)](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/)
- [Claude Code Authentication docs](https://code.claude.com/docs/en/authentication)
- [OpenAI Codex CLI Authentication — developers.openai.com](https://developers.openai.com/codex/auth/)
- [OpenAI Codex CLI docs](https://developers.openai.com/codex/cli/)
- [Claude Code CLI 2.1.41 changelog — added `claude auth login/status/logout`](https://x.com/ClaudeCodeLog/status/2022191647996416304)
- [GitHub CLI gh auth login manual](https://cli.github.com/manual/gh_auth_login)
- [WorkOS: Best practices for CLI authentication](https://workos.com/guide/best-practices-for-cli-authentication-a-technical-guide)
- [PKCE for CLI OAuth — kevcodez.de](https://kevcodez.de/posts/2020-06-07-pkce-oauth2-auth-flow-cli-desktop-app/)
- [Sign in with API key via env variable conflicts with ChatGPT login — openai/codex#3286](https://github.com/openai/codex/issues/3286)
- [Claude Max subscription rate limits — IntuitionLabs](https://intuitionlabs.ai/articles/claude-max-plan-pricing-usage-limits)
- [keyring-node: keytar alternative — Brooooooklyn/keyring-node](https://github.com/Brooooooklyn/keyring-node)

---
*Feature research for: Subscription-based provider auth (Claude Max, OpenAI Plus/Pro, Codex)*
*Researched: 2026-02-26*
