# Pitfalls Research

**Domain:** Subscription-based provider auth (Claude Max, OpenAI Plus/Pro, Codex) added to existing TypeScript CLI with API key auth
**Researched:** 2026-02-26
**Confidence:** HIGH — Critical TOS findings from official Anthropic policy and The Register reporting; token security from Google, Auth0, and RFC 9700; rate limit details from official provider docs

---

## Critical Pitfalls

### Pitfall 1: Using Claude Subscription OAuth Tokens in Any Third-Party Tool is a TOS Violation

**What goes wrong:**
Developers implement OAuth flows to exchange Claude Free/Pro/Max subscription credentials for access tokens and use them to make programmatic API calls. The integration works initially, then Anthropic server-side blocks it without notice. Accounts face potential suspension.

**Why it happens:**
Claude Code itself is an open-source CLI that authenticates via OAuth to Anthropic's backend. Developers observe this mechanism, extract the pattern, and replicate it in other tools. The integration looks legitimate — it uses the same OAuth flow, same endpoints, same tokens.

**The hard constraint:**
Anthropic's Consumer Terms of Service explicitly state: "Using OAuth tokens obtained through Claude Free, Pro, or Max accounts in any other product, tool, or service — including the Agent SDK — is not permitted and constitutes a violation of the Consumer Terms of Service."

Anthropic enforced this with a silent server-side block on January 9, 2026 — no advance notice — and formally documented the ban on February 17-18, 2026. Tools including OpenCode, OpenClaw, and Cline lost Claude subscription access immediately. This is a real risk, not hypothetical.

**How to avoid:**
- Do NOT implement Claude subscription OAuth flows in Handover.
- The only permitted programmatic access to Claude from a third-party tool is via API keys (`ANTHROPIC_API_KEY`) through the official REST API.
- If users ask about using their Max subscription instead of paying for API tokens, explain the policy explicitly and link to the official Anthropic guidance.
- API keys remain fully supported with no restrictions.

**Warning signs:**
- Any code that initiates `https://claude.ai/oauth` or `https://claude.ai/auth` flows.
- Any code storing tokens to `~/.claude/oauth_token.json` or equivalent.
- Any PR or feature request titled "support Claude Max/Pro subscription auth."

**Phase to address:**
Auth implementation phase — establish a clear decision: Claude support = API key only, no subscription OAuth.

---

### Pitfall 2: OpenAI ChatGPT Plus/Pro Subscription Access Does Not Include API Access — These Are Separate Products

**What goes wrong:**
Developers assume that a user's ChatGPT Plus or Pro subscription grants programmatic API access. They build a "use your ChatGPT subscription" auth flow. Users configure it, and calls fail with authentication errors because subscription credentials don't work against the OpenAI API.

**Why it happens:**
OpenAI pricing pages emphasize "access to GPT-4o" and "advanced models" for Plus subscribers. This is for the ChatGPT web/app product. The OpenAI API is entirely separate with its own billing. There is no token exchange, no OAuth bridge, and no way to route API calls through a ChatGPT subscription.

**The hard constraint:**
ChatGPT Plus ($20/month) and the OpenAI API have completely separate billing, separate authentication, and separate feature sets. OpenAI's Services Agreement also prohibits buying, selling, or transferring API keys to third parties, and prohibits circumventing rate limits or restrictions.

**How to avoid:**
- OpenAI support in Handover = API key auth only (`OPENAI_API_KEY`).
- If implementing "OpenAI Plus" support, this is not feasible. The feature is simply not possible without violating TOS.
- Document clearly for users: "You need an OpenAI API key, not a ChatGPT subscription."

**Warning signs:**
- Feature requests to "use ChatGPT credentials instead of API key."
- Any code attempting to authenticate against `https://chat.openai.com/` endpoints.
- Confusion in issues where users provide ChatGPT credentials and report auth failures.

**Phase to address:**
Provider configuration and documentation phase — state clearly which auth method is supported per provider.

---

### Pitfall 3: OAuth Refresh Token Stored in Plaintext Config File

**What goes wrong:**
Subscription OAuth flows produce both a short-lived access token and a long-lived refresh token. Developers store both in a JSON config file (e.g., `~/.handover/credentials.json`). The refresh token persists indefinitely. If a user's machine is compromised, the attacker gains persistent access to the LLM provider account — not just a short window.

**Why it happens:**
Saving to a JSON config file is the path of least resistance for CLI credential storage. API keys are already stored this way (and have the same problem), so developers apply the same pattern to OAuth tokens without recognizing that refresh tokens have different security characteristics: they are long-lived, revocable only via the provider, and represent full account access rather than limited API scope.

**How to avoid:**
- For any OAuth tokens, use the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service via `keytar` or `@keytar/node`) rather than plaintext files.
- If OS keychain is unavailable (e.g., headless server), warn the user explicitly and fall back to a clearly-marked insecure storage path.
- Apply the same best practice to API keys: they should not be in plaintext config files committed to git.
- Ensure `.gitignore` excludes credential files.
- Follow RFC 9700 (January 2025): access tokens should expire in 5-15 minutes; refresh tokens should expire within 7-30 days maximum.

**Warning signs:**
- `credentials.json` or `auth.json` containing token fields stored under the project directory.
- No keytar/keychain dependency in `package.json` when OAuth is supported.
- CI logs showing token values.
- Missing `.gitignore` entries for credential files.

**Phase to address:**
Auth implementation phase — choose secure storage before writing any credential persistence code.

---

### Pitfall 4: Silent Mid-Run Auth Failures Corrupt 6-Round Analysis Output

**What goes wrong:**
Handover runs 6 sequential LLM rounds. An OAuth access token expires mid-run (e.g., after round 3). The API returns 401. The CLI doesn't handle this gracefully — it either crashes with an unhelpful error, silently truncates output, or retries indefinitely. The partially-generated handover document is either not saved or saved in an incomplete state the user doesn't know is broken.

**Why it happens:**
OAuth access tokens are short-lived (Anthropic's Claude Code tokens have been observed expiring in hours; RFC 9700 recommends 5-15 minutes for sensitive APIs). API key auth is stateless — it doesn't expire mid-run. Developers design error handling around API key patterns (401 = wrong key, don't retry) and don't account for token refresh mid-sequence.

**How to avoid:**
- Implement proactive token refresh: refresh the access token before each round (not just at startup) if token expiry is within a safe margin (e.g., 2 minutes).
- Classify 401 errors: if using OAuth, attempt one token refresh and retry. If still 401, surface a clear re-auth message.
- If mid-run refresh fails, save partial output with an explicit `[INCOMPLETE: auth failed at round N]` marker.
- Test the token-expiry-during-run scenario explicitly.

**Warning signs:**
- Error handler for 401 that just throws without attempting refresh.
- Token loaded once at startup, never rechecked during multi-round runs.
- No partial output save on auth failure.

**Phase to address:**
Auth implementation phase, and validated during multi-round integration testing.

---

### Pitfall 5: Rate Limit Mismatch — Subscription Limits Are Message-Based, Not Token-Based

**What goes wrong:**
A developer implements subscription auth and assumes rate limits behave like API rate limits (tokens/minute, requests/minute). They implement the same retry-with-backoff logic. But subscription rate limits count weighted "messages" in 5-hour rolling windows, not raw requests. A single 6-round Handover analysis may consume 6-60+ message units depending on context length — and the user hits their weekly limit after only a few runs without warning.

**How it differs:**

| Auth Type | Rate Limit Unit | Window | Notes |
|-----------|----------------|--------|-------|
| API key (Tier 1) | 50 requests/min, 40K tokens/min | Per minute | Token-based, resets every minute |
| Claude Pro subscription | ~45 Opus 4 messages | 5-hour rolling | Message = weighted token consumption |
| Claude Max 5x ($100/mo) | ~225 Opus 4 messages | 5-hour rolling | 5x Pro capacity |
| Claude Max 20x ($200/mo) | ~900 Opus 4 messages | 5-hour rolling | Professional tier |
| OpenAI Codex Plus | 30-150 messages | 5-hour window | Platform-specific |
| OpenAI Codex Pro | 300-1,500 messages | 5-hour window | |

A 6-round Handover run on long codebase context could consume 60-90+ weighted message units (context grows each round). On Claude Pro that is ~1/3 to 2/3 of a 5-hour window per single run.

**Why it happens:**
Developers test with short prompts where subscription limits don't bite. Multi-round analysis with growing context is exactly the worst case for message-weighted rate limits.

**How to avoid:**
- Surface the auth method to users prominently, including its limit characteristics.
- Add a pre-run estimate: "This analysis may consume approximately N context tokens across 6 rounds. Your current tier allows approximately M message units per 5 hours."
- On 429 errors from subscription endpoints, return a user-friendly message explaining remaining window time, not just a generic "rate limited, retry in Xs."
- Do NOT assume the same retry logic works for subscription 429s as for API key 429s — subscription 429s may require waiting hours, not seconds.

**Warning signs:**
- Same `retryWithBackoff` function used for both subscription and API key 429s.
- No distinction between "rate limited for 30 seconds" (API) and "rate limited for 4.5 hours" (subscription window).
- No token estimation before multi-round runs.

**Phase to address:**
Rate limit handling phase — implement provider-aware error handling, not generic retry logic.

---

### Pitfall 6: Users Confused About Which Auth Method Is Active

**What goes wrong:**
User configures both an API key and subscription auth "just in case." The tool silently picks one. The wrong one gets used — either the user pays API costs thinking they're using their subscription, or subscription limits get consumed thinking the API key is active. Support requests become impossible to diagnose because auth state is implicit.

**Why it happens:**
Adding a second auth method to a tool that previously had one creates a precedence question the developer answers implicitly in code. Users don't see which method was selected. When something goes wrong, both user and developer are debugging without a shared understanding of which auth path ran.

**How to avoid:**
- Always print which auth method is active at the start of a run: `[auth] Using API key for claude-3-5-sonnet-20241022` or `[auth] Using subscription (Claude Max) for claude-3-5-sonnet-20241022`.
- Make precedence explicit and documented: e.g., "API key takes precedence over subscription auth if both are configured."
- Add a `handover auth status` command that shows which credentials are configured, which will be used, and their current validity.
- Never silently fall back from one auth method to another — if the configured method fails, surface the failure with the method name.

**Warning signs:**
- No logging of which auth path was taken.
- Fallback logic with no user notification.
- Users opening issues with "it's not using my API key" or "it's not using my subscription."

**Phase to address:**
Auth implementation phase — design the auth selection UX before writing the provider logic.

---

### Pitfall 7: Credential Files Inadvertently Published in npm Package

**What goes wrong:**
A Handover contributor adds credential or config files to the project root during development. The `.npmignore` or `files` field in `package.json` is not configured to exclude them. A release publishes `credentials.json`, `~/.handover/config.json` or test fixture files containing real API keys to npm. The keys are immediately scraped by automated bots that watch npm publish feeds.

**Why it happens:**
npm publishes everything in the package directory by default unless explicitly excluded. Development config files accumulate in the project root. The `files` field in `package.json` is often not set, relying on `.npmignore` which may not be complete. Security scanning tools targeting AI assistant CLIs (McpInject, credential harvesting npm packages) specifically target `.claude/`, `.env`, and config files.

**How to avoid:**
- Use the `files` allowlist in `package.json` (explicit inclusion is safer than exclusion): only include `dist/`, `bin/`, `README.md`, `LICENSE`.
- Add to `.npmignore`: `*.json` (all JSON at root except package.json), `.env*`, `credentials*`, `config*`, `.handover/`.
- Run `npm pack --dry-run` in CI to audit what would be published before every release.
- Never commit test fixtures containing real credentials.
- Rotate any key that may have been exposed immediately — even briefly published secrets are scraped.

**Warning signs:**
- No `files` field in `package.json`.
- `.npmignore` does not exist or does not explicitly exclude config/credential patterns.
- `npm pack --dry-run` not in the release checklist.
- Credential files present in the project root.

**Phase to address:**
Pre-release security phase — add npm publish audit to CI before any release that includes new auth features.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store OAuth tokens in same JSON file as API keys | One credential store, simple code | Refresh token persists indefinitely in plaintext; different security requirements get same weak treatment | Never |
| One generic `retryWithBackoff` for all 429s | Simple code | Subscription 429s require hours-long wait, not seconds; wrong backoff confuses users and wastes time | Never in production |
| Implement Claude subscription OAuth "because users want it" | Feature request satisfied | Active TOS violation; Anthropic will server-block it with no notice; user accounts at risk | Never |
| Check auth method only at startup, not per-round | Simpler startup flow | OAuth token expires mid-run, round 4-6 fail silently with 401 | MVP only if tokens are long-lived (24h+), never for OAuth |
| Display "using Claude" without specifying which auth method | Less verbose output | User cannot diagnose billing/limit issues; "it's charging my API key when I set up subscription" complaints | Never |
| Skip `handover auth status` command | Saves implementation time | Users cannot verify their configuration; first sign of problems is a failed run | Acceptable to defer until v2, but ship before subscription auth goes stable |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Anthropic subscription auth | Implementing OAuth token exchange for Claude Max/Pro | Use API keys only for third-party tools; subscription OAuth is blocked server-side and violates TOS |
| OpenAI subscription auth | Assuming ChatGPT Plus credentials work with the API | OpenAI API and ChatGPT are completely separate products with separate billing; no bridge exists |
| OAuth token refresh | Loading token once at startup, assuming it's valid for the run | Validate and refresh before each LLM round; short-lived tokens can expire in minutes |
| Subscription 429 errors | Treating subscription rate limits like API rate limits (seconds-long backoff) | Subscription 429s may mean a 5-hour window is exhausted; backoff logic must be provider-and-auth-method-aware |
| Credential file storage | Writing tokens to plaintext JSON alongside project files | Use OS keychain for OAuth tokens; use scoped dotfiles with restrictive permissions for API keys |
| npm publish with credentials | Relying on default publish behavior or incomplete .npmignore | Use explicit `files` allowlist in package.json; run `npm pack --dry-run` in CI |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| 6-round analysis with growing context on subscription auth | 3rd or 4th run in a day hits 5-hour message limit | Estimate token usage before runs; warn user; use API key for heavy workloads | Immediately visible on Claude Pro; Max 5x gives more headroom |
| Same token used across concurrent Handover runs | First run depletes window; second fails mid-analysis | Subscription auth is inherently single-user, single-session; document this constraint | Any parallel usage scenario |
| No pre-run auth validation | Failure at round 3 of 6 with no partial save | Validate credentials before starting; surface expiry warnings before committing to run | Every token expiry event |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing OAuth refresh tokens in plaintext dotfiles | Persistent account compromise if file is read (supply chain attack, shared machine, git leak) | Use OS keychain via `keytar`; warn explicitly when falling back to plaintext |
| Publishing credential fixtures to npm | Immediate automated scraping by bots monitoring npm publish feed | Use `files` allowlist in `package.json`; `npm pack --dry-run` in CI |
| Implementing Claude subscription OAuth | TOS violation; Anthropic server-block; account suspension risk | API key only for Claude in third-party tools |
| No distinction between auth methods in logs | Cannot audit which auth was used; security incident investigation fails | Always log auth method (not credential value) at run start |
| Logging full API keys or tokens in debug output | Key exposure in CI logs, shared terminals | Redact tokens in all log output; never log credential values, only last 4 chars or `[redacted]` |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No indication of which auth method is active | User pays API costs when they believe subscription is being used; impossible to diagnose billing disputes | Print `[auth] method: API key (claude-3-5-sonnet-20241022)` at run start |
| Generic "rate limited" error on subscription 429 | User retries in 10 seconds; fails again; retries indefinitely | Surface remaining window time: "Rate limit reached. Your subscription window resets in 4h 12m." |
| No per-provider auth configuration documentation | Users configure wrong credential type (ChatGPT account for OpenAI API, Max subscription for Claude) | Provide per-provider setup guide: "Claude requires an API key from console.anthropic.com. Subscription plans are not supported." |
| Silent fallback to API key when subscription fails | User thinks subscription worked; gets an unexpected API bill | Never silently switch auth methods; fail explicitly with which method failed and why |
| No `auth status` command | User cannot verify configuration before running an expensive multi-round analysis | Implement `handover auth status` showing configured providers, active method, and validity state |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Subscription auth for Claude:** "It works" may mean TOS violation — verify that no OAuth flows are used, only API keys, and document this constraint for users explicitly.
- [ ] **OAuth token refresh:** Token refresh at startup is not enough — verify that refresh is checked before each LLM round in the 6-round sequence.
- [ ] **Rate limit handling:** Generic 429 retry works for API keys — verify that subscription-mode 429s surface the remaining window time, not just "retry in Xs."
- [ ] **Auth method display:** Output shows "using Claude" — verify that the specific auth method (API key vs subscription) is printed, not just the provider name.
- [ ] **Credential file security:** Config file exists — verify that OAuth refresh tokens use OS keychain, not plaintext JSON; verify API key files have restrictive permissions (chmod 600).
- [ ] **npm publish safety:** Build succeeds — verify `npm pack --dry-run` output contains no credential or config files; verify `files` field in `package.json` is an explicit allowlist.
- [ ] **Multi-round auth failure:** 6-round analysis completes on valid credentials — verify that partial output is saved with clear incomplete marker when auth fails mid-run.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| TOS violation via Claude subscription OAuth | HIGH | Remove OAuth code immediately; communicate to users that API keys are required; monitor for account suspension notifications from Anthropic |
| Credentials published to npm | HIGH | Immediately revoke all exposed keys; publish a new clean version; audit all npm publish history; notify users to rotate their credentials if any were in test fixtures |
| OAuth refresh token in plaintext file leaked | HIGH | User must revoke token at provider dashboard; rotate to new credentials; migrate storage to OS keychain |
| Mid-run auth failure corrupts output | MEDIUM | Add partial-save recovery; mark incomplete output clearly; implement pre-run auth validation |
| User confusion about active auth method | LOW | Add `auth status` command; add auth method to run output; update documentation |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Claude subscription OAuth TOS violation | Auth design phase (decision: API key only for Claude) | No OAuth code paths exist in codebase for Claude; documented in README |
| OpenAI subscription confusion | Auth design phase + documentation | Provider setup docs explicitly state API key requirement per provider |
| OAuth tokens in plaintext config | Auth implementation phase | keytar dependency present; plaintext fallback emits security warning |
| Token expiry mid-run | Auth implementation + integration testing | Integration test: run with token that expires after round 2; verify graceful failure and partial save |
| Subscription vs API rate limit confusion | Rate limit handling phase | Subscription 429 error messages include window reset time; separate retry logic per auth type |
| Credential file in npm publish | Pre-release security phase | CI includes `npm pack --dry-run` output check; `files` field verified in package.json |
| Auth method invisible to user | Auth UX phase | Auth method printed at run start; `auth status` command exits 0 with clear output |

---

## Sources

- Anthropic Consumer Terms of Service + Legal and Compliance: https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan
- The Register: "Anthropic clarifies ban on third-party tool access to Claude" (2026-02-20): https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/
- Natural20: "Anthropic Banned OpenClaw: The OAuth Lockdown" (2026): https://natural20.com/coverage/anthropic-banned-openclaw-oauth-claude-code-third-party
- Hacker News discussion on Anthropic subscription auth ban (2026): https://news.ycombinator.com/item?id=47069299
- Groundy: "Anthropic Bans Third-Party Use of Subscription Auth" (2026): https://groundy.com/articles/anthropic-bans-third-party-use-subscription-auth-what-it/
- OpenAI Terms of Use: https://openai.com/policies/row-terms-of-use/
- OpenAI Services Agreement: https://openai.com/policies/services-agreement/
- Roo-Code GitHub Issue #6993 — community discussion on OpenAI Plus for API provider: https://github.com/RooCodeInc/Roo-Code/issues/6993
- Claude Pro & Max Weekly Rate Limits Guide (2026): https://hypereal.tech/a/weekly-rate-limits-claude-pro-max-guide
- RFC 9700 OAuth Token Lifetime Guidance (January 2025): https://www.obsidiansecurity.com/blog/refresh-token-security-best-practices
- Google OAuth Best Practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- Auth0 Token Storage guidance: https://auth0.com/docs/secure/security-guidance/data-security/token-storage
- GitHub CLI OAuth keychain issue #449: https://github.com/cli/cli/issues/449
- Semgrep Security Advisory: npm packages using secret scanning tools to steal credentials (2025): https://semgrep.dev/blog/2025/security-advisory-npm-packages-using-secret-scanning-tools-to-steal-credentials/
- The Hacker News: "Malicious npm Packages Harvest Crypto Keys, CI Secrets, and API Tokens" (February 2026): https://thehackernews.com/2026/02/malicious-npm-packages-harvest-crypto.html
- npm classic tokens revoked, session-based auth (December 2025): https://github.blog/changelog/2025-12-09-npm-classic-tokens-revoked-session-based-auth-and-cli-token-management-now-available/
- Portkey: "Retries, fallbacks, and circuit breakers in LLM apps": https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/
- OpenAI Codex usage limits: https://community.openai.com/t/codex-usage-after-the-limit-reset-update-single-prompt-eats-7-of-weekly-limits-plus-tier/1365284

---
*Pitfalls research for: Subscription-based provider auth added to existing Handover CLI (Claude Max, OpenAI Plus/Pro, Codex)*
*Researched: 2026-02-26*
