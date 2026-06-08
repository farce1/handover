# Phase 33: Cost Telemetry — Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 13 created + 5 modified
**Analogs found:** 17 / 18 (one file — `cost.ts --json` formatter — pulls JSON-contract pattern from `dep-graph.ts:formatDryRunJson` plus output pattern from `serve.ts`/`reindex.ts`; counted as exact match against `dep-graph.ts`)

This file tells the planner which existing module each new Phase 33 file should template from, with concrete code excerpts (path + line numbers) the planner can paste into PLAN.md action blocks. All excerpts were taken from `main` HEAD; no edits made.

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `src/regen/telemetry/db.ts` | infra / store-lifecycle | open → version-check → DDL | `src/regen/dep-graph.ts` (version constant + save/load + safe-degrade) + `src/vector/vector-store.ts` (`Database()` lifecycle) + `src/vector/schema.ts` (DDL via `db.exec`) | exact (composite) |
| `src/regen/telemetry/db.test.ts` | test | in-memory + tmpdir lifecycle | `src/regen/dep-graph.test.ts` (vi.hoisted memfs reset + ranged describe blocks) | exact role, different fs strategy (`:memory:` not memfs) |
| `src/regen/telemetry/schema.ts` | model / validation-at-boundary | Zod object schemas | `src/regen/dep-graph.ts:56-62` (`DepGraphSchema`) | exact |
| `src/regen/telemetry/schema.test.ts` | test | Zod parse positive + negative-existence | `src/regen/dep-graph.test.ts` GRAPH_VERSION block (literal-version assertion) | exact role |
| `src/regen/telemetry/writer.ts` | writer / service | prepare → transaction → run | `src/vector/vector-store.ts:99-155` (`insertChunks`) | exact (CRUD-INSERT-batch) |
| `src/regen/telemetry/writer.test.ts` | test | transaction atomicity + Zod-strip + run_id uniqueness | `src/regen/dep-graph.test.ts` save/load round-trip block | role-match (different SQL surface) |
| `src/regen/telemetry/reader.ts` | reader / service | prepare → `.all()` JOIN | `src/vector/vector-store.ts:178-205` (`getDocumentFingerprint` — prepare + cast) + dep-graph filterRenderersByChangedFiles (pure derivation) | role-match (read-only query helpers) |
| `src/regen/telemetry/reader.test.ts` | test | attribution-math reconciliation | `src/regen/dep-graph.test.ts` filter blocks (input → expected-state assertions) | role-match |
| `src/regen/telemetry/rotation.ts` | writer / maintenance | CTE-DELETE under transaction | `src/vector/vector-store.ts:162-170` (`deleteDocumentChunks` — prepare + `.run()`) | role-match (DELETE in a `db.transaction()`) |
| `src/regen/telemetry/rotation.test.ts` | test | seed N rows → rotate → assert keep-set | `src/regen/dep-graph.test.ts` saveDepGraph/loadDepGraph round-trip | role-match |
| `src/regen/telemetry/index.ts` | barrel | re-export | `src/regen/dep-graph.ts` (single-file module — no barrel exists yet, so this is the first; precedent for shape is `src/vector/types.ts`) | partial (precedent: any `src/**/index.ts` re-export barrel) |
| `src/cli/cost.ts` | CLI / read-only command | Commander action → reader call → format text or JSON | `src/cli/reindex.ts` (logger / progress / try-catch + handleCliError) + `src/cli/serve.ts` (cliOverrides loadConfig flow) | exact (read-only CLI subcommand) |
| `src/cli/cost.test.ts` | test | flag parsing + text vs JSON output | `src/regen/dep-graph.test.ts` formatDryRun / formatDryRunJson blocks | role-match |
| `src/cli/index.ts` | wiring (MODIFIED) | register subcommand | `src/cli/index.ts:66-78` (`reindex` registration) and `src/cli/index.ts:88-119` (`search` with `parseInt` for `--top-k`) | exact (file-self-analog) |
| `src/cli/generate.ts` (MODIFIED) | wiring (MODIFIED) | try/catch + lazy `openDb` + recordRun + rotate | `src/cli/generate.ts:1136-1143` (existing Phase 32 `saveDepGraph` try/catch) + `src/cli/generate.ts:1165-1170` (totals assembly site) | exact (file-self-analog) |
| `src/cli/generate.test.ts` (MODIFIED) | test (MODIFIED) | integration assertions on dry-run skip / threshold sourcing / graceful-degrade | `src/cli/generate.test.ts` checkPriorOutput block (vi.mock fs + small helper extraction) | exact (file-self-analog) |
| `src/cli/init.ts:20` (MODIFIED) | config-patch | extend `GITIGNORE_ENTRIES` | `src/cli/init.ts:20` itself (one-line extension) | exact (file-self-analog) |
| `src/cli/init-detectors.test.ts` (MODIFIED) | test (MODIFIED) | gitignore-line assertion | `src/cli/init-detectors.test.ts` patchGitignore block | exact (file-self-analog) |
| `src/ui/renderer.ts` (MODIFIED) | UI (MODIFIED) | reorder cost-warning firing | `src/ui/components.ts:298-301` (existing call site of `renderCostWarning`) | exact (file-self-analog) |

---

## Pattern Assignments

### `src/regen/telemetry/db.ts` (infra / store-lifecycle)

**Analog A:** `src/regen/dep-graph.ts` — version constant, exhaustive header doc, never-throw load semantics
**Analog B:** `src/vector/vector-store.ts` — `Database()` open lifecycle, mkdirSync parent
**Analog C:** `src/vector/schema.ts` — DDL via `db.exec(...)` and `CREATE INDEX`

**Imports pattern** (lift from `src/regen/dep-graph.ts:12-17`):
```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { z } from 'zod';
import type { DocumentSpec } from '../renderers/types.js';
```
Telemetry-version replacement: drop `fg`, swap `node:fs/promises` for `mkdirSync` from `node:fs` (better-sqlite3 is sync, so the entire module is sync), add `import Database from 'better-sqlite3'`.

**Version-constant pattern** (lift from `src/regen/dep-graph.ts:19-22`):
```typescript
// ─── Constants ──────────────────────────────────────────────────────────────

/** Graph format version — bump manually when the on-disk JSON shape changes (D-07). */
export const GRAPH_VERSION = 1 as const;
```
Telemetry version: `export const TELEMETRY_VERSION = 1 as const;` — same `as const` discipline. Bump policy is identical (D-04).

**Database-open lifecycle pattern** (lift from `src/vector/vector-store.ts:43-58`):
```typescript
open(): void {
  // Ensure parent directory exists
  const dbDir = dirname(this.config.dbPath);
  try {
    mkdirSync(dbDir, { recursive: true });
  } catch {
    // Directory might already exist - ignore error
  }

  // Open database
  this.db = new Database(this.config.dbPath);
```
Telemetry uses the same `mkdirSync(...).catch(noop) + new Database()` opening but as a free function `openTelemetryDb(dbPath: string): Database.Database`, NOT a class — D-06 module placement prefers free functions (matches dep-graph).

**Schema-DDL pattern** (lift from `src/vector/schema.ts:18-55`):
```typescript
export function initSchema(db: Database.Database, config: VectorStoreConfig): void {
  // Create schema metadata table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Create document metadata table for incremental indexing
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_metadata (
      doc_id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      chunk_count INTEGER NOT NULL DEFAULT 0
    );
  `);
```
Telemetry's `initSchema(db)` uses **`DROP TABLE IF EXISTS ... ; CREATE TABLE ...`** (not `CREATE TABLE IF NOT EXISTS`) because D-05 drop-and-recreate on version mismatch IS the migration. DDL bodies come from RESEARCH §"Pattern 1" (lines 290-332 of 33-RESEARCH.md). Add `CREATE INDEX idx_renderer_runs_renderer ON renderer_runs(renderer_id, ran_at DESC);` (TELEM-01 requires this index).

**WAL + user_version PRAGMA sequencing** (verbatim from RESEARCH §"Pattern 1", with citation to better-sqlite3 docs):
```typescript
const db = new Database(dbPath);

// 1. WAL FIRST (D-20a) — must precede other PRAGMAs.
db.pragma('journal_mode = WAL');
// 2. NORMAL is the recommended pairing with WAL — sufficient durability for local
//    metadata, big perf win on writes.
db.pragma('synchronous = NORMAL');

// 3. Version check (D-05).
const storedVersion = db.pragma('user_version', { simple: true }) as number;
if (storedVersion !== TELEMETRY_VERSION) {
  initSchema(db);                                 // drops + recreates tables
  db.pragma(`user_version = ${TELEMETRY_VERSION}`);
}
```
No analog inside the codebase uses `PRAGMA user_version` — this is the first. The closest analog is the vector-store `schema_metadata` KV table in `src/vector/schema.ts:57-67`. **Do NOT replicate** the KV table — D-05 mandates the native `PRAGMA user_version` route.

**Never-throw / safe-degrade pattern** (lift from `src/regen/dep-graph.ts:149-168`):
```typescript
/**
 * Read the graph. Never throws — returns `null` on:
 * - missing file
 * - graphVersion mismatch (via `z.literal(GRAPH_VERSION)` in DepGraphSchema)
 * - malformed JSON
 * - shape violation
 *
 * Callers interpret `null` as "fall back to full regen" (D-04, SC-5).
 */
export async function loadDepGraph(rootDir: string): Promise<DepGraph | null> {
  const filePath = join(rootDir, '.handover', 'cache', 'dep-graph.json');
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = DepGraphSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```
For telemetry, `db.ts` itself MAY throw on corrupt-DB open (RESEARCH §Pitfall 7, D-21). The graceful-degradation layer lives at the **caller** (`src/cli/generate.ts` wire-in — see below) which wraps the whole `openDb + recordRun + rotateRetention` block in a try/catch. The `handover cost` CLI catches the same throws and exits 1 with a remediation message (D-21).

---

### `src/regen/telemetry/db.test.ts` (test)

**Analog:** `src/regen/dep-graph.test.ts` (vi.hoisted memfs reset, ranged describe blocks). **Override:** D-23 forbids memfs for better-sqlite3 — use `new Database(':memory:')` for the default path and `os.tmpdir() + randomUUID()` for the schema-mismatch test that needs an on-disk file-handle round-trip.

**Hoisted-mock + reset pattern** (lift from `src/regen/dep-graph.test.ts:1-37`):
```typescript
import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { vol } from 'memfs';

// Hoisted mock for fast-glob default export.
const mockFg = vi.hoisted(() => vi.fn());
vi.mock('fast-glob', () => ({ default: mockFg }));

// Memfs for fs isolation (pattern from src/cli/init-detectors.test.ts:1-12).
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

beforeEach(() => {
  vol.reset();
  mockFg.mockReset();
});
```
Replace memfs entirely with:
```typescript
import Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});
```

**Constant-assertion block pattern** (lift from `src/regen/dep-graph.test.ts:69-75`):
```typescript
describe('GRAPH_VERSION constant', () => {
  it('is the literal 1', () => {
    expect(GRAPH_VERSION).toBe(1);
  });
});
```
Mirror for `TELEMETRY_VERSION`. Add a separate block asserting `PRAGMA user_version` returns `TELEMETRY_VERSION` after `openTelemetryDb(':memory:')`, and that `PRAGMA journal_mode` returns `wal` (D-22 success-criterion #5 + WAL test).

---

### `src/regen/telemetry/schema.ts` (model / validation-at-boundary)

**Analog:** `src/regen/dep-graph.ts:54-65`

**Schema-shape pattern** (lift verbatim):
```typescript
// ─── Schema + Types ─────────────────────────────────────────────────────────

export const DepGraphSchema = z.object({
  graphVersion: z.literal(GRAPH_VERSION),       // mismatch → safeParse fails → loadDepGraph returns null
  builtAt: z.string(),                           // ISO 8601; informational
  renderers: z.record(z.string(), z.array(z.string())),
  infrastructurePaths: z.array(z.string()),     // curated globs (audit trail)
  infrastructureFiles: z.array(z.string()),     // expanded file list for fast lookup
});

export type DepGraph = z.infer<typeof DepGraphSchema>;
```
For telemetry, define `RunRecordSchema`, `RoundRunRecordSchema`, `RendererRunRecordSchema` — full shapes are spelled out in RESEARCH §"Example 3" (lines 838-849 of 33-RESEARCH.md). Each `z.object({...})` gives Zod's default object-strip behavior, which is **the load-bearing TELEM-03 guarantee**: unknown keys (e.g., an accidentally-passed `prompt` or `apiKey`) are silently dropped — the test in §D-22 (negative-existence) asserts this.

**DocumentStatus union (CRITICAL — see RESEARCH §Pitfall 1):** import the actual enum from `src/renderers/types.ts:63` rather than re-typing the literals, so a future enum rename catches at compile time:
```typescript
// src/regen/telemetry/schema.ts
import type { DocumentStatus } from '../../renderers/types.js';

// Use a tagged status type sourced from the real DocumentStatus union — not
// the wrong 'full' from CONTEXT.md. Status comes in as 'complete'|'partial'|...
const StatusEnum = z.enum(['complete', 'partial', 'static-only', 'not-generated', 'reused'] as const);
// TS-side compile-time check that StatusEnum matches DocumentStatus['status']:
type _StatusCheck = DocumentStatus['status'] extends z.infer<typeof StatusEnum> ? true : never;
type _StatusCheckReverse = z.infer<typeof StatusEnum> extends DocumentStatus['status'] ? true : never;
```

---

### `src/regen/telemetry/writer.ts` (writer / service)

**Analog:** `src/vector/vector-store.ts:99-155`

**Imports pattern** (adapt from `src/vector/vector-store.ts:7-12`):
```typescript
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { VectorStoreConfig, DocumentChunk, DocumentFingerprint } from './types.js';
import { initSchema, validateEmbeddingDimensions } from './schema.js';
```
Drop `sqlite-vec` (not needed), keep the `import Database from 'better-sqlite3'` form. Telemetry writer imports its own `RunRecordSchema` etc. from `./schema.js` and only takes the already-opened `db` (D-20 lazy-open at caller).

**Prepare-then-transaction pattern** (lift from `src/vector/vector-store.ts:99-155`):
```typescript
insertChunks(chunks: DocumentChunk[], embeddings: number[][]): void {
  if (!this.db) {
    throw new Error('Database not open. Call open() first.');
  }

  // Prepare insert statement
  const insert = this.db.prepare(`
    INSERT INTO vec_chunks (
      embedding, doc_id, doc_type, source_file, chunk_index,
      section_path, h1, h2, h3, token_count, content_preview, content
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Insert all chunks in a transaction
  const transaction = this.db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const embeddingJson = JSON.stringify(embedding);
      insert.run(
        embeddingJson, chunk.metadata.docId, /* ... */
      );
    }
  });

  transaction();
}
```
Telemetry `recordRun(db, run, roundRuns, rendererRuns)`:
1. Zod-parse the three inputs (strips unknown keys — TELEM-03).
2. Prepare three INSERT statements (named-parameter form `@runId` per RESEARCH §"Pattern 2", since the three tables have different column counts).
3. Single `db.transaction(() => { insertRun.run(...); for ... insertRound.run(...); for ... insertRenderer.run(...); })`.
4. Call the transaction. The transaction is the **atomicity boundary** that D-15 substitutes for FK constraints.

Full code body is in RESEARCH §"Pattern 2" (lines 345-398 of 33-RESEARCH.md).

**Boolean-to-integer coercion at INSERT** (no clean codebase analog — vector store has no booleans on rows; lift the pattern directly from RESEARCH §"Pattern 2"):
```typescript
insertRun.run({
  ...parsedRun,
  thresholdExceeded: parsedRun.thresholdExceeded ? 1 : 0,
  dryRun: parsedRun.dryRun ? 1 : 0,
});
```
SQLite has no boolean type; integer 0/1 is the canonical encoding. Reader code (`reader.ts`) must coerce back: `row.cache_hit === 1 ? true : false`.

**Error semantics:** `recordRun` MAY throw (Zod parse failure, SQLite write failure, native binding crash). Per D-19, the **caller** (`generate.ts` wire-in) wraps in try/catch + `logger.warn`. Do NOT swallow errors inside the writer.

---

### `src/regen/telemetry/reader.ts` (reader / service)

**Analog A:** `src/vector/vector-store.ts:178-205` (`getDocumentFingerprint` — prepare + `.get()` + cast pattern, **but RESEARCH §Pitfall 5 says use `.all()` consistently in `reader.ts`**)
**Analog B:** `src/regen/dep-graph.ts:180-217` (pure derivation — input → derived output)

**Prepared-query + cast pattern** (lift shape from `src/vector/vector-store.ts:178-205`, adjust to `.all()`):
```typescript
getDocumentFingerprint(docId: string): DocumentFingerprint | null {
  if (!this.db) {
    throw new Error('Database not open. Call open() first.');
  }

  const row = this.db
    .prepare(
      'SELECT doc_id, fingerprint, indexed_at, chunk_count FROM document_metadata WHERE doc_id = ?',
    )
    .get(docId) as
    | {
        doc_id: string;
        fingerprint: string;
        indexed_at: string;
        chunk_count: number;
      }
    | undefined;

  if (!row) {
    return null;
  }
```
Telemetry reader uses `.all()` returning `T[]`, never `.get()`. Empty-DB path is `recentRuns.length === 0` (RESEARCH §Pitfall 5).

**Attribution-math JOIN pattern:** No codebase analog. The full SQL is in RESEARCH §"Pattern 4" (lines 486-531). The TS-side scaffolding is:
1. Read `DOCUMENT_REGISTRY` from `src/renderers/registry.ts` (import the constant — see `src/renderers/registry.ts:38` `DOCUMENT_REGISTRY: DocumentSpec[]`).
2. At read time, `CREATE TEMP TABLE renderer_round_map`, `INSERT` `(renderer_id, round_num)` from the registry (NOT a denormalized junction table per D-02).
3. Run the CTE query (`consuming_renderers`, `consumer_counts`, `attributed`, `orphan`).

**Important from RESEARCH §"Pitfall 1":** the consuming-renderer predicate is `status IN ('complete', 'partial')` — **NOT** `'full'`. CONTEXT.md D-01 used `'full'`; the actual `DocumentStatus` enum literal is `'complete'` (`src/renderers/types.ts:63`).

**Orphan-bucket label:** RESEARCH §"Code Examples" (line 514) recommends `'_unconsumed'` over CONTEXT.md's `'_orphan'`. Either label is acceptable per D-01 Discretion; planner picks one and locks it.

---

### `src/regen/telemetry/rotation.ts` (writer / maintenance)

**Analog:** `src/vector/vector-store.ts:162-170` (`deleteDocumentChunks` — prepare + `.run()` returning `changes`).

**Simple DELETE pattern** (for shape reference only — telemetry's DELETE uses a CTE):
```typescript
deleteDocumentChunks(docId: string): number {
  if (!this.db) {
    throw new Error('Database not open. Call open() first.');
  }

  const result = this.db.prepare('DELETE FROM vec_chunks WHERE doc_id = ?').run(docId);
  return result.changes;
}
```

**Rotation transaction (full CTE) — lift from RESEARCH §"Pattern 3" (lines 420-458):**
```typescript
export function rotateRetention(db: Database.Database): void {
  const rotate = db.transaction(() => {
    const KEEP_SET = `
      WITH
        per_renderer_keep AS (
          SELECT run_id FROM (
            SELECT renderer_runs.run_id AS run_id,
              renderer_runs.renderer_id AS renderer_id,
              ROW_NUMBER() OVER (
                PARTITION BY renderer_runs.renderer_id
                ORDER BY runs.started_at DESC
              ) AS rn
            FROM renderer_runs
            JOIN runs ON runs.run_id = renderer_runs.run_id
          ) WHERE rn <= 100
        ),
        recent_keep AS (
          SELECT run_id FROM runs
          WHERE started_at >= datetime('now', '-90 days')
        ),
        keep AS (
          SELECT run_id FROM per_renderer_keep
          UNION
          SELECT run_id FROM recent_keep
        )
    `;

    db.prepare(`${KEEP_SET} DELETE FROM renderer_runs WHERE run_id NOT IN (SELECT run_id FROM keep)`).run();
    db.prepare(`${KEEP_SET} DELETE FROM round_runs    WHERE run_id NOT IN (SELECT run_id FROM keep)`).run();
    db.prepare(`${KEEP_SET} DELETE FROM runs          WHERE run_id NOT IN (SELECT run_id FROM keep)`).run();
  });
  rotate();
}
```
**Child-first DELETE order** (renderer_runs → round_runs → runs) is the D-15 substitute for FK cascades.

**Two-transaction isolation (D-13):** the *caller* runs `recordRun(...)` and `rotateRetention(...)` as two separate calls, each completing its own internal `db.transaction()`. If rotation throws, the just-written run is preserved (RESEARCH §Pitfall 3 / D-19).

---

### `src/regen/telemetry/index.ts` (barrel)

**Analog:** No barrel exists in `src/regen/` yet (dep-graph is a single file). First-of-kind. Shape precedent: `src/vector/types.ts` re-exports type symbols; `src/cli/auth/index.ts` exports a createXxxCommand function.

**Recommended shape:**
```typescript
export { openTelemetryDb, TELEMETRY_VERSION } from './db.js';
export { RunRecordSchema, RoundRunRecordSchema, RendererRunRecordSchema } from './schema.js';
export type {
  RunRecord, RoundRunRecord, RendererRunRecord,
} from './schema.js';
export { recordRun } from './writer.js';
export { getRecentRuns, getRendererSummary } from './reader.js';
export { rotateRetention } from './rotation.js';
```
Single import surface for `src/cli/generate.ts` and `src/cli/cost.ts`.

---

### `src/cli/cost.ts` (CLI subcommand)

**Analog A:** `src/cli/reindex.ts` (logger + progress + try-catch + handleCliError shape)
**Analog B:** `src/cli/serve.ts` (loadConfig + cliOverrides flow — though cost has no config overrides)
**Analog C:** `src/regen/dep-graph.ts:formatDryRun` + `formatDryRunJson` (text-or-JSON dual-format output — D-11 `formatVersion: 1` is identical contract)

**Imports + signature pattern** (lift from `src/cli/reindex.ts:1-32`):
```typescript
import cliProgress from 'cli-progress';
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { handleCliError } from '../utils/errors.js';
import { reindexDocuments } from '../vector/reindex.js';
import { DEFAULT_EMBEDDING_LOCALITY_MODE } from '../vector/types.js';
import type { ReindexProgressEvent } from '../vector/reindex.js';
import type { EmbeddingLocalityMode } from '../vector/types.js';

export interface ReindexCommandOptions {
  verbose?: boolean;
  force?: boolean;
  embeddingMode?: EmbeddingLocalityMode;
}

export async function runReindex(options: ReindexCommandOptions): Promise<void> {
  try {
    const config = loadConfig();
    // ...
```
Cost-version replacement:
```typescript
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { handleCliError } from '../utils/errors.js';
import { openTelemetryDb, getRecentRuns, getRendererSummary } from '../regen/telemetry/index.js';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface CostCommandOptions {
  runs?: number;
  sinceDate?: string;
  renderer?: string;
  view?: 'attributed' | 'standalone';
  json?: boolean;
}

export async function runCost(opts: CostCommandOptions): Promise<void> {
  try {
    // 1. Validate flag combinations (--runs and --since-date mutex per D-10)
    // 2. Empty-DB check (D-21): if !existsSync(dbPath) → 'No telemetry yet.' + exit 0
    // 3. openTelemetryDb (corrupt-DB throws → handleCliError exits 1)
    // 4. reader queries
    // 5. format text or JSON
    // 6. db.close()
  } catch (err) {
    handleCliError(err, 'handover cost');
  }
}
```

**JSON-contract pattern (D-11 — identical to Phase 32 D-16)** — lift from `src/regen/dep-graph.ts:389-404`:
```typescript
/**
 * Machine-readable JSON for Phase 36 GitHub Action (D-16).
 *
 * Contract (must remain stable; breaking changes require a `formatVersion` bump):
 *   { formatVersion, since, graphVersion, wouldExecute, wouldSkip, fellBackToFullRegen, noGraph }
 */
export function formatDryRunJson(d: DryRunDecision): string {
  const payload = {
    formatVersion: 1,
    since: d.since ?? null,
    graphVersion: d.graphVersion,
    wouldExecute: d.wouldExecute.map((e) => ({
      renderer: e.rendererId,
      filename: e.filename,
      reasons: e.reasons,
    })),
    wouldSkip: d.wouldSkip.map((s) => s.rendererId),
    fellBackToFullRegen: d.fellBackToFullRegen,
    noGraph: d.noGraph,
  };
  return JSON.stringify(payload, null, 2) + '\n';
}
```
Cost's `formatCostJson` mirrors this exactly: top-level `formatVersion: 1`, `telemetryVersion`, `window`, `runs[]`, `rendererAggregate[]` (full shape in CONTEXT.md D-11, lines 102-134).

**Text-format pattern (D-09 minimal-chrome)** — lift from `src/regen/dep-graph.ts:326-370`:
```typescript
export function formatDryRun(d: DryRunDecision): string {
  const lines: string[] = [];

  // Header
  if (d.since === undefined && !d.noGraph) {
    lines.push('Dry-run preview (no --since: dep-graph not consulted)');
  } else if (d.noGraph && d.since !== undefined) {
    // ...
  }
  lines.push('');

  // Would execute block
  lines.push(`Would execute (${d.wouldExecute.length}):`);
  for (const e of d.wouldExecute) {
    if (e.reasons.length === 0) {
      lines.push(`  ${e.filename}`);
    } else {
      lines.push(`  ${e.filename}   ← ${e.reasons.join(', ')}`);
    }
  }
  lines.push('');
  // ...
```
Cost text mode: two blocks (`Recent runs (last N):` and `Per-renderer aggregate (over N runs):`), no box-drawing, `⚠` for over-threshold rows (use `pc.yellow` like `renderCostWarning` does at `src/ui/components.ts:415-419`). Empty-DB: `No telemetry yet. Run \`handover generate\` to record cost data.` (CONTEXT.md D-09).

**Error pattern (corrupt-DB exit 1)** — lift from `src/utils/errors.ts:8-37`:
```typescript
export class HandoverError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
    public readonly fix: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HandoverError';
  }
```
On corrupt-DB:
```typescript
throw new HandoverError(
  'Telemetry DB unreadable',
  `SQLite open failed: ${(err as Error).message}`,
  `Delete .handover/telemetry.db to reset (history will be lost; this is local metadata, never committed).`,
  'TELEMETRY_DB_CORRUPT',
);
```
The outer `handleCliError` (`src/utils/errors.ts:143`) renders the HandoverError.format() and exits non-zero. For empty-DB, do NOT throw — just `process.stdout.write('No telemetry yet.\n')` and return (exit 0 per D-12 / D-21).

---

### `src/cli/cost.test.ts` (test)

**Analog:** `src/regen/dep-graph.test.ts` formatter blocks + `src/cli/init-detectors.test.ts` (env-stubbing).

**Output-format test pattern** (lift from `src/regen/dep-graph.test.ts`):
```typescript
import { describe, it, expect } from 'vitest';
// import { formatDryRun, formatDryRunJson } from './dep-graph.js';

describe('formatDryRun', () => {
  it('emits "Would execute (N):" block with rendererId hints', () => {
    const decision: DryRunDecision = makeDecision({/* ... */});
    const out = formatDryRun(decision);
    expect(out).toContain('Would execute (2):');
    expect(out).toContain('Zero LLM calls made.');
  });
});

describe('formatDryRunJson', () => {
  it('always includes formatVersion: 1', () => {
    const out = JSON.parse(formatDryRunJson(makeDecision({})));
    expect(out.formatVersion).toBe(1);
  });
});
```
Cost tests mirror this exactly. Add specific assertions: empty-DB prints `'No telemetry yet.'`; `--json` payload has `formatVersion: 1` AND `telemetryVersion: 1`; `--since-date <bad-iso>` exits non-zero with remediation (RESEARCH §Pitfall 6); `--runs` and `--since-date` mutex enforced.

---

### `src/cli/index.ts` (MODIFIED — register `handover cost`)

**Analog:** `src/cli/index.ts:66-78` (`reindex` registration) and `src/cli/index.ts:88-119` (`search` with `--top-k` numeric parsing + `--type` repeatable).

**Subcommand registration pattern** (lift verbatim from `src/cli/index.ts:88-119`):
```typescript
program
  .command('search <query>')
  .description('Search generated documentation using semantic similarity')
  .option('--mode <mode>', 'Search mode: fast (default) or qa', 'fast')
  .option(
    '--embedding-mode <mode>',
    'Embedding locality mode: local-only, local-preferred, or remote-only',
  )
  .option(
    '--top-k <n>',
    'Number of results to return (default: 10)',
    (value) => {
      return Number.parseInt(value, 10);
    },
    10,
  )
  .option(
    '--type <type>',
    `Filter by document type (repeatable). Valid types: ${KNOWN_DOC_TYPES.join(', ')}`,
    (value, previous: string[]) => {
      return [...previous, value];
    },
    [],
  )
  .action(async (query, opts) => {
    const { runSearch } = await import('./search.js');
    await runSearch(query, opts);
  });
```
Cost registration shape — direct lift from RESEARCH §"Example 2" (lines 810-826):
```typescript
program
  .command('cost')
  .description('Show per-renderer cost telemetry from .handover/telemetry.db')
  .option(
    '--runs <n>',
    'Number of recent runs to include (default: 10)',
    (v) => Number.parseInt(v, 10),
    10,
  )
  .option('--since-date <iso>', 'Only include runs on or after this ISO-8601 date (mutually exclusive with --runs)')
  .option('--renderer <id>', 'Filter to a single renderer; switches to time-series view')
  .option('--view <view>', 'Attribution view: "attributed" (default) or "standalone"', 'attributed')
  .option('--json', 'Emit JSON output with formatVersion: 1')
  .action(async (opts) => {
    const { runCost } = await import('./cost.js');
    await runCost(opts);
  });
```
Place between the `serve` registration (line 122) and `program.addCommand(createAuthCommand());` (line 142) — alphabetical-ish co-location with the other read-only commands.

**Lazy-import-action pattern**: notice `const { runReindex } = await import('./reindex.js');` (line 77) and `const { runSearch } = await import('./search.js');` (line 117). Cost MUST do the same — lazy import keeps `handover --help` startup under 200ms even after adding the better-sqlite3-loading cost module.

---

### `src/cli/generate.ts` (MODIFIED — wire-in `recordRun` end-of-run)

**Analog:** `src/cli/generate.ts:1136-1143` (existing Phase 32 `saveDepGraph` try/catch — the *exact* graceful-degradation pattern D-19 mirrors). **Note:** the wire-in research excerpt below references line 1136-1143; the live `saveDepGraph` call may have shifted. Planner re-greps `saveDepGraph` to locate the current line range before pasting.

**Existing displayState totals computation** (extract context — `src/cli/generate.ts:1165-1170`):
```typescript
// Completion summary
displayState.phase = 'complete';
displayState.elapsedMs = Date.now() - startTime;
displayState.completionDocs = displayState.renderedDocs.length;
displayState.totalTokens = tracker.getTotalUsage().input + tracker.getTotalUsage().output;
displayState.totalCost = tracker.getTotalCost();
```
The telemetry wire-in lands **after line 1170** (totals computed) and **before line 1210** (`renderer.onComplete(displayState)`). The displayState.rounds Map is the source of per-round elapsedMs / status; the tracker is the source of cost / token totals; the `statuses: DocumentStatus[]` array (declared at line 1043) is the source of per-renderer status + filename.

**Render-loop statuses pattern** (extract from `src/cli/generate.ts:1040-1080`):
```typescript
const renderTimingMs = Date.now() - renderStart;

// Process results in input order (Promise.allSettled preserves order)
const statuses: DocumentStatus[] = [];
let sequentialEstimateMs = 0;

for (let i = 0; i < renderResults.length; i++) {
  const result = renderResults[i];
  const doc = docsToRender[i];

  if (result.status === 'rejected') {
    statuses.push({ /* status: 'not-generated', reason: ... */ });
  } else if (result.value.reused) {
    statuses.push({ id: doc.id, filename: doc.filename, title: doc.title, status: 'reused', lastRenderedAt: result.value.lastRenderedAt });
  } else if (result.value.skipped) {
    statuses.push({ /* status: 'not-generated' */ });
  }
  // ...
}
```
**Plumbing concern:** `statuses` is declared inside the render-step closure. To make `rendererRuns` assembly possible at end-of-run, either (a) hoist `statuses` to outer scope and assign in the loop, OR (b) write a helper `buildRendererRuns(statuses, renderResults, runId): RendererRunRecord[]` invoked inside the step before returning. **(b) is cleaner — single-responsibility extraction matches Phase 32 D-16 helper-extraction pattern.** Track `durationMs` from `renderResults[i].value.durationMs` (line 1007/1024/1035) and pair with `statuses[i]` by index.

**Telemetry wire-in body** — lift verbatim from RESEARCH §"Example 1" (lines 688-803 of 33-RESEARCH.md). Key shape:
```typescript
if (!options.dryRun) {                                  // D-08
  let db: ReturnType<typeof openTelemetryDb> | null = null;
  try {
    const dbPath = join(resolve(process.cwd()), '.handover', 'telemetry.db');
    db = openTelemetryDb(dbPath);

    const runId = randomUUID();
    const startedAt = new Date(startTime).toISOString();
    const endedAt = new Date().toISOString();

    const totalCostUsd = round6(tracker.getTotalCost());
    const thresholdUsd = config.costWarningThreshold ?? null;
    const thresholdExceeded = thresholdUsd != null && totalCostUsd > thresholdUsd;

    // Build round_runs + renderer_runs (see RESEARCH for full body)
    recordRun(db, { runId, startedAt, endedAt, totalCostUsd, /* ... */ }, roundRuns, rendererRuns);

    try {
      rotateRetention(db);
    } catch (err) {
      if (options.verbose) {
        logger.warn(`Telemetry rotation failed: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    if (options.verbose) {
      logger.warn(`Telemetry write failed: ${(err as Error).message}`);
    }
  } finally {
    if (db) db.close();
  }
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
```
The outer try/catch is D-19's graceful-degradation boundary; the inner rotation try/catch is D-13's separation (rotation failure must not unwind the just-written INSERT).

**`crypto.randomUUID` import (RESEARCH §Pitfall 4):**
```typescript
import { randomUUID } from 'node:crypto';
```
**NEVER** `globalThis.crypto.randomUUID()` — Node 18 (the `engines.node` floor) doesn't have the Web Crypto global.

---

### `src/cli/init.ts:20` (MODIFIED — extend GITIGNORE_ENTRIES)

**Analog (self):** `src/cli/init.ts:19-20`

**Current line** (exactly as it stands):
```typescript
// Locked by CONTEXT.md D-10 + STATE.md pending todo. Do NOT use blanket '.handover/'.
const GITIGNORE_ENTRIES = ['.handover/cache', '.handover/telemetry.db'];
```

**Proposed change** (RESEARCH §Pitfall 2, lines 612-619):
```typescript
// Locked by CONTEXT.md D-10 + STATE.md pending todo. Do NOT use blanket '.handover/'.
// Phase 33 D-20a adds WAL sidecars — patchGitignore uses literal-line match
// (src/cli/init-detectors.ts:154-168), so each sidecar needs an explicit entry.
const GITIGNORE_ENTRIES = [
  '.handover/cache',
  '.handover/telemetry.db',
  '.handover/telemetry.db-wal',  // SQLite WAL sidecar (Phase 33 D-20a)
  '.handover/telemetry.db-shm',  // SQLite shared-memory sidecar
];
```

**Why each entry is needed (lifted from `src/cli/init-detectors.ts:144-189`):**
```typescript
export function patchGitignore(cwd: string, entries: string[]): void {
  // ...
  const lines = content.split('\n').map((l) => l.trim());

  // Filter entries already covered by a literal match (do NOT outsmart globs)
  const toAdd = entries.filter((e) => !lines.includes(e));
  // ...
}
```
`lines.includes(e)` is a **literal** string match. `.handover/telemetry.db` does NOT cover `.handover/telemetry.db-wal`. Both sidecars require explicit entries.

---

### `src/cli/init-detectors.test.ts` (MODIFIED — assert sidecar entries)

**Analog (self):** existing `patchGitignore` test block in `src/cli/init-detectors.test.ts` (planner adds a new `it()` that confirms patching writes both sidecar lines).

Pattern lift from the file's existing patchGitignore tests (see lines after 70 in the test file for the existing `patchGitignore` describe block — planner re-greps for `describe('patchGitignore'`).

---

### `src/ui/renderer.ts` (MODIFIED — reorder threshold-warning firing)

**Analog (self):** `src/ui/components.ts:298-301` — the existing `renderCostWarning` invocation. NO change to `renderCostWarning` itself; only the *order* changes per D-17.

**Existing call site** (`src/ui/components.ts:298-301`):
```typescript
// Cost warning -- only for cloud providers
if (!isLocal && !isSubscription && totalCost > costWarningThreshold && costWarningThreshold > 0) {
  lines.push(`  ${renderCostWarning(totalCost, costWarningThreshold)}`);
}
```
**`renderCostWarning` signature** (`src/ui/components.ts:415-419`):
```typescript
export function renderCostWarning(currentCost: number, threshold: number): string {
  return pc.yellow(
    `${SYMBOLS.warning} Cost: ${formatCost(currentCost)} (threshold: ${formatCost(threshold)})`,
  );
}
```
Per D-17: the warning fires from in-memory totals (`displayState.totalCost`) ONLY when the telemetry write succeeded. The wire-in in `generate.ts` already gates the write on `!options.dryRun`; the warning's data source is the **same** in-memory totals that were just persisted. **No SELECT-back round-trip** (D-17 explicit). On telemetry-write failure (D-19), the existing pre-write check is the fallback path — no UX regression.

**Concrete reorder shape** (planner adds inside generate.ts after the try/catch + before `renderer.onComplete(displayState)`):
```typescript
// If telemetry write succeeded AND threshold exceeded, the renderCostWarning
// fires from displayState.totalCost (the same value we just persisted as
// runs.total_cost_usd). On telemetry-write failure, the existing pre-write
// path in renderRoundsBlock() at src/ui/components.ts:298 still emits.
```
No actual code change in `src/ui/components.ts` — D-17 says "code stays, data source moves" (CONTEXT.md line 231). The "move" is the *timing* of when the warning is rendered, which is already inside `renderer.onComplete(displayState)`. Phase 33's contribution is only the try/catch boundary + the fact that totals are now persisted *before* `onComplete` is called.

---

## Shared Patterns

### Pattern S1: Graceful Degradation (D-19) — applies to writer wire-in

**Source:** `src/cli/generate.ts` Phase-32 `saveDepGraph` wire-in (planner re-greps for the exact line range — research cited line 1136-1143).

**Apply to:** the Phase 33 `recordRun` block in `src/cli/generate.ts` end-of-run.

**Shape** (lift exactly):
```typescript
try {
  // <expensive local write>
} catch (err) {
  if (options.verbose) {
    logger.warn(`Telemetry write failed: ${(err as Error).message}`);
  }
} finally {
  if (db) db.close();
}
```
**Invariant:** `handover generate` exit code never depends on telemetry-write success.

### Pattern S2: Zod-at-the-Boundary (TELEM-03)

**Source:** `src/regen/dep-graph.ts:56-62` (`DepGraphSchema`) + `src/config/schema.ts` (entire file is Zod schemas at config-loader boundary).

**Apply to:** `src/regen/telemetry/schema.ts` (`RunRecordSchema`, `RoundRunRecordSchema`, `RendererRunRecordSchema`) — every input to `recordRun` is parsed before INSERT.

**Code** (`src/regen/dep-graph.ts:56-62`):
```typescript
export const DepGraphSchema = z.object({
  graphVersion: z.literal(GRAPH_VERSION),
  builtAt: z.string(),
  renderers: z.record(z.string(), z.array(z.string())),
  infrastructurePaths: z.array(z.string()),
  infrastructureFiles: z.array(z.string()),
});

export type DepGraph = z.infer<typeof DepGraphSchema>;
```

**Invariant (TELEM-03 negative-existence test):** Zod's default object-strip behavior drops unknown keys at parse time, so a hypothetical `{ prompt: '...', apiKey: 'sk-...' }` passed into `recordRun` is silently stripped before INSERT. The test asserts no INSERT contains those columns (impossible by construction, but the test pins the contract).

### Pattern S3: Versioned-Local-Store Constant Discipline (D-04)

**Source:** `src/regen/dep-graph.ts:22` (`GRAPH_VERSION = 1 as const`) + `src/cache/round-cache.ts:16` (`CACHE_VERSION = 2`).

**Apply to:** `src/regen/telemetry/db.ts` — `export const TELEMETRY_VERSION = 1 as const;`

**Code** (`src/regen/dep-graph.ts:22`):
```typescript
/** Graph format version — bump manually when the on-disk JSON shape changes (D-07). */
export const GRAPH_VERSION = 1 as const;
```
And (`src/cache/round-cache.ts:16`):
```typescript
/** Cache format version — bump when the entry shape changes. */
const CACHE_VERSION = 2;
```
**Bump policy lift:** D-04 explicit — column rename, type change, semantic re-interpretation bumps; index-only additions and pure column-additions with default-null do NOT bump in v8.0.

### Pattern S4: Format-Version JSON Contract (D-11)

**Source:** `src/regen/dep-graph.ts:389-404` (`formatDryRunJson` — Phase 32's `formatVersion: 1` precedent).

**Apply to:** `src/cli/cost.ts` (`handover cost --json`) — `formatVersion: 1` + `telemetryVersion: 1` envelope.

**Code excerpt** (already shown in `src/cli/cost.ts` section above).

**Invariant:** Phase 36 GitHub Action pins to `formatVersion: 1`. Additive changes (new fields) do NOT bump. Renames or removals do.

### Pattern S5: Lazy Subcommand Import (~200ms startup budget)

**Source:** `src/cli/index.ts:75-77, 116-118, 137-139` — every subcommand uses `await import('./xyz.js')` inside the `.action(...)`.

**Apply to:** `handover cost` registration in `src/cli/index.ts`.

**Code** (`src/cli/index.ts:75-78`):
```typescript
.action(async (opts) => {
  const { runReindex } = await import('./reindex.js');
  await runReindex(opts);
});
```
**Invariant:** `handover --help` and unrelated subcommands do NOT pay the better-sqlite3-native-binding load cost.

### Pattern S6: Picocolors + Symbol for UI Emission

**Source:** `src/ui/components.ts:415-419` (`renderCostWarning`).

**Apply to:** `src/cli/cost.ts` text-mode formatting (`⚠` for over-threshold runs).

**Code** (`src/ui/components.ts:415-419`):
```typescript
export function renderCostWarning(currentCost: number, threshold: number): string {
  return pc.yellow(
    `${SYMBOLS.warning} Cost: ${formatCost(currentCost)} (threshold: ${formatCost(threshold)})`,
  );
}
```
Cost text mode reuses `pc.yellow(SYMBOLS.warning ?? '⚠')` for over-threshold rows; reuse `formatCost` from `src/ui/formatters.ts` for the 2-decimal display rounding (the 6-decimal `cost_usd` from the DB rounds to 2 at display time per D-20b).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/regen/telemetry/rotation.ts` (CTE SQL body) | writer / maintenance | CTE-DELETE | No SQLite CTE-DELETE exists in the codebase yet — vector-store DELETEs are single-WHERE. **Substitute:** lift the SQL verbatim from RESEARCH §"Pattern 3" (lines 420-458). |
| `src/regen/telemetry/reader.ts` (attribution-math JOIN) | reader | derived-quantity query | No SQL JOIN-with-CTE-and-window-function elsewhere in the codebase. **Substitute:** lift from RESEARCH §"Pattern 4" (lines 486-531). |
| `src/regen/telemetry/db.ts` (`PRAGMA user_version`) | infra | native-version check | The vector store uses a `schema_metadata` KV table (`src/vector/schema.ts:57-67`) — RESEARCH §"Standard Stack" alternatives table justifies why telemetry diverges: a single int is best served by the native PRAGMA. **Substitute:** lift from RESEARCH §"Pattern 1" (lines 263-283). |

For each row in this table, the planner copies the cited code directly from `33-RESEARCH.md` — no abstract guidance, the SQL/PRAGMA text is the load-bearing artifact.

---

## Metadata

**Analog search scope:**
- `src/regen/` (Phase 32 sibling — primary analog source)
- `src/cache/` (versioning constant precedent)
- `src/vector/` (better-sqlite3 lifecycle, prepare/transaction patterns)
- `src/cli/` (Commander subcommand patterns + generate.ts wire-in site)
- `src/ui/components.ts` (renderCostWarning string contract)
- `src/utils/errors.ts` (HandoverError corrupt-DB exit pattern)
- `src/renderers/types.ts:63` (`DocumentStatus` literal — critical for `'complete'` vs `'full'` correction)
- `src/renderers/registry.ts` (`DOCUMENT_REGISTRY.requiredRounds` — JOIN key per D-02)

**Files scanned:** ~14 source files read for excerpts, ~5 test files for test-pattern shape.

**Pattern extraction date:** 2026-05-14

**Critical corrections (per RESEARCH §"Common Pitfalls"):**
1. `DocumentStatus` literal is `'complete'`, NOT `'full'` (CONTEXT.md D-01 used the wrong word in three places).
2. WAL sidecars require explicit `GITIGNORE_ENTRIES` lines (literal-line match, no glob expansion).
3. `randomUUID` must be imported from `node:crypto`, NEVER from `globalThis.crypto`.
4. Orphan-bucket label should be `'_unconsumed'` (RESEARCH recommendation) per D-01 Discretion, not CONTEXT.md's placeholder `'_orphan'`.

The planner should treat these four corrections as non-negotiable when consuming the patterns above.
