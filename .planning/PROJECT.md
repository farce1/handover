# Handover — Performance-Optimized Codebase Documentation

## What This Is

An open source TypeScript CLI that generates comprehensive, AI-powered codebase documentation and serves it as a queryable knowledge base for AI coding tools. Handover ships semantic vector search, MCP resources/tools/prompts, grounded Q&A, git-aware incremental regeneration, and multi-provider auth (API key + Codex subscription) on top of its multi-round LLM analysis pipeline, with content-hash caching, incremental context packing, prompt caching, and parallel rendering. Backed by 96%+ coverage enforced at 90/90/90/85 thresholds in CI, with Starlight-based user and contributor documentation.

## Core Value

Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

## Current State

**Active milestone:** v8.0 Distribution & Smarter Regen — Phase 32 (Source→Doc Dependency Graph) complete 2026-05-13; surgical `--since` regen + `--dry-run` preview shipped behind dep-graph at `.handover/cache/dep-graph.json`.

**Latest shipped milestone:** v7.0 Quality, Performance & Polish (2026-03-02)

What shipped:
- CI coverage gate raised to 90/90/90/85 (actual: 96.47/97.03/96.34/86.14) with frozen exclusion list
- Git-aware incremental regeneration via `--since <ref>` with graceful non-git/detached/shallow fallback
- Search UX polish: zero-results guidance, distance warnings, OSC8 TTY links, QA timing/token stats
- MCP `semantic_search` enriched with `docType` and top-3 `content` fields
- User docs (search, reindex, regeneration) and contributor docs (testing patterns, coverage policy)
- `handover init --yes` non-interactive guard; `starlight-links-validator` enforces broken links in CI

<details>
<summary>v6.0 Milestone Snapshot</summary>

Goal: Add OpenAI Codex subscription-based auth as an alternative to API keys and close deferred runtime validation gaps from v4.0/v5.0.

Primary outcomes:
- Codex OAuth via PKCE browser flow
- Auth infrastructure and generate/onboarding integration
- Runtime validation runbooks for CLI and MCP paths

</details>

<details>
<summary>v7.0 Milestone Snapshot</summary>

Goal: Raise test coverage to 90%+, add git-aware incremental regeneration, polish search/QA UX, and close documentation gaps with smarter onboarding.

Primary outcomes:
- 96%+ coverage with 90/90/90/85 enforced thresholds
- `handover generate --since <ref>` with fallback matrix
- Search quality signals, OSC8 links, MCP enrichment
- Starlight docs with link validation in CI

</details>

## Current Milestone: v8.0 Distribution & Smarter Regen

**Goal:** Put `handover` where developers already work (GitHub CI + a real init wizard), and make regeneration surgical, cost-aware, and quality-tracked.

**Target features:**

*Distribution*
- GitHub Action `handover/regenerate-docs@v1` shipping both PR-preview mode (comments docs diff on PRs) and scheduled-refresh mode (cron/manual trigger that opens a doc-refresh PR)
- `handover init` wizard upgrade — provider detection, scope auto-detect, `.gitignore` patches, smart defaults

*Smarter regen*
- Source→doc dependency graph (REGEN-03) for surgical per-renderer regeneration
- Per-renderer cost telemetry persisted for trend analysis
- Config-driven per-renderer model routing (cheap model for trivial docs, expensive for synthesis-heavy)
- Eval harness with golden set + scoring rubric, shipped in observability mode (surfaces in CI, never blocking)

**Explicit non-goals for v8.0:** VS Code extension, Cursor/Claude Code rules pack, AUTH-05..AUTH-08, integration test suite (TEST-04), `--format json` search output (SRCH-07). Eval harness ships as observability only; promotion to a blocking CI gate is a future milestone after rubric stabilizes.

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
- ✓ 90%+ coverage gate (90/90/90/85 thresholds) with frozen exclusion list — v7.0
- ✓ Git-aware incremental regeneration via `--since <ref>` with non-git graceful fallback — v7.0
- ✓ Search UX: zero-results guidance, distance warnings, OSC8 TTY links — v7.0
- ✓ QA timing/token stats footer and MCP `semantic_search` enrichment (docType + content) — v7.0
- ✓ User docs for search/reindex/regeneration and contributor testing guide — v7.0
- ✓ `handover init --yes` non-interactive guard and `starlight-links-validator` CI gate — v7.0
- ✓ Source→doc dependency graph for surgical per-renderer regeneration (`REGEN-03`) — v8.0 / Phase 32
- ✓ `--dry-run` preview of which renderers would execute, with zero LLM calls (`REGEN-04`) — v8.0 / Phase 32
- ✓ `requiredSources` declarations per renderer + `'reused'` document status (`REGEN-05`, `REGEN-06`) — v8.0 / Phase 32
- ✓ Persisted dep-graph at `.handover/cache/dep-graph.json` with `graphVersion` invalidation (`REGEN-07`) — v8.0 / Phase 32

### Active

### Deferred

- [ ] OS keychain-backed credential storage (`AUTH-05`)
- [ ] Headless device-code auth flow (`AUTH-06`)
- [ ] `handover auth token` support for CI/CD injection (`AUTH-07`)
- [ ] `handover auth logout` command and full credential clearing (`AUTH-08`)
- [ ] Integration test suite (`test:integration`) requiring real API keys (`TEST-04`)
- [ ] `--format json` flag for machine-readable search output (`SRCH-07`)

### Out of Scope

- Dedicated docs site (Docusaurus, etc.) — Starlight docs site ships with the repo; separate hosted site not needed yet
- Discord server — GitHub Discussions sufficient for current scale
- Project showcase/gallery — future effort
- Multi-threaded analyzer execution — analyzers already run concurrently via Promise.allSettled; I/O-bound, not CPU-bound
- Persistent background daemon — disk cache provides fast re-runs; daemon adds battery drain, race conditions, IPC complexity
- Streaming output to markdown files — rendering requires complete, Zod-validated JSON; streaming creates partial documents
- Provider-level request batching — rounds are sequentially dependent by design
- `vitest thresholds.autoUpdate` — blocked by upstream vitest#9227 (config rewrite bug); enable when fixed
- Per-file 100% coverage requirements — brittle; global 90% gate is sufficient

## Context

- Handover is at v0.1.0, early stage but functional and published on npm
- v1.0 OSS milestone shipped: 3 phases, 9 plans, community health, CI/CD, docs
- v2.0 Performance milestone shipped: 4 phases, 8 plans, caching, streaming, incremental analysis, prompt caching
- v3.0 Robustness milestone shipped: 4 phases, 10 plans, CI fix, scorecard hardening, 254 unit tests, 80% coverage gate
- v4.0 MCP Server & Semantic Search: shipped 2026-02-22 (4 phases, 11 plans)
- v5.0 Remote & Advanced MCP: shipped 2026-02-26 (5 phases, 12 plans, 28 tasks)
- v6.0 Codex Auth & Validation: shipped 2026-02-28 (6 phases, 13 plans, 27 tasks)
- v7.0 Quality, Performance & Polish: shipped 2026-03-02 (4 phases, 14 plans, 25 tasks)
- Architecture: DAG orchestrator, 8 static analyzers, 6 AI rounds, 14 document renderers, Zod-first domain model
- CI runs on every PR; release-please automates versioning; OIDC publishes to npm with provenance
- Codebase: ~37.8K LOC TypeScript, 96%+ coverage enforced at 90/90/90/85 thresholds
- Starlight docs site with user guides (search, regeneration, configuration) and contributor guides (testing, architecture)
- External setup still needed: CODECOV_TOKEN, RELEASE_PLEASE_TOKEN (PAT), npm trusted publishing OIDC config, GitHub Sponsors enrollment

## Constraints

- **In-repo docs**: All documentation lives in the repo as Starlight site + markdown — no external hosted docs site yet
- **No breaking changes**: README structure preserved, additive changes only
- **LLM-first**: All docs structured for both human and machine readability
- **Streaming gate**: onToken callback presence gates streaming path; absent means non-streaming unchanged
- **Coverage gate**: 90/90/90/85 enforced; exclusions frozen with written justification

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
| Freeze coverage exclusion list before new tests  | Prevent exclusion-creep fake coverage; justify each entry              | ✓ Good  |
| Raise thresholds in batches (80→85→88→90)        | Gate on confirmed passage; never raise speculatively                   | ✓ Good  |
| Pair git.diff() with git.status() for incremental | Catch untracked new files that diff alone misses                      | ✓ Good  |
| content-hash as default, git-aware opt-in        | Non-git environments work unchanged; --since is additive              | ✓ Good  |
| OSC8 links TTY-gated with plain text fallback    | Rich terminal UX without breaking piped/CI output                     | ✓ Good  |
| MCP semantic_search content limited to top 3     | Prevent 25KB+ payloads; balance richness with transport efficiency     | ✓ Good  |
| starlight-links-validator before writing new docs | Catch broken links in CI; enforce before adding pages, not after      | ✓ Good  |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-05-13 after Phase 32 (Source→Doc Dependency Graph) completion_
