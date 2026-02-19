# Project Research Summary

**Project:** handover-cli v3.0 — Testing and Robustness Milestone
**Domain:** Brownfield test-infrastructure addition to a TypeScript CLI with LLM integrations
**Researched:** 2026-02-19
**Confidence:** HIGH

## Executive Summary

handover-cli is a mature, 99-file TypeScript CLI that orchestrates multi-round LLM analysis of codebases. The v3.0 milestone is a quality and robustness milestone — no user-visible features. The codebase has 0 unit tests against an already-configured 80% Vitest coverage threshold, 8+ silent catch blocks, hardcoded magic numbers in scoring and pricing logic, and missing early input validation for the `--only` flag. The research confirms this is a well-understood problem domain: adding retroactive unit tests to a mature TypeScript project with LLM SDK dependencies and a DAG orchestrator has documented patterns, documented pitfalls, and a clear dependency order.

The recommended approach is a layered build-up: start with pure-function tests that need no mocking infrastructure, then stateful class tests, then environment-dependent tests, and finally mock-boundary tests for the LLM provider interface. Only two new dev dependencies are justified (`memfs` for in-memory filesystem mocking, `vitest-mock-extended` for type-safe interface mocks). All existing stack choices are correct and settled. The critical architectural decision is to mock at the `LLMProvider` interface boundary — not at the Anthropic or OpenAI SDK level — which protects tests from SDK churn while still exercising application logic.

The primary risks are infrastructure mistakes made before any tests are written: incorrect ESM import extensions breaking CI, wrong LLM mock response shapes producing false-passing tests, and WASM-dependent parser files dragging coverage below threshold. All three are preventable in a single infrastructure setup phase that must come before any test files are authored. Once that foundation is correct, the test-writing phases follow well-established patterns documented in official Vitest sources with no novel research required.

---

## Key Findings

### Recommended Stack

The existing test runner (Vitest 3.x with V8 coverage at 80% thresholds) and all production dependencies are correct and unchanged. Only two new dev dependencies are justified:

**Core technologies:**

- `memfs@4.56.10` — in-memory filesystem mock — explicitly recommended by Vitest official docs; `vol.reset()` provides per-test isolation; actively maintained (last release Jan 2026); replaces unmaintained `mock-fs`
- `vitest-mock-extended@3.1.0` — type-safe interface mocks — generates full mocks satisfying TypeScript interface contracts; required for the `LLMProvider` interface with 3 typed methods; compatible with Vitest ≥ 3.0.0
- `vi.useFakeTimers()` (Vitest built-in) — timer control — needed for `retryWithBackoff` (30s base delay) without 30-second test waits; `advanceTimersByTimeAsync` variant required for Promise-safe advancement
- `vi.hoisted()` (Vitest built-in) — mock factory scoping — required pattern for any variable referenced inside `vi.mock()` factory functions in ESM projects
- `npx npm-check-updates` (on-demand workflow tool, not a project dependency) — dependency audit — run once before milestone to surface stale packages

**Critical anti-stack finding:** MSW and nock cannot intercept `@anthropic-ai/sdk` or `openai` HTTP traffic. Both SDKs use `undici` as their HTTP transport, which bypasses the `node:http`/`node:https` layer that MSW and nock intercept. Do not add MSW. Mock at the `LLMProvider` module boundary using `vi.mock()` instead.

**Installation:** `npm install -D memfs vitest-mock-extended`

See `.planning/research/STACK.md` for full integration patterns, `vi.hoisted()` examples, and version compatibility matrix.

### Expected Features

This milestone adds no user-visible features. All work is internal quality infrastructure targeting the four identified gaps: 0 unit tests, 8+ silent catch blocks, hardcoded magic numbers, and missing early `--only` validation.

**Must have (table stakes — establishes minimum regression protection):**

- Mock LLM provider factory (`tests/helpers/mock-provider.ts`) — foundation for all round tests; implements `LLMProvider` interface using `vi.fn()`; shared across all test files to prevent mock definition duplication
- Unit tests for `scoreFiles()` — deterministic algorithm with 6 weighted factors; highest-churn logic; table-driven with `test.each()`; no mocking needed
- Unit tests for `computeTokenBudget()` and `estimateTokens()` — pure math used for billing accuracy; zero setup required
- Unit tests for `resolveSelectedDocs()` and `computeRequiredRounds()` — CLI input path with documented throw; covers unknown alias, group expansion, INDEX-always behavior, transitive round dependency expansion
- Named constants for scoring weights — prerequisite for scorer tests; extract 6 inline magic numbers to named exports with `as const`; no behavior change
- Empty catch block audit — 8+ silent catches in `git-history.ts`, `env-scanner.ts`, `doc-analyzer.ts`, `round-cache.ts`; each needs either a comment explaining the intentional swallow or a `logger.debug()` call

**Should have (differentiators — algorithmic correctness coverage):**

- Unit tests for `packFiles()` context packing — complex 6-tier greedy algorithm with budget boundary conditions; mock `getFileContent` via `vi.fn()` (already an injected callback)
- Unit tests for `validateProviderConfig()` — 5 explicit throw paths; `vi.stubEnv()` for env var isolation; assert `ProviderError.code` values
- `--only` flag validation moved earlier in `generate.ts` — reorder 3 lines so `resolveSelectedDocs()` call runs before `validateProviderConfig()`; no new logic; improves error UX
- Unit tests for `generateSignatureSummary()` — pure AST-to-text transformation; fixture-based; asserts output string format

**Defer (P3 — orchestration layer, adds depth not breadth):**

- Unit tests for `DAGOrchestrator` — mock steps as `vi.fn()`; assert ordering, cycle detection, skip propagation
- Unit tests for `compressRoundOutput()` — inter-round context compressor; fixture round outputs; token budget enforcement
- Error factory method tests for all defined `HandoverError` and `ProviderError` codes

**Anti-features explicitly rejected:**

- Real LLM API calls in tests — cost money on every CI run, are flaky, test API reliability not application logic
- Snapshot testing for markdown renderer output — breaks on every intentional content change; trains developers to blindly update snapshots
- 100% code coverage mandate — chasing 100% on 99 files produces quantity over quality; existing 80% threshold is correct
- Testing `--help` CLI output — Commander generates it deterministically; testing adds maintenance with zero bug prevention

See `.planning/research/FEATURES.md` for full prioritization matrix, feature dependency graph, and anti-feature rationale.

### Architecture Approach

Unit tests belong colocated with source files (`src/**/*.test.ts`) rather than in a separate `tests/unit/` directory. Vitest's existing `include` pattern already matches this with no config changes. The separation between unit and integration tests is structural: `src/` contains colocated unit tests; `tests/integration/` contains subprocess-based tests that require a built CLI binary. This separation must be preserved.

**Major components and test seams:**

1. `DAGOrchestrator` (`src/orchestrator/dag.ts`) — pure orchestration logic with no I/O; inject `vi.fn()` as step `execute` callbacks; test observable behavior (ordering, skip propagation, cycle detection) not internal state
2. `LLMProvider` interface (`src/providers/base.ts`) — the primary mock boundary for all AI round tests; `makeMockProvider(overrides?)` factory pattern; mock at interface level, never at SDK level
3. Pure function layer (`scorer.ts`, `token-counter.ts`, `packer.ts`, `registry.ts`) — no mocking needed; construct minimal fixture objects; use `test.each()` for tabular inputs
4. Config schema (`src/config/schema.ts`) — Zod schemas are pure functions over their input; call `safeParse()` directly; no mocking; assert `.success`, `.data`, `.error.issues[0].path`
5. Fixture helpers — colocated `__fixtures__/` directories adjacent to primary consumers; `AnalysisContext`, `StaticAnalysisResult`, `RenderContext` factories; added to coverage `exclude` in vitest config
6. WASM-dependent parsers (`src/parsing/`) — explicitly excluded from unit test coverage; covered by existing integration tests; mixing WASM loading and `memfs` mocking causes incompatible failures

**4-layer test build order (from fewest to most dependencies):**

- Layer 0: Zod schemas, error classes, pure factory functions, math functions — no mocks, no async
- Layer 1: DAGOrchestrator, config loader, pure analyzers, TokenUsageTracker — stateful classes, no external deps
- Layer 2: Scorer, validators, registry, provider factory — use Layer 0 type fixtures; no LLM mocking
- Layer 3: Packer, AI round runner, renderers — require mock `LLMProvider` interface and `getFileContent`

**6 core patterns documented in ARCHITECTURE.md:** LLM provider interface mocking, DAG step injection, Zod schema direct testing, pure analyzer fixture testing, renderer RenderContext fixture testing, and context packer injected I/O.

See `.planning/research/ARCHITECTURE.md` for full colocated test topology, 6 anti-patterns to avoid, and integration point details.

### Critical Pitfalls

1. **`vi.mock()` factory functions referencing top-level test variables** — Vitest hoists `vi.mock()` before variable initialization in ESM; referenced variables are `undefined` at factory execution time, producing silent wrong behavior rather than errors. Prevention: always use `vi.hoisted()` for any variable referenced inside a `vi.mock()` factory. Establish this as the project standard in a shared utilities file before any test is written.

2. **LLM mock response shape mismatches produce false-passing tests** — `AnthropicProvider` reads `content.find(block => block.type === 'tool_use')?.input`; a mock returning `{ type: 'text' }` exercises the fallback path silently while the test passes green. Prevention: build typed mock factories using `satisfies Anthropic.Message`; TypeScript catches shape mismatches at compile time rather than silently at runtime.

3. **WASM-dependent files drag coverage below threshold** — `src/parsing/` files require `TreeSitter.init()` before any test can exercise them; without exclusion they show 0% coverage and may cause the global 80% threshold to fail even with extensive unit tests elsewhere. Prevention: add WASM-dependent files to `vitest.config.ts` coverage `exclude` list in the infrastructure setup phase, before running coverage for the first time.

4. **Silent catch blocks produce false-passing tests** — 8+ catch blocks swallow errors; a test exercising a catch path passes while covering only the fallback, not verifying what happened. Coverage marks the catch as green. Prevention: for every catch block test, assert both (a) the expected fallback return value AND (b) `vi.spyOn(logger, 'warn')` was called; green coverage alone is not sufficient.

5. **ESM import extension omission breaks CI silently** — `NodeNext` module resolution requires `.js` extensions on all local TypeScript imports; `tsx` in local development may mask this; CI fails with `Cannot find module`. Prevention: add `import/extensions: always` ESLint rule; fix the existing broken import; establish the convention before any test files are written.

Additional moderate pitfalls: mocking at the SDK level instead of the `LLMProvider` interface (brittle to SDK updates), importing `src/cli/index.ts` in unit tests (triggers Commander.js `process.exit()`), and chasing 80% coverage with easy utility tests while leaving `src/providers/` uncovered.

See `.planning/research/PITFALLS.md` for complete pitfall catalog with recovery strategies, phase-to-pitfall mapping, and "looks done but isn't" checklist.

---

## Implications for Roadmap

The milestone naturally decomposes into 4 sequential phases with hard dependencies between them. Phases 2-4 cannot safely begin without Phase 1's infrastructure foundation in place. The phase structure is derived from the feature dependency graph (FEATURES.md) and the pitfall-to-phase mapping (PITFALLS.md).

### Phase 1: Test Infrastructure Setup

**Rationale:** Three critical pitfalls (ESM import extensions, WASM coverage inflation, `vi.mock()` hoisting) are infrastructure mistakes that corrupt every subsequent test if not addressed first. This phase contains no test-writing — it is purely configuration, conventions, and mock utilities establishment.

**Delivers:**

- `vitest.config.ts` updated: WASM-dependent files in coverage `exclude`; fixture directories in coverage `exclude`; per-describe timeout config documented
- ESLint `import/extensions: always` rule enforced; existing broken import fixed with `.js` extension
- `__mocks__/fs.cjs` and `__mocks__/fs/promises.cjs` for `memfs` module mock integration
- `src/providers/__fixtures__/mock-factories.ts` with `createMockProvider()` and `makeAnthropicToolResponse()` using `satisfies Anthropic.Message`
- `vi.hoisted()` pattern documented as project test convention; no top-level variables inside `vi.mock()` factories anywhere in the test suite

**Addresses:** `memfs` integration (STACK.md); colocated test placement convention (ARCHITECTURE.md)

**Avoids:** Pitfall 1 (vi.mock hoisting), Pitfall 3 (WASM coverage), Pitfall 8 (CI import extensions), Pitfall 11 (WASM threshold failure)

**Research flag:** Standard patterns — all configuration documented in official Vitest docs and Vitest GitHub issues. No further research needed.

---

### Phase 2: Code Hardening and Pure Function Tests

**Rationale:** These tasks have no dependencies on mocking infrastructure beyond the factory from Phase 1 and deliver the highest return per unit of effort. Named constants must precede scorer tests because tests should reference `ENTRY_POINT_SCORE` not `30`. The empty catch block audit must precede catch-path tests so authors know which silences are intentional versus oversight. Both hardening tasks (constants extraction, catch documentation) are code changes that affect test assertability, not the tests themselves.

**Delivers:**

- Named constants extracted from `scorer.ts` scoring weights and `presets.ts` pricing (all with `as const`); snapshot test for `scoreFile()` output on fixed fixture before and after extraction
- Snapshot test for pricing constants (verifies future changes to pricing values are intentional)
- Empty catch block audit complete: all 8+ catches have either a comment or `logger.debug()` call
- Unit tests: `scoreFiles()` (table-driven with `test.each()`), `computeTokenBudget()`, `estimateTokens()`, `resolveSelectedDocs()`, `computeRequiredRounds()`, `HandoverConfigSchema`, `createStep()`
- `--only` flag validation reordered to fire before `validateProviderConfig()` in `generate.ts`

**Addresses:** All P1 table stakes features (FEATURES.md); Layer 0 test build order (ARCHITECTURE.md)

**Avoids:** Pitfall 4 (silent catch testing), Pitfall 6 (constants extraction widens types), Pitfall 12 (pricing staleness), Pitfall 7 (coverage chasing easy files over critical paths)

**Research flag:** Standard patterns — pure function testing with `test.each()`, Zod `safeParse()` assertions, and `as const` extraction are well-documented. The TypeScript `as const` requirement is documented by TypeScript issue #43333.

---

### Phase 3: Algorithm and Validation Tests

**Rationale:** These tests require the mock provider factory from Phase 1 and the named constants from Phase 2. `packFiles()` uses scoring output as input. `validateProviderConfig()` tests require understanding the error type hierarchy established in Phase 2. The DAG orchestrator tests are structurally independent but build on patterns established in Phase 2 test files.

**Delivers:**

- Unit tests for `packFiles()` — all 6 tiers, budget boundary conditions, oversized file handling, small-project optimization; mock `getFileContent` via `vi.fn()` (existing injected callback seam)
- Unit tests for `validateProviderConfig()` — all 5 throw paths (unknown provider, Ollama without model, Azure without baseUrl, missing API key, custom without baseUrl); `vi.stubEnv()` for env var isolation; assert `ProviderError.code`
- Unit tests for `generateSignatureSummary()` — fixture `ParsedFile` inputs; assert output string format
- Unit tests for `DAGOrchestrator` — step ordering, cycle detection, skip propagation on step failure, parallel execution tracking
- Unit tests for `TokenUsageTracker` — stateful class with no external deps; accounting correctness

**Addresses:** P2 differentiator features (FEATURES.md); Layers 1-3 test build order (ARCHITECTURE.md)

**Avoids:** Pitfall 5 (version constraint tightening during dependency review), Pitfall 9 (mocking at SDK level instead of interface level), Pitfall 10 (CLI import triggering Commander.js process.exit)

**Research flag:** Standard patterns — DAG orchestration testing via step injection, `vi.stubEnv()`, and `vi.fn()` for injected callbacks are all documented in official Vitest API docs. No further research needed.

---

### Phase 4: AI Round Tests and Coverage Enforcement

**Rationale:** AI round tests (`executeRound()`, `validateFileClaims()`, `checkRoundQuality()`) require the full typed mock provider infrastructure from Phase 1 and understanding of graceful degradation behavior documented in Phase 3's DAG tests. The retry/backoff tests require `vi.useFakeTimers()` which requires understanding of the async timer patterns established in Phase 3. Coverage threshold enforcement becomes meaningful only once enough tests exist to have real coverage numbers.

**Delivers:**

- Unit tests for `executeRound()` — happy path with mock provider (typed tool_use response shape), degraded result on provider throw, retry behavior with `vi.useFakeTimers()` advancing past 30s backoff
- Unit tests for `validateFileClaims()` — pure function; drop-rate thresholds; fixture `StaticAnalysisResult`
- Unit tests for `checkRoundQuality()` — quality gate threshold assertions
- Unit tests for `compressRoundOutput()` — fixture round outputs; field extraction; token budget enforcement
- Renderer utility tests: `buildTable()`, `codeRef()`, `sectionIntro()` — pure string functions
- One renderer integration test: `renderOverview()` with minimal `RenderContext` fixture
- CI coverage gate verified: 80% threshold now has real tests to measure against; WASM exclusions confirm no false threshold failures

**Addresses:** P3 deferred features (FEATURES.md); Layers 3-4 test build order (ARCHITECTURE.md)

**Avoids:** Pitfall 2 (mock response shape mismatch — use `satisfies Anthropic.Message`), Pitfall 4 (silent catch assertions on round runner error paths), Pitfall 11 (WASM files inflating coverage gap)

**Research flag:** Needs verification during execution — the Anthropic `tool_use` response shape and the OpenAI `choices[0].message.tool_calls[0].function.arguments` shape must be verified against the current provider source files (`src/providers/anthropic.ts`, `src/providers/openai-compat.ts`) before the mock factories in Phase 1 are finalized. The `satisfies` guard catches shape mismatches only if the type annotation is correct to begin with. Read the provider source first.

---

### Phase Ordering Rationale

- **Infrastructure before any tests:** Pitfalls 1, 3, and 8 are "corrupt everything" problems if addressed retroactively across a large test suite. Fixing them first costs one phase and prevents cascading rework across phases 2-4.
- **Named constants before scorer tests:** Tests that reference `30` (a magic number) instead of `ENTRY_POINT_SCORE` require dual updates when the weight changes — in source and in tests. Extract constants first; tests inherit the names.
- **Silent catch audit before catch-path tests:** An undocumented `catch {}` leaves test authors uncertain whether to assert silence or a log warning. Documenting intent first enables assertive tests rather than coverage-filling placeholders.
- **DAGOrchestrator before round runner:** The round runner depends on the DAG's step lifecycle. Understanding DAG behavior via tests in Phase 3 makes Phase 4 round runner assertions more precise about what is orchestrator behavior vs. runner behavior.
- **Coverage enforcement in Phase 4:** Enforcing the 80% threshold in Phase 1 would make every CI run fail until Phase 4. Enable it in Phase 4 when the test suite is substantial enough for the threshold to be meaningful.

### Research Flags

Phases needing verification during execution:

- **Phase 4 (AI round mock response shapes):** Anthropic tool_use response shape and OpenAI tool_calls response shape must be verified against current provider source before typed mock factories are finalized in Phase 1. The `satisfies Anthropic.Message` TypeScript guard provides compile-time safety only if the factory type annotation is correctly specified.

Phases with standard patterns (proceed without further research):

- **Phase 1:** Vitest config, memfs `__mocks__` setup, ESLint `import/extensions` rule — all in official docs with HIGH confidence.
- **Phase 2:** Pure function testing, `as const` extraction, Zod `safeParse()` assertions, `test.each()` tables — textbook patterns with no novel elements.
- **Phase 3:** DAG step injection, `vi.stubEnv()`, `vi.fn()` injected callbacks — standard Vitest patterns, all in official API docs.

---

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                                                                             |
| ------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | All recommendations verified against official docs and npm registry; memfs and vitest-mock-extended versions confirmed current; MSW/undici limitation documented by MSW maintainers and confirmed via GitHub issue #2165          |
| Features     | HIGH       | Based on direct codebase audit of all 99 source files; gaps are observable facts (0 unit tests, 8+ empty catch blocks), not inferences; feature prioritization derived from first-party source reading                            |
| Architecture | HIGH       | All patterns grounded in direct source reading of all major modules; Vitest colocated test pattern confirmed against existing `vitest.config.ts` include patterns; no speculation                                                 |
| Pitfalls     | HIGH       | Critical pitfalls verified against official Vitest GitHub issues, TypeScript issue tracker, and real-world Backstage post-mortem; codebase-specific pitfalls from direct source inspection of providers, scorer, and catch blocks |

**Overall confidence:** HIGH

The research domain is well-covered. The existing codebase was read directly, eliminating speculation about what is already built. All new library additions are verified against npm registry and official documentation. The only area requiring execution-time verification is the LLM SDK response shapes for typed mock factories — this is a source-reading task, not a research gap.

### Gaps to Address

- **`fast-glob` + `memfs` interaction:** PITFALLS.md flags that `fast-glob` may use its own filesystem access that bypasses `vi.mock('node:fs')`. Verify during Phase 1 when memfs is configured whether affected analyzer tests need `fast-glob` mocked separately or whether they should move to the integration test suite.

- **`loadConfig()` spy target:** ARCHITECTURE.md recommends `vi.spyOn(fs, 'existsSync')` for config loader tests. Confirm at Phase 3 implementation whether `loadConfig()` uses `node:fs` or `node:fs/promises` for existence checks — this determines which spy target is correct.

- **Coverage threshold achievability before WASM exclusion:** After Phase 1's vitest config update, run `vitest --coverage --reporter=json` on the 0-test suite to get the actual denominator (the set of non-excluded source lines). This reveals whether 80% is achievable without testing every module or whether additional exclusions are needed before Phase 4's coverage enforcement.

- **Provider mock response shape pre-verification:** Before finalizing the `makeAnthropicToolResponse()` and `makeOpenAIToolResponse()` factories in Phase 1, read `src/providers/anthropic.ts` and `src/providers/openai-compat.ts` to confirm which response fields are actually accessed. The mock shape must match the actual consumption pattern, not the SDK type definition.

---

## Sources

### Primary (HIGH confidence)

- [Vitest File System Mocking](https://vitest.dev/guide/mocking/file-system) — memfs integration, `__mocks__` setup, `vol.reset()` pattern
- [Vitest Mocking Requests](https://vitest.dev/guide/mocking/requests) — MSW guidance; undici limitation caveat
- [MSW Limitations](https://mswjs.io/docs/limitations/) — undici bypass of `http.ClientRequest` interception
- [Vitest Mocking Modules](https://vitest.dev/guide/mocking/modules) — `vi.mock()` ESM hoisting, `vi.hoisted()` API
- [Vitest `vi.useFakeTimers()`](https://vitest.dev/guide/mocking/timers) — `advanceTimersByTimeAsync` for async-safe timer control
- [Vitest Mock Functions API](https://vitest.dev/api/mock) — `vi.fn()`, `vi.spyOn()`, partial mocking
- [Vitest `vi.stubEnv()`](https://vitest.dev/api/vi.html) — auto-restored environment variable mocking
- [Vitest Issue #3228](https://github.com/vitest-dev/vitest/issues/3228) — `vi.hoisted()` origin; hoisting problem documentation
- [Vitest Coverage v8 ESM issues](https://github.com/vitest-dev/vitest/issues/6380) — V8 coverage limitations with ESM/TypeScript
- [TypeScript Issue #43333](https://github.com/microsoft/TypeScript/issues/43333) — `as const` requirement for extracted literal constants
- [Backstage Issue #20436](https://github.com/backstage/backstage/issues/20436) — `mock-fs` maintenance breakage post-mortem
- [MSW GitHub issue #2165](https://github.com/mswjs/msw/issues/2165) — undici interception not supported; confirmed by MSW maintainers
- [memfs npm](https://www.npmjs.com/package/memfs) — v4.56.10, last release Jan 2026
- [vitest-mock-extended npm](https://www.npmjs.com/package/vitest-mock-extended) — v3.1.0, Vitest ≥ 3.0.0 requirement
- [npm-check-updates npm](https://www.npmjs.com/package/npm-check-updates) — v19.4.0
- Direct codebase audit: all 99 source files, `vitest.config.ts`, `package.json`, `tests/integration/setup.ts` — first-party source

### Secondary (MEDIUM confidence)

- [Vitest table-driven tests](https://oliviac.dev/blog/introduction-to-table-driven-tests-in-vitest/) — `test.each()` patterns for pure functions
- [TypeScript error handling in catch blocks](https://kentcdodds.com/blog/get-a-catch-block-error-message-with-typescript) — `unknown` type enforcement, `useUnknownInCatchVariables`
- [Zod Testing Patterns — Steve Kinney](https://stevekinney.com/courses/full-stack-typescript/testing-zod-schema) — schema test patterns consistent with official Zod docs
- [Stack Overflow Blog: Coverage and code quality](https://stackoverflow.blog/2025/12/22/making-your-code-base-better-will-make-your-code-coverage-worse/) — coverage as lagging indicator for quality
- [The Pitfalls of Code Coverage (David Burns, 2024)](https://www.theautomatedtester.co.uk/blog/2024/the-pitfalls-of-code-coverage/) — catch block coverage correctness problem
- [openai-node GitHub issue #638](https://github.com/openai/openai-node/issues/638) — correct `vi.mock` pattern for OpenAI SDK default export
- [How to Rapidly Introduce Tests When There Is No Test Coverage](https://medium.com/swlh/how-to-rapidly-introduce-tests-when-there-is-no-test-coverage-8bb07930a3ee) — priority ordering for retroactive test addition

---

_Research completed: 2026-02-19_
_Ready for roadmap: yes_
