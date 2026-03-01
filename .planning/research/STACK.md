# Stack Research

**Domain:** Test coverage uplift (80% → 90%+), git-aware incremental file-change detection, search/QA UX polish, and documentation improvements for handover-cli
**Researched:** 2026-03-01
**Confidence:** HIGH

---

## Context: What Already Exists (Do Not Re-research)

The project already has the following fully validated and in use:

- `vitest@^4.0.18` + `@vitest/coverage-v8@^4.0.18` — test runner and V8 coverage provider
- `memfs@^4.56.10` — in-memory filesystem for unit tests
- `vitest-mock-extended@^3.1.0` — type-safe interface mocking
- `simple-git@^3.32.2` — git operations (used in `src/analyzers/git-history.ts`)
- `@astrojs/starlight@^0.37.6` — documentation site with built-in Pagefind search
- `picocolors@^1.1.0` — CLI color output
- Coverage gate: 80% on all four metrics (currently failing: all four are below threshold)

The new milestone adds: test coverage uplift to 90%+, git-diff-based incremental source detection, search result UX enhancements, and documentation page additions.

---

## Recommended Stack

### Core Technologies

No new core framework changes are required. The additions are configuration changes and one optional supporting library.

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@vitest/coverage-v8` | `^4.0.18` (already installed) | Coverage provider | Already installed. V8 AST-based remapping (since v3.2) now produces parity with Istanbul accuracy at lower memory cost. No switch needed. |
| `simple-git` | `^3.32.2` (already installed) | Git-aware file change detection | Already installed for git history analysis. The `diff(['--name-only', 'HEAD'])` method returns changed files as a raw string; split on newlines to get file paths. No new git library needed. |
| `@astrojs/starlight` | `^0.37.6` (already installed) | Documentation site | Already installed. Built-in Pagefind full-text search requires zero configuration. New docs pages require only new `.md` files in `docs/src/content/docs/` and sidebar entries in `docs/astro.config.mjs`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `strip-ansi` | `^7.1.2` | Strip ANSI codes from CLI output in snapshot tests | Add as devDependency when writing tests for CLI output functions that use `picocolors`. Required to make snapshot tests deterministic across TTY and non-TTY environments. Use in `expect.addSnapshotSerializer()` before asserting on colored output. |

**Why `strip-ansi` is the only new devDependency:**
The search CLI (`src/cli/search.ts`) uses `picocolors` for bold/color output but gates on `process.stdout.isTTY`. Tests run in non-TTY environments and receive unstyled output. However, if any test forces TTY detection or uses `FORCE_COLOR`, ANSI codes appear in snapshots and break determinism. `strip-ansi` prevents this class of flakiness. It is ESM-only (v7+), compatible with the project's `"type": "module"` package.

### Development Tools (Configuration Changes, No New Packages)

| Tool | Change | Notes |
|------|--------|-------|
| `vitest.config.ts` — coverage thresholds | Raise from 80% → 90% on lines, functions, statements; branches from 67.77% → 85%+ | Branch coverage is harder. The 67.77% baseline requires new tests for conditional paths in `src/auth/pkce-login.ts`, `src/auth/resolve.ts`, `src/renderers/utils.ts`, and `src/config/schema.ts` before the branch gate can reach 85%. |
| `vitest.config.ts` — coverage reporters | Add `'json-summary'` to reporter list | Required for `vitest-coverage-report-action` GitHub Action to post PR coverage comments. Already uses `'text'` and `'lcov'`; add `'json-summary'` alongside these. |
| `vitest.config.ts` — autoUpdate | Do NOT enable `thresholds.autoUpdate` yet | Known bug vitest#9227 strips newlines from the config file on rewrite. Use manual threshold bumps. Revisit when vitest 4.x ships a fix. |
| `docs/astro.config.mjs` — sidebar | Add sidebar entries for search guide, regeneration guide, and CLI reference additions | No new packages, just sidebar config. Pagefind indexes new pages automatically on next `astro build`. |

---

## Current Coverage Baseline (Measured 2026-03-01)

| Metric | Current | Gate (current) | Target (new gate) |
|--------|---------|----------------|-------------------|
| Statements | 79.06% | 80% (failing) | 90% |
| Branches | 67.77% | 80% (failing) | 85% |
| Functions | 79.90% | 80% (failing) | 90% |
| Lines | 78.85% | 80% (failing) | 90% |

**The existing 80% gate is already failing.** The first task is to pass the current gate, then raise it.

### Where Coverage Is Being Lost

Based on the live coverage run, modules below threshold that are NOT in the exclusion list:

| Module | Coverage | Why Low | Fix Strategy |
|--------|----------|---------|--------------|
| `src/providers/gemini.ts` | 0% statements | Not excluded despite wrapping `@google/genai` SDK (integration-only). Only `anthropic.ts` and `openai-compat.ts` are excluded; `gemini.ts` was missed. | Add `src/providers/gemini.ts` to coverage exclusions in `vitest.config.ts` (mirrors the existing policy for other provider SDK wrappers). |
| `src/auth/pkce-login.ts` | 75% branches | Browser launch (`open` package) + HTTP callback server are hard to unit test. Uncovered lines: 191–296, 317, 342 — token exchange error paths. | Mock `open` and `node:http` server via `vi.mock`. Existing 206-LOC test file has gaps in error-path coverage. |
| `src/auth/resolve.ts` | 78% | Uncovered lines 88–95, 124–127 — keychain fallback and invalid token format paths. | Add 3–4 targeted tests for these branches. Pure logic, no I/O mocking needed. |
| `src/renderers/utils.ts` | 63% | Lines 88–123 uncovered — the `renderContext` helper functions (`crossRef`, `resolveAudience`, etc.). | Add unit tests. These are pure functions with no I/O — highest ROI per test in the codebase. |
| `src/config/schema.ts` | 75% | Lines 24–25 — the `superRefine` conditional in `EmbeddingConfigSchema` that validates `local.model` is not tested. | Add 2 schema parse tests: one for `local-only` mode without `local.model` (should fail), one with it (should pass). |
| `src/vector/chunker.ts` | 98.8% | Line 158 only — one edge case branch. | Add one test. Trivial. |

**Highest ROI targets for reaching 90%:** `src/renderers/utils.ts` (pure functions, ~35 uncovered LOC), `src/config/schema.ts` (Zod schema, 2–3 test cases), `src/auth/resolve.ts` (3–4 branch-covering tests), excluding `gemini.ts` (immediate improvement, zero test-writing effort).

---

## git-aware Incremental File Change Detection

`simple-git` is already installed at `^3.32.2`. No new package needed.

### API to Use

```typescript
import { simpleGit } from 'simple-git';

// Get files changed in working tree (uncommitted)
const git = simpleGit(rootDir);
const status = await git.status();
// status.files: Array<{ path: string; index: string; working_dir: string }>
const changedPaths = status.files.map(f => f.path);

// Get files changed between two commit hashes (for cache-based incremental runs)
const diff = await git.diff(['--name-only', storedHash, 'HEAD']);
const changedFiles = diff.split('\n').filter(Boolean);

// Get the latest commit hash (to store as "last processed" marker)
const log = await git.log({ maxCount: 1 });
const latestHash = log.latest?.hash;
```

The `diff(['--name-only', fromHash, 'HEAD'])` call returns a raw newline-separated string. Split and filter to get the file list. Both `status()` and `diff()` are fully typed via simple-git's TypeScript definitions.

**Precedent in the codebase:** `src/analyzers/git-history.ts` uses `simpleGit(ctx.rootDir)` for all its git calls. The incremental module in `src/regeneration/` should follow the same init pattern.

### Mocking simple-git in Unit Tests

```typescript
// vi.mock at top of test file — hoisted automatically
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    diff: vi.fn().mockResolvedValue('src/docs/01-OVERVIEW.md\nsrc/docs/02-ARCH.md\n'),
    status: vi.fn().mockResolvedValue({
      files: [{ path: 'src/index.ts', index: 'M', working_dir: ' ' }],
    }),
    log: vi.fn().mockResolvedValue({ latest: { hash: 'abc123def' } }),
  })),
}));
```

No additional test utility libraries needed — this follows existing `vi.mock` patterns in the codebase.

---

## Search UX Enhancements

No new runtime dependencies required. All changes are logic edits to existing modules.

### What Needs to Change (Code Only)

| Enhancement | File | Approach |
|-------------|------|----------|
| Relevance threshold filtering | `src/vector/query-engine.ts` | Add optional `minRelevance` parameter to `SearchDocumentsInput`. Filter results after `vectorStore.search()` call where `toRelevance(distance) >= minRelevance`. |
| Colorized relevance score | `src/cli/search.ts` | In `runFastMode()`, color-code the relevance percentage: `picocolors.green` for ≥ 80%, `picocolors.yellow` for ≥ 50%, no color below 50%. Uses existing `emphasize` pattern. |
| Zero-result messaging improvement | `src/cli/search.ts` | Already partially done. Enhance with doc type suggestions when `--type` filter was provided (call `suggestDocTypes()` from query-engine). |
| QA mode citation formatting | `src/cli/search.ts` | `renderFootnotes()` already formats citations. Improve by showing relevance scores alongside source file names. |

No `chalk`, `ora`, `cli-table`, or other formatting libraries are needed. The existing `picocolors` + raw `console.log` pattern is sufficient and matches the project's established style.

---

## Documentation Site Additions

No new packages required. Starlight + Pagefind already provides full-text search.

### New Pages Required

| Page | Path | Content |
|------|------|---------|
| Search user guide | `docs/src/content/docs/user/search.md` | Documents `handover search`, `--mode fast` vs `--mode qa`, `--type` filters, `--top-k`, `--embedding-mode` options, and what to do when zero results appear. |
| Regeneration guide | `docs/src/content/docs/user/regeneration.md` | Documents the MCP `regenerate_docs` tool, the `regenerate_docs_status` poll flow, and target options (`full-project`, `docs`, `search-index`). Add CLI command coverage if `handover regenerate` is added as a CLI entry point. |
| Testing contributor guide | `docs/src/content/docs/contributor/testing.md` | Documents `createMockProvider()`, `memfs` setup pattern, `vi.hoisted()` use cases, coverage exclusion rationale, and how to run coverage locally. |

### Sidebar Changes Required

In `docs/astro.config.mjs`, add to the "User Guides" items array:
```js
{ label: 'Search', link: '/user/search/' },
{ label: 'Regeneration', link: '/user/regeneration/' },
```

And to the "Contributor docs" items array:
```js
{ label: 'Testing', link: '/contributor/testing/' },
```

Pagefind automatically indexes new pages on the next `astro build`. The existing `docs:build` npm script covers this.

---

## Installation

```bash
# One new devDependency:
npm install -D strip-ansi

# No new runtime dependencies.
# All other changes are:
# 1. vitest.config.ts threshold and reporter updates
# 2. New test files in src/**/*.test.ts
# 3. New doc pages in docs/src/content/docs/
# 4. docs/astro.config.mjs sidebar updates
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| V8 coverage (already in use) | Switch to Istanbul (`@vitest/coverage-istanbul`) | Only if V8 produces inaccurate branch counts. Since vitest 3.2.0, V8 uses AST-based remapping with parity to Istanbul. No reason to switch. |
| `simple-git` `diff(['--name-only'])` (already installed) | `child_process.execSync('git diff --name-only HEAD')` | Use `execSync` only if `simple-git` init fails (e.g., no `.git` directory). `simple-git` is typed and already installed — use it for consistency with `git-history.ts`. |
| `strip-ansi` as devDep | `NO_COLOR=1` env var in test setup | Both are valid. `NO_COLOR=1` prevents color at the source; `strip-ansi` strips after the fact. Use `NO_COLOR=1` in `vitest.config.ts` `env` config as the primary approach. Add `strip-ansi` only for tests asserting on pre-colored output that must remain colored in production. |
| Pagefind (bundled in Starlight) for docs search | Algolia DocSearch | Only if the project needs search analytics, cross-site search federation, or the docs exceed 1000+ pages. Pagefind is zero-config and has no API key dependency. |
| Manual threshold bumps after coverage improves | `thresholds.autoUpdate: true` | `autoUpdate` is appealing but vitest#9227 strips intentional newlines from the config file on rewrite. Manual is safer until the bug is fixed. |
| Add `gemini.ts` to coverage exclusions | Write unit tests for `GeminiProvider` | If the team wants unit tests for the Gemini provider, mock `@google/genai`. If not, add it to exclusions to match the `anthropic.ts` + `openai-compat.ts` policy. The inconsistency between which providers are excluded is the root cause of the 0% coverage hit. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@vitest/coverage-c8` | Superseded package name. The current package is `@vitest/coverage-v8`. | `@vitest/coverage-v8` (already installed) |
| `istanbul` / `nyc` standalone | Redundant when `@vitest/coverage-v8` provides equivalent accuracy via AST remapping since v3.2. | `@vitest/coverage-v8` |
| `jest-changed-files` | Jest-ecosystem utility requiring Jest infrastructure. | `simple-git` diff API (already installed) |
| `typedoc` for API docs | TypeDoc generates HTML from JSDoc/TSDoc. This project has zero JSDoc in source files and uses handwritten Starlight markdown docs. TypeDoc would generate an empty site. | Continue with handwritten Starlight markdown docs. |
| `chalk` or `kleur` for search output coloring | Project standardizes on `picocolors` — one color library for the entire CLI. Adding a second color library creates dual dependency for the same capability. | `picocolors` (already installed) |
| `cli-table3` or `ink` for search result formatting | The search output is intentionally plain-text-friendly (piped to other tools, used by MCP). Rich table rendering breaks pipe-ability and adds a large dependency. | Existing `console.log` + `picocolors.bold()` pattern. |
| `vitest-memfs` | Adds custom matchers for memfs. The existing bare `memfs` + `vol.fromJSON()` + `vi.mock('node:fs')` pattern is sufficient. | `memfs` (already installed) |
| `thresholds.autoUpdate: true` right now | Bug vitest#9227 — rewrites config file stripping intended newlines. | Manual threshold updates in `vitest.config.ts`. |

---

## Stack Patterns by Variant

**If raising coverage gate in a single PR:**
- Update `vitest.config.ts` thresholds first, then add tests in the same PR
- Build fails until tests are added — keep them in the same branch
- Run `npm test -- --coverage` locally to verify gate passes before pushing

**If raising coverage incrementally (recommended):**
- PR 1: Add `gemini.ts` to exclusions, add tests for `renderers/utils.ts` and `config/schema.ts` → fixes the 80% gate currently failing
- PR 2: Add tests for `auth/resolve.ts` and `auth/pkce-login.ts` error paths → raise gate to 85%
- PR 3: Final audit pass → raise gate to 90%

**If adding git-aware incremental regeneration:**
- New file: `src/regeneration/git-diff.ts` — wraps `simpleGit(rootDir).diff(['--name-only', lastHash, 'HEAD'])`
- New test: `src/regeneration/git-diff.test.ts` — `vi.mock('simple-git')`, test empty diff, non-git-repo fallback, file list parsing
- `git-diff.ts` called by the regeneration runner before dispatching — changed files passed into the job context

**If the project is NOT in a git repository:**
- `simple-git` throws `NotAGitRepository` on init
- Wrap in try/catch; fall back to full regeneration (same pattern used in `src/analyzers/git-history.ts` via `emptyGitResult()`)
- Document this behavior in the regeneration user guide

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `vitest@^4.0.18` | `@vitest/coverage-v8@^4.0.18` | Must be same major version. Already in sync. |
| `strip-ansi@^7.1.2` | `"type": "module"` package | ESM-only. Project is `"type": "module"`. Import: `import stripAnsi from 'strip-ansi'`. Compatible. |
| `simple-git@^3.32.2` | Node `>=18` | Project requires `node >=18.0.0`. Compatible. |
| `memfs@^4.56.10` | `vitest@^4.0.18`, `vi.mock('node:fs')` | Compatible with `vi.mock('node:fs')` and `vi.mock('node:fs/promises')`. Uses `vol.fromJSON()` API. Already validated in test suite. |
| `@astrojs/starlight@^0.37.6` | `astro@^5.17.3` | Already in sync. Pagefind is bundled — no separate `pagefind` package needed. |

---

## Sources

- https://vitest.dev/guide/coverage — V8 vs Istanbul, AST-based remapping since v3.2.0 (HIGH — official Vitest docs)
- https://vitest.dev/config/coverage — `thresholds`, `autoUpdate`, `perFile`, `reporter` config reference (HIGH — official Vitest docs)
- https://github.com/vitest-dev/vitest/issues/9227 — `autoUpdate` bug that strips newlines on config rewrite (HIGH — upstream issue, open as of research date)
- https://github.com/steveukx/git-js/blob/main/simple-git/CHANGELOG.md — simple-git 3.32.3 current version (HIGH — official changelog)
- https://github.com/steveukx/git-js/blob/main/simple-git/typings/simple-git.d.ts — `diff()`, `status()`, `diffSummary()`, `log()` TypeScript signatures (HIGH — official types)
- https://www.npmjs.com/package/strip-ansi — v7.1.2, ESM-only, last published ~5 months ago (MEDIUM — npm registry)
- https://starlight.astro.build/guides/site-search/ — Pagefind built-in, zero-config, `pagefind: false` to disable (HIGH — official Starlight docs)
- https://vitest.dev/guide/mocking/file-system — `memfs` + `vi.mock('node:fs')` recommended pattern (HIGH — official Vitest docs)
- Coverage baseline: `npm test -- --coverage` run on 2026-03-01 against current `vitest.config.ts` exclusion list

---

*Stack research for: Test coverage uplift, incremental regeneration, search UX polish, documentation improvements*
*Researched: 2026-03-01*
