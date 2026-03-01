# Project Research Summary

**Project:** Handover CLI — v7.0 Milestone
**Domain:** TypeScript CLI tool — test coverage uplift, git-aware incremental regeneration, search/QA UX polish, documentation
**Researched:** 2026-03-01
**Confidence:** HIGH

## Executive Summary

This milestone extends an already-mature TypeScript CLI (Handover) with four coordinated improvements: raising test coverage from a failing 80% gate to a verified 90%+ threshold, introducing git-aware incremental cache invalidation for the document-generation pipeline, polishing the `handover search` UX (result quality signals, OSC8 terminal links, zero-results guidance), and adding documentation pages for search, regeneration, and contributor onboarding. No new runtime dependencies are required. The entire stack is extensions of what is already installed and validated. The one new devDependency (`strip-ansi`) is optional and only needed for color-deterministic snapshot tests.

The recommended execution order is: coverage first (pure additions, zero regression risk, builds the test harness), then git-aware caching (self-contained change at a single construction site in `generate.ts`), then search UX (additive changes to `VectorStore`, `query-engine`, and `mcp/tools`), and finally documentation (depends on all prior phases being complete so docs reflect final behavior). This ordering is not arbitrary — Phase 3 modifies `src/mcp/tools.ts` and the test harness built in Phase 1 must exist before that production code is touched. Phases 2 and 3 can be parallelized by different contributors once Phase 1 is complete.

The primary risks are (a) coverage exclusion creep — reaching 90% by shrinking the denominator rather than adding real tests — and (b) git-aware incremental detection silently missing untracked new files if `git.diff()` is used without pairing it with `git.status()`. Both risks are well-understood and have specific, low-effort mitigations. The codebase is structured cleanly enough that all four workstreams can proceed without blocking each other provided the Phase 1 test harness is delivered before Phase 3 begins.

---

## Key Findings

### Recommended Stack

The stack is entirely existing. No new runtime dependencies are introduced. The only tool-level change is raising vitest thresholds in `vitest.config.ts` and adding `json-summary` to the coverage reporters list (required by the GitHub Actions coverage comment action). The `autoUpdate` option in vitest is desirable as a ratchet mechanism but must NOT be enabled yet due to upstream bug vitest#9227 which strips newlines from the config file on rewrite; use manual threshold bumps until that bug is resolved.

**Core technologies:**
- `vitest@^4.0.18` + `@vitest/coverage-v8@^4.0.18`: test runner and V8 coverage — already installed, already integrated with CI; V8 AST-based remapping since v3.2 gives Istanbul-level branch accuracy
- `simple-git@^3.32.2`: git-aware change detection — already installed and used in `src/analyzers/git-history.ts`; `diff(['--name-only', fromHash, 'HEAD'])` and `status()` are the two calls needed; `vi.mock('simple-git')` pattern is established
- `memfs@^4.56.10`: in-memory filesystem for unit tests — already a devDependency; the correct tool for testing `round-cache.ts`, `analyzers/cache.ts`, and `config/loader.ts` without real disk I/O
- `@astrojs/starlight@^0.37.6`: documentation site with Pagefind full-text search built in — zero-config; new pages require only new `.md` files and sidebar entries in `docs/astro.config.mjs`
- `strip-ansi@^7.1.2` (new devDep, optional): makes snapshot tests for CLI color output deterministic; ESM-only, compatible with project's `"type": "module"` setting

**Critical version constraint:** `vitest` and `@vitest/coverage-v8` must remain on the same major version. Both are at `^4.0.18` and in sync. Do not upgrade one without the other.

**What NOT to use:** Do not add `chalk`, `kleur`, `cli-table3`, or `ink` — `picocolors` (already installed) handles all search output coloring. Do not use `thresholds.autoUpdate: true` until vitest#9227 is resolved.

### Expected Features

The feature research confirms a clear P1/P2/P3 prioritization backed by a live `vitest --coverage` run on 2026-03-01 and direct source inspection.

**Must have (table stakes — P1, required for milestone acceptance):**
- 90%+ coverage gate (lines/functions/statements) with 85%+ branches — currently all four metrics are BELOW the existing 80% gate; the 80% gate must be passed before it can be raised
- New test suites targeting the highest-ROI coverage gaps: `renderers/utils.ts` (63% — pure functions, zero I/O), `auth/resolve.ts` (78%), `auth/pkce-login.ts` (75% branches), `config/schema.ts` (75%), `context/packer.ts` (88%)
- `handover generate --since <ref>` or `--changed-only` — git diff + source-to-document map; only reruns affected documents
- `handover search` documentation page — the most obvious gap in existing user-facing docs
- Reindex summary output — structured stats block (docs processed/skipped/failed, chunks created)
- `--type` valid values shown in `--help` output

**Should have (P2 — add within milestone if scope allows):**
- OSC8 clickable terminal file links in search output (TTY-gated, fallback to plain path)
- QA mode timing and token stats ("Answer generated in 2.3s using 1,240 tokens from 4 sources")
- Contributor guide: testing section documenting `createMockProvider()`, `memfs` setup, coverage exclusion rationale

**Defer (P3 — next milestone):**
- Precise diff-to-renderer dependency graph (fine-grained source-to-document mapping beyond the static lookup table)
- Integration test suite (`test:integration`) requiring real API keys and filesystem fixtures
- REPL-mode search (streaming QA via `--mode qa` already handles the primary use case)

**Anti-features confirmed by research:**
- Removing all coverage exclusions to hit 90% — CLI commands and providers require live APIs; keep exclusions, document them
- Git-dirty check that blocks generation on a dirty working tree — warn only, never block
- Per-file 100% coverage requirements — brittle; use global 90% threshold

### Architecture Approach

The codebase has a clean layered architecture: CLI layer → DAG orchestrator → static analyzers + AI rounds + document renderers → vector search + QA + regeneration job manager. Every integration point for this milestone is additive or involves enriching a single construction site (the `analysisFingerprint` string in `generate.ts`) without modifying any downstream API. The `RoundCache`, `AnalysisCache`, and `VectorStore` APIs remain unchanged. MCP tool handlers already accept injected dependencies, making them unit-testable without a real MCP server.

**Major components involved in this milestone:**
1. `src/cache/git-fingerprint.ts` (NEW) — computes git-HEAD-aware SHA-256 fingerprint; called at one callsite in `generate.ts` before `RoundCache.computeHash()`, no downstream API changes
2. `src/vector/vector-store.ts` (MODIFY) — adds `getDocTypeSummary()` method for zero-results guidance; pure SQL addition, no schema migration
3. `src/vector/query-engine.ts` (MODIFY) — zero-results path populates optional `availableDocTypes` in `SearchDocumentsResult`; additive field, no breaking change
4. `src/mcp/tools.ts` (MODIFY) — exposes `content` (top 3 results only) and `docType` in `semantic_search` response; additive fields, full content limited to top 3 to avoid 25KB+ payloads
5. Test files (NEW, ~10-15 files) — colocated at `src/module/file.test.ts` following existing convention; use `memfs`, `vi.mock('simple-git')`, and `createMockProvider()`

**Key architectural constraints:**
- All new test files MUST be at `src/**/*.test.ts` — files in `tests/integration/` are excluded from coverage measurement by the vitest `include` pattern
- The `cache.mode` config key in `src/config/schema.ts` must be optional with a `content-hash` default so existing `.handover.yml` files work without modification
- MCP tool modifications must have test coverage before production code changes (Phase 1 creates `mcp/tools.test.ts`; Phase 3 modifies `mcp/tools.ts`)

### Critical Pitfalls

1. **Coverage exclusion creep produces a fake 90%** — the exclusion list is already large (40+ paths); adding more during the coverage phase raises the percentage on a shrinking denominator. Mitigation: freeze the exclusion list before writing any new tests; require explicit written justification for any new exclusion; track eligible LOC alongside the percentage. The single zero-effort improvement: add `src/providers/gemini.ts` to exclusions (currently 0% coverage, should be excluded like `anthropic.ts` and `openai-compat.ts`).

2. **Mock-only tests that count coverage but test nothing** — replacing every dependency with `vi.mock()` and asserting only `toHaveBeenCalledWith()` raises line counts but has near-zero regression value. Mitigation: use `memfs` (already installed) for filesystem logic; require output assertions in every new test, not only mock call assertions; the project's `createMockProvider()` factory is the established model.

3. **git-aware incremental detection silently misses untracked new files** — `git diff --name-only HEAD` is blind to untracked files. A user creates new source files without staging them; the incremental check concludes nothing changed. Mitigation: always pair `git.diff()` with `git.status()` and inspect the `not_added` (untracked) field; alternatively fall back to content-hash comparison when diff returns empty.

4. **Detached HEAD and shallow CI clones break incremental mode silently** — `git rev-parse HEAD` and branch-relative diffs fail or return unexpected results in detached HEAD state (common in GitHub Actions with `fetch-depth: 1`). Mitigation: check `StatusResult.detached` before any branch-relative operations; fall back gracefully to full content-hash mode with an explicit warning message; require `fetch-depth: 0` in CI checkout step when using incremental mode.

5. **sqlite-vec KNN always returns K results even when all are irrelevant** — the vec0 implementation has no distance threshold enforcement (open issue #165). Searching for a nonsense string returns `--top-k` results that look legitimate. Mitigation: surface raw distance scores alongside each result; emit a low-quality warning when the best-match cosine distance exceeds a configurable threshold; do not implement hard cutoffs as they silently return zero results for legitimate niche queries.

---

## Implications for Roadmap

Based on research, the four workstreams map cleanly to four sequential phases. The ordering is determined by dependency direction, not arbitrary preference.

### Phase 1: Test Infrastructure and Coverage Uplift

**Rationale:** Pure addition with zero regression risk. Builds the test harness that Phase 3 depends on. The existing 80% gate is currently failing; this must be fixed before the threshold can be raised. Starting here also establishes a test quality policy before it can be violated.
**Delivers:** All four coverage metrics at 90%+ (85%+ branches); `vitest.config.ts` thresholds raised incrementally (80 → 85 → 88 → 90); `json-summary` reporter added for GitHub Actions coverage comments; `gemini.ts` exclusion added immediately (zero-effort baseline improvement); new test files for `renderers/utils.ts`, `auth/resolve.ts`, `auth/pkce-login.ts`, `config/schema.ts`, `context/packer.ts`, `cache/round-cache.ts`, `analyzers/cache.ts`, `config/loader.ts`, `mcp/tools.ts`, `regeneration/job-manager.ts`
**Addresses:** 90%+ coverage gate (P1), branch coverage parity (P1), vitest reporter config
**Avoids:** Coverage exclusion creep (Pitfall 1) — freeze exclusion list at phase start; mock-only tests (Pitfall 2) — establish output-assertion policy before writing tests
**Constraint:** Raise thresholds in batches AFTER the corresponding tests pass, not before. Do not enable `autoUpdate` until vitest#9227 is resolved.

### Phase 2: Git-Aware Incremental Cache Invalidation

**Rationale:** Self-contained change at a single construction site (`analysisFingerprint` in `generate.ts`). No downstream API changes to `RoundCache`, `AnalysisCache`, or any MCP/vector code. The test harness from Phase 1 means `git-fingerprint.ts` gets immediate test coverage. Parallelizable with Phase 3 once Phase 1 is complete.
**Delivers:** `src/cache/git-fingerprint.ts` + unit tests; optional `cache.mode: git-aware` config key; git HEAD SHA mixed into round cache fingerprint; graceful degradation in non-git and detached HEAD environments with explicit fallback warnings
**Addresses:** `handover generate --since <ref>` / `--changed-only` (P1); incremental regeneration for power users with large codebases
**Uses:** `simple-git@^3.32.2` (already installed); `vi.mock('simple-git')` pattern established in `git-history.ts`
**Avoids:** Silent failure on untracked files (Pitfall 3) — pair `git.diff()` with `git.status()`; detached HEAD crash (Pitfall 4) — check `StatusResult.detached` before branch-relative operations; `src/regeneration/` wired without a contract (Pitfall 5) — define the shared runner interface before CLI integration
**Constraint:** `cache.mode` must default to `content-hash` for backward compatibility. Git-aware mode is opt-in. Non-git-repo fallback is silent, same pattern as `emptyGitResult()` in `analyzeGitHistory`.

### Phase 3: Search UX Polish

**Rationale:** Depends on Phase 1 test harness being in place before modifying `src/mcp/tools.ts`. VectorStore and query-engine changes are purely additive (new method, new optional response field). The zero-results experience requires `getDocTypeSummary()` before the CLI display can reference available types. Parallelizable with Phase 2 once Phase 1 is complete.
**Delivers:** `VectorStore.getDocTypeSummary()`; zero-results guidance with available doc types; color-coded relevance scores in search output; OSC8 clickable terminal links (TTY-gated, fallback to plain path); `content` + `docType` in MCP `semantic_search` response (full content for top 3 only); `--format json` flag; relevance distance warning when best match quality is poor; `--type` valid values shown in `--help`
**Addresses:** Search result quality signals (P1/P2), zero-results messaging (P1), OSC8 links (P2), MCP response enrichment, `--type` help text (P1)
**Implements:** Modified `vector-store.ts`, `query-engine.ts`, `mcp/tools.ts`, `cli/search.ts`
**Avoids:** KNN returning K irrelevant results without quality signals (Pitfall 6); filters against absent doc types producing silent zero results (Pitfall 7); full content for all MCP results (Anti-Pattern — limit to top 3 to stay under ~25KB)

### Phase 4: Documentation and Onboarding

**Rationale:** Documentation must be written last because it describes the final behavior of Phases 1–3. The auto-generation script (`generate-docs-command-reference.mjs`) picks up all new CLI flags from commander.js definitions automatically, so running `npm run docs:generate` at Phase 4 start gives a current command reference without manual updates.
**Delivers:** `docs/src/content/user/search.md`; `docs/src/content/user/regeneration.md`; `docs/src/content/contributor/testing.md`; `llms.txt` and `README.md` content updates; `docs/astro.config.mjs` sidebar additions; `handover init` TTY guard + `--yes` flag + existing-config detection; `starlight-links-validator` added to CI build
**Addresses:** Search user guide (P1), regeneration user guide, contributor testing guide (P2), `handover init` behavior documentation (P2)
**Avoids:** `handover init` hanging in non-TTY/CI environments (Pitfall 8); init overwriting existing config silently (Pitfall 9); broken Starlight doc links going undetected (Pitfall 10)
**Constraint:** `npm run docs:build` must be added as a required CI check so broken links block merge. Add `starlight-links-validator` before writing any new pages, not after.

### Phase Ordering Rationale

- Phase 1 must precede Phase 3: `src/mcp/tools.test.ts` created in Phase 1 must exist before `src/mcp/tools.ts` is modified in Phase 3
- Phases 2 and 3 are independent: git fingerprinting touches `generate.ts` and `config/schema.ts`; search UX touches `vector-store.ts`, `query-engine.ts`, `mcp/tools.ts`, and `cli/search.ts` — no shared files, safe to parallelize
- Phase 4 must come last: documents behaviors delivered by Phases 2 and 3; auto-generated command reference requires all CLI flags to be finalized
- Threshold increments in Phase 1 must be gated on test completion: raise only after the corresponding tests pass and coverage is confirmed above the new bar — never raise speculatively

### Research Flags

Phases likely needing verification during planning:

- **Phase 2 — source-to-document mapping:** The mapping table in FEATURES.md (source-file → analyzer → affected documents) is a design proposal, not verified against the current `DOCUMENT_REGISTRY` in `src/renderers/registry.ts`. A 30-minute audit of `registry.ts` and `src/orchestrator/dag.ts` is needed before implementing `--since` to confirm the `--only` integration point and which analyzers each renderer's `requiredRounds` depends on.
- **Phase 2 — regeneration module interface:** `src/regeneration/` was built for MCP and is not wired into the CLI. Pitfall 5 warns against ad-hoc wiring. A brief design spike to define the shared runner function (used by both CLI and MCP) should precede Phase 2 implementation — this is a design decision, not a research question, but it must happen before coding starts.
- **Phase 3 — OSC8 terminal detection:** Confirm the `TERM_PROGRAM` and `TERM` environment variable heuristics for OSC8 support are correct for the target terminal set (iTerm2, Ghostty, Warp, Windows Terminal). The OSC8 spec gist is the reference; validate the detection logic against it before shipping.

Phases with standard, well-documented patterns (lighter research needed):

- **Phase 1:** Coverage threshold configuration, `memfs` mocking, `vi.mock('simple-git')` — all established patterns with official Vitest docs and existing codebase precedents. No novel decisions required.
- **Phase 4:** Starlight page addition, sidebar config, and Pagefind indexing — fully documented in official Starlight guides. New pages require only `.md` files and sidebar entries; Pagefind indexes automatically on next `astro build`.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies already installed and validated in the codebase; coverage baseline from live `vitest --coverage` run on 2026-03-01; only new devDep (`strip-ansi`) is low-risk and optional |
| Features | HIGH | Coverage numbers from live run against actual codebase; feature list confirmed against actual source files; prioritization from direct code review of 145 source files and 21 test files |
| Architecture | HIGH | All findings from direct codebase inspection; integration points identified at specific file + line number precision; data flows traced through actual code, not inferred |
| Pitfalls | HIGH | Coverage anti-patterns from official Vitest docs + community post-mortems; git edge cases from git-scm docs and simple-git changelog; sqlite-vec pitfalls from upstream issue tracker and primary author blog |

**Overall confidence:** HIGH

### Gaps to Address

- **Source-to-document dependency mapping (Phase 2):** The static lookup table in FEATURES.md is a design proposal. Verify the exact `analyzer → document` relationships against `src/renderers/registry.ts` before implementing `--since`. This is a 30-minute audit.
- **`autoUpdate` timeline:** vitest#9227 blocks enabling `thresholds.autoUpdate`. Monitor vitest 4.x release notes; enable it the moment the fix ships to permanently lock in the 90% floor without manual threshold bumps.
- **Shallow clone CI behavior (Phase 2):** The pitfalls research recommends `fetch-depth: 0` in GitHub Actions for incremental mode. Verify the current `.github/workflows/ci.yml` checkout step depth before Phase 2 ships, and document the requirement explicitly.
- **`src/regeneration/` CLI integration design (Phase 2):** The module has no CLI integration today. Define the shared runner function interface (used by both CLI and MCP) as a design decision at the start of Phase 2, before any implementation code is written.

---

## Sources

### Primary (HIGH confidence)
- Live `vitest --coverage` run on handover codebase (2026-03-01) — all coverage baseline numbers; confirms the 80% gate is currently failing on all four metrics
- Direct codebase inspection: `src/cli/generate.ts`, `src/cache/round-cache.ts`, `src/analyzers/cache.ts`, `vitest.config.ts`, `src/mcp/tools.ts`, `src/vector/query-engine.ts`, `src/vector/vector-store.ts`, `src/analyzers/git-history.ts`, `src/providers/__mocks__/index.ts`, `.github/workflows/ci.yml`, `package.json`
- https://vitest.dev/guide/coverage — V8 vs Istanbul, AST-based remapping since v3.2.0 (official Vitest docs)
- https://vitest.dev/config/coverage — `thresholds`, `autoUpdate`, `perFile`, `reporter` config reference (official Vitest docs)
- https://github.com/vitest-dev/vitest/issues/9227 — `autoUpdate` bug that strips newlines on config rewrite (upstream issue, open as of 2026-03-01)
- https://git-scm.com/docs/git-diff — untracked file limitations in git diff (official git-scm docs)
- https://github.com/steveukx/git-js — simple-git API, changelog, TypeScript signatures (official repository)
- https://starlight.astro.build/guides/site-search/ — Pagefind built-in, zero-config (official Starlight docs)
- https://vitest.dev/guide/mocking/file-system — `memfs` + `vi.mock('node:fs')` recommended pattern (official Vitest docs)

### Secondary (MEDIUM confidence)
- https://clig.dev/ — Command Line Interface Guidelines; UX patterns for search output, help text, non-TTY handling (authoritative community reference)
- https://github.com/asg017/sqlite-vec/issues/165 — sqlite-vec distance threshold constraint tracking issue (upstream issue tracker, open)
- https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html — authoritative sqlite-vec pitfalls (written by the sqlite-vec author)
- https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda — OSC8 escape sequence specification and terminal support matrix
- https://www.npmjs.com/package/strip-ansi — v7.1.2, ESM-only (npm registry)

### Tertiary (LOW confidence)
- https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays — CLI UX progress display patterns; useful for search output design but needs validation against the project's specific piped-output requirements
- https://github.com/withastro/starlight/discussions/946 — Starlight broken link validator community discussion; the validator exists and is recommended, but the integration steps need verification against the current Starlight version

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*
