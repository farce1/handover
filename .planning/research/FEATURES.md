# Feature Research

**Domain:** Robustness and testing milestone for an AI-powered TypeScript CLI code analysis tool (handover-cli)
**Researched:** 2026-02-19
**Confidence:** HIGH — existing codebase audited directly (99 source files, 0 unit tests); testing patterns verified against Vitest 3.x docs and official sources; input validation patterns verified against Zod docs

---

## Context: This Is a Brownfield Robustness Milestone

The milestone does NOT add user-visible features. It adds **internal quality infrastructure** to a mature codebase. Specific existing gaps that drive this milestone:

| Gap                                                 | Location                                                   | Impact                                                 |
| --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| 0 unit tests across 99 source files                 | Entire codebase                                            | Any refactor is blind; regressions are invisible       |
| 8+ empty catch blocks (no comments, no logging)     | `src/analyzers/`, `src/cache/`, `src/parsing/`, `src/cli/` | Silent failures in production; hard to diagnose        |
| No `--only` input validation before pipeline starts | `src/renderers/registry.ts` `resolveSelectedDocs()`        | Error surfaces mid-pipeline; wasted startup time       |
| Hardcoded model pricing and scoring weights         | `src/providers/presets.ts`, `src/context/scorer.ts`        | Cannot unit-test logic in isolation from magic numbers |

All features below concern **how to test and harden existing behavior**, not what new behavior to add.

---

## Feature Landscape

### Table Stakes (Users Expect These)

For a TypeScript CLI with LLM integrations, these testing and validation features are expected. Their absence means contributors cannot safely change the codebase and users cannot trust the tool.

| Feature                                         | Why Expected                                                                                                                                                                                                                                          | Complexity | Notes                                                                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests for pure scoring logic               | `scoreFiles()` in `scorer.ts` is a deterministic algorithm with 6 weighted factors and explicit caps. Any function that takes structured data and returns a sorted list is trivially unit-testable. Missing = no regression protection.               | LOW        | `test.each()` table-driven tests. No mocking needed — `scoreFiles()` takes a `StaticAnalysisResult` and returns `FilePriority[]`.                                     |
| Unit tests for token budget computation         | `computeTokenBudget()` and `estimateTokens()` in `token-counter.ts` are pure math functions. They have documented defaults and edge cases (zero context window, negative values).                                                                     | LOW        | Inline pure function tests. `computeTokenBudget(200_000)` should return specific numbers. No I/O or mocking.                                                          |
| Unit tests for `resolveSelectedDocs()`          | `resolveSelectedDocs()` is a pure function over a registry. It has a documented throw path (unknown alias), group alias expansion, and INDEX-always behavior. All 3 paths need coverage.                                                              | LOW        | Tests for: valid alias, group alias, unknown alias throws, empty string, comma-separated list, INDEX always included.                                                 |
| Unit tests for `computeRequiredRounds()`        | Pure function that expands transitive dependencies from `ROUND_DEPS`. Has a documented contract. Needs table tests for each round number.                                                                                                             | LOW        | `computeRequiredRounds([{requiredRounds: [3]}])` should include rounds 1, 2, 3 via transitive expansion.                                                              |
| Unit tests for `generateSignatureSummary()`     | Pure function that formats AST data into a compact text representation. Easy to test with fixture `ParsedFile` inputs.                                                                                                                                | LOW        | Fixture-based tests. Input: `ParsedFile` with known exports/functions/classes. Assert output string format.                                                           |
| LLM provider mock for round testing             | The 6 AI round steps (`round-1-overview.ts` through `round-6-deployment.ts`) currently cannot be tested without real API calls. A mock `LLMProvider` implementation is the foundation for all round-level unit tests.                                 | MEDIUM     | Implement `LLMProvider` interface with `vi.fn()` for `complete()`. Return pre-built `CompletionResult`. One mock factory function shared across all round test files. |
| Empty catch block documentation                 | 8+ catch blocks silently swallow errors in `git-history.ts`, `env-scanner.ts`, `doc-analyzer.ts`, `cache/round-cache.ts`, etc. Each needs either: (a) a comment explaining why it is safe to swallow, or (b) a `logger.debug()` call for diagnostics. | LOW        | Not a test — a code hardening task. Standard practice: never leave `catch {}` without a comment.                                                                      |
| Input validation for `--only` flag at CLI layer | `resolveSelectedDocs()` already throws `HandoverError` for unknown aliases. However, this runs mid-pipeline (after config load, API key check). The error should surface as soon as the flag is parsed, before any I/O.                               | LOW        | Add Zod schema validation of `options.only` tokens in `runGenerate()` before `validateProviderConfig()`. No new logic — just reorder validation.                      |

### Differentiators (Competitive Advantage)

These go beyond minimal correctness and establish the quality bar for ongoing development.

| Feature                                       | Value Proposition                                                                                                                                                                                                                                                                                                                                     | Complexity | Notes                                                                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Named constants for scoring weights and caps  | `scorer.ts` has 6 magic numbers (`30`, `3`, `30`, `2`, `20`, `10`, `10`, `15`, `-15`) hardcoded inline. Extracting these to named exports (`ENTRY_POINT_SCORE`, `IMPORT_SCORE_PER_IMPORTER`, `IMPORT_SCORE_CAP`, etc.) makes the algorithm readable and lets unit tests document the expected behavior via named constants rather than magic numbers. | LOW        | Purely internal refactor. No behavior change. Named constants become test fixtures.                                                                                                       |
| Unit tests for context packing algorithm      | `packFiles()` in `packer.ts` is a complex greedy algorithm with 6 tiers and special cases (oversized, changed-files, small-project optimization, batch I/O). Testing it requires a mock `getFileContent` function — straightforward with `vi.fn()`.                                                                                                   | MEDIUM     | Mock `getFileContent` as `vi.fn().mockResolvedValue(content)`. Build minimal `FilePriority[]` and `ASTResult` fixtures. Assert tier assignments, budget accounting, metadata correctness. |
| Unit tests for DAG orchestrator               | `DAGOrchestrator` has documented behavior: executes deps before dependents, detects cycles, handles step failures with graceful degradation. These are deterministic state machine behaviors.                                                                                                                                                         | MEDIUM     | Mock steps as `vi.fn()` returning promises. Test: step ordering, cycle detection throws, failed step propagates correctly.                                                                |
| Unit tests for `compressRoundOutput()`        | The inter-round context compressor is a pure function over a `Record<string, unknown>`. It has documented field extraction logic and token budget enforcement.                                                                                                                                                                                        | MEDIUM     | Fixture round outputs. Assert compressed output contains expected fields, respects token budget.                                                                                          |
| Coverage threshold enforcement                | Vitest v8 coverage is already configured at 80% for lines/functions/branches. Enforcing this in CI prevents regression. Currently the threshold runs against 0 tests — it would pass trivially on any coverage.                                                                                                                                       | LOW        | Already configured. The threshold becomes meaningful once tests exist. Document it as a quality gate.                                                                                     |
| Error surface testing for provider validation | `validateProviderConfig()` has 5 explicit throw paths (unknown provider, Ollama without model, Azure without baseUrl, missing API key, custom without baseUrl). Each path should have a test asserting the correct `ProviderError` code is thrown.                                                                                                    | LOW        | All pure function testing. Mock `process.env` via `vi.stubEnv()`. Assert `toThrow(ProviderError)` with specific `.code` properties.                                                       |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature                                              | Why Requested                              | Why Problematic                                                                                                                                                                                                                                          | Alternative                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| End-to-end integration tests that call real LLM APIs | "Tests should test the real system"        | Real API calls in tests: cost money on every CI run, are flaky (network issues, rate limits, model changes), take 30-120 seconds per run, and fail when API keys are not present in CI. They test the API provider's reliability, not your code's logic. | Mock the `LLMProvider` interface for unit tests. Write one optional smoke-test behind an env flag (`RUN_INTEGRATION_TESTS=true`) that can be run manually but never in CI by default.                                                                                 |
| Snapshot testing for markdown renderer output        | "Snapshots catch any output change"        | Snapshot tests for text output break on every intentional content change, training developers to blindly update snapshots. For template-based Markdown renderers, snapshot churn is the biggest source of false test failures.                           | Assert structural properties of the output: "contains the heading", "has at least 3 sections", "includes the project name". Not the exact whitespace. Use `toContain()` not `toMatchSnapshot()`.                                                                      |
| Mocking `fs` for file I/O tests                      | "Mock the filesystem for pure unit tests"  | Node.js `fs` mocking with `vi.mock('node:fs/promises')` is fragile — it intercepts all file I/O in the process, including calls from internal Node.js modules and test infrastructure. Mocking the wrong layer causes subtle failures.                   | Instead, abstract file I/O behind injected callbacks (as `packFiles()` already does with `getFileContent`). Pass mock functions directly. For analyzer tests that truly need file system access, use real temp directories with `node:fs/promises` and `os.tmpdir()`. |
| 100% code coverage mandate                           | "Full coverage means no bugs"              | Chasing 100% coverage on a 99-file codebase with 0 tests leads to test quantity over quality — developers write tests that hit lines without asserting anything meaningful. The existing 80% Vitest threshold is the right target.                       | Set 80% threshold (already configured). Exempt complex I/O orchestration paths in `generate.ts` and the DAG's concurrency plumbing — these are better covered by integration tests. Focus coverage effort on pure functions.                                          |
| Testing the CLI's `--help` output                    | "Test that the CLI prints the right flags" | Commander generates `--help` output deterministically from the command definition. Testing its output against a string snapshot adds test maintenance overhead for zero bug prevention. Changing a description string shouldn't fail tests.              | Trust Commander. Write tests for the business logic that the CLI flags control (`resolveSelectedDocs`, `validateProviderConfig`, etc.), not for the help text itself.                                                                                                 |

---

## Feature Dependencies

```
Named constants for scoring weights
    └──required before──> Unit tests for scoreFiles()
                               (tests reference constant names, not magic numbers)

LLM provider mock factory
    └──required before──> Unit tests for AI round steps (round-1 through round-6)
    └──required before──> Unit tests for compressRoundOutput() (needs mock round output)

Mock getFileContent function (vi.fn())
    └──required before──> Unit tests for packFiles() algorithm

--only validation moved to CLI layer
    └──independent of──> all test features
    └──depends on──> existing resolveSelectedDocs() (no new logic, just reordering)

Empty catch block documentation
    └──independent of──> all other features
    └──prerequisite for──> being able to write tests that assert catch behavior
                           (must know which catch blocks are intentional vs oversight)

Unit tests for pure functions (scorer, token-counter, registry)
    └──no dependencies──> these are isolated pure functions with no I/O
    └──foundational for──> enabling safe refactoring of rest of codebase

Coverage threshold enforcement
    └──requires──> tests to exist (threshold against 0 tests is meaningless)
    └──already configured──> vitest.config.ts thresholds at 80%
```

### Dependency Notes

- **Named constants must come before scorer tests:** Tests that document expected behavior should use named constants, not repeat the magic numbers from the source. If tests duplicate `30` everywhere, updating the weight requires updating both source and tests — constants make this a single-source change.

- **Provider mock is the test-infrastructure foundation:** 6 round files all take `LLMProvider` as a parameter. A single `createMockProvider()` factory shared via a test helper file (`tests/helpers/mock-provider.ts`) prevents mock definition duplication. Build it once, use it everywhere.

- **Empty catch documentation before testing catch paths:** A catch block with `// intentional: git binary not present; empty result is correct fallback` tells a test author to assert the empty result. An undocumented `catch {}` leaves a test author uncertain whether to assert silence or a logged warning.

- **`--only` validation reordering is independent but fast:** It touches only `generate.ts` (move `resolveSelectedDocs()` call 3 lines earlier). No new code. Can land in the same PR as the registry unit tests.

---

## MVP Definition

This is a brownfield milestone. MVP = the minimum that gives contributors meaningful regression protection and removes the three most dangerous quality gaps.

### Launch With (Phase 1 — Test Infrastructure + Pure Functions)

These can be written without any architectural changes to the source:

- [ ] Mock LLM provider factory (`tests/helpers/mock-provider.ts`) — foundation for all round tests; one file, shared by all tests
- [ ] Unit tests for `scoreFiles()` — highest-value pure function; table-driven with `test.each()`; uses named constants
- [ ] Unit tests for `computeTokenBudget()` and `estimateTokens()` — pure math; zero setup
- [ ] Unit tests for `resolveSelectedDocs()` and `computeRequiredRounds()` — pure registry functions; includes throw-path coverage
- [ ] Empty catch block audit — not tests; code comments/logging; prerequisite for knowing what is intentional
- [ ] Named constants for scoring weights — prerequisite for scorer tests; source change only

### Add After Phase 1 (Phase 2 — Algorithm and Validation Tests)

Once test infrastructure exists:

- [ ] Unit tests for `packFiles()` context packing — complex algorithm; uses mock `getFileContent`; asserts tier assignments and budget accounting
- [ ] Unit tests for `validateProviderConfig()` — 5 throw paths; uses `vi.stubEnv()`; asserts correct `ProviderError.code`
- [ ] `--only` flag validation moved earlier in `generate.ts` — reordering, not new code
- [ ] Unit tests for `generateSignatureSummary()` — fixture-based; asserts format of AST-to-text transformation

### Add After Phase 2 (Phase 3 — Orchestration and Integration)

Requires more setup; deferred until Phase 1/2 establish patterns:

- [ ] Unit tests for `DAGOrchestrator` — mock steps; assert ordering, cycle detection, failure handling
- [ ] Unit tests for `compressRoundOutput()` — fixture round outputs; asserts field extraction and token budget
- [ ] Error surface tests for each defined `HandoverError` and `ProviderError` factory method
- [ ] Coverage threshold CI enforcement becomes meaningful (all 80% gates now have real tests to measure against)

---

## Feature Prioritization Matrix

| Feature                                | User Value                                 | Implementation Cost                          | Priority |
| -------------------------------------- | ------------------------------------------ | -------------------------------------------- | -------- |
| Mock LLM provider factory              | HIGH — enables all round testing           | LOW — implement `LLMProvider` interface once | P1       |
| Tests for `scoreFiles()`               | HIGH — core ranking algorithm              | LOW — table-driven pure function             | P1       |
| Tests for `computeTokenBudget()`       | HIGH — context window math                 | LOW — pure function                          | P1       |
| Tests for `resolveSelectedDocs()`      | HIGH — CLI input path with throw           | LOW — pure function                          | P1       |
| Named constants for scoring weights    | HIGH — makes tests readable; single-source | LOW — extract 6 constants                    | P1       |
| Empty catch block audit                | HIGH — silent failures become diagnosable  | LOW — code comments, not tests               | P1       |
| Tests for `packFiles()`                | HIGH — greedy algorithm correctness        | MEDIUM — mock `getFileContent`               | P2       |
| Tests for `validateProviderConfig()`   | HIGH — 5 throw paths; user-facing errors   | LOW — `vi.stubEnv()`                         | P2       |
| `--only` validation moved earlier      | MEDIUM — better error UX                   | LOW — reorder 3 lines                        | P2       |
| Tests for `generateSignatureSummary()` | MEDIUM — output format correctness         | LOW — fixture-based                          | P2       |
| Tests for `DAGOrchestrator`            | MEDIUM — orchestration correctness         | MEDIUM — mock step definitions               | P3       |
| Tests for `compressRoundOutput()`      | MEDIUM — inter-round compressor            | MEDIUM — fixture round outputs               | P3       |
| Error factory method tests             | LOW — error messages tested indirectly     | LOW — straightforward assertions             | P3       |

**Priority key:**

- P1: Must have for launch — establishes test infrastructure and covers highest-churn pure functions
- P2: Should have — covers validation and algorithm correctness in algorithms with documented behavior
- P3: Nice to have — completes coverage of orchestration layer; adds depth not breadth

---

## Approach Notes: Testing TypeScript CLIs with LLM APIs

These are patterns specific to this domain, verified against Vitest docs and community practice:

### Pattern: Mock the Interface, Not the SDK

The `LLMProvider` interface (`src/providers/base.ts`) already abstracts the SDK. Mock the interface:

```typescript
// tests/helpers/mock-provider.ts
import { vi } from 'vitest';
import type { LLMProvider } from '../../src/providers/base.js';
import type { CompletionResult } from '../../src/domain/types.js';

export function createMockProvider(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      data: {},
      tokens: { input: 100, output: 50 },
      cost: 0.001,
      status: 'success',
    } satisfies CompletionResult & { data: unknown }),
    estimateTokens: vi.fn().mockImplementation((text: string) => Math.ceil(text.length / 4)),
    maxContextTokens: vi.fn().mockReturnValue(200_000),
    ...overrides,
  };
}
```

Do NOT mock the Anthropic SDK or OpenAI SDK — that tests the SDK's internals, not your code.

### Pattern: Table-Driven Tests for Scoring

Vitest's `test.each()` is the correct pattern for scoring algorithms with multiple inputs:

```typescript
test.each([
  { path: 'src/index.ts', expectedEntryPoint: 30 }, // matches ENTRY_POINT_PATTERNS
  { path: 'src/utils/helpers.ts', expectedEntryPoint: 0 },
  { path: 'package.json', expectedConfigFile: 15 }, // matches CONFIG_FILE_PATTERNS
])('scores $path correctly', ({ path, expectedEntryPoint, expectedConfigFile }) => {
  const result = scoreFiles(buildMinimalAnalysis({ filePath: path }));
  const scored = result.find((f) => f.path === path);
  expect(scored?.breakdown.entryPoint).toBe(expectedEntryPoint ?? 0);
});
```

### Pattern: `vi.stubEnv()` for Environment-Dependent Tests

Provider validation reads from `process.env`. Vitest provides `vi.stubEnv()` that auto-restores after each test:

```typescript
test('throws ProviderError when API key is missing', () => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  expect(() => validateProviderConfig({ provider: 'anthropic', ... }))
    .toThrow(ProviderError);
});
```

### Pattern: Injected I/O for Testable Algorithms

`packFiles()` already accepts a `getFileContent` callback instead of importing `fs` directly. This is the correct design for testability — pass a `vi.fn()` as the callback. Analyzers that read files directly are harder to test; they need temp directories or file-path indirection.

---

## Sources

- Codebase audit: `src/context/scorer.ts`, `src/context/token-counter.ts`, `src/context/packer.ts`, `src/renderers/registry.ts`, `src/providers/factory.ts`, `src/providers/base.ts`, `src/utils/errors.ts`, `src/cli/generate.ts`, `vitest.config.ts`, `package.json` — HIGH confidence (direct source inspection)
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking) — `vi.mock()`, `vi.fn()`, `vi.spyOn()`, partial mocking — HIGH confidence (official docs)
- [Vitest `vi.mock()` module hoisting](https://vitest.dev/guide/mocking/modules) — ESM hoisting behavior, partial mock with `importOriginal` — HIGH confidence (official docs)
- [Vitest table-driven tests](https://oliviac.dev/blog/introduction-to-table-driven-tests-in-vitest/) — `test.each()` patterns for pure functions — MEDIUM confidence (community source, consistent with official `test.each` docs)
- [Parameterized tests in Vitest](https://www.the-koi.com/projects/parameterized-data-driven-tests-in-vitest-example/) — data-driven test patterns with objects — MEDIUM confidence
- [Zod input validation best practices](https://zod.dev/) — `safeParse()` vs `parse()` for CLI validation — HIGH confidence (official docs)
- [TypeScript error handling in catch blocks](https://kentcdodds.com/blog/get-a-catch-block-error-message-with-typescript) — `unknown` type enforcement, `useUnknownInCatchVariables` — MEDIUM confidence (community source by Kent C. Dodds, widely cited)
- [Vitest `vi.stubEnv()`](https://vitest.dev/api/vi.html) — auto-restored environment variable mocking — HIGH confidence (official docs)

---

_Feature research for: Handover CLI — robustness and testing milestone_
_Researched: 2026-02-19_
