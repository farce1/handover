# Feature Research

**Domain:** TypeScript CLI tool — test coverage uplift, git-aware incremental regeneration, search/QA UX polish, documentation/onboarding enhancements
**Researched:** 2026-03-01
**Confidence:** HIGH (vitest docs verified via official source; git patterns confirmed via simple-git already in codebase; CLI UX confirmed via clig.dev; all coverage numbers from live `vitest --coverage` run on actual codebase)

## Context: What Already Exists

The existing Handover CLI already has:
- 254 tests in 21 `.test.ts` files across 145 source files
- Coverage threshold at 80% (lines/functions/branches/statements), currently failing: 79% lines, 67% branches
- `src/analyzers/git-history.ts` using `simple-git` for branch/commit analysis
- `src/vector/reindex.ts` with content-hash change detection against stored SQLite fingerprints
- `handover search` with fast mode (semantic retrieval) and qa mode (grounded Q&A)
- `handover reindex` with `--force` flag to bypass change detection
- `docs/src/content/docs/user/` with 5 Astro/Starlight guides
- `docs/src/content/docs/reference/commands.mdx` auto-generated from CLI help output
- `src/cli/onboarding.ts` and `src/cli/init.ts` for first-run experience

Everything below describes only features for the NEW milestone.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that developers expect in a mature TypeScript CLI tool. Missing these makes the project feel incomplete or unreliable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **90%+ test coverage gate** | Professional npm packages use 90%+ as the industry standard; 80% is widely considered the baseline minimum, not a target | MEDIUM | Current state: 21 test files for 145 source files; live run shows 67% branch coverage. Gap is concentrated in `renderers/utils.ts` (63%), `auth/resolve.ts` (72%), `context/packer.ts` (88%), `ai-rounds/validator.ts` (83%). Requires new tests for branch paths, not wholesale rewrites. |
| **Branch coverage parity** | Statement/line coverage hitting 90% while branch coverage stays at 67% is a code quality smell; reviewers notice the gap | MEDIUM | V8 provider (in use) does not track implicit `if` branches without an `else`; Istanbul would catch more. Using `/* v8 ignore next */` for intentional omissions is the correct pattern; do not over-use. |
| **`handover generate --since <ref>` or `--changed-only`** | Power users regenerating docs after small edits expect only touched documents to re-run; full regeneration on every save is prohibitive for large codebases | HIGH | Requires: (1) `git diff --name-only <ref>` via simple-git to get changed source files, (2) map source files to which of the 14 document renderers are affected, (3) pass filtered renderer list to DAG orchestrator. The `analyzeGitHistory` module already uses simple-git; the pattern is established. |
| **`handover search` result count line** | "Showing 5 of 23 results" is the universal pattern for search results; the current output already includes this but should be consistent across all output paths | LOW | Already present in `runFastMode` — `Showing ${result.matches.length} of ${result.totalMatches} results`. Needs audit: is this present for empty results, QA mode, and piped output? |
| **Search index status in `reindex` output** | Developers running `handover reindex` need to know what changed: X docs processed, Y skipped, Z chunks created | LOW | `ReindexResult` already returns all fields (`documentsProcessed`, `documentsSkipped`, `chunksCreated`, etc.); the CLI just needs to render them clearly as a summary table or stats block |
| **`handover search` --type completions in --help** | Users don't know what type names are valid; the help text currently says only "Filter by document type (repeatable)" with no list of valid values | LOW | Valid types derive from document filenames (`architecture`, `modules`, `dependencies`, etc.); hard-code or derive them and show in help text |
| **User guide for `handover search`** | Existing docs cover `getting-started`, `configuration`, `providers`, `output-documents`, `mcp-setup` — but there is no guide explaining search, QA mode, and reindex | MEDIUM | Missing guide is the most obvious gap in docs; users must discover search by trial and error |
| **User guide for `handover init` behavior** | The `init` command creates `.handover.yml` with interactive prompts but this is not explained in any doc page | LOW | Can be folded into `getting-started.md` or a new `init.md` |

### Differentiators (Competitive Advantage)

Features that make this CLI stand out beyond baseline correctness.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Git-aware regeneration using file-to-document mapping** | No other documentation CLI regenerates only the documents affected by recent git changes; typical tools either regenerate everything or nothing | HIGH | The core insight: each of the 14 renderers depends on specific analysis results (e.g., renderer 3 reads `ast` and `gitHistory`; renderer 7 reads `dependencies`). A static mapping from `AnalysisContext` fields to document IDs enables a precise "which docs need updating" calculation. |
| **Diff-to-renderer dependency graph** | When `src/analyzers/dependency-graph.ts` changes, only the dependencies document needs regeneration; this kind of surgical precision is novel in the space | HIGH | Requires building a `source-file-pattern → analyzer → document` dependency map. The `analyzeGitHistory` module already identifies `mostChangedFiles` — the new work is using this in the generate pipeline. |
| **`handover search` result file links (OSC8 clickable terminal paths)** | Modern terminals (iTerm2, Ghostty, Warp) support OSC8 hyperlinks; clicking a search result and jumping to the file is a markedly better experience than copy-pasting paths | MEDIUM | OSC8 escape sequence: `\x1b]8;;file:///absolute/path\x1b\\link text\x1b]8;;\x1b\\`. Detect via `TERM_PROGRAM`, `TERM`, and fall back to plain text. Only a TTY enhancement; piped output stays plain. |
| **QA session timing and token stats** | Showing "Answer generated in 2.3s using 1,240 tokens from 4 sources" gives users cost and latency awareness; no other CLI in this space shows this | LOW | `answerQuestion` in `src/qa/answerer.ts` returns `citations`; timing can be added at the `runQaMode` wrapper level; token counts are available from the provider call |
| **Vitest `autoUpdate` threshold** | Setting `coverage.thresholds.autoUpdate: true` ratchets the threshold upward automatically when coverage improves, preventing regression without manual config updates | LOW | This is a Vitest v2.x feature. Set it once; it self-maintains. Combined with raising the threshold to 90% in this milestone, it permanently locks in higher standards. |
| **New contributor setup guide** | Documenting the test architecture, coverage exclusion rationale, and "how to add a test for module X" pattern removes friction for contributors | MEDIUM | Currently `docs/src/content/docs/contributor/development.md` exists but does not explain the coverage exclusion list in `vitest.config.ts` or how to write tests for the integration-excluded modules |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like good ideas but create problems in this specific codebase context.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Remove all coverage exclusions and test integration modules** | "Real" 90% coverage should include the CLI commands and providers | CLI commands (generate, search, reindex) require a live LLM API key and a filesystem; running them in CI would mean real API spend and environment setup that defeats unit test isolation | Keep the exclusion list but document the rationale explicitly; add integration test suite as a separate `npm run test:integration` target with a clear "requires real API key" guard |
| **Git-dirty check (refuse to run if working tree is dirty)** | "Safer" to only generate docs from clean commits | Developers almost always run handover on a dirty working tree while iterating; blocking this causes constant friction | Only warn (not block) when git status is dirty; make the warning informational |
| **Interactive `handover search` REPL mode** | "Better UX" to stay in a search loop rather than re-invoking the CLI | The streaming QA sessions already exist; a full REPL adds readline complexity that conflicts with TTY detection and piped-output compatibility | The existing `--mode qa` with streaming handles the multi-turn pattern; document it well |
| **Coverage badge in README from external service** | Visual credibility signal | External badge services add flakiness; Codecov is already integrated via CI and lcov; a badge that diverges from CI gate creates confusion | Show the Codecov badge (already wired) and let the CI gate enforce the threshold; the badge will auto-update |
| **Per-file 100% coverage requirements** | "High confidence" in individual critical modules | Per-file 100% thresholds are brittle; adding any new uncovered line in a hot module breaks CI; the cognitive overhead of maintaining is high | Use global 90% threshold with `autoUpdate`; only use `/* v8 ignore */` annotations on provably untestable branches (e.g., defensive error catches) |

---

## Feature Dependencies

```
[90%+ coverage gate]
    └──requires──> [New test suites for uncovered modules]
                       └──targets──> [renderers/utils.ts] (63% → 90%)
                       └──targets──> [auth/resolve.ts] (72% → 90%)
                       └──targets──> [context/packer.ts] (88% → 90%)
                       └──targets──> [ai-rounds/validator.ts] (83% → 90%)
    └──requires──> [Branch coverage improvement in validator.ts, packer.ts]
    └──enhances──> [vitest autoUpdate threshold config]

[git-aware incremental regeneration]
    └──requires──> [source-file → analyzer → document mapping]
    └──requires──> [simple-git diff integration] (simple-git already in use)
    └──requires──> [--since <ref> flag in handover generate]
    └──integrates-with──> [existing DAG orchestrator] (src/orchestrator/)
    └──integrates-with──> [existing AnalysisCache] (src/analyzers/cache.ts)

[search UX improvements]
    └──requires──> [OSC8 terminal link detection] (TTY-only)
    └──requires──> [QA mode timing wrapper]
    └──enhances──> [existing runFastMode output] (result stats already present)
    └──enhances──> [existing runQaMode output] (add elapsed time, token count)

[search user documentation]
    └──requires──> [search UX improvements] (doc should reflect final output format)
    └──extends──> [existing docs/user/ Astro/Starlight site]

[contributor guide expansion]
    └──requires──> [90%+ coverage gate] (guide documents the new threshold)
    └──extends──> [existing contributor/development.md]
```

### Dependency Notes

- **Coverage work is prerequisite to documentation:** The contributor guide section on testing should describe the final coverage setup, so the tests must be written before the guide is finalized.
- **Git-aware regeneration is independent of search/docs work:** Can be phased separately; shares no code with the search UX or documentation changes.
- **OSC8 links require TTY detection already present:** `src/cli/search.ts` already uses `process.stdout.isTTY` to conditionally apply bold styling; OSC8 detection follows the same pattern.
- **simple-git is already a production dependency** (used in `src/analyzers/git-history.ts`); no new dependency for git-aware regeneration.

---

## MVP Definition

### Launch With (this milestone)

Minimum scope that delivers the milestone value.

- [ ] **Raise coverage threshold to 90%** — vitest.config.ts thresholds: lines/functions/branches/statements: 90; add `autoUpdate: true`
- [ ] **New test suites for the five coverage gaps** — `renderers/utils.test.ts`, `auth/resolve.test.ts` expansion, `context/packer.test.ts` expansion, `ai-rounds/validator.test.ts` expansion, `ai-rounds/quality.test.ts` expansion
- [ ] **`handover generate --since <ref>`** — git diff + source-to-document map; only reruns affected documents
- [ ] **Reindex summary output** — structured stats block: docs processed/skipped/failed, chunks created, model used
- [ ] **`handover search` --type help text** — list valid type names in `--help` output
- [ ] **New `docs/user/search.md`** — covers fast mode, QA mode, `--type` filters, `--top-k`, examples
- [ ] **OSC8 clickable file links in search output** — TTY-gated; falls back to plain path

### Add After Validation (v1.x)

- [ ] **QA mode timing and token stats** — trigger: user feedback requesting cost/latency awareness
- [ ] **Contributor guide: testing section** — trigger: first external PR that breaks coverage threshold
- [ ] **Diff-to-renderer dependency graph (precise)** — trigger: users with large codebases report full regeneration is too slow
- [ ] **`handover init` guide** — trigger: user confusion reports about what `init` does vs `generate`

### Future Consideration (v2+)

- [ ] **Integration test suite (`test:integration`)** — deferred: requires real API key, env setup, and isolated test fixtures; high setup cost
- [ ] **REPL-mode search** — deferred: the streaming QA session already handles the primary use case
- [ ] **Coverage per-subsystem breakdown in CI output** — deferred: Codecov already provides this; duplication

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| 90%+ coverage gate + new tests | HIGH | MEDIUM | P1 |
| git-aware incremental regeneration | HIGH | HIGH | P1 |
| `handover search` documentation page | HIGH | LOW | P1 |
| Reindex summary output | MEDIUM | LOW | P1 |
| `--type` valid values in --help | MEDIUM | LOW | P1 |
| OSC8 clickable file links | MEDIUM | MEDIUM | P2 |
| vitest `autoUpdate` threshold | LOW | LOW | P1 |
| QA mode timing + token stats | MEDIUM | LOW | P2 |
| Contributor testing guide | LOW | LOW | P2 |
| `handover init` guide | LOW | LOW | P2 |
| Precise diff-to-renderer dependency graph | HIGH | HIGH | P3 |
| Integration test suite | HIGH | HIGH | P3 |

**Priority key:**
- P1: Required for milestone acceptance
- P2: Should have; add within milestone if scope allows
- P3: Defer to next milestone

---

## Coverage Gap Analysis (Current State)

From live `vitest --coverage` run against the codebase:

| Module | Lines | Branches | Functions | Gap Type |
|--------|-------|----------|-----------|----------|
| `renderers/utils.ts` | 63% | 58% | 67% | Missing tests entirely |
| `auth/resolve.ts` | 78% | 73% | 71% | Token refresh and OAuth paths |
| `auth/pkce-login.ts` | 75% | 50% | 75% | PKCE exchange branches |
| `context/packer.ts` | 88% | 78% | 88% | Oversized file two-pass path |
| `ai-rounds/validator.ts` | 83% | 59% | 100% | Branch paths in import/claim validation |
| `auth/token-store.ts` | 90% | 88% | 100% | Edge cases in serialization |
| `vector/chunker.ts` | 99% | 85% | 100% | Fine-grained header parsing edge |

**Global gap:** Branch coverage is 67.77% vs the new 90% target. The largest contributor is `auth/resolve.ts` and `ai-rounds/validator.ts`. These modules have clear pure-function logic that is testable with mocked inputs; the low coverage is a gap in test authorship, not architectural constraint.

**Exclusion list health:** The existing exclusion list in `vitest.config.ts` is well-justified. CLI commands, providers, vector store, and MCP runtime all require live external dependencies. Do not remove exclusions — document them.

---

## Git-Aware Regeneration: Source-to-Document Mapping

The core data structure needed for `--since`:

```
Source file pattern → Analyzer → Documents affected
─────────────────────────────────────────────────────
src/analyzers/**    → ast          → modules (06), architecture (03), features (05)
package.json        → dependencies → dependencies (07)
*.ts                → ast, git     → overview (01), edge-cases (09), conventions (11)
*.md, docs/**       → doc-analysis → getting-started (02), deployment (13)
src/**              → git-history  → all 14 (git metadata appears in many docs)
.env*, Dockerfile   → env-scanner  → environment (08)
*test*, *.test.ts   → test-analyzer → testing-strategy (12)
```

This mapping is static and can be hardcoded as a lookup table in the generate pipeline. The git diff provides changed source files; the table maps those to affected document IDs; the DAG orchestrator receives only those IDs via `--only`.

**Integration point:** `src/cli/generate.ts` already supports `--only <docs>` (comma-separated aliases). The `--since <ref>` flag would compute the `--only` list automatically using simple-git + the mapping table.

---

## Search UX: Current Output vs Target Output

**Current fast mode output:**
```
Mode: fast (retrieval-only semantic search)
Embedding route: mode local-first, provider local (preferred)

Result 1
rank: 1
relevance: 92.00%
source: 03-ARCHITECTURE.md
section: # Architecture > ## DAG Orchestrator
snippet: The DAG orchestrator manages concurrent...

Showing 3 of 3 results (top-k requested: 10).
```

**Target fast mode output (this milestone):**
```
Mode: fast (retrieval-only semantic search)

Result 1                                                    [92%]
source: 03-ARCHITECTURE.md (clickable OSC8 link in TTY)
section: # Architecture > ## DAG Orchestrator
snippet: The DAG orchestrator manages concurrent...

Result 2                                                    [87%]
...

─────────────────────────────────────────────────────────────
3 results  (top-k: 10)  embedding: local/nomic-embed-text
Valid --type values: architecture, modules, dependencies, overview, ...
```

Key changes:
1. Relevance score on same line as result header (scannable at a glance)
2. OSC8 hyperlink on source file (TTY-only)
3. Stats line moved to footer and condensed
4. Valid `--type` values shown when no `--type` was used (discoverability)

---

## Sources

- [Vitest Coverage Guide — vitest.dev](https://vitest.dev/guide/coverage.html) — thresholds, autoUpdate, per-file config, V8 vs Istanbul
- [Vitest Coverage Config Reference — vitest.dev](https://vitest.dev/config/coverage) — all coverage config options
- [Command Line Interface Guidelines — clig.dev](https://clig.dev/) — output design, help text, error messaging, onboarding patterns
- [CLI UX Best Practices — Evil Martians blog](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays) — progress display patterns
- [OSC8 Terminal Hyperlinks — Hyperlinks in Terminal Emulators gist](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda) — OSC8 escape sequence specification and terminal support matrix
- [Node.js CLI Apps Best Practices — lirantal/nodejs-cli-apps-best-practices](https://github.com/lirantal/nodejs-cli-apps-best-practices) — npm CLI best practices
- Live `vitest --coverage` run on handover codebase (2026-03-01) — all coverage numbers are direct measurements
- `src/cli/search.ts`, `src/vector/reindex.ts`, `src/analyzers/git-history.ts` — current implementation reviewed directly

---
*Feature research for: test coverage uplift, git-aware incremental regeneration, search/QA UX polish, documentation/onboarding*
*Researched: 2026-03-01*
