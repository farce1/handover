# Milestones

## v1.0 Handover OSS Excellence (Shipped: 2026-02-18)

**Phases completed:** 3 phases, 9 plans, 0 tasks

**Key accomplishments:**

- Community health files: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, FUNDING, 3 YAML issue templates, PR template
- CI quality gate on Node 20+22 with vitest coverage (80% thresholds), Codecov integration
- Release automation: release-please with OIDC npm publish and provenance attestation
- DX tooling: ESLint flat config, Prettier, commitlint, husky pre-commit/commit-msg hooks, Dependabot
- Security scanning: CodeQL + OpenSSF Scorecard workflows; 7 README trust badges
- User documentation: getting-started, configuration reference (21 keys), provider comparison (8), output documents (14)
- Contributor documentation: architecture walkthrough, development workflow, provider/analyzer extension tutorials
- Content distillation: AGENTS.md restructured to 60-line AI-ops, llms.txt (11 entries), CONTRIBUTING.md hub, PRD.md retired

---

## v2.0 Performance (Shipped: 2026-02-19)

**Phases completed:** 4 phases, 8 plans, 0 tasks

**Key accomplishments:**

- SHA-256 content-hash fingerprinting with cascade invalidation across rounds, replacing size-only cache detection
- Live streaming token counter and elapsed timer via SDK streaming APIs (Anthropic messages.stream(), OpenAI completions.stream())
- Incremental context packing — only changed files sent at full detail, unchanged files fall to signature tier
- Anthropic prompt caching with cache_control ephemeral markers for 90% cost reduction on cached input tokens
- BPE tokenization via gpt-tokenizer replacing chars/4 heuristic for accurate OpenAI-family token estimates
- Parallel document rendering via Promise.allSettled with per-round cache savings display
- Cache savings pipeline fixed end-to-end: Anthropic API → runner.ts → tracker → terminal/CI display
- Dead code cleanup and CI renderer document count fix

---

## v3.0 Robustness (Shipped: 2026-02-20)

**Phases completed:** 4 phases, 10 plans, 20 tasks
**Tests:** 254 tests across 15 files, 0 failures
**Coverage:** 92.21% stmts | 82.07% branches | 92.46% funcs | 92.69% lines
**Timeline:** 4 days (2026-02-16 → 2026-02-20)
**Git range:** feat(08-01) → feat(11-02)

**Key accomplishments:**

- Fixed CI (TypeScript errors, Zod v4 migration), merged 5 Dependabot PRs, pinned 0.x deps to exact versions
- OpenSSF Scorecard hardening: all GitHub Actions SHA-pinned, branch protection on main, CODEOWNERS, auto-merge workflow
- Test infrastructure: createMockProvider() typed factory at LLMProvider interface, memfs, vitest coverage exclusions
- Code hardening: 11 SCORE\_\* named constants replacing magic numbers, logger.debug() in catch blocks, CLI validation reorder
- 254 unit tests: 86 pure-function (scorer, token-counter, config, registry) + 78 algorithm (packer, DAG, tracker, provider) + 90 AI round (runner, validator, compressor, retry, renderer, errors)
- 80% CI coverage gate enforced with WASM/integration-only exclusions scoping the denominator to unit-testable surface area

---

## v4.0 MCP Server & Semantic Search (Shipped: 2026-02-22)

**Phases completed:** 4 phases, 11 plans, 0 tasks

**Key accomplishments:**

- Added sqlite-vec backed vector storage with incremental, hash-aware reindexing at `.handover/search.db`
- Shipped deterministic semantic retrieval and `handover search` UX with strict type filters and rich result metadata
- Added `handover serve` MCP stdio server with startup preflight checks and structured remediation errors
- Exposed generated docs and raw analyzer outputs as deterministic, paginated MCP resources
- Added MCP `semantic_search` tool and setup docs for Claude Desktop, Cursor, and VS Code
- Delivered grounded QA mode (`search --mode qa`) with citations, MCP workflow prompts, and resumable checkpoints

**Known gaps / tech debt:**

- Runtime human-validation matrix pending for provider-backed reindex, semantic relevance quality, and MCP client interoperability

---

## v5.0 Remote & Advanced MCP (Shipped: 2026-02-26)

**Phases completed:** 5 phases, 12 plans, 28 tasks
**Timeline:** 3 days (2026-02-23 -> 2026-02-25)
**Git range:** feat(16-01) -> docs(20-02)
**Code delta:** 45 files changed, 6127 insertions(+), 118 deletions(-)

**Key accomplishments:**

- Added durable streaming QA lifecycle sessions with deterministic replay, cancellation, and cursor-safe resume MCP tools
- Added local embedding routing (`local-only`, `local-preferred`, `remote-only`) with fail-fast compatibility validation and operator health diagnostics
- Added remote regeneration job control with deterministic lifecycle state transitions, single-flight dedupe, and MCP trigger/status tools
- Added optional Streamable HTTP MCP transport with stdio parity, canonical endpoint routing, and structured unknown-path remediation
- Added HTTP security controls: default-deny cross-origin policy, bearer auth middleware, non-loopback startup auth guard, and secure deployment docs

**Known gaps / tech debt:**

- Runtime human validation matrix deferred for selected Phase 16/17/18 flows
- Phase 19 verification artifact gap (`19-VERIFICATION.md` missing) despite integration coverage and shipped behavior

---

## v6.0 Codex Auth & Validation (Shipped: 2026-02-28)

**Phases completed:** 6 phases, 13 plans, 27 tasks
**Timeline:** 3 days (2026-02-26 -> 2026-02-28)
**Git range:** feat(21-01) -> docs(phase-26)
**Code delta:** 71 files changed, 9435 insertions(+), 340 deletions(-)

**Key accomplishments:**

- Added shared auth infrastructure (token store, auth resolution, provider integration), including strict precedence and fail-closed credential handling.
- Added Gemini provider and embedding support with full config/factory/auth wiring and index-compatible embedding dimensions.
- Added Codex OAuth auth commands (`handover auth login/status`) with PKCE flow and proactive subscription token refresh.
- Integrated subscription auth UX into `generate` and onboarding, including auth-mode-aware display and first-run setup flow.
- Added security hardening guardrails (publish-safety CI check, auth log redaction regression coverage, provider auth policy docs).
- Completed runtime validation runbooks for CLI and MCP paths, marking all VAL-01..VAL-06 flows as passed.

### Known Gaps (Accepted At Milestone Close)

- `AUTH-01` through `AUTH-04` remain unchecked/pending in `REQUIREMENTS.md` traceability despite completed implementation in Phase 21 (requirements bookkeeping drift accepted for archive).
- No standalone `v6.0-MILESTONE-AUDIT.md` file was present at completion time; milestone archived via proceed-anyway path.

---
