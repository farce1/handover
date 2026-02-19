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
