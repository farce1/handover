# Phase 27: Test Coverage & Infrastructure - Research

**Researched:** 2026-03-01
**Domain:** Vitest coverage configuration, test authoring patterns, GitHub Actions coverage reporting
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Test design philosophy
- Unit-focused with real outputs: isolate units with mocks, but always assert on actual return values/output — not just that mocks were called
- Every test must verify what the code *produces*, not only what it *calls*

#### Test file organization
- Match the existing project convention — do not introduce a new pattern
- Follow whatever colocated/mirror structure the codebase already uses

#### Assertion style
- Use inline snapshots for large/complex outputs (rendered markdown, packed context, serialized structures)
- Use explicit value assertions for simple/scalar values
- Snapshots serve as living documentation of expected output shapes

### Claude's Discretion
- Mock depth per module — choose shallow mocks vs boundary mocks based on what's practical for each target (auth, mcp/tools, etc.)
- Exclusion documentation format and level of detail per entry
- CI coverage reporting — PR comment format and failure presentation
- Threshold progression strategy — how to validate and gate each batch step (80→85→88→90)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

The 80% coverage gate is currently failing (lines: 78.85%, funcs: 79.9%, branches: 67.77%, stmts: 79.06%). The failure stems from 7 files that belong in the exclusion list but are absent from it — each is a 0% coverage file with a clear integration-only reason analogous to existing exclusions. Adding those 7 files to the exclusion list jumps coverage to approximately 90% lines/funcs/stmts and 77.9% branches without writing a single new test. The remaining gap to 85% branches is bridgeable by writing tests for `renderers/utils`, `config/schema`, `context/packer`, `auth/pkce-login`, `auth/resolve`, and `mcp/tools` — the six modules called out in the requirements.

The existing test files already present for all six target modules (they were partially written in earlier phases). The task is not to create them from scratch but to expand them to cover their remaining uncovered lines. All six targets follow the established project patterns: colocated test files, `vi.hoisted()` mocks for module boundaries, `vi.fn()` for injected dependencies, and explicit value assertions. The `mcp/tools` module exposes `createRegenerationToolHandlers` as a pure function that is the ideal unit-test surface — it takes an injected manager interface and returns handlers, requiring only a minimal mock object.

The json-summary reporter must be added to `vitest.config.ts` to produce `coverage/coverage-summary.json`. A GitHub Actions coverage comment can be added using `davelosert/vitest-coverage-report-action`, which reads `coverage-summary.json` directly. The CI workflow's `permissions` key must be updated to include `pull-requests: write` for the comment to land.

**Primary recommendation:** Freeze exclusions first (plan 27-01), verify the 80% gate passes, then expand existing test files module by module (plans 27-02 and 27-03), and raise thresholds manually in batches (plan 27-04).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.0.18 | Test runner and coverage orchestration | Already installed and in use project-wide |
| @vitest/coverage-v8 | 4.0.18 | V8 coverage provider | Already installed; consistent with existing `provider: 'v8'` config |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest-mock-extended | 3.1.0 | Typed interface mocks | Already installed; useful for `RegenerationJobManager` mock in `mcp/tools` tests |
| davelosert/vitest-coverage-report-action | latest | GitHub Actions PR coverage comment | Add to CI workflow for coverage visibility on PRs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| davelosert/vitest-coverage-report-action | codecov (already in CI) | Codecov requires a token secret and posts to its dashboard; the action posts a direct inline PR comment from `json-summary` with no external service needed |
| Manual threshold bumps | `thresholds.autoUpdate` | Decision is locked: do NOT use `autoUpdate` due to vitest#9227 which strips newlines on config rewrite |

**Installation:** No new packages needed. `davelosert/vitest-coverage-report-action` is a GitHub Actions step, not an npm package.

---

## Architecture Patterns

### Recommended Project Structure

Tests are colocated with source files — this is the existing convention:

```
src/
├── auth/
│   ├── pkce-login.ts
│   ├── pkce-login.test.ts   ← expand existing
│   ├── resolve.ts
│   └── resolve.test.ts      ← expand existing
├── config/
│   ├── schema.ts
│   └── schema.test.ts       ← expand existing
├── context/
│   ├── packer.ts
│   └── packer.test.ts       ← expand existing
├── mcp/
│   ├── tools.ts
│   └── tools.test.ts        ← expand existing (currently absent, create new)
└── renderers/
    ├── utils.ts
    └── utils.test.ts        ← expand existing
```

No new pattern is introduced. All test files go next to their source file.

### Pattern 1: vi.hoisted() Module Mock
**What:** Hoist mock variables to top-level so they are accessible inside `vi.mock()` factory functions.
**When to use:** Any test that must mock an imported module (auth, openid-client, @clack/prompts, etc.)
**Example (from existing `resolve.test.ts`):**
```typescript
// Source: src/auth/resolve.test.ts (existing convention)
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({ logger: mockLogger }));
```

### Pattern 2: Injected Dependency Mock (shallow object)
**What:** Create a plain object that satisfies the interface, using `vi.fn()` for each method.
**When to use:** When the unit under test accepts an interface as a parameter (not an import).
**Example (from existing `resolve.test.ts`):**
```typescript
// Source: src/auth/resolve.test.ts (existing convention)
function createMockStore(credential: StoredCredential | null = null) {
  return {
    read: vi.fn(async () => credential),
    write: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  };
}
```

### Pattern 3: Explicit Value Assertions (never just mock call assertions)
**What:** After calling the unit under test, assert on the return value/side-effect output.
**When to use:** All tests — this is the locked decision. Never write a test that ONLY checks `expect(mock.fn).toHaveBeenCalled()`.
**Example:**
```typescript
// Source: src/auth/resolve.test.ts (existing convention)
const result = await resolveAuth(config, 'cli-key-123', store);
expect(result).toEqual({ apiKey: 'cli-key-123', source: 'cli-flag' });  // ← value assertion
expect(store.read).not.toHaveBeenCalled();  // ← secondary, not the only assertion
```

### Pattern 4: Inline Snapshots for Complex Output
**What:** `expect(result).toMatchInlineSnapshot(...)` for rendered markdown, packed contexts, serialized structures.
**When to use:** `buildSummaryLine` output, packed context metadata, complex schema validation error messages.
**Example:**
```typescript
// For buildSummaryLine (renderers/utils.ts) — output contains dynamic content
const ctx = makeMinimalRenderContext({ projectName: 'TestProject' });
expect(buildSummaryLine(ctx, 'overview')).toMatchInlineSnapshot(`
  "TestProject is a .ts project with 10 files. It was analyzed on 2026-01-01."
`);
```

### Anti-Patterns to Avoid
- **Raising thresholds before tests pass:** Only bump thresholds after confirmed passage. The batch strategy (80→85→88→90) must gate on passing, not speculation.
- **thresholds.autoUpdate:** Locked decision — do NOT set this. vitest#9227 strips newlines from the config file on every update.
- **Adding exclusions without justification comments:** Each exclusion must have a comment in `vitest.config.ts` explaining WHY it is excluded.
- **Excluding to reach thresholds:** Only exclude files with a legitimate reason (integration-only, real SDK/network required, CLI commands, re-exports). Do NOT exclude to game the number.
- **Mock-call-only tests:** Tests that only assert `expect(mock).toHaveBeenCalled()` with no output assertion fail the locked design philosophy.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PR coverage comments | Custom GitHub Actions script parsing lcov | `davelosert/vitest-coverage-report-action` | Reads `coverage-summary.json` directly; handles PR comment create/update lifecycle |
| Type-safe interface mocks | Manual factory functions | `vitest-mock-extended` (already installed) | Auto-generates all interface methods as `vi.fn()` — useful for `RegenerationJobManager` |
| Coverage threshold enforcement | Custom CI scripts | vitest's built-in `thresholds` config | Already wired; just update numeric values |

**Key insight:** Vitest 4.x natively provides everything needed. The work is configuration (exclusions, thresholds, reporters) and test writing — not infrastructure.

---

## Common Pitfalls

### Pitfall 1: The 80% gate fails before you can raise it
**What goes wrong:** CI fails the moment coverage runs. You cannot raise thresholds until the gate passes.
**Why it happens:** 7 files with 0% coverage that should be excluded are included in the measurement.
**How to avoid:** Step 1 of plan 27-01 is exclusively: add missing exclusions with justification comments. Then verify `npm test -- --coverage` passes. Only then proceed.
**Warning signs:** Any attempt to run `npm test -- --coverage` without fixing exclusions first will fail with 4 ERRORs.

### Pitfall 2: Exclusion-creep fake 90%
**What goes wrong:** Adding too many exclusions inflates apparent coverage without adding real tests.
**Why it happens:** It's easier to exclude than to test.
**How to avoid:** Only the 7 files listed below are legitimate exclusions. All other files in the coverage table have existing or needed tests.
**Warning signs:** The exclusion list grows beyond the 7 identified files in 27-01 without a clearly documented integration-only reason.

### Pitfall 3: Branch coverage stays below 85%
**What goes wrong:** After exclusions, lines/funcs/stmts hit ~90% but branches stay at ~78%.
**Why it happens:** Branches require testing alternate paths: null vs non-null, different switch cases, error paths.
**How to avoid:** Each new test batch must specifically target uncovered branches. Key targets: `auth/pkce-login.ts` (50% branches — test `isFutureIsoTimestamp`, `asNonEmptyString`, `parseExpiresIn` edge cases), `config/schema.ts` (50% branches — test the `superRefine` local-only embedding validation), `renderers/utils.ts` (58% branches — test all `buildSummaryLine` switch cases).
**Warning signs:** Tests that only cover the happy path. Each module section should have at least one test for the failure/alternate path.

### Pitfall 4: mcp/tools tests requiring real McpServer
**What goes wrong:** Attempting to test `registerMcpTools` by constructing a real `McpServer` creates massive integration complexity.
**Why it happens:** `registerMcpTools` calls `server.registerTool()` which has complex internal state.
**How to avoid:** Test `createRegenerationToolHandlers` in isolation — it returns plain async handler functions that take an `unknown` input and return a structured payload. Pass a mock `RegenerationJobManager`. No `McpServer` needed. The error helper functions (`createInvalidInputError`, `createQaInvalidInputError`, etc.) can also be tested by calling the handlers with invalid input.
**Warning signs:** Any test file that imports `@modelcontextprotocol/sdk/server/mcp.js` directly for the purpose of unit testing handlers.

### Pitfall 5: Inline snapshot drift
**What goes wrong:** Snapshots become stale after code changes and tests fail with diff output.
**Why it happens:** Inline snapshots are authoritative documentation — they fail intentionally when output changes.
**How to avoid:** Run `npx vitest --update-snapshots` when intentional output changes occur. Never delete the snapshot content without updating it.
**Warning signs:** A test is commented out or skipped "because the snapshot needs updating."

---

## Code Examples

Verified patterns from the existing codebase:

### Exclusion Entry Format (with justification comment)
```typescript
// Source: src/vitest.config.ts (existing pattern to extend)

// Provider SDK wrappers — require real SDKs / network
'src/providers/anthropic.ts',
'src/providers/gemini.ts',          // ← add: zero-API-key-testable surface (same as anthropic.ts)

// Semantic search and MCP runtime surfaces — integration-only
'src/vector/embedder.ts',
'src/vector/gemini-embedder.ts',    // ← add: requires Google GenAI SDK / network

// CLI entry point and commands — integration-only (require full pipeline)
'src/cli/index.ts',
'src/cli/onboarding.ts',            // ← add: interactive TTY flow, no unit boundary
'src/cli/auth/index.ts',            // ← add: commander wiring, integration-only
'src/cli/auth/login.ts',            // ← add: browser OAuth flow, integration-only
'src/cli/auth/status.ts',           // ← add: filesystem + credential display, integration-only

// Auth barrel re-export — no executable logic
'src/auth/index.ts',                // ← add: pure re-exports, zero executable lines
```

### json-summary Reporter Addition
```typescript
// Source: vitest.config.ts — update reporter array
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov', 'json-summary'],  // add 'json-summary'
  // ... rest of config unchanged
}
```

### GitHub Actions Coverage Comment Step
```yaml
# Source: .github/workflows/ci.yml — add after existing upload step
- name: Coverage report
  if: matrix.node-version == 20
  uses: davelosert/vitest-coverage-report-action@v2
  with:
    json-summary-path: ./coverage/coverage-summary.json
    json-summary-compare-path: ./coverage/coverage-summary.json
```

The CI `permissions` key also needs updating:
```yaml
# Source: .github/workflows/ci.yml (quality job level or top level)
permissions:
  contents: read
  pull-requests: write    # needed for PR comment
```

### buildSummaryLine Test Fixture (RenderContext)
```typescript
// Minimal RenderContext for renderers/utils.test.ts
function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    projectName: 'TestProject',
    generatedAt: '2026-01-01T00:00:00Z',
    audience: 'human',
    rounds: {},
    config: HandoverConfigSchema.parse({}),
    staticAnalysis: {
      metadata: { analyzedAt: '2026-01-01', rootDir: '/tmp', fileCount: 10, elapsed: 0 },
      fileTree: { filesByExtension: { '.ts': 8, '.json': 2 }, /* ... minimal */ },
      dependencies: { manifests: [] },
      tests: { summary: { totalTestFiles: 5, totalTests: 20 }, frameworks: ['vitest'] },
      // ... other fields as needed
    } as StaticAnalysisResult,
    ...overrides,
  };
}
```

### createRegenerationToolHandlers Unit Test Pattern
```typescript
// Source: pattern inferred from src/mcp/tools.ts exported interface
import { createRegenerationToolHandlers } from './tools.js';
import type { RegenerationJobManager } from '../regeneration/job-manager.js';

function createMockManager(): RegenerationJobManager {
  return {
    trigger: vi.fn(),
    getStatus: vi.fn(),
  };
}

test('handleRegenerateDocs returns error payload for invalid input', async () => {
  const manager = createMockManager();
  const { handleRegenerateDocs } = createRegenerationToolHandlers({ manager });

  const result = await handleRegenerateDocs({ target: 123 }); // invalid: not a string

  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text)).toMatchObject({
    ok: false,
    error: { code: 'REGENERATION_INVALID_INPUT' },
  });
});

test('handleRegenerateDocs returns success payload for valid trigger', async () => {
  const manager = createMockManager();
  const now = new Date().toISOString();
  (manager.trigger as ReturnType<typeof vi.fn>).mockReturnValue({
    ok: true,
    job: {
      id: 'job-123',
      state: 'queued',
      target: { key: 'all', requested: 'all', canonical: 'all' },
      createdAt: now,
      updatedAt: now,
    },
    dedupe: { joined: false, key: 'all', reason: 'none' },
    guidance: { message: 'Poll for status', nextTool: 'regenerate_docs_status', pollAfterMs: 750 },
  });

  const { handleRegenerateDocs } = createRegenerationToolHandlers({ manager });
  const result = await handleRegenerateDocs({ target: 'all' });

  expect(result.isError).toBeUndefined();
  const payload = JSON.parse(result.content[0].text);
  expect(payload.ok).toBe(true);
  expect(payload.jobId).toBe('job-123');
  expect(payload.state).toBe('queued');
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual coverage scripts | vitest built-in `coverage` config | vitest ≥1.0 | No custom tooling needed |
| `lcov` only as CI reporter | `json-summary` + `lcov` | vitest ≥1.0 | Enables PR comment actions |
| External coverage services (coveralls/codecov) | `davelosert/vitest-coverage-report-action` inline | 2023+ | Direct PR comment without external service account |

**Deprecated/outdated:**
- `thresholds.autoUpdate`: vitest feature that automatically rewrites config file — known bug vitest#9227 strips newlines. Do not use.

---

## Key Findings: Per-Module Analysis

### Files Currently Missing from Exclusion List (Plan 27-01)

These 7 files are at 0% coverage but absent from `vitest.config.ts` exclusions:

| File | Current Coverage | Exclusion Justification |
|------|------------------|------------------------|
| `src/auth/index.ts` | lines: 0%, funcs: 0%, branches: 0% | Pure re-exports only — no executable logic. Pattern mirrors other barrel files |
| `src/cli/onboarding.ts` | 0% | Interactive TTY wizard flow — same category as existing `cli/*.ts` exclusions |
| `src/cli/auth/index.ts` | lines: 0%, funcs: 0%, branches: 100% | Commander command wiring — same category as existing `cli/*.ts` exclusions |
| `src/cli/auth/login.ts` | 0% | Browser OAuth flow triggered by CLI command — integration-only |
| `src/cli/auth/status.ts` | 0% | Credential display with filesystem access — integration-only |
| `src/providers/gemini.ts` | 0% | Requires real Google GenAI SDK + API key. Identical exclusion reason to `providers/anthropic.ts` |
| `src/vector/gemini-embedder.ts` | 0% | Requires Google GenAI SDK + network. Identical exclusion reason to `vector/embedder.ts` |

**Effect of adding these exclusions (measured):**
- Lines: 78.85% → 89.85%
- Functions: 79.9% → 89.53%
- Statements: 79.06% → 89.70%
- Branches: 67.77% → 77.90%

The 80% gate will pass for lines/funcs/stmts after adding these. Branches (77.90%) still falls below 80%, meaning the 80% branches threshold also needs attention before the gate fully passes.

### Target Modules for New Tests (Plans 27-02 and 27-03)

**Plan 27-02 targets (pure-function heavy, easier to test):**

| Module | Lines | Branches | Funcs | Key Uncovered Sections |
|--------|-------|----------|-------|------------------------|
| `renderers/utils.ts` | 62.22% | 58.06% | 66.66% | `buildSummaryLine` (lines 88-123) — all 4 switch cases + default |
| `config/schema.ts` | 75% | 50% | 50% | `superRefine` in `EmbeddingConfigSchema` (lines 24-25) — local embedding validation |
| `context/packer.ts` | 89.87% | 77.63% | 88% | Edge-case marker detection (lines 154-177), greedy section greedy subset (lines 366-398) |

**Plan 27-03 targets (mock-heavy):**

| Module | Lines | Branches | Funcs | Key Uncovered Sections |
|--------|-------|----------|-------|------------------------|
| `auth/pkce-login.ts` | 75% | 50% | 75% | `asNonEmptyString` (L48), `parseExpiresIn` (L54-63), `closeServer` edge cases (L87), headless re-auth path (L291-296) |
| `auth/resolve.ts` | 78.26% | 72.58% | 71.42% | `asNonEmptyString` private (L18), `parseExpiresIn` private (L28-32), `createRefreshConfig` (L36), GOOGLE_API_KEY fallback on non-gemini provider path |
| `mcp/tools.ts` | 0% (currently in `src/mcp/**` exclusion) | 0% | 0% | ALL — needs its own test file; `src/mcp/**` exclusion must be narrowed to NOT exclude `tools.ts` |

**CRITICAL: `mcp/tools.ts` exclusion issue.** The vitest config currently has `'src/mcp/**'` as a blanket exclusion covering all MCP files. Since `mcp/tools.ts` is a target for testing (TEST-02 requirement), the exclusion must be narrowed. Instead of `src/mcp/**`, use specific paths:
```typescript
// Replace broad:
'src/mcp/**',

// With specific:
'src/mcp/server.ts',
'src/mcp/regeneration-executor.ts',
'src/mcp/resources.ts',
'src/mcp/prompts.ts',
'src/mcp/workflow-checkpoints.ts',
'src/mcp/pagination.ts',
'src/mcp/preflight.ts',
// Keep NOT excluded: mcp/tools.ts, mcp/errors.ts, mcp/http-security.ts (already tested)
```

---

## Threshold Progression Strategy (Plan 27-04)

Manual bumps only — no `autoUpdate`. Raise each batch only after `npm test -- --coverage` passes cleanly:

| Step | After Completing | New Thresholds |
|------|-----------------|----------------|
| Base (after 27-01 exclusions) | Gate passes with ~90% lines, ~78% branches | Keep at 80% temporarily |
| After 27-01 complete | 80% gate passes | Raise: `lines: 85, funcs: 85, statements: 85, branches: 80` |
| After 27-02 (pure-function tests) | renderers/utils, config/schema, context/packer tested | Raise: `lines: 88, funcs: 88, statements: 88, branches: 83` |
| After 27-03 (mock-heavy tests) | auth/pkce-login, auth/resolve, mcp/tools tested | Raise: `lines: 90, funcs: 90, statements: 90, branches: 85` |

Branch coverage improves slower than line coverage because each new test adds 5-10 additional branch paths. The final target is 85% branches (as stated in the phase goal), not 90%.

---

## Open Questions

1. **`mcp/tools.ts` — test strategy boundary for QA streaming tools**
   - What we know: `createRegenerationToolHandlers` is a clean pure function injectable boundary. The QA streaming tools (`qa_stream_start`, `qa_stream_resume`, etc.) call `sessionManager` which itself calls the real `answerQuestion` function.
   - What's unclear: Whether the QA session manager can be mocked at the boundary level for `mcp/tools.ts` tests, or whether the QA tools need to be deferred to integration tests.
   - Recommendation: Test `createRegenerationToolHandlers` fully (6 scenarios each handler). For QA streaming tools, test input validation paths (invalid input → structured error) only — these do not require a real session manager. Consider the discretion area: mock depth per module is Claude's choice.

2. **Coverage comment write permissions in CI**
   - What we know: The current CI has `permissions: read-all` at the top level, which denies write access to pull requests.
   - What's unclear: Whether the `davelosert/vitest-coverage-report-action` job needs its own permissions block or a global change.
   - Recommendation: Add a job-level `permissions` override to the quality job: `pull-requests: write`. This is scoped to only that job and uses minimum privilege.

---

## Sources

### Primary (HIGH confidence)
- `/vitest-dev/vitest` (Context7) — coverage thresholds config, json-summary reporter, exclude patterns
- `src/vitest.config.ts` — current exclusion list, threshold values, provider config (direct codebase inspection)
- `coverage/coverage-summary.json` — measured coverage numbers per file (generated from live test run)
- All 6 existing test files (`resolve.test.ts`, `pkce-login.test.ts`, `schema.test.ts`, `packer.test.ts`, `utils.test.ts`, `http-security.test.ts`) — established patterns

### Secondary (MEDIUM confidence)
- `davelosert/vitest-coverage-report-action@v2` — recommended from ecosystem search; widely adopted GitHub Action for vitest coverage PR comments reading `json-summary` format
- vitest#9227 — prior decision record cites this issue; not independently verified but accepted as locked decision

### Tertiary (LOW confidence)
- Branch coverage projection after new tests — estimated from current branch pct per file; actual improvement depends on which specific branches are covered by new tests

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — vitest 4.0.18 and @vitest/coverage-v8 are installed and verified
- Architecture: HIGH — all patterns copied from existing test files in the codebase
- Pitfalls: HIGH — measured from live coverage data; exclusion list gap verified by direct comparison
- Per-module analysis: HIGH — coverage numbers from live `coverage-summary.json`, uncovered lines from `lcov.info`

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable toolchain — vitest config changes infrequently)
