---
title: Testing
---

# Testing

handover uses Vitest for unit tests and a small set of stable patterns for mocking providers and filesystem behavior. This guide documents those patterns so new tests are consistent and maintainable.

## Running tests

Run the full unit test suite:

```bash
npm test
```

Run coverage locally:

```bash
npm test -- --coverage
```

Run a single test file:

```bash
npm test -- src/auth/token-store.test.ts
```

## Mock provider pattern

Use `createMockProvider()` from `src/providers/__mocks__/index.ts` for round/provider unit tests.

Why this pattern exists:

- real providers require API keys and network access
- provider constructors can pull in SDK-specific runtime behavior
- unit tests need deterministic, fully isolated provider behavior

The helper returns a type-checked `LLMProvider` shape with `vi.fn()` defaults for `complete`, `estimateTokens`, and `maxContextTokens`.

Example:

```typescript
import { vi } from 'vitest';
import { createMockProvider } from '../providers/__mocks__/index.js';

const provider = createMockProvider();
(provider.complete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
  data: {},
  usage: {
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  },
  model: 'mock',
  duration: 0,
});
```

You can override defaults per test:

```typescript
const provider = createMockProvider({ name: 'custom-mock' });
```

## In-memory filesystem with memfs

Use `memfs` when tests need file I/O without touching the real machine.

Canonical example: `src/auth/token-store.test.ts`.

Pattern:

```typescript
import { vol } from 'memfs';

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

beforeEach(() => {
  vol.reset();
});

vol.fromJSON({
  '/mock-home/.handover/credentials.json': JSON.stringify({ token: 'abc' }),
});
```

This keeps tests fast, isolated, and deterministic.

## Coverage exclusions (FROZEN policy)

Coverage config lives in `vitest.config.ts` under `coverage.exclude`.

Policy rules:

- The exclusion list is **FROZEN** (see `Last frozen: 2026-03-01` comment).
- Every excluded path must include a written justification comment.
- Do not enable `thresholds.autoUpdate`.
- Do not add new exclusions without explicit rationale.

Current thresholds:

- lines: 90%
- functions: 90%
- statements: 90%
- branches: 85%

Common exclusion categories include CLI entrypoints, provider SDK wrappers, semantic search runtime modules, MCP server runtime, and analyzer/pipeline integration surfaces.

Notably, some MCP files are intentionally testable and stay included: `src/mcp/tools.ts`, `src/mcp/errors.ts`, and `src/mcp/http-security.ts`.

## Next steps

- [development](/handover/contributor/development/) for setup and workflow
- [architecture](/handover/contributor/architecture/) for codebase structure and module boundaries
