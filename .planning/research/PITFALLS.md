# Pitfalls Research

**Domain:** Adding comprehensive unit tests and hardening to an existing TypeScript CLI (99 files, 0 unit tests, 19 integration tests)
**Researched:** 2026-02-19
**Confidence:** HIGH — ESM/Vitest pitfalls verified against official docs and open issues; TypeScript hardening patterns from direct codebase analysis; LLM mock shape pitfalls from SDK source inspection

---

## Critical Pitfalls

### Pitfall 1: vi.mock Factory Functions Cannot Reference Top-Level Test Variables

**What goes wrong:**
Vitest hoists `vi.mock()` calls to the top of the file before any imports execute. This means factory functions passed to `vi.mock()` cannot reference variables defined in the test file's outer scope — those variables don't exist yet when the mock factory runs. The result is either a `ReferenceError` at runtime or, more dangerously, `undefined` mock implementations that silently produce wrong behavior without throwing.

This is especially harmful when mocking the Anthropic or OpenAI SDKs. A pattern like:

```typescript
const mockComplete = vi.fn().mockResolvedValue(mockResponse);
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockComplete };
  },
}));
```

...fails because `mockComplete` is not yet initialized when the factory runs.

**Why it happens:**
Vitest's ESM hoisting is required for mock registration to work before module evaluation. Developers copy patterns from Jest (which runs in CommonJS and has different hoisting semantics) or write what looks logically correct without understanding the ESM execution order.

**How to avoid:**
Use `vi.hoisted()` for variables referenced inside `vi.mock()` factory functions. Variables declared inside `vi.hoisted()` callbacks are initialized before both static imports and `vi.mock()` factories execute:

```typescript
const { mockComplete } = vi.hoisted(() => ({
  mockComplete: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockComplete };
  },
}));
```

Alternatively: define the mock shape entirely inside the factory and access the mock function via `vi.mocked()` after import.

**Warning signs:**

- `ReferenceError: Cannot access 'X' before initialization` in test output
- Mock function is `undefined` when inspected inside a test body
- Tests pass in isolation but fail when run together (order dependency from hoisting)
- Behavior changes when mock factory is inline versus extracted to a variable

**Phase to address:**
Unit test foundation phase, before any provider mocks are written. Establish the `vi.hoisted()` pattern as the project standard in a test utilities file.

---

### Pitfall 2: LLM Mock Response Shape Mismatches SDK Internal Structure

**What goes wrong:**
The Anthropic and OpenAI SDKs have deeply nested response types with specific discriminator fields. The Anthropic provider in this codebase (`src/providers/anthropic.ts`) depends on the `tool_use` block pattern — it looks for `content.find(block => block.type === 'tool_use')` and accesses `block.input` as the structured result. A mock that returns `{ content: [{ type: 'text', text: '{}' }] }` instead of the tool_use shape causes the provider to find no tool_use block and either throw or silently degrade to fallback. The test passes (no exception), but what was tested is the fallback path, not the happy path.

Similarly, the OpenAI-compatible path in `src/providers/openai-compat.ts` expects `choices[0].message.tool_calls[0].function.arguments` as a JSON string. A mock returning `choices[0].message.content` (the chat completion shape) produces wrong behavior that looks like a passing test.

**Why it happens:**
Developers mock "what the API conceptually does" rather than "the exact object shape the SDK delivers." The SDK type definitions are complex (300+ line union types). Without reading the actual provider implementation, it's easy to mock the wrong discriminant.

**How to avoid:**
Read the provider source (`src/providers/anthropic.ts`, `src/providers/openai-compat.ts`) before writing any mock. Build mock factories that return shapes validated against the actual TypeScript types:

```typescript
// Anthropic tool_use response — matches what AnthropicProvider.doComplete() actually reads
function makeAnthropicToolResponse<T>(data: T): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-6',
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50 },
    content: [
      {
        type: 'tool_use',
        id: 'tool_test',
        name: 'structured_response',
        input: data,
      },
    ],
  } satisfies Anthropic.Message;
}
```

Using `satisfies` ensures TypeScript catches shape mismatches at compile time, not silently at runtime.

**Warning signs:**

- Provider tests pass 100% but the actual happy path (tool_use block extraction) is never hit
- Coverage shows `provider.doComplete()` is covered but `block.input` access is never reached
- Changing the mock to return empty content still passes the test
- Integration tests fail for reasons that unit tests should have caught

**Phase to address:**
Provider mock setup — before any AI round tests are written. Create typed mock factories in a shared test utilities module (`tests/helpers/provider-mocks.ts`) and enforce their use across all provider-touching tests.

---

### Pitfall 3: Testing File System Analyzers With Real Temporary Files Instead of In-Memory State

**What goes wrong:**
The file system analyzers (`src/analyzers/file-tree.ts`, `src/analyzers/dependency-graph.ts`, `src/analyzers/todo-scanner.ts`, etc.) read real files via `node:fs`. Teams faced with testing these either: (a) use `mock-fs` to intercept `fs` module calls, or (b) create real temporary directories. Both have severe problems.

`mock-fs` intercepts Node's internal `fs` bindings, which are not stable API. It breaks with Node.js major updates, does not support all `fs/promises` methods, and silently corrupts dynamic `require()` paths (causing tree-sitter WASM loading to fail mid-test). The `backstage` project had to replace `mock-fs` across their entire test suite due to maintenance breakage.

Creating real temporary directories works but makes tests slow, creates cleanup requirements that fail under parallel execution, and produces flaky failures on CI when the temp directory is on a slow filesystem or when cleanup races with the next test's setup.

**How to avoid:**
Use `memfs` (in-memory fs reimplementation with 1-to-1 `fs` API coverage) for unit tests of individual analyzers. Import swap at the module level using `vi.mock()`:

```typescript
vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return fs.promises;
});
```

For the integration tests that already run the full CLI against real fixtures (the existing pattern in `tests/integration/`), keep using real temp dirs — the integration tests are already structured correctly. Unit tests of individual analyzers should use `memfs`. Keep these roles clearly separated: unit tests verify logic in isolation, integration tests verify the full pipeline.

Critically: do not attempt to mock `node:fs` for any test that also loads tree-sitter WASM. WASM loading requires real filesystem access to the grammar cache directory. Separate WASM-using analyzers from pure-logic analyzers.

**Warning signs:**

- Tests fail in CI but pass locally (temp directory cleanup timing)
- `Error: ENOENT` when `mock-fs` intercepts a path tree-sitter needs
- Node.js version upgrade breaks all fs-mocked tests simultaneously
- `afterEach` cleanup fails occasionally under parallel test execution

**Phase to address:**
Unit test foundation phase. Establish `memfs` as the standard before writing any analyzer unit tests. Document the rule: unit tests use `memfs`, integration tests use real temp dirs.

---

### Pitfall 4: Silent Catch Blocks Make Tests Pass When They Should Fail

**What goes wrong:**
This codebase has 8 silent or near-silent `catch` blocks (e.g., `src/analyzers/coordinator.ts`, `src/analyzers/ast-analyzer.ts`, the integration test cleanup in `tests/integration/setup.ts`). When unit tests exercise code paths that hit these catch blocks, the test passes (no exception thrown) while the actual behavior is wrong. Coverage shows the catch block as "covered" but what happened was error swallowing, not correct error handling.

This manifests concretely: testing `ASTAnalyzer.analyze()` with a bad input produces `{ success: false, data: EMPTY_AST }` instead of throwing. A test that only checks `result.success === false` passes whether the correct error was swallowed OR the analyzer genuinely failed gracefully. The two behaviors are not distinguished by the test.

**Why it happens:**
The graceful degradation pattern (every analyzer returns empty result on failure rather than throwing) is correct for the production pipeline but hostile to testing. It means "this function never throws" and tests can't use `expect().toThrow()`. Teams write happy-path tests and assume catch blocks are tested because coverage marks them green.

**How to avoid:**
For each silent catch block, write two separate test cases: (1) verify the fallback result is the expected empty/default shape, AND (2) verify `logger.warn()` was called with a message matching the error condition. The second assertion distinguishes "correctly handled" from "silently swallowed." Use `vi.spyOn(logger, 'warn')` before the call and assert the spy was called.

When hardening catch blocks (converting them from silent to logged), add the logger assertion to the test in the same commit. This prevents silent-catch behavior from being re-introduced by future changes.

**Warning signs:**

- Coverage shows 100% on a catch block but there's no assertion about what the catch block did
- The same test passes whether the mocked dependency throws or succeeds
- `logger.warn` is never asserted in any test that covers error paths
- A test that deliberately passes bad input gets a "success: false" result but no verification of the error message

**Phase to address:**
Silent catch audit phase. Before testing any module that contains a catch block, write the warn-assertion test pattern. Failing to do this means the hardening work (converting silent catches to logged catches) has no test coverage.

---

### Pitfall 5: Tightening 0.x Version Constraints Causes Lock-Step Upgrade Failure

**What goes wrong:**
The `package.json` currently uses `^` constraints (e.g., `"@anthropic-ai/sdk": "^0.39.0"`). Changing these to exact pins or `~` constraints for "safety" without running `npm install` and verifying the resulting `package-lock.json` can cause CI to fail in unexpected ways. More critically: tightening a 0.x package (e.g., `"^0.39.0"` → `"0.39.0"`) may pin a version that is itself incompatible with another dependency's transitive requirement.

For `openai@^5.23.2` and `@anthropic-ai/sdk@^0.39.0`, both SDKs are in active development. Pinning to exact versions means that when a security advisory requires an update, every consumer of the published package must manually update their `package.json` instead of getting the patch automatically. This is the wrong tradeoff for a published npm package.

**Why it happens:**
"Exact pins are safer" is true for application deployments, but this project is a published npm CLI tool (`handover-cli`). For published packages, tight constraints create dependency hell downstream. The `^` convention for published packages is correct — restrict minor/major, allow patches.

**How to avoid:**
For the published package: use `^` for all production dependencies (this is already correct). Do not tighten to exact versions or `~`. For dev dependencies (test runners, type packages), exact pins or `~` are acceptable and reduce flakiness in CI.

When adding version constraints, verify: (1) `npm install` with the new constraints does not change `package-lock.json` for any production dependency, and (2) `npm audit` passes after the change. Do not confuse "reproducible CI builds" (achieved via `npm ci` + committed lockfile) with "narrow version constraints."

**Warning signs:**

- `npm install` after tightening constraints changes `package-lock.json` for a transitive dependency
- A test dependency version change breaks a production build due to a transitive version conflict
- `npm ci` fails in a fresh environment after tightening constraints
- A peer dependency warning appears that was absent before the constraint change

**Phase to address:**
Dependency hardening phase. Audit constraints last, after tests are written and passing. Verify that `npm ci` produces an identical install in three environments: macOS, Linux (CI), and a clean Docker container.

---

### Pitfall 6: Extracting Hardcoded Values Changes Semantics When Type Inference Narrows

**What goes wrong:**
Extracting magic numbers and strings to named constants seems safe but can silently change TypeScript type inference. When a value like `'tool_use'` is hardcoded inline, TypeScript infers the narrow literal type `'tool_use'`. When the same value is extracted to `const BLOCK_TYPE = 'tool_use'`, TypeScript infers the wider type `string` (unless `as const` is used). Code that type-checks correctly with the literal inline may fail to compile or produce incorrect behavior after extraction without `as const`.

For this codebase: the scoring weights in `src/context/scorer.ts` and the model pricing in `src/providers/presets.ts` use numeric literals in arithmetic. Extracting these to named constants without verifying the arithmetic produces identical results (especially with floating-point math) can introduce precision differences that change which files are included in context packing.

**Why it happens:**
Extraction is treated as a pure rename. Developers do not check TypeScript inference after extraction, do not verify numeric output equality, and do not run the full test suite to confirm no behavioral change. The type narrowing issue is especially subtle because the code often still compiles — it just no longer satisfies an `as const` enum or discriminated union constraint.

**How to avoid:**
Always append `as const` to extracted string and numeric literal constants:

```typescript
// Wrong — infers type 'string'
const STOP_REASON = 'tool_use';

// Correct — infers type 'tool_use' (literal)
const STOP_REASON = 'tool_use' as const;
```

For numeric scoring weights: after extraction, run the existing integration tests to verify output documents are identical to the baseline. Specifically, context packing (which uses the scoring weights) must produce the same file selection order. Capture a snapshot of `scorer.scoreFile()` output on a fixed input before extracting, and verify it matches after.

For model pricing: write a test that asserts `calculateCost(1_000_000, model)` returns the exact same number before and after extraction.

**Warning signs:**

- TypeScript compilation fails after extraction with "Argument of type 'string' is not assignable to type 'tool_use'"
- Context packing selects different files in integration tests after scoring weight extraction
- A cost estimate changes by a small amount (floating-point precision) after extraction
- `as const` is missing from any newly extracted string or numeric constant

**Phase to address:**
Constants extraction phase. Write a snapshot test for `scoreFile()` output before touching any constants. Add this to the test suite, then extract constants, and verify the snapshot is unchanged.

---

### Pitfall 7: Coverage Threshold at 80% Causes Wrong Files to Be Tested First

**What goes wrong:**
The `vitest.config.ts` sets coverage thresholds at 80% for lines, functions, branches, and statements globally. When retroactively adding 100+ tests to a codebase with 0 unit tests, teams chase the 80% threshold by testing the easiest files first — utility functions, simple transforms, type guards. This is the wrong priority order. The files that most need tests are the ones most likely to have bugs: the 8 silent catch blocks, the scoring/pricing arithmetic, the CLI argument validation. These are harder to test but higher value.

High global coverage with low coverage on critical paths produces false safety. A codebase at 85% coverage where `src/providers/anthropic.ts` is at 20% and `src/utils/logger.ts` is at 100% is worse than 50% coverage with critical paths covered.

**Why it happens:**
The threshold enforces a number, not a location. Tests are written wherever they're easiest to write, not wherever they're most needed. The metric drives the behavior.

**How to avoid:**
Override coverage thresholds per-file for critical modules. In `vitest.config.ts`, add `perFile: true` or use the `include` pattern to enforce stricter thresholds on specific directories:

```typescript
coverage: {
  thresholds: {
    lines: 80,         // global minimum
    functions: 80,
    branches: 80,
    statements: 80,
  },
}
```

For this milestone, explicitly prioritize test order:

1. Critical: `src/providers/anthropic.ts`, `src/providers/openai-compat.ts` (LLM interface — most likely to break)
2. Critical: `src/context/scorer.ts`, `src/context/token-counter.ts` (arithmetic used for billing)
3. High: `src/ai-rounds/validator.ts`, `src/ai-rounds/quality.ts` (quality gates with no existing tests)
4. High: `src/cli/index.ts` argument validation paths (currently missing validation)
5. Medium: Individual analyzers with silent catch blocks
6. Low: Renderers, formatters, logger utility

**Warning signs:**

- 80% global coverage achieved but `src/providers/` has < 40% coverage
- Every test added was for a file under 50 lines
- The CI green check passes but no test covers the tool_use response parsing path
- Test count is 100+ but no test has ever caused a test failure that wasn't immediately obvious

**Phase to address:**
Unit test foundation phase. Define the test priority order before writing any tests. Track per-module coverage from the start, not just global coverage.

---

### Pitfall 8: Missing Import in CI Is Symptom of ESM/Build Artifacts Problem, Not a Simple Fix

**What goes wrong:**
The project currently has a broken CI import. In ESM projects with `moduleResolution: NodeNext`, every local import must include the `.js` extension even for `.ts` source files. Missing this extension compiles fine with `tsc` locally (which is lenient) but fails at runtime when Node.js resolves the module. CI runs the compiled output, which surfaces the error; local development with `tsx` may not surface it because `tsx` rewrites extensions.

If the broken import is "fixed" by adding `.js` without understanding why the pattern occurred, the same mistake will be repeated in every new test file that imports from `src/`. A test file that imports `'../src/providers/anthropic'` instead of `'../src/providers/anthropic.js'` will fail in CI but may pass locally.

**Why it happens:**
The `NodeNext` module resolution convention requires `.js` extensions in TypeScript source imports — this is counterintuitive and differs from every other TypeScript configuration. Test files written by developers unfamiliar with this convention will omit the extension and pass locally with `tsx` (which handles the rewriting) but fail in CI.

**How to avoid:**
Add the TypeScript ESLint rule `@typescript-eslint/consistent-type-imports` and configure it to enforce `.js` extensions. Add `import/extensions` rule from `eslint-plugin-import` set to `always` for `.ts` files. Run `eslint --fix` on all test files before the CI check.

In `vitest.config.ts`, add `resolve.extensions` configuration to allow Vitest to resolve both `.ts` and `.js` imports during test runs, matching the `tsx` behavior in local development. This prevents the "passes locally, fails in CI" class of failures.

**Warning signs:**

- `Cannot find module '../providers/anthropic'` in CI but not locally
- Tests that import from `src/` use mixed extension conventions (some `.js`, some bare)
- Any test file added by a developer who primarily works with non-`NodeNext` projects
- ESLint has no rule enforcing `.js` extensions on local imports

**Phase to address:**
Test infrastructure setup — the very first task, before any tests are written. Fix the broken import, add the ESLint rule, and establish the convention in a test utilities file that every other test imports.

---

## Moderate Pitfalls

### Pitfall 9: Mocking the LLM Provider Interface Instead of the SDK Class

**What goes wrong:**
There are two valid places to mock LLM calls: (1) mock the `LLMProvider` interface (the internal abstraction in `src/providers/base.ts`), or (2) mock the external SDK (`@anthropic-ai/sdk`, `openai`). Teams that mock the SDK are writing tests that depend on the SDK's internal implementation — if the SDK changes how it structures its response objects, all SDK-level mocks break simultaneously. Teams that mock `LLMProvider.complete()` are testing the application logic without SDK coupling.

For testing AI round logic (`src/ai-rounds/round-*.ts`, `src/ai-rounds/runner.ts`), the correct mock target is the `LLMProvider` interface. The round logic calls `provider.complete(request, schema)` — mock that. SDK-level mocks are only appropriate when specifically testing `AnthropicProvider` or `OpenAICompatProvider` themselves.

**Why it happens:**
Mocking at the SDK level feels "more complete." Developers want to verify the full call chain. But this produces tests that are brittle to SDK updates and slow to write (requires constructing valid SDK response shapes).

**How to avoid:**
Establish a shared `createMockProvider()` helper that returns a typed mock of `LLMProvider`:

```typescript
export function createMockProvider(response: unknown): LLMProvider {
  return {
    name: 'mock',
    complete: vi
      .fn()
      .mockResolvedValue({ data: response, usage: { inputTokens: 10, outputTokens: 20 } }),
    estimateTokens: vi.fn().mockReturnValue(100),
    maxContextTokens: vi.fn().mockReturnValue(200_000),
  };
}
```

Use this for all AI round tests. Use SDK-level mocks only in `src/providers/*.test.ts` where the provider implementation is what's under test.

**Warning signs:**

- AI round tests import from `@anthropic-ai/sdk`
- Provider mock requires constructing a 20-field SDK response object
- An SDK minor version update breaks 50+ tests simultaneously

**Phase to address:**
Unit test foundation phase — create `tests/helpers/provider-mocks.ts` before any round tests are written.

---

### Pitfall 10: CLI Argument Validation Tests Require Build Before Running

**What goes wrong:**
The existing integration tests run the compiled CLI (`dist/index.js`) via `execFileSync`. Adding unit tests for CLI argument validation in `src/cli/index.ts` requires either: (a) running through the built binary (slow, requires `npm run build` first), or (b) importing the CLI module directly in unit tests. Direct import of `src/cli/index.ts` triggers Commander.js to register commands at import time, which may call `process.exit()` if the test environment doesn't provide expected arguments.

Teams that try to unit-test Commander.js command handlers directly often hit this issue: importing `index.ts` starts the Commander.js program immediately, which may attempt to parse `process.argv`, find unexpected arguments (Vitest's own args), and exit.

**Why it happens:**
Commander.js is designed for direct execution, not import-and-test. The top-level execution in `src/cli/index.ts` calls `program.parseAsync()` or `program.parse()` at import time.

**How to avoid:**
Separate the Commander.js setup from execution. The command handlers (`runGenerate`, `runAnalyze`, `runEstimate`, `runInit`) are already importable separately. Unit-test those handler functions directly, passing mock config and mock providers. Do not attempt to unit-test the Commander.js wiring — that's already covered by the integration tests.

For argument validation specifically: if validation logic is added to handlers, test the handler functions directly. If validation is inline in the Commander.js option definitions (e.g., `.argParser()`), test those parser functions in isolation.

**Warning signs:**

- Test file that imports `src/cli/index.ts` causes `process.exit()` to be called during test setup
- Tests require `npm run build` before `npm test`
- `vitest` reports "process exited with code 1" for a test that imports the CLI module

**Phase to address:**
CLI validation phase. Ensure all validation logic is in testable handler functions before writing any validation tests. Add a note to the test file: "Do not import `src/cli/index.ts` in unit tests — test the handlers directly."

---

### Pitfall 11: Coverage Shows WASM Code Paths As Uncovered and Inflates the Gap

**What goes wrong:**
The tree-sitter parsing code in `src/parsing/parser-service.ts` and the extractors (`typescript.ts`, `python.ts`, etc.) require WASM initialization (`TreeSitter.init()`) before any test can exercise them. Running these in a unit test environment either requires real WASM files (making tests slow and environment-dependent) or produces module load errors. Coverage reporting then marks these files as 0% covered, dragging the global average below the 80% threshold even though the files are tested via integration tests.

**Why it happens:**
V8 coverage (what `vitest --coverage` uses) counts lines across all included files regardless of whether they were reachable in the test environment. WASM-dependent modules cannot be exercised in a pure unit test environment.

**How to avoid:**
Add the WASM-dependent files to coverage `exclude` patterns for unit test runs:

```typescript
coverage: {
  exclude: [
    'src/parsing/parser-service.ts',
    'src/parsing/extractors/typescript.ts',
    'src/parsing/extractors/python.ts',
    'src/parsing/extractors/rust.ts',
    'src/parsing/extractors/go.ts',
    'src/grammars/downloader.ts',
    // ...
  ],
}
```

These files are covered by the existing integration tests. The unit test coverage report should only measure files that can actually be unit-tested. Mixing integration-covered files into unit-test coverage metrics produces a misleading number in both directions.

**Warning signs:**

- Global coverage is far below 80% but every non-WASM file is above 90%
- `parser-service.ts` shows 0% in coverage even though parsing works in integration tests
- `npm test` consistently fails the coverage threshold even with extensive unit tests

**Phase to address:**
Test infrastructure setup — configure `vitest.config.ts` coverage exclusions before running coverage for the first time.

---

### Pitfall 12: Extracting Pricing Constants Makes Stale Data Harder to Find

**What goes wrong:**
The current hardcoded pricing in `src/providers/presets.ts` is visible and easy to find. Extracting it to a named constant file (`src/providers/pricing-constants.ts`) does not solve the staleness problem — it just moves the hardcoded values to a different file. Teams extracting the constants assume the extraction makes them easier to update, but without a mechanism to detect staleness (a test that validates against a current API, or a documented update procedure), the constants become more buried, not more maintainable.

More specifically: the pricing data for 7 providers across ~15 models is time-sensitive. Anthropic has repriced multiple times in 2024-2025. If a cost estimate is wrong by 10x (e.g., using claude-sonnet pricing for claude-opus), users may significantly over-run their budget.

**Why it happens:**
Extraction is conflated with verification. Moving hardcoded values to a constants file is a code-organization improvement but does not address the underlying problem of staleness.

**How to avoid:**
After extracting pricing constants, add a test that documents the expected values and will fail when someone changes them:

```typescript
it('pricing constants match documented values', () => {
  expect(PROVIDER_PRESETS.anthropic.pricing['claude-opus-4-6']).toStrictEqual({
    inputPerMillion: 15,
    outputPerMillion: 75,
  });
  // ... etc for all models
});
```

This test does not verify the values are current — it verifies that future changes to the constants are intentional and reviewed. Add a comment at the top of the constants file: "Last verified: [date]. Source: [URL]. Update this date when prices are verified."

**Warning signs:**

- Pricing constants are extracted to a new file but no test covers the expected values
- Cost estimate shown in `handover estimate` differs from the actual API invoice by > 20%
- The pricing constants file has not been updated in 12+ months

**Phase to address:**
Constants extraction phase. Write the snapshot test for pricing data before extracting the constants. The test makes the extraction safe (future accidental changes are caught) and documents the expected values.

---

## Technical Debt Patterns

Shortcuts that seem reasonable during a test-addition sprint but create long-term problems.

| Shortcut                                                       | Immediate Benefit                   | Long-term Cost                                                                       | When Acceptable                                                                        |
| -------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Test the integration entry point instead of individual modules | Less mocking required, tests "work" | Tests are slow, flaky, don't isolate failure location                                | Never for logic that has unit-testable boundaries                                      |
| Mock `LLMProvider` at SDK level instead of interface level     | Tests "the real thing"              | Brittle to SDK updates, complex response construction                                | Only in provider implementation tests (`src/providers/*.test.ts`)                      |
| Use `mock-fs` for file system testing                          | Easy to set up                      | Breaks on Node.js major updates, incompatible with WASM loading                      | Never — use `memfs` or real temp dirs                                                  |
| Chase 80% coverage with easy utility tests                     | Fast coverage gain                  | Critical paths (providers, validators) remain untested                               | Never — coverage order must follow risk order                                          |
| Extract constants without `as const`                           | Faster refactor                     | TypeScript widens literal types; discriminated unions break                          | Never — always use `as const` for extracted literal constants                          |
| Skip `vi.hoisted()` and use `vi.doMock()` instead              | Avoids hoisting complexity          | `vi.doMock()` requires dynamic imports in tests, making them harder to read          | Acceptable for single-use mocks; not for shared mock infrastructure                    |
| Leave silent catch blocks unchanged while writing tests        | Tests pass faster                   | Tests cover the catch path without verifying what happened (logged? returned empty?) | Never — add warn assertions to every catch path test                                   |
| Pin dev dependency versions exactly                            | CI reproducibility                  | Blocks security patches from auto-applying to CI                                     | Acceptable for dev dependencies only; never for production deps in a published package |

---

## Integration Gotchas

Common mistakes when adding tests to specific integration points in this codebase.

| Integration                                 | Common Mistake                                                                                          | Correct Approach                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `AnthropicProvider` + `vi.mock`             | Mocking `@anthropic-ai/sdk` default export as a plain object                                            | Mock as a class with `messages.create` method; Anthropic SDK uses class instantiation pattern                                    |
| `OpenAICompatProvider` + `vi.mock`          | Returning `choices[0].message.content` instead of `choices[0].message.tool_calls[0].function.arguments` | Read `openai-compat.ts` source to understand which response field is read                                                        |
| `fileTreeAnalyzer` + `memfs`                | Using `memfs` but forgetting to also mock `fast-glob` (which uses its own fs access)                    | Mock `fast-glob` separately or use the real filesystem via temp dirs for analyzer tests                                          |
| `scorer.scoreFile()` + constants extraction | Running scorer tests before and after extraction assuming results will match                            | Floating-point arithmetic with extracted constants may differ by epsilon; use `toBeCloseTo()` not `toBe()` for float comparisons |
| `DAGOrchestrator` + failed steps            | Testing only the happy path; no test for dependency skip on step failure                                | Add a test where a step throws and verify all dependent steps are marked `skipped`                                               |
| `logger` + silent catch blocks              | Using `console.spy` instead of `vi.spyOn(logger, 'warn')`                                               | `logger.ts` wraps `console` — spy on the logger methods, not the underlying console                                              |
| CLI argument validation + Commander.js      | Importing `src/cli/index.ts` directly in unit tests                                                     | Import only the handler functions (`runGenerate`, `runAnalyze`) — never import the CLI entry point in unit tests                 |
| Coverage + WASM files                       | Including `src/parsing/**` in coverage configuration                                                    | Exclude all WASM-dependent files from unit test coverage; they are covered by integration tests                                  |

---

## Performance Traps

Patterns that make the test suite slow, flaky, or hard to maintain at 100+ tests.

| Trap                                                            | Symptoms                                               | Prevention                                                                                         | When It Breaks                                               |
| --------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Running all tests with `testTimeout: 120_000`                   | Slow test suite; failures take 2 minutes to surface    | Set short timeouts (5s) for unit tests; keep 120s only for integration tests that actually need it | From the first test run — unit tests should complete in < 1s |
| Creating real temp directories in unit tests                    | Flaky failures on cleanup; slow on network filesystems | Use `memfs` for unit tests; only create real temp dirs in integration tests                        | Under parallel execution or slow CI filesystems              |
| Shared mock state between tests via module-level `vi.fn()`      | Tests pass in isolation but fail when run together     | Use `beforeEach` to reset mock return values; never rely on mock state set in one test for another | When test files run in parallel                              |
| Importing `src/cli/generate.ts` (1000+ line file) in unit tests | Long module load times; Commander.js side effects      | Import only the specific function being tested, not the entire module                              | Immediately — each additional export increases load time     |

---

## Security Mistakes

Security-specific issues that arise when adding validation and error handling.

| Mistake                                                                       | Risk                                                 | Prevention                                                                             |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Logging CLI argument values in error messages                                 | API keys passed via `--api-key` appear in error logs | Redact any argument that matches `/(key\|token\|secret\|password)/i` before logging    |
| Validation error messages that echo user input verbatim                       | Path traversal attempts visible in logs              | Sanitize displayed paths to repo-root-relative; never log absolute user-supplied paths |
| Adding `console.log` debug statements in catch blocks during test development | Debug output in production builds                    | Use `logger.warn()` exclusively; add ESLint rule `no-console` with `error` severity    |
| Error messages that expose internal file paths                                | File structure information leakage                   | Use repo-root-relative paths in all user-facing error messages                         |

---

## "Looks Done But Isn't" Checklist

Things that appear complete during this testing/hardening milestone but are missing critical properties.

- [ ] **Provider mocks:** Mock response shape verified against `satisfies` TypeScript type — not just "test passes"
- [ ] **Silent catch blocks:** Every catch block test includes a `logger.warn` assertion — coverage alone is insufficient
- [ ] **Constants extraction:** All extracted string literals include `as const` — verified by TypeScript compilation in strict mode
- [ ] **Pricing snapshot test:** A test exists that will fail if any model pricing value changes accidentally
- [ ] **Scoring snapshot test:** A test exists that verifies `scoreFile()` output on a fixed fixture before and after extraction
- [ ] **ESM import extensions:** All test files use `.js` extensions on local imports — verified by ESLint rule
- [ ] **Coverage exclusions:** WASM-dependent files excluded from unit test coverage — verified by running `vitest --coverage` and confirming no WASM files appear in the gap
- [ ] **CLI argument validation:** Tests exercise the handler functions directly, not via the built binary — no `npm run build` required for `npm test`
- [ ] **Dependency version changes:** `npm ci` verified to produce identical install on a clean Linux environment — not just the developer's machine

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall                                                          | Recovery Cost | Recovery Steps                                                                                                                   |
| ---------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| vi.mock hoisting failures across many test files                 | MEDIUM        | Find all uses of top-level variables inside `vi.mock()` factory; replace with `vi.hoisted()` pattern; one-time migration         |
| Wrong SDK response shape in provider mocks                       | LOW           | Add `satisfies Anthropic.Message` to mock factory; TypeScript immediately surfaces all mismatches                                |
| mock-fs breaking on Node.js update                               | HIGH          | Replace all `mock-fs` usage with `memfs`; isolate WASM-using tests to integration suite; likely requires rewriting 20+ tests     |
| 80% threshold met but critical paths untested                    | MEDIUM        | Add per-file coverage thresholds for `src/providers/`, `src/context/`; gap is immediately visible in coverage report             |
| Constants extracted without `as const`; TypeScript errors appear | LOW           | Add `as const` to each extracted constant; compiler immediately shows all affected callsites                                     |
| CI broken import never fixed properly                            | LOW           | Fix with `.js` extension; add `import/extensions: always` ESLint rule; run `eslint --fix` on all files                           |
| Silent catch blocks tested but warn not asserted                 | MEDIUM        | Add `vi.spyOn(logger, 'warn')` assertion to each catch path test; missing assertions don't require test rewrites, just additions |

---

## Pitfall-to-Phase Mapping

How roadmap phases for this milestone should address these pitfalls.

| Pitfall                                | Prevention Phase           | Verification                                                                                            |
| -------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| vi.mock hoisting / `vi.hoisted()`      | Test infrastructure setup  | `vi.hoisted()` pattern present in shared test utilities; no top-level vars inside `vi.mock()` factories |
| LLM mock response shape mismatch       | Provider mock utilities    | `makeAnthropicToolResponse()` uses `satisfies Anthropic.Message`; TypeScript compiles with strict       |
| mock-fs breaking WASM loading          | Test infrastructure setup  | WASM-dependent tests explicitly excluded from unit test suite; `memfs` used for fs mocks                |
| Silent catch blocks not verified       | Silent catch audit phase   | Every catch block test includes `vi.spyOn(logger, 'warn')` assertion                                    |
| 0.x version tightening risks           | Dependency hardening phase | `npm ci` verified on clean Linux; `npm audit` passes; no new peer dependency warnings                   |
| Constants extraction widens types      | Constants extraction phase | `as const` on all extracted constants; TypeScript compilation passes in strict mode                     |
| Coverage chasing wrong files           | Unit test foundation       | Per-module coverage tracked; `src/providers/` and `src/context/` covered first                          |
| CI broken import pattern repeats       | Test infrastructure setup  | ESLint `import/extensions: always` rule enforced; `eslint src tests` passes with 0 warnings             |
| CLI arg validation tests require build | CLI validation phase       | Handler functions tested directly; no `execFileSync` in unit test files                                 |
| WASM files inflate coverage gap        | Test infrastructure setup  | WASM-dependent files in `vitest.config.ts` coverage `exclude` list                                      |
| Pricing constants become stale         | Constants extraction phase | Snapshot test for pricing values exists; test comment documents last-verified date and source URL       |

---

## Sources

- [Vitest Mocking Modules — Official Documentation](https://vitest.dev/guide/mocking/modules) — HIGH confidence (official source; `vi.hoisted()` behavior, factory function hoisting constraints)
- [Vitest Issue #3228: Introduce vi.hoisted to run code before imports](https://github.com/vitest-dev/vitest/issues/3228) — HIGH confidence (official GitHub; documents the hoisting problem and the `vi.hoisted()` solution)
- [Backstage Issue #20436: Replacing mock-fs in tests](https://github.com/backstage/backstage/issues/20436) — HIGH confidence (real-world post-mortem; `mock-fs` maintenance breakage at scale)
- [memfs npm](https://www.npmjs.com/package/memfs) — HIGH confidence (actively maintained; 1-to-1 `fs/promises` compatibility)
- [Stack Overflow Blog: Making your code base better will make your code coverage worse (Dec 2025)](https://stackoverflow.blog/2025/12/22/making-your-code-base-better-will-make-your-code-coverage-worse/) — MEDIUM confidence (practitioner analysis; coverage metric as lagging indicator)
- [The Pitfalls of Code Coverage (David Burns, 2024)](https://www.theautomatedtester.co.uk/blog/2024/the-pitfalls-of-code-coverage/) — MEDIUM confidence (practitioner; coverage does not measure catch block correctness)
- [TypeScript Issue #43333: Type narrowing lost after 'extract to constant' refactoring](https://github.com/microsoft/TypeScript/issues/43333) — HIGH confidence (TypeScript core team; `as const` requirement for extracted literals)
- [Vitest Coverage v8 incorrect branch coverage issues](https://github.com/vitest-dev/vitest/issues/6380) — HIGH confidence (official GitHub issue; V8 coverage limitations with ESM/TypeScript)
- [How to Rapidly Introduce Tests When There Is No Test Coverage (Medium/Startup)](https://medium.com/swlh/how-to-rapidly-introduce-tests-when-there-is-no-test-coverage-8bb07930a3ee) — MEDIUM confidence (practitioner; priority ordering for retroactive test addition)
- [The Dangers of Using Empty Catch Blocks in TypeScript (WebDevTutor)](https://www.webdevtutor.net/blog/typescript-empty-catch-block) — MEDIUM confidence (practitioner; silent failure modes in catch blocks)
- Codebase direct analysis: `src/providers/anthropic.ts`, `src/providers/openai-compat.ts`, `src/providers/presets.ts`, `src/context/scorer.ts`, `src/context/token-counter.ts`, `src/ai-rounds/validator.ts`, `src/ai-rounds/quality.ts`, `vitest.config.ts`, `package.json`, `tests/integration/setup.ts` — HIGH confidence (first-party source)

---

_Pitfalls research for: adding unit tests and hardening to handover TypeScript CLI (v3.0 milestone)_
_Researched: 2026-02-19_
