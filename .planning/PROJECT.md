# Handover — Performance-Optimized Codebase Documentation

## What This Is

An open source TypeScript CLI that generates comprehensive, AI-powered codebase documentation through multi-round LLM analysis. Ships with content-hash caching, streaming token output, incremental context packing, Anthropic prompt caching, and parallel rendering — making re-runs 2-5x faster and 50%+ cheaper on tokens. Backed by 254 unit tests with 92%+ coverage enforced in CI.

## Core Value

Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

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

### Active

(No active milestone — use `/gsd:new-milestone` to start next)

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
- Architecture: DAG orchestrator, 8 static analyzers, 6 AI rounds, 14 document renderers, Zod-first domain model
- CI runs on every PR; release-please automates versioning; OIDC publishes to npm with provenance
- Codebase: ~24.8K LOC TypeScript across 90+ source files, 254 tests, 92%+ coverage
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

---

_Last updated: 2026-02-20 after v3.0 milestone_
