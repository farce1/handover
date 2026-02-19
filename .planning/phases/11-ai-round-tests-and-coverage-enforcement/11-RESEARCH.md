# Phase 11: AI Round Tests and Coverage Enforcement - Research

**Researched:** 2026-02-20
**Domain:** Vitest unit testing — mocking async providers, fake timers, coverage thresholds
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Shape-accurate typed mocks matching actual provider response interfaces — not minimal stubs, not full realistic payloads
- Mock tool_use responses include realistic field names (sections, signatures) but with minimal fixture data (1-2 items, not full documents)
- Reuse `createMockProvider()` factory from Phase 8 infrastructure — extend with scenario-specific return values per test
- Each test case controls its own mock return value — no shared mutable mock state between tests
- Global 80% threshold only — no per-file minimums (adds maintenance burden without proportional value)
- Exclude from coverage denominator: WASM files, type definition files (.d.ts), test files themselves, config/build files
- Threshold enforced in vitest.config.ts with `coverage.thresholds.global` — CI fails if coverage drops below 80%
- Coverage provider: v8 (already configured in Phase 8 infrastructure)
- Cover all 3 specified paths: happy path (tool_use response), degraded (provider throw), retry with vi.useFakeTimers()
- Add timeout scenario: provider hangs past backoff window
- Test idempotency: same input produces same degraded result on repeated failures
- Assert error messages are actionable — not just "something went wrong"
- Exact string assertions for buildTable(), codeRef(), sectionIntro() — not snapshots (snapshots hide regressions)
- Test with edge cases: empty input, single row, special characters in content
- Markdown output must be valid — testable by checking structure (headers, code fences, table delimiters)

### Claude's Discretion

- Exact fixture data shapes and content values
- Test file organization within colocated pattern (src/\*_/_.test.ts)
- Whether to use test.each for parameterized renderer tests or individual test cases
- vi.useFakeTimers() advancement strategy (exact ms values)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 11 adds unit tests for three areas: the AI round runner (`executeRound`, `validateFileClaims`, `compressRoundOutput`), the renderer utilities (`buildTable`, `codeRef`, `sectionIntro`), and enforces the CI coverage gate at 80%.

The existing test infrastructure (Phase 8) provides `createMockProvider()` in `src/providers/__mocks__/index.ts`, `vi.fn()` cast patterns, and a vitest.config.ts with v8 coverage provider already configured. Coverage thresholds were intentionally omitted from vitest.config.ts in Phase 8; Phase 11 adds the `coverage.thresholds.global` block after building a real test suite.

The critical technical insight is that `executeRound()` mocks at the `LLMProvider` interface boundary — so the 30s retry backoff in `BaseProvider.complete()` is irrelevant for executeRound tests. The "retry with vi.useFakeTimers()" requirement in TEST-12 refers to the `retryWithBackoff()` function from `src/utils/rate-limiter.ts`, which uses `setTimeout` internally and requires fake timers when testing it directly. The executeRound retry path (high drop rate or quality failure) is synchronous and does not involve timers — only the provider-level retry needs fake timers.

**Primary recommendation:** Write the executeRound retry test by controlling the mock provider's rejection behavior and advancing fake timers through the 30s backoff window using `vi.advanceTimersByTimeAsync()`. For coverage, add the threshold block to vitest.config.ts after confirming the suite hits 80%.

---

## Standard Stack

### Core

| Library             | Version | Purpose                                       | Why Standard                                            |
| ------------------- | ------- | --------------------------------------------- | ------------------------------------------------------- |
| vitest              | ^4.0.x  | Test runner, assertions, mocking, fake timers | Already in use throughout codebase                      |
| @vitest/coverage-v8 | ^4.0.18 | V8-based coverage collection                  | Already in package.json, configured in vitest.config.ts |

### Supporting

| Library                         | Version         | Purpose                                  | When to Use                                                                      |
| ------------------------------- | --------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `createMockProvider()`          | local           | Typed LLMProvider mock factory           | Every test that touches executeRound                                             |
| `vi.fn()`                       | vitest built-in | Mock functions with return value control | Per-test mock.mockResolvedValueOnce() control                                    |
| `vi.useFakeTimers()`            | vitest built-in | Replace setTimeout/setInterval           | retryWithBackoff tests requiring time advancement                                |
| `vi.advanceTimersByTimeAsync()` | vitest built-in | Advance async timers                     | Must use `Async` variant — retryWithBackoff awaits a Promise wrapping setTimeout |

### Alternatives Considered

| Instead of              | Could Use      | Tradeoff                                                                                      |
| ----------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| Exact string assertions | Snapshot tests | Snapshots approved once and never re-read; exact assertions catch character-level regressions |
| `vi.useFakeTimers()`    | Real 30s waits | Fake timers make suite fast; real waits would exceed 30s per test                             |

**Installation:** No new dependencies required. All tooling already installed.

---

## Architecture Patterns

### Recommended Project Structure

Tests colocate with source files per prior decisions:

```
src/
├── ai-rounds/
│   ├── runner.ts
│   ├── runner.test.ts          ← TEST-12: executeRound()
│   ├── validator.ts
│   ├── validator.test.ts       ← TEST-13: validateFileClaims()
│   └── ...
├── context/
│   ├── compressor.ts
│   └── compressor.test.ts     ← TEST-14: compressRoundOutput()
└── renderers/
    ├── utils.ts
    └── utils.test.ts          ← TEST-15: buildTable(), codeRef(), sectionIntro()
```

### Pattern 1: Per-Test Mock Return Value Control

**What:** Each test configures `mockResolvedValueOnce()` on the mock provider's `complete` function. No shared mutable mock state.

**When to use:** All executeRound tests.

**Example:**

```typescript
// Source: src/providers/__mocks__/index.ts + vitest docs
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMockProvider } from '../providers/__mocks__/index.js';
import { executeRound } from './runner.js';

describe('executeRound', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: returns success status with tool_use response', async () => {
    const provider = createMockProvider();
    (provider.complete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        sections: [{ title: 'Overview', content: 'Project description.' }],
        signatures: ['function main(): void'],
      },
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
      model: 'mock',
      duration: 0,
    });

    const result = await executeRound({
      /* options */
    });
    expect(result.status).toBe('success');
  });
});
```

### Pattern 2: Degraded Path — Provider Throws

**What:** Mock provider rejects; executeRound catches and returns `status: 'degraded'` with fallback data. Never throws.

**Example:**

```typescript
it('degraded: provider throw returns fallback data with status degraded', async () => {
  const provider = createMockProvider();
  (provider.complete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
    new Error('API unavailable — check your API key and network connection'),
  );

  const result = await executeRound({ ...options, provider });

  expect(result.status).toBe('degraded');
  // Assert idempotency: same input always produces same degraded structure
  expect(result.validation).toEqual({ validated: 0, corrected: 0, total: 0, dropRate: 0 });
  expect(result.quality.isAcceptable).toBe(false);
});
```

### Pattern 3: Retry via vi.useFakeTimers (retryWithBackoff)

**What:** `retryWithBackoff()` in `src/utils/rate-limiter.ts` uses `setTimeout(resolve, jitter)` internally. The jitter is `baseDelayMs * 2^attempt * (0.5 + Math.random())` with `baseDelayMs=30_000`. First retry delay is 15s–30s (attempt 0: `30000 * 1 * [0.5..1.5]`). Advancing by 30_000ms covers all jitter values.

**Critical:** Must use `vi.advanceTimersByTimeAsync()` (not `vi.advanceTimersByTime()`) because `retryWithBackoff` awaits a Promise that resolves inside the setTimeout callback.

**Example:**

```typescript
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { retryWithBackoff } from '../utils/rate-limiter.js';

describe('retryWithBackoff with fake timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries once after 30s backoff then succeeds', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw Object.assign(new Error('rate limited'), { status: 429 });
      return 'ok';
    });

    const promise = retryWithBackoff(fn, { maxRetries: 1, baseDelayMs: 30_000 });
    // Advance past the jitter window (max = 30000 * 1.5 = 45000ms)
    await vi.advanceTimersByTimeAsync(45_000);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

**Note on TEST-12 scope:** The retry path in `executeRound()` itself (high dropRate > 0.3 or quality failure) does NOT use timers — it's a direct recursive call to `attempt(true)`. Testing this retry path in executeRound tests only requires controlling mock return values, not fake timers. `vi.useFakeTimers()` is only needed when testing `retryWithBackoff()` directly.

### Pattern 4: validateFileClaims with Fixture StaticAnalysisResult

**What:** Build minimal `StaticAnalysisResult` fixtures with just the fields `validateFileClaims` needs: `analysis.fileTree.directoryTree` with file entries. The `StaticAnalysisResult` type is large; build a partial fixture using TypeScript's `as unknown as StaticAnalysisResult` or construct just the minimum fields the function accesses.

**Example:**

```typescript
import type { StaticAnalysisResult } from '../analyzers/types.js';
import { validateFileClaims } from './validator.js';

function mkAnalysis(filePaths: string[]): StaticAnalysisResult {
  return {
    fileTree: {
      totalFiles: filePaths.length,
      totalDirs: 0,
      totalLines: 0,
      totalSize: 0,
      filesByExtension: {},
      largestFiles: [],
      directoryTree: filePaths.map((path) => ({ path, type: 'file' as const, size: 0, lines: 0 })),
    },
    // Remaining fields zeroed/empty — validateFileClaims only uses fileTree.directoryTree
    ast: {
      files: [],
      summary: {
        totalFunctions: 0,
        totalClasses: 0,
        totalExports: 0,
        totalImports: 0,
        languageBreakdown: {},
      },
    },
    dependencies: { manifests: [], warnings: [] },
    gitHistory: {
      isGitRepo: false,
      branchPattern: {
        strategy: 'unknown',
        evidence: [],
        activeBranches: [],
        staleBranches: [],
        defaultBranch: 'main',
        branchCount: 0,
      },
      recentCommits: [],
      mostChangedFiles: [],
      activityByMonth: {},
      contributors: [],
      fileOwnership: [],
      warnings: [],
    },
    todos: { items: [], summary: { total: 0, byCategory: {} } },
    env: { envFiles: [], envReferences: [], warnings: [] },
    tests: {
      testFiles: [],
      frameworks: [],
      hasConfig: false,
      configFiles: [],
      coverageDataPath: null,
      summary: { totalTestFiles: 0, totalTests: 0, frameworksDetected: [] },
    },
    docs: {
      readmes: [],
      docsFolder: null,
      docFiles: [],
      inlineDocCoverage: { filesWithDocs: 0, totalFiles: 0, percentage: 0 },
      summary: { hasReadme: false, hasDocsFolder: false, docFileCount: 0, inlineDocPercentage: 0 },
    },
    metadata: {
      analyzedAt: '2026-01-01',
      rootDir: '/tmp',
      fileCount: filePaths.length,
      elapsed: 0,
    },
  } as StaticAnalysisResult;
}

it('drops claims for non-existent paths', () => {
  const analysis = mkAnalysis(['src/foo.ts', 'src/bar.ts']);
  const result = validateFileClaims(['src/foo.ts', 'src/missing.ts'], analysis);
  expect(result.valid).toEqual(['src/foo.ts']);
  expect(result.dropped).toEqual(['src/missing.ts']);
});

it('drop rate above 30% triggers retry path (tested via executeRound integration)', () => {
  // validateFileClaims itself doesn't enforce 30% — executeRound does at line 80
  // Test the threshold boundary: 2/3 dropped = 67% drop rate
  const analysis = mkAnalysis(['src/real.ts']);
  const result = validateFileClaims(['src/real.ts', 'src/fake1.ts', 'src/fake2.ts'], analysis);
  expect(result.dropped.length / (result.valid.length + result.dropped.length)).toBeGreaterThan(
    0.3,
  );
});
```

### Pattern 5: compressRoundOutput with Fixture Round Outputs

**What:** `compressRoundOutput` is a pure function — no mocking needed. Feed fixture `Record<string, unknown>` objects and assert returned `RoundContext` fields and token counts.

**Example:**

```typescript
import { compressRoundOutput } from './compressor.js';

const charTokens = (text: string): number => text.length; // deterministic estimator

it('extracts modules and findings from round output', () => {
  const output = {
    modules: [{ name: 'auth' }, { name: 'api' }],
    findings: ['Uses JWT tokens', 'REST endpoints'],
  };

  const ctx = compressRoundOutput(1, output, 2000, charTokens);

  expect(ctx.roundNumber).toBe(1);
  expect(ctx.modules).toEqual(['auth', 'api']);
  expect(ctx.findings).toEqual(['Uses JWT tokens', 'REST endpoints']);
  expect(ctx.tokenCount).toBeGreaterThan(0);
});

it('enforces token budget by truncating open questions first', () => {
  const output = {
    findings: ['finding 1'],
    openQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'],
  };

  // Very tight budget forces truncation
  const ctx = compressRoundOutput(1, output, 50, charTokens);

  // open questions trimmed first; findings kept (min 1 rule)
  expect(ctx.findings.length).toBeGreaterThan(0);
  expect(ctx.openQuestions.length).toBeLessThan(5);
});
```

### Pattern 6: Renderer Utility Exact String Assertions

**What:** `buildTable()`, `codeRef()`, `sectionIntro()` are pure string functions. No mocking. Assert exact output strings.

**Example:**

```typescript
import { buildTable, codeRef, sectionIntro } from './utils.js';

// buildTable
it('single row table: correct structure', () => {
  const result = buildTable(['Name', 'Type'], [['foo', 'string']]);
  expect(result).toBe('| Name | Type |\n| --- | --- |\n| foo | string |');
});

it('buildTable: pipe characters in content are escaped', () => {
  const result = buildTable(['Cmd'], [['a | b']]);
  expect(result).toContain('a \\| b');
});

it('buildTable: empty rows returns only header and separator', () => {
  const result = buildTable(['A', 'B'], []);
  expect(result).toBe('| A | B |\n| --- | --- |');
});

// codeRef
it('codeRef: file without line', () => {
  expect(codeRef('src/foo.ts')).toBe('`src/foo.ts`');
});

it('codeRef: file with line number', () => {
  expect(codeRef('src/foo.ts', 42)).toBe('`src/foo.ts:L42`');
});

it('codeRef: normalizes leading ./', () => {
  expect(codeRef('./src/bar.ts')).toBe('`src/bar.ts`');
});

it('codeRef: normalizes leading /', () => {
  expect(codeRef('/src/bar.ts')).toBe('`src/bar.ts`');
});

// sectionIntro
it('sectionIntro: returns text with trailing newline', () => {
  expect(sectionIntro('Hello world')).toBe('Hello world\n');
});

it('sectionIntro: preserves special characters', () => {
  const text = 'Uses `async/await` for I/O';
  expect(sectionIntro(text)).toBe('Uses `async/await` for I/O\n');
});
```

### Anti-Patterns to Avoid

- **Shared mock state:** Never call `createMockProvider()` once and mutate `complete.mockReturnValue` in multiple tests. Create a fresh mock per test.
- **vi.advanceTimersByTime() (sync):** The synchronous version does not flush Promise microtasks. Use `vi.advanceTimersByTimeAsync()` for async timers.
- **Testing at wrong layer for timers:** Do not add `vi.useFakeTimers()` to executeRound tests — the round-level retry is a direct function call, not time-based. Fake timers belong in retryWithBackoff-specific tests.
- **Asserting logger output:** The logger calls inside executeRound's catch block don't need to be asserted — they are fire-and-forget side effects. Assert observable outputs (result fields) instead.
- **Snapshot tests for renderer output:** Snapshots get approved once and then silently pass. Use `toBe()` or `toContain()` for string primitives.

---

## Don't Hand-Roll

| Problem                      | Don't Build             | Use Instead                                                    | Why                                                                   |
| ---------------------------- | ----------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Typed LLM provider mock      | Custom mock class       | `createMockProvider()` from `src/providers/__mocks__/index.ts` | Already implements `LLMProvider` interface with correct cast patterns |
| Time control in async tests  | Manual Promise wrappers | `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()`         | Handles Promise chains inside setTimeout correctly                    |
| Coverage enforcement         | Custom CI script        | `coverage.thresholds.global` in vitest.config.ts               | Vitest fails the run when threshold not met                           |
| StaticAnalysisResult fixture | Dynamic builder helper  | Inline object with `as StaticAnalysisResult` cast              | The type is a plain Zod-inferred object; no factory class needed      |

**Key insight:** The mock provider factory already handles the hardest part — casting `vi.fn()` to the generic `LLMProvider['complete']` type via `as unknown as CompleteFn`. Reuse it; don't fight TypeScript's generic inference.

---

## Common Pitfalls

### Pitfall 1: Using vi.advanceTimersByTime (sync) Instead of Async

**What goes wrong:** The test advances time but the retry never completes. The awaited Promise resolves after the test ends with a confusing timeout or assertion failure.

**Why it happens:** `retryWithBackoff` uses `await new Promise<void>((resolve) => setTimeout(resolve, jitter))`. The Promise's `.then` callback is a microtask that `advanceTimersByTime` (sync) does not flush.

**How to avoid:** Always use `await vi.advanceTimersByTimeAsync(ms)` when the code under test awaits a setTimeout-wrapped Promise.

**Warning signs:** Test hangs until vitest's own timeout; or timer assertions pass but the function result is never checked.

### Pitfall 2: Forgetting vi.useRealTimers() in afterEach

**What goes wrong:** Fake timers leak into subsequent tests in the same file, causing unrelated tests to hang or behave non-deterministically.

**How to avoid:**

```typescript
afterEach(() => {
  vi.useRealTimers();
});
```

### Pitfall 3: Coverage Threshold Placement

**What goes wrong:** `coverage.thresholds.lines: 80` (top-level) vs `coverage.thresholds.global` — Vitest's API for global thresholds uses the `global` sub-key.

**How to avoid:** Per Context7 docs, the correct configuration is:

```typescript
coverage: {
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
  },
}
```

Note: The `global` sub-key exists in some versions but the flat form (`thresholds.lines`) is the canonical API in vitest v4.x. Verify against current vitest.config.ts exclusion list before adding thresholds.

### Pitfall 4: Fixture StaticAnalysisResult Missing Required Fields

**What goes wrong:** TypeScript complains about missing fields on the fixture at compile time, even when the function under test only uses a subset of fields.

**How to avoid:** Build the full required shape — `StaticAnalysisResult` is a Zod schema inference so all fields are required. The `mkAnalysis()` helper pattern (shown in Code Examples) populates all fields with zeros/empty arrays. Do not use `Partial<StaticAnalysisResult>` — it won't satisfy the typed function parameter.

### Pitfall 5: executeRound Retry is Not Timer-Dependent

**What goes wrong:** Developer adds `vi.useFakeTimers()` to executeRound retry test (high dropRate path), expects to need to advance timers, and test fails because the mock provider throws before any timer is set.

**Why it happens:** The executeRound retry at lines 80-83 of `runner.ts` calls `attempt(true)` directly — no setTimeout involved. The 30s backoff lives in `BaseProvider.complete()` which is bypassed when mocking at the `LLMProvider` interface level.

**How to avoid:** Only use fake timers when testing `retryWithBackoff()` from `src/utils/rate-limiter.ts` directly. executeRound retry tests only need `mockResolvedValueOnce` chaining.

### Pitfall 6: Mock Return Value Structure Missing model/duration

**What goes wrong:** `provider.complete` returns `{ data: {}, usage: {...} }` without `model` and `duration` fields. `executeRound` calls `tracker.recordRound()` with `result.usage` — if usage fields are undefined, tracking breaks.

**How to avoid:** Per Phase 8 prior decisions, `createMockProvider()`'s default complete return includes `model: 'mock'` and `duration: 0`. When overriding with `mockResolvedValueOnce`, include both:

```typescript
mockResolvedValueOnce({
  data: { ... },
  usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
  model: 'mock',
  duration: 0,
});
```

---

## Code Examples

Verified patterns from official sources and codebase analysis:

### Coverage Threshold Configuration (vitest.config.ts)

```typescript
// Source: Context7 /vitest-dev/vitest + existing vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/types.ts',
        'src/domain/schemas.ts',
        'src/cli/index.ts',
        'src/grammars/downloader.ts',
        'src/parsing/**',
        'src/config/defaults.ts',
      ],
      // Add after Phase 11 test suite is real:
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

### createMockProvider Extension Pattern

```typescript
// Source: src/providers/__mocks__/index.ts
import { vi } from 'vitest';
import { createMockProvider } from '../providers/__mocks__/index.js';

// Per-test: create fresh mock and override once
const provider = createMockProvider();
const completeFn = provider.complete as ReturnType<typeof vi.fn>;
completeFn.mockResolvedValueOnce({
  data: { sections: [{ title: 'Test', content: 'body' }] },
  usage: { inputTokens: 500, outputTokens: 100, cacheReadTokens: 0, cacheCreationTokens: 0 },
  model: 'mock',
  duration: 10,
});
```

### Minimal TokenUsageTracker for executeRound

`executeRound` requires a real `TokenUsageTracker` instance (not a mock) because it calls `tracker.recordRound()`, `tracker.getRoundCost()`, and `tracker.getRoundUsage()`. Import and instantiate it directly:

```typescript
import { TokenUsageTracker } from '../context/tracker.js';

const tracker = new TokenUsageTracker();
```

### buildTable Edge Cases

```typescript
// Empty rows
buildTable(['A'], []);
// => '| A |\n| --- |'

// Special chars
buildTable(['Cmd'], [['git | push']]);
// => '| Cmd |\n| --- |\n| git \\| push |'

// Multiple rows
buildTable(
  ['K', 'V'],
  [
    ['a', '1'],
    ['b', '2'],
  ],
);
// => '| K | V |\n| --- | --- |\n| a | 1 |\n| b | 2 |'
```

### vi.useFakeTimers + advanceTimersByTimeAsync Pattern

```typescript
// Source: Context7 /vitest-dev/vitest docs
import { beforeEach, afterEach, it, expect, vi } from 'vitest';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    let calls = 0;
    const fn = async () => {
      if (++calls === 1) throw Object.assign(new Error('rate limited'), { status: 429 });
      return 'result';
    };

    const promise = retryWithBackoff(fn, { maxRetries: 1, baseDelayMs: 30_000 });
    // Max jitter = 30000 * 2^0 * 1.5 = 45000ms
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await promise).toBe('result');
    expect(calls).toBe(2);
  });
});
```

---

## State of the Art

| Old Approach                       | Current Approach                        | When Changed     | Impact                                                      |
| ---------------------------------- | --------------------------------------- | ---------------- | ----------------------------------------------------------- |
| `vi.advanceTimersByTime()` (sync)  | `vi.advanceTimersByTimeAsync()`         | Vitest v1.x      | Async variant flushes Promise microtasks in timer callbacks |
| Snapshot tests for string output   | Exact `toBe()`/`toContain()` assertions | Project decision | Snapshots silently pass after initial approval              |
| `coverage.thresholds.global.lines` | `coverage.thresholds.lines`             | Vitest v1.x      | Flat key is the current API; `global` sub-key was removed   |

---

## Open Questions

1. **What exact ms value to use for vi.advanceTimersByTimeAsync() in retry tests?**
   - What we know: `baseDelayMs=30_000`, `attempt=0`, jitter = `delay * (0.5 + Math.random())`, max jitter = 45_000ms
   - What's unclear: Math.random() is mocked by fake timers? No — vi.useFakeTimers() does not mock Math.random by default
   - Recommendation: Use 45_000ms (covers max possible jitter). Alternatively, stub `Math.random` to return 0 (jitter = 0.5 \* 30000 = 15000ms) for determinism. Discretion for planner.

2. **Current coverage baseline: 10.64% total**
   - What we know: Coverage is at ~10.6% with existing tests. `ai-rounds/*`, `renderers/utils.ts`, `context/compressor.ts` are all at 0%.
   - What's unclear: Adding tests for just these files — will that hit 80%? The denominator excludes `src/parsing/**`, `src/grammars/downloader.ts`, `src/cli/index.ts`, `src/domain/schemas.ts`, `src/**/types.ts`, `src/config/defaults.ts`. Many large files (CLI, renderers, UI, providers/anthropic.ts) remain uncovered.
   - Recommendation: The planner should verify that covering the 5 target modules is sufficient for 80% or identify if additional files need tests. Based on the coverage output, the CLI, UI, and most renderers are still at 0% — hitting 80% may require more coverage than just the 5 required modules.

3. **Should retryWithBackoff be tested in runner.test.ts or its own rate-limiter.test.ts?**
   - What we know: TEST-12 scope is executeRound, but the 30s backoff lives in rate-limiter.ts. Testing it as part of executeRound is awkward (would need a real BaseProvider or deep stubbing). Testing it directly in rate-limiter.test.ts is clean.
   - Recommendation: Create `src/utils/rate-limiter.test.ts` for `retryWithBackoff()` tests (vi.useFakeTimers path). executeRound tests test the round-level retry (dropRate > 0.3 path) without fake timers.

---

## Sources

### Primary (HIGH confidence)

- `/vitest-dev/vitest` (Context7) — `vi.useFakeTimers`, `vi.advanceTimersByTimeAsync`, coverage configuration
- `/Users/impera/Documents/GitHub/handover/src/providers/__mocks__/index.ts` — `createMockProvider()` API and cast patterns
- `/Users/impera/Documents/GitHub/handover/src/ai-rounds/runner.ts` — `executeRound()` full implementation
- `/Users/impera/Documents/GitHub/handover/src/ai-rounds/validator.ts` — `validateFileClaims()` full implementation
- `/Users/impera/Documents/GitHub/handover/src/context/compressor.ts` — `compressRoundOutput()` full implementation
- `/Users/impera/Documents/GitHub/handover/src/renderers/utils.ts` — `buildTable()`, `codeRef()`, `sectionIntro()` full implementations
- `/Users/impera/Documents/GitHub/handover/vitest.config.ts` — Current coverage configuration (provider, excludes)
- `/Users/impera/Documents/GitHub/handover/src/utils/rate-limiter.ts` — `retryWithBackoff()` with setTimeout-based jitter

### Secondary (MEDIUM confidence)

- `/Users/impera/Documents/GitHub/handover/src/context/packer.test.ts` — Local factory pattern, `mkBudget()`, `mkScored()`, `charTokens` deterministic estimator
- `/Users/impera/Documents/GitHub/handover/src/context/tracker.test.ts` — `describe/it` structure, `afterEach` cleanup, local factory helper pattern
- Coverage run output — Confirms ai-rounds, renderers/utils, context/compressor all at 0%; total at 10.64%

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — existing stack, no new dependencies
- Architecture: HIGH — code read directly; function signatures and types confirmed
- Pitfalls: HIGH for timer/mock pitfalls (verified from code), MEDIUM for 80% threshold sufficiency (requires runtime verification)

**Research date:** 2026-02-20
**Valid until:** 2026-03-22 (vitest API is stable; codebase patterns are locked)
