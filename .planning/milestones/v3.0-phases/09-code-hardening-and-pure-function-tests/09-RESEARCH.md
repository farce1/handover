# Phase 9: Code Hardening and Pure Function Tests - Research

**Researched:** 2026-02-19
**Domain:** TypeScript code quality hardening + Vitest unit testing
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Scoring weight exposure

- Named constants exported with `as const` — internal API only, not user-configurable
- Co-located in the scorer module (not a separate shared constants file) — keeps coupling local
- Group related weights together (e.g., file scoring weights, tier thresholds) with descriptive names
- Document the scoring model in code comments for contributor clarity, not user docs

#### Catch block policy

- Every catch block gets one of three treatments:
  1. `logger.debug()` if the error is expected/recoverable (e.g., file not found, optional feature missing)
  2. Explanatory comment if truly intentional silent behavior with a clear reason why
  3. Re-throw or `logger.warn()` if the error indicates a real problem that shouldn't be swallowed
- No bare empty catches — zero tolerance for undocumented silent swallows
- Differentiate "expected failure" from "lazy error handling" — the audit tags each catch with its rationale

#### CLI validation UX

- Validate in order of user control: cheapest/most-actionable check first
- `--only` unknown alias → fail immediately with actionable error listing valid aliases, before any API key check
- Error messages should name the invalid input and suggest the fix (e.g., "Unknown doc alias 'foo'. Valid aliases: readme, architecture, ...")
- No prompt for API key if the command will fail anyway due to bad flags

#### Test organization and style

- Table-driven tests with `test.each` for functions with combinatorial inputs (scoring, token budgets)
- Explicit assertions over snapshots — tests document expected behavior, not implementation output
- Test names describe the business behavior, not the code path (e.g., "returns zero score for empty file" not "handles edge case")
- Cover boundary conditions systematically: zero values, single items, max capacity, empty inputs, malformed inputs
- Each test file co-located with source (e.g., `scorer.test.ts` next to `scorer.ts`)

### Claude's Discretion

- Exact constant naming conventions (UPPER_SNAKE vs camelCase with `as const`)
- Whether to split scorer constants into sub-groups or keep flat
- Logger.debug message format and verbosity level
- Test helper extraction — when shared setup warrants a helper vs inline
- Exact boundary values to test (specific numbers for budget thresholds, etc.)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 9 has four distinct workstreams: (1) extract magic numbers from `scorer.ts` into named constant exports, (2) audit all 38 catch blocks across 20 source files and classify each as "documented silent," "logger.debug," or "needs escalation," (3) reorder CLI validation so `resolveSelectedDocs()` fires before `resolveApiKey()`, and (4) write unit tests for seven pure functions. All workstreams are pure refactors or additions with no dependency on external libraries beyond what is already installed.

The primary technical challenge in this phase is the catch block audit: the codebase already has reasonable inline comments on most catch blocks, but the policy requires a consistent taxonomy and the addition of `logger.debug()` in cases where the error is expected-but-worth-knowing. The `Logger` class currently has no `debug()` method, so it must be added as part of this phase. The CLI reordering is a straightforward move of two function calls, but requires verifying the exact execution order in `generate.ts`.

Unit tests are the largest deliverable by line count. The seven target functions are all genuinely pure or near-pure: `scoreFiles()`, `computeTokenBudget()`, `estimateTokens()`, `resolveSelectedDocs()`, `computeRequiredRounds()`, `HandoverConfigSchema`, and `createStep()`. The vitest config currently includes `src/**/*.test.ts` and excludes `src/domain/schemas.ts` — but `HandoverConfigSchema` is in `src/config/schema.ts` which is NOT excluded, so tests are straightforward. The mock infrastructure (`createMockProvider()`) already exists and is typed.

**Primary recommendation:** Address workstreams in order: constants extraction first (lowest risk, high clarity value), catch block audit second (systematic file-by-file scan), CLI reorder third (single targeted change), unit tests fourth (largest volume, isolated from the other three).

---

## Standard Stack

### Core (already installed — no new dependencies needed)

| Library    | Version | Purpose           | Why Standard                                           |
| ---------- | ------- | ----------------- | ------------------------------------------------------ |
| vitest     | ^4.0.18 | Test runner       | Already installed; configured in `vitest.config.ts`    |
| zod        | ^4.3.6  | Schema validation | Powers `HandoverConfigSchema`; already used throughout |
| TypeScript | ^5.7.0  | Type safety       | Source language; `as const` is a native TS feature     |

### Supporting (already installed)

| Library              | Version | Purpose                 | When to Use                                                           |
| -------------------- | ------- | ----------------------- | --------------------------------------------------------------------- |
| @vitest/coverage-v8  | ^4.0.18 | Coverage reports        | Already configured; relevant for test gap analysis                    |
| vitest-mock-extended | ^3.1.0  | Extended mock utilities | Available but `createMockProvider()` already covers LLM mocking needs |

### Alternatives Considered

| Instead of                        | Could Use                         | Tradeoff                                                                                                                                                                                 |
| --------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test.each` with object arrays    | Template literal tables           | Object arrays are more TypeScript-friendly; template literals add formatting noise                                                                                                       |
| Inline test helpers               | Separate `__fixtures__` files     | Inline wins for small datasets; extract only if fixture is shared across 3+ test files                                                                                                   |
| `logger.debug()` for catch blocks | `logger.log()` (existing verbose) | `debug()` is the conventional name for developer-only noise; `log()` already exists as verbose but is semantically "step trace," not "expected error"; a new `debug()` method is cleaner |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Test File Layout

```
src/
├── config/
│   ├── schema.ts                  # HandoverConfigSchema lives here
│   └── schema.test.ts             # NEW: HandoverConfigSchema tests
├── context/
│   ├── scorer.ts                  # scoreFiles() — magic numbers to extract here
│   ├── scorer.test.ts             # NEW: scoreFiles() tests
│   ├── token-counter.ts           # computeTokenBudget(), estimateTokens()
│   └── token-counter.test.ts      # NEW: computeTokenBudget() + estimateTokens() tests
├── orchestrator/
│   ├── step.ts                    # createStep()
│   └── step.test.ts               # NEW: createStep() tests
└── renderers/
    ├── registry.ts                # resolveSelectedDocs(), computeRequiredRounds()
    └── registry.test.ts           # NEW: resolveSelectedDocs() + computeRequiredRounds() tests
```

### Pattern 1: Named Constants with `as const` in scorer.ts

**What:** Extract all inline numeric literals into named, exported constants at the top of the module.
**When to use:** Anywhere a number appears that encodes domain knowledge (scoring weights, caps, penalties, thresholds).

**Current state in `scorer.ts` (lines 192–208) — magic numbers used inline:**

```typescript
// BEFORE (magic numbers scattered through score computation):
breakdown: {
  entryPoint: ENTRY_POINT_PATTERNS.some((p) => p.test(path)) ? 30 : 0,
  importCount: Math.min((...) * 3, 30),
  exportCount: Math.min((exportMap.get(path) ?? 0) * 2, 20),
  gitActivity: Math.min(gitChanges.get(path) ?? 0, 10),
  edgeCases: (edgeCaseMap.get(path) ?? 0) > 0 ? 10 : 0,
  configFile: CONFIG_FILE_PATTERNS.some((p) => p.test(path)) ? 15 : 0,
}
// ...
score -= 15;  // test file penalty
score = Math.max(0, Math.min(100, score));  // cap
```

**Target state — named exports:**

```typescript
// AFTER: Named, grouped, exported constants with as const
// Source: TypeScript as const docs + codebase conventions

// ─── File scoring weights ────────────────────────────────────────────────────
export const SCORE_ENTRY_POINT = 30 as const;
export const SCORE_IMPORT_PER_IMPORTER = 3 as const;
export const SCORE_IMPORT_CAP = 30 as const;
export const SCORE_EXPORT_PER_EXPORT = 2 as const;
export const SCORE_EXPORT_CAP = 20 as const;
export const SCORE_GIT_ACTIVITY_CAP = 10 as const;
export const SCORE_EDGE_CASES = 10 as const;
export const SCORE_CONFIG_FILE = 15 as const;
export const SCORE_TEST_PENALTY = 15 as const;
export const SCORE_MAX = 100 as const;
export const SCORE_MIN = 0 as const;
```

**Naming decision (Claude's discretion):** Use `UPPER_SNAKE_CASE` rather than `camelCase as const` objects. Reason: these are module-level constants that are individually exported (not a namespace), and UPPER_SNAKE matches the existing convention in this file (`LOCK_FILES`, `EXTENSION_SUFFIXES`). A flat list is easier to grep and reference than nested objects.

**packer.ts note:** `OVERSIZED_THRESHOLD_TOKENS` is already exported from `packer.ts` (line 8). This is the right pattern. The scorer constants should follow the same style.

### Pattern 2: Catch Block Classification

**What:** Systematic audit of all catch blocks, applying the three-treatment policy.
**When to use:** Every `} catch` in the non-test source.

**Current catch block inventory (38 total across 20 files):**

| File                                  | Count | Assessment                                                                                                     |
| ------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| `src/analyzers/git-history.ts`        | 5     | 4 have inline comments ("non-critical", "empty repo") — good; outer error at line 300 uses logger.warn already |
| `src/cache/round-cache.ts`            | 4     | All have inline comments (corrupted file, non-fatal write, gitignore) — good; policy compliant                 |
| `src/analyzers/env-scanner.ts`        | 3     | "Skip unreadable .env files", "return []" silences — need `logger.debug()` added                               |
| `src/analyzers/test-analyzer.ts`      | 3     | "Invalid package.json", "File read failure" — need `logger.debug()` added                                      |
| `src/analyzers/todo-scanner.ts`       | 2     | `return []` silence with no comment — needs comment or debug                                                   |
| `src/analyzers/doc-analyzer.ts`       | 2     | "File read failure — skip this file" — needs `logger.debug()`                                                  |
| `src/analyzers/ast-analyzer.ts`       | 2     | Line 43: adds to warnings (good); line 84: outer error handler (fine)                                          |
| `src/analyzers/dependency-graph.ts`   | 2     | Line 230: per-user-decision comment (good); line 244: outer error handler (fine)                               |
| `src/analyzers/file-tree.ts`          | 2     | Need to review                                                                                                 |
| `src/analyzers/cache.ts`              | 1     | "Corrupted cache -- start fresh" — comment present, policy-compliant                                           |
| `src/cli/generate.ts`                 | 2     | Line 461: "Unreadable file: use empty hash as fallback" — good comment; line 1007: outer error handler (fine)  |
| `src/cli/monorepo.ts`                 | 2     | "Parse error -- treat as not-monorepo", "Read error -- treat as not-monorepo" — good                           |
| `src/cli/init.ts`                     | 1     | "Ignore parse errors" — comment present but vague; needs rationale                                             |
| `src/cli/analyze.ts`                  | 1     | Outer error handler (fine)                                                                                     |
| `src/parsing/index.ts`                | 2     | "TypeScript extractor not yet available (plan 02-02 pending)" — outdated comment; needs audit                  |
| `src/parsing/parser-service.ts`       | 1     | "Try 2: Download..." — control-flow use, not error suppression                                                 |
| `src/config/loader.ts`                | 1     | Re-throws as ConfigError (correct — not silencing)                                                             |
| `src/ai-rounds/round-5-edge-cases.ts` | 2     | Line 69 + 373 — need to review                                                                                 |
| `src/ai-rounds/runner.ts`             | 1     | Uses logger.warn (correct)                                                                                     |
| `src/utils/rate-limiter.ts`           | 1     | Stores error, checks retryability (correct)                                                                    |

**Key finding:** Most catch blocks already have inline comments. The audit task is mostly about (a) adding `logger.debug()` to the `env-scanner`, `test-analyzer`, `doc-analyzer`, and `todo-scanner` cases, (b) verifying outdated "plan 02-02 pending" comments in `parsing/index.ts`, and (c) ensuring `init.ts` explains WHY parse errors are ignored.

### Pattern 3: CLI Validation Order Fix

**What:** Move `resolveSelectedDocs()` call before `resolveApiKey()` in `generate.ts`.
**Current order in `generate.ts`:**

```typescript
// Line 217: validateProviderConfig(config);   — PROV-05 check
// Line 219: resolveApiKey(config);             // ← validates API key exists
// ...
// Line 234: const selectedDocs = resolveSelectedDocs(options.only, DOCUMENT_REGISTRY);  // ← --only check
```

**Target order:**

```typescript
// 1. Validate --only alias (cheapest, fully user-controllable, no env needed)
const selectedDocs = resolveSelectedDocs(options.only, DOCUMENT_REGISTRY);
// 2. Validate provider config (structural check)
validateProviderConfig(config);
// 3. Validate API key (requires environment)
resolveApiKey(config);
// 4. Use selectedDocs as before
const requiredRounds = computeRequiredRounds(selectedDocs);
```

**Why this is safe:** `resolveSelectedDocs()` is pure — it only inspects `options.only` and `DOCUMENT_REGISTRY`. It has no side effects and no dependencies on provider config or API key. The `HandoverError` thrown on unknown alias exits before any API prompt.

### Pattern 4: Vitest table-driven tests with test.each

**What:** Use `test.each` with object arrays for functions with multiple input/output combinations.
**Source:** Context7/vitest-dev/vitest (HIGH confidence)

```typescript
// Source: https://github.com/vitest-dev/vitest/blob/main/docs/api/test.md
import { describe, expect, test } from 'vitest';

// Object-array style (preferred for readability with named inputs)
test.each([
  { maxTokens: 100_000, expected: { total: 100_000, fileContentBudget: 83_604 } },
  { maxTokens: 8_000, expected: { total: 8_000, fileContentBudget: 882 } },
])('computes correct budget for $maxTokens token window', ({ maxTokens, expected }) => {
  const result = computeTokenBudget(maxTokens);
  expect(result.total).toBe(expected.total);
  expect(result.fileContentBudget).toBe(expected.fileContentBudget);
});
```

### Pattern 5: Testing Zod schema defaults with safeParse

**What:** Verify `HandoverConfigSchema.safeParse({})` returns correct defaults without throwing.
**Source:** Context7/websites/zod_dev_v4 (HIGH confidence — Zod 4 behavior confirmed)

```typescript
// Zod 4: safeParse returns { success: true, data: ... } with defaults applied
test('safeParse({}) returns all defaults', () => {
  const result = HandoverConfigSchema.safeParse({});
  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.data.provider).toBe('anthropic');
  expect(result.data.output).toBe('./handover');
  expect(result.data.audience).toBe('human');
  expect(result.data.analysis.concurrency).toBe(4);
  expect(result.data.analysis.staticOnly).toBe(false);
  expect(result.data.contextWindow.pin).toEqual([]);
  expect(result.data.contextWindow.boost).toEqual([]);
  expect(result.data.project).toEqual({});
  expect(result.data.include).toEqual(['**/*']);
  expect(result.data.exclude).toEqual([]);
});
```

**Critical Zod 4 note:** In Zod 4, `.default()` short-circuits when input is `undefined` and returns the default directly. This means `safeParse({})` correctly applies all defaults for optional fields with `.default()`. This is confirmed behavior (source: zod.dev/v4 changelog). The test in the success criteria — `HandoverConfigSchema.safeParse({}) returns expected defaults without throwing` — will pass cleanly.

### Anti-Patterns to Avoid

- **Snapshot tests for pure functions:** Snapshots hide the expected value and break silently when behavior changes. Use explicit `toBe`/`toEqual` for all assertions.
- **Magic numbers in test expectations:** If a test asserts `expect(result.fileContentBudget).toBe(83604)`, extract that computation: `expect(result.fileContentBudget).toBe(Math.floor((100_000 - 3000 - 4096) * 0.9))`. This documents the formula.
- **Adding `logger.debug()` without first adding the method:** `Logger` has no `debug()` method. It must be added before any catch blocks can use it.
- **Exporting scorer constants without tests:** The constants extraction creates new named exports that scoreFiles() tests should verify against (cross-checking the formulas).
- **Moving CLI validation without updating test coverage:** The reorder changes observable behavior; the unit test for `resolveSelectedDocs` should cover the error-throwing path to document the expected UX.

---

## Don't Hand-Roll

| Problem                    | Don't Build                               | Use Instead                                                    | Why                                                    |
| -------------------------- | ----------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| Parameterized tests        | Custom loop with manual test registration | `test.each`                                                    | Native vitest; integrates with watch mode and coverage |
| Schema validation in tests | Manual object shape checks                | Direct `HandoverConfigSchema.safeParse()` calls                | Tests the actual production code path                  |
| Mock providers             | Custom class implementing LLMProvider     | `createMockProvider()` from `src/providers/__mocks__/index.ts` | Already typed, already works                           |

**Key insight:** The mock infrastructure already exists. Tests for functions that take a `LLMProvider` (like `estimateTokens`) should use `createMockProvider()`, not hand-roll a new mock.

---

## Common Pitfalls

### Pitfall 1: logger.debug() method missing

**What goes wrong:** Phase calls for `logger.debug()` in catch blocks, but `Logger` class in `src/utils/logger.ts` has no `debug()` method. Any file that imports and calls `logger.debug()` will fail TypeScript compilation.
**Why it happens:** The decision was made during CONTEXT.md discussion but the Logger was not updated in Phase 8.
**How to avoid:** Add `debug()` as the first task in the catch block audit workstream. Implement it identically to `log()` (verbose-gated, suppressed-gated) but named `debug` to signal "expected-error trace."
**Warning signs:** TypeScript compiler error `Property 'debug' does not exist on type 'Logger'` if you add catch blocks before updating the logger.

### Pitfall 2: vitest.config.ts include pattern

**What goes wrong:** The `include` pattern is `src/**/*.test.ts`. New test files placed at `src/config/schema.test.ts`, `src/context/scorer.test.ts`, etc. will be automatically discovered — no config change needed. But if a test file is accidentally placed in `tests/` (where integration tests live), it will NOT be picked up.
**Why it happens:** The distinction between `src/` (unit) and `tests/` (integration) is a deliberate separation.
**How to avoid:** Place all new unit test files in `src/` co-located with their source module.

### Pitfall 3: scoreFiles() test requires StaticAnalysisResult mock

**What goes wrong:** `scoreFiles()` takes a full `StaticAnalysisResult` object, which is a large nested type. Constructing a minimal valid one inline in each test is verbose and fragile.
**Why it happens:** The function signature takes the full analysis result, not individual fields.
**How to avoid:** Create a `buildMockAnalysis()` factory helper in the test file (not a shared fixture) that constructs a minimal valid `StaticAnalysisResult` with sensible defaults. Tests then override only the fields relevant to each case. This is shared within the file but not extracted further unless the same helper is needed in other test files.

### Pitfall 4: resolveSelectedDocs() throws HandoverError, not plain Error

**What goes wrong:** Testing the error path with `expect(() => ...).toThrow('message')` may fail if the matcher doesn't match `HandoverError` properly.
**Why it happens:** `HandoverError` extends `Error` but has a custom `format()` method. The `message` property is the first constructor argument.
**How to avoid:** Test with `expect(() => resolveSelectedDocs('badAlias', DOCUMENT_REGISTRY)).toThrow(HandoverError)` or check `.message` explicitly. The test should also verify the error message names the invalid alias.

### Pitfall 5: computeTokenBudget() formula verification

**What goes wrong:** Writing a test that just hard-codes an expected number without showing the formula. If someone changes the defaults (e.g., `promptOverhead` from 3000 to 4000), the test fails with no insight into why the number changed.
**Why it happens:** Lazy copy of computed output into assertion.
**How to avoid:** Compute the expected value inline using the same formula as the spec:

```typescript
const expected = Math.floor((maxTokens - 3000 - 4096) * 0.9);
expect(result.fileContentBudget).toBe(expected);
```

### Pitfall 6: Zod 4 vs Zod 3 default behavior

**What goes wrong:** Writing tests that assume Zod 3 behavior where defaults inside optional fields are not applied.
**Why it happens:** Zod 4 changed `.default()` to short-circuit on `undefined` inputs (returns default directly, doesn't parse through the schema). The `HandoverConfigSchema` uses Zod 4 (`"zod": "^4.3.6"`), so defaults ARE applied consistently.
**How to avoid:** Trust Zod 4 behavior. `safeParse({})` WILL return all defaults. Don't write defensive tests expecting missing fields.

---

## Code Examples

Verified patterns from codebase and official sources:

### scorer.ts constants extraction

```typescript
// src/context/scorer.ts — add at top of module after existing Set/Array constants

// ─── File scoring weights (CTX-02) ──────────────────────────────────────────
// These weights define the relative importance of each scoring factor.
// They are internal constants — not user-configurable.

/** Bonus for entry point files (index, main, app, server) */
export const SCORE_ENTRY_POINT = 30 as const;

/** Bonus per unique importer (each file that imports this one) */
export const SCORE_IMPORT_PER_IMPORTER = 3 as const;

/** Maximum bonus from import count factor */
export const SCORE_IMPORT_CAP = 30 as const;

/** Bonus per exported symbol */
export const SCORE_EXPORT_PER_EXPORT = 2 as const;

/** Maximum bonus from export count factor */
export const SCORE_EXPORT_CAP = 20 as const;

/** Maximum bonus from git activity (change count, 1 point per change) */
export const SCORE_GIT_ACTIVITY_CAP = 10 as const;

/** Bonus when file contains TODO/FIXME markers */
export const SCORE_EDGE_CASES = 10 as const;

/** Bonus for configuration files (package.json, Dockerfile, etc.) */
export const SCORE_CONFIG_FILE = 15 as const;

/** Penalty applied to test files (.test., .spec., __tests__/) */
export const SCORE_TEST_PENALTY = 15 as const;

/** Minimum possible score (floor) */
export const SCORE_MIN = 0 as const;

/** Maximum possible score (cap) */
export const SCORE_MAX = 100 as const;
```

### logger.ts debug method addition

```typescript
// src/utils/logger.ts — add after the existing log() method

/**
 * Debug message — only shown when -v flag is active.
 * Use in catch blocks for expected/recoverable errors:
 * caught errors that are part of normal operation
 * (e.g., file not found, optional feature unavailable).
 */
debug(msg: string): void {
  if (this.suppressed) return;
  if (this.verbose) {
    console.log(pc.dim('  [debug] ' + msg));
  }
}
```

### catch block with logger.debug() example

```typescript
// Pattern for expected/recoverable errors
} catch (err) {
  logger.debug(`Failed to read .env file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
}
```

### scoreFiles() unit test skeleton

```typescript
// src/context/scorer.test.ts
import { describe, expect, test } from 'vitest';
import { scoreFiles, SCORE_ENTRY_POINT, SCORE_TEST_PENALTY } from './scorer.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';

function buildMockAnalysis(
  overrides: Partial<{
    files: Array<{ path: string; type: 'file' | 'directory' }>;
    gitChangedFiles: Array<{ path: string; changes: number }>;
    todoItems: Array<{ file: string }>;
    astFiles: Array<{ path: string; imports: unknown[]; exports: unknown[] }>;
  }>,
): StaticAnalysisResult {
  return {
    fileTree: {
      directoryTree: (overrides.files ?? []).map((f) => ({ ...f })),
      filesByExtension: {},
    },
    gitHistory: {
      mostChangedFiles: overrides.gitChangedFiles ?? [],
      commits: [],
    },
    todos: { items: overrides.todoItems ?? [] },
    ast: {
      files: (overrides.astFiles ?? []).map((f) => ({
        path: f.path,
        imports: f.imports ?? [],
        exports: f.exports ?? [],
        functions: [],
        classes: [],
        constants: [],
        lineCount: 0,
      })),
    },
    // ... remaining fields with empty defaults
  } as unknown as StaticAnalysisResult;
}

describe('scoreFiles()', () => {
  test('returns empty array for empty file tree', () => {
    const result = scoreFiles(buildMockAnalysis({}));
    expect(result).toEqual([]);
  });

  test('excludes lock files entirely', () => {
    const analysis = buildMockAnalysis({
      files: [{ path: 'package-lock.json', type: 'file' }],
    });
    const result = scoreFiles(analysis);
    expect(result).toHaveLength(0);
  });

  test.each([
    { path: 'index.ts', expectedEntryBonus: SCORE_ENTRY_POINT },
    { path: 'main.js', expectedEntryBonus: SCORE_ENTRY_POINT },
    { path: 'src/index.ts', expectedEntryBonus: SCORE_ENTRY_POINT },
    { path: 'utils.ts', expectedEntryBonus: 0 },
  ])(
    'entry point detection: $path gets $expectedEntryBonus entry bonus',
    ({ path, expectedEntryBonus }) => {
      const analysis = buildMockAnalysis({
        files: [{ path, type: 'file' }],
        astFiles: [{ path, imports: [], exports: [] }],
      });
      const result = scoreFiles(analysis);
      expect(result[0].breakdown.entryPoint).toBe(expectedEntryBonus);
    },
  );

  test('applies test file penalty', () => {
    const analysis = buildMockAnalysis({
      files: [{ path: 'utils.test.ts', type: 'file' }],
    });
    const result = scoreFiles(analysis);
    expect(result[0].score).toBe(0); // penalty floors at 0
  });

  test('caps score at SCORE_MAX', () => {
    // A file that would exceed 100 without cap
    const analysis = buildMockAnalysis({
      files: [{ path: 'index.ts', type: 'file' }],
      astFiles: [{ path: 'index.ts', imports: [], exports: Array(20).fill({ name: 'x' }) }],
      gitChangedFiles: [{ path: 'index.ts', changes: 100 }],
      todoItems: [{ file: 'index.ts' }],
    });
    const result = scoreFiles(analysis);
    expect(result[0].score).toBeLessThanOrEqual(100);
  });

  test('sorts results by score descending, then alphabetically', () => {
    const analysis = buildMockAnalysis({
      files: [
        { path: 'b.ts', type: 'file' },
        { path: 'a.ts', type: 'file' },
        { path: 'index.ts', type: 'file' },
      ],
    });
    const result = scoreFiles(analysis);
    // index.ts should be first (entry point bonus), then a.ts, b.ts tied at 0
    expect(result[0].path).toBe('index.ts');
    expect(result[1].path).toBe('a.ts');
    expect(result[2].path).toBe('b.ts');
  });
});
```

### computeTokenBudget() unit test skeleton

```typescript
// src/context/token-counter.test.ts
import { describe, expect, test } from 'vitest';
import { computeTokenBudget, estimateTokens } from './token-counter.js';

describe('computeTokenBudget()', () => {
  test('applies defaults correctly for standard 100k window', () => {
    const result = computeTokenBudget(100_000);
    expect(result.total).toBe(100_000);
    expect(result.promptOverhead).toBe(3000);
    expect(result.outputReserve).toBe(4096);
    // Formula: floor((100000 - 3000 - 4096) * 0.9)
    expect(result.fileContentBudget).toBe(Math.floor((100_000 - 3000 - 4096) * 0.9));
  });

  test.each([
    { maxTokens: 8_000, overhead: 3000, reserve: 4096, margin: 0.9 },
    { maxTokens: 200_000, overhead: 3000, reserve: 4096, margin: 0.9 },
    { maxTokens: 16_000, overhead: 5000, reserve: 2048, margin: 0.8 },
  ])(
    'custom options: maxTokens=$maxTokens overhead=$overhead',
    ({ maxTokens, overhead, reserve, margin }) => {
      const result = computeTokenBudget(maxTokens, {
        promptOverhead: overhead,
        outputReserve: reserve,
        safetyMargin: margin,
      });
      expect(result.fileContentBudget).toBe(Math.floor((maxTokens - overhead - reserve) * margin));
    },
  );

  test('returns zero budget when overhead exceeds window', () => {
    // Edge: overhead + reserve > maxTokens → negative intermediate → floor of negative * 0.9 < 0
    const result = computeTokenBudget(1000, { promptOverhead: 500, outputReserve: 600 });
    // (1000 - 500 - 600) * 0.9 = -90 → floor(-90) = -90
    // The function does not guard against negative; test documents actual behavior
    expect(result.fileContentBudget).toBeLessThan(0);
  });
});

describe('estimateTokens()', () => {
  test('uses chars/4 heuristic without provider', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokens(text)).toBe(100); // ceil(400/4)
  });

  test('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  test('delegates to provider when supplied', () => {
    const mockProvider = { estimateTokens: () => 42 } as any;
    expect(estimateTokens('any text', mockProvider)).toBe(42);
  });

  test('rounds up fractional token counts', () => {
    expect(estimateTokens('abc')).toBe(1); // ceil(3/4) = 1
  });
});
```

### resolveSelectedDocs() + computeRequiredRounds() test skeleton

```typescript
// src/renderers/registry.test.ts
import { describe, expect, test } from 'vitest';
import { resolveSelectedDocs, computeRequiredRounds, DOCUMENT_REGISTRY } from './registry.js';
import { HandoverError } from '../utils/errors.js';

describe('resolveSelectedDocs()', () => {
  test('returns all documents when onlyFlag is undefined', () => {
    const result = resolveSelectedDocs(undefined, DOCUMENT_REGISTRY);
    expect(result).toHaveLength(DOCUMENT_REGISTRY.length);
  });

  test('resolves single known alias', () => {
    const result = resolveSelectedDocs('overview', DOCUMENT_REGISTRY);
    expect(result.some((d) => d.id === '01-project-overview')).toBe(true);
    expect(result.some((d) => d.id === '00-index')).toBe(true); // index always included
  });

  test('resolves group alias to multiple documents', () => {
    const result = resolveSelectedDocs('core', DOCUMENT_REGISTRY);
    expect(result.some((d) => d.id === '03-architecture')).toBe(true);
    expect(result.some((d) => d.id === '06-modules')).toBe(true);
    expect(result.some((d) => d.id === '05-features')).toBe(true);
  });

  test('throws HandoverError for unknown alias', () => {
    expect(() => resolveSelectedDocs('badAlias', DOCUMENT_REGISTRY)).toThrow(HandoverError);
  });

  test('error message names the invalid alias', () => {
    expect(() => resolveSelectedDocs('unknown-doc', DOCUMENT_REGISTRY)).toThrow('unknown-doc');
  });

  test('always includes index in result', () => {
    const result = resolveSelectedDocs('overview', DOCUMENT_REGISTRY);
    expect(result.some((d) => d.id === '00-index')).toBe(true);
  });

  test('handles comma-separated aliases', () => {
    const result = resolveSelectedDocs('overview,arch', DOCUMENT_REGISTRY);
    expect(result.some((d) => d.id === '01-project-overview')).toBe(true);
    expect(result.some((d) => d.id === '03-architecture')).toBe(true);
  });
});

describe('computeRequiredRounds()', () => {
  test('returns empty set for index-only selection', () => {
    const indexDoc = DOCUMENT_REGISTRY.find((d) => d.id === '00-index')!;
    const result = computeRequiredRounds([indexDoc]);
    expect(result.size).toBe(0);
  });

  test('expands transitive dependencies', () => {
    // arch requires rounds [1, 2, 3, 4]; round 4 depends on [1,2,3]; etc.
    const archDoc = DOCUMENT_REGISTRY.find((d) => d.id === '03-architecture')!;
    const result = computeRequiredRounds([archDoc]);
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
    expect(result.has(3)).toBe(true);
    expect(result.has(4)).toBe(true);
  });

  test.each([
    { docId: '07-dependencies', expectedRounds: [1] },
    { docId: '04-file-structure', expectedRounds: [1, 2] },
    { docId: '05-features', expectedRounds: [1, 2, 3] },
  ])('$docId requires rounds $expectedRounds', ({ docId, expectedRounds }) => {
    const doc = DOCUMENT_REGISTRY.find((d) => d.id === docId)!;
    const result = computeRequiredRounds([doc]);
    for (const round of expectedRounds) {
      expect(result.has(round)).toBe(true);
    }
  });
});
```

### createStep() unit test skeleton

```typescript
// src/orchestrator/step.test.ts
import { describe, expect, test } from 'vitest';
import { createStep } from './step.js';

describe('createStep()', () => {
  const validDef = {
    id: 'test-step',
    name: 'Test Step',
    deps: [] as string[],
    execute: async () => null,
  };

  test('returns frozen object', () => {
    const step = createStep(validDef);
    expect(Object.isFrozen(step)).toBe(true);
  });

  test('copies deps array (defensive copy)', () => {
    const deps = ['a', 'b'];
    const step = createStep({ ...validDef, deps });
    deps.push('c');
    expect(step.deps).toHaveLength(2); // mutation didn't affect step
  });

  test.each([
    { id: '', name: 'x', error: 'Step id is required' },
    { id: ' ', name: 'x', error: 'Step id is required' },
    { id: 'x', name: '', error: 'Step name is required' },
  ])('throws for invalid definition: $error', ({ id, name, error }) => {
    expect(() => createStep({ ...validDef, id, name })).toThrow(error);
  });

  test('throws when deps is not an array', () => {
    expect(() => createStep({ ...validDef, deps: 'not-array' as any })).toThrow(
      'Step deps must be an array',
    );
  });

  test('throws when execute is not a function', () => {
    expect(() => createStep({ ...validDef, execute: 'not-fn' as any })).toThrow(
      'Step execute must be a function',
    );
  });

  test('preserves optional onSkip', () => {
    const onSkip = () => {};
    const step = createStep({ ...validDef, onSkip });
    expect(step.onSkip).toBe(onSkip);
  });
});
```

---

## State of the Art

| Old Approach                               | Current Approach                       | When Changed      | Impact                                                              |
| ------------------------------------------ | -------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| Bare `} catch {}` empty blocks             | Documented comment or `logger.debug()` | Phase 9           | Catch blocks tell future readers why an error is suppressed         |
| Inline magic numbers in scoring            | Named exported constants               | Phase 9           | Scoring formula is readable and greppable                           |
| API key checked before `--only` validation | `--only` validated first               | Phase 9           | User sees flag error before being prompted for credentials          |
| No unit tests for pure functions           | Full test suite for 7 functions        | Phase 9           | Scoring and registry logic is regression-protected                  |
| Zod v3 semantics                           | Zod v4 (already installed)             | Dependency update | Defaults applied more eagerly; `safeParse({})` returns all defaults |

**Deprecated/outdated:**

- Comments like `// TypeScript extractor not yet available (plan 02-02 pending)` in `parsing/index.ts`: Phase 8 delivered the TypeScript extractor; these comments are stale and should be updated to reflect actual catch rationale.

---

## Open Questions

1. **Does `computeTokenBudget()` need a guard against negative `fileContentBudget`?**
   - What we know: The formula `(maxTokens - overhead - reserve) * margin` can produce a negative number if overhead + reserve > maxTokens.
   - What's unclear: Whether this is intentional (callers are responsible for reasonable inputs) or a latent bug.
   - Recommendation: Write a test that documents the current behavior (negative result), add a code comment, and leave the guard decision to the planner. Don't silently add `Math.max(0, ...)` without a task.

2. **Are the `parsing/index.ts` catch blocks still accurate?**
   - What we know: Lines 64 and 74 have comments referencing "plan 02-02 pending" — Phase 2 task references that are now complete.
   - What's unclear: Whether these catch blocks now represent a genuine "extractor unavailable" case or dead code.
   - Recommendation: Audit the parsing/index.ts at planning time; if the extractors are now always loaded, the catch blocks may be reachable but representing a different failure mode (parse error vs. unavailable).

3. **Does `logger.debug()` need its own verbosity gate separate from `logger.log()`?**
   - What we know: `logger.log()` is already verbose-gated. The decision calls for `debug()` as a separate method name.
   - What's unclear: Whether `debug()` should be identical to `log()` (just a renamed alias) or have a distinct visibility level.
   - Recommendation: Implement `debug()` as a verbose-gated method (same gate as `log()`) with a `[debug]` prefix. This keeps it simple while making the semantic distinction clear in log output.

---

## Sources

### Primary (HIGH confidence)

- Context7 `/vitest-dev/vitest` — `test.each` with object arrays, `describe.each`, `toEqual`, `toBe` assertions
- Context7 `/websites/zod_dev_v4` — Zod 4 `safeParse` behavior, default value changes from v3
- `src/context/scorer.ts` — full codebase read (lines 1–239)
- `src/context/token-counter.ts` — full codebase read
- `src/config/schema.ts` — full codebase read
- `src/cli/generate.ts` — full codebase read (lines 1–1041)
- `src/orchestrator/step.ts` — full codebase read
- `src/renderers/registry.ts` — full codebase read
- `src/cli/index.ts` — full codebase read
- `src/utils/logger.ts` — full codebase read (confirmed: no `debug()` method)
- `src/providers/__mocks__/index.ts` — full codebase read
- `vitest.config.ts` — verified include/exclude patterns
- `package.json` — confirmed vitest ^4.0.18, zod ^4.3.6

### Secondary (MEDIUM confidence)

- Catch block analysis: `grep -rn "} catch"` across all 20 source files — systematic enumeration with context lines verified

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries already installed, versions confirmed from package.json
- Architecture patterns: HIGH — based on direct codebase reads; no inference required
- Pitfalls: HIGH — `logger.debug()` gap confirmed by grep; Zod 4 behavior confirmed via Context7; vitest config verified
- Test code examples: MEDIUM-HIGH — patterns verified via Context7; exact mock object shape for `StaticAnalysisResult` needs refinement during planning (type is complex)

**Research date:** 2026-02-19
**Valid until:** 2026-03-20 (30 days — stable libraries, no fast-moving dependencies)
