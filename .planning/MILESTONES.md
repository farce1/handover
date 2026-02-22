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
