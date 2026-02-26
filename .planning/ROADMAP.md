# Roadmap: Handover

## Milestones

- ✅ **v1.0 OSS Excellence** - Phases 1-3 (shipped 2026-02-18) - `.planning/milestones/v1.0-ROADMAP.md`
- ✅ **v2.0 Performance** - Phases 4-7 (shipped 2026-02-19) - `.planning/milestones/v2.0-ROADMAP.md`
- ✅ **v3.0 Robustness** - Phases 8-11 (shipped 2026-02-20) - `.planning/milestones/v3.0-ROADMAP.md`
- ✅ **v4.0 MCP Server & Semantic Search** - Phases 12-15 (shipped 2026-02-22) - `.planning/milestones/v4.0-ROADMAP.md`
- ✅ **v5.0 Remote & Advanced MCP** - Phases 16-20 (shipped 2026-02-26) - `.planning/milestones/v5.0-ROADMAP.md`
- 🚧 **v6.0 Codex Auth & Validation** - Phases 21-26 (in progress)

## Phases

### 🚧 v6.0 Codex Auth & Validation (In Progress)

**Milestone Goal:** Add OpenAI Codex subscription-based auth as an alternative to API keys and close deferred runtime validation gaps from v4.0/v5.0.

- [x] **Phase 21: Auth Infrastructure** - Shared auth types, token store, and resolution layer that all auth-dependent code imports (completed 2026-02-26)
- [ ] **Phase 22: Gemini Provider** - Google Gemini as a fully supported LLM provider via API key
- [ ] **Phase 23: Codex Auth Commands** - PKCE browser OAuth flow and `handover auth` CLI command group
- [ ] **Phase 24: Generate Integration & Onboarding** - Wire subscription auth into `generate` and deliver first-run interactive setup
- [ ] **Phase 25: Security Hardening** - npm publish safety, log redaction, and Anthropic restriction documentation
- [ ] **Phase 26: Runtime Validation** - Human-executed validation matrix for all deferred v4.0/v5.0 runtime behaviors

## Phase Details

### Phase 21: Auth Infrastructure
**Goal**: The shared auth module exists and all auth-dependent code has a stable foundation to import from
**Depends on**: Phase 20 (v5.0 complete)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. `authMethod: "api-key" | "subscription"` is a valid, Zod-validated field in `.handover.yml` that defaults to `"api-key"` without breaking existing configs
  2. Credentials written to `~/.handover/credentials.json` have 0600 permissions and are separate from project config
  3. Auth resolution applies the correct precedence: CLI `--api-key` flag overrides env var, which overrides credential store, which overrides interactive prompt
  4. `src/auth/` module exports types, token store, and `resolveAuth()` as importable units with no circular dependencies
**Plans:** 3/3 plans complete

Plans:
- [x] 21-01-PLAN.md — Auth types (AuthError, AuthResult, StoredCredential) and TokenStore with TDD
- [x] 21-02-PLAN.md — Config schema authMethod field, resolveAuth() precedence chain, and barrel export
- [x] 21-03-PLAN.md — Wire shared auth module into provider factory and CLI call sites (gap closure)

### Phase 22: Gemini Provider
**Goal**: Users can select Google Gemini as an LLM provider using a Google AI Studio API key
**Depends on**: Phase 21
**Requirements**: GEM-01, GEM-02, GEM-03, GEM-04
**Success Criteria** (what must be TRUE):
  1. User can set `provider: gemini` in `.handover.yml` and run `handover generate` without error
  2. User can authenticate Gemini via a Google AI Studio API key (free tier key accepted)
  3. All 6 analysis rounds complete successfully using the Gemini provider
  4. `handover reindex` and `handover search` work when Gemini is configured as the embedding provider
**Plans**: TBD

Plans:
- [ ] 22-01: Gemini provider implementation (chat completion + embedding)
- [ ] 22-02: Gemini config registration and provider factory wiring

### Phase 23: Codex Auth Commands
**Goal**: Users can authenticate with OpenAI Codex subscription via browser OAuth and manage credentials through the `handover auth` CLI
**Depends on**: Phase 21
**Requirements**: CDX-01, CDX-02, CDX-03, CDX-04, CDX-05
**Success Criteria** (what must be TRUE):
  1. `handover auth login openai` opens a browser PKCE flow and stores the resulting access + refresh + expiry tokens securely
  2. `handover auth status` shows the current auth method, provider, and token validity (including expiry time) for each configured provider
  3. Subscription tokens are refreshed proactively (5-minute buffer) before each LLM round so mid-run expiry does not corrupt output
  4. When `authMethod: subscription` is configured, the provider factory enforces `concurrency = 1` automatically
**Plans**: TBD

Plans:
- [ ] 23-01: PKCE OAuth flow implementation and token persistence
- [ ] 23-02: `handover auth` CLI command group (login, status) and token refresh lifecycle

### Phase 24: Generate Integration & Onboarding
**Goal**: Users can run `handover generate` with Codex subscription auth and are guided through provider setup on first run
**Depends on**: Phase 23
**Requirements**: GEN-01, GEN-02, GEN-03, GEN-04, GEN-05, ONB-01, ONB-02, ONB-03
**Success Criteria** (what must be TRUE):
  1. `handover generate` completes end-to-end using Codex subscription auth with no API key present
  2. The startup banner shows the active auth method (`api-key` vs `subscription`) alongside provider and model
  3. Cost display shows "subscription credits" instead of a dollar amount when running in subscription mode
  4. Running `handover generate` with `authMethod: subscription` but no stored token prints: "Run `handover auth login openai` to authenticate"
  5. A 429 from subscription mode shows the remaining rate-limit window time, distinct from API key 429 retry messaging
  6. A first-time user with no provider configured is guided through interactive provider and auth selection before generation begins
**Plans**: TBD

Plans:
- [ ] 24-01: Factory async wiring, `resolveAuth()` integration, and subscription 429 handling
- [ ] 24-02: Startup auth method banner, cost display suppression, and missing-auth error message
- [ ] 24-03: First-run onboarding flow (interactive provider selection, env var detection)

### Phase 25: Security Hardening
**Goal**: No credential data can leak via npm publish, debug logs, or documentation gaps
**Depends on**: Phase 24
**Requirements**: SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):
  1. `npm pack --dry-run` in CI confirms `~/.handover/credentials.json` and all auth token paths are absent from the published package
  2. Debug and info log output never contains token values — only auth method names appear in logs
  3. Provider setup docs explicitly state that Anthropic providers require API key auth and that subscription OAuth is not available or compliant
**Plans**: TBD

Plans:
- [ ] 25-01: npm publish safeguard, log redaction audit, and Anthropic restriction documentation

### Phase 26: Runtime Validation
**Goal**: All deferred v4.0 and v5.0 runtime behaviors are verified against real providers and live MCP clients
**Depends on**: Phase 25
**Requirements**: VAL-01, VAL-02, VAL-03, VAL-04, VAL-05, VAL-06
**Success Criteria** (what must be TRUE):
  1. A full `handover generate` followed by `handover reindex` pipeline runs successfully against a real LLM provider with output verified
  2. Semantic search returns relevant results on a populated real index (not synthetic test data), with quality confirmed by manual inspection
  3. The MCP server connects and responds correctly in Claude Desktop, Cursor, and VS Code with all tools and resources exercised
  4. Streaming QA sessions run to completion and resume correctly after disconnect with a real MCP client
  5. Local embedding fallback activates correctly when remote provider is unavailable, with route visibility confirmed in CLI output
  6. Remote regeneration trigger and status polling complete the full lifecycle against a live MCP client
**Plans**: TBD

Plans:
- [ ] 26-01: Provider-backed pipeline, semantic relevance, and embedding fallback validation
- [ ] 26-02: MCP client interop matrix, streaming QA, and remote regeneration lifecycle validation

## Progress

**Execution Order:**
Phases execute in numeric order: 21 → 22 → 23 → 24 → 25 → 26

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 21. Auth Infrastructure | 3/3 | Complete    | 2026-02-26 | - |
| 22. Gemini Provider | v6.0 | 0/2 | Not started | - |
| 23. Codex Auth Commands | v6.0 | 0/2 | Not started | - |
| 24. Generate Integration & Onboarding | v6.0 | 0/3 | Not started | - |
| 25. Security Hardening | v6.0 | 0/1 | Not started | - |
| 26. Runtime Validation | v6.0 | 0/2 | Not started | - |
