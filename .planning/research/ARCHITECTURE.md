# Architecture Research

**Domain:** Unit Testing Integration — TypeScript CLI with DAG Orchestrator, LLM Providers, Zod Pipelines
**Researched:** 2026-02-19
**Confidence:** HIGH (codebase read directly; patterns grounded in source; Vitest patterns HIGH from official docs + direct source inspection)

---

## Standard Architecture

This document covers how unit tests integrate with the existing 99-file TypeScript codebase. It does not re-document what already exists in `.planning/codebase/ARCHITECTURE.md` — it focuses on test file placement, mock boundaries, dependency seams, and build order for adding unit tests without breaking the existing integration test suite.

### System Overview

Existing test topology before this milestone:

```
tests/
  integration/
    generate.test.ts      # Full CLI subprocess tests (env-gated)
    edge-cases.test.ts    # Synthetic fixture edge cases
    monorepo.test.ts      # Monorepo detection
    performance.test.ts   # Performance benchmarks
    setup.ts              # Shared fixture helpers (createFixtureScope, runCLI)
    targets.ts            # Validation target definitions

src/                      # No test files exist yet
  (99 source files, 0 test files)
```

Target topology after this milestone — tests colocated with source:

```
src/
  orchestrator/
    dag.test.ts           # NEW — DAGOrchestrator unit tests
    step.test.ts          # NEW — createStep() validation tests
  analyzers/
    todo-scanner.test.ts  # NEW — scanFileForTodos() pure function
    file-tree.test.ts     # NEW — tree building logic
    coordinator.test.ts   # NEW — allSettled failure isolation
  context/
    token-counter.test.ts # NEW — estimateTokens, computeTokenBudget
    scorer.test.ts        # NEW — scoreFiles() with fixture data
    packer.test.ts        # NEW — packFiles() tier assignment
    tracker.test.ts       # NEW — TokenUsageTracker accounting
  config/
    schema.test.ts        # NEW — Zod schema validation rules
    loader.test.ts        # NEW — loadConfig() precedence layering
  providers/
    factory.test.ts       # NEW — validateProviderConfig() error paths
  ai-rounds/
    validator.test.ts     # NEW — validateFileClaims(), drop-rate logic
    quality.test.ts       # NEW — checkRoundQuality() thresholds
    runner.test.ts        # NEW — executeRound() with mock provider
  renderers/
    registry.test.ts      # NEW — resolveSelectedDocs(), computeRequiredRounds()
    render-01-overview.test.ts  # NEW — renderer with fixture RenderContext
    utils.test.ts         # NEW — buildTable(), codeRef(), sectionIntro()

tests/
  integration/            # UNCHANGED — existing 4 test files remain
    generate.test.ts
    edge-cases.test.ts
    monorepo.test.ts
    performance.test.ts
    setup.ts              # EXTEND — add unit test helpers if needed
```

### Component Boundaries for Testing

| Component                  | Testability                     | Primary Seam                   | Mock Strategy                                |
| -------------------------- | ------------------------------- | ------------------------------ | -------------------------------------------- |
| `DAGOrchestrator`          | HIGH — pure logic, no I/O       | `StepDefinition.execute`       | Pass `vi.fn()` as execute callbacks          |
| `createStep()`             | HIGH — pure validation          | None needed                    | Direct call with invalid inputs              |
| `scoreFiles()`             | HIGH — pure function            | `StaticAnalysisResult`         | Construct minimal fixture objects            |
| `packFiles()`              | HIGH — pure + injected I/O      | `getFileContent` callback      | Pass `vi.fn()` returning test content        |
| `computeTokenBudget()`     | HIGH — pure math                | None                           | Direct call with numbers                     |
| `estimateTokens()`         | HIGH — pure function            | `LLMProvider` (optional)       | No mock needed for standalone path           |
| `TokenUsageTracker`        | HIGH — stateful class           | None (no external deps)        | Instantiate directly                         |
| `HandoverConfigSchema`     | HIGH — Zod schema               | None                           | `.parse()` / `.safeParse()` directly         |
| `loadConfig()`             | MEDIUM — file I/O + env         | `fs.existsSync`, `process.env` | `vi.spyOn(fs, 'existsSync')` + env overrides |
| `validateProviderConfig()` | HIGH — pure logic + env         | `process.env`                  | Set/unset env vars in beforeEach             |
| `validateFileClaims()`     | HIGH — pure function            | `StaticAnalysisResult`         | Construct minimal fixture                    |
| `executeRound()`           | MEDIUM — uses injected provider | `LLMProvider.complete`         | Mock LLMProvider interface                   |
| `renderOverview()`         | HIGH — pure function            | `RenderContext`                | Construct fixture RenderContext              |
| `resolveSelectedDocs()`    | HIGH — pure function            | `DocumentSpec[]`               | Use DOCUMENT_REGISTRY directly               |
| `scanFileForTodos()`       | HIGH — pure function            | None                           | Pass string content directly                 |
| Individual analyzers       | MEDIUM — file system I/O        | `AnalysisContext`              | Inject mock ctx.files array                  |

---

## Recommended Project Structure

### Test File Placement: Colocated, Not Separated

Place unit test files adjacent to the source file they test. This is the correct pattern for this codebase because:

1. Vitest's `include` already matches `src/**/*.test.ts` — no config change needed
2. Colocated tests make import paths short (`../dag` becomes `./dag` or just `'./dag.js'`)
3. Source-adjacent placement prevents test files from drifting out of sync with implementations
4. Integration tests remain in `tests/integration/` — the separation between unit and integration is `src/` vs `tests/`

```
src/
├── orchestrator/
│   ├── dag.ts
│   ├── dag.test.ts         # tests for DAGOrchestrator class
│   ├── step.ts
│   └── step.test.ts        # tests for createStep() factory
├── context/
│   ├── scorer.ts
│   ├── scorer.test.ts      # tests for scoreFiles()
│   ├── packer.ts
│   ├── packer.test.ts      # tests for packFiles()
│   ├── token-counter.ts
│   ├── token-counter.test.ts
│   └── tracker.ts
│   └── tracker.test.ts
├── config/
│   ├── schema.ts
│   ├── schema.test.ts      # Zod schema validation tests
│   ├── loader.ts
│   └── loader.test.ts      # loadConfig() precedence tests
├── ai-rounds/
│   ├── validator.ts
│   ├── validator.test.ts   # claim validation unit tests
│   ├── quality.ts
│   ├── quality.test.ts
│   ├── runner.ts
│   └── runner.test.ts      # executeRound() with mock provider
├── analyzers/
│   ├── todo-scanner.ts
│   ├── todo-scanner.test.ts  # scanFileForTodos() pure logic
│   └── coordinator.test.ts   # allSettled failure isolation
└── renderers/
    ├── registry.ts
    ├── registry.test.ts    # resolveSelectedDocs(), computeRequiredRounds()
    └── utils.test.ts       # buildTable(), etc.
```

### Structure Rationale

- **`src/**/\*.test.ts` pattern:\*\* Already in vitest include config — zero config changes required.
- **No `tests/unit/` directory:** Putting unit tests in a separate top-level directory creates the same maintenance problem as monolithic test files — distance from the code being tested.
- **`tests/integration/` stays unchanged:** The integration tests run against the built CLI and require `npm run build` first. They are fundamentally different from unit tests. Keeping them separate preserves this distinction.
- **Shared test utilities for unit tests:** If shared fixtures or mock factories are needed, add `src/__tests__/helpers.ts` or colocate a `fixtures.ts` file next to the module under test.

---

## Architectural Patterns

### Pattern 1: Mock LLMProvider Interface with vi.fn()

**What:** The `LLMProvider` interface has three methods (`complete`, `estimateTokens`, `maxContextTokens`). Create a mock object satisfying the interface using `vi.fn()` for each method. This avoids any real API calls in unit tests.

**When to use:** Any test that exercises code receiving an `LLMProvider` — primarily `executeRound()` in `src/ai-rounds/runner.ts` and `estimateTokens()` in `src/context/token-counter.ts`.

**Trade-offs:** Interface mocks require manual maintenance when the interface changes. Use them only at explicit boundaries — do not mock deeply into implementations.

**Example:**

```typescript
// src/ai-rounds/runner.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { LLMProvider } from '../providers/base.js';
import { executeRound } from './runner.js';
import { z } from 'zod';

function makeMockProvider(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    name: 'mock',
    complete: vi.fn(),
    estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
    maxContextTokens: vi.fn(() => 200_000),
    ...overrides,
  };
}

describe('executeRound', () => {
  it('returns degraded result when provider throws', async () => {
    const provider = makeMockProvider({
      complete: vi.fn().mockRejectedValue(new Error('network error')),
    });
    // ... test graceful degradation path
  });
});
```

### Pattern 2: DAGOrchestrator Testing via Step Injection

**What:** `DAGOrchestrator` accepts `StepDefinition[]` where each step has an `execute` callback. Tests can inject `vi.fn()` callbacks to control step outcomes (success, failure, ordering) without any real pipeline code running.

**When to use:** All DAG tests — topology validation, cycle detection, skip propagation, parallel execution ordering.

**Trade-offs:** Tests of the DAG are purely structural. They verify the orchestrator's scheduling logic, not the steps themselves. Keep DAG tests focused on orchestration behavior only.

**Example:**

```typescript
// src/orchestrator/dag.test.ts
import { describe, it, expect, vi } from 'vitest';
import { DAGOrchestrator } from './dag.js';
import { createStep } from './step.js';

describe('DAGOrchestrator', () => {
  it('executes independent steps in parallel', async () => {
    const dag = new DAGOrchestrator();
    const order: string[] = [];

    dag.addSteps([
      createStep({
        id: 'a',
        name: 'A',
        deps: [],
        execute: async () => {
          order.push('a');
          return {};
        },
      }),
      createStep({
        id: 'b',
        name: 'B',
        deps: [],
        execute: async () => {
          order.push('b');
          return {};
        },
      }),
      createStep({ id: 'c', name: 'C', deps: ['a', 'b'], execute: async () => 'done' }),
    ]);

    const results = await dag.execute();
    expect(results.get('c')?.status).toBe('completed');
    // a and b both ran before c
    expect(order).toContain('a');
    expect(order).toContain('b');
  });

  it('skips dependents when a step fails', async () => {
    const dag = new DAGOrchestrator();
    dag.addSteps([
      createStep({
        id: 'fail',
        name: 'Fail',
        deps: [],
        execute: async () => {
          throw new Error('boom');
        },
      }),
      createStep({ id: 'skip-me', name: 'Skip', deps: ['fail'], execute: vi.fn() }),
    ]);

    const results = await dag.execute();
    expect(results.get('fail')?.status).toBe('failed');
    expect(results.get('skip-me')?.status).toBe('skipped');
  });

  it('detects cycles during validate()', () => {
    const dag = new DAGOrchestrator();
    dag.addSteps([
      createStep({ id: 'x', name: 'X', deps: ['y'], execute: async () => {} }),
      createStep({ id: 'y', name: 'Y', deps: ['x'], execute: async () => {} }),
    ]);
    const { valid, errors } = dag.validate();
    expect(valid).toBe(false);
    expect(errors[0]).toMatch(/cyclic/i);
  });
});
```

### Pattern 3: Zod Schema Testing — Valid, Invalid, and Edge Cases

**What:** Test `HandoverConfigSchema` and all AI round output schemas by calling `.safeParse()` directly with constructed inputs. No mocking needed — Zod schemas are pure functions over their input.

**When to use:** All config schema tests, all AI round output schema tests. This catches schema regressions when fields are added, renamed, or made required.

**Trade-offs:** Tests are tightly coupled to schema shape. Schema changes require test updates. This coupling is intentional — it prevents silent schema drift.

**Example:**

```typescript
// src/config/schema.test.ts
import { describe, it, expect } from 'vitest';
import { HandoverConfigSchema } from './schema.js';

describe('HandoverConfigSchema', () => {
  it('accepts minimal config (zero-config mode)', () => {
    const result = HandoverConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.provider).toBe('anthropic');
    expect(result.data?.audience).toBe('human');
    expect(result.data?.analysis.concurrency).toBe(4);
  });

  it('rejects negative concurrency', () => {
    const result = HandoverConfigSchema.safeParse({ analysis: { concurrency: -1 } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['analysis', 'concurrency']);
  });

  it('rejects invalid baseUrl format', () => {
    const result = HandoverConfigSchema.safeParse({ baseUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown provider values', () => {
    const result = HandoverConfigSchema.safeParse({ provider: 'unknown-llm' });
    expect(result.success).toBe(false);
  });
});
```

### Pattern 4: Pure Analyzer Logic — Fixture-Driven Tests

**What:** Static analyzer functions that take `AnalysisContext` or return typed result objects are testable by constructing minimal fixture objects. The key insight is that most analyzers have a pure inner function (e.g., `scanFileForTodos`) that processes strings and returns typed data.

**When to use:** `scanFileForTodos()`, `scoreFiles()`, `validateFileClaims()`, `generateSignatureSummary()`, and any analyzer function that does not touch the filesystem directly.

**Trade-offs:** Filesystem-touching functions (`scanTodos()`, `analyzeFileTree()`) are harder to unit test. Test the pure inner logic; leave the I/O coordinator to integration tests.

**Example:**

```typescript
// src/analyzers/todo-scanner.test.ts
import { describe, it, expect } from 'vitest';
// Note: scanFileForTodos is not exported — test the exported scanTodos
// OR restructure to export the pure function.
// If not exported, test via the public contract or export it.

// Preferred: export scanFileForTodos from todo-scanner.ts for testability
import { scanFileForTodos } from './todo-scanner.js';

describe('scanFileForTodos', () => {
  it('detects TODO marker with text', () => {
    const items = scanFileForTodos('// TODO: fix this\nconst x = 1;', 'src/foo.ts');
    expect(items).toHaveLength(1);
    expect(items[0].marker).toBe('TODO');
    expect(items[0].category).toBe('tasks');
    expect(items[0].text).toBe('fix this');
    expect(items[0].line).toBe(1);
  });

  it('extracts issue references from TODO line', () => {
    const items = scanFileForTodos('// TODO: fix #123 and JIRA-456', 'src/foo.ts');
    expect(items[0].issueRefs).toEqual(['#123', 'JIRA-456']);
  });

  it('classifies FIXME as bugs category', () => {
    const items = scanFileForTodos('// FIXME: broken edge case', 'src/bar.ts');
    expect(items[0].category).toBe('bugs');
  });

  it('returns empty array for files with no markers', () => {
    const items = scanFileForTodos('const x = 1;\nconst y = 2;', 'src/clean.ts');
    expect(items).toHaveLength(0);
  });
});
```

### Pattern 5: Renderer Testing via RenderContext Fixtures

**What:** Renderer functions (`renderOverview`, `renderArchitecture`, etc.) take a `RenderContext` object and return a markdown string. They are pure functions with no external dependencies. Test by constructing minimal `RenderContext` fixtures and asserting on the output string.

**When to use:** All 14 renderer functions, renderer utilities (`buildTable`, `codeRef`, `sectionIntro`), and `renderDocument` template.

**Trade-offs:** Constructing a minimal `RenderContext` requires understanding all required fields. Extract a `makeRenderContext()` factory function shared across renderer tests to reduce duplication.

**Example:**

```typescript
// src/renderers/registry.test.ts
import { describe, it, expect } from 'vitest';
import { resolveSelectedDocs, computeRequiredRounds, DOCUMENT_REGISTRY } from './registry.js';

describe('resolveSelectedDocs', () => {
  it('returns all docs when onlyFlag is undefined', () => {
    const docs = resolveSelectedDocs(undefined, DOCUMENT_REGISTRY);
    expect(docs).toHaveLength(DOCUMENT_REGISTRY.length);
  });

  it('always includes INDEX when alias is specified', () => {
    const docs = resolveSelectedDocs('overview', DOCUMENT_REGISTRY);
    expect(docs.map((d) => d.id)).toContain('00-index');
  });

  it('throws on unknown alias', () => {
    expect(() => resolveSelectedDocs('not-a-doc', DOCUMENT_REGISTRY)).toThrow(
      /unknown document alias/i,
    );
  });

  it('expands group aliases', () => {
    const docs = resolveSelectedDocs('core', DOCUMENT_REGISTRY);
    const ids = docs.map((d) => d.id);
    expect(ids).toContain('03-architecture');
    expect(ids).toContain('06-modules');
    expect(ids).toContain('05-features');
  });
});

describe('computeRequiredRounds', () => {
  it('returns empty set for index-only docs', () => {
    const indexDoc = DOCUMENT_REGISTRY.find((d) => d.id === '00-index')!;
    const rounds = computeRequiredRounds([indexDoc]);
    expect(rounds.size).toBe(0);
  });

  it('expands transitive deps for round 4 (needs rounds 1-3)', () => {
    const archDoc = DOCUMENT_REGISTRY.find((d) => d.id === '03-architecture')!;
    const rounds = computeRequiredRounds([archDoc]);
    expect(rounds.has(1)).toBe(true);
    expect(rounds.has(2)).toBe(true);
    expect(rounds.has(3)).toBe(true);
    expect(rounds.has(4)).toBe(true);
  });
});
```

### Pattern 6: Context Packer Testing via Injected I/O

**What:** `packFiles()` accepts a `getFileContent: (path: string) => Promise<string>` callback. This seam allows unit tests to inject controlled file content without touching the filesystem. Combined with fixture `FilePriority[]` and `ASTResult` objects, the full packing algorithm is testable in isolation.

**When to use:** `packFiles()` in `src/context/packer.ts` — all tier assignment logic, budget boundary conditions, oversized file handling, changed-file priority.

**Trade-offs:** Constructing realistic `FilePriority[]` and `ASTResult` requires some fixture verbosity. Extract a `makeFilePriority()` helper to reduce repetition.

**Example:**

```typescript
// src/context/packer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { packFiles } from './packer.js';
import type { FilePriority, TokenBudget } from './types.js';
import type { ASTResult } from '../analyzers/types.js';

const EMPTY_AST: ASTResult = {
  files: [],
  summary: {
    totalFunctions: 0,
    totalClasses: 0,
    totalExports: 0,
    totalImports: 0,
    languageBreakdown: {},
  },
};

const TIGHT_BUDGET: TokenBudget = {
  total: 10_000,
  promptOverhead: 3000,
  outputReserve: 4096,
  fileContentBudget: 1000, // very tight
};

describe('packFiles', () => {
  it('returns empty PackedContext for empty scored list', async () => {
    const result = await packFiles(
      [],
      EMPTY_AST,
      TIGHT_BUDGET,
      (t) => Math.ceil(t.length / 4),
      vi.fn(),
    );
    expect(result.files).toHaveLength(0);
    expect(result.metadata.totalFiles).toBe(0);
  });

  it('assigns full tier when file fits in budget', async () => {
    const scored: FilePriority[] = [{ path: 'src/foo.ts', score: 50, breakdown: {} as any }];
    const content = 'const x = 1;'; // ~3 tokens
    const getContent = vi.fn().mockResolvedValue(content);

    const result = await packFiles(
      scored,
      EMPTY_AST,
      TIGHT_BUDGET,
      (t) => Math.ceil(t.length / 4),
      getContent,
    );
    expect(result.files[0].tier).toBe('full');
    expect(result.files[0].content).toBe(content);
  });

  it('assigns skip tier when budget is exhausted', async () => {
    // Budget allows only first file; second must be skipped
    const scored: FilePriority[] = [
      { path: 'src/big.ts', score: 50, breakdown: {} as any },
      { path: 'src/also-big.ts', score: 40, breakdown: {} as any },
    ];
    const bigContent = 'x'.repeat(5000); // exceeds budget
    const getContent = vi.fn().mockResolvedValue(bigContent);

    const result = await packFiles(
      scored,
      EMPTY_AST,
      TIGHT_BUDGET,
      (t) => Math.ceil(t.length / 4),
      getContent,
    );
    // At least one file should be skipped
    expect(result.files.some((f) => f.tier === 'skip')).toBe(true);
  });
});
```

---

## Data Flow

### Mock Data Flow for Unit Tests

```
Test file
    │
    ├── Construct fixture inputs (inline objects or factory functions)
    │     e.g., { fileTree: { directoryTree: [...] }, ... }
    │
    ├── Inject mocks for I/O seams
    │     e.g., getFileContent: vi.fn().mockResolvedValue('content')
    │         or provider.complete: vi.fn().mockResolvedValue({ data: {...}, usage: {...} })
    │
    ├── Call function under test directly (no subprocess, no CLI)
    │     e.g., scoreFiles(analysis)
    │         or executeRound({ provider: mockProvider, ... })
    │
    └── Assert on returned value
          e.g., expect(result[0].score).toBe(45)
              or expect(provider.complete).toHaveBeenCalledOnce()
```

### Dependency Graph for Test Modules

Tests are ordered from fewest to most dependencies. Build tests bottom-up:

```
Layer 0 (no deps):
  src/config/schema.test.ts          — Zod only, no imports
  src/utils/errors.test.ts           — pure classes
  src/orchestrator/step.test.ts      — pure factory
  src/context/token-counter.test.ts  — math functions

Layer 1 (depend on Layer 0 types):
  src/orchestrator/dag.test.ts       — uses StepDefinition interface
  src/config/loader.test.ts          — uses HandoverConfigSchema
  src/analyzers/todo-scanner.test.ts — uses TodoItem type
  src/context/tracker.test.ts        — standalone class

Layer 2 (depend on Layer 1 outputs):
  src/context/scorer.test.ts         — uses StaticAnalysisResult fixtures
  src/ai-rounds/validator.test.ts    — uses StaticAnalysisResult fixtures
  src/renderers/registry.test.ts     — uses DOCUMENT_REGISTRY
  src/providers/factory.test.ts      — uses HandoverConfig type

Layer 3 (depend on Layer 2, use mock interfaces):
  src/context/packer.test.ts         — uses scored FilePriority[], injected getFileContent
  src/ai-rounds/runner.test.ts       — uses mock LLMProvider
  src/renderers/render-01-overview.test.ts  — uses RenderContext fixture

Layer 4 (end-to-end unit, still no real I/O):
  src/analyzers/coordinator.test.ts  — tests allSettled failure isolation with mock analyzers
```

### Key Data Flows for Mocking

1. **LLMProvider mock flow:** Tests inject a mock `LLMProvider` into `executeRound()`. The mock `complete()` returns a pre-constructed `CompletionResult & { data: T }` object. This verifies the runner's validation, quality checking, retry, and fallback logic without any network calls.

2. **AnalysisContext mock flow:** Analyzer unit tests construct a minimal `AnalysisContext` with `files: []` or a small array of `{ path, absolutePath, extension }` objects. The `ctx.cache` is mocked with `{ get: vi.fn(), set: vi.fn() }`. This lets each analyzer's pure logic run without filesystem access.

3. **loadConfig() environment isolation:** `loadConfig()` reads `process.env` and `fs.existsSync`. Use `vi.spyOn(process, 'env', 'get')` or set env vars in `beforeEach`/`afterEach` with restoration. Use `vi.spyOn(fs, 'existsSync')` to control whether `.handover.yml` appears to exist.

4. **DAG event tracking:** `DAGOrchestrator` accepts a `DAGEvents` object at construction. Tests can pass `{ onStepStart: vi.fn(), onStepComplete: vi.fn() }` to assert that events fire correctly during execution.

---

## Scaling Considerations

This is a test infrastructure concern, not a user-scale concern. The relevant question is: how do test run times scale as tests are added?

| Test Count                | Expected Run Time | Notes                          |
| ------------------------- | ----------------- | ------------------------------ |
| 0-50 unit tests           | < 1 second        | Pure functions, no I/O         |
| 50-200 unit tests         | 2-5 seconds       | Mostly pure, minimal async     |
| 200+ unit tests           | 5-30 seconds      | Depends on async fixture setup |
| Integration tests (gated) | 2-10 minutes      | Unchanged — require env var    |

### Scaling Priorities

1. **First constraint: Test timeout.** The current vitest timeout is 120 seconds (set for integration tests). Unit tests should complete in milliseconds. Do not lower the global timeout — add `timeout: 5000` at the `describe` level for test files that do not need 2-minute timeouts.

2. **Second constraint: ESM module mock hoisting.** Vitest hoists `vi.mock()` calls to the top of the file in ESM mode. For ESM projects (this codebase uses `"type": "module"`), module mocking via `vi.mock()` works correctly. Avoid `vi.doMock()` for static analysis — use it only for tests that require dynamic mock switching.

3. **Third constraint: Coverage thresholds.** The current config requires 80% coverage on lines/functions/branches. Adding unit tests will increase coverage significantly. The threshold is a floor — do not lower it if a new test reveals a gap.

---

## Anti-Patterns

### Anti-Pattern 1: Testing Implementation Details Inside DAGOrchestrator

**What people do:** Mock the `Map` internals, spy on `checkDependents` private methods, or assert on the `inDegree` Map state.

**Why it's wrong:** Private implementation details of `DAGOrchestrator` can change without breaking the contract. Tests of internals become maintenance debt — every refactor breaks them.

**Do this instead:** Test only observable behavior: `dag.execute()` returns the correct `Map<string, StepResult>`, steps fire in the correct order (verified via side effects in execute callbacks), skipped steps have status 'skipped'. The `validate()` method is public and directly testable.

### Anti-Pattern 2: Creating a `MockProvider` Class

**What people do:** Write a `MockProvider extends BaseProvider` class with stub implementations for all methods.

**Why it's wrong:** A `MockProvider` class encodes assumptions about how the mock should behave across all tests. Tests that need different mock behavior (e.g., one test wants the provider to throw, another wants it to return cached data) need subclasses or mutating state.

**Do this instead:** Use `vi.fn()` to create the minimal object satisfying `LLMProvider` interface per test. The `makeMockProvider(overrides?)` factory pattern (shown in Pattern 1) provides defaults while allowing per-test customization without a class hierarchy.

### Anti-Pattern 3: Placing Unit Tests in `tests/unit/`

**What people do:** Create `tests/unit/orchestrator/dag.test.ts` to mirror the source tree.

**Why it's wrong:** Path duplication (`src/orchestrator/dag.ts` ↔ `tests/unit/orchestrator/dag.test.ts`) means two places to update when source is moved or renamed. Import paths become long (`../../../src/orchestrator/dag.js`).

**Do this instead:** Colocate tests in `src/`. The vitest include pattern already matches `src/**/*.test.ts`. Import paths become relative and short (`'./dag.js'`).

### Anti-Pattern 4: Mocking Zod Schemas

**What people do:** Mock `zod` module or stub `schema.parse` to always return a fixed object.

**Why it's wrong:** Zod schemas are pure value objects. Mocking them bypasses the entire point of schema tests — verifying that the schema correctly accepts and rejects inputs.

**Do this instead:** Call `schema.safeParse()` with real inputs. If a test needs to bypass validation inside a function under test (e.g., simulating an already-validated object passed downstream), construct the object directly as a typed constant.

### Anti-Pattern 5: Using `runCLI()` for Unit Tests

**What people do:** Reuse `tests/integration/setup.ts`'s `runCLI()` helper (which spawns a subprocess) to test individual module behavior.

**Why it's wrong:** `runCLI()` spawns a child process, requires a built dist/, and takes seconds per invocation. Unit tests that use it are integration tests wearing unit test clothes. They are slow, fragile (require build step), and do not isolate failures.

**Do this instead:** Import the module directly and call its exported functions. If a function is only accessible through the CLI entry point, that is a sign it needs to be extracted and exported for direct testing.

### Anti-Pattern 6: Importing from `dist/` in Unit Tests

**What people do:** Import from `'../../dist/index.js'` in unit test files to get typed exports.

**Why it's wrong:** Unit tests in `src/` must import from `src/` source files. Importing from `dist/` couples test execution to the build step, which breaks `vitest run` without a prior `npm run build`.

**Do this instead:** Import from relative source paths with `.js` extensions (required for ESM): `import { DAGOrchestrator } from './dag.js'`. Vitest resolves `.ts` files transparently even with `.js` import extensions.

---

## Integration Points

### Vitest Configuration — No Changes Required

The existing `vitest.config.ts` already supports unit tests without modification:

```typescript
// vitest.config.ts (current — no changes needed)
include: ['src/**/*.test.ts', 'tests/**/*.test.ts']  // already matches colocated tests
exclude: ['node_modules', 'dist', '.claude', '.planning']
coverage: {
  include: ['src/**/*.ts'],  // collects coverage from source files
}
```

The 80% coverage thresholds will be easier to meet once unit tests are added. Do not raise thresholds preemptively — let them be enforced organically.

### ESM Module Mocking Boundary

This project uses `"type": "module"` (package.json line 4). Vitest handles ESM mocking correctly via compile-time hoisting of `vi.mock()` calls. Rules:

- `vi.mock('modulePath')` must be called at the top level of a test file (Vitest hoists it)
- `vi.mock()` with a factory function is the preferred pattern for replacing module exports
- `vi.spyOn()` works for mocking methods on imported objects without replacing the whole module
- Do not use `jest.mock()` syntax — it is not hoisted correctly in ESM mode by Vitest

### Fixture Factory Helpers

Several test modules will need shared fixture construction. Create these helpers colocated with their primary consumers, not in a global `tests/fixtures/` directory:

| Helper Location                                  | Purpose                                |
| ------------------------------------------------ | -------------------------------------- |
| `src/analyzers/__fixtures__/analysis-context.ts` | Minimal `AnalysisContext` factory      |
| `src/context/__fixtures__/static-analysis.ts`    | Minimal `StaticAnalysisResult` factory |
| `src/renderers/__fixtures__/render-context.ts`   | Minimal `RenderContext` factory        |

These are `__fixtures__` directories (double-underscore convention), not test files themselves. They export factory functions that tests import.

### Coverage Collection Boundary

The vitest coverage config already includes `src/**/*.ts` and excludes `src/**/*.test.ts`. This means:

- All 99 source files are included in coverage collection
- New test files (`*.test.ts`) are excluded from coverage targets
- Fixture files in `__fixtures__/` are included in coverage unless explicitly excluded

Add a coverage exclusion for fixture helpers:

```typescript
// vitest.config.ts — add to coverage.exclude
exclude: [
  'src/**/*.test.ts',
  'src/**/*.spec.ts',
  'src/**/__fixtures__/**', // NEW — exclude fixture helpers from coverage
];
```

### Build Order for Test Module Additions

Add tests in this sequence to build confidence incrementally:

```
Phase 1 — Pure Functions (no mocks, no async):
  1. src/config/schema.test.ts          — Zod validation rules
  2. src/orchestrator/step.test.ts      — createStep() validation
  3. src/context/token-counter.test.ts  — estimateTokens, computeTokenBudget
  4. src/analyzers/todo-scanner.test.ts — scanFileForTodos() string parsing
  5. src/renderers/registry.test.ts     — resolveSelectedDocs, computeRequiredRounds

Phase 2 — Stateful Objects (no mocks, test class behavior):
  6. src/orchestrator/dag.test.ts       — DAGOrchestrator topology + execution
  7. src/context/tracker.test.ts        — TokenUsageTracker accounting
  8. src/ai-rounds/validator.test.ts    — claim validation pure functions

Phase 3 — Environment-Dependent (spyOn or env var isolation):
  9. src/config/loader.test.ts          — loadConfig() precedence + env vars
 10. src/providers/factory.test.ts      — validateProviderConfig() error paths

Phase 4 — Mock Boundaries (mock interfaces):
 11. src/context/scorer.test.ts         — scoreFiles() with fixture StaticAnalysisResult
 12. src/context/packer.test.ts         — packFiles() with injected getFileContent
 13. src/ai-rounds/quality.test.ts      — checkRoundQuality() thresholds
 14. src/ai-rounds/runner.test.ts       — executeRound() with mock LLMProvider

Phase 5 — Renderer Tests (RenderContext fixtures):
 15. src/renderers/utils.test.ts        — buildTable, codeRef, sectionIntro
 16. src/renderers/render-01-overview.test.ts  — with/without r1 data
 17. Additional renderers as needed
```

Dependencies between phases: each phase depends on the prior phase passing. Phase 1 tests must pass before Phase 2 tests are written (otherwise layered failures obscure root causes). Phases 1-2 have no test infrastructure dependencies. Phases 3-4 require understanding of `vi.spyOn` and `vi.fn()` patterns.

---

## Sources

- Direct codebase reading: `src/orchestrator/dag.ts`, `src/orchestrator/step.ts`, `src/providers/base.ts`, `src/providers/base-provider.ts`, `src/ai-rounds/runner.ts`, `src/ai-rounds/validator.ts`, `src/context/scorer.ts`, `src/context/packer.ts`, `src/context/tracker.ts`, `src/config/schema.ts`, `src/config/loader.ts`, `src/analyzers/todo-scanner.ts`, `src/analyzers/coordinator.ts`, `src/renderers/registry.ts`, `src/renderers/render-01-overview.ts`, `tests/integration/setup.ts`, `vitest.config.ts`, `package.json` — HIGH confidence
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking) — HIGH confidence (official docs)
- [Vitest Mock Functions API](https://vitest.dev/api/mock) — HIGH confidence (official docs)
- [Vitest ESM Module Mocking](https://vitest.dev/guide/mocking/modules) — HIGH confidence (official docs)
- [Zod Testing Patterns — Steve Kinney](https://stevekinney.com/courses/full-stack-typescript/testing-zod-schema) — MEDIUM confidence (secondary source, consistent with observed patterns)

---

_Architecture research for: Handover CLI — Unit Testing Milestone_
_Researched: 2026-02-19_
