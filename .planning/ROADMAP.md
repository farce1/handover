# Roadmap: Handover

## Milestones

- ✅ **v1.0 OSS Excellence** — Phases 1-3 (shipped 2026-02-18)
- ✅ **v2.0 Performance** — Phases 4-7 (shipped 2026-02-19)
- 🚧 **v3.0 Robustness** — Phases 8-11 (in progress)

## Phases

<details>
<summary>✅ v1.0 OSS Excellence (Phases 1-3) — SHIPPED 2026-02-18</summary>

- [x] Phase 1: Community Health (2/2 plans) — completed 2026-02-18
- [x] Phase 2: CI/CD Automation (4/4 plans) — completed 2026-02-18
- [x] Phase 3: Docs and LLM Accessibility (3/3 plans) — completed 2026-02-18

</details>

<details>
<summary>✅ v2.0 Performance (Phases 4-7) — SHIPPED 2026-02-19</summary>

- [x] Phase 4: Cache Correctness (2/2 plans) — completed 2026-02-18
- [x] Phase 5: UX Responsiveness (2/2 plans) — completed 2026-02-19
- [x] Phase 6: Context Efficiency (3/3 plans) — completed 2026-02-19
- [x] Phase 7: Cache Savings Pipeline Fix (1/1 plan) — completed 2026-02-19

</details>

### 🚧 v3.0 Robustness (In Progress)

**Milestone Goal:** Harden the codebase with comprehensive unit tests, fix CI, merge blocked dependency updates, and eliminate validation gaps, hardcoded values, and silent error handling.

- [ ] **Phase 8: CI Fix, Scorecard Hardening, and Test Infrastructure** - Fix CI error, merge Dependabot PRs, maximize OpenSSF Scorecard (pin actions, workflow permissions, branch protection), and establish test foundation (mock factories, vitest config)
- [ ] **Phase 9: Code Hardening and Pure Function Tests** - Extract scoring constants, audit silent catches, reorder CLI validation, and write tests for all pure functions with no external dependencies
- [ ] **Phase 10: Algorithm and Validation Tests** - Write tests for complex algorithms (context packing, DAG orchestration) and validation paths using environment stubs and injected callbacks
- [ ] **Phase 11: AI Round Tests and Coverage Enforcement** - Write tests for the AI round runner using typed mock providers, cover renderer utilities, and enforce the 80% CI coverage gate

## Phase Details

### Phase 8: CI Fix, Scorecard Hardening, and Test Infrastructure

**Goal**: CI passes on main, OpenSSF Scorecard maximized, and test infrastructure foundation is correct before any test files are authored
**Depends on**: Nothing (first phase of milestone)
**Requirements**: CIDP-01, CIDP-02, CIDP-03, SCRD-01, SCRD-02, SCRD-03, SCRD-04, SCRD-05, SCRD-06, TINF-01, TINF-02, TINF-03, TINF-04
**Success Criteria** (what must be TRUE):

1. `npm run typecheck` and `npm test` pass on main without errors
2. All 5 Dependabot PRs are merged and no blocked dependency update PRs remain open
3. All 4 workflows have `permissions: read-all` at top level and all 16 action refs pinned to SHA
4. Branch protection enabled on main with required reviews; CODEOWNERS file exists
5. `vitest --coverage` runs without WASM-dependent files or fixture directories inflating the coverage denominator
6. A `createMockProvider()` factory exists and satisfies the `LLMProvider` interface at compile time

Plans:

- [ ] 08-01: Fix TypeScript CI error, merge Dependabot PRs, tighten 0.x constraints
- [ ] 08-02: Scorecard hardening — pin actions to SHA, set workflow permissions, enable branch protection, CODEOWNERS
- [ ] 08-03: Install memfs + vitest-mock-extended, update vitest config, create mock factories

### Phase 9: Code Hardening and Pure Function Tests

**Goal**: Hardcoded magic numbers are replaced with named constants, all silent catches are documented, CLI validation fires in the right order, and all pure-function code paths have unit tests
**Depends on**: Phase 8
**Requirements**: HARD-01, HARD-02, HARD-03, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):

1. Scoring weights in `scorer.ts` are named exports with `as const` — no inline magic numbers in scoring logic
2. Every catch block in the codebase has either an explanatory comment or a `logger.debug()` call — no silent swallows
3. Running `handover generate --only unknown-doc` fails with an unknown-alias error before prompting for API key
4. `vitest run` reports passing tests for `scoreFiles()`, `computeTokenBudget()`, `estimateTokens()`, `resolveSelectedDocs()`, `computeRequiredRounds()`, `HandoverConfigSchema`, and `createStep()`
5. `HandoverConfigSchema.safeParse({})` returns expected defaults without throwing

**Plans:** 3 plans in 2 waves

Plans:

- [ ] 09-01: Extract scoring constants, add logger.debug(), audit silent catches, reorder --only validation
- [ ] 09-02: Write scorer and token-counter tests (table-driven with test.each)
- [ ] 09-03: Write config schema, registry, and DAG step definition tests

### Phase 10: Algorithm and Validation Tests

**Goal**: The codebase's complex algorithms — context packing, provider validation, DAG orchestration, and signature generation — are covered by unit tests that exercise boundary conditions and error paths
**Depends on**: Phase 9
**Requirements**: TEST-07, TEST-08, TEST-09, TEST-10, TEST-11
**Success Criteria** (what must be TRUE):

1. `packFiles()` tests exercise all 6 tiers, budget boundary conditions, oversized file handling, and small-project optimization — no calls to real filesystem
2. `validateProviderConfig()` tests cover all 5 throw paths using `vi.stubEnv()` and assert the correct `ProviderError.code` for each
3. `DAGOrchestrator` tests verify step ordering, cycle detection, skip propagation on step failure, and parallel execution tracking using injected `vi.fn()` steps
4. `TokenUsageTracker` tests confirm stateful accounting is correct across multiple update calls
5. `generateSignatureSummary()` tests produce deterministic output strings from fixture `ParsedFile` inputs
   **Plans**: TBD

Plans:

- [ ] 10-01: Write packFiles and validateProviderConfig tests
- [ ] 10-02: Write DAGOrchestrator, TokenUsageTracker, and generateSignatureSummary tests

### Phase 11: AI Round Tests and Coverage Enforcement

**Goal**: The AI round runner and renderer utilities are covered by tests using typed mock providers, and the CI coverage gate is enforced with a test suite substantial enough for the 80% threshold to be meaningful
**Depends on**: Phase 10
**Requirements**: TEST-12, TEST-13, TEST-14, TEST-15, TEST-16
**Success Criteria** (what must be TRUE):

1. `executeRound()` tests cover the happy path (typed tool_use mock response), degraded result on provider throw, and retry behavior using `vi.useFakeTimers()` to advance past the 30s backoff
2. `validateFileClaims()` tests assert correct drop-rate threshold enforcement using fixture `StaticAnalysisResult` inputs
3. `compressRoundOutput()` tests verify field extraction and token budget enforcement from fixture round outputs
4. Renderer utility tests for `buildTable()`, `codeRef()`, and `sectionIntro()` pass — all produce correct string output
5. CI reports at least 80% coverage after WASM exclusions — the threshold gate passes on every subsequent `npm test` run
   **Plans**: TBD

Plans:

- [ ] 11-01: Write executeRound, validateFileClaims, and compressRoundOutput tests
- [ ] 11-02: Write renderer utility tests and enforce CI coverage gate

## Progress

| Phase                              | Milestone | Plans Complete | Status      | Completed  |
| ---------------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Community Health                | v1.0      | 2/2            | Complete    | 2026-02-18 |
| 2. CI/CD Automation                | v1.0      | 4/4            | Complete    | 2026-02-18 |
| 3. Docs and LLM Accessibility      | v1.0      | 3/3            | Complete    | 2026-02-18 |
| 4. Cache Correctness               | v2.0      | 2/2            | Complete    | 2026-02-18 |
| 5. UX Responsiveness               | v2.0      | 2/2            | Complete    | 2026-02-19 |
| 6. Context Efficiency              | v2.0      | 3/3            | Complete    | 2026-02-19 |
| 7. Cache Savings Pipeline Fix      | v2.0      | 1/1            | Complete    | 2026-02-19 |
| 8. CI Fix, Scorecard, Test Infra   | v3.0      | 0/3            | Not started | -          |
| 9. Code Hardening and Pure Tests   | v3.0      | 0/3            | Not started | -          |
| 10. Algorithm and Validation Tests | v3.0      | 0/2            | Not started | -          |
| 11. AI Round Tests and Coverage    | v3.0      | 0/2            | Not started | -          |
