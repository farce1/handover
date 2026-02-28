# Handover — Performance-Optimized Codebase Documentation

## What This Is

An open source TypeScript CLI that generates comprehensive, AI-powered codebase documentation and serves it as a queryable knowledge base for AI coding tools. Handover now ships semantic vector search, MCP resources/tools/prompts, and grounded Q&A on top of its multi-round LLM analysis pipeline, with content-hash caching, incremental context packing, prompt caching, and parallel rendering. Backed by 254 tests with 92%+ coverage enforced in CI.

## Core Value

Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

## Current State

**Latest shipped milestone:** v6.0 Codex Auth & Validation (2026-02-28)

What shipped:
- OpenAI Codex subscription auth support (PKCE login, token refresh, provider integration)
- Gemini provider support across generation and embeddings
- First-run onboarding and auth-mode-aware runtime UX for generate/search/reindex flows
- Security hardening guardrails for publish artifacts and auth log redaction
- Runtime validation matrix completion for deferred v4.0/v5.0 behaviors (`VAL-01` through `VAL-06`)

### Next Milestone Goals (Draft)

- Ship secure credential storage uplift via OS keychain integration (`AUTH-05`)
- Add auth lifecycle commands for session management (`AUTH-07`, `AUTH-08`)
- Add headless/device auth path for SSH/container environments (`AUTH-06`)
- Continue advanced auth ergonomics and operational safety hardening

<details>
<summary>v6.0 Milestone Snapshot</summary>

Goal: Add OpenAI Codex subscription-based auth as an alternative to API keys and close deferred runtime validation gaps from v4.0/v5.0.

Primary outcomes:
- Codex OAuth via PKCE browser flow
- Auth infrastructure and generate/onboarding integration
- Runtime validation runbooks for CLI and MCP paths

</details>

## Requirements

### Validated

- ✓ Comprehensive README with quick start, provider table, CLI reference — existing
- ✓ MIT license — existing
- ✓ Clean modular architecture — existing
- ✓ 8 LLM provider support — existing
- ✓ npm package published as handover-cli — existing
- ✓ CONTRIBUTING.md with setup, testing, PR process, architecture links — v1.0
- ✓ GitHub issue templates (bug, feature, docs) with YAML forms — v1.0
- ✓ GitHub PR template with quality checklist — v1.0
- ✓ CI/CD workflows: lint, typecheck, test, build on Node 20+22 — v1.0
- ✓ CHANGELOG.md seeded for release-please — v1.0
- ✓ CODE_OF_CONDUCT.md (Contributor Covenant v2.1) — v1.0
- ✓ SECURITY.md with private vulnerability reporting — v1.0
- ✓ docs/user/ with getting-started, configuration, providers, output-documents — v1.0
- ✓ docs/contributor/ with architecture, development, adding-providers, adding-analyzers — v1.0
- ✓ llms.txt with 11-entry AI-readable project index — v1.0
- ✓ AGENTS.md restructured to 60-line AI-ops rules — v1.0
- ✓ PRD.md content distilled into docs/, original retired — v1.0
- ✓ FUNDING.yml for GitHub Sponsors — v1.0
- ✓ README badges: CI, npm version, downloads, license, coverage, Scorecard, CodeQL — v1.0
- ✓ Release automation: release-please with OIDC npm publish — v1.0
- ✓ DX tooling: ESLint, Prettier, commitlint, husky, Dependabot — v1.0
- ✓ Security scanning: CodeQL + OpenSSF Scorecard — v1.0
- ✓ SHA-256 content-hash cache fingerprint with cascade invalidation — v2.0
- ✓ Live streaming token counter and elapsed timer during LLM rounds — v2.0
- ✓ Rounds 5+6 parallel execution with savings display — v2.0
- ✓ File coverage indicator (analyzed vs skipped files) — v2.0
- ✓ Incremental context packing (changed files at full detail only) — v2.0
- ✓ Anthropic prompt caching with cache_control ephemeral — v2.0
- ✓ Per-round cache savings display (tokens, percentage, dollars) — v2.0
- ✓ Parallel document rendering via Promise.allSettled — v2.0
- ✓ BPE tokenization via gpt-tokenizer for OpenAI-family providers — v2.0
- ✓ CI fixed (TypeScript errors, Zod v4 migration), 5 Dependabot PRs merged, 0.x deps pinned — v3.0
- ✓ OpenSSF Scorecard: all Actions SHA-pinned, branch protection, CODEOWNERS, auto-merge — v3.0
- ✓ Test infrastructure: createMockProvider() factory, memfs, vitest coverage exclusions — v3.0
- ✓ Code hardening: SCORE\_\* named constants, logger.debug() in catch blocks, CLI validation reorder — v3.0
- ✓ 254 unit tests (pure-function + algorithm + AI round) with 80% CI coverage gate — v3.0
- ✓ sqlite-vec vector index with markdown-aware chunking and embedding metadata validation — v4.0
- ✓ `handover reindex` with incremental skip logic and deterministic progress reporting — v4.0
- ✓ `handover search` semantic retrieval with strict type filters and ranked relevance output — v4.0
- ✓ `handover serve` MCP stdio server with startup preflight and structured remediation errors — v4.0
- ✓ MCP resources for generated docs and raw analyzer outputs with deterministic pagination — v4.0
- ✓ Grounded QA mode with source citations and MCP workflow prompts with resume checkpoints — v4.0
- ✓ Streaming QA lifecycle tools with progress, cancellation, and cursor-safe resume (`qa_stream_*`) — v5.0
- ✓ Embedding locality routing modes with fail-fast compatibility checks and CLI health diagnostics — v5.0
- ✓ Remote regeneration MCP lifecycle (`regenerate_docs`, `regenerate_docs_status`) with single-flight dedupe — v5.0
- ✓ Optional Streamable HTTP MCP transport with stdio parity and canonical endpoint routing — v5.0
- ✓ HTTP origin/auth security middleware with non-loopback startup auth guardrails — v5.0
- ✓ OpenAI Codex subscription OAuth via PKCE browser flow — v6.0
- ✓ Auth CLI commands: login and status — v6.0
- ✓ Secure credential storage with file-based fallback (`~/.handover/credentials.json`, 0600) — v6.0
- ✓ Per-provider auth method config (API key OR subscription where available) — v6.0
- ✓ Provider-backed generate→reindex runtime validation — v6.0
- ✓ Semantic relevance quality checks on real indexes — v6.0
- ✓ MCP client interoperability matrix (Claude Desktop/Cursor/VS Code) — v6.0
- ✓ Streaming QA timing and reconnect/resume behavior validation — v6.0
- ✓ Local embedding runtime fallback verification — v6.0
- ✓ End-to-end remote regeneration lifecycle validation — v6.0

### Active

- [ ] OS keychain-backed credential storage (`AUTH-05`)
- [ ] Headless device-code auth flow (`AUTH-06`)
- [ ] `handover auth token` support for CI/CD injection (`AUTH-07`)
- [ ] `handover auth logout` command and full credential clearing (`AUTH-08`)

### Out of Scope

- Dedicated docs site (Docusaurus, etc.) — in-repo markdown works well for LLMs; revisit when user base demands it
- Discord server — GitHub Discussions sufficient for current scale
- Project showcase/gallery — future effort
- Multi-threaded analyzer execution — analyzers already run concurrently via Promise.allSettled; I/O-bound, not CPU-bound
- Persistent background daemon — disk cache provides fast re-runs; daemon adds battery drain, race conditions, IPC complexity
- Streaming output to markdown files — rendering requires complete, Zod-validated JSON; streaming creates partial documents
- Provider-level request batching — rounds are sequentially dependent by design

## Context

- Handover is at v0.1.0, early stage but functional and published on npm
- v1.0 OSS milestone shipped: 3 phases, 9 plans, community health, CI/CD, docs
- v2.0 Performance milestone shipped: 4 phases, 8 plans, caching, streaming, incremental analysis, prompt caching
- v3.0 Robustness milestone shipped: 4 phases, 10 plans, CI fix, scorecard hardening, 254 unit tests, 80% coverage gate
- v4.0 MCP Server & Semantic Search: shipped 2026-02-22 (4 phases, 11 plans)
- v5.0 Remote & Advanced MCP: shipped 2026-02-26 (5 phases, 12 plans, 28 tasks)
- v5.0 audit status: tech_debt (17/17 requirements satisfied; deferred human runtime validation follow-ups)
- v6.0 Codex Auth & Validation: shipped 2026-02-28 (6 phases, 13 plans, 27 tasks)
- Architecture: DAG orchestrator, 8 static analyzers, 6 AI rounds, 14 document renderers, Zod-first domain model
- CI runs on every PR; release-please automates versioning; OIDC publishes to npm with provenance
- Codebase: ~31.7K LOC TypeScript across 151 source/test files, 254 tests, 92%+ coverage
- External setup still needed: CODECOV_TOKEN, RELEASE_PLEASE_TOKEN (PAT), npm trusted publishing OIDC config, GitHub Sponsors enrollment

## Constraints

- **In-repo docs**: All documentation lives in the repo as markdown — no external docs site yet
- **No breaking changes**: README structure preserved, additive changes only
- **LLM-first**: All docs structured for both human and machine readability
- **Streaming gate**: onToken callback presence gates streaming path; absent means non-streaming unchanged

## Key Decisions

| Decision                                         | Rationale                                                              | Outcome |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ------- |
| In-repo markdown over docs site                  | Lower maintenance, LLMs read markdown natively, can migrate later      | ✓ Good  |
| Distill AGENTS.md + PRD.md into structured docs  | Single-source-of-truth docs, retire monolithic files                   | ✓ Good  |
| Keep README, add links and badges                | README was already good — additive changes only                        | ✓ Good  |
| GitHub Sponsors over other funding               | Native GitHub integration, low friction                                | ✓ Good  |
| Badges for social proof                          | npm downloads, CI status, license, coverage, security — 7 badges total | ✓ Good  |
| llms.txt standard                                | Emerging standard for LLM-friendly project descriptions; 11 entries    | ✓ Good  |
| release-please over semantic-release             | PR-based review gate before npm publish; manifest config               | ✓ Good  |
| OIDC trusted publishing over NPM_TOKEN           | No long-lived secrets, provenance attestation included                 | ✓ Good  |
| ESLint flat config + Prettier                    | Modern config format; Prettier as single formatting authority          | ✓ Good  |
| Semicolons required (semi: true)                 | Prettier enforces; AGENTS.md updated to match                          | ✓ Good  |
| CodeQL + OpenSSF Scorecard                       | Security scanning + supply chain trust signal                          | ✓ Good  |
| Dependabot grouped PRs                           | Production vs dev grouping reduces maintainer noise                    | ✓ Good  |
| SHA-256 content hash over file size              | Same-size edits correctly invalidate cache; hashContent at call site   | ✓ Good  |
| Cascade hash chain across rounds                 | Round N key includes prior round hashes; upstream changes propagate    | ✓ Good  |
| onToken optional in all signatures               | No callback = non-streaming path unchanged; backward compatible        | ✓ Good  |
| Spinner-driven elapsed updates (80ms)            | onToken callback does NOT trigger re-renders; avoids 100 renders/sec   | ✓ Good  |
| Separate analysis cache from round cache         | .handover/cache/analysis.json vs rounds/; no coupling                  | ✓ Good  |
| Changed files fall through on budget exhaust     | Max coverage preserved; changed files not skipped when over budget     | ✓ Good  |
| BPE model routing by prefix                      | gpt-4-/gpt-3.5- use cl100k_base; all others use o200k_base             | ✓ Good  |
| Cache pricing multipliers as constants           | CACHE_READ_MULTIPLIER=0.1, CACHE_WRITE_MULTIPLIER=1.25                 | ✓ Good  |
| Promise.allSettled for parallel rendering        | Error isolation per document; rejected docs don't abort others         | ✓ Good  |
| Mock at LLMProvider interface, not SDK level     | MSW/nock cannot intercept undici transport used by Anthropic/OpenAI    | ✓ Good  |
| memfs over mock-fs                               | mock-fs unmaintained, breaks WASM loading; memfs actively maintained   | ✓ Good  |
| Tests colocated with source (src/\*_/_.test.ts)  | Discoverable, no separate tests/ directory to maintain                 | ✓ Good  |
| 80% coverage gate after Phase 11 (not Phase 8)   | Gate only meaningful with real test suite; early enforcement fails CI  | ✓ Good  |
| Coverage exclusions for integration-only modules | factory.ts, logger.ts excluded — unit-testable surface only            | ✓ Good  |
| vi.hoisted() pattern as test convention          | Clean mock setup, avoids temporal dead zone issues                     | ✓ Good  |
| SQLite + sqlite-vec for semantic retrieval       | Zero-config local vector search in CLI runtime                         | ✓ Good  |
| Keep MCP transport stdio-first for v4.0          | Best compatibility with local AI coding tools, lowest ops overhead     | ✓ Good  |
| Route MCP diagnostics to stderr only             | Prevent JSON-RPC/stdout protocol corruption during tool execution       | ✓ Good  |
| Reuse configured provider for QA synthesis       | Avoid separate credential surface and reduce setup friction             | ✓ Good  |
| Persist MCP workflow checkpoints under .handover | Resume prompts safely across sessions with explicit load/save/clear     | ✓ Good  |
| Persist streaming QA events before publish       | Replay and live streams use one canonical source of truth               | ✓ Good  |
| Use explicit embedding locality policy router    | Deterministic local/remote provider behavior across CLI and MCP paths   | ✓ Good  |
| Use single-flight regeneration by target key     | Prevent duplicate concurrent runs and ensure deterministic job references | ✓ Good  |
| Add Streamable HTTP as optional transport        | Preserve stdio backward compatibility while enabling remote deployment  | ✓ Good  |
| Deny cross-origin by default in HTTP mode        | Secure baseline for browser-origin access unless explicitly allowlisted | ✓ Good  |

---

_Last updated: 2026-02-28 after v6.0 milestone completion_
