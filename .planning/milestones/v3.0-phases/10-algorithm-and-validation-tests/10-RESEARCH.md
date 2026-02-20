# Phase 10: Algorithm and Validation Tests - Research

**Researched:** 2026-02-19
**Domain:** Vitest unit testing for complex algorithms: context packing, provider validation, DAG orchestration, token accounting, signature generation
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

None — all decisions are under Claude's discretion.

### Claude's Discretion

User requested robust tests with the best approach across all areas. Claude has full discretion on:

- **Test data approach** — Choose between realistic project-like fixtures and minimal synthetic data based on what catches the most real bugs for each function. Prioritize robustness over minimalism.
- **DAG scenario design** — Design test DAGs that thoroughly cover canonical shapes (linear, diamond, cycle) AND realistic pipeline patterns. Go deep enough to catch subtle ordering and propagation bugs.
- **Fixture organization** — Decide whether to keep factories local (Phase 9 pattern) or share across test files based on complexity. Choose whatever produces the most maintainable and robust test suite.
- **Coverage boundaries** — Go beyond the listed success criteria scenarios where edge cases would catch real bugs. Include empty inputs, max-size boundaries, concurrent failure paths, and any other edge cases identified during research.

### Guiding principle

Robustness is the priority. Choose approaches that maximize bug-catching ability and test maintainability. When in doubt, test more scenarios rather than fewer.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 10 tests five distinct algorithm units: `packFiles()` (context packer), `validateProviderConfig()` (provider validation), `DAGOrchestrator` (DAG execution engine), `TokenUsageTracker` (stateful accounting), and `generateSignatureSummary()` (AST-to-text). All five targets are in `src/` and are already importable — no new dependencies are needed beyond what is installed (`vitest ^4.0.18`, `memfs ^4.56.10`).

The most complex target is `packFiles()`, which has seven distinct code paths (empty input, small-project fast-path, changed-file priority, oversized two-pass, normal full, AST signatures fallback, non-AST first-20-lines fallback, skip). The function accepts injected dependencies (`estimateTokensFn`, `getFileContent`) making it fully testable without touching a real filesystem. `DAGOrchestrator` is the second most complex target: it uses Kahn's algorithm internally and manages reactive step dispatch, making execution order and skip propagation the critical behaviors to verify. The remaining three targets are simpler but have well-defined throw paths and state transitions that benefit from systematic test.each coverage.

The Phase 9 pattern — local factory functions per test file, `test.each` for parametric cases, explicit assertions over snapshots, no shared fixture infrastructure — scales cleanly to all five targets in this phase. The one new technique required is `vi.stubEnv()` for `validateProviderConfig()`, which works by modifying both `process.env` and `import.meta.env` simultaneously and is reset via `afterEach(() => vi.unstubAllEnvs())`. This is fully verified as working in Vitest 4.x.

**Primary recommendation:** Write five test files co-located with their source: `packer.test.ts`, `factory.test.ts`, `dag.test.ts`, `tracker.test.ts`. `generateSignatureSummary()` is already in `packer.ts` so its tests belong in `packer.test.ts`. Keep all factories local to each test file — the fixture complexity does not justify cross-file sharing.

---

## Standard Stack

### Core (already installed — no new dependencies needed)

| Library | Version  | Purpose                        | Why Standard                                                                                                      |
| ------- | -------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| vitest  | ^4.0.18  | Test runner and mock utilities | Already installed; `vi.stubEnv`, `vi.fn`, `beforeEach`, `afterEach` all available                                 |
| memfs   | ^4.56.10 | In-memory filesystem           | Already installed (Phase 9 decision); not needed for Phase 10 since `packFiles` accepts injected `getFileContent` |

### Supporting (already installed)

| Library              | Version | Purpose                 | When to Use                                    |
| -------------------- | ------- | ----------------------- | ---------------------------------------------- |
| vitest-mock-extended | ^3.1.0  | Extended mock utilities | Not needed for Phase 10; vi.fn() suffices      |
| @vitest/coverage-v8  | ^4.0.18 | Coverage reporting      | Configured globally; no per-test action needed |

### Alternatives Considered

| Instead of                     | Could Use                        | Tradeoff                                                                                                                            |
| ------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Injected `getFileContent` mock | memfs                            | `packFiles` already accepts a function parameter — injecting `vi.fn()` is simpler and more direct than memfs for this specific case |
| `afterEach(vi.unstubAllEnvs)`  | `vi.stubEnv` with manual restore | `vi.unstubAllEnvs()` is the canonical cleanup pattern; manual restore is fragile                                                    |
| Local factory per test file    | Shared `__fixtures__/` directory | Fixture complexity here is moderate and per-target; sharing would couple unrelated tests                                            |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended File Layout

```
src/
├── context/
│   ├── packer.ts                  # packFiles() + generateSignatureSummary()
│   └── packer.test.ts             # NEW: tests for both functions
├── providers/
│   ├── factory.ts                 # validateProviderConfig()
│   └── factory.test.ts            # NEW: tests for validateProviderConfig()
├── orchestrator/
│   ├── dag.ts                     # DAGOrchestrator
│   ├── dag.test.ts                # NEW: tests for DAGOrchestrator
│   ├── step.ts                    # createStep() (already tested in Phase 9)
│   └── step.test.ts               # EXISTS from Phase 9
└── context/
    └── tracker.ts                 # TokenUsageTracker
    └── tracker.test.ts            # NEW: tests for TokenUsageTracker
```

Note: `generateSignatureSummary()` is exported from `packer.ts` and belongs in `packer.test.ts` alongside `packFiles()` tests — they share the same file and type fixtures.

### Pattern 1: Injected-Dependency Testing for packFiles()

**What:** `packFiles()` accepts `estimateTokensFn` and `getFileContent` as parameters, making it fully injectable without filesystem mocks.

**When to use:** Any function that accepts its I/O dependencies as parameters — no memfs needed.

```typescript
// Source: Direct inspection of src/context/packer.ts
import { describe, expect, test, vi } from 'vitest';
import { packFiles, OVERSIZED_THRESHOLD_TOKENS } from './packer.js';
import type { FilePriority, TokenBudget, ASTResult } from './types.js';

// Synthetic token estimator: 1 char = 1 token (deterministic)
const countChars = (text: string) => text.length;

// Deterministic getFileContent stub
const makeContentFn = (map: Record<string, string>) =>
  vi.fn((path: string) => Promise.resolve(map[path] ?? ''));

const budget = (fileContentBudget: number): TokenBudget => ({
  total: fileContentBudget + 7096,
  promptOverhead: 3000,
  outputReserve: 4096,
  fileContentBudget,
});

const scored = (path: string, score: number): FilePriority => ({
  path,
  score,
  breakdown: {
    entryPoint: 0,
    importCount: 0,
    exportCount: 0,
    gitActivity: 0,
    edgeCases: 0,
    configFile: 0,
  },
});

const emptyAST: ASTResult = {
  files: [],
  summary: {
    totalFunctions: 0,
    totalClasses: 0,
    totalExports: 0,
    totalImports: 0,
    languageBreakdown: {},
  },
};
```

### Pattern 2: vi.stubEnv() + afterEach for validateProviderConfig()

**What:** `validateProviderConfig()` reads `process.env[envVarName]` directly. `vi.stubEnv()` sets it for the test; `vi.unstubAllEnvs()` in `afterEach` cleans up.

**When to use:** Any code that reads `process.env` directly.

```typescript
// Source: Context7 /vitest-dev/vitest docs
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { validateProviderConfig } from './factory.js';
import { ProviderError } from '../utils/errors.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

test('throws PROVIDER_NO_API_KEY when ANTHROPIC_API_KEY is absent', () => {
  vi.stubEnv('ANTHROPIC_API_KEY', undefined);
  expect(() =>
    validateProviderConfig({
      provider: 'anthropic',
      analysis: { concurrency: 4, staticOnly: false } /* ... */,
    }),
  ).toThrow(ProviderError);
});
```

### Pattern 3: vi.fn() Step Injection for DAGOrchestrator

**What:** `StepDefinition.execute` is a `(context: StepContext) => Promise<unknown>` function — inject `vi.fn()` to track call order and simulate success/failure.

**When to use:** Testing orchestration logic (ordering, skip propagation) without real step implementations.

```typescript
// Source: Direct inspection of src/orchestrator/dag.ts + src/domain/types.ts
import { describe, expect, test, vi } from 'vitest';
import { DAGOrchestrator } from './dag.js';
import { OrchestratorError } from '../utils/errors.js';

test('linear A->B->C executes in order', async () => {
  const executionOrder: string[] = [];
  const dag = new DAGOrchestrator();

  dag.addSteps([
    {
      id: 'a',
      name: 'A',
      deps: [],
      execute: async () => {
        executionOrder.push('a');
      },
    },
    {
      id: 'b',
      name: 'B',
      deps: ['a'],
      execute: async () => {
        executionOrder.push('b');
      },
    },
    {
      id: 'c',
      name: 'C',
      deps: ['b'],
      execute: async () => {
        executionOrder.push('c');
      },
    },
  ]);

  await dag.execute();
  expect(executionOrder).toEqual(['a', 'b', 'c']);
});
```

### Pattern 4: Stateful Object Testing for TokenUsageTracker

**What:** `TokenUsageTracker` accumulates state across `recordRound()` calls. Tests drive it through multiple rounds, asserting intermediate and final state.

**When to use:** Any class with mutable private state that exposes read methods.

```typescript
// Source: Direct inspection of src/context/tracker.ts
import { describe, expect, test, vi } from 'vitest';
import { TokenUsageTracker } from './tracker.js';

test('accumulates input and output across three rounds', () => {
  const tracker = new TokenUsageTracker();
  tracker.recordRound({
    round: 1,
    inputTokens: 100,
    outputTokens: 50,
    contextTokens: 0,
    fileContentTokens: 0,
    budgetTokens: 1000,
  });
  tracker.recordRound({
    round: 2,
    inputTokens: 200,
    outputTokens: 100,
    contextTokens: 0,
    fileContentTokens: 0,
    budgetTokens: 1000,
  });
  expect(tracker.getTotalUsage()).toEqual({ input: 300, output: 150 });
  expect(tracker.getRoundCount()).toBe(2);
});
```

### Pattern 5: Deterministic Fixture for generateSignatureSummary()

**What:** Build minimal `ParsedFile` objects with controlled exports/functions/classes/constants/imports. Assert exact output string structure.

**When to use:** Any pure formatting function where output is deterministic given input.

```typescript
// Source: Direct inspection of src/context/packer.ts + src/parsing/types.ts
import { describe, expect, test } from 'vitest';
import { generateSignatureSummary } from './packer.js';
import type { ParsedFile } from '../parsing/types.js';

const baseParsedFile = (): ParsedFile => ({
  path: 'src/utils/helpers.ts',
  language: 'typescript',
  parserUsed: 'tree-sitter',
  functions: [],
  classes: [],
  imports: [],
  exports: [],
  constants: [],
  reExports: [],
  lineCount: 10,
  parseErrors: [],
});
```

### Anti-Patterns to Avoid

- **Snapshot testing for generateSignatureSummary:** Snapshots hide regressions in formatting details. Use explicit `toBe()` or `toContain()` assertions instead.
- **Real process.env mutation without cleanup:** Always use `vi.stubEnv()` + `afterEach(vi.unstubAllEnvs)` — direct `process.env.X = ...` assignments bleed across tests.
- **Single monolithic test for packFiles:** Seven code paths require seven distinct test scenarios; testing only the happy path leaves budget arithmetic and oversized handling uncovered.
- **Shared factory state for DAGOrchestrator:** Create a new `DAGOrchestrator()` instance per test — the internal step Map is stateful and causes cross-test pollution if reused.
- **Testing logger.warn output in validateProviderConfig:** The "unknown model" warning is non-blocking and uses console output that is hard to assert reliably. Test only the throw paths, not log output.

---

## Don't Hand-Roll

| Problem                             | Don't Build                              | Use Instead                                             | Why                                                                         |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Environment variable isolation      | Manual save/restore of `process.env`     | `vi.stubEnv()` + `vi.unstubAllEnvs()`                   | Atomic restore even on test failure; handles import.meta.env simultaneously |
| Async execution order tracking      | Timeout-based ordering assumptions       | Execution log array via closure                         | Deterministic; works with Promise.race internal implementation              |
| ParsedFile construction             | Hand-typed object literals in every test | Local builder function returning base shape + overrides | Avoids required-field omissions; Zod schemas have many required fields      |
| Token estimation in packFiles tests | Using the real `estimateTokens()`        | `(text: string) => text.length`                         | Deterministic 1:1 mapping makes budget math trivially verifiable            |

**Key insight:** Injected dependencies (both `getFileContent` and `estimateTokensFn` in `packFiles`) make all filesystem interaction testable with pure `vi.fn()` — memfs is not needed for Phase 10 despite being available.

---

## Common Pitfalls

### Pitfall 1: The "6 tiers" label in requirements refers to code paths, not ContentTier enum values

**What goes wrong:** Developer reads "all 6 tiers" and only tests `full`, `signatures`, `skip` (the ContentTier enum values), missing the distinct algorithmic paths.

**Why it happens:** ContentTier has 3 values; the requirement doc counts 6 code paths through the packing algorithm.

**How to avoid:** The 7 distinct code paths in `packFiles()` are:

1. Empty input guard (returns early)
2. Small-project fast-path (all files fit in budget → all `full`)
3. Changed file forced to `full` (budget-enforced — changed file exceeds budget falls through)
4. Oversized file (>8000 tokens, score≥30): signatures + all sections
5. Oversized file: signatures + greedy section subset
6. Oversized file: signatures only (sections don't fit)
7. Normal file → full; then AST signatures fallback; then non-AST first-20-lines; then skip

The requirements "6 tiers" likely refers to 6 of these paths (oversized sub-paths may be collapsed). Test all 7 for robustness.

**Warning signs:** Test suite has only 3 `packFiles` tests — one per tier enum value.

### Pitfall 2: vi.stubEnv() sets to `undefined` to simulate absent env vars

**What goes wrong:** Developer uses `vi.stubEnv('ANTHROPIC_API_KEY', '')` (empty string) instead of `vi.stubEnv('ANTHROPIC_API_KEY', undefined)`.

**Why it happens:** The check in `factory.ts` is `!process.env[envVarName]` — an empty string IS falsy, so both work for the throw path. But `undefined` is semantically correct ("key absent") and documents intent clearly.

**How to avoid:** Use `vi.stubEnv('ANTHROPIC_API_KEY', undefined)` for "key not set in environment." Use a real string value when simulating a key that IS present.

**Warning signs:** Tests use `''` (empty string) as the env value for absent-key tests.

### Pitfall 3: DAGOrchestrator skip propagation requires multi-hop verification

**What goes wrong:** Test only verifies direct dependents are skipped, misses transitive skip propagation (A fails → B skipped → C should also be skipped).

**Why it happens:** `skipDependents()` recurses, but a test with only two-step chains doesn't exercise the recursive path.

**How to avoid:** Design at least one test with a 3+ step chain where the middle step fails. Verify that the terminal step is also `skipped`, not `failed`.

**Warning signs:** All failure tests use only 2-step chains.

### Pitfall 4: packFiles ASTResult type has required `summary` field

**What goes wrong:** Tests pass an empty `{ files: [] }` as ASTResult and get a TypeScript error or runtime crash.

**Why it happens:** `ASTResult` has a required `summary` field (from `src/analyzers/types.ts`).

**How to avoid:** Define a factory like:

```typescript
const emptyAST: ASTResult = {
  files: [],
  summary: {
    totalFunctions: 0,
    totalClasses: 0,
    totalExports: 0,
    totalImports: 0,
    languageBreakdown: {},
  },
};
```

**Warning signs:** TypeScript errors on `ASTResult` construction in test file.

### Pitfall 5: TokenUsageTracker.recordRound() calls logger.warn — suppress logger in tests

**What goes wrong:** Tests that exercise the high-utilization warning path produce console noise or fail if process.env affects logger behavior.

**Why it happens:** `recordRound()` calls `logger.warn()` when utilization ≥ `warnThreshold`. Logger writes to stdout.

**How to avoid:** Either: (a) test with `budgetTokens` large enough that utilization never hits threshold (simplest), or (b) call `logger.setVerbose(false)` + `logger.setSuppressed(true)` in `beforeEach` and restore in `afterEach`. Option (a) is preferred for most tests; option (b) is needed only when explicitly testing the warning path.

**Warning signs:** CI output has yellow warning lines interleaved with test output.

### Pitfall 6: generateSignatureSummary only includes EXPORTED symbols

**What goes wrong:** Test adds functions to `parsed.functions` but doesn't add matching entries to `parsed.exports` — function never appears in output.

**Why it happens:** The implementation checks `exportedNames.has(fn.name)` before emitting function signatures.

**How to avoid:** For every function/class/constant you want in the output, add both:

1. Entry in `parsed.functions` / `parsed.classes` / `parsed.constants`
2. Matching entry in `parsed.exports` (for functions/classes) or set `isExported: true` (for constants)

**Warning signs:** Output string only contains the `// FILE:` header line, nothing else.

### Pitfall 7: validateProviderConfig has 5 throw paths, but the 5th (PROVIDER_UNKNOWN for unknown sdkType) is inside createProvider(), not validateProviderConfig()

**What goes wrong:** Developer tries to test 5 throw paths in `validateProviderConfig()` but the "unknown sdkType" error is in `createProvider()` switch-default.

**Why it happens:** The requirements say "all 5 throw paths" for `validateProviderConfig()`. Reading the source, `validateProviderConfig()` has exactly 4 direct `throw new ProviderError(...)` calls plus 1 `throw ProviderError.missingApiKey(...)` call = 5 total.

**Actual 5 throw paths in validateProviderConfig():**

1. `PROVIDER_UNKNOWN` — unknown provider (not in presets and not 'custom')
2. `PROVIDER_OLLAMA_NO_MODEL` — Ollama with no model specified
3. `PROVIDER_AZURE_NO_BASE_URL` — Azure OpenAI without baseUrl
4. `PROVIDER_NO_API_KEY` — cloud provider missing API key env var (via `ProviderError.missingApiKey()`)
5. `PROVIDER_CUSTOM_NO_BASE_URL` — custom provider without baseUrl

**How to avoid:** Test file only imports `validateProviderConfig`, not `createProvider`. All 5 paths are verified.

---

## Code Examples

Verified patterns from official sources and direct code inspection:

### packFiles() — Complete test scaffold

```typescript
// Source: src/context/packer.ts (direct inspection)
import { describe, expect, test, vi } from 'vitest';
import { packFiles, generateSignatureSummary, OVERSIZED_THRESHOLD_TOKENS } from './packer.js';
import type { FilePriority, TokenBudget } from './types.js';
import type { ASTResult } from '../analyzers/types.js';
import type { ParsedFile } from '../parsing/types.js';

const charTokens = (text: string) => text.length;

const mkBudget = (fileContentBudget: number): TokenBudget => ({
  total: fileContentBudget + 7096,
  promptOverhead: 3000,
  outputReserve: 4096,
  fileContentBudget,
});

const mkScored = (path: string, score: number): FilePriority => ({
  path,
  score,
  breakdown: {
    entryPoint: 0,
    importCount: 0,
    exportCount: 0,
    gitActivity: 0,
    edgeCases: 0,
    configFile: 0,
  },
});

const emptyAST: ASTResult = {
  files: [],
  summary: {
    totalFunctions: 0,
    totalClasses: 0,
    totalExports: 0,
    totalImports: 0,
    languageBreakdown: {},
  },
};

// Empty input guard
test('returns empty PackedContext for zero scored files', async () => {
  const result = await packFiles([], emptyAST, mkBudget(10_000), charTokens, vi.fn());
  expect(result.files).toHaveLength(0);
  expect(result.metadata.totalFiles).toBe(0);
  expect(result.metadata.usedTokens).toBe(0);
});

// Small-project fast-path
test('small-project: all files get full tier when total fits in budget', async () => {
  const content = 'x'.repeat(100);
  const getContent = vi.fn().mockResolvedValue(content);
  const result = await packFiles(
    [mkScored('a.ts', 50), mkScored('b.ts', 40)],
    emptyAST,
    mkBudget(10_000), // 200 tokens used << 10_000 budget
    charTokens,
    getContent,
  );
  expect(result.files.every((f) => f.tier === 'full')).toBe(true);
  expect(result.metadata.fullFiles).toBe(2);
  expect(result.metadata.skippedFiles).toBe(0);
});
```

### validateProviderConfig() — vi.stubEnv pattern

```typescript
// Source: Context7 /vitest-dev/vitest docs + src/providers/factory.ts (direct inspection)
import { afterEach, describe, expect, test, vi } from 'vitest';
import { validateProviderConfig } from './factory.js';
import { ProviderError } from '../utils/errors.js';
import type { HandoverConfig } from '../config/schema.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const baseConfig = (): HandoverConfig => ({
  provider: 'anthropic',
  output: './handover',
  audience: 'human',
  include: ['**/*'],
  exclude: [],
  analysis: { concurrency: 4, staticOnly: false },
  project: {},
  contextWindow: { pin: [], boost: [] },
});

test('throws PROVIDER_UNKNOWN for unrecognized provider', () => {
  const config = { ...baseConfig(), provider: 'unknown-provider' as HandoverConfig['provider'] };
  expect(() => validateProviderConfig(config)).toThrow(ProviderError);
  try {
    validateProviderConfig(config);
  } catch (e) {
    expect((e as ProviderError).code).toBe('PROVIDER_UNKNOWN');
  }
});

test('throws PROVIDER_NO_API_KEY when ANTHROPIC_API_KEY is absent', () => {
  vi.stubEnv('ANTHROPIC_API_KEY', undefined);
  expect(() => validateProviderConfig(baseConfig())).toThrow(ProviderError);
  try {
    validateProviderConfig(baseConfig());
  } catch (e) {
    expect((e as ProviderError).code).toBe('PROVIDER_NO_API_KEY');
  }
});

test('does NOT throw when ANTHROPIC_API_KEY is present', () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-key');
  expect(() => validateProviderConfig(baseConfig())).not.toThrow();
});
```

### DAGOrchestrator — diamond pattern and skip propagation

```typescript
// Source: src/orchestrator/dag.ts (direct inspection)
import { describe, expect, test, vi } from 'vitest';
import { DAGOrchestrator } from './dag.js';
import { OrchestratorError } from '../utils/errors.js';

// Diamond: A -> B, A -> C, B+C -> D
test('diamond: D executes after both B and C complete', async () => {
  const log: string[] = [];
  const dag = new DAGOrchestrator();
  dag.addSteps([
    {
      id: 'a',
      name: 'A',
      deps: [],
      execute: async () => {
        log.push('a');
      },
    },
    {
      id: 'b',
      name: 'B',
      deps: ['a'],
      execute: async () => {
        log.push('b');
      },
    },
    {
      id: 'c',
      name: 'C',
      deps: ['a'],
      execute: async () => {
        log.push('c');
      },
    },
    {
      id: 'd',
      name: 'D',
      deps: ['b', 'c'],
      execute: async () => {
        log.push('d');
      },
    },
  ]);
  const results = await dag.execute();
  expect(log[0]).toBe('a');
  expect(log[log.length - 1]).toBe('d');
  expect(results.get('d')?.status).toBe('completed');
});

// Cycle detection
test('cycle A->B->A throws OrchestratorError with ORCHESTRATOR_CYCLE code', async () => {
  const dag = new DAGOrchestrator();
  dag.addSteps([
    { id: 'a', name: 'A', deps: ['b'], execute: async () => {} },
    { id: 'b', name: 'B', deps: ['a'], execute: async () => {} },
  ]);
  await expect(dag.execute()).rejects.toBeInstanceOf(OrchestratorError);
  await expect(dag.execute()).rejects.toMatchObject({ code: 'ORCHESTRATOR_CYCLE' });
});

// Skip propagation (3-step chain)
test('B fails: C is skipped, not failed', async () => {
  const dag = new DAGOrchestrator();
  dag.addSteps([
    { id: 'a', name: 'A', deps: [], execute: async () => {} },
    {
      id: 'b',
      name: 'B',
      deps: ['a'],
      execute: async () => {
        throw new Error('B failed');
      },
    },
    { id: 'c', name: 'C', deps: ['b'], execute: async () => {} },
  ]);
  const results = await dag.execute();
  expect(results.get('b')?.status).toBe('failed');
  expect(results.get('c')?.status).toBe('skipped');
});
```

### TokenUsageTracker — multi-round stateful accounting

```typescript
// Source: src/context/tracker.ts (direct inspection)
import { describe, expect, test, vi } from 'vitest';
import { TokenUsageTracker } from './tracker.js';

const mkUsage = (round: number, input: number, output: number, budget = 10_000) => ({
  round,
  inputTokens: input,
  outputTokens: output,
  contextTokens: 0,
  fileContentTokens: 0,
  budgetTokens: budget,
});

test('zero rounds: getRoundCount is 0, getLastRound is undefined', () => {
  const tracker = new TokenUsageTracker();
  expect(tracker.getRoundCount()).toBe(0);
  expect(tracker.getLastRound()).toBeUndefined();
  expect(tracker.getTotalUsage()).toEqual({ input: 0, output: 0 });
});

test('three rounds: getTotalUsage sums all input and output correctly', () => {
  const tracker = new TokenUsageTracker();
  tracker.recordRound(mkUsage(1, 100, 50));
  tracker.recordRound(mkUsage(2, 200, 100));
  tracker.recordRound(mkUsage(3, 300, 150));
  expect(tracker.getTotalUsage()).toEqual({ input: 600, output: 300 });
  expect(tracker.getRoundCount()).toBe(3);
  expect(tracker.getLastRound()?.round).toBe(3);
});

test('getRoundUsage returns correct round data', () => {
  const tracker = new TokenUsageTracker();
  tracker.recordRound(mkUsage(1, 100, 50));
  tracker.recordRound(mkUsage(2, 200, 100));
  expect(tracker.getRoundUsage(1)?.inputTokens).toBe(100);
  expect(tracker.getRoundUsage(2)?.inputTokens).toBe(200);
  expect(tracker.getRoundUsage(99)).toBeUndefined();
});
```

### generateSignatureSummary() — fixture ParsedFile inputs

```typescript
// Source: src/context/packer.ts + src/parsing/types.ts (direct inspection)
import { describe, expect, test } from 'vitest';
import { generateSignatureSummary } from './packer.js';
import type { ParsedFile } from '../parsing/types.js';

const mkParsedFile = (overrides: Partial<ParsedFile> = {}): ParsedFile => ({
  path: 'src/utils/helpers.ts',
  language: 'typescript',
  parserUsed: 'tree-sitter',
  functions: [],
  classes: [],
  imports: [],
  exports: [],
  constants: [],
  reExports: [],
  lineCount: 45,
  parseErrors: [],
  ...overrides,
});

test('header line always present with correct path and lineCount', () => {
  const result = generateSignatureSummary(mkParsedFile({ path: 'src/foo.ts', lineCount: 99 }));
  expect(result).toContain('// FILE: src/foo.ts (99 lines)');
});

test('exported async function with typed parameters appears in output', () => {
  const parsed = mkParsedFile({
    path: 'src/utils/helpers.ts',
    lineCount: 45,
    functions: [
      {
        kind: 'function',
        name: 'formatDate',
        isAsync: true,
        parameters: [
          { name: 'date', type: 'Date', isRest: false },
          { name: 'format', type: 'string', isRest: false },
        ],
        returnType: 'string',
        typeParameters: [],
        isGenerator: false,
        visibility: 'public',
        decorators: [],
        line: 10,
        endLine: 15,
      },
    ],
    exports: [
      { name: 'formatDate', kind: 'function', isReExport: false, isTypeOnly: false, line: 10 },
    ],
  });
  const result = generateSignatureSummary(parsed);
  expect(result).toContain('export async function formatDate(date: Date, format: string): string');
});

test('non-exported function is NOT included in output', () => {
  const parsed = mkParsedFile({
    functions: [
      {
        kind: 'function',
        name: 'internalHelper',
        isAsync: false,
        parameters: [],
        returnType: undefined,
        typeParameters: [],
        isGenerator: false,
        visibility: 'public',
        decorators: [],
        line: 1,
        endLine: 5,
      },
    ],
    exports: [], // Not exported
  });
  const result = generateSignatureSummary(parsed);
  expect(result).not.toContain('internalHelper');
});

test('import summary line appears when imports are present', () => {
  const parsed = mkParsedFile({
    imports: [
      { source: './types', specifiers: [], isTypeOnly: false, line: 1 },
      { source: 'lodash', specifiers: [], isTypeOnly: false, line: 2 },
    ],
  });
  const result = generateSignatureSummary(parsed);
  expect(result).toContain('// 2 imports from: ./types, lodash');
});

test('no import line when imports array is empty', () => {
  const result = generateSignatureSummary(mkParsedFile({ imports: [] }));
  expect(result).not.toContain('imports from');
});
```

---

## State of the Art

| Old Approach                            | Current Approach                      | When Changed            | Impact                                      |
| --------------------------------------- | ------------------------------------- | ----------------------- | ------------------------------------------- |
| `process.env.X = '...'` manual mutation | `vi.stubEnv()` + `vi.unstubAllEnvs()` | Vitest 0.26+            | Automatic cleanup even on test failure      |
| jest `jest.fn()`                        | vitest `vi.fn()`                      | Phase 1 of this project | Same API, native Vite integration           |
| memfs for filesystem mocking            | Injected `getFileContent` function    | Architecture decision   | No memfs overhead; cleaner per-call control |

**Deprecated/outdated:**

- `mock-fs`: unmaintained, breaks WASM loading (documented Phase 9 decision — not relevant here)
- `process.env.X = undefined` without cleanup: leaks between tests; `vi.stubEnv` tracks and restores

---

## Open Questions

1. **ASTResult import path**
   - What we know: `packFiles` imports `ASTResult` from `'../analyzers/types.js'`
   - What's unclear: The exact shape of `ASTResult.summary` (needed to construct valid test fixtures)
   - Recommendation: Read `src/analyzers/types.ts` at plan/execution time to confirm field names. Based on scorer.test.ts patterns, the summary has `totalFunctions`, `totalClasses`, `totalExports`, `totalImports`, `languageBreakdown` — verified by inspecting the existing `buildMockAnalysis()` factory in `scorer.test.ts` which uses `ast.summary`.

2. **validateProviderConfig throws for PROVIDER_UNKNOWN with wrong provider type**
   - What we know: The function signature accepts `HandoverConfig` which has a strict provider enum via Zod
   - What's unclear: TypeScript will complain about passing a literal `'unknown-provider'` as the provider field since HandoverConfig derives from the Zod enum
   - Recommendation: Cast with `as unknown as HandoverConfig` for the unknown-provider test, or use a spread with type assertion: `{ ...baseConfig(), provider: 'bad' as HandoverConfig['provider'] }`

3. **DAGOrchestrator parallel execution tracking**
   - What we know: Independent steps use `Promise.race()` internally and run concurrently
   - What's unclear: Whether tests can reliably assert that steps B and C in a diamond run concurrently (vs. sequentially)
   - Recommendation: Don't attempt to assert parallelism timing. Instead, assert that (a) both B and C have `status: 'completed'` and (b) D executed after both. Execution order within B/C is non-deterministic — assert the log contains all three (a, b, c, d) without assuming B vs. C ordering.

4. **TokenUsageTracker.recordRound triggers logger.warn — mocking approach**
   - What we know: Logger is a singleton (`export const logger = new Logger()`) with `setSuppressed()` method
   - What's unclear: Whether to mock logger or just avoid triggering the warning threshold in most tests
   - Recommendation: For tests that are not specifically testing the warning path, use `budgetTokens` large enough that utilization stays below 85%. For explicitly testing the warn path, call `logger.setSuppressed(true)` before the test and restore after.

---

## Sources

### Primary (HIGH confidence)

- Direct source inspection: `src/context/packer.ts` — all 7 code paths, `OVERSIZED_THRESHOLD_TOKENS`, `generateSignatureSummary()` algorithm
- Direct source inspection: `src/providers/factory.ts` — all 5 throw paths in `validateProviderConfig()`, env var access pattern
- Direct source inspection: `src/orchestrator/dag.ts` — Kahn's algorithm, skip/fail propagation logic, `OrchestratorError` usage
- Direct source inspection: `src/context/tracker.ts` — `recordRound()`, `getTotalUsage()`, `getRoundCount()`, `getLastRound()`, `estimateCost()`
- Direct source inspection: `src/parsing/types.ts` — `ParsedFile`, `FunctionSymbol`, `ClassSymbol`, `ImportInfo`, `ExportInfo`, `ConstantSymbol` shapes
- Direct source inspection: `src/context/types.ts` — `FilePriority`, `TokenBudget`, `PackedContext`, `TokenUsage` shapes
- Direct source inspection: `src/utils/errors.ts` — `ProviderError.code` values, `OrchestratorError.code` values
- Context7 `/vitest-dev/vitest` — `vi.stubEnv()` API signature, `vi.unstubAllEnvs()` cleanup pattern (HIGH confidence, verified)
- Existing test patterns: `src/context/scorer.test.ts`, `src/context/token-counter.test.ts`, `src/renderers/registry.test.ts`, `src/orchestrator/step.test.ts` — Phase 9 established style, verified passing

### Secondary (MEDIUM confidence)

- `vitest.config.ts` — confirms `include: ['src/**/*.test.ts']`, `environment: 'node'`, `testTimeout: 120_000`
- `package.json` — confirms vitest `^4.0.18`, memfs `^4.56.10` both installed

### Tertiary (LOW confidence)

- None applicable

---

## Detailed Test Scenario Matrix

### packFiles() — 7 code path coverage

| Scenario                                                                    | Code Path                  | Key Assertions                                                            |
| --------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `scored = []`                                                               | Empty input guard          | `files.length === 0`, `metadata.totalFiles === 0`, `usedTokens === 0`     |
| Total tokens ≤ budget                                                       | Small-project fast-path    | All files `tier === 'full'`, `signatureFiles === 0`, `skippedFiles === 0` |
| One file in changedFiles with tokens ≤ remaining                            | Changed-file forced full   | Changed file has `tier === 'full'`                                        |
| One file in changedFiles with tokens > remaining                            | Changed-file falls through | Falls to normal tier logic; may get `signatures` or `skip`                |
| `fullTokens > OVERSIZED_THRESHOLD_TOKENS && score >= 30` (all sections fit) | Oversized all sections     | `tier === 'full'` (combined), `content` contains section labels           |
| Oversized, sections partially fit                                           | Oversized greedy sections  | `tier === 'signatures'`, subset of sections in content                    |
| Oversized, only signatures fit                                              | Oversized signatures-only  | `tier === 'signatures'`, no section labels in content                     |
| Normal file, full tokens ≤ remaining                                        | Normal full                | `tier === 'full'`, content matches original                               |
| Normal file, full > remaining, has AST                                      | AST signatures fallback    | `tier === 'signatures'`, content contains `// FILE:` header               |
| Normal file, full > remaining, no AST                                       | Non-AST first-20-lines     | `tier === 'signatures'`, content contains `// FILE:` header               |
| File read fails (rejected promise)                                          | Error resilience           | `tier === 'skip'`, `tokens === 0`                                         |
| Budget exactly exhausted                                                    | Budget boundary            | Correct `usedTokens` vs `budgetTokens`, correct `utilizationPercent`      |

### validateProviderConfig() — 5 throw paths

| Throw Path                       | Code                          | Setup                                                                 |
| -------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| Unknown provider                 | `PROVIDER_UNKNOWN`            | `provider: 'not-real'`                                                |
| Ollama no model                  | `PROVIDER_OLLAMA_NO_MODEL`    | `provider: 'ollama'`, `model: undefined`                              |
| Azure no baseUrl                 | `PROVIDER_AZURE_NO_BASE_URL`  | `provider: 'azure-openai'`, `baseUrl: undefined`                      |
| Missing API key                  | `PROVIDER_NO_API_KEY`         | `provider: 'anthropic'`, `vi.stubEnv('ANTHROPIC_API_KEY', undefined)` |
| Custom no baseUrl                | `PROVIDER_CUSTOM_NO_BASE_URL` | `provider: 'custom'`, `baseUrl: undefined`                            |
| Non-throw: local provider no key | N/A                           | `provider: 'ollama'` with a model set — should NOT throw (isLocal)    |

### DAGOrchestrator — canonical shapes + real-world patterns

| Scenario                                        | Shape               | Key Assertions                                                                      |
| ----------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| Single step, no deps                            | Leaf                | Result has step with `status: 'completed'`                                          |
| Linear A→B→C                                    | Chain               | Execution log = `['a', 'b', 'c']` in order                                          |
| Diamond A→B, A→C, B+C→D                         | Diamond             | D completes after B and C; A is first                                               |
| Two independent steps                           | Parallel            | Both complete; order within them undefined                                          |
| A→B→A                                           | Cycle               | `execute()` rejects with `OrchestratorError`, `code === 'ORCHESTRATOR_CYCLE'`       |
| Missing dep reference                           | Invalid             | `execute()` rejects with `OrchestratorError`, `code === 'ORCHESTRATOR_MISSING_DEP'` |
| B fails → C skips                               | Failure propagation | `b.status === 'failed'`, `c.status === 'skipped'`                                   |
| A fails → B, C both skip (fan-out)              | Multi-skip          | `b.status === 'skipped'`, `c.status === 'skipped'`                                  |
| A fails in diamond: B skips, C skips, D skips   | Transitive skip     | All downstream `status === 'skipped'`                                               |
| Events: onStepStart, onStepComplete, onStepFail | Event hooks         | Corresponding vi.fn() called with correct args                                      |

### TokenUsageTracker — state transitions

| Scenario                                      | Key Assertions                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Fresh tracker                                 | `getRoundCount() === 0`, `getLastRound() === undefined`, `getTotalUsage() === { input: 0, output: 0 }` |
| Single round                                  | `getRoundCount() === 1`, `getLastRound()` is that round, `getTotalUsage()` matches single round values |
| Three rounds                                  | Sums correct, `getLastRound()` is round 3                                                              |
| `getRoundUsage(n)`                            | Returns matching round or undefined for unknown n                                                      |
| `estimateCost()` known model                  | Matches expected formula: `(input / 1M) * inputRate + (output / 1M) * outputRate`                      |
| `estimateCost()` unknown model                | Falls back to default pricing                                                                          |
| `estimateCost()` with cache read tokens       | Adds cache read contribution at 0.1x rate                                                              |
| `getRoundCacheSavings()` no cache             | Returns null                                                                                           |
| `getRoundCacheSavings()` with cacheReadTokens | Returns non-null with correct savings calculation                                                      |
| High utilization warn threshold               | `utilization >= 0.85` triggers warn path (test with suppressed logger)                                 |
| `toSummary()` no rounds                       | Returns 'No rounds recorded.'                                                                          |
| `toSummary()` multiple rounds                 | Contains per-round lines and Total line                                                                |

### generateSignatureSummary() — output format assertions

| Scenario                                            | Key Assertions                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Minimal (no symbols, no imports)                    | Output contains only `// FILE: path (N lines)`                    |
| Exported async function, typed params, return type  | Contains `export async function name(p1: T1, p2: T2): ReturnType` |
| Exported sync function, no types                    | Contains `export function name(p)` (no type suffix)               |
| Non-exported function                               | Function NOT in output                                            |
| Exported class with public methods                  | Contains `export class Name { method(p: T): R }`                  |
| Class with private methods                          | Private methods NOT in class method string                        |
| Exported constant with type                         | Contains `export const NAME: Type`                                |
| Exported constant without type                      | Contains `export const NAME` (no type suffix)                     |
| Non-exported constant                               | Constant NOT in output                                            |
| Two imports                                         | Contains `// 2 imports from: source1, source2`                    |
| Zero imports                                        | No imports line at all                                            |
| All together: function + class + constant + imports | All four sections present in correct order                        |

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — vitest 4.x installed and configured; no new deps needed; verified by package.json
- Architecture patterns: HIGH — all 5 source files read directly; all types confirmed; Phase 9 pattern validated by passing tests
- Pitfalls: HIGH — identified from direct source inspection (checked export gating, throw paths, logger integration); vi.stubEnv verified via Context7
- Test scenario matrix: HIGH — derived from complete source code review of all 5 targets

**Research date:** 2026-02-19
**Valid until:** 2026-03-20 (30 days — stable codebase, no external API dependencies)
