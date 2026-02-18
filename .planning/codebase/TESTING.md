# Testing Patterns

**Analysis Date:** 2026-02-18

## Test Framework

**Runner:**
- Vitest 3.0.0 (imported as `vitest`)
- Config: `vitest.config.ts`
- Globals enabled: `test`, `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll` available without imports

**Assertion Library:**
- Vitest built-in `expect()` — no separate assertion library needed

**Run Commands:**
```bash
npm run test                    # Run all tests (uses vitest run)
HANDOVER_INTEGRATION=1 npx vitest run tests/integration/generate.test.ts --timeout 600000  # Real-world validation
npm run typecheck              # Type checking (separate from tests)
```

## Test File Organization

**Location:**
- Integration tests: `tests/integration/*.test.ts` (separate directory from source)
- No unit tests co-located in `src/` (all tests are integration-level)
- Test utilities: `tests/integration/setup.ts`, `tests/integration/targets.ts`

**Naming:**
- Pattern: `{area}.test.ts` (e.g., `generate.test.ts`, `edge-cases.test.ts`, `monorepo.test.ts`, `performance.test.ts`)
- File paths: absolute paths used throughout (e.g., `CLI_PATH = join(__dirname, '../../dist/index.js')`)

**Structure:**
```
tests/
├── integration/
│   ├── setup.ts                 # Test utilities and fixture management
│   ├── targets.ts               # Validation target definitions
│   ├── generate.test.ts          # Full pipeline tests
│   ├── edge-cases.test.ts        # Edge case handling
│   ├── monorepo.test.ts          # Monorepo support
│   └── performance.test.ts       # Performance tests
```

## Test Structure

**Suite Organization:**

```typescript
// Top-level describe blocks group related tests
describe('empty repository', () => {
  let fixtureDir: string;

  // Setup before each test
  beforeEach(() => {
    fixtureDir = scope.createFixture(`empty-repo-${Date.now()}`, {
      'README.md': '# Empty Project\n\nThis repo has no source code.',
    });
  });

  // Individual test cases
  it('does not crash', () => {
    const result = runCLI(fixtureDir, ['generate', '--static-only']);
    expect(result.exitCode).toBe(0);
  });

  it('produces output directory', () => {
    runCLI(fixtureDir, ['generate', '--static-only']);
    const outputDir = join(fixtureDir, 'handover');
    expect(existsSync(outputDir)).toBe(true);
  });
});
```

**Patterns:**

- **Setup:** `beforeEach()` creates isolated fixtures for each test
- **Teardown:** `afterAll()` cleans up shared scope at end of file
- **Assertions:** `expect(actual).toBe(expected)` — simple equality
- **File existence:** `expect(existsSync(path)).toBe(true)`
- **String matching:** `expect(content).toContain('expected text')`
- **No assertions:** Tests can run CLI without asserting (document generation success = exit code 0)

## Mocking

**Framework:** None used — tests run against real CLI executable

**Approach:**
- **No mocking of filesystem:** Real temporary directories created via `mkdtempSync()`
- **No mocking of subprocess:** CLI runs as real Node.js subprocess via `execFileSync()`
- **No mocking of LLM providers:** `--static-only` flag disables AI rounds to avoid API calls
- **Real fixture creation:** Test utilities create actual files on disk for each test

**Test Doubles:**
- Fixtures created programmatically: empty repos, repos with enormous files, binary-only dirs
- Environment variables overridden: `{ ...process.env, NO_COLOR: '1', ...options?.env }`
- Timeouts configurable: `{ timeout?: 120_000 }` in test options

## Fixtures and Factories

**Test Data:**

```typescript
// From setup.ts - fixture factory with isolated scopes
const scope = createFixtureScope();

beforeEach(() => {
  fixtureDir = scope.createFixture(`empty-repo-${Date.now()}`, {
    'README.md': '# Empty Project\n\nThis repo has no source code.',
  });
});

// Create fixture with normal and enormous files
const normalContent = Array.from({ length: 50 }, (_, i) =>
  `export function handler${i}(): string { return 'ok'; }`,
).join('\n');

const enormousContent = 'x'.repeat(2.1 * 1024 * 1024);

fixtureDir = scope.createFixture(`enormous-file-${Date.now()}`, {
  'normal.ts': normalContent,
  'enormous.js': enormousContent,
});
```

**Location:**
- Fixture utilities in `tests/integration/setup.ts`
- Real-world target definitions in `tests/integration/targets.ts`
- No separate factory files — utilities exported from setup.ts

**Isolation:**
- Each test gets unique temp directory (uses `mkdtempSync()` with Date.now() suffix)
- Scope-based isolation: `createFixtureScope()` returns isolated cleanup function
- Parallel-safe: each test file can run independently

## Coverage

**Requirements:** None enforced — no coverage thresholds in vitest.config.ts

**View Coverage:**
- No coverage command configured
- All tests are integration-level (full CLI execution)
- Success metric: "all 14 docs generated without crashes for each target codebase"

## Test Types

**Unit Tests:**
- Not used in this codebase
- Focus is on integration testing (full CLI pipeline)

**Integration Tests:**
- **Scope:** Run `handover generate` CLI as subprocess against real fixture projects
- **Approach:** Create temporary directories with source files, run CLI, verify output files exist and contain valid content
- **Examples:**
  - Empty repository handling: `tests/integration/edge-cases.test.ts`
  - Enormous file skipping: verifies >2MB files excluded from analysis
  - Real-world validation: clones 5 diverse OSS repos, runs full pipeline (requires `HANDOVER_INTEGRATION=1`)

**E2E Tests:**
- **Framework:** Vitest with real subprocess execution (`execFileSync`)
- **Real-world validation:** `tests/integration/generate.test.ts`
  - Clones actual repos (node, vite, zod, next.js, fastapi)
  - Expects all 14 documents to generate successfully
  - Validates markdown structure and front-matter
  - Gated behind `HANDOVER_INTEGRATION=1` env var (network/cost intensive)

## Common Patterns

**Test Execution:**

```typescript
// Run CLI and capture output
const result = runCLI(fixtureDir, ['generate', '--static-only']);
expect(result.exitCode).toBe(0);
```

**File Assertions:**

```typescript
// Check file exists
const outputDir = join(fixtureDir, 'handover');
expect(existsSync(outputDir)).toBe(true);

// Read and validate content
const content = readFileSync(reportPath, 'utf-8');
expect(content).toContain('# Static Analysis Report');
expect(content).not.toContain('enormous.js');
```

**Fixture Cleanup:**

```typescript
// Scope-based cleanup (safe for parallel tests)
const scope = createFixtureScope();
afterAll(() => {
  scope.cleanup();
});

// Or legacy single cleanup
afterAll(() => {
  cleanupFixtures();
});
```

**CLI Result Structure:**

```typescript
interface RunCLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Typical check
expect(result.exitCode).toBe(0);
if (result.exitCode !== 0) {
  console.error('CLI failed:', result.stderr);
}
```

**Conditional Test Suites:**

```typescript
// Skip expensive tests unless explicitly enabled
const SKIP_REAL_REPOS = !process.env.HANDOVER_INTEGRATION;
describe.skipIf(SKIP_REAL_REPOS)('real-world codebase validation', () => { ... });
```

**Timeout Configuration:**

```typescript
// In vitest.config.ts
testTimeout: 120_000, // 2 minutes for integration tests

// In specific test
beforeAll(() => { ... }, 600_000); // 10 min for cloning repos
```

## Test Data Validation

**Real-World Validation (generate.test.ts):**

```typescript
// All 14 expected documents
const EXPECTED_DOCS = [
  '00-INDEX.md',
  '01-PROJECT-OVERVIEW.md',
  '02-GETTING-STARTED.md',
  '03-ARCHITECTURE.md',
  '04-FILE-STRUCTURE.md',
  '05-FEATURES.md',
  '06-MODULES.md',
  '07-DEPENDENCIES.md',
  '08-ENVIRONMENT.md',
  '09-EDGE-CASES-AND-GOTCHAS.md',
  '10-TECH-DEBT-AND-TODOS.md',
  '11-CONVENTIONS.md',
  '12-TESTING-STRATEGY.md',
  '13-DEPLOYMENT.md',
];

// Validate each document exists and has content
for (const expectedDoc of EXPECTED_DOCS) {
  expect(files).toContain(expectedDoc);
  const content = readFileSync(join(repoDir, 'handover', expectedDoc), 'utf-8');
  expect(content.length).toBeGreaterThan(100);
  expect(content).toMatch(/^---\n/); // YAML front-matter
}
```

## Building Before Testing

**Important Note:** Tests require `npm run build` first

```bash
npm run build              # Compile src/ to dist/
npm run test               # Run tests against dist/
```

Tests execute the compiled CLI from `dist/index.js`, not source TypeScript. The `CLI_PATH` in setup.ts points to the built executable.

---

*Testing analysis: 2026-02-18*
