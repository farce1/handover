# Requirements: Handover v6.0

**Defined:** 2026-02-26
**Core Value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

## v6.0 Requirements

Requirements for the Codex Auth & Validation milestone. Each maps to roadmap phases.

### Auth Infrastructure

- [ ] **AUTH-01**: User can configure auth method per provider (`authMethod: "api-key" | "subscription"` in `.handover.yml`)
- [ ] **AUTH-02**: Auth credentials are stored securely in `~/.handover/credentials.json` with 0600 permissions, separate from project config
- [ ] **AUTH-03**: Auth resolution follows strict precedence: CLI `--api-key` flag > env var > credential store > interactive prompt
- [ ] **AUTH-04**: Auth types, token store, and resolution logic exist as a shared `src/auth/` module used by all auth-dependent code

### Onboarding

- [x] **ONB-01**: User running `handover generate` for the first time with no provider configured is guided through interactive provider selection and auth setup
- [x] **ONB-02**: User can select from available providers (OpenAI, Anthropic, Gemini, Codex subscription, etc.) during first-run onboarding
- [x] **ONB-03**: Onboarding flow detects existing env vars (e.g. `OPENAI_API_KEY`) and skips setup for already-configured providers

### Codex Subscription Auth

- [x] **CDX-01**: User can authenticate with OpenAI Codex subscription via PKCE browser OAuth flow
- [x] **CDX-02**: User can run `handover auth login openai` to initiate subscription auth independently of onboarding
- [x] **CDX-03**: User can run `handover auth status` to see current auth method, provider, and token validity per configured provider
- [x] **CDX-04**: Subscription tokens are refreshed proactively before each LLM round to prevent mid-run expiry
- [x] **CDX-05**: Subscription mode enforces concurrency=1 to respect subscription rate limits

### Gemini Provider

- [x] **GEM-01**: User can select Google Gemini as an LLM provider in config
- [x] **GEM-02**: User can use Gemini via Google AI Studio API key (free tier available)
- [x] **GEM-03**: Gemini provider supports chat completion for all 6 analysis rounds
- [x] **GEM-04**: Gemini provider supports embedding generation for reindex/search

### Generate Integration

- [x] **GEN-01**: `handover generate` works end-to-end with Codex subscription auth (no API key required)
- [x] **GEN-02**: Startup banner shows active auth method (api-key vs subscription) alongside provider/model
- [x] **GEN-03**: Cost display shows "subscription credits" instead of dollar amount when using subscription auth
- [x] **GEN-04**: Missing subscription auth produces clear error: "Run `handover auth login openai` to authenticate"
- [x] **GEN-05**: Subscription 429 errors show remaining rate limit window time, distinct from API key 429 retry logic

### Security

- [x] **SEC-01**: No credential data is included in npm publish (`files` allowlist or `.npmignore` verified)
- [x] **SEC-02**: Auth tokens are never logged in debug/info output — only auth method name is logged
- [x] **SEC-03**: Anthropic subscription OAuth restriction is documented in provider setup docs (API key only, permanently)

### Runtime Validation

- [ ] **VAL-01**: Full provider-backed generate then reindex pipeline validated end-to-end
- [ ] **VAL-02**: Semantic relevance quality checked on populated real indexes (not just synthetic test data)
- [ ] **VAL-03**: MCP client interoperability verified against Claude Desktop, Cursor, and VS Code
- [ ] **VAL-04**: Streaming QA timing and reconnect/resume behavior validated with real MCP clients
- [ ] **VAL-05**: Local embedding runtime fallback and route-visibility verified in provider-backed environments
- [ ] **VAL-06**: End-to-end remote regeneration trigger/status lifecycle validated against live MCP clients

## v7.0 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Auth Enhancements

- **AUTH-05**: User can store credentials in OS keychain (macOS Keychain, Windows Credential Manager) via `@napi-rs/keyring`
- **AUTH-06**: User can authenticate via headless device code flow for SSH/container environments
- **AUTH-07**: User can run `handover auth token` to export access token for CI/CD injection
- **AUTH-08**: User can run `handover auth logout` to clear stored credentials

### Advanced Features

- **ADV-01**: Team/workspace shared auth tokens
- **ADV-02**: Multiple simultaneous subscription sessions (personal + work profiles)
- **ADV-03**: Automatic subscription tier detection and model selection

## Out of Scope

| Feature | Reason |
|---------|--------|
| Claude Max/Pro subscription OAuth | Anthropic explicitly prohibits third-party subscription auth (ToS updated Feb 2026, server-side enforcement since Jan 9, 2026). Account bans are active. |
| ChatGPT Plus/Pro direct API access | ChatGPT Plus subscription does not include OpenAI API credits — separate billing. Codex subscription is the viable path. |
| Proxy/relay to "launder" subscription tokens | Still violates provider ToS; project becomes legally exposed |
| Store tokens in `.handover.yml` | Project config files get committed to git — credential exposure risk |
| Auto-login on first run without user consent | Unexpected browser pop-ups during automated runs (CI, hooks) are disruptive |
| Silent subscription rate limit retry >30s | Subscription limits use 5-hour windows; silent long waits appear as hangs |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 21 | Pending |
| AUTH-02 | Phase 21 | Pending |
| AUTH-03 | Phase 21 | Pending |
| AUTH-04 | Phase 21 | Pending |
| GEM-01 | Phase 22 | Complete |
| GEM-02 | Phase 22 | Complete |
| GEM-03 | Phase 22 | Complete |
| GEM-04 | Phase 22 | Complete |
| CDX-01 | Phase 23 | Complete |
| CDX-02 | Phase 23 | Complete |
| CDX-03 | Phase 23 | Complete |
| CDX-04 | Phase 23 | Complete |
| CDX-05 | Phase 23 | Complete |
| GEN-01 | Phase 24 | Complete |
| GEN-02 | Phase 24 | Complete |
| GEN-03 | Phase 24 | Complete |
| GEN-04 | Phase 24 | Complete |
| GEN-05 | Phase 24 | Complete |
| ONB-01 | Phase 24 | Complete |
| ONB-02 | Phase 24 | Complete |
| ONB-03 | Phase 24 | Complete |
| SEC-01 | Phase 25 | Complete |
| SEC-02 | Phase 25 | Complete |
| SEC-03 | Phase 25 | Complete |
| VAL-01 | Phase 26 | Pending |
| VAL-02 | Phase 26 | Pending |
| VAL-03 | Phase 26 | Pending |
| VAL-04 | Phase 26 | Pending |
| VAL-05 | Phase 26 | Pending |
| VAL-06 | Phase 26 | Pending |

**Coverage:**
- v6.0 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-27 after phase 23 completion*
