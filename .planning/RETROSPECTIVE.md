# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v6.0 — Codex Auth & Validation

**Shipped:** 2026-02-28
**Phases:** 6 | **Plans:** 13 | **Sessions:** Not tracked

### What Was Built
- OpenAI Codex subscription authentication path with PKCE browser flow and credential persistence.
- Gemini provider support integrated through config, auth, provider factory, and embedding paths.
- `handover auth` command surface and generate/onboarding integration with auth-mode-aware output.
- Security hardening guardrails for npm publish safety and auth log redaction coverage.
- Runtime validation runbooks completed for CLI and MCP deferred behaviors.

### What Worked
- Wave-based plan execution kept implementation throughput high while preserving checkpoint gates.
- Requirement-linked runbooks provided deterministic manual validation acceptance for runtime-only flows.
- Early provider/auth constraints (Anthropic API-key-only) prevented rework and compliance drift.

### What Was Inefficient
- Milestone audit artifact was not generated before completion, requiring proceed-anyway archival.
- Requirements traceability drift (AUTH-01..04 left pending in file) increased closeout reconciliation overhead.

### Patterns Established
- Use explicit PASS/FAIL/SKIP runbooks for any feature requiring human runtime verification.
- Keep auth behavior and UI-mode display contracts in dedicated regression coverage.

### Key Lessons
1. Milestone completion quality is higher when audit and requirements sync are enforced before final archival.
2. Human-checkpoint phases need a standard evidence capture format to prevent end-of-milestone ambiguity.

### Cost Observations
- Model mix: Not tracked in milestone-level metadata
- Sessions: Not tracked in milestone-level metadata
- Notable: Human validation checkpoints dominate elapsed duration relative to implementation time.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v4.0 | Not tracked | 4 | Added MCP server and semantic retrieval platform baseline |
| v5.0 | Not tracked | 5 | Added streaming, regeneration lifecycle, and HTTP transport/security |
| v6.0 | Not tracked | 6 | Added subscription auth + formal runtime validation runbooks |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v4.0 | 254 | 92%+ | 0 |
| v5.0 | 254 | 92%+ | 0 |
| v6.0 | 254 | 92%+ | 0 |

### Top Lessons (Verified Across Milestones)

1. Deterministic artifacts (plans, summaries, runbooks, verification reports) materially reduce completion risk.
2. Deferring runtime-only checks without a preplanned validation matrix creates closeout friction later.
