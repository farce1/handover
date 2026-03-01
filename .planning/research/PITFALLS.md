# Pitfalls Research

**Domain:** Test coverage uplift, git-aware incremental regeneration, search UX polish, and documentation/onboarding on an existing TypeScript CLI tool
**Researched:** 2026-03-01
**Confidence:** HIGH — Coverage pitfalls from Vitest official docs and community post-mortems; git edge cases from git-scm official docs and simple-git changelog; vector search pitfalls from sqlite-vec issue tracker and the authoritative sqlite-vec hybrid search post; CLI UX from clig.dev (the reference standard); onboarding pitfalls from community CLI project issues

---

## Critical Pitfalls

### Pitfall 1: Coverage Exclusion Creep Produces a Fake Number

**What goes wrong:**
The project already excludes 30+ source paths from coverage (CLI entry points, CLI commands, all analyzers, all cache code, all vector code, all MCP code, all regeneration code, all rendering code, all provider SDKs, the logger, and domain entities). The threshold sits at 80% for files that remain. Each new phase that adds exclusions to `vitest.config.ts` in order to keep CI green raises the percentage on a shrinking denominator. The number reaches 90% without the codebase being meaningfully more tested.

**Why it happens:**
"Integration-only" is a legitimate reason to exclude code from unit-coverage — but it becomes a habit. When a file is hard to test, the path of least resistance is adding it to the exclusion list rather than refactoring or writing a focused integration test. The 90% threshold then measures coverage over a cherry-picked subset that excludes all the risky code.

**How to avoid:**
- Freeze the exclusion list before starting the coverage uplift phase. Any new exclusion requires explicit justification committed alongside the entry.
- Distinguish between three categories when evaluating uncovered files: (a) truly not unit-testable without network/disk (legitimate exclusion), (b) testable with a modest amount of mocking (must add tests), (c) untested because of avoidance (must add tests).
- Track the denominator: report "covered LOC out of total eligible LOC" in addition to the percentage. If the denominator shrinks as coverage rises, that is a warning sign.
- Treat growing `vitest.config.ts` coverage.exclude arrays as a code smell requiring review in PR.

**Warning signs:**
- Coverage exclusion list grows during the coverage phase.
- A PR adds a test file AND simultaneously adds new exclusions for other files.
- Coverage percentage improves while the number of test files stays flat.
- `src/qa/`, `src/cache/`, `src/vector/`, and `src/regeneration/` never appear in coverage reports despite being core business logic.

**Phase to address:**
Test coverage uplift phase — establish exclusion freeze and denominator tracking before writing any new tests.

---

### Pitfall 2: Mock-Heavy Tests That Raise Coverage Without Testing Behavior

**What goes wrong:**
To cover modules that depend on filesystem, SQLite, or LLM providers, developers wrap every dependency in a `vi.mock()` and assert that the mock was called. Coverage goes up. The tests pass when the real integration is broken. This is especially likely for `src/cache/round-cache.ts`, `src/vector/query-engine.ts`, and `src/orchestrator/` — all complex modules that are currently excluded from coverage.

**Why it happens:**
Mock-heavy tests are fast to write and immediately raise line counts. The alternative — a real-filesystem integration test or a memfs-backed unit test — requires more design effort. The project already has `memfs` as a devDependency, which signals intent, but it is easy to reach for `vi.mock()` instead.

**How to avoid:**
- Use `memfs` (already in devDependencies) for tests that exercise filesystem logic, rather than mocking the `fs` module at the method level.
- Tests that mock the return value of a function being tested (not its dependencies) are testing nothing — identify these and replace them.
- For each new test file, ask: "Would this test catch a regression where the real code path is broken?" If no, it is a mock test.
- Prefer testing through public interfaces over testing internal state.

**Warning signs:**
- A test file contains more `vi.mock()` calls than `expect()` calls.
- Test assertions are all `expect(mockFn).toHaveBeenCalledWith(...)` with no output verification.
- The test file imports from `vitest-mock-extended` exclusively with no real implementation.
- Deleting a production code path does not make a test fail.

**Phase to address:**
Test coverage uplift phase — establish a test quality policy (no pure-mock coverage gaming) before writing new tests.

---

### Pitfall 3: Git-Aware Incremental Detection Misses Untracked New Files

**What goes wrong:**
`git diff --name-only HEAD` (or `simple-git`'s equivalent) returns only files that are tracked by git. A user creates new source files and runs `handover generate` without staging them first. The incremental check sees no changed tracked files, concludes nothing changed, and skips regeneration. The new files are never indexed.

**Why it happens:**
`git diff` compares states within the git graph. Untracked files are not in the index or any commit, so they are invisible to `diff`. This is documented behavior — git-scm explicitly states diffs from the index to working tree cannot have Added entries for untracked files. It is a natural assumption gap: users expect "detect what changed" to include new files they just wrote.

**How to avoid:**
- Do not rely solely on `git diff` for change detection. Supplement with `git status --short` which does report untracked files (the `?` prefix).
- The canonical approach with `simple-git`: call `git.status()` and inspect both `modified`, `created`, and `not_added` (untracked) fields.
- Alternatively: when git-aware mode detects no changes via diff, fall back to the existing content-hash comparison for the full file set. Git awareness is an optimization (skip known-unchanged files), not a replacement for hash-based detection.
- Document this behavior clearly: "Files must be staged (git add) or already tracked for incremental detection to include them."

**Warning signs:**
- Incremental mode reports "no changes" after adding new source files without staging.
- Test scenarios only cover modified tracked files, not new untracked files.
- The `simple-git` integration only calls `git.diff()` without `git.status()`.

**Phase to address:**
Git-aware incremental regeneration phase — test the untracked-file scenario explicitly in the integration test suite.

---

### Pitfall 4: Detached HEAD and Shallow Clone Break git-Aware Mode Silently

**What goes wrong:**
A user runs `handover generate` inside a git repo that is in detached HEAD state (e.g., after `git checkout <commit>`, inside a CI job, or in a GitHub Actions checkout with `fetch-depth: 1`). `simple-git` operations that depend on a branch reference (`git diff origin/main...HEAD`, `git rev-parse --abbrev-ref HEAD`) fail or return empty results. The CLI swallows the error and either skips incremental detection entirely (regenerating everything, silently wasting time) or crashes with an unhelpful message.

**Why it happens:**
Developers test incremental mode on their working branch. CI pipelines and shallow clones are edge cases encountered later. The `simple-git` library does not automatically surface "you are in detached HEAD" as a structured error — it surfaces it as a string like `HEAD` for the branch name or as a spawned-process error.

**How to avoid:**
- Always check `git.status()` for `detached` before running branch-relative diffs. `StatusResult.detached === true` when in detached HEAD.
- In detached HEAD or shallow clone (detectable via `git log --depth=1` returning quickly), fall back gracefully to full content-hash mode and log a warning: "Git-aware incremental mode unavailable (detached HEAD). Running full analysis."
- In CI: document that `fetch-depth: 0` is required in the GitHub Actions checkout step when using incremental mode.
- Test this edge case explicitly with a fixture repository.

**Warning signs:**
- `simple-git` calls use branch names without checking `detached`.
- No test for detached HEAD in the integration test suite.
- Error logs from users running in CI with "ref not found" or empty diff output.

**Phase to address:**
Git-aware incremental regeneration phase — add explicit detached HEAD handling before shipping incremental mode.

---

### Pitfall 5: Integrating the Unused `src/regeneration/` Module Into the CLI Without a Contract

**What goes wrong:**
`src/regeneration/` (job-manager, job-store, targets, schema) was written for the MCP server and is not wired into the CLI `generate` command. When the incremental regeneration feature connects this module to the CLI, it introduces an implicit contract: the job-store is in-memory only, the runner is injected, and the schema defines targets the CLI must honor. If this connection is made ad hoc (e.g., directly calling `job-manager` internals from the CLI command), the CLI and MCP server end up with diverging behavior for the same conceptual operation.

**Why it happens:**
The module exists but lacks a clear CLI integration interface. The fastest path is to call `createRegenerationJobManager()` directly from `src/cli/generate.ts` with inline runner logic. This works but couples the CLI to job-store implementation details and makes the module harder to test.

**How to avoid:**
- Define an explicit integration interface for how `src/regeneration/` is invoked from both CLI and MCP contexts before writing CLI integration code.
- The runner function (injected into `createRegenerationJobManager`) should be the same runner used by MCP. Extract it to a shared module rather than implementing it twice.
- Write tests for `src/regeneration/job-manager.ts` and `src/regeneration/targets.ts` — these are currently unexcluded from coverage but have no test files. Tests will surface interface assumptions early.

**Warning signs:**
- `src/cli/generate.ts` imports directly from `src/regeneration/job-store.ts` internals.
- Runner logic is duplicated between CLI and MCP integration paths.
- `src/regeneration/` files remain unexcluded from coverage but untested.

**Phase to address:**
Git-aware incremental regeneration phase — define the regeneration integration interface before wiring CLI to the module.

---

### Pitfall 6: sqlite-vec KNN Always Returns K Results Even When All Are Irrelevant

**What goes wrong:**
`sqlite-vec`'s vec0 KNN queries are "give me the K nearest vectors" with no distance threshold enforcement. The search command returns `--top-k` results even when the query has no semantically meaningful matches in the index. Users get confusing results (low-relevance snippets) with no indication that their query returned poor-quality matches. Adding stats or filters without addressing this makes the problem worse — high-confidence-looking stats for low-relevance results.

**Why it happens:**
KNN is inherently threshold-free. The sqlite-vec issue tracker explicitly notes: "No room for pagination, custom distance thresholds or anything" in the current vec0 implementation (issue #165 is open for this). The current search CLI likely returns results without surfacing cosine/L2 distance to the user.

**How to avoid:**
- Surface the raw distance score alongside each result. Users can judge relevance; hiding the score removes their agency.
- Implement a soft warning threshold: if the best result's distance exceeds a configurable value (e.g., cosine distance > 0.5), print a warning: "Low-confidence results — no closely matching content found for this query."
- For the search stats feature, include the distance distribution (min, median, max distance across returned results) so users can assess result quality at a glance.
- Do not implement minimum-distance filtering as hard cutoff (it silently returns zero results for legitimate queries with unique terminology) — use it only as a warning signal.

**Warning signs:**
- Search results displayed without distance scores.
- `--top-k 5` always returns exactly 5 results even for nonsense queries.
- No empty-state message when the index contains no documents.
- Stats show result count but not result quality distribution.

**Phase to address:**
Search UX polish phase — add distance surfacing and relevance warnings before adding stats/filters.

---

### Pitfall 7: Search Filters That Reference Document Types Not Present in the Index

**What goes wrong:**
A `--type` filter is added to the search CLI. Users query `handover search "auth flow" --type architecture`. The index may contain no documents of type "architecture" — either because the document was never generated, the index is stale, or the type name does not match what was indexed. The result is silently zero results. The user cannot tell whether their query simply has no good matches or the filter is wrong.

**Why it happens:**
Filter implementations are written against an assumed schema without verifying that the filter values are present in the actual index. The disconnect between filter option values and indexed document metadata is an integration gap that only appears at runtime.

**How to avoid:**
- Before executing a filtered search, validate that at least one document of the requested type exists in the index. If none exist, surface: "No documents of type 'architecture' found in the index. Run `handover reindex` to rebuild, or search without --type to see all results."
- The reindex command should report which document types were indexed and their counts as part of its output.
- Test filter combinations against empty and stale indices explicitly.

**Warning signs:**
- `--type` filter returns zero results without a diagnostic message.
- The list of valid filter values is hardcoded in the CLI rather than queried from the index.
- No test for filtering against a stale or empty index.

**Phase to address:**
Search UX polish phase — implement filter validation and empty-state messaging alongside filter implementation.

---

### Pitfall 8: Interactive Onboarding (`init`) Breaks CI and Non-TTY Environments

**What goes wrong:**
An interactive `handover init` command is added using `@clack/prompts` (already a dependency). The prompts wait for user input via stdin. A user runs `handover init` in a CI script or pipes output to a file — stdin is not a TTY. The prompts hang indefinitely or crash with an unhelpful error. CI pipelines fail with timeouts.

**Why it happens:**
Interactive prompt libraries check for TTY context during prompts but the check is not always applied consistently, especially when prompts are composed or conditionally shown. `@clack/prompts` is designed for TTY contexts. Non-TTY behavior varies — some versions hang, some return empty strings, some throw.

**How to avoid:**
- Always guard interactive prompts with a TTY check: `process.stdout.isTTY`. If not a TTY, either fail fast with a clear message ("Run handover init in an interactive terminal") or auto-apply defaults without prompting.
- Add a `--yes` / `--defaults` flag to `handover init` that accepts all defaults non-interactively. Document this as the CI-safe invocation.
- Test `handover init` with stdin closed (simulating non-TTY) in the test suite.
- Do not assume that because `@clack/prompts` is already used elsewhere in the codebase that it is safe to add more prompts without TTY guards.

**Warning signs:**
- `handover init` hangs in CI without a timeout mechanism.
- No `--yes` or `--defaults` flag exists on the init command.
- Tests for the init command only run in interactive mode.
- Issue reports of CI pipelines hanging on `handover init`.

**Phase to address:**
Documentation and onboarding phase — implement TTY guard and `--yes` flag before shipping interactive init.

---

### Pitfall 9: `init` Command Re-Runs Full Setup on Already-Configured Projects

**What goes wrong:**
A user who already has a configured Handover project (`.handover/config.toml` exists) runs `handover init` accidentally or as part of onboarding documentation. The command overwrites their configuration with defaults. Customizations (model choices, embedding config, custom output paths) are silently lost.

**Why it happens:**
The init command is designed for first-run setup. Adding detection for existing configuration requires an additional code path. Under time pressure, the "detect existing config and bail" check is omitted.

**How to avoid:**
- At the start of `handover init`, check for an existing config file. If found, prompt: "A Handover configuration already exists at .handover/config.toml. Overwrite? [y/N]" with the default being no.
- In non-TTY mode with `--yes`, fail with an explicit error if a config file exists unless `--force` is also passed.
- Distinguish between "init" (first setup) and "reconfigure" (update existing config) in the CLI surface if both are needed.

**Warning signs:**
- `handover init` has no check for existing `config.toml`.
- The command writes config without reading current state.
- User reports that running init again reset their configuration.

**Phase to address:**
Documentation and onboarding phase — implement existing-config detection before the init command is documented.

---

### Pitfall 10: Astro Starlight Docs Break on Relative Link and Base Path Changes

**What goes wrong:**
The existing Starlight documentation site uses relative links within markdown content. When new pages are added, reorganized into subdirectories, or the `base` config option is changed, internal links break silently. The Astro build succeeds (it does not validate internal links by default). Users encounter 404s on production docs.

**Why it happens:**
Starlight does not ship with link validation. The community-built `starlight-links-validator` package exists but is not automatically enabled. Developers adding new documentation pages do not always update links pointing to moved content. The base path issue is well-documented in community discussions: markdown links do not automatically prefix the `base` config value.

**How to avoid:**
- Add `starlight-links-validator` to the docs build process and fail CI on broken links.
- When reorganizing doc pages, run a find-and-replace on link references rather than updating only the new file's front matter.
- Test the docs build (`npm run docs:build`) in CI as part of the documentation phase, not just locally.
- Avoid changing the Starlight `base` configuration without doing a full link audit.

**Warning signs:**
- The docs build step is not in CI.
- New documentation pages are added without a link validation step.
- Internal links use absolute paths (`/user/getting-started`) rather than relative paths (`../getting-started`), making them fragile to base path changes.

**Phase to address:**
Documentation and onboarding phase — add docs:build to CI and install link validator before writing new pages.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Add new files to vitest coverage exclusion list instead of writing tests | CI stays green immediately | Coverage % measures a shrinking denominator; exclusion list grows unbounded | Never during a coverage uplift phase |
| Mock all dependencies in new tests with `vi.mock()` | Fast to write, hits line counts | Tests pass when real behavior is broken; mock-only tests have near-zero regression value | Acceptable only for non-deterministic dependencies (time, crypto, network) |
| Implement git change detection with only `git.diff()` (no `git.status()`) | Simple implementation | New untracked files are invisible; users lose documents without warning | Never — always pair diff with status check |
| Wire `src/regeneration/` directly into CLI without defining a shared runner | Fastest path to incremental regeneration | CLI and MCP diverge on regeneration behavior; module becomes untestable | Never — define the runner interface first |
| Return all K KNN results without surfacing distances | Simpler output format | Users see low-relevance results with no signal that quality is poor | Never in a search UX polish phase |
| Skip TTY check on `handover init` interactive prompts | No extra code | CI pipelines hang indefinitely when onboarding docs instruct users to run init | Never — TTY guard is one line of code |
| Auto-generate tests with AI to hit the 90% threshold | Fast coverage gains | High-coverage test suite with zero regression value; maintenance burden grows | Never as a primary strategy; acceptable for scaffolding test structure only |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `simple-git` + incremental detection | Using only `git.diff()` to detect changed files | Pair `git.diff()` with `git.status()` to capture untracked files; check `StatusResult.detached` before any branch-relative operations |
| `sqlite-vec` KNN search | Assuming K results means K relevant results | Surface raw distance scores; warn when best-match distance exceeds relevance threshold |
| `@clack/prompts` in `handover init` | Running interactive prompts without TTY check | Guard all prompts with `process.stdout.isTTY`; provide `--yes` flag for non-interactive mode |
| `src/regeneration/` + CLI | Calling job-manager internals directly from CLI command | Define a shared runner interface; extract runner to a module both CLI and MCP can inject |
| Vitest v8 + TypeScript `/* v8 ignore */` comments | Ignore hint stripped by esbuild transpilation | Use `/* v8 ignore if -- @preserve */` syntax; v8 AST remapping introduced in v3.2.0 handles most cases |
| Astro Starlight docs + `base` config | Markdown links break silently when base path changes | Use relative links throughout; add `starlight-links-validator` to CI build |
| Coverage thresholds + `coverage.all` | Files not loaded by any test show 0% and drag down threshold | Set `coverage.all: true` and `coverage.include` to see the real uncovered surface; do not be surprised when the number drops |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full `git.log()` call on large repo during incremental check | `handover generate` startup is slow on repos with thousands of commits | Use `git.diff(['--name-only', 'HEAD~1', 'HEAD'])` or limit log depth; do not fetch full history for change detection | Any repo with > 1,000 commits and no depth limit |
| Running all 254+ unit tests before allowing incremental mode to skip | CI time increases with each new test file | Keep unit tests and incremental mode decisions separate; incremental mode should run before the test suite, not after | When test suite grows to 400+ tests |
| sqlite-vec KNN with large index and no limit on result set | Search takes seconds on 10K+ document index | Always apply `LIMIT` on vec0 queries; index is doing full scan by default | When the index exceeds ~5K chunks |
| Watching all source files for changes in `handover serve` + incremental | inotify limits hit on large monorepos | Limit file watching to output directories and config files; use gitignore patterns to exclude `node_modules` and build artifacts | Monorepos with > 50K files |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Search returns 5 results for a nonsense query with no quality signal | User trusts irrelevant results; wastes time following up on false leads | Show distance score per result and a low-quality warning when best distance exceeds threshold |
| `handover init` hangs silently in a script | CI pipeline times out; no error message to diagnose | TTY check + `--yes` flag + immediate failure message when non-TTY and no flag |
| `handover init` overwrites existing config without confirmation | User loses custom model/embedding config silently | Detect existing config; prompt before overwrite; default to no-overwrite |
| Coverage report in CI shows 90% but excludes all complex logic | Team has false confidence; regressions go undetected | Track the excluded-file list alongside coverage%; alert when exclusions grow |
| Incremental mode silently skips new untracked files | User thinks regeneration ran; search index is stale | Warn explicitly: "N untracked files were not indexed. Stage them with git add or run with --no-incremental." |
| Search stats show count without quality distribution | User cannot distinguish "10 great results" from "10 poor results" | Add distance min/median/max to stats output |

---

## "Looks Done But Isn't" Checklist

- [ ] **Coverage at 90%**: Check whether the exclusion list grew during the phase — verify denominator (eligible LOC) stayed constant or grew, not shrank.
- [ ] **Incremental mode works**: Test specifically with (a) new untracked file, (b) detached HEAD repo, (c) shallow clone. All three are silently broken by a naive `git.diff()` implementation.
- [ ] **Git-aware mode wired to CLI**: Verify `src/regeneration/` module is connected via a defined runner interface, not via direct internal imports from the CLI command file.
- [ ] **Search stats added**: Verify distance scores are surfaced alongside stats — a count-only stat is not useful for quality assessment.
- [ ] **Search filters implemented**: Verify that filtering against a type not present in the index produces a diagnostic message, not silent zero results.
- [ ] **`handover init` implemented**: Verify TTY guard exists; verify `--yes` flag exists; verify existing-config detection exists.
- [ ] **Docs built in CI**: Verify `npm run docs:build` is in the CI pipeline; verify link validator runs.
- [ ] **New doc pages linked**: Verify new pages appear in sidebar navigation and are reachable from the index page.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Coverage exclusion creep produces 90% on shrinking denominator | MEDIUM | Freeze exclusions; reset threshold to reflect true uncovered surface; document which files require integration tests instead of unit tests |
| Mock-only tests that game coverage metrics | MEDIUM | Identify tests with no output assertions; replace with memfs-backed or behavior-focused tests; expect short-term coverage drop before real gain |
| Untracked files missed by incremental mode | LOW | Add `git.status()` call alongside `git.diff()`; add test for untracked-file scenario |
| Detached HEAD crashes incremental mode | LOW | Add `StatusResult.detached` check; fallback to full hash-based mode with warning |
| `handover init` hangs in CI | LOW | Add TTY check; ship `--yes` flag; update onboarding docs to specify interactive terminal requirement |
| Config overwritten by re-running init | LOW | Add existing-config detection; re-run init with `--force` to recover (document recovery path) |
| Broken links in Starlight docs | LOW | Run `starlight-links-validator` locally to find all broken links; update references; add validator to CI to prevent recurrence |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Coverage exclusion creep (Pitfall 1) | Test coverage uplift — freeze exclusions at phase start | Exclusion list line count in vitest.config.ts did not increase during phase |
| Mock-only coverage gaming (Pitfall 2) | Test coverage uplift — establish test quality policy | Random sample of 5 new test files; each must have output assertions, not only mock assertions |
| Untracked files invisible to git diff (Pitfall 3) | Git-aware incremental regeneration | Integration test: add untracked file, run incremental mode, verify file is processed |
| Detached HEAD breaks incremental mode (Pitfall 4) | Git-aware incremental regeneration | Integration test: run incremental mode in detached HEAD fixture; verify graceful fallback |
| `src/regeneration/` wired without a contract (Pitfall 5) | Git-aware incremental regeneration — define interface first | CLI and MCP both call the same exported runner function; no direct job-store imports in CLI |
| KNN returns K irrelevant results (Pitfall 6) | Search UX polish | Search for a nonsense string; verify distance scores are shown and warning appears when distance is high |
| Filters against absent document types (Pitfall 7) | Search UX polish | Run `handover search "x" --type nonexistent`; verify diagnostic message, not empty output |
| `handover init` hangs in non-TTY (Pitfall 8) | Documentation and onboarding | Run `echo "" \| handover init` in CI; verify it exits with error code, not hang |
| Init overwrites existing config (Pitfall 9) | Documentation and onboarding | Run `handover init` with existing config present; verify prompt and no-overwrite default |
| Broken Starlight doc links (Pitfall 10) | Documentation and onboarding — add link validator to CI | `npm run docs:build` succeeds in CI; zero broken-link warnings in build output |

---

## Sources

- Vitest Coverage Guide (official): https://vitest.dev/guide/coverage.html
- Vitest per-file threshold update issue #5803: https://github.com/vitest-dev/vitest/issues/5803
- Vitest V8 includes test files in coverage issue #7216: https://github.com/vitest-dev/vitest/issues/7216
- Anthony Sciamanna, "Code Coverage Complications" (post-mortem on coverage anti-patterns): https://anthonysciamanna.com/2020/01/26/code-coverage-complications.html
- Xebia, "Pitfalls of Mocking in Tests and How to Avoid It": https://xebia.com/blog/pitfalls-mocking-tests-how-to-avoid/
- git-scm official git-diff documentation (untracked file limitations): https://git-scm.com/docs/git-diff
- git-scm "How to handle untracked files in diff" (LabEx): https://labex.io/tutorials/git-how-to-handle-untracked-files-in-diff-419781
- simple-git library README and changelog: https://github.com/steveukx/git-js
- sqlite-vec distance threshold constraint tracking issue #165: https://github.com/asg017/sqlite-vec/issues/165
- sqlite-vec performance tuning issue #186: https://github.com/asg017/sqlite-vec/issues/186
- Alex Garcia, "Hybrid full-text search and vector search with SQLite" (authoritative sqlite-vec pitfalls): https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html
- Command Line Interface Guidelines (clig.dev) — authoritative CLI UX reference: https://clig.dev/
- Gemini CLI issue #3144 — existing credentials + interactive onboarding conflict: https://github.com/google-gemini/gemini-cli/issues/3144
- Starlight broken link validator discussion #946: https://github.com/withastro/starlight/discussions/946
- Astro/Starlight index.md link resolution issue #5680: https://github.com/withastro/astro/issues/5680
- Astro for Documentation Sites — real-world insights: https://maciekpalmowski.dev/blog/astro-for-documentation-sites-insights-after-6-months/

---
*Pitfalls research for: Test coverage uplift, git-aware incremental regeneration, search UX polish, and documentation/onboarding on the Handover TypeScript CLI*
*Researched: 2026-03-01*
