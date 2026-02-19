# Requirements: Handover v3.0 Robustness

**Defined:** 2026-02-19
**Core Value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

## v3.0 Requirements

Requirements for robustness milestone. Each maps to roadmap phases.

### CI & Dependencies

- [ ] **CIDP-01**: TypeScript error on main fixed (missing `ValidationResult` import in `runner.ts`)
- [ ] **CIDP-02**: All 5 Dependabot PRs reviewed and merged (actions/checkout, actions/setup-node, actions/upload-artifact, production deps, dev deps)
- [ ] **CIDP-03**: 0.x dependency version constraints tightened to prevent breaking minor updates

### Test Infrastructure

- [ ] **TINF-01**: `memfs` and `vitest-mock-extended` installed as dev dependencies
- [ ] **TINF-02**: Vitest config updated with WASM/fixture coverage exclusions
- [ ] **TINF-03**: Mock LLM provider factory created (`createMockProvider()` using `vi.fn()`)
- [ ] **TINF-04**: `vi.hoisted()` pattern established as project test convention

### OpenSSF Scorecard

- [ ] **SCRD-01**: All 4 workflow files have `permissions: read-all` at top level with write permissions scoped to job level
- [ ] **SCRD-02**: All 16 GitHub Action references pinned to SHA hashes (not mutable tags)
- [ ] **SCRD-03**: Branch protection enabled on main with required reviews, dismiss stale reviews, code owner review
- [ ] **SCRD-04**: CODEOWNERS file created at `.github/CODEOWNERS`
- [ ] **SCRD-05**: Dependabot vulnerability alerts enabled and known CVE (`GHSA-2g4f-4pwh-qvx6`) resolved
- [ ] **SCRD-06**: Private vulnerability reporting enabled on GitHub

### Code Hardening

- [ ] **HARD-01**: Scoring weights extracted to named constants with `as const` in `scorer.ts`
- [ ] **HARD-02**: All 8+ silent catch blocks audited — each has explanatory comment or `logger.debug()` call
- [ ] **HARD-03**: `--only` flag validation moved before `validateProviderConfig()` in `generate.ts`

### Unit Tests — Pure Functions

- [ ] **TEST-01**: Unit tests for `scoreFiles()` — table-driven with `test.each()`, all 6 scoring factors
- [ ] **TEST-02**: Unit tests for `computeTokenBudget()` and `estimateTokens()` — edge cases, zero/negative values
- [ ] **TEST-03**: Unit tests for `resolveSelectedDocs()` — valid alias, group alias, unknown throws, INDEX-always
- [ ] **TEST-04**: Unit tests for `computeRequiredRounds()` — transitive dependency expansion
- [ ] **TEST-05**: Unit tests for `HandoverConfigSchema` — defaults, valid configs, invalid configs via `safeParse()`
- [ ] **TEST-06**: Unit tests for `createStep()` and DAG step definitions

### Unit Tests — Algorithms & Validation

- [ ] **TEST-07**: Unit tests for `packFiles()` — all 6 tiers, budget boundaries, oversized handling, small-project optimization
- [ ] **TEST-08**: Unit tests for `validateProviderConfig()` — all 5 throw paths with `vi.stubEnv()`
- [ ] **TEST-09**: Unit tests for `DAGOrchestrator` — step ordering, cycle detection, skip propagation, failure handling
- [ ] **TEST-10**: Unit tests for `TokenUsageTracker` — stateful accounting correctness
- [ ] **TEST-11**: Unit tests for `generateSignatureSummary()` — fixture `ParsedFile` inputs, output format

### Unit Tests — AI Rounds & Coverage

- [ ] **TEST-12**: Unit tests for `executeRound()` — happy path, degraded result, retry with `vi.useFakeTimers()`
- [ ] **TEST-13**: Unit tests for `validateFileClaims()` — drop-rate thresholds, fixture `StaticAnalysisResult`
- [ ] **TEST-14**: Unit tests for `compressRoundOutput()` — field extraction, token budget enforcement
- [ ] **TEST-15**: Unit tests for renderer utilities — `buildTable()`, `codeRef()`, `sectionIntro()`
- [ ] **TEST-16**: CI coverage gate enforced — 80% threshold meaningful with real test coverage

## Future Requirements

### Extended Testing

- **ETEST-01**: Unit tests for all 14 individual document renderers
- **ETEST-02**: Unit tests for language-specific parsers (TypeScript, Python, Go, Rust)
- **ETEST-03**: Mutation testing via Stryker for test quality validation
- **ETEST-04**: Performance regression benchmarks tracked over time

### Additional Hardening

- **EHARD-01**: Model pricing table made configurable (override via config file)
- **EHARD-02**: Scoring weights configurable per-codebase via handover config
- **EHARD-03**: File encoding detection with BOM handling and non-UTF-8 fallback
- **EHARD-04**: Provider connectivity test for custom baseUrl validation

## Out of Scope

| Feature                              | Reason                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| E2E tests calling real LLM APIs      | Cost money per CI run, flaky, test API reliability not application logic          |
| Snapshot testing for markdown output | Breaks on every intentional content change, trains blind snapshot updates         |
| 100% code coverage mandate           | Chasing 100% on 99 files produces quantity over quality; 80% threshold is correct |
| Testing `--help` CLI output          | Commander generates deterministically; zero bug prevention                        |
| MSW/nock for HTTP interception       | Anthropic/OpenAI SDKs use undici which bypasses MSW's interception layer          |
| mock-fs package                      | Unmaintained, breaks WASM loading; use memfs instead                              |
| OSS-Fuzz / ClusterFuzzLite           | High effort for JS/TS projects with limited applicability; skip for now           |
| CII Best Practices badge             | Requires manual questionnaire; defer to future milestone                          |

## Traceability

| Requirement | Phase    | Status  |
| ----------- | -------- | ------- |
| CIDP-01     | Phase 8  | Pending |
| CIDP-02     | Phase 8  | Pending |
| CIDP-03     | Phase 8  | Pending |
| SCRD-01     | Phase 8  | Pending |
| SCRD-02     | Phase 8  | Pending |
| SCRD-03     | Phase 8  | Pending |
| SCRD-04     | Phase 8  | Pending |
| SCRD-05     | Phase 8  | Pending |
| SCRD-06     | Phase 8  | Pending |
| TINF-01     | Phase 8  | Pending |
| TINF-02     | Phase 8  | Pending |
| TINF-03     | Phase 8  | Pending |
| TINF-04     | Phase 8  | Pending |
| HARD-01     | Phase 9  | Pending |
| HARD-02     | Phase 9  | Pending |
| HARD-03     | Phase 9  | Pending |
| TEST-01     | Phase 9  | Pending |
| TEST-02     | Phase 9  | Pending |
| TEST-03     | Phase 9  | Pending |
| TEST-04     | Phase 9  | Pending |
| TEST-05     | Phase 9  | Pending |
| TEST-06     | Phase 9  | Pending |
| TEST-07     | Phase 10 | Pending |
| TEST-08     | Phase 10 | Pending |
| TEST-09     | Phase 10 | Pending |
| TEST-10     | Phase 10 | Pending |
| TEST-11     | Phase 10 | Pending |
| TEST-12     | Phase 11 | Pending |
| TEST-13     | Phase 11 | Pending |
| TEST-14     | Phase 11 | Pending |
| TEST-15     | Phase 11 | Pending |
| TEST-16     | Phase 11 | Pending |

**Coverage:**

- v3.0 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---

_Requirements defined: 2026-02-19_
_Last updated: 2026-02-19 after initial definition_
