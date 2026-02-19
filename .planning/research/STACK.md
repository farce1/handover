# Stack Research

**Domain:** Testing Robustness — Unit Testing, Mocking, Input Validation, Dependency Management for a TypeScript CLI (handover-cli v3.0)
**Researched:** 2026-02-19
**Confidence:** HIGH (versions verified via npm registry; Vitest mocking guidance verified via vitest.dev official docs; MSW undici limitation verified via mswjs.io/docs/limitations/; memfs recommendation verified via vitest.dev/guide/mocking/file-system)

---

## Context

This is a **subsequent-milestone research file** for the v3.0 testing/robustness milestone on handover-cli. The existing production stack (TypeScript, Commander.js, tsup, web-tree-sitter, Zod, fast-glob, simple-git, @anthropic-ai/sdk, openai, piscina, gpt-tokenizer, p-limit) is settled and not re-researched here.

Existing test infrastructure already in place:

- `vitest@^3.0.0` — test runner (globals enabled, node environment, 2-minute timeout)
- `@vitest/coverage-v8@^3.2.4` — V8 coverage provider with 80% thresholds configured
- `tests/integration/` — 5 integration test files that shell out to compiled CLI
- Zero unit tests currently — 0% actual coverage against 80% configured thresholds

This file covers **new dev-dependency additions** needed for comprehensive unit testing. Libraries already in `package.json` are noted but not redundantly recommended.

---

## Recommended Stack

### 1. File System Mocking — `memfs`

| Technology | Version   | Purpose                                                            | Why                                                                                                                                                                                                              |
| ---------- | --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memfs`    | `4.56.10` | In-memory file system for mocking `node:fs` and `node:fs/promises` | Explicitly recommended by Vitest official docs; actively maintained (last release Jan 2026); provides `vol.reset()` for per-test isolation; no disk side effects; faster than temp-dir approaches for unit tests |

**Integration pattern** — create `__mocks__/fs.cjs` and `__mocks__/fs/promises.cjs` at project root (required for Vitest's automatic module mock discovery):

```javascript
// __mocks__/fs.cjs
const { fs } = require('memfs');
module.exports = fs;

// __mocks__/fs/promises.cjs
const { fs } = require('memfs');
module.exports = fs.promises;
```

Then in test files:

```typescript
import { vi, beforeEach } from 'vitest';
import { vol } from 'memfs';

vi.mock('node:fs');
vi.mock('node:fs/promises');

beforeEach(() => vol.reset()); // clear between tests

it('reads a config file', () => {
  vol.fromJSON({ '/project/.handover.yml': 'provider: anthropic\n' });
  // test code that uses node:fs will see the in-memory file
});
```

**Scope:** Needed for testing `src/config/loader.ts`, `src/analyzers/file-discovery.ts`, `src/renderers/`, and any code that reads/writes files directly.

**Note on `mock-fs`:** The `mock-fs` package (tschaub/mock-fs) is unmaintained. Do not use it. `memfs` is the actively-maintained replacement.

---

### 2. LLM Provider Mocking — `vi.mock()` (built into Vitest, no new dep)

**Critical finding:** MSW (Mock Service Worker) does NOT work for `@anthropic-ai/sdk` or `openai`. Both SDKs use `undici` for Node.js HTTP requests, which bypasses MSW's `http.ClientRequest`-level interception. The MSW documentation explicitly states: "Libraries like Undici that tap directly into the `node:net` module" are not interceptable.

**The correct approach:** Mock at the provider class boundary using Vitest's built-in `vi.mock()`.

```typescript
// Mocking AnthropicProvider in tests for higher-level components
vi.mock('../providers/anthropic.js', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    complete: vi.fn().mockResolvedValue({
      data: {
        /* fixture data */
      },
      usage: { inputTokens: 100, outputTokens: 50 },
      model: 'claude-opus-4-6',
      duration: 123,
    }),
    estimateTokens: vi.fn().mockReturnValue(100),
    maxContextTokens: vi.fn().mockReturnValue(200_000),
    name: 'anthropic',
  })),
}));
```

```typescript
// Testing AnthropicProvider itself — mock the Anthropic SDK constructor
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            input: {
              /* fixture */
            },
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
        model: 'claude-opus-4-6',
      }),
      stream: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: vi.fn().mockReturnValue({ next: vi.fn() }),
        finalMessage: vi.fn().mockResolvedValue({
          /* fixture */
        }),
      }),
    },
  })),
}));
```

**Why vi.mock over MSW for SDKs:** Both `@anthropic-ai/sdk` and `openai` ship ESM with undici as their HTTP transport. MSW can only intercept `node:http`/`node:https` requests. `vi.mock()` operates at the module import level, replacing the entire module before any test code runs, which is both faster (no network layer overhead) and more reliable.

**Important ESM pattern:** Vitest automatically hoists `vi.mock()` calls to the top of the file, but the factory function must not reference variables declared in the outer scope (use `vi.fn()` inline). For complex fixtures, use `vi.hoisted()`:

```typescript
const mockComplete = vi.hoisted(() => vi.fn());

vi.mock('../providers/anthropic.js', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    complete: mockComplete,
  })),
}));
```

---

### 3. Type-Safe Interface Mocking — `vitest-mock-extended`

| Technology             | Version | Purpose                                                                  | Why                                                                                                                                                                |
| ---------------------- | ------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vitest-mock-extended` | `3.1.0` | Type-safe mock generation for TypeScript interfaces and abstract classes | Vitest's `vi.fn()` loses type information on interfaces; `mock<T>()` generates a full mock satisfying the TypeScript type contract; compatible with Vitest ≥ 3.0.0 |

**When to use:** Testing code that depends on `LLMProvider` interface (`src/providers/base.ts`), `AnalysisContext` type, and any abstract class boundary where `vi.mock()` would produce an untyped stub.

```typescript
import { mock } from 'vitest-mock-extended';
import type { LLMProvider } from '../providers/base.js';

it('orchestrates analysis with provider', async () => {
  const mockProvider = mock<LLMProvider>();
  mockProvider.complete.mockResolvedValue({
    data: {
      /* fixture */
    },
    usage: { inputTokens: 50, outputTokens: 25 },
    model: 'mock-model',
    duration: 10,
  });
  // pass mockProvider to code under test
});
```

**What NOT to use:** `@types/jest-mock-extended` — this is for Jest, not Vitest. The `vitest-mock-extended` fork is purpose-built for Vitest's mock API.

---

### 4. Git Mocking — `vi.mock()` on `simple-git` (no new dep)

`simple-git` exports a factory function `simpleGit()`. Mock it with `vi.mock()`:

```typescript
vi.mock('simple-git', () => ({
  simpleGit: vi.fn().mockReturnValue({
    checkIsRepo: vi.fn().mockResolvedValue(true),
    branch: vi.fn().mockResolvedValue({
      all: ['main', 'feature/foo'],
      current: 'main',
      branches: { main: {}, 'feature/foo': {} },
    }),
    raw: vi.fn().mockResolvedValue(''),
  }),
}));
```

This is simpler and more reliable than trying to create real git repos in temp directories for unit tests (that's the integration test pattern already in use). Use real git repos only in `tests/integration/`; use `vi.mock('simple-git')` in `src/**/*.test.ts`.

---

### 5. Timer/Retry Control — `vi.useFakeTimers()` (built into Vitest, no new dep)

The `BaseProvider` in `src/providers/base-provider.ts` uses `retryWithBackoff` with `baseDelayMs: 30_000`. Testing retry logic without fake timers would require waiting 30+ seconds per test.

```typescript
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('retries on rate limit', async () => {
  const mockDoComplete = vi
    .fn()
    .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
    .mockResolvedValueOnce({ data: fixtures.result, usage: {}, model: 'x', duration: 1 });

  // advance past the 30s backoff without waiting
  const promise = provider.complete(request, schema);
  await vi.advanceTimersByTimeAsync(31_000);
  const result = await promise;

  expect(mockDoComplete).toHaveBeenCalledTimes(2);
});
```

**Use `advanceTimersByTimeAsync`** (not `advanceTimersByTime`) when testing code that mixes timers with Promises — the async variant flushes microtask queues between timer ticks, preventing deadlocks.

---

### 6. Zod Validation Testing — No New Dependencies

Zod's `safeParse()` returns a discriminated union that works cleanly with Vitest assertions. No additional validation testing library is needed.

```typescript
import { HandoverConfigSchema } from '../config/schema.js';

it('rejects invalid provider', () => {
  const result = HandoverConfigSchema.safeParse({ provider: 'invalid-provider' });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues[0].path).toEqual(['provider']);
  }
});

it('applies defaults for missing fields', () => {
  const result = HandoverConfigSchema.safeParse({});
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.provider).toBe('anthropic');
    expect(result.data.output).toBe('./handover');
  }
});
```

This pattern gives full type safety, specific error path assertions, and tests both the happy path and all validation failure modes without extra dependencies.

---

### 7. Dependency Version Management — `npm-check-updates`

| Technology          | Version  | Purpose                                                          | Why                                                                                                                                                                                                                     |
| ------------------- | -------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm-check-updates` | `19.4.0` | Find available dependency upgrades beyond current version ranges | CLI tool (`ncu`) for auditing stale dependencies; doctor mode (`ncu --doctor`) iteratively installs and tests each upgrade to identify breaking changes; installs globally or via `npx`, not as a project devDependency |

**Usage pattern for this project:**

```bash
# Check which dependencies have upgrades available
npx npm-check-updates

# Safe-upgrade: patch versions only
npx npm-check-updates -u --target patch && npm install

# Interactive upgrade (select individual packages)
npx npm-check-updates --interactive

# Doctor mode: auto-test each upgrade
npx npm-check-updates --doctor -u && npm install
```

**Do NOT add as a devDependency** — `ncu` is a developer workflow tool, not a build or test dependency. Use `npx npm-check-updates` on-demand.

---

## Installation

```bash
# New dev dependencies — testing only
npm install -D memfs vitest-mock-extended

# No new production dependencies required
# No MSW, nock, or other HTTP interceptors — use vi.mock() for LLM SDKs
```

---

## Alternatives Considered

| Recommended                    | Alternative                              | When to Use Alternative                                                                   |
| ------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `memfs@4.56.10`                | `mock-fs`                                | Never — `mock-fs` is unmaintained; `memfs` is its replacement                             |
| `memfs@4.56.10`                | `tmp` + real fs                          | For integration tests that need real git repos; unit tests should use memfs               |
| `vi.mock('@anthropic-ai/sdk')` | `msw@2.x`                                | Only if the LLM SDK switched from undici to node:http (unlikely)                          |
| `vi.mock('@anthropic-ai/sdk')` | `nock`                                   | Never for these SDKs — nock also patches `node:http` and won't intercept undici           |
| `vitest-mock-extended@3.1.0`   | Manual `as unknown as LLMProvider` casts | For quick one-off mocks; `vitest-mock-extended` is better when interface has many methods |
| `vi.useFakeTimers()`           | `@sinonjs/fake-timers`                   | Never — Vitest's fake timers wrap sinon internally; adding sinon separately is redundant  |
| `safeParse()` native           | `zod-vitest-matchers`                    | If you need very many zod assertions and want `.toMatchZodSchema()` syntax sugar          |

---

## What NOT to Use

| Avoid                                             | Why                                                                                                                                                       | Use Instead                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `msw` for LLM provider mocking                    | Both `@anthropic-ai/sdk` and `openai` use undici as their HTTP transport; MSW only intercepts `node:http`/`node:https` layer; undici bypasses it entirely | `vi.mock('@anthropic-ai/sdk')` and `vi.mock('openai')`                           |
| `nock` for LLM provider mocking                   | Same undici limitation as MSW; nock patches `node:http` and can't see undici traffic                                                                      | `vi.mock()` at module boundary                                                   |
| `mock-fs`                                         | Unmaintained package (tschaub/mock-fs); last release was years ago                                                                                        | `memfs@4.56.10`                                                                  |
| `jest-mock-extended`                              | Jest-specific; API incompatible with Vitest's mock functions                                                                                              | `vitest-mock-extended@3.1.0`                                                     |
| `@sinonjs/fake-timers` direct                     | Vitest's `vi.useFakeTimers()` wraps sinon internally — adding sinon directly doubles up timer implementations and creates conflicts                       | Built-in `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()`                  |
| `msw` as a general HTTP interceptor in unit tests | Adds 25 MB+ to devDependencies, requires `setupServer()` boilerplate; overkill when `vi.mock()` handles the same case in 3 lines                          | `vi.mock()` for unit tests; MSW only if you have non-undici HTTP clients to mock |
| `supertest`                                       | HTTP integration test library; tests compiled CLI subprocess already handled by existing `tests/integration/`                                             | Existing `runCLI()` helper in `tests/integration/setup.ts`                       |
| Adding `Jest` alongside `Vitest`                  | Two test runners create configuration conflicts, double coverage overhead, and incompatible APIs                                                          | Stay on Vitest exclusively                                                       |

---

## Stack Patterns by Variant

**When testing a function that reads from disk (config loader, file discovery):**

- Use `memfs` + `vi.mock('node:fs')` and `vi.mock('node:fs/promises')`
- Reset `vol` in `beforeEach(() => vol.reset())`

**When testing a function that calls an LLM provider:**

- Mock the provider class: `vi.mock('../providers/anthropic.js', ...)`
- Or inject a `mock<LLMProvider>()` from `vitest-mock-extended` when testing orchestration code

**When testing retry/backoff/timeout behavior:**

- Use `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach`
- Use `vi.advanceTimersByTimeAsync(n)` (not the synchronous variant) to avoid Promise deadlocks

**When testing Zod schema validation:**

- Use `safeParse()` directly — no helper library needed
- Assert `result.success`, `result.data`, and `result.error.issues[0].path`

**When testing git analyzer functions:**

- Use `vi.mock('simple-git')` with a fixture-returning factory
- For branch pattern detection tests, configure `branch()` return value to have specific branch names

**For dependency version auditing:**

- Run `npx npm-check-updates` on-demand as a workflow step, not as a CI check
- Use `npx npm-check-updates --doctor` before milestone starts to identify stale packages

---

## Version Compatibility

| Package                        | Version         | Compatible With                                   | Notes                                                                                               |
| ------------------------------ | --------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `memfs@4.56.10`                | 4.56.10         | Node.js ≥ 18, TypeScript 5.x                      | Ships CJS (lib/index.js); works via `__mocks__/fs.cjs` convention; TypeScript types included        |
| `vitest-mock-extended@3.1.0`   | 3.1.0           | Vitest ≥ 3.0.0, TypeScript 3/4/5                  | Requires `vitest` peer dependency; forked from `jest-mock-extended` with Vitest-compatible API      |
| `vi.useFakeTimers()`           | Vitest built-in | Vitest 3.x                                        | Uses `@sinonjs/fake-timers` internally; use `advanceTimersByTimeAsync` for Promise-safe advancement |
| `vi.mock()` hoisting           | Vitest built-in | ESM (Vitest transforms static imports to dynamic) | Factory function cannot close over outer-scope variables — use `vi.hoisted()` for shared mocks      |
| `memfs` + `vi.mock('node:fs')` | —               | Must use `node:fs` prefix (not bare `fs`)         | Vitest handles both `fs` and `node:fs` aliases but `node:fs` is the canonical ESM import            |

---

## Sources

- [Vitest: File System Mocking](https://vitest.dev/guide/mocking/file-system) — memfs recommendation, `__mocks__` setup pattern, `vol.reset()` pattern — HIGH confidence
- [Vitest: Mocking Requests](https://vitest.dev/guide/mocking/requests) — MSW recommendation for HTTP (confirmed with undici caveat from MSW docs) — HIGH confidence
- [MSW: Limitations](https://mswjs.io/docs/limitations/) — undici bypass of `http.ClientRequest` interception explicitly documented — HIGH confidence
- [MSW GitHub issue #2165](https://github.com/mswjs/msw/issues/2165) — undici interception not supported, confirmed by MSW maintainers — HIGH confidence
- [memfs npm registry](https://www.npmjs.com/package/memfs) — version 4.56.10, TypeScript included — HIGH confidence (last release Jan 2026)
- [memfs GitHub](https://github.com/streamich/memfs) — v4.56.10 confirmed current release — HIGH confidence
- [vitest-mock-extended npm](https://www.npmjs.com/package/vitest-mock-extended) — version 3.1.0, Vitest ≥ 3.0.0 requirement — HIGH confidence
- [msw npm registry](https://registry.npmjs.org/msw/latest) — version 2.12.10 confirmed current — HIGH confidence
- [Vitest: vi.mock() hoisting](https://vitest.dev/guide/mocking/modules) — ESM hoisting mechanics, `vi.hoisted()` API — HIGH confidence
- [Vitest: vi.useFakeTimers()](https://vitest.dev/guide/mocking/timers) — `advanceTimersByTimeAsync` for async-safe timer control — HIGH confidence
- [openai-node GitHub issue #638](https://github.com/openai/openai-node/issues/638) — "No default export defined on mock" error and correct vi.mock pattern — MEDIUM confidence (community report, pattern aligned with official Vitest docs)
- [npm-check-updates npm](https://www.npmjs.com/package/npm-check-updates) — version 19.4.0, Node.js ≥ 20 requirement — HIGH confidence

---

_Stack research for: handover-cli v3.0 Testing and Robustness Milestone_
_Researched: 2026-02-19_
