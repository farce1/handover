# Architecture Research

**Domain:** TypeScript CLI — test coverage uplift, git-aware incremental regeneration, search UX polish, documentation
**Researched:** 2026-03-01
**Confidence:** HIGH (all findings from direct codebase inspection)

## Standard Architecture

### System Overview (Existing)

```
+-----------------------------------------------------------------+
|                     CLI Layer (src/cli/)                        |
|  generate  search  reindex  serve  init  auth  analyze  estimate|
+---------------------------+------------------------------------+
                            |
+---------------------------v------------------------------------+
|               DAG Orchestrator (src/orchestrator/)             |
|   dag.ts: Kahn's algorithm, parallel branches, skip-on-fail    |
+--+-------------------------+----------------------------+------+
   |                         |                            |
   v                         v                            v
+----------+     +---------------------+     +---------------------+
| Static   |     | AI Rounds 1-6       |     | Document Render     |
| Analysis |     | (src/ai-rounds/)    |     | (src/renderers/)    |
| 8 analyz-|     | runner.ts drives    |     | 14 renderers, par-  |
| ers in   |     | LLM calls via       |     | allel Promise.all-  |
| src/ana- |     | provider.complete() |     | Settled, write to   |
| lyzers/  |     | wrapWithCache wraps |     | outputDir           |
+----+-----+     | each round step     |     +---------------------+
     |           +----------+----------+
     v                      v
+-----------+   +-------------------------+
|AnalysisCa-|   | RoundCache              |
|che        |   | .handover/cache/        |
|.handover/ |   | rounds/round-N.json     |
|cache/     |   | SHA-256 fingerprint +   |
|analysis.  |   | cascade chain (CACHE-02)|
|json       |   +-------------------------+
+-----------+

+----------------------------------------------------------------+
|                   MCP Server (src/mcp/)                        |
|  stdio or HTTP transport  |  6 tools registered               |
|  semantic_search  regenerate_docs  regenerate_docs_status      |
|  qa_stream_start  qa_stream_status  qa_stream_resume/cancel    |
+------------------------------+---------------------------------+
                               |
              +----------------+-------------------+
              v                v                   v
+------------------+  +--------------+  +---------------------+
| Vector Search    |  | QA Sessions  |  | RegenerationJobMgr  |
| (src/vector/)    |  | (src/qa/)    |  | (src/regeneration/) |
| sqlite-vec at    |  | streaming    |  | spawns CLI child    |
| .handover/       |  | answer       |  | process, job store, |
| search.db        |  | sessions     |  | dedupe, polling     |
+------------------+  +--------------+  +---------------------+
```

### Component Responsibilities

| Component | Responsibility | Key Files |
|-----------|---------------|-----------|
| `src/cli/generate.ts` | Pipeline orchestration, cache wiring, display state | `generate.ts` (1055 lines, integration nexus) |
| `src/orchestrator/dag.ts` | Kahn's algorithm DAG, parallel execution, skip-on-fail | `dag.ts`, `step.ts` |
| `src/analyzers/coordinator.ts` | Runs 8 static analyzers with onProgress callback | `coordinator.ts`, `git-history.ts`, `ast-analyzer.ts`, etc. |
| `src/cache/round-cache.ts` | SHA-256 fingerprint + cascade chain for AI rounds | `round-cache.ts` |
| `src/analyzers/cache.ts` | Per-file content hash for incremental context packing | `cache.ts` |
| `src/ai-rounds/runner.ts` | Single-round execution: retry, quality check, fallback | `runner.ts` |
| `src/context/packer.ts` | Scores files, packs into token budget; accepts changedFiles set | `packer.ts`, `scorer.ts` |
| `src/renderers/registry.ts` | DOCUMENT_REGISTRY of 14 renderers, aliases, requiredRounds | `registry.ts` |
| `src/vector/query-engine.ts` | Embedding routing, VectorStore search, type filtering | `query-engine.ts` |
| `src/vector/chunker.ts` | Markdown-aware chunker (header/code/table boundaries) | `chunker.ts` |
| `src/mcp/tools.ts` | MCP tool registration: search, QA, regeneration | `tools.ts` |
| `src/mcp/regeneration-executor.ts` | Spawns `handover generate/reindex` child process | `regeneration-executor.ts` |
| `src/regeneration/job-manager.ts` | Job lifecycle state machine, dedup by target | `job-manager.ts`, `job-store.ts` |
| `src/providers/` | Factory pattern, 8 LLM provider impls, base interface | `factory.ts`, `base.ts`, `__mocks__/index.ts` |
| `src/config/schema.ts` | Zod schema for `.handover.yml` with full defaults | `schema.ts`, `loader.ts` |

---

## New Feature Integration Points

### 1. Test Coverage Uplift (to 90%+)

**Current state.** `vitest.config.ts` excludes 40+ files from coverage measurement. Current threshold is 80%. The CI workflow runs `npm test -- --coverage` and uploads lcov.info to Codecov. 21 test files exist today at `src/**/*.test.ts`.

**What already exists as test harness:**
- `createMockProvider()` factory at `src/providers/__mocks__/index.ts` — typed mock for `LLMProvider`
- `memfs` in devDependencies for filesystem mocking
- `vitest-mock-extended` for typed deep mocks
- `vi.hoisted()` pattern documented in the mock factory file
- All 21 existing tests use colocated `src/module/file.test.ts` naming

**Integration approach — what changes vs what is new:**

| File | Change Type | What |
|------|------------|------|
| `vitest.config.ts` | MODIFY | Remove exclusions for pure-function modules; raise threshold from 80% to 90% incrementally |
| `src/cache/round-cache.test.ts` | NEW | Unit test `RoundCache` using `memfs` to mock `node:fs/promises`; cover get/set/clear/getCachedRounds/computeHash/wasMigrated/ensureGitignored |
| `src/analyzers/cache.test.ts` | NEW | Unit test `AnalysisCache` using `memfs`; cover load/save/isUnchanged/update/getChangedFiles |
| `src/mcp/tools.test.ts` | NEW | Inject mock `searchFn`, mock `RegenerationJobManager`, mock QA session manager; test all tool handler branches |
| `src/regeneration/job-manager.test.ts` | NEW | Unit test job lifecycle state machine (queued/running/completed/failed); use mock runner function |
| `src/renderers/render-*.test.ts` (selected) | NEW | Pure-function renderers accept `RenderContext`; test by constructing minimal typed context |
| `src/config/loader.test.ts` | NEW | Mock `node:fs` with memfs; test env-var overrides, missing file behavior, YAML parse errors |
| `src/analyzers/git-history.test.ts` | NEW | Mock `simple-git` module; test branch pattern detection, commit parsing, graceful non-repo handling |

**Modules that stay excluded from unit coverage (require real I/O or heavy SDKs):**
- `src/vector/vector-store.ts` — requires real SQLite + sqlite-vec WASM bindings
- `src/vector/embedder.ts`, `local-embedder.ts` — require real HTTP endpoint or WASM model
- `src/providers/anthropic.ts`, `openai-compat.ts` — require real SDK initialization
- `src/mcp/regeneration-executor.ts` — spawns real child processes via `node:child_process`
- `src/cli/generate.ts`, `src/cli/serve.ts` — full pipeline integration, test in `tests/integration/`

These stay in `tests/integration/` only. Do not remove their coverage exclusions.

**Incremental threshold strategy:**
```
Phase start  :  lines/functions/branches/statements: 80
After batch 1 (cache + config):    raise to 85
After batch 2 (renderers + regen): raise to 88
After batch 3 (mcp tools + analyzers): raise to 90
```

The threshold lives in `vitest.config.ts` under `coverage.thresholds`. Raise it only after the new tests pass and coverage is confirmed above the new bar.

---

### 2. Git-Aware Incremental Regeneration

**Current state.** Two independent cache mechanisms exist:

1. `AnalysisCache` (`src/analyzers/cache.ts`) — per-file content hash at `.handover/cache/analysis.json`. Already computes `changedFiles` set and passes it to `packFiles()` for incremental context packing (see `generate.ts` lines 490-534).

2. `RoundCache` (`src/cache/round-cache.ts`) — computes `analysisFingerprint` from ALL file content hashes via `computeAnalysisFingerprint()`. Any file change invalidates all 6 round caches even for unrelated changes.

**The gap:** The round cache uses a whole-repo fingerprint. Adding a git HEAD SHA to this fingerprint adds a natural invalidation boundary at commit granularity, and surfaces git-derived context (which files actually changed since last commit) for smarter cache decisions.

**New component: `src/cache/git-fingerprint.ts`**

```typescript
// NEW FILE: src/cache/git-fingerprint.ts
import { createHash } from 'node:crypto';
import { simpleGit } from 'simple-git';

export interface GitState {
  headCommit: string;   // HEAD SHA, empty string if not a git repo
  isGitRepo: boolean;
}

export async function getGitState(rootDir: string): Promise<GitState> {
  try {
    const git = simpleGit(rootDir);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return { headCommit: '', isGitRepo: false };
    const headCommit = await git.revparse(['HEAD']);
    return { headCommit: headCommit.trim(), isGitRepo: true };
  } catch {
    return { headCommit: '', isGitRepo: false };
  }
}

export function computeGitAwareFingerprint(
  files: Array<{ path: string; contentHash: string }>,
  headCommit: string,
): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const data = sorted.map(f => `${f.path}:${f.contentHash}`).join('\n');
  return createHash('sha256')
    .update(data)
    .update(headCommit)  // mix in HEAD SHA; empty string is safe (degrades to content-only)
    .digest('hex');
}
```

**Integration point: `src/cli/generate.ts`** (static-analysis step, lines 468-481)

```typescript
// MODIFY: after computing fileEntries, before assigning analysisFingerprint
import { getGitState, computeGitAwareFingerprint } from '../cache/git-fingerprint.js';

const gitState = await getGitState(rootDir);
analysisFingerprint = gitState.isGitRepo
  ? computeGitAwareFingerprint(fileEntries, gitState.headCommit)
  : RoundCache.computeAnalysisFingerprint(fileEntries);  // existing fallback
```

This is the only callsite change. `RoundCache.computeHash()` signature is unchanged — it receives an already-computed fingerprint string.

**Optional config key (`src/config/schema.ts`):**

```typescript
// ADDITIVE: new optional field in HandoverConfigSchema
cache: z.object({
  mode: z.enum(['content-hash', 'git-aware']).default('content-hash'),
}).default({ mode: 'content-hash' }).optional(),
```

When `cache.mode = 'git-aware'`, the generate step calls `computeGitAwareFingerprint`. Default remains `content-hash` for backward compatibility — no existing `.handover.yml` needs updating.

**Data flow:**
```
git HEAD SHA + file content hashes
        |
computeGitAwareFingerprint()  OR  computeAnalysisFingerprint() (fallback)
        |
analysisFingerprint (string)
        |
RoundCache.computeHash(roundNum, model, analysisFingerprint, priorHashes)
        |
round-N.json cache lookup: hit skips API call, miss triggers executeRound()
```

**What is NOT changed:** The cascade chain mechanism (`priorRoundHashes` in `RoundCache`), `RoundCache` API surface, `AnalysisCache` behavior, or any renderer/MCP code.

---

### 3. Search UX Enhancements

**Current state.** `searchDocuments()` returns `SearchDocumentsResult` with `matches[]` containing `relevance`, `sourceFile`, `sectionPath`, `contentPreview` (200 chars), and full `content`. Type filtering uses Levenshtein fuzzy suggestions. The MCP `semantic_search` tool exposes only `{ relevance, source, section, snippet }`. There is no zero-results guidance.

**Integration points for UX improvements:**

**A. Zero-results suggestion — new `VectorStore.getDocTypeSummary()` method**

This is a pure additive extension to the existing `VectorStore` class in `src/vector/vector-store.ts`. No schema migration required:

```typescript
// ADD to VectorStore class in src/vector/vector-store.ts
getDocTypeSummary(): Array<{ docType: string; chunkCount: number }> {
  return this.db
    .prepare('SELECT doc_type AS docType, COUNT(*) AS chunkCount FROM chunks GROUP BY doc_type ORDER BY chunkCount DESC')
    .all() as Array<{ docType: string; chunkCount: number }>;
}
```

**B. Zero-results path in `src/vector/query-engine.ts`**

After the search returns empty rows, surface available doc types:

```typescript
// MODIFY in searchDocuments() after vectorStore.search():
if (rows.length === 0) {
  const available = vectorStore.getDocTypeSummary();
  // Attach to result for CLI/MCP to use in user guidance
  return { ...result, availableDocTypes: available };
}
```

The `SearchDocumentsResult` type gains an optional `availableDocTypes` field (additive, no breaking change).

**C. MCP `semantic_search` response — expose `content` and `docType`**

Current handler in `src/mcp/tools.ts` maps matches to `{ relevance, source, section, snippet }`. Adding full content for top results and docType for all is additive:

```typescript
// MODIFY in registerMcpTools() semantic_search handler
results: result.matches.map((match, i) => ({
  relevance: match.relevance,
  source: match.sourceFile,
  section: match.sectionPath,
  snippet: match.contentPreview,
  content: i < 3 ? match.content : undefined,  // full content for top 3 only
  docType: match.docType,                        // always include for client filtering
})),
```

Limit full content to top 3 results to avoid oversized MCP response payloads (50 results * ~500 char chunks = ~25KB without limit).

**D. CLI search formatting (`src/cli/search.ts`)**

This command is excluded from unit coverage and handles terminal display. Improvements are purely presentational: color-coded relevance banding (green >80%, yellow 50-80%, dim <50%), section path breadcrumbs, grouped by doc type. No changes to the query engine interface needed.

**E. `--format json` flag for `handover search`**

Adds programmatic output for scripting. Pure CLI layer addition at `src/cli/search.ts` and `src/cli/index.ts` command registration. The `generate-docs-command-reference.mjs` script picks up new flags automatically from commander.js definitions.

---

### 4. Documentation and Onboarding

**Current state.** Documentation lives in `docs/` (Astro + Starlight). Scripts at `scripts/generate-docs-changelog.mjs` and `scripts/generate-docs-command-reference.mjs` auto-generate content from CHANGELOG.md and commander.js definitions respectively. `src/cli/onboarding.ts` handles first-run setup. `llms.txt` exists at root.

**Integration points (all additive, no TypeScript changes except onboarding):**

| Area | Change | Files |
|------|--------|-------|
| Command reference | New flags (`--cache-mode`, `--format`) auto-generated via `npm run docs:commands` | `scripts/generate-docs-command-reference.mjs` (reads commander automatically) |
| Guide pages | New `.mdx` pages for git-aware cache, search UX | `docs/src/content/guides/git-aware-cache.mdx`, `docs/src/content/guides/search-usage.mdx` |
| Config reference | Document `cache.mode` key | `docs/src/content/reference/configuration.mdx` (MODIFY) |
| Onboarding | Mention `cache.mode` in generated `.handover.yml` template | `src/cli/onboarding.ts` (MODIFY: add comment in config template) |
| llms.txt | Update with new commands and config keys | `llms.txt` (MODIFY: content only) |
| README.md | Mention incremental mode and search enhancements | `README.md` (content only) |

No TypeScript interface changes are needed for documentation. The Astro site builds independently from the CLI source.

---

## Recommended Project Structure (New Files Only)

```
src/
+-- cache/
|   +-- round-cache.ts              # existing, unchanged API
|   +-- round-cache.test.ts         # NEW: unit tests with memfs
|   +-- git-fingerprint.ts          # NEW: git-aware fingerprint computation
|   +-- git-fingerprint.test.ts     # NEW: unit tests (mock simple-git)
+-- analyzers/
|   +-- cache.ts                    # existing, unchanged
|   +-- cache.test.ts               # NEW: unit tests with memfs
|   +-- git-history.test.ts         # NEW: unit tests mocking simple-git
+-- vector/
|   +-- query-engine.ts             # MODIFY: zero-results path, availableDocTypes
|   +-- query-engine.test.ts        # NEW: type validation, suggestDocTypes, zero-results
|   +-- vector-store.ts             # MODIFY: add getDocTypeSummary()
+-- mcp/
|   +-- tools.ts                    # MODIFY: expose content+docType in search response
|   +-- tools.test.ts               # NEW: tool handler unit tests with injected mocks
+-- regeneration/
|   +-- job-manager.test.ts         # NEW: job lifecycle state machine tests
+-- renderers/
|   +-- render-01-overview.test.ts  # NEW: pure function tests with minimal RenderContext
|   +-- render-03-architecture.test.ts  # NEW
|   +-- (other selected render-*.test.ts as coverage requires)
+-- config/
|   +-- schema.ts                   # MODIFY: add optional cache.mode key
|   +-- loader.test.ts              # NEW: memfs-based config loading tests

docs/src/content/
+-- guides/
|   +-- git-aware-cache.mdx         # NEW
|   +-- search-usage.mdx            # NEW: expanded search docs
+-- reference/
    +-- configuration.mdx           # MODIFY: add cache.mode field documentation
```

---

## Architectural Patterns

### Pattern 1: Coverage Exclusion Removal Strategy

**What:** The `vitest.config.ts` exclusion list exists because certain modules require real I/O or SDK initialization. Remove exclusions only for modules where all I/O can be replaced with mocks.

**Decision criteria for each excluded module:**
- Can every dependency (fs, network, SDK, process) be replaced with a vi.mock or memfs? YES: remove exclusion. NO: keep excluded.
- Is the module's logic primarily pure computation? YES: high value to unit test.

**Modules amenable to unit testing:**
- `src/cache/round-cache.ts` — uses `node:fs/promises`, mockable with memfs
- `src/analyzers/cache.ts` — same pattern
- `src/config/loader.ts` — uses `node:fs`, mockable with memfs
- `src/analyzers/git-history.ts` — uses `simple-git`, mockable with `vi.mock('simple-git')`
- `src/renderers/render-*.ts` — pure functions taking `RenderContext`, zero I/O
- `src/regeneration/job-manager.ts` — pure state machine with injected runner, zero I/O
- `src/mcp/tools.ts` — accepts injected `searchFn` and `regenerationManager`

**Trade-offs:** memfs is a process-global mock. Tests using memfs must be isolated to avoid cross-test file system state leakage. Use `beforeEach` to reset the virtual fs.

### Pattern 2: Git-Fingerprint Injection Without API Changes

**What:** `generate.ts` constructs `analysisFingerprint` before passing it to `RoundCache.computeHash()`. The fingerprint is an opaque string — enriching it at the construction site requires no downstream API changes.

**When to use:** Any time the cache invalidation criteria need new inputs. Adding a config version hash, a dependency manifest hash, or other signals follows the same pattern: enrich the fingerprint string before it enters `computeHash`.

**Example:**
```typescript
// src/cache/git-fingerprint.ts
export function computeGitAwareFingerprint(
  files: Array<{ path: string; contentHash: string }>,
  headCommit: string,
): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const data = sorted.map(f => `${f.path}:${f.contentHash}`).join('\n');
  return createHash('sha256')
    .update(data)
    .update(headCommit)
    .digest('hex');
}
```

**Trade-off:** Mixing the HEAD SHA into the fingerprint means the cache misses on every commit, even for commits that touch only docs or test files. This is intentional and conservative. A future refinement could scope the fingerprint to only source files that feed each round's prompt domain, but that requires a per-round file relevance map that does not currently exist.

### Pattern 3: MCP Tool Handler Isolation for Testing

**What:** `registerMcpTools()` in `src/mcp/tools.ts` accepts `searchFn` and `regenerationManager` as injected optional dependencies. The regeneration handlers are already extracted via `createRegenerationToolHandlers()`. Testing is possible by constructing handlers directly with mocks.

**When to use:** Always when adding new MCP tools. Accept all external dependencies via injection, never import them directly inside the handler body.

**Example test pattern:**
```typescript
// In src/mcp/tools.test.ts
const mockSearch = vi.fn().mockResolvedValue({
  query: 'auth', topK: 5, totalMatches: 2, matches: [...], filters: { types: [] }
});
const mockManager = { trigger: vi.fn(), getStatus: vi.fn() };

// Test can construct and invoke handlers without a real McpServer
```

### Pattern 4: Additive Schema Extensions

**What:** New config fields and response fields are always optional with defaults. Existing configs continue to work without modification.

**When to use:** For every new config key, type it as `z.something().optional().default(...)`. For every new response field, type it as optional in the interface. Avoid required fields in new schema additions.

**Example:**
```typescript
// src/config/schema.ts — ADDITIVE, backward compatible
cache: z.object({
  mode: z.enum(['content-hash', 'git-aware']).default('content-hash'),
}).default({ mode: 'content-hash' }).optional(),
```

Existing `.handover.yml` files without a `cache` block continue to use the default behavior.

---

## Data Flow

### Generate Pipeline (Existing + Git-Aware Modification)

```
handover generate
    |
loadConfig() + resolveAuth()
    |
DAGOrchestrator.execute()
    |
    +-> static-analysis step
    |     runStaticAnalysis() -> 8 analyzers (parallel via coordinator)
    |     [MODIFY] getGitState(rootDir) -> { headCommit, isGitRepo }
    |     computeGitAwareFingerprint(fileEntries, headCommit)  <- NEW code path
    |     OR computeAnalysisFingerprint(fileEntries)           <- existing fallback
    |     -> analysisFingerprint (string, unchanged type)
    |     AnalysisCache.getChangedFiles() -> changedFiles set
    |     packFiles(scored, ast, budget, estimateFn, changedFiles)
    |     AnalysisCache.save()
    |
    +-> ai-round-1 ... ai-round-6 (wrapWithCache wraps each, unchanged)
    |     RoundCache.get(roundNum, hash) -> hit: return cached, miss: executeRound()
    |     executeRound() -> provider.complete() -> validate -> quality -> compress
    |     RoundCache.set(roundNum, hash, result, model)
    |
    +-> render step (unchanged)
          Promise.allSettled(selectedDocs.map(doc => doc.render(ctx)))
          writeFile(join(outputDir, doc.filename), content)
          renderIndex(ctx, statuses) -> 00-INDEX.md
```

### Search Flow (Existing + Enhancements)

```
handover search "query" [--type arch] [--top-k 5] [--format json]
    |
searchDocuments({ config, query, topK, types, outputDir })
    |
EmbeddingRouter.resolve() -> select local or remote provider
assertRetrievalCompatibility(storedMetadata, activeModel, dims)
VectorStore.open()
provider.embedBatch([query]) -> queryEmbedding
VectorStore.search(queryEmbedding, { topK, docTypes }) -> rows
    |
    +-> (zero results path - NEW)
    |     VectorStore.getDocTypeSummary() -> available types + counts
    |     surface as availableDocTypes in SearchDocumentsResult
    |
format results
    |
    +-> CLI renderer (MODIFY: color-coded relevance, breadcrumbs, --format json)
    +-> MCP tool (MODIFY: add content for top 3 results, add docType for all)
```

### Git-Aware Cache Invalidation Flow (New)

```
generate static-analysis step
    |
simpleGit(rootDir).checkIsRepo() -> true/false
simpleGit(rootDir).revparse(['HEAD']) -> headCommit SHA (e.g., "a3f9b2c")
    |
computeGitAwareFingerprint(fileEntries, headCommit)
    |
analysisFingerprint (SHA-256 of all file content hashes + HEAD commit)
    |
wrapWithCache: RoundCache.computeHash(roundNum, model, analysisFingerprint, priorHashes)
    |
.handover/cache/rounds/round-N.json lookup
    hit: return cached result (skip LLM API call)
    miss: executeRound() -> cache write
```

---

## Integration Points Summary

| Feature | Files Modified | Files Created | Integration Seam |
|---------|---------------|---------------|-----------------|
| Test coverage uplift | `vitest.config.ts` (remove exclusions, raise threshold) | `src/cache/round-cache.test.ts`, `src/cache/git-fingerprint.test.ts`, `src/analyzers/cache.test.ts`, `src/mcp/tools.test.ts`, `src/regeneration/job-manager.test.ts`, `src/renderers/render-*.test.ts` (selected), `src/config/loader.test.ts`, `src/analyzers/git-history.test.ts` | `memfs` for fs mocking, `vi.mock('simple-git')` for git, injected mock providers |
| Git-aware regeneration | `src/cli/generate.ts` (enrich analysisFingerprint), `src/config/schema.ts` (optional cache.mode key) | `src/cache/git-fingerprint.ts`, `src/cache/git-fingerprint.test.ts` | `analysisFingerprint` construction site only; `RoundCache` API unchanged |
| Search UX polish | `src/vector/vector-store.ts` (add `getDocTypeSummary()`), `src/vector/query-engine.ts` (zero-results path), `src/mcp/tools.ts` (expose content+docType), `src/cli/search.ts` (richer formatting) | `src/vector/query-engine.test.ts` (expanded) | `SearchDocumentsResult` type (additive), `VectorStore` new method (additive) |
| Documentation | `docs/src/content/**/*.mdx` (MODIFY + NEW), `llms.txt`, `README.md`, `src/cli/onboarding.ts` (template comment) | `docs/src/content/guides/git-aware-cache.mdx`, `docs/src/content/guides/search-usage.mdx` | No TypeScript integration; new CLI flags auto-picked-up by command reference script |

---

## Suggested Build Order

Build order is determined by dependency direction: test infrastructure is a foundation for later work; git-aware cache is self-contained; search UX touches `VectorStore` and benefits from the test harness being in place first.

```
Phase 1: Test infrastructure (no production code changes)
  - Add unit tests for cache, analyzers/cache, config/loader, renderers (pure functions)
  - Add unit tests for job-manager (state machine) and mcp/tools (handler injection)
  - Raise vitest.config.ts threshold incrementally as tests pass
  Reason: Pure additions. Zero regression risk. Builds harness for Phase 2+3.

Phase 2: Git-aware incremental regeneration
  - Create src/cache/git-fingerprint.ts
  - Modify src/cli/generate.ts static-analysis step to inject headCommit
  - Add optional cache.mode key to src/config/schema.ts
  - Add src/cache/git-fingerprint.test.ts
  Reason: Self-contained change at analysisFingerprint construction site only.
           RoundCache API, MCP, and vector code are all untouched.

Phase 3: Search UX enhancements
  - Add VectorStore.getDocTypeSummary()
  - Modify query-engine.ts zero-results path (add availableDocTypes)
  - Modify mcp/tools.ts to expose content+docType
  - Modify src/cli/search.ts display formatting and --format json flag
  - Expand src/vector/query-engine.test.ts
  Reason: VectorStore and tool changes are additive. Phase 1 test harness
           means mcp/tools.ts modifications have immediate test coverage.

Phase 4: Documentation
  - Update llms.txt, README.md
  - Add docs/src/content guide pages for new features
  - Run npm run docs:generate to regenerate command reference
  Reason: Last because it documents completed Phase 2+3 behaviors.
           No code integration; purely content.
```

**Key constraint:** Phase 3 (search UX) must not begin before `src/mcp/tools.test.ts` exists from Phase 1. The MCP tool modifications in Phase 3 should have a test harness already in place before production code is changed.

---

## Anti-Patterns

### Anti-Pattern 1: Removing All Coverage Exclusions at Once

**What people do:** Delete the entire exclusion block in `vitest.config.ts` to push coverage numbers higher quickly.

**Why it's wrong:** Modules like `src/vector/vector-store.ts` require real SQLite + sqlite-vec WASM native bindings. Tests fail in CI without those bindings. `src/providers/anthropic.ts` requires real SDK initialization that imports the Anthropic package. Coverage numbers become misleading.

**Do this instead:** Remove exclusions one module at a time after verifying the module can run fully with mocks. Keep integration-only modules excluded and test them in `tests/integration/` (which correctly stays outside the coverage measurement).

### Anti-Pattern 2: Modifying RoundCache API for Git Awareness

**What people do:** Add a `gitHeadCommit` parameter to `RoundCache.computeHash()` to incorporate git state.

**Why it's wrong:** `computeHash()` is called inside `wrapWithCache` for all 6 rounds in `generate.ts`. Adding a parameter requires coordinated updates across a 1055-line file and would invalidate all existing cached round files on upgrade.

**Do this instead:** Enrich `analysisFingerprint` before it enters `computeHash()`. The fingerprint is the sole external variable between runs — all git state can be mixed into it at the construction site in `generate.ts`. `RoundCache.computeHash()` stays stable.

### Anti-Pattern 3: Exposing Full Chunk Content for All MCP Search Results

**What people do:** Map every search result to `content: match.content` in the MCP `semantic_search` response to give AI clients maximum context.

**Why it's wrong:** With `topK=50` and ~500-char average chunks, the response payload reaches ~25KB. Large MCP responses degrade LLM context efficiency and may exceed transport size limits.

**Do this instead:** Include full `content` only for the top 3 results by relevance (highest relevance scores first). Use `contentPreview` (200 chars) for the remainder. Alternatively, add an opt-in `includeFullContent: boolean` parameter that defaults to false.

### Anti-Pattern 4: Colocating New Tests in `tests/integration/` for Coverage

**What people do:** Place all new tests in `tests/integration/` to avoid touching `vitest.config.ts`.

**Why it's wrong:** The vitest `include` pattern is `src/**/*.test.ts`. Files in `tests/integration/` are executed by vitest but do NOT count toward coverage measurement. Pure-function unit tests must be at `src/module/file.test.ts` to raise the coverage threshold.

**Do this instead:** Colocate unit tests as `src/module/file.test.ts` for coverage. Use `tests/integration/` only for tests that require real filesystem state, running CLI processes, or actual git repositories.

### Anti-Pattern 5: Requiring `cache.mode: git-aware` to Get Cache Benefits

**What people do:** Make git-aware fingerprinting the new default, removing the content-hash fallback.

**Why it's wrong:** Projects that are not in a git repository (new projects, some CI environments, projects with `.git` on a different mount) lose all round caching if git is required.

**Do this instead:** Default to `content-hash`. Fall back to `content-hash` silently if `simpleGit.checkIsRepo()` returns false. The `git-aware` mode is opt-in via config. The existing `emptyGitResult` pattern in `analyzeGitHistory` shows the established graceful-degradation approach.

---

## Scaling Considerations

This is a local CLI tool with single-user operation per invocation. Scaling concerns apply to the MCP HTTP server and long-running sessions.

| Concern | Current State | Implication for This Milestone |
|---------|--------------|-------------------------------|
| Coverage CI time | `npm test -- --coverage` runs in one CI job; ~21 tests today | Adding ~15-20 new test files will increase CI time; no architecture concern, just runtime |
| Git fingerprint cost | `simpleGit().revparse(['HEAD'])` adds ~10ms | Negligible; already running `git.branch()` in `analyzeGitHistory()` during same static-analysis step |
| VectorStore per-query open/close | Opens and closes SQLite connection per `searchDocuments()` call | `getDocTypeSummary()` is called within the existing open/close block; no additional connection overhead |
| MCP response size | Current search response ~1-2KB for 10 results | Adding `content` for top 3 adds ~1.5KB; acceptable; do not add `content` for all results |

---

## Sources

- Direct codebase inspection (all findings HIGH confidence):
  - `src/cli/generate.ts` — pipeline integration nexus and cache wiring
  - `src/cache/round-cache.ts` — fingerprint and cascade chain mechanism
  - `src/analyzers/cache.ts` — per-file content hash mechanism
  - `vitest.config.ts` — current exclusion list and thresholds
  - `src/mcp/tools.ts` — tool handler injection points and response shapes
  - `src/vector/query-engine.ts` — search interface, type filtering, result structure
  - `src/vector/vector-store.ts` — SQLite query surface for getDocTypeSummary extension
  - `src/analyzers/git-history.ts` — simple-git usage pattern and graceful degradation
  - `src/providers/__mocks__/index.ts` — existing mock factory pattern
  - `.github/workflows/ci.yml` — CI coverage pipeline
  - `package.json` — devDependencies (memfs, vitest-mock-extended confirmed present)

---
*Architecture research for: TypeScript CLI — test coverage uplift, git-aware incremental regeneration, search UX polish, documentation*
*Researched: 2026-03-01*
