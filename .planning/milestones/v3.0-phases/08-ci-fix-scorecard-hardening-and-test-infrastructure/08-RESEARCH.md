# Phase 8: CI Fix, Scorecard Hardening, and Test Infrastructure - Research

**Researched:** 2026-02-19
**Domain:** GitHub CI/CD, OpenSSF Scorecard, Vitest test infrastructure
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Branch protection policy

- 1 required reviewer before merging to main
- Dismiss stale reviews when new commits are pushed
- Required status checks: CI (build + test) and typecheck must pass
- Open to external contributors — proper review gates in place

#### CODEOWNERS setup

- Single global owner: `* @farce1`
- Explicit `.github/` rule: `.github/ @farce1` — Scorecard likes explicit CI file ownership
- Two lines total in CODEOWNERS

#### Dependency version policy

- Merge all 5 Dependabot PRs at once (batch merge, CI catches breakage)
- Pin exact versions for 0.x dependencies (e.g., `"0.5.3"` not `"~0.5.0"`)
- Stable (1.x+) deps: auto-merge policy at Claude's discretion

#### Coverage configuration

- No coverage threshold enforced in Phase 8 — infrastructure only, Phase 11 enforces 80%
- No fixture directories expected — tests will use inline data
- WASM files excluded from coverage denominator
- Additional exclusions (config files, types, CLI entry) at Claude's discretion

### Claude's Discretion

- Auto-merge configuration for stable dependency patches
- Coverage exclusion list beyond WASM (config files, type definitions, entry points)
- Mock factory internal design and patterns
- Vitest configuration details

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 8 is a three-task infrastructure phase with no ambiguous technical choices: each deliverable has exactly one correct implementation. The CI failure is a single missing import (`ValidationResult` from `./types.js` in `runner.ts`) confirmed by running `npm run typecheck`. The 5 Dependabot PRs cover both GitHub Actions upgrades (actions/checkout, setup-node, upload-artifact v4→v6) and major npm dependency bumps that include breaking-version 0.x packages. The OpenSSF Scorecard hardening requires precise workflow YAML edits — `permissions: read-all` at workflow top level for all 4 workflow files, SHA pinning for all 16 action `uses:` references, plus GitHub UI/API actions (branch protection, CODEOWNERS, private vulnerability reporting). The test infrastructure deliverable installs memfs and vitest-mock-extended, removes the existing 80% coverage thresholds from vitest config (Phase 11's job), adds exclusion patterns, and creates a typed `createMockProvider()` factory using `vi.fn()`.

The most significant risk in the phase is PR #4 (production-deps): it bumps `@anthropic-ai/sdk` from `0.39.0` to `0.76.0`, `openai` from `5.x` to `6.x`, and `commander` from `13.x` to `14.x`. These are all breaking-version changes. The decision to batch-merge and let CI catch breakage is correct, but the planner must account for the possibility that post-merge CI fails and the runner needs to investigate and fix downstream TypeScript errors before the phase is complete. Auto-merge for Dependabot requires enabling `allow_auto_merge` on the repo (currently `false`) and adding an `automerge.yml` workflow.

**Primary recommendation:** Fix the CI error first (one-line import fix, commit directly to main), then merge Dependabot PRs, then harden Scorecard settings, then install test tooling. This order ensures CI is green before applying the Dependabot changes so failures are attributable to the dep bumps rather than the pre-existing TS error.

---

## Standard Stack

### Core

| Library              | Version                                                 | Purpose                     | Why Standard                                                  |
| -------------------- | ------------------------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| vitest               | ^3.0.0 (current), 4.0.18 available via Dependabot PR #5 | Test runner                 | Already installed; native ESM support; fast                   |
| @vitest/coverage-v8  | ^3.2.4 (current), 4.0.18 via PR #5                      | V8-based coverage           | Already installed; no instrumentation overhead                |
| memfs                | 4.56.10                                                 | In-memory filesystem mock   | Maintained, WASM-safe (not mock-fs which breaks WASM loading) |
| vitest-mock-extended | 3.1.0                                                   | Type-safe interface mocking | Creates fully-typed mocks from TypeScript interfaces          |

### Supporting

| Library               | Version                      | Purpose                  | When to Use                         |
| --------------------- | ---------------------------- | ------------------------ | ----------------------------------- |
| ossf/scorecard-action | v2.4.3 (current in workflow) | OpenSSF Scorecard runner | Already configured in scorecard.yml |

### Alternatives Considered

| Instead of           | Could Use                | Tradeoff                                                                                  |
| -------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| memfs                | mock-fs                  | mock-fs is unmaintained (last release 2023), breaks WASM module loading — locked decision |
| vitest-mock-extended | Manual vi.fn() factories | Manual factories work but lose `calledWith()` argument matchers and type inference        |
| V8 coverage          | Istanbul                 | V8 is already configured; no reason to change                                             |

**Installation (new packages only):**

```bash
npm install --save-dev memfs vitest-mock-extended
```

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
src/
├── providers/
│   └── __mocks__/
│       └── index.ts          # Mock factory: createMockProvider()
├── **/*.test.ts               # Tests colocated with source (Phase 11+)
.github/
├── CODEOWNERS                 # Two-line: * @farce1, .github/ @farce1
├── workflows/
│   ├── ci.yml                 # Add permissions: read-all; pin SHAs; upgrade to v6
│   ├── codeql.yml             # Add permissions: read-all at top; move write to job; pin SHAs
│   ├── release-please.yml     # Add permissions: read-all at top; move writes to job; pin SHAs
│   ├── scorecard.yml          # Add permissions: read-all at top; move writes to job; pin SHAs
│   └── automerge.yml          # New: auto-merge Dependabot patch/minor PRs
```

### Pattern 1: Missing Import Fix (CIDP-01)

**What:** `runner.ts` line 18 uses `ValidationResult` type but the import is missing.
**Verified:** `npm run typecheck` fails with `error TS2304: Cannot find name 'ValidationResult'`.
**Fix:** Add one import line to `src/ai-rounds/runner.ts`.

```typescript
// src/ai-rounds/runner.ts — add this import (line 5, after existing imports)
import type { ValidationResult } from './types.js';
```

`ValidationResult` is exported from `src/ai-rounds/types.ts` at line 43. The import must use `type` qualifier (consistent with all other imports in the file) and the `.js` extension (project uses NodeNext module resolution).

### Pattern 2: Workflow Permissions Structure (SCRD-01)

**What:** OpenSSF Scorecard Token-Permissions check requires `permissions: read-all` at top level and any write permissions declared at the job level.
**Verified:** scorecard.dev documentation confirms this pattern.

```yaml
# Correct structure for ALL 4 workflow files
name: CI

permissions: read-all # <-- TOP LEVEL: read-all locks everything down

on:
  push:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    # No additional permissions needed for read-only jobs
    steps:
      - ...

  # For jobs that need writes, declare at JOB level only:
  deploy:
    permissions:
      contents: write # <-- JOB LEVEL: only the specific write needed
```

**Current state of each workflow:**

- `ci.yml`: No top-level permissions at all — needs `permissions: read-all` added.
- `codeql.yml`: Has `permissions: security-events: write; contents: read` at top level — needs restructuring to `read-all` at top + `security-events: write` at job level.
- `release-please.yml`: Has `permissions: contents: write; issues: write; pull-requests: write` at top level — needs `read-all` at top + write permissions moved to the `release-please` job.
- `scorecard.yml`: Has permissions only at job level (not top level) — needs `permissions: read-all` added at top level, job-level permissions remain as-is.

### Pattern 3: SHA Pinning (SCRD-02)

**What:** All 16 `uses:` action references must be pinned to full 40-character commit SHAs.
**Verified:** SHA values retrieved via `gh api repos/{owner}/{repo}/commits/{tag}`.

**Current SHAs (as of 2026-02-19) for post-Dependabot-merge versions:**

After merging PRs #1, #2, #3 (GitHub Actions v4→v6), the action versions become v6. After merging, pin to these SHAs:

| Action                              | Tag      | SHA                                        |
| ----------------------------------- | -------- | ------------------------------------------ |
| `actions/checkout`                  | `v6`     | `de0fac2e4500dabe0009e67214ff5f5447ce83dd` |
| `actions/setup-node`                | `v6`     | `6044e13b5dc448c55e2357c09f80417699197238` |
| `actions/upload-artifact`           | `v6`     | `b7c566a772e6b6bfb58ed0dc250532a479d7789f` |
| `codecov/codecov-action`            | `v5`     | `671740ac38dd9b0130fbe1cec585b89eea48d3de` |
| `ossf/scorecard-action`             | `v2.4.3` | `4eaacf0543bb3f2c246792bd56e8cdeffafb205a` |
| `github/codeql-action/init`         | `v4`     | `9e907b5e64f6b83e7804b09294d44122997950d6` |
| `github/codeql-action/autobuild`    | `v4`     | `9e907b5e64f6b83e7804b09294d44122997950d6` |
| `github/codeql-action/analyze`      | `v4`     | `9e907b5e64f6b83e7804b09294d44122997950d6` |
| `github/codeql-action/upload-sarif` | `v4`     | `9e907b5e64f6b83e7804b09294d44122997950d6` |
| `googleapis/release-please-action`  | `v4`     | `16a9c90856f42705d54a6fda1823352bdc62cf38` |

Note: All `github/codeql-action` subactions (`/init`, `/autobuild`, `/analyze`, `/upload-sarif`) share the same commit SHA — they are different entry points in the same repository.

**Format for each reference:**

```yaml
# Before:
- uses: actions/checkout@v6

# After:
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
```

Always include the `# vX` comment so the version remains human-readable.

**Action count per workflow (confirms 16 total):**

- `ci.yml`: 5 refs (checkout×2, setup-node×2, codecov-action×1)
- `codeql.yml`: 4 refs (checkout×1, codeql/init×1, codeql/autobuild×1, codeql/analyze×1)
- `release-please.yml`: 3 refs (release-please-action×1, checkout×1, setup-node×1)
- `scorecard.yml`: 4 refs (checkout×1, scorecard-action×1, upload-artifact×1, codeql/upload-sarif×1)

### Pattern 4: Branch Protection via GitHub API (SCRD-03)

**What:** Branch protection must be enabled via GitHub API (not UI) for reproducibility.
**OpenSSF Scorecard Branch-Protection scoring:** The decision yields tier 4 (9/10 points): ≥1 reviewer + dismiss stale reviews + code owner review + required status checks.

```bash
gh api repos/farce1/handover/branches/main/protection \
  --method PUT \
  --field required_pull_request_reviews[dismiss_stale_reviews]=true \
  --field required_pull_request_reviews[require_code_owner_reviews]=true \
  --field required_pull_request_reviews[required_approving_review_count]=1 \
  --field required_status_checks[strict]=true \
  --field 'required_status_checks[contexts][]=Quality Gate (Node 20)' \
  --field 'required_status_checks[contexts][]=Quality Gate (Node 22)' \
  --field enforce_admins=false \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

Note: `restrictions=null` means no restrictions on who can push (open to external contributors per decision). `enforce_admins=false` allows admin bypass which avoids locking out the owner. The status check context names must match the `name:` field in ci.yml exactly — the quality job is named `Quality Gate (Node ${{ matrix.node-version }})`, so the contexts are `Quality Gate (Node 20)` and `Quality Gate (Node 22)`.

### Pattern 5: CODEOWNERS Format (SCRD-04)

**What:** `.github/CODEOWNERS` — two lines only per the decision.
**Location:** `.github/CODEOWNERS` (GitHub checks this location first).

```
* @farce1
.github/ @farce1
```

The explicit `.github/` rule satisfies OpenSSF Scorecard's preference for CI file ownership. No trailing newline issues — GitHub parses this correctly.

### Pattern 6: Vitest Coverage Config (TINF-02)

**What:** Remove 80% thresholds, add WASM/config/type exclusions.
**Current state:** `vitest.config.ts` has `thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }` that would fail every run with no test files.

**Coverage exclusion strategy:**

Files to exclude from coverage denominator:

- `src/**/*.test.ts` — test files themselves (already excluded)
- `src/**/*.spec.ts` — spec files (already excluded)
- `src/**/types.ts` — type-only files (pure type exports, no runtime code)
- `src/domain/schemas.ts` — Zod schema definitions (declarative, not testable logic)
- `src/cli/index.ts` — CLI entry point (shell, not unit-testable)
- `src/grammars/downloader.ts` — WASM grammar downloader (network calls, integration test territory)
- `src/parsing/**` — All tree-sitter WASM parsing code (WASM-dependent, breaks in vitest environment)
- `src/config/defaults.ts` — Configuration defaults (constant data)

```typescript
// vitest.config.ts — updated version
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'], // Remove 'tests/**/*.test.ts' — colocated only
    exclude: ['node_modules', 'dist', '.claude', '.planning'],
    testTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/types.ts', // Type-only files
        'src/domain/schemas.ts', // Zod schema declarations
        'src/cli/index.ts', // CLI entry point
        'src/grammars/downloader.ts', // WASM grammar downloader
        'src/parsing/**', // WASM-dependent parsing layer
        'src/config/defaults.ts', // Constant data
      ],
      // No thresholds — Phase 11 enforces 80%
    },
  },
});
```

### Pattern 7: Mock Factory Design (TINF-03 and TINF-04)

**What:** `createMockProvider()` factory that satisfies `LLMProvider` interface at compile time.
**Location:** `src/providers/__mocks__/index.ts` (follows vitest `__mocks__` convention).

The `LLMProvider` interface (from `src/providers/base.ts`) has three methods:

- `name: string` (readonly property)
- `complete<T>(request, schema, options?): Promise<CompletionResult & { data: T }>`
- `estimateTokens(text: string): number`
- `maxContextTokens(): number`

Using `vi.fn()` directly (not vitest-mock-extended) for the factory because the decision specifies `vi.fn()` pattern. The `vi.hoisted()` pattern is for use within test files that mock modules, not for factory definitions.

```typescript
// src/providers/__mocks__/index.ts
import { vi } from 'vitest';
import type { LLMProvider } from '../base.js';

/**
 * Creates a fully type-checked mock LLMProvider for use in unit tests.
 *
 * Usage in tests:
 *   const provider = createMockProvider();
 *   provider.complete.mockResolvedValue({ data: {...}, usage: {...} });
 */
export function createMockProvider(): LLMProvider & {
  complete: ReturnType<typeof vi.fn>;
  estimateTokens: ReturnType<typeof vi.fn>;
  maxContextTokens: ReturnType<typeof vi.fn>;
} {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      data: {},
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    }),
    estimateTokens: vi.fn().mockReturnValue(0),
    maxContextTokens: vi.fn().mockReturnValue(100_000),
  };
}
```

**The `vi.hoisted()` convention (TINF-04):** Establish in a comment in the `__mocks__` file or a `TESTING.md` note, but the actual `vi.hoisted()` pattern is used when test files need to mock modules before imports are resolved:

```typescript
// Convention: use vi.hoisted() when a mock variable must be accessible
// inside a vi.mock() factory (vi.mock calls are hoisted before imports)
const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
}));

vi.mock('../providers/base.js', () => ({
  // use mocks.complete here
}));
```

### Pattern 8: Dependabot Auto-Merge Workflow (Claude's Discretion)

**What:** A GitHub Actions workflow that auto-merges Dependabot PRs for patch and minor stable dep updates.
**Approach:** Use `gh pr merge --auto --squash` after enabling auto-merge on the repo.

```yaml
# .github/workflows/automerge.yml
name: Auto-merge Dependabot PRs

on:
  pull_request:

permissions: read-all

jobs:
  automerge:
    name: Auto-merge
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Fetch Dependabot metadata
        id: meta
        uses: dependabot/fetch-metadata@PINNED_SHA # v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
      - name: Auto-merge patch and minor updates
        if: |
          steps.meta.outputs.update-type == 'version-update:semver-patch' ||
          steps.meta.outputs.update-type == 'version-update:semver-minor'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Note: This also needs `dependabot/fetch-metadata` SHA-pinned. As of 2026-02-19, the latest is v2. SHA must be resolved before writing the final plan step. The repo must also have auto-merge enabled: `gh api repos/farce1/handover --method PATCH --field allow_auto_merge=true`.

### Anti-Patterns to Avoid

- **Pinning to tag instead of SHA:** `actions/checkout@v6` is mutable and will fail the Scorecard Pinned-Dependencies check. Must use the 40-character SHA.
- **Removing thresholds key entirely:** Leaving an empty `thresholds: {}` is fine; removing the coverage block entirely is also fine. Don't keep `thresholds` with 80% values — the current config will fail CI immediately with zero tests.
- **Using `tests/unit/` directory:** Tests are colocated at `src/**/*.test.ts` per prior decision. The `include` pattern in vitest config should not include `tests/**/*.test.ts`.
- **Committing the mock factory without compile-time validation:** The requirement is that `createMockProvider()` satisfies `LLMProvider` at compile time. The return type annotation must reference `LLMProvider` explicitly (TypeScript will catch mismatches).
- **Setting branch protection before fixing CI:** If CI is broken when branch protection is applied with required status checks, every subsequent PR (including the Dependabot ones) will be blocked.

---

## Don't Hand-Roll

| Problem                     | Don't Build                                  | Use Instead                                                               | Why                                                                             |
| --------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Type-safe interface mocking | Custom mock classes implementing LLMProvider | `vitest-mock-extended` `mock<LLMProvider>()` or vi.fn() with typed return | vi.fn() approach is simpler for this single interface; avoids class boilerplate |
| In-memory FS                | Custom fs stub                               | `memfs`                                                                   | memfs is a complete FS API implementation; stubs miss edge cases                |
| SHA lookup                  | Manual GitHub web browsing                   | `gh api repos/{owner}/{repo}/commits/{tag} --jq '.sha'`                   | Automated, reproducible, correct                                                |
| Auto-merge                  | Manual PR approvals                          | `dependabot/fetch-metadata` + `gh pr merge --auto`                        | Standard pattern, conditions are checked before merge                           |

**Key insight:** The hardest part of this phase is not code — it's configuration ordering. Getting CI green before applying branch protection is essential; getting Dependabot PRs merged before SHA pinning means you pin to the correct (post-upgrade) SHA.

---

## Common Pitfalls

### Pitfall 1: Pinning SHAs Before Merging Dependabot PRs

**What goes wrong:** If you pin `actions/checkout` to the v6 SHA but the Dependabot PRs haven't been merged yet, you're pinning v6 SHAs into a workflow that still has `@v4` tags in other places — or you've applied the wrong SHA to the old version.
**Why it happens:** The SHA pinning step (SCRD-02) and the Dependabot merge step (CIDP-02) both touch workflow files.
**How to avoid:** Merge all GitHub Actions Dependabot PRs (#1, #2, #3) first, then apply SHA pinning. The npm Dependabot PRs (#4, #5) can be merged at any point.
**Warning signs:** If your workflow shows `actions/checkout@de0fac2e...` but the Dependabot PR for `v4→v6` is still open, something is wrong.

### Pitfall 2: 0.x Dependency Breaking Changes in PR #4

**What goes wrong:** PR #4 bumps `@anthropic-ai/sdk` from `0.39.0` to `0.76.0` (37 minor versions), `openai` from `5.23.2` to `6.22.0` (major bump), and `commander` from `13.x` to `14.x`. Any of these could introduce breaking API changes.
**Why it happens:** Dependabot treats minor bumps as non-breaking, but 0.x minor versions can break.
**How to avoid:** After merging all PRs, run `npm run typecheck && npm test` locally before considering the phase done. If typecheck fails, investigate the specific SDK changes.
**Warning signs:** TypeScript errors in `src/providers/anthropic.ts` or `src/providers/openai-compat.ts` after merge.
**Exact version pinning:** After PR #4 merges successfully, change the 0.x entries in `package.json` from `^0.76.0` to `"0.76.0"` (exact), and for web-tree-sitter `^0.26.5` to `"0.26.5"`.

### Pitfall 3: Coverage Thresholds Blocking CI Before Tests Exist

**What goes wrong:** The current `vitest.config.ts` has `thresholds: { lines: 80, ... }`. Running `npm test -- --coverage` with zero test files produces 0% coverage, which fails the threshold check and blocks CI.
**Why it happens:** The existing config was written anticipating a test suite that doesn't exist yet.
**How to avoid:** Remove the `thresholds` block entirely in Phase 8. Phase 11 re-adds it after a real test suite exists.
**Warning signs:** `npm test -- --coverage` exits with non-zero code even with no test files.

### Pitfall 4: Branch Protection Requiring Status Checks That Don't Exist

**What goes wrong:** If the required status check context names don't exactly match the job names in CI workflow, no PR can ever be merged (the status check never appears as "passed").
**Why it happens:** GitHub matches status check context by exact string.
**How to avoid:** The `quality` job in `ci.yml` uses `name: Quality Gate (Node ${{ matrix.node-version }})`. This generates context names `Quality Gate (Node 20)` and `Quality Gate (Node 22)` — use these exact strings in the branch protection API call.
**Warning signs:** PR shows "Waiting for status check: ..." with a context name that never appears in the check list.

### Pitfall 5: `release-please.yml` Needs to Keep Write Permissions at Job Level

**What goes wrong:** Moving `contents: write; issues: write; pull-requests: write` to job level but forgetting the `publish` job also needs `id-token: write` for npm provenance.
**Why it happens:** The `publish` job already has `id-token: write` at job level. After adding `permissions: read-all` at top level, the publish job's existing `id-token: write` must be kept AND the release-please job needs `contents: write; pull-requests: write` added.
**How to avoid:** Review each job in release-please.yml before restructuring permissions.

### Pitfall 6: vitest-mock-extended Peer Dependency on vitest Version

**What goes wrong:** `vitest-mock-extended@3.1.0` has a peer dependency on vitest. If PR #5 upgrades vitest to `4.x`, the peer dependency requirement may conflict.
**Why it happens:** vitest-mock-extended@3.x may require vitest@3.x as a peer.
**How to avoid:** Check compatibility: `npm install --save-dev vitest-mock-extended` after the Dependabot PRs are merged. npm will warn about peer dependency conflicts. If vitest 4.x is installed (via PR #5), may need `vitest-mock-extended@4.x` if available.
**Warning signs:** `npm warn ERESOLVE` during install or peer dependency warnings.

---

## Code Examples

Verified patterns from official sources and codebase inspection:

### Fix for CIDP-01 (missing import)

```typescript
// src/ai-rounds/runner.ts — add after line 5
// Source: src/ai-rounds/types.ts exports ValidationResult at line 43
import type { ValidationResult } from './types.js';
```

### Vitest Config (TINF-02)

```typescript
// vitest.config.ts — complete replacement
// Source: Context7 /vitest-dev/vitest coverage configuration docs
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.claude', '.planning'],
    testTimeout: 120_000,
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
      // Thresholds deliberately omitted — Phase 11 enforces 80%
    },
  },
});
```

### createMockProvider() Factory (TINF-03)

```typescript
// src/providers/__mocks__/index.ts
// Source: codebase LLMProvider interface at src/providers/base.ts
import { vi } from 'vitest';
import type { LLMProvider } from '../base.js';
import type { CompletionResult } from '../../domain/types.js';

export function createMockProvider(): LLMProvider {
  const mockComplete = vi.fn<LLMProvider['complete']>();
  mockComplete.mockResolvedValue({
    data: {} as never,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
  } as CompletionResult & { data: never });

  return {
    name: 'mock',
    complete: mockComplete,
    estimateTokens: vi.fn().mockReturnValue(0),
    maxContextTokens: vi.fn().mockReturnValue(100_000),
  };
}
```

### vi.hoisted() Convention (TINF-04)

```typescript
// Convention for test files that need to mock modules before imports
// Source: Context7 /vitest-dev/vitest api/vi.md
const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  estimateTokens: vi.fn().mockReturnValue(0),
  maxContextTokens: vi.fn().mockReturnValue(100_000),
}));

vi.mock('../providers/base.js', () => ({
  // Factory has access to mocks because vi.hoisted runs before vi.mock
  LLMProvider: mocks,
}));
```

### Workflow Permissions (SCRD-01)

```yaml
# ci.yml — add at top level (between 'name:' and 'on:')
permissions: read-all

# No job-level permissions needed for ci.yml (no write operations)
```

```yaml
# release-please.yml — restructure
permissions: read-all  # top level

jobs:
  release-please:
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: googleapis/release-please-action@PINNED_SHA
        ...

  publish:
    permissions:
      id-token: write      # already exists, keep it
      contents: read       # add: needed to read repo for publish
    steps:
      - uses: actions/checkout@PINNED_SHA
      ...
```

### SHA-Pinned Action Reference

```yaml
# Format: uses: {owner}/{repo}@{40-char-sha}  # {tag}
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
- uses: actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238 # v6
- uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f # v6
- uses: codecov/codecov-action@671740ac38dd9b0130fbe1cec585b89eea48d3de # v5
- uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
# github/codeql-action — all subpaths share same SHA:
- uses: github/codeql-action/init@9e907b5e64f6b83e7804b09294d44122997950d6 # v4
- uses: github/codeql-action/autobuild@9e907b5e64f6b83e7804b09294d44122997950d6 # v4
- uses: github/codeql-action/analyze@9e907b5e64f6b83e7804b09294d44122997950d6 # v4
- uses: github/codeql-action/upload-sarif@9e907b5e64f6b83e7804b09294d44122997950d6 # v4
- uses: googleapis/release-please-action@16a9c90856f42705d54a6fda1823352bdc62cf38 # v4
```

### memfs Usage Pattern

```typescript
// Source: Context7 /streamich/memfs docs/node/usage.md
import { vol } from 'memfs';

// In beforeEach: reset the virtual filesystem
beforeEach(() => {
  vol.reset();
});

// Set up a fixture filesystem from JSON
vol.fromJSON(
  {
    '/project/src/index.ts': 'export const x = 1;',
    '/project/package.json': '{"name": "test"}',
  },
  '/',
);

// The fs module must be mocked to use memfs
vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});
```

---

## State of the Art

| Old Approach                         | Current Approach                           | When Changed                                | Impact                                       |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------- | -------------------------------------------- |
| `actions/checkout@v4` (mutable tag)  | SHA-pinned ref                             | OpenSSF Scorecard Pinned-Dependencies check | Required for full score                      |
| Top-level write permissions          | `permissions: read-all` + job-level writes | OpenSSF Scorecard Token-Permissions check   | Required for full score                      |
| 80% coverage threshold with no tests | No threshold until test suite exists       | Phase 8 decision                            | Prevents CI failure                          |
| `^0.39.0` semver range for 0.x deps  | Exact version `"0.39.0"` after batch merge | Phase 8 dep policy                          | Prevents accidental breaking updates         |
| No CODEOWNERS                        | `.github/CODEOWNERS`                       | OpenSSF Scorecard                           | Required for Branch-Protection tier 4 (9/10) |

**Deprecated/outdated:**

- `tests/unit/` directory pattern: Project uses colocated `src/**/*.test.ts` — do not create a separate tests directory.
- `mock-fs` library: Unmaintained, breaks WASM — use `memfs` (locked decision).
- `actions/checkout@v4`: Superseded by v6 (Dependabot PR #1).

---

## Open Questions

1. **vitest-mock-extended peer dependency compatibility with vitest 4.x**
   - What we know: `vitest-mock-extended@3.1.0` is the latest; Dependabot PR #5 upgrades vitest to `4.0.18`
   - What's unclear: Whether vitest-mock-extended@3.x is peer-compatible with vitest@4.x
   - Recommendation: Run `npm install --save-dev vitest-mock-extended` after merging PR #5; check for peer warnings. If incompatible, use only `vi.fn()` for the factory (no vitest-mock-extended needed for `createMockProvider()` anyway — the `mock<LLMProvider>()` pattern from vitest-mock-extended is optional).

2. **Post-merge typecheck failures from @anthropic-ai/sdk 0.39→0.76 bump**
   - What we know: PR #4 bumps the SDK by 37 minor versions; 0.x SDKs often have breaking changes in minor versions
   - What's unclear: Exact API surface changes between 0.39 and 0.76
   - Recommendation: After batch merging, run `npm run typecheck` immediately. If it fails in `src/providers/anthropic.ts`, the planner should add a contingency task to investigate and fix SDK-breaking changes before the phase can close.

3. **dependabot/fetch-metadata SHA for automerge workflow**
   - What we know: The automerge workflow needs `dependabot/fetch-metadata@v2` SHA-pinned
   - What's unclear: Current SHA for fetch-metadata@v2 (not retrieved in this research)
   - Recommendation: Planner adds a step to run `gh api repos/dependabot/fetch-metadata/commits/v2 --jq '.sha'` before writing the automerge workflow.

4. **OpenSSF Scorecard score after changes**
   - What we know: The checks for Token-Permissions (SCRD-01), Pinned-Dependencies (SCRD-02), Branch-Protection (SCRD-03/04), and Vulnerabilities (SCRD-05/06) all have clear requirements
   - What's unclear: Current baseline score and which other checks might be failing (e.g., Signed-Releases, Fuzzing, SAST)
   - Recommendation: Check `https://scorecard.dev/viewer/?uri=github.com/farce1/handover` for current score and identify any checks this phase cannot address.

---

## Sources

### Primary (HIGH confidence)

- Context7 `/vitest-dev/vitest` — coverage configuration, vi.hoisted(), vi.fn() patterns
- Context7 `/streamich/memfs` — memfs usage with vitest
- Context7 `/eratio08/vitest-mock-extended` — mock<Interface>() and MockProxy patterns
- `gh api repos/farce1/handover` — live repo state (auto_merge: false, PRs, branch protection)
- `gh api repos/actions/*/commits/{tag}` — SHA values retrieved live 2026-02-19
- `npm run typecheck` — confirmed TS2304 error in runner.ts
- Codebase files read directly: `runner.ts`, `types.ts` (ai-rounds), `base.ts` (providers), `vitest.config.ts`, all 4 workflow YAMLs, `package.json`

### Secondary (MEDIUM confidence)

- `scorecard.dev` docs (via WebFetch) — Token-Permissions and Branch-Protection scoring tiers
- WebSearch on GHSA-2g4f-4pwh-qvx6 — confirmed as ajv ReDoS via eslint transitive dep
- WebSearch on Dependabot auto-merge patterns — `gh pr merge --auto` is the standard approach

### Tertiary (LOW confidence)

- vitest-mock-extended peer dep compatibility with vitest 4.x — not verified, flagged as open question

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — versions confirmed from npm registry and Context7
- Architecture (patterns): HIGH — derived from direct codebase inspection and official docs
- Pitfalls: HIGH — majority derived from reading actual workflow/config files, not speculation
- SHA values: HIGH — retrieved live via GitHub API on 2026-02-19

**Research date:** 2026-02-19
**Valid until:** SHA values — verify before implementing (7-day freshness); npm versions — 30-day freshness; workflow patterns — stable
