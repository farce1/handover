---
phase: 32
slug: source-doc-dependency-graph
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 32-RESEARCH.md §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (verified: package.json) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/regen/dep-graph.test.ts` |
| **Full suite command** | `npm run test` (uses `vitest run`) |
| **Estimated runtime** | ~5–15 s for quick run; ~60–90 s for full suite |
| **Build before integration tests** | `npm run build` (integration tests exec `dist/cli/index.js`) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/regen/dep-graph.test.ts --coverage` (covers REGEN-03/05/06/07 unit-level)
- **After every plan wave:** Run `npm run test` (full suite — catches regressions in `src/renderers/registry.test.ts` and any integration tests)
- **Before `/gsd-verify-work`:** Full suite must be green + `npm run typecheck` clean
- **Max feedback latency:** ~15 s for quick run; ~90 s for full suite

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-XX | 01 | 1 | REGEN-03, REGEN-06 | — | N/A | unit | `npx vitest run src/renderers/registry.test.ts` | ✅ existing | ⬜ pending |
| 32-02-XX | 02 | 1 | REGEN-03, REGEN-05, REGEN-06, REGEN-07 | — | Corrupted graph JSON → safe null (no throw) | unit | `npx vitest run src/regen/dep-graph.test.ts` | ❌ W0 | ⬜ pending |
| 32-03-XX | 03 | 2 | REGEN-04, REGEN-07 | — | `--dry-run` makes zero LLM calls | unit + integration | `npx vitest run src/regen/dep-graph.test.ts -t "formatDryRun"` + `npx vitest run tests/integration/dry-run.test.ts` | ❌ W0 | ⬜ pending |

*Task IDs finalized by the planner — this row is a per-plan summary.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/regen/dep-graph.test.ts` — unit coverage for `buildDepGraph`, `loadDepGraph`, `saveDepGraph`, `filterRenderersByChangedFiles`, `formatDryRun`, `formatDryRunJson`, infrastructure exclusion, `GRAPH_VERSION` mismatch fallback, renderer self-reference rule (covers REGEN-03/05/06/07 + SC-1/3/4/5)
- [ ] `tests/integration/dry-run.test.ts` (or extend `tests/integration/edge-cases.test.ts`) — end-to-end `--dry-run` and `--dry-run --json` with provider-call mock asserting zero LLM calls (covers REGEN-04 + SC-2)
- [ ] No framework install needed (vitest + memfs already present per `.planning/codebase/TESTING.md`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Phase 36 JSON contract stability | REGEN-04 (forward-compat) | Snapshot test pins shape, but a human review confirms `formatVersion` discipline before Phase 36 lands | Run `npx vitest run src/regen/dep-graph.test.ts -t "formatDryRunJson snapshot"`; review snapshot diff in PR |

*All five success criteria have automated verification — manual entry above is contract-stability discipline, not a behavior gap.*

---

## Success Criteria → Test Coverage Map

| SC | Statement | Primary Test | Test Type |
|----|-----------|--------------|-----------|
| SC-1 | Single non-infra file change → fewer than 14 renderers execute | `filterRenderersByChangedFiles` fixture with one changed file | unit |
| SC-2 | `--dry-run` lists renderers + reasons, zero LLM calls | integration test with provider-call spy = 0 | integration |
| SC-3 | Missing/version-mismatched graph → safe full regen | `loadDepGraph` returns `null` on version mismatch; orchestrator falls through | unit |
| SC-4 | `logger.ts` alone → zero renderers triggered | INFRASTRUCTURE_PATHS exclusion test | unit |
| SC-5 | First run / deleted graph → full regen, no error | `loadDepGraph` on missing file → `null`; full-regen path exercised | unit + integration |

---

## Validation Dimensions

| Dimension | Coverage | Maps to SC |
|-----------|----------|------------|
| **Functional correctness** | Each pure function in `dep-graph.ts` has direct unit tests | SC-1, SC-3, SC-4, SC-5 |
| **Behavioral / integration** | CLI `--dry-run` + CLI `--since` end-to-end in fixture repo | SC-1, SC-2, SC-5 |
| **Regression** | Existing `src/renderers/registry.test.ts` still passes after `requiredSources` is added; existing `src/cache/git-fingerprint.test.ts` still passes (untouched) | All |
| **Edge case** | Renderer self-reference, renamed/deleted files, corrupted JSON, infra-only changes, no-graph fallback | SC-1, SC-4, SC-5 |
| **Performance** | Smoke assertion that `buildDepGraph` over 14 entries completes in < 2 s on a typical project | SC-2 (zero-call posture) |
| **Contract stability** | `formatDryRunJson` snapshot test pins the Phase 36 contract; any breaking change requires `formatVersion` bump | SC-2 (downstream contract) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`dep-graph.test.ts`, `dry-run.test.ts`)
- [ ] No watch-mode flags (all commands use `vitest run`)
- [ ] Feedback latency < 90 s
- [ ] `nyquist_compliant: true` set in frontmatter after planner reconciles task IDs

**Approval:** pending
