# Phase 33: Cost Telemetry — Research

**Researched:** 2026-05-14
**Domain:** Local SQLite telemetry (better-sqlite3 12.x) + Commander.js subcommand wiring + Vitest in-memory test patterns
**Confidence:** HIGH on toolchain facts (Node 24.4, better-sqlite3 12.9, Vitest 4.0, zod 4.3); HIGH on architectural fit with Phase 32 patterns; MEDIUM on specific edge cases flagged in `## Open Questions`.

## Summary

Phase 33 ships the cost-telemetry substrate v8.0 needs to make `handover generate` self-observing. The user's CONTEXT.md locks 23 decisions (D-01..D-23). That work is essentially correct — this research validates the toolchain underneath those decisions and surfaces five concrete technical landmines the planner must address explicitly:

1. **`DocumentStatus` literals in CONTEXT.md are wrong.** D-01 spells statuses as `'full' | 'partial' | 'static-only' | 'reused' | 'not-generated'`. The actual `src/renderers/types.ts:63` type uses `'complete' | 'partial' | 'static-only' | 'not-generated' | 'reused'` — the term is **`complete`**, not `full`. Every "renderer fully consumed the round" predicate must read `status === 'complete' || status === 'partial'`, not `'full'`. [VERIFIED: src/renderers/types.ts:63, src/renderers/utils.ts:141]
2. **WAL sidecar gitignore IS broken.** `GITIGNORE_ENTRIES = ['.handover/cache', '.handover/telemetry.db']` (`src/cli/init.ts:20`) does NOT cover `.handover/telemetry.db-wal` and `.handover/telemetry.db-shm`. These are sibling files (not children of a directory), so the existing literal entry will not match them. **Fix: add `.handover/telemetry.db-wal` and `.handover/telemetry.db-shm` to `GITIGNORE_ENTRIES`** — keep it explicit rather than switching to a glob (the existing helper uses literal-line matching, not glob expansion). Verified by reading `src/cli/init-detectors.ts:144-189` (`patchGitignore`) — every comparison is `lines.includes(e)`, not glob match. [VERIFIED: src/cli/init-detectors.ts:154-168]
3. **`displayState.totalCost` is the in-memory truth at end-of-run.** D-17 says "compare those same totals against `costWarningThreshold` and emit `renderCostWarning()`". The data is at `src/cli/generate.ts:1169-1170` (`displayState.totalCost = tracker.getTotalCost()`), computed AFTER `Promise.allSettled` returns. The telemetry write must land between line 1170 and `renderer.onComplete(displayState)` at line 1210. This is a < 50-line edit in `runGenerate`.
4. **`crypto.randomUUID()` is safe.** `engines.node: ">=18.0.0"` (`package.json:105`) and `globalThis.crypto.randomUUID` was added in Node 19 — that's a real gap. **Use `import { randomUUID } from 'node:crypto'`** which is supported since Node 14.17. This avoids the engines-version mismatch entirely and is documented in the `## Code Examples` section below. The verified runtime in this environment is Node 24.4.1, so both forms work, but the engines field is the contract that matters. [VERIFIED: package.json:104-106, node --version]
5. **`better-sqlite3` is already a runtime-external import** in the build (`tsup` keeps `import Database from 'better-sqlite3'` un-bundled — confirmed by grep against `dist/chunk-QAWE62NC.js:1`). No `external` array change in `tsup.config.ts` is needed even though the file's hand-curated list does NOT include `better-sqlite3`. tsup auto-externalizes node-native packages from package.json `dependencies`. [VERIFIED: dist/chunk-QAWE62NC.js, dist/reindex-7AFV5FUZ.js]

**Primary recommendation:** Follow CONTEXT.md as the locked spec. Add the five corrections above to the plan, lift the Phase 32 module structure / pure-function discipline / `formatVersion` JSON contract verbatim, and use the validation matrix below to derive `33-VALIDATION.md`. Wave 0 must create the colocated test scaffolds (`db.test.ts`, `writer.test.ts`, `reader.test.ts`, `rotation.test.ts`, `command.test.ts`) before any implementation lands.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

The user explicitly stated *"i trust your verdict that you will cover everything with robust and best practices solution"* — all D-NN entries below are Claude's locked decisions (the user's authority to delegate IS a decision).

- **D-01:** Three-table schema (`runs`, `round_runs`, `renderer_runs`). Per-renderer cost is JOIN-derived from `round_runs.cost_usd ÷ |consuming renderers|` (equal-split). Synthetic `_orphan` renderer row covers rounds with zero consuming renderers so `Σ attributed_cost == Σ round_runs.cost_usd` always holds. `standalone_cost` (no division) available via `--view standalone`.
- **D-02:** `requiredRounds` (from `DOCUMENT_REGISTRY` in `src/renderers/registry.ts`) is the JOIN key, read at query time. No denormalized junction table.
- **D-03:** `renderer_runs.elapsed_ms` is sourced from the existing `docStart` timing at `src/cli/generate.ts:987-1035` (`durationMs`). The only TRUE per-renderer measurement.
- **D-04:** `TELEMETRY_VERSION = 1` constant exported from `src/regen/telemetry/db.ts`. Bump on column rename, type change, or semantic re-interpretation. Index-only additions and pure column-additions with default-null do NOT bump in v8.0.
- **D-05:** Schema versioning via `PRAGMA user_version` + drop-and-recreate on mismatch. First-run path == version-mismatch path.
- **D-06:** Module location `src/regen/telemetry/` — sibling to `src/regen/dep-graph.ts` (smarter-regen track). Files: `db.ts`, `schema.ts`, `writer.ts`, `reader.ts`, `rotation.ts`, `index.ts` (barrel).
- **D-07:** Row granularity: 1 `runs` row per `handover generate`. 1 `round_runs` per round actually executed. 1 `renderer_runs` per renderer that participated (including `'reused'` and `'not-generated'`). `run_id` is `crypto.randomUUID()`.
- **D-08:** `--dry-run` writes NO telemetry. `runs.dry_run` column exists for future use; always `false` in v8.0.
- **D-09:** Default `handover cost` output is two scannable text sections: "Recent runs (last 10)" + "Per-renderer aggregate (over 10 runs)". No box-drawing. `⚠` for over-threshold runs. Empty DB prints `No telemetry yet.` + exits 0.
- **D-10:** Flag surface: `--runs <N>` (default 10), `--since-date <ISO>` (mutually exclusive with `--runs`), `--renderer <id>` (filter + time-series view), `--view standalone` (switches attribution math), `--json`. No `--days N`.
- **D-11:** `--json` carries `formatVersion: 1` + `telemetryVersion: 1`. Phase 36 pins to `formatVersion: 1`. Additive changes do NOT bump; renames/removals do. ISO-8601 timestamps in JSON mode (relative "3m ago" is TTY-only).
- **D-12:** `handover cost` exit code always 0 (read-only observability).
- **D-13:** Rotation in a separate transaction AFTER the write transaction commits. Window: UNION of (last 100 run_ids per renderer) AND (run_ids within last 90 days). Three child-first DELETE statements (`renderer_runs`, `round_runs`, `runs`).
- **D-14:** Fully-cached runs ARE persisted (cost ≈ 0, cache_hit=true rows). Visibility into cache effectiveness is the value.
- **D-15:** No `FOREIGN KEY` constraints. Atomic-transaction discipline (D-13) covers integrity. Defensive JOINs filter on `run_id IN (SELECT run_id FROM runs)` on read.
- **D-16:** Cache-hit info lives on `round_runs.cache_hit` only. Per-renderer cache-hit is derived at query time.
- **D-17:** Threshold warning fires AFTER write commits, sourced from the same in-memory totals just persisted (NOT a SELECT-back round-trip). Telemetry-write failure falls back to existing in-memory pre-write check.
- **D-18:** `runs.threshold_usd` and `runs.threshold_exceeded` stored as-of the run (auditability — historical rows not retroactively re-flagged).
- **D-19:** Telemetry write failure NEVER breaks `handover generate`. `try/catch` + `logger.warn` + continue. Mirrors Phase 32 D-22.
- **D-20:** DB open is lazy (end-of-run, right before `recordRun`). DB closed in `finally`. `better-sqlite3` is synchronous.
- **D-20a:** `PRAGMA journal_mode = WAL` on every open, set right after `new Database(...)`.
- **D-20b:** Cost-precision: round to 6 decimal places before persistence (`Math.round(x * 1e6) / 1e6`). Display layer rounds further to 2 decimals.
- **D-21:** `handover cost` failure modes: missing DB → `No telemetry yet.` + exit 0. Corrupt DB → one-liner remediation + exit 1. Schema-mismatch handled silently at write-time by D-05.
- **D-22:** 90/90/90/85 coverage applies. Detailed test list per success criterion (see CONTEXT.md original for the full enumeration).
- **D-23:** Default test fs strategy is `new Database(':memory:')`. Tmpdir + UUID paths reserved for tests that need on-disk persistence (PRAGMA user_version round-trip, schema-mismatch drop-and-recreate).

### Claude's Discretion

User delegated implementation entirely. CONTEXT.md flags these specific revision areas if research surfaces evidence:
- **D-01 attribution math** — equal-split is the standard; planner may revise to token-weighted attribution if research surfaces a stronger convention. Research recommendation: **keep equal-split.** No external standard contradicts it; equal-split is the only formula that reconciles across views (`standalone_cost` is documented as double-counting).
- **D-01 orphan-bucket name** — `_orphan` is a placeholder. Research recommendation: **rename to `_unconsumed`** for clarity (planner's call; either is defensible).
- **D-07 ID source** — `crypto.randomUUID()` locked. Switch to `ulid` only if a downstream consumer needs lexicographic time-sort. Research recommendation: **keep `crypto.randomUUID()`**; no downstream consumer in Phases 34/35/36 surfaces a sort-order requirement.
- **D-09/D-10 output formatting details** — column widths, "3m ago" vs ISO, color via `picocolors`/`sisteransi`. Planner finalizes.
- **D-11 exact JSON field names** beyond `formatVersion` + top-level keys.
- **D-13 rotation SQL phrasing** — UNION subquery vs CTE. See `## Code Examples` below for the recommended phrasing.
- **D-22 specific assertion text** — test names + fixtures are planner's call.

### Deferred Ideas (OUT OF SCOPE)

- Per-renderer `costWarningThreshold` map (deferred — TELEM-05 is run-total only).
- Trend-regression alerts (TELEM-06 — Deferred to v8.x; trigger: 30+ run baseline accumulates).
- Eval-run cost recording (Phase 35 owns this).
- Cross-provider routing in a single run (ROUTE-08 deferred).
- `handover cost --export <csv|tsv>` (add when a user asks).
- Sticky-PR cost-diff badge (Phase 36 owns).
- `handover cost --renderer X --since-date Y` time-series chart (deferred).
- VS Code panel / web UI (distribution surface — v8.0 explicit non-goal).
- Per-round telemetry export for prompt-cache analysis (deferred).
- OS-keychain protection of telemetry.db (overkill).
- Per-renderer model routing logic (Phase 34 — schema accommodates a `model` column from day one so the schema does not have to bump).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TELEM-01 | Per-renderer cost/token/time persisted to `.handover/telemetry.db` with `renderer_runs` table + `idx_renderer_runs_renderer` index | D-01..D-07 schema design (3-table normalized); `## Standard Stack` (better-sqlite3 12.9.0 with WAL); `## Code Examples` (DDL + index creation) |
| TELEM-02 | `handover cost` subcommand shows last-N per-renderer summary (cost USD, in/out tokens, wall time, run timestamp) | D-09..D-12 CLI output; `## Code Examples` (Commander subcommand pattern from `src/cli/index.ts`); `## Architecture Patterns` (reader module with attributed_cost JOIN) |
| TELEM-03 | Records contain only metadata — never prompt content or credentials — enforced via Zod schema on write | D-06 `schema.ts` Zod boundary; `## Code Examples` (Zod RunRecordSchema), `## Don't Hand-Roll` (Zod validation) |
| TELEM-04 | Auto-rotation: last 90 days OR last 100 runs per renderer (whichever yields more) | D-13 two-transaction rotation; `## Code Examples` (UNION-of-keep-sets DELETE SQL) |
| TELEM-05 | Existing `costWarningThreshold` config key wired to persisted telemetry, emits warning when run exceeds threshold | D-17 fires-after-write order; D-18 stored `threshold_usd`/`threshold_exceeded`; D-19 graceful-degrade fallback to in-memory check |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cost-data accumulation per round (LLM-side) | AI Rounds Layer (`src/ai-rounds/`) + Context (`src/context/tracker.ts`) | — | The `TokenUsageTracker` already records per-round input/output/cache tokens at `recordRound()` (existing). Phase 33 reads, does not re-implement. |
| Per-run aggregation | CLI Layer (`src/cli/generate.ts`) | — | The aggregation already happens at `displayState.totalCost = tracker.getTotalCost()` (line 1170). Phase 33 packages those numbers for write. |
| Telemetry persistence | Smarter-regen track (`src/regen/telemetry/`) | — | New module placement per D-06; sibling to `src/regen/dep-graph.ts`. Owns DB lifecycle, schema, writer, reader, rotation. |
| `handover cost` subcommand | CLI Layer (`src/cli/cost.ts` + entry registration in `src/cli/index.ts`) | Smarter-regen track (calls `reader.ts` from `src/regen/telemetry/`) | Commander.js subcommand pattern; reads from telemetry module only — no LLM calls, no analyzer access. |
| Schema-mismatch handling | Smarter-regen track (`src/regen/telemetry/db.ts`) | — | `PRAGMA user_version` check at DB open; drop+recreate on mismatch. Self-contained. |
| Threshold-warning emission | UI Layer (`src/ui/components.ts:renderCostWarning` — unchanged) + CLI Layer (`src/cli/generate.ts` reorders the call to fire after telemetry write) | — | Warning string is already correct; only firing-order moves. |
| Gitignore patching for WAL sidecars | CLI Layer (`src/cli/init.ts` `GITIGNORE_ENTRIES`) | — | Extend the existing constant; let the existing `patchGitignore` helper place them. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | `^12.6.2` declared; `12.9.0` installed | Synchronous SQLite driver | Already a prod dep (`package.json:59`), already used at `src/vector/vector-store.ts` — Phase 33 reuses. Native bindings already built locally. [VERIFIED: package.json:59, node_modules/better-sqlite3/package.json] |
| `zod` | `^4.3.6` declared | Runtime schema validation at write boundary | Already a prod dep (`package.json:74`), the canonical "Zod at the boundary" pattern used throughout (`src/config/schema.ts`, `src/regen/dep-graph.ts` for `DepGraphSchema`). [VERIFIED: package.json:74] |
| `commander` | `^14.0.3` declared | CLI argument parsing | Already a prod dep (`package.json:60`). Existing subcommands at `src/cli/index.ts:15-141`. [VERIFIED: package.json:60, src/cli/index.ts] |
| `node:crypto` | built-in | `randomUUID()` for `run_id` | Stable since Node 14.17 via `import { randomUUID } from 'node:crypto'`. **Use this form, NOT `globalThis.crypto.randomUUID()`** because the latter requires Node 19+ and `package.json:105` declares `engines.node: ">=18.0.0"`. [VERIFIED: package.json:104-106, node --version 24.4.1] |
| `picocolors` | `^1.1.0` declared | Terminal colors for `handover cost` TTY output | Already used everywhere in `src/ui/`. The `⚠` symbol uses `pc.yellow()` per `renderCostWarning()` at `src/ui/components.ts:415-419`. [VERIFIED: package.json:67] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/better-sqlite3` | `^7.6.13` (dev) | TypeScript types for better-sqlite3 | Already installed. Provides `Database.Database` type used at `src/vector/vector-store.ts:36`. [VERIFIED: package.json:83] |
| `vitest` | `^4.0.18` (dev) | Test framework | Same Vitest 4.0.18 the rest of the codebase uses. `:memory:` DB works inside Vitest workers; both `forks` (default) and `threads` pools handle the native binding correctly. [VERIFIED: package.json:101] |
| `node:fs` / `node:path` | built-in | DB directory mkdir, telemetry-DB path resolution | Standard import pattern (e.g., `src/vector/vector-store.ts:9-10`). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `better-sqlite3` synchronous DB | `sqlite3` async DB | Async API ergonomics — but worse performance, and the codebase already standardized on `better-sqlite3` synchronous for the vector store. CONSISTENCY beats perceived ergonomics. **Keep better-sqlite3.** |
| `crypto.randomUUID()` | `ulid` package | ULIDs are lexicographically time-sortable. But `ORDER BY started_at DESC` already achieves the same effect, and `ulid` is a new dep with no other Phase 33+ consumer. **Keep `crypto.randomUUID()`** (matches D-07). |
| `PRAGMA user_version` | A `schema_metadata` key/value table (like `src/vector/schema.ts:18-67` does) | `user_version` is one integer, native, zero overhead, native PRAGMA support — perfect for a single-version field. The KV table is appropriate when you also track `embedding_model`, `embedding_dimensions`, etc. (vector store's case). **Telemetry uses `user_version`** (D-05). |
| Foreign keys with `PRAGMA foreign_keys = ON` | No FKs, atomic transactions only | FKs need explicit pragma per connection (easy to forget — silent failure). Atomic-transaction discipline plus defensive read-side JOIN filter is simpler. **No FKs** (D-15). |
| Single-table schema (denormalized) | Three-table normalized | Single-table can't reconcile per-renderer cost without inventing numbers. Three-table preserves the only truth (round-level cost) and derives renderer-level cost as a JOIN view. **Three tables** (D-01). |

**Installation:**
```bash
# Nothing to install — all dependencies already in package.json.
# Just verify the typecheck of @types/better-sqlite3 against the runtime version.
```

**Version verification:**
```bash
npm view better-sqlite3 version
# Latest: 12.x range; ^12.6.2 already declared, 12.9.0 installed [VERIFIED 2026-05-14]
```

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  handover generate (existing, mostly untouched)                     │
│                                                                     │
│   ┌──────────────┐    ┌────────────────┐    ┌──────────────────┐    │
│   │   Static     │ →  │   AI Rounds    │ →  │  Promise.allSettled  │
│   │   Analysis   │    │ (TokenUsage-   │    │  Render loop     │    │
│   │              │    │   Tracker rec) │    │  (durationMs)    │    │
│   └──────────────┘    └────────────────┘    └────────┬─────────┘    │
│                                                     │              │
│                                                     ▼              │
│                                       ┌──────────────────────────┐ │
│                                       │ NEW: assemble RunRecord  │ │
│                                       │ from tracker + displayState│
│                                       │ + render results          │ │
│                                       └────────────┬──────────────┘ │
│                                                    │                │
│                                       try { ... } catch (D-19)      │
│                                                    │                │
│                                                    ▼                │
└────────────────────────────────────────────────────┼────────────────┘
                                                     │
              ┌──────────────────────────────────────┴─────────────┐
              │  src/regen/telemetry/ (new)                         │
              │                                                     │
              │  index.ts (barrel)                                  │
              │     ↑                                               │
              │  ┌──┴──────────────┐                                │
              │  │ writer.ts       │  recordRun({run,roundRuns,    │
              │  │                 │             rendererRuns})    │
              │  │                 │   → INSERT in 1 transaction   │
              │  │                 │   → then rotation.ts (2nd tx) │
              │  └──┬──────────────┘                                │
              │     │ uses                                          │
              │     ▼                                               │
              │  ┌─────────────────┐  ┌────────────────┐            │
              │  │ schema.ts (zod) │  │ rotation.ts    │            │
              │  │ RunRecord-      │  │ rotateRetention│            │
              │  │ Schema, ...     │  │ (D-13 SQL)     │            │
              │  └─────────────────┘  └────────────────┘            │
              │                                                     │
              │  ┌─────────────────┐                                │
              │  │ db.ts           │  openDb() → Database          │
              │  │   TELEMETRY_VER │   • PRAGMA journal_mode=WAL   │
              │  │   user_version  │   • PRAGMA user_version check │
              │  │   schema DDL    │   • drop+recreate on mismatch │
              │  └─────────────────┘                                │
              │                                                     │
              │  ┌─────────────────┐  used by handover cost CLI    │
              │  │ reader.ts       │  getRecentRuns(),             │
              │  │                 │  getRendererSummary()         │
              │  └─────────────────┘                                │
              └─────────────────────────────────────────────────────┘
                                       ↑
                                       │ reads
              ┌────────────────────────┴─────────────────────────┐
              │  src/cli/cost.ts (new) — handover cost           │
              │  • Commander subcommand (registered in           │
              │    src/cli/index.ts following the existing       │
              │    serve/search/reindex pattern)                 │
              │  • Calls reader.ts; formats text or --json       │
              │  • Exit code always 0 except corrupt-DB → 1      │
              └──────────────────────────────────────────────────┘
```

**Data-flow invariants:**

1. The *only* write path into `.handover/telemetry.db` is `writer.recordRun()`, called once per `handover generate` invocation (not per round, not per renderer).
2. `handover cost` is read-only — it MUST open the DB, never run rotation, never write.
3. Reads use `WAL` snapshot semantics. While `handover generate` is mid-write, a concurrent `handover cost` can read prior data without blocking.
4. The threshold-warning emission (D-17) is a UI-side call (`renderCostWarning()` at `src/ui/components.ts:415` — unchanged) but the *trigger* moves from pre-write to post-write inside `runGenerate`.

### Recommended Project Structure

```
src/
├── regen/
│   ├── dep-graph.ts             # Phase 32 — unchanged
│   ├── dep-graph.test.ts        # Phase 32 — unchanged
│   └── telemetry/               # NEW (Phase 33)
│       ├── db.ts                # openDb(), TELEMETRY_VERSION, schema DDL, user_version check
│       ├── db.test.ts           # in-memory DB lifecycle, WAL pragma, version-mismatch drop+recreate
│       ├── schema.ts            # RunRecordSchema, RoundRunRecordSchema, RendererRunRecordSchema (zod)
│       ├── schema.test.ts       # Zod parse/strip behavior (TELEM-03 negative-existence)
│       ├── writer.ts            # recordRun(db, run, roundRuns, rendererRuns) — atomic INSERT transaction
│       ├── writer.test.ts       # transaction atomicity, all-or-nothing, run_id uniqueness
│       ├── reader.ts            # getRecentRuns(), getRendererSummary() — JOIN-based attributed_cost
│       ├── reader.test.ts       # attribution reconciliation, orphan bucket, --view standalone
│       ├── rotation.ts          # rotateRetention(db) — UNION-of-keep-sets DELETE SQL
│       ├── rotation.test.ts     # 90-day window, 100-per-renderer window, separate-tx isolation (D-13)
│       └── index.ts             # barrel: exports public API
├── cli/
│   ├── cost.ts                  # NEW — runCost(opts): handover cost subcommand
│   ├── cost.test.ts             # NEW — flag parsing, text vs JSON output, empty-DB path
│   ├── index.ts                 # MODIFIED — register `handover cost` subcommand (~10 lines)
│   ├── init.ts                  # MODIFIED — extend GITIGNORE_ENTRIES with WAL/SHM sidecars (1 line)
│   └── generate.ts              # MODIFIED — wire-in recordRun + reorder threshold warning (~30 lines)
└── (everything else unchanged)
```

### Pattern 1: Versioned Local Store + `user_version` PRAGMA

**What:** SQLite stores its own version. Open the DB, read `PRAGMA user_version`, compare to `TELEMETRY_VERSION` constant. On mismatch (or 0 — first run), drop existing tables, create the v1 schema, set `user_version`.

**When to use:** Every Phase 33 DB open. The check is sub-millisecond.

**Example:**
```typescript
// Source: derived from src/cache/round-cache.ts CACHE_VERSION pattern and
//         SQLite docs https://www.sqlite.org/pragma.html#pragma_user_version
//         + better-sqlite3 API https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
import Database from 'better-sqlite3';

export const TELEMETRY_VERSION = 1 as const;

export function openTelemetryDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // 1. WAL FIRST (D-20a) — must precede other PRAGMAs to take effect cleanly.
  db.pragma('journal_mode = WAL');
  // 2. NORMAL synchronous is the recommended pairing with WAL — sufficient
  //    durability for a local-metadata store, big perf win on writes.
  //    Source: https://sqlite.org/wal.html (synchronous=NORMAL is the default
  //    in WAL mode in better-sqlite3 via SQLITE_DEFAULT_WAL_SYNCHRONOUS=1).
  db.pragma('synchronous = NORMAL');

  // 3. Version check (D-05).
  const storedVersion = db.pragma('user_version', { simple: true }) as number;
  if (storedVersion !== TELEMETRY_VERSION) {
    // First run (storedVersion === 0) OR mismatch — both go through here.
    initSchema(db);                                 // drops + recreates tables
    db.pragma(`user_version = ${TELEMETRY_VERSION}`);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS renderer_runs;
    DROP TABLE IF EXISTS round_runs;
    DROP TABLE IF EXISTS runs;

    CREATE TABLE runs (
      run_id            TEXT PRIMARY KEY,
      started_at        TEXT NOT NULL,
      ended_at          TEXT NOT NULL,
      total_cost_usd    REAL NOT NULL,
      total_input_tokens  INTEGER NOT NULL,
      total_output_tokens INTEGER NOT NULL,
      top_model         TEXT NOT NULL,
      provider          TEXT NOT NULL,
      threshold_usd     REAL,                       -- null when costWarningThreshold not set
      threshold_exceeded INTEGER NOT NULL DEFAULT 0, -- bool as 0/1
      since_ref         TEXT,                       -- nullable; null when no --since
      dry_run           INTEGER NOT NULL DEFAULT 0  -- bool; always 0 in v8.0 (D-08)
    );

    CREATE TABLE round_runs (
      run_id            TEXT NOT NULL,
      round_num         INTEGER NOT NULL,
      model             TEXT NOT NULL,
      provider          TEXT NOT NULL,
      input_tokens      INTEGER NOT NULL,
      output_tokens     INTEGER NOT NULL,
      cache_read_tokens INTEGER,
      cache_creation_tokens INTEGER,
      cost_usd          REAL NOT NULL,
      cache_hit         INTEGER NOT NULL DEFAULT 0,
      elapsed_ms        INTEGER NOT NULL,
      started_at        TEXT NOT NULL,
      PRIMARY KEY (run_id, round_num)
    );

    CREATE TABLE renderer_runs (
      run_id        TEXT NOT NULL,
      renderer_id   TEXT NOT NULL,
      model         TEXT,                           -- nullable until Phase 34 (D-01 model column)
      status        TEXT NOT NULL,                  -- 'complete'|'partial'|'static-only'|'reused'|'not-generated' (matches src/renderers/types.ts:63)
      elapsed_ms    INTEGER NOT NULL,
      ran_at        TEXT NOT NULL,
      PRIMARY KEY (run_id, renderer_id)
    );

    CREATE INDEX idx_renderer_runs_renderer ON renderer_runs(renderer_id, ran_at DESC);
  `);
}
```

**Note on `PRAGMA user_version` ordering with transactions:** The `user_version = N` SET form is *not* allowed inside a BEGIN/COMMIT transaction in some SQLite versions; the recommended ordering is to perform the schema DDL (which is naturally transactional under `db.exec()` of `CREATE TABLE` statements — SQLite implicitly wraps DDL in a transaction) and THEN set `user_version` outside any explicit BEGIN block. `db.exec()` is the right tool here; `db.transaction()` is NOT needed for one-shot schema initialization. [CITED: https://www.sqlite.org/pragma.html#pragma_user_version]

### Pattern 2: All-or-Nothing INSERT Transaction

**What:** All three tables' rows for one run are inserted under a single `db.transaction()`. Rotation is a SEPARATE transaction (D-13).

**When to use:** `writer.recordRun()`.

**Example:**
```typescript
// Source: pattern lifted verbatim from src/vector/vector-store.ts:128-155
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { RunRecordSchema, RoundRunRecordSchema, RendererRunRecordSchema } from './schema.js';

export function recordRun(
  db: Database.Database,
  run: z.infer<typeof RunRecordSchema>,
  roundRuns: z.infer<typeof RoundRunRecordSchema>[],
  rendererRuns: z.infer<typeof RendererRunRecordSchema>[],
): void {
  // Zod parse strips unexpected fields (TELEM-03 enforcement).
  const parsedRun = RunRecordSchema.parse(run);
  const parsedRoundRuns = roundRuns.map((r) => RoundRunRecordSchema.parse(r));
  const parsedRendererRuns = rendererRuns.map((r) => RendererRunRecordSchema.parse(r));

  const insertRun = db.prepare(`
    INSERT INTO runs (run_id, started_at, ended_at, total_cost_usd, total_input_tokens,
                      total_output_tokens, top_model, provider, threshold_usd,
                      threshold_exceeded, since_ref, dry_run)
    VALUES (@runId, @startedAt, @endedAt, @totalCostUsd, @totalInputTokens,
            @totalOutputTokens, @topModel, @provider, @thresholdUsd,
            @thresholdExceeded, @sinceRef, @dryRun)
  `);
  const insertRound = db.prepare(`
    INSERT INTO round_runs (run_id, round_num, model, provider, input_tokens, output_tokens,
                            cache_read_tokens, cache_creation_tokens, cost_usd, cache_hit,
                            elapsed_ms, started_at)
    VALUES (@runId, @roundNum, @model, @provider, @inputTokens, @outputTokens,
            @cacheReadTokens, @cacheCreationTokens, @costUsd, @cacheHit,
            @elapsedMs, @startedAt)
  `);
  const insertRenderer = db.prepare(`
    INSERT INTO renderer_runs (run_id, renderer_id, model, status, elapsed_ms, ran_at)
    VALUES (@runId, @rendererId, @model, @status, @elapsedMs, @ranAt)
  `);

  const writeAll = db.transaction(() => {
    insertRun.run({
      ...parsedRun,
      thresholdExceeded: parsedRun.thresholdExceeded ? 1 : 0,
      dryRun: parsedRun.dryRun ? 1 : 0,
    });
    for (const r of parsedRoundRuns) {
      insertRound.run({ ...r, cacheHit: r.cacheHit ? 1 : 0 });
    }
    for (const r of parsedRendererRuns) {
      insertRenderer.run(r);
    }
  });

  writeAll();   // commits the INSERT transaction
}
```

### Pattern 3: Two-Transaction Rotation (D-13)

**What:** After the write transaction commits, run rotation in a separate transaction. If rotation fails (disk full, corruption), the just-written run is preserved.

**Example (SQL is the load-bearing part):**
```typescript
// Source: derived from D-13 spec; SQL design per
//   https://www.sqlite.org/lang_with.html (CTE) and
//   https://www.sqlite.org/lang_select.html (window functions PARTITION BY)
//
// Strategy:
//   keep_set := UNION of
//     (a) last 100 run_ids per renderer  (ROW_NUMBER() OVER (PARTITION BY ...) <= 100)
//     (b) all run_ids within last 90 days (started_at >= datetime('now','-90 days'))
//   DELETE in child-first order: renderer_runs, round_runs, runs.
//
// "Last 100 per renderer" is computed against `renderer_runs` joined to `runs.started_at`.
// "Last 90 days" is computed against `runs.started_at` directly.

export function rotateRetention(db: Database.Database): void {
  const rotate = db.transaction(() => {
    // CTE: union of run_ids we want to keep.
    const KEEP_SET = `
      WITH
        per_renderer_keep AS (
          SELECT run_id
          FROM (
            SELECT
              renderer_runs.run_id AS run_id,
              renderer_runs.renderer_id AS renderer_id,
              ROW_NUMBER() OVER (
                PARTITION BY renderer_runs.renderer_id
                ORDER BY runs.started_at DESC
              ) AS rn
            FROM renderer_runs
            JOIN runs ON runs.run_id = renderer_runs.run_id
          )
          WHERE rn <= 100
        ),
        recent_keep AS (
          SELECT run_id
          FROM runs
          WHERE started_at >= datetime('now', '-90 days')
        ),
        keep AS (
          SELECT run_id FROM per_renderer_keep
          UNION
          SELECT run_id FROM recent_keep
        )
    `;

    // Child-first DELETEs (D-15 — no FK cascades; we order manually).
    db.prepare(`${KEEP_SET} DELETE FROM renderer_runs WHERE run_id NOT IN (SELECT run_id FROM keep)`).run();
    db.prepare(`${KEEP_SET} DELETE FROM round_runs    WHERE run_id NOT IN (SELECT run_id FROM keep)`).run();
    db.prepare(`${KEEP_SET} DELETE FROM runs          WHERE run_id NOT IN (SELECT run_id FROM keep)`).run();
  });
  rotate();
}
```

**Performance:** With `idx_renderer_runs_renderer` on `(renderer_id, ran_at DESC)` and an index on `runs(started_at DESC)` (recommendation: add it; not blocking but sub-millisecond gains), this runs in microseconds on ≤10k rows.

### Pattern 4: Attribution Math JOIN (D-01)

**What:** Per-renderer cost is `round_runs.cost_usd ÷ count(consuming renderers in this run)`. Reconciles by construction.

**Example:**
```sql
-- Source: D-01 spec, applied to the schema in Pattern 1.
-- "Consuming renderer" predicate: renderer_runs.status IN ('complete','partial')
--   AND DOCUMENT_REGISTRY[renderer_id].requiredRounds INCLUDES round_runs.round_num.
-- The DOCUMENT_REGISTRY requiredRounds mapping is a CODE constant — we either:
--   (a) materialize it as a temporary table (recommended below — clean, no string injection), OR
--   (b) build an `IN (...)` clause per renderer-round pair (string-built SQL — error-prone).

-- Pseudocode for what reader.ts assembles:
--
--   1. Build a [(renderer_id, round_num)] consumption list from DOCUMENT_REGISTRY in TS.
--      Example: [['03-architecture', 1], ['03-architecture', 2], ['03-architecture', 3], ['03-architecture', 4],
--                ['06-modules', 2], ...]
--   2. Create a temporary table at session start:
--      CREATE TEMP TABLE renderer_round_map (renderer_id TEXT, round_num INTEGER, PRIMARY KEY (renderer_id, round_num));
--   3. INSERT the consumption pairs.
--   4. Run the attribution query:

WITH consuming_renderers AS (
  SELECT
    rr.run_id,
    m.round_num,
    rr.renderer_id
  FROM renderer_runs rr
  JOIN renderer_round_map m ON m.renderer_id = rr.renderer_id
  WHERE rr.status IN ('complete', 'partial')
),
consumer_counts AS (
  SELECT
    cr.run_id,
    cr.round_num,
    COUNT(*) AS n_consumers
  FROM consuming_renderers cr
  GROUP BY cr.run_id, cr.round_num
),
attributed AS (
  SELECT
    cr.renderer_id,
    rdr.cost_usd / cc.n_consumers AS attributed_cost
  FROM consuming_renderers cr
  JOIN round_runs rdr ON rdr.run_id = cr.run_id AND rdr.round_num = cr.round_num
  JOIN consumer_counts cc ON cc.run_id = cr.run_id AND cc.round_num = cr.round_num
),
orphan AS (
  -- Rounds with cost > 0 and NO consuming renderer.
  SELECT
    '_unconsumed' AS renderer_id,
    rdr.cost_usd AS attributed_cost
  FROM round_runs rdr
  WHERE rdr.cost_usd > 0
    AND NOT EXISTS (
      SELECT 1 FROM consuming_renderers cr
      WHERE cr.run_id = rdr.run_id AND cr.round_num = rdr.round_num
    )
)
SELECT renderer_id, SUM(attributed_cost) AS total_attributed_cost_usd
FROM (
  SELECT * FROM attributed
  UNION ALL
  SELECT * FROM orphan
)
GROUP BY renderer_id
ORDER BY total_attributed_cost_usd DESC;
```

**Reconciliation invariant:** `Σ total_attributed_cost_usd` across all renderer rows == `Σ round_runs.cost_usd` over the same `run_id` set. The `_unconsumed` row catches any round whose cost was not attributable to any consuming renderer. Test in `reader.test.ts` (see `## Validation Architecture`).

### Anti-Patterns to Avoid

- **Anti-pattern:** Build an `IN (?, ?, ...)` clause from JS-side `DOCUMENT_REGISTRY.requiredRounds` lookups — string-built SQL is error-prone and the SQL becomes opaque. **Use a temp table per query session** as in Pattern 4.
- **Anti-pattern:** Open the DB once at process start, reuse across multiple operations. **D-20 says lazy open.** Open immediately before `recordRun`, close in `finally`. `handover cost` is a separate process — different DB handle.
- **Anti-pattern:** Use `db.exec()` for the INSERTs. `exec()` does not bind parameters safely — `prepare()` + `.run()` is the right surface. [CITED: better-sqlite3 docs — "Avoid for untrusted sources; use prepared statements instead"]
- **Anti-pattern:** Set `PRAGMA foreign_keys = ON` and rely on cascading deletes. D-15 explicitly says no FKs. Atomic-transaction discipline (D-13) plus child-first DELETE ordering covers integrity.
- **Anti-pattern:** Read `costWarningThreshold` from a different config path or hardcode the default. The value lives at `config.costWarningThreshold ?? 1.0` (`src/cli/generate.ts:229`). Reuse, do not duplicate.
- **Anti-pattern:** Compute `top_model` from a fresh provider lookup. The top model is whatever `config.model ?? 'default'` resolved to (`src/cli/generate.ts:220`) — read from `displayState.model`.
- **Anti-pattern:** Mutate `displayState.totalCost` after writing telemetry just to display the warning. The current value is already correct; the warning reads from `displayState` and `displayState` is the SAME truth that was just persisted.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | A custom RNG-based id | `import { randomUUID } from 'node:crypto'` | Built-in, RFC 4122 v4 compliant, no deps. [CITED: https://nodejs.org/api/crypto.html#cryptorandomuuidoptions] |
| Runtime row validation | Hand-written `if (!row.cost_usd) throw` chains | Zod (`RunRecordSchema.parse(row)`) | Already a codebase convention (`src/regen/dep-graph.ts:56-62`, `src/config/schema.ts`). Strips unexpected keys (D-22 TELEM-03 negative-existence assertion). |
| WAL setup | Custom retry loop, multi-pragma orchestration | Single `db.pragma('journal_mode = WAL')` then `db.pragma('synchronous = NORMAL')` | `journal_mode = WAL` persists in the DB file itself — once set, subsequent opens inherit. [CITED: https://sqlite.org/wal.html] |
| Schema versioning | A `schema_metadata` KV table (overkill for one int) | `PRAGMA user_version` | Native SQLite, single int, free. [CITED: https://www.sqlite.org/pragma.html#pragma_user_version] |
| 6-decimal rounding | Brewing a `Decimal` library or string-manipulating | `Math.round(x * 1e6) / 1e6` | One line. No existing helper in `src/utils/` performs 6-decimal rounding — confirmed by grepping all files. The codebase only has `toFixed(2)` for display (`src/ui/formatters.ts:36`). |
| Test DB file management | Real-tmpdir with manual cleanup for every test | `new Database(':memory:')` | Default per D-23. Auto-cleans on `close()` or test-worker exit. Reserve real tmpdir only for tests that need a file-handle re-open (schema-mismatch test, file-persistence test). |
| Commander option parsing for `--runs` | Custom `process.argv` slicing | `commander`'s `.option('--runs <n>', '...', (v) => parseInt(v, 10), 10)` (exact form used at `src/cli/index.ts:98-103` for `--top-k`) | Stop reinventing; the precedent exists. |
| ISO-8601 timestamp formatting | `Intl.DateTimeFormat` chains | `new Date().toISOString()` | Used everywhere already (`src/cache/round-cache.ts:140`, `src/regen/dep-graph.ts:127`). |
| "Time ago" relative formatting | Bespoke math | A tiny inline helper (~10 LoC) | Don't pull in a deps for it. **Only used in TTY output**, not in `--json` (D-11). One small helper inline in `cost.ts`. |

**Key insight:** The hand-rolling temptation in this phase is concentrated around (a) decimal arithmetic for cost (use `Math.round(x*1e6)/1e6` per D-20b — done), and (b) UUID generation (use Node built-in per D-07 — done). Everything else has a precedent in this codebase.

## Runtime State Inventory

> Phase 33 is a NET-NEW module (telemetry DB does not exist yet in production). No rename/refactor. Skipping the per-category audit is acceptable per the section's "rename/refactor only" trigger. Recording explicitly here:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `.handover/telemetry.db` is created fresh on first `handover generate` run after Phase 33 ships. Pre-Phase-33 users have no telemetry DB. | None |
| Live service config | None — Phase 33 has no external service dependency. | None |
| OS-registered state | None | None |
| Secrets/env vars | None — telemetry DB contains zero credentials by design (D-22 TELEM-03 assertion). | None |
| Build artifacts | tsup externalizes `better-sqlite3` (already an external import at runtime per `dist/chunk-QAWE62NC.js:1`). No build artifact change. | None |

**Nothing found in any category** — verified by manual audit of `package.json`, `tsup.config.ts`, `dist/*.js`, and `src/` grep for `telemetry`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `better-sqlite3` native binding | Phase 33 module + existing vector store | ✓ | 12.9.0 installed (12.6.2 declared) | — |
| Node.js runtime | All TS code | ✓ | 24.4.1 (engines: `>=18.0.0`) | — |
| `@types/better-sqlite3` | Typecheck of DB code | ✓ | 7.6.13 | — |
| `zod` | Write-boundary validation | ✓ | 4.x (declared `^4.3.6`) | — |
| `commander` | `handover cost` subcommand | ✓ | 14.x | — |
| Vitest 4.0.18 | Test runner | ✓ | 4.0.18 declared | — |
| SQLite WAL filesystem support | WAL mode | ✓ | All modern filesystems (APFS, ext4, NTFS, btrfs) support WAL | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

**Platform-specific concern:** WAL mode behaves consistently on APFS (macOS), ext4 (Linux), and NTFS (Windows). The `.handover/telemetry.db-wal` and `.handover/telemetry.db-shm` sidecars are created by SQLite automatically; this is the gitignore concern flagged above, not a runtime concern.

## Common Pitfalls

### Pitfall 1: `'full'` vs `'complete'` status mismatch

**What goes wrong:** CONTEXT.md D-01 uses `'full'` for the renderer_runs.status check; `src/renderers/types.ts:63` actually uses `'complete'`. If the writer compares against `'full'`, every row gets miscategorized — the attribution math returns nonsense.

**Why it happens:** CONTEXT.md was written from memory; the actual enum is `'complete' | 'partial' | 'static-only' | 'not-generated' | 'reused'`.

**How to avoid:** The "consuming renderer" predicate in `reader.ts` is `status IN ('complete', 'partial')`. The `renderer_runs.status` column accepts the five literal values from `src/renderers/types.ts:63`. Wave 0 task: add a small type alias in `schema.ts` that imports the actual `DocumentStatus.status` union so future enum changes catch at compile time.

**Warning signs:** Test `attribution_reconciliation` fails — `Σ attributed_cost` won't equal `Σ round_runs.cost_usd`, and likely every renderer ends up in `_unconsumed`.

### Pitfall 2: WAL sidecars leak into git

**What goes wrong:** First `handover generate` run after Phase 33 ships writes `.handover/telemetry.db`, `.handover/telemetry.db-wal`, and `.handover/telemetry.db-shm`. The existing `GITIGNORE_ENTRIES` (`src/cli/init.ts:20`) covers `.handover/telemetry.db` only via literal-line match (`src/cli/init-detectors.ts:154-168`). The two sidecars are NOT covered. `git status` shows two unexpected files.

**Why it happens:** The existing `patchGitignore` helper compares each entry by `lines.includes(e)` — a literal string match. `.handover/telemetry.db` does NOT match `.handover/telemetry.db-wal` as a string. Only a directory prefix (`.handover/`) would, but Phase 31 D-10 explicitly avoided blanket `.handover/` because Phase 35 commits `.handover/evals/`.

**How to avoid:** Extend `GITIGNORE_ENTRIES` in `src/cli/init.ts:20` to:
```typescript
const GITIGNORE_ENTRIES = [
  '.handover/cache',
  '.handover/telemetry.db',
  '.handover/telemetry.db-wal',  // SQLite WAL sidecar
  '.handover/telemetry.db-shm',  // SQLite shared-memory sidecar
];
```
Optionally, also add an `ensureGitignored()`-style runtime safety net at the start of `recordRun` (mirrors `src/cache/round-cache.ts:187-214`) so pre-Phase-33 users who upgrade and never re-run `handover init` are still safe.

**Warning signs:** New user reports `git status` showing `.handover/telemetry.db-wal` after `handover generate`.

### Pitfall 3: Telemetry write throws during the user's actual run

**What goes wrong:** A bug in the writer (e.g., schema mismatch, disk full, native binding crash) throws. The user's `handover generate` exits non-zero. The user's 14 generated docs are written but the user sees an error. Trust in `handover` drops.

**Why it happens:** Without the D-19 try/catch boundary, any error in `writer.recordRun()` propagates up `runGenerate`.

**How to avoid:** Wrap the entire telemetry block in a single try/catch. The catch does `logger.warn(...)` and continues. The pre-write in-memory threshold-warning check (the current code at `src/ui/components.ts:299-301`) becomes the fallback path. Mirror Phase 32 D-22's pattern exactly (the dep-graph save uses the same `try { saveDepGraph } catch { logger.warn }` at `src/cli/generate.ts:1136-1143`).

**Warning signs:** Integration test `graceful-degradation.test.ts` (Wave 0) — stub `recordRun` to throw, assert `handover generate` exits 0 and `displayState.totalCost` is still correct.

### Pitfall 4: `crypto.randomUUID()` is unavailable on Node 18

**What goes wrong:** `globalThis.crypto.randomUUID()` is Node 19+. The project declares `engines.node: ">=18.0.0"`. A user on Node 18.x hits "TypeError: Cannot read properties of undefined (reading 'randomUUID')".

**Why it happens:** The Web Crypto API global was added in Node 19. The Node-native `crypto` module's `randomUUID` was added in Node 14.17.

**How to avoid:** ALWAYS use `import { randomUUID } from 'node:crypto'` — never `globalThis.crypto.randomUUID()`. The Node-native import works on every supported version.

**Warning signs:** A test running under Node 18 emulation fails with "randomUUID is not a function." CI Node 18 matrix catches this.

### Pitfall 5: Empty-DB query returns `null` from `prepare().get()`, not `[]`

**What goes wrong:** `getRecentRuns(db)` calls `db.prepare('SELECT ...').all()` against an empty `runs` table. `.all()` returns `[]` — that's fine. But a `db.prepare('SELECT COUNT(*) ...').get()` against an empty table returns `{ count: 0 }` (not `null`). Mixing `.all()` and `.get()` semantics is error-prone.

**Why it happens:** `.get()` returns the first row or `undefined` (NOT `null`), `.all()` returns an array. Confusion when refactoring.

**How to avoid:** Use `.all()` consistently in `reader.ts`. The `handover cost` empty-DB path is detected by `recentRuns.length === 0`, not by null-checking.

**Warning signs:** A test on empty DB throws "Cannot read properties of undefined" — indicates a `.get()` call expecting a row.

### Pitfall 6: User-supplied `--since-date` is not validated

**What goes wrong:** `handover cost --since-date 2026-xx-yy` (invalid ISO) is passed to SQLite as a string and SQLite silently returns no rows. User wonders why their data is missing.

**Why it happens:** SQLite's `datetime()` accepts most strings; an invalid format yields NULL and the WHERE clause `started_at >= datetime(?)` filters everything out.

**How to avoid:** Validate `--since-date` in `cost.ts` at parse time using a Zod `z.string().datetime()` (or `Date.parse() && !isNaN`). On parse failure: print remediation and exit 2 (commander's standard "bad input"). This is read-side input validation, not D-19 graceful-degradation territory.

**Warning signs:** Manual test: `handover cost --since-date garbage` — must NOT print an empty table; must print a clear error.

### Pitfall 7: Concurrent `handover cost` during `handover generate`

**What goes wrong:** Without WAL, the second process blocks on a SQLITE_BUSY lock. The user types `handover cost` mid-generate and the command hangs.

**Why it happens:** Default journal mode is `delete`, which locks the entire DB during writes.

**How to avoid:** D-20a — set WAL on every open. WAL allows the reader to operate against a consistent snapshot while a writer commits. Verify in `db.test.ts` with the "second handle reads during first handle's mid-transaction" assertion.

**Warning signs:** A `vitest run` with `--threads` shows a test timing out — likely a missed WAL setup.

### Pitfall 8: `handover cost` opens the DB but lock is held by a crashed prior process

**What goes wrong:** A previous `handover generate` was SIGKILLed mid-write. The DB file is in a "rolled back" state but the `.handover/telemetry.db-wal` sidecar holds the unwritten transaction. The next `handover cost` open may see "database is locked" errors briefly.

**Why it happens:** WAL recovery on the next open is automatic but adds open latency on the rare crash case.

**How to avoid:** Already handled by SQLite's WAL recovery semantics. No code change needed. Document in `## Code Examples` for the planner's awareness.

**Warning signs:** A user reports "handover cost hangs the first time after a Ctrl-C." The fix is "run it twice" or wait for SQLite's auto-recovery; the codebase does not need to handle this manually.

## Code Examples

### Example 1: Wire-in point in `src/cli/generate.ts`

```typescript
// Insert at src/cli/generate.ts AFTER line 1170 (displayState.totalCost = tracker.getTotalCost();)
// AND BEFORE line 1210 (renderer.onComplete(displayState);)
//
// Source: derived from Phase 32 D-22 graceful-degradation pattern at generate.ts:1136-1143
//         and the assembly of run/roundRuns/rendererRuns from existing displayState data.
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  openTelemetryDb,
  recordRun,
  rotateRetention,
  TELEMETRY_VERSION,
} from '../regen/telemetry/index.js';

// ... existing code through line 1170 ...

// ─── Phase 33: telemetry write + threshold warning (D-17, D-19) ─────────
if (!options.dryRun) {                                  // D-08
  const telemetryStart = Date.now();
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

    // Build round_runs from tracker (one row per round actually executed).
    const roundRuns = Array.from(displayState.rounds.entries()).flatMap(([roundNum, rd]) => {
      if (rd.status === 'pending') return [];           // never ran
      const usage = tracker.getRoundUsage(roundNum);
      if (!usage) return [];
      return [{
        runId,
        roundNum,
        model: config.model ?? 'default',
        provider: config.provider,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens ?? null,
        cacheCreationTokens: usage.cacheCreationTokens ?? null,
        costUsd: round6(tracker.getRoundCost(roundNum)),
        cacheHit: rd.status === 'cached',
        elapsedMs: rd.elapsedMs ?? 0,
        startedAt: new Date(rd.roundStartMs ?? startTime).toISOString(),
      }];
    });

    // Build renderer_runs from the Promise.allSettled result statuses.
    // The 'statuses' array is in scope inside the rendering step closure;
    // expose it via displayState OR (preferred) pass it to a helper that
    // returns rendererRuns. For this snippet we assume `statuses` is reachable.
    const rendererRuns = statuses
      .filter((s) => s.id !== '00-index')               // INDEX is composed, not LLM-driven
      .map((s) => ({
        runId,
        rendererId: s.id,
        model: config.model ?? null,                    // null until Phase 34
        status: s.status,                               // 'complete'|'partial'|'static-only'|'reused'|'not-generated'
        elapsedMs: 0,                                   // TODO planner: thread durationMs from renderResults[i].value.durationMs
        ranAt: new Date().toISOString(),
      }));

    recordRun(
      db,
      {
        runId,
        startedAt,
        endedAt,
        totalCostUsd,
        totalInputTokens: tracker.getTotalUsage().input,
        totalOutputTokens: tracker.getTotalUsage().output,
        topModel: config.model ?? 'default',
        provider: config.provider,
        thresholdUsd,
        thresholdExceeded,
        sinceRef: options.since ?? null,
        dryRun: false,
      },
      roundRuns,
      rendererRuns,
    );

    // D-13: rotation in a SEPARATE try/catch so its failure doesn't lose the write.
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
    // D-19: the in-memory threshold warning will fire from existing
    // src/ui/components.ts:299 path during renderer.onComplete below.
  } finally {
    if (db) db.close();
  }
  // optionally: store telemetry overhead in displayState for diagnostics
  void telemetryStart;
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

// ... continues to renderer.onComplete(displayState); ...
```

### Example 2: `handover cost` Commander subcommand wiring

```typescript
// Add to src/cli/index.ts following the existing reindex/search subcommand pattern
// at src/cli/index.ts:67-78.
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

### Example 3: Zod schema for write-boundary validation

```typescript
// src/regen/telemetry/schema.ts
import { z } from 'zod';

// Source: pattern lifted from src/regen/dep-graph.ts:56-62 DepGraphSchema.
// Strict — extra keys are stripped (default Zod object behavior).

export const RunRecordSchema = z.object({
  runId: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  totalCostUsd: z.number().nonnegative(),
  totalInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  topModel: z.string().min(1),
  provider: z.string().min(1),
  thresholdUsd: z.number().nonnegative().nullable(),
  thresholdExceeded: z.boolean(),
  sinceRef: z.string().nullable(),
  dryRun: z.boolean(),
});

export const RoundRunRecordSchema = z.object({
  runId: z.string().uuid(),
  roundNum: z.number().int().positive(),
  model: z.string().min(1),
  provider: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().nullable(),
  cacheCreationTokens: z.number().int().nonnegative().nullable(),
  costUsd: z.number().nonnegative(),
  cacheHit: z.boolean(),
  elapsedMs: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
});

// Mirror src/renderers/types.ts:63 — the literal union is the source of truth.
const DocumentStatusEnum = z.enum([
  'complete', 'partial', 'static-only', 'not-generated', 'reused',
]);

export const RendererRunRecordSchema = z.object({
  runId: z.string().uuid(),
  rendererId: z.string().min(1),
  model: z.string().nullable(),
  status: DocumentStatusEnum,
  elapsedMs: z.number().int().nonnegative(),
  ranAt: z.string().datetime(),
});
```

### Example 4: In-memory DB test pattern

```typescript
// src/regen/telemetry/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { openTelemetryDb, TELEMETRY_VERSION } from './db.js';

describe('openTelemetryDb (in-memory)', () => {
  it('creates the schema on first open (storedVersion === 0)', () => {
    const db = openTelemetryDb(':memory:');
    try {
      const v = db.pragma('user_version', { simple: true });
      expect(v).toBe(TELEMETRY_VERSION);
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      ).all() as Array<{ name: string }>;
      expect(tables.map((t) => t.name)).toEqual(['renderer_runs', 'round_runs', 'runs']);
    } finally {
      db.close();
    }
  });

  it('sets PRAGMA journal_mode = wal after open (D-20a)', () => {
    const db = openTelemetryDb(':memory:');
    try {
      // NOTE: ':memory:' databases report 'memory' as journal mode (WAL not
      // applicable to RAM-backed). Use a tmpdir+UUID DB for this specific
      // assertion — see Example 5 below.
      const mode = db.pragma('journal_mode', { simple: true });
      expect(['memory', 'wal']).toContain(mode);
    } finally {
      db.close();
    }
  });

  it('creates the idx_renderer_runs_renderer index (TELEM-01 SC-5)', () => {
    const db = openTelemetryDb(':memory:');
    try {
      const indexes = db.pragma('index_list(renderer_runs)') as Array<{ name: string }>;
      expect(indexes.map((i) => i.name)).toContain('idx_renderer_runs_renderer');
    } finally {
      db.close();
    }
  });
});
```

### Example 5: Tmpdir + UUID test for WAL + persistence

```typescript
// For tests that need a real on-disk DB:
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('openTelemetryDb (on-disk)', () => {
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), `handover-telemetry-${randomUUID()}-`));
    dbPath = join(dbDir, 'telemetry.db');
  });

  afterEach(() => {
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('sets PRAGMA journal_mode = wal on a real file (D-20a)', () => {
    const db = openTelemetryDb(dbPath);
    try {
      const mode = db.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
    } finally {
      db.close();
    }
  });

  it('survives close+reopen with the same TELEMETRY_VERSION (D-05 round-trip)', () => {
    const db1 = openTelemetryDb(dbPath);
    db1.close();
    const db2 = openTelemetryDb(dbPath);
    try {
      const v = db2.pragma('user_version', { simple: true });
      expect(v).toBe(TELEMETRY_VERSION);
    } finally {
      db2.close();
    }
  });

  it('drops and recreates tables on version mismatch', async () => {
    // Step 1: open at v1 and write a row.
    const db1 = openTelemetryDb(dbPath);
    db1.prepare(`INSERT INTO runs (run_id, started_at, ended_at, total_cost_usd,
                  total_input_tokens, total_output_tokens, top_model, provider,
                  threshold_exceeded, dry_run)
                  VALUES ('x', '2026-05-14T00:00:00.000Z', '2026-05-14T00:01:00.000Z',
                  0.1, 0, 0, 'm', 'p', 0, 0)`).run();
    db1.close();

    // Step 2: simulate a version mismatch by manually setting user_version to 999.
    const dbTamper = new Database(dbPath);
    dbTamper.pragma('user_version = 999');
    dbTamper.close();

    // Step 3: reopen — initSchema should drop+recreate.
    const db3 = openTelemetryDb(dbPath);
    try {
      const count = db3.prepare('SELECT COUNT(*) as n FROM runs').get() as { n: number };
      expect(count.n).toBe(0);
      const v = db3.pragma('user_version', { simple: true });
      expect(v).toBe(TELEMETRY_VERSION);
    } finally {
      db3.close();
    }
  });

  it('allows a second handle to read while the first is mid-transaction (WAL)', () => {
    const writer = openTelemetryDb(dbPath);
    const reader = openTelemetryDb(dbPath);
    try {
      const tx = writer.transaction(() => {
        writer.prepare(`INSERT INTO runs (run_id, started_at, ended_at, total_cost_usd,
                    total_input_tokens, total_output_tokens, top_model, provider,
                    threshold_exceeded, dry_run)
                    VALUES ('w1', '2026-05-14T00:00:00.000Z', '2026-05-14T00:01:00.000Z',
                    0.5, 0, 0, 'm', 'p', 0, 0)`).run();
        // mid-transaction: reader should see PRIOR snapshot (zero rows).
        const seen = reader.prepare('SELECT COUNT(*) as n FROM runs').get() as { n: number };
        expect(seen.n).toBe(0);
      });
      tx();
      // post-transaction: reader sees the new row.
      const after = reader.prepare('SELECT COUNT(*) as n FROM runs').get() as { n: number };
      expect(after.n).toBe(1);
    } finally {
      writer.close();
      reader.close();
    }
  });
});
```

### Example 6: Stubbing telemetry with `vi.mock` for graceful-degradation test

```typescript
// Pattern lifted from src/auth/pkce-login.test.ts vi.hoisted + vi.mock usage.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRecordRun = vi.hoisted(() => vi.fn());
vi.mock('../regen/telemetry/index.js', () => ({
  openTelemetryDb: vi.fn(() => ({ close: vi.fn(), pragma: vi.fn(), prepare: vi.fn() })),
  recordRun: mockRecordRun,
  rotateRetention: vi.fn(),
  TELEMETRY_VERSION: 1,
}));

beforeEach(() => {
  mockRecordRun.mockReset();
});

it('handover generate exits 0 when recordRun throws (D-19)', async () => {
  mockRecordRun.mockImplementation(() => {
    throw new Error('Disk full');
  });
  // ... invoke runGenerate with the standard test fixture and provider stub ...
  // assert: exit code 0, the existing in-memory threshold warning still fires.
});
```

### Example 7: Schema-mismatch test with `vi.doMock`

```typescript
// To test that drop-and-recreate behavior fires when TELEMETRY_VERSION bumps,
// dynamic-import the module after redefining the export.
//
// Source: vitest docs https://vitest.dev/api/vi.html#vi-domock — vi.doMock
// is NOT hoisted, so the module is mocked at call time. Use it to swap in a
// different TELEMETRY_VERSION for a single test.
it('drops and recreates tables when TELEMETRY_VERSION bumps', async () => {
  vi.doMock('./db.js', async () => {
    const actual = await vi.importActual<typeof import('./db.js')>('./db.js');
    return { ...actual, TELEMETRY_VERSION: 999 as const };
  });
  const { openTelemetryDb } = await import('./db.js');
  // ... open at v999 against a DB that has v1 user_version ...
  // ... assert tables were dropped and recreated ...
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `db.exec('PRAGMA journal_mode = WAL')` for pragma | `db.pragma('journal_mode = WAL')` | better-sqlite3 7.x+ | The `.pragma()` method returns parsed results and is the idiomatic API. `exec()` works but is less ergonomic and doesn't return the mode that was set (which is useful for verification). [CITED: better-sqlite3 docs] |
| `PRAGMA foreign_keys = ON` for relational integrity | Atomic transactions + child-first DELETE | This codebase D-15 | FKs need per-connection pragma; easy to forget. Transactions cover us. |
| Hand-rolled ULID for sortable IDs | `crypto.randomUUID()` + `ORDER BY started_at DESC` | This codebase D-07 | Eliminates a dep; achieves the same sort effect via SQL. |
| Single-table cost telemetry | Three-table normalized + JOIN-derived attribution | This codebase D-01 | The only way per-renderer cost reconciles with run total without lying. |

**Deprecated/outdated:**
- The `globalThis.crypto.randomUUID()` form: works on Node 19+, but `engines.node` ≥ 18 means we must use `node:crypto` import instead.
- `sqlite3` (callback-based async): the codebase standardized on `better-sqlite3` (synchronous). Don't mix.

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist in this repo. Project conventions live in `.planning/codebase/*.md` (already loaded). The applicable enforcement points from those documents:

- **Coverage gate 90/90/90/85** (from `.planning/codebase/TESTING.md` line — actually defined at `vitest.config.ts:170-175`). Phase 33 modules must clear this threshold or be added to the FROZEN exclusion list with a written justification. The CLI entry `src/cli/cost.ts` is acceptable to add to the exclusion list (CLI entries are excluded per `vitest.config.ts:42-58`), but the underlying `src/regen/telemetry/**` modules must clear coverage in unit tests.
- **No bare `console.log`** — use the `logger` from `src/utils/logger.ts` for diagnostics. `process.stdout.write` is acceptable for the `handover cost` command's primary output (CLI tools own stdout for their data).
- **Zod at the boundary** — every write into the DB goes through a Zod parse. Every parse from disk too (though Phase 33 reads its own writes; this matters for reader.ts only if we ever roundtrip-parse).
- **Co-located tests** — `*.test.ts` next to `*.ts` in `src/regen/telemetry/`. Integration test for the wire-in into `tests/integration/` (if practical) or as a unit test against the helper functions.
- **Conventional commits** — already enforced by `commitlint` + husky.
- **TypeScript strict** — no `any`. Use `unknown` when shape isn't known; narrow with Zod.
- **Imports use `.js` extension** — ESM convention per `tsconfig.json` NodeNext.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `db.exec()` of multiple `CREATE TABLE` statements is naturally atomic on success (or atomically rolls back on syntax error inside one statement) | Pattern 1 | If a CREATE fails partway, leftover tables could leak. Mitigation: wrap initSchema body in an explicit `db.transaction()`. Verified for one-shot DDL but planner should add the wrapper as belt-and-suspenders. [ASSUMED] |
| A2 | `PRAGMA user_version = N` outside any explicit transaction is durable as soon as it returns | Pattern 1 | If the process crashes between DDL and the pragma write, the next open sees v=0 → drops and recreates. That's the correct fallback behavior; net effect is zero. [ASSUMED — but the fallback is safe.] |
| A3 | Vitest's default pool (`forks`) handles better-sqlite3 native bindings without issue (each worker creates its own DB connection, no cross-worker handle sharing) | Standard Stack, Pattern 4 | If `forks` has a binding-load issue we don't see locally, CI on Linux/Windows might surface a regression. Mitigation: smoke test on the actual CI matrix early. [ASSUMED: vitest+better-sqlite3 widely used — no known incompatibility in the search results.] |
| A4 | The `statuses` array assembled at `src/cli/generate.ts:1042-1091` is reachable from the wire-in point at line ~1170 | Example 1, Architecture | The current code structure has `statuses` inside the rendering step closure (around line 985+). The wire-in point is outside that closure. **Mitigation: the planner must thread `statuses` (or the renderer durations array) out of the closure via `displayState` or a captured-let — non-trivial structural detail.** [ASSUMED — needs planner verification.] |
| A5 | `displayState.rounds.entries()` includes ALL rounds that were created via `displayState.rounds.set(roundNum, ...)` at line 392, including ones that ended with `status: 'failed'` or `'cached'` | Example 1 | If a round was never recorded (e.g., orchestrator short-circuited), the writer would underreport. Manual verification by the planner is recommended; the codebase appears to always `set` the round before any round-work runs. [ASSUMED — verified pattern at generate.ts:386-410.] |
| A6 | `config.provider` and `config.model` are both stable, non-null at the wire-in point | Example 1 | They are set in `displayState` at line 219-220, which is after config load — by line 1170 they're always populated. [ASSUMED — high confidence; verified by line 219-220 read.] |
| A7 | The threshold-warning emission path in `src/ui/components.ts:299-301` reads from `displayState.totalCost` and `displayState.costWarningThreshold` (NOT from a separate state) | Pitfall #3 fallback path | If the warning reads from a different source, the D-19 fallback claim doesn't hold. [ASSUMED — verified at components.ts:299, renderer.ts:164.] |
| A8 | Phase 35's eval will NOT need to write into `runs` (it'll add its own table or extend) | Standard Stack alternatives | If Phase 35 wants to share `runs`, the `dry_run` column placeholder might become a `kind` enum. Schema isn't locked-out; Phase 35 can extend with a default-null column without bumping `TELEMETRY_VERSION`. [ASSUMED — Phase 35 not yet planned.] |

**Risk profile:** Eight assumptions. **A4 is the highest-risk** — the planner must explicitly verify how to thread `statuses` (or per-renderer `durationMs`) out of the rendering-step closure. The other assumptions are low-risk.

## Open Questions

1. **How does the writer thread `statuses` and per-renderer `durationMs` out of the rendering-step closure at `generate.ts:985-1146`?**
   - What we know: `statuses[]` is built inside the closure at lines 1042-1091; `renderResults[i].value.durationMs` carries per-renderer wall time.
   - What's unclear: whether to (a) thread these out via a new `displayState.rendererDurations` Map, (b) refactor the closure to return them, or (c) capture them in a closure-level `let` declared outside.
   - Recommendation: **Option (a) — extend `displayState`** with a `renderResults: Array<{ rendererId, status, durationMs }>` Map populated inside the closure. This is the smallest delta and keeps the closure pure. The planner finalizes.

2. **Should `_unconsumed` orphan rows be emitted in `--json` output, or filtered out?**
   - What we know: D-01 says show `_unconsumed` "only when non-zero" in TEXT output.
   - What's unclear: JSON consumers (Phase 36) might want consistent shape — always include it (with `totalAttributedCostUsd: 0` when zero) vs. omit when zero.
   - Recommendation: **Always include in JSON** (consumer can ignore zeros; consistency beats omission). Planner finalizes.

3. **Should the temp `renderer_round_map` table in `reader.ts` be created once per process or once per query?**
   - What we know: Each `handover cost` invocation is a fresh process. The DB connection is opened per-invocation.
   - What's unclear: whether to materialize the map at db-open time or at query-execution time.
   - Recommendation: **Create at db-open time in reader.ts** (right after `openTelemetryDb()` returns, before any query). One-shot, microseconds, simpler call sites. The map is built from the in-memory `DOCUMENT_REGISTRY` import.

4. **Does `handover cost --since-date <ISO>` constrain by `runs.started_at` or `runs.ended_at`?**
   - What we know: D-10 says `--since-date` is a window filter on runs.
   - What's unclear: which timestamp column.
   - Recommendation: **`runs.started_at`** — matches user mental model ("show runs that started on or after this date"). Document in `handover cost --help`.

5. **Does the rotation behavior need a fixture to test the "OR" semantics correctly?**
   - What we know: D-13 keeps the UNION of (last 100 per renderer) AND (last 90 days).
   - What's unclear: a robust test asserts BOTH branches contribute. The simple "write 101 runs, assert oldest gone" test only exercises the per-renderer branch.
   - Recommendation: **Add a second test** — write a row dated 91 days ago that ALSO falls in the top-100-per-renderer keep-set; assert it survives (because the per-renderer keep wins). And a row dated 89 days ago outside the top-100 (because there are 200 newer ones for one renderer); assert it survives (because the 90-day keep wins). Both tests in `rotation.test.ts`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 `[VERIFIED: package.json:101]` |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/regen/telemetry/` |
| Full suite command | `npm run test` (uses `vitest run`) |
| Estimated runtime | ~5–10 s for telemetry quick run; ~60–90 s for full suite |
| Build before integration tests | `npm run build` required for tests against `dist/index.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TELEM-01 | `renderer_runs` table + `idx_renderer_runs_renderer` index exist after first open | unit | `npx vitest run src/regen/telemetry/db.test.ts -t "creates the idx_renderer_runs_renderer index"` | ❌ Wave 0 |
| TELEM-02 | `handover cost` text output shows last-N per-renderer summary | unit + integration | unit: `npx vitest run src/cli/cost.test.ts -t "renders per-renderer table"`; integration: `npx vitest run tests/integration/cost-cli.test.ts` | ❌ Wave 0 |
| TELEM-03 | Only metadata in DB — Zod schema strips unknown keys (e.g., `prompt`, `apiKey`, `credentials`, `content`) | unit | `npx vitest run src/regen/telemetry/schema.test.ts -t "strips unexpected keys"` | ❌ Wave 0 |
| TELEM-04 | Rotation: 90-day window OR 100-per-renderer window survives; older rows deleted | unit | `npx vitest run src/regen/telemetry/rotation.test.ts` | ❌ Wave 0 |
| TELEM-05 | Threshold warning fires from in-memory totals after the persisted write; fallback fires when write fails | unit | `npx vitest run src/cli/generate.test.ts -t "threshold warning"` | ⚠️ extend existing |

### Sampling Rate

- **Per task commit:** `npx vitest run src/regen/telemetry/ src/cli/cost.test.ts` (covers TELEM-01..04 unit-level + cost CLI text formatting)
- **Per wave merge:** `npm run test` (full suite — catches regressions in registry tests, generate.test.ts, config tests)
- **Phase gate:** Full suite green + `npm run typecheck` clean + `npm run lint` clean before `/gsd-verify-work`
- **Max feedback latency:** ~15 s for quick run; ~90 s for full suite

### Wave 0 Gaps

- [ ] `src/regen/telemetry/db.test.ts` — covers DB lifecycle, WAL pragma, schema DDL, `idx_renderer_runs_renderer`, version-mismatch drop-and-recreate. Maps SC-3, SC-5.
- [ ] `src/regen/telemetry/schema.test.ts` — Zod parse strips disallowed keys (`prompt`, `apiKey`, `credentials`, `content`); valid records round-trip. Maps SC-2 (TELEM-03).
- [ ] `src/regen/telemetry/writer.test.ts` — transaction atomicity (all-or-nothing), `crypto.randomUUID` uniqueness across consecutive calls. Maps SC-1.
- [ ] `src/regen/telemetry/reader.test.ts` — attribution reconciliation invariant (`Σ attributed_cost == Σ round_runs.cost_usd`), `_unconsumed` bucket, `--view standalone` switches math, time-series for `--renderer X`. Maps SC-1 plus the attribution-reconciliation invariant.
- [ ] `src/regen/telemetry/rotation.test.ts` — 90d-OR-100-per-renderer keep semantics; rotation runs as a SEPARATE transaction (assert `runs.length` drops only after the second tx, not the first); rotation failure does NOT roll back the write. Maps SC-3.
- [ ] `src/cli/cost.test.ts` — flag parsing, text-mode rendering, `--json formatVersion: 1` snapshot, empty-DB → `No telemetry yet.` exit 0, corrupt-DB → exit 1 + remediation string. Maps SC-1, contract stability.
- [ ] `src/cli/generate.test.ts` (extend) — D-17 ordering: write fires before threshold warning; D-19 graceful degradation: `vi.mock` recordRun to throw, assert exit 0 and warning still fires from in-memory fallback; D-08 dry-run skips write. Maps SC-4.
- [ ] `tests/integration/cost-cli.test.ts` (or extend `tests/integration/edge-cases.test.ts`) — end-to-end: `handover generate --static-only` then `handover cost` — assert non-zero exit, well-formed output. Cannot easily test cost paths in integration without real LLM calls; rely on unit tests for cost math.
- [ ] No framework install needed (vitest + memfs + better-sqlite3 already present).

### Validation Dimensions Mapped to Success Criteria

| Dimension | Coverage | Maps to SC |
|-----------|----------|------------|
| **Functional correctness** | Each pure function in `db.ts`/`writer.ts`/`reader.ts`/`rotation.ts` has direct unit tests | SC-1, SC-3, SC-5 |
| **Behavioral / integration** | `handover cost` end-to-end against a seeded in-memory DB; `handover generate` integration test still passes after wire-in | SC-1, SC-2 |
| **Regression** | Existing `src/context/tracker.test.ts` (MODEL_COSTS), `src/config/schema.test.ts` (costWarningThreshold), `src/renderers/registry.test.ts` (requiredRounds) all still pass | All |
| **Edge case** | All 8 pitfalls above get at least one test | SC-2, SC-3, SC-4 |
| **Performance** | Smoke assertion that `rotateRetention` over 10k synthetic runs completes in < 50 ms; `getRecentRuns(10)` returns in < 5 ms with a populated index | SC-5 |
| **Contract stability** | `handover cost --json` output snapshot pins the Phase 36 contract; any breaking change requires `formatVersion` bump | SC-1 (Phase 36 downstream) |
| **Attribution reconciliation invariant** | `reader.test.ts` asserts `Σ attributed_cost ≡ Σ round_runs.cost_usd` per run across {0 consumers, 1 consumer, N consumers} fixtures | beyond SC — design invariant |
| **WAL behavior** | `db.test.ts` second-handle-reads-during-mid-write test (tmpdir DB, not :memory:) | SC-5 prerequisite |
| **Graceful degradation** | `generate.test.ts` vi.mock-throws test asserts exit 0 + fallback warning | SC-4 |
| **Cost precision** | `writer.test.ts` writes `0.123456789` USD, reads back `0.123457` | beyond SC — D-20b invariant |
| **Schema-mismatch handling** | `db.test.ts` vi.doMock-bumped TELEMETRY_VERSION test | SC-3 |
| **Dry-run write skip** | `generate.test.ts` runs `--dry-run`, asserts zero rows added | D-08 invariant |

### Specific Test Assertions (load-bearing)

| Assertion | File | Test fixture |
|-----------|------|--------------|
| `db.pragma('user_version', { simple: true }) === 1` after first open | `db.test.ts` | `:memory:` DB |
| `db.pragma('journal_mode', { simple: true }) === 'wal'` on real file | `db.test.ts` | tmpdir + UUID DB |
| `db.pragma('index_list(renderer_runs)')` includes `'idx_renderer_runs_renderer'` | `db.test.ts` | `:memory:` DB |
| After `recordRun()`, opening a new connection sees the row (durability) | `writer.test.ts` | tmpdir + UUID DB |
| Two consecutive `recordRun` calls produce distinct `run_id` (no collision) | `writer.test.ts` | `:memory:` DB |
| `RunRecordSchema.parse({...validRow, prompt: 'leaked'}).prompt === undefined` (Zod strip) | `schema.test.ts` | inline fixtures |
| 4 renderers consuming round 1 → each gets `cost / 4` attributed | `reader.test.ts` | synthetic dataset: 1 run, 1 round at $0.40, 4 consuming renderers; expected each attributed=$0.10 |
| Round with `cost > 0` and 0 consumers → `_unconsumed` row receives full cost | `reader.test.ts` | synthetic: 1 run, 1 round at $0.30, 0 consumers (status='not-generated' for every dependent); expected `_unconsumed.totalAttributedCostUsd === 0.30` |
| Sum of attributed_cost across renderers (incl. `_unconsumed`) == `Σ round_runs.cost_usd` | `reader.test.ts` | parameterized: 3 fixture scenarios |
| After 101 runs (single renderer), oldest is gone post-rotation | `rotation.test.ts` | tmpdir DB |
| Row 91 days old that ALSO falls in last-100-per-renderer survives | `rotation.test.ts` | tmpdir DB |
| Row 89 days old outside last-100 (200 newer) survives | `rotation.test.ts` | tmpdir DB |
| Rotation failure does NOT delete the just-written run row | `rotation.test.ts` | mock `db.prepare(DELETE).run()` to throw |
| `Math.round(0.123456789 * 1e6) / 1e6 === 0.123457` written and read back | `writer.test.ts` | inline |
| Bumping TELEMETRY_VERSION via `vi.doMock` triggers drop+recreate; pre-existing rows gone | `db.test.ts` | tmpdir DB |
| `handover generate --dry-run` adds zero rows to DB | `generate.test.ts` (extend) | mock provider, real telemetry DB at tmpdir |
| Stubbed `recordRun` throwing → `handover generate` exits 0 AND `renderCostWarning` is still emitted via in-memory totals | `generate.test.ts` (extend) | `vi.hoisted` mock + spy |
| `handover cost` against empty DB prints `No telemetry yet.` and exits 0 | `cost.test.ts` | `:memory:` (override DB path via env or constructor injection) |
| `handover cost --json` payload contains `"formatVersion": 1` and `"telemetryVersion": 1` | `cost.test.ts` | seeded `:memory:` DB |
| `handover cost --renderer 03-architecture` switches to time-series; one row per run for that renderer | `cost.test.ts` | seeded `:memory:` DB |

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Telemetry has no auth surface — local file, local process only |
| V3 Session Management | no | Read-only CLI, no sessions |
| V4 Access Control | no | Local-file mode; OS filesystem permissions are the boundary |
| V5 Input Validation | yes | **Zod schemas at every write boundary** (D-06 `schema.ts`); `--since-date <ISO>` validated at CLI parse time (Pitfall #6) |
| V6 Cryptography | partial | `crypto.randomUUID()` for `run_id` — uses Node's built-in CSPRNG. No keys, no encryption (cost data is not sensitive). |
| V7 Error Handling | yes | D-19 graceful degradation; corrupt-DB → remediation message, never silent. `handover cost` errors include filesystem-path information (NOT a credential leak — telemetry.db path is not sensitive). |
| V8 Data Protection | yes | **TELEM-03: no prompt content, no credentials in DB.** Enforced by Zod parse that strips unknown keys. Negative-existence assertion in `schema.test.ts`. |
| V9 Communications | no | All operations local; no network. |
| V12 Files and Resources | yes | DB path is always `.handover/telemetry.db` (constant, not user-supplied). No path-traversal surface. WAL/SHM sidecars are SQLite-managed. |
| V13 API & Web Service | no | No remote API; no web service. |

### Known Threat Patterns for `better-sqlite3 + Zod + CLI`

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via dynamic-string SQL | Tampering | **Use `db.prepare()` + bound params** for every query. The temp-table approach in Pattern 4 binds `[(rendererId, roundNum), ...]` via `insert.run()` — no string concatenation of user data. |
| Prompt content leak via Zod-typed boundary bypass | Information Disclosure | **`RunRecordSchema.parse(input)`** strips unknown keys (Zod default). Test in `schema.test.ts` asserts a `prompt: 'leaked'` field is stripped before INSERT. |
| Credential leak via row | Information Disclosure | Zod schemas explicitly enumerate ONLY metadata fields. `apiKey`, `credentials`, `content`, `prompt` cannot be persisted because the schema does not declare them. |
| Path traversal via DB path | Tampering | DB path is a constant from `join(rootDir, '.handover', 'telemetry.db')` — user input never reaches the path. |
| TOCTOU on DB open/close | Race | `better-sqlite3` is synchronous; no async race window. WAL semantics handle concurrent reader/writer. |
| Disk-fill / quota exhaustion | DoS | D-13 rotation bounds DB size to ~100 runs/renderer × ~14 renderers × ~50 rows × ~200 bytes ≈ 14 MB ceiling. Realistic ceiling under 1 MB for typical use. |
| `--since-date` injection (SQL or string) | Tampering | Validate via `z.string().datetime()` at parse time; pass as bound param. |
| WAL sidecar accidental commit to git | Information Disclosure (potentially of run history) | Pitfall #2 + Wave 0 task: extend `GITIGNORE_ENTRIES`. |

## Sources

### Primary (HIGH confidence)

- `package.json` — declared deps: `better-sqlite3@^12.6.2`, `zod@^4.3.6`, `commander@^14.0.3`, `@types/better-sqlite3@^7.6.13`, `vitest@^4.0.18`. `engines.node: ">=18.0.0"`. [VERIFIED 2026-05-14]
- `node_modules/better-sqlite3/package.json` — installed version `12.9.0`. [VERIFIED 2026-05-14]
- `src/cache/round-cache.ts` — `CACHE_VERSION = 2` pattern, `ensureGitignored()` pattern. [VERIFIED]
- `src/regen/dep-graph.ts` — `GRAPH_VERSION = 1` pattern, `formatVersion: 1` JSON contract pattern, `safeParse → null` graceful boundary pattern. [VERIFIED]
- `src/vector/vector-store.ts` — `new Database(path)`, `db.prepare(...).run()`, `db.transaction(() => { ... })()` pattern. [VERIFIED]
- `src/context/tracker.ts` — `TokenUsageTracker.getTotalCost()`, `getRoundCost(n)`, `getRoundUsage(n)`, `getTotalUsage()`, `MODEL_COSTS` table. [VERIFIED]
- `src/cli/generate.ts` — wire-in line numbers verified (215-237 displayState init, 386-499 round events, 985-1146 render loop, 1163-1210 completion). [VERIFIED]
- `src/cli/index.ts` — Commander subcommand registration pattern. [VERIFIED]
- `src/cli/init.ts:20` — `GITIGNORE_ENTRIES = ['.handover/cache', '.handover/telemetry.db']`. [VERIFIED]
- `src/cli/init-detectors.ts:144-189` — `patchGitignore()` uses literal-line match. [VERIFIED]
- `src/renderers/types.ts:63` — `DocumentStatus.status` enum: `'complete' | 'partial' | 'static-only' | 'not-generated' | 'reused'`. **Note CONTEXT.md says `'full'`; the code says `'complete'`.** [VERIFIED]
- `src/renderers/utils.ts:141` — `determineDocStatus()` returns the 4-value subset (no `'reused'` — that's added at the renderer assembly site). [VERIFIED]
- `src/renderers/registry.ts` — `DOCUMENT_REGISTRY` with `requiredRounds` per entry. [VERIFIED]
- `src/ui/components.ts:415` — `renderCostWarning(currentCost, threshold)` returns `pc.yellow(...)`. [VERIFIED]
- `src/ui/components.ts:299-301` — current threshold check fires when `totalCost > costWarningThreshold && costWarningThreshold > 0`. [VERIFIED]
- `src/ui/renderer.ts:164` — `state.costWarningThreshold` is passed to `renderRoundBlock`. [VERIFIED]
- `vitest.config.ts:170-175` — Coverage thresholds 90/90/85/90. [VERIFIED]
- `vitest.config.ts:13-167` — Frozen coverage exclusion list, includes existing `src/cli/*` entries (new CLI files like `cost.ts` may be added with justification). [VERIFIED]
- `tsup.config.ts` — externals list does NOT include `better-sqlite3`, BUT runtime imports of `better-sqlite3` survive in built output (`dist/chunk-QAWE62NC.js:1` confirms `import Database from "better-sqlite3"` is preserved). [VERIFIED — no change needed]
- `.planning/phases/32-source-doc-dependency-graph/32-CONTEXT.md` — Phase 32 D-22 graceful degradation precedent. [VERIFIED]
- `.planning/phases/32-source-doc-dependency-graph/32-RESEARCH.md` — Validation Architecture section format. [VERIFIED — mirrored]
- `.planning/phases/32-source-doc-dependency-graph/32-02-SUMMARY.md` — Phase 32 dep-graph delivery metrics (96.7% lines, 100% functions, 40 tests in 642 LoC). Sets the bar. [VERIFIED]

### Secondary (MEDIUM confidence — official docs)

- [better-sqlite3 API docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) — `prepare()`, `exec()`, `pragma()`, `close()`, `transaction()`, `:memory:` semantics. Fetched 2026-05-14.
- [SQLite PRAGMA user_version](https://www.sqlite.org/pragma.html#pragma_user_version) — INTEGER, default 0, settable inline.
- [SQLite WAL mode](https://sqlite.org/wal.html) — `journal_mode = WAL` persists in the database file; `synchronous = NORMAL` is the recommended pairing.
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) — `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1` compile-time flag (so `NORMAL` is the default once WAL is set).
- [better-sqlite3 WAL deepwiki](https://deepwiki.com/WiseLibs/better-sqlite3/3.4-wal-mode-and-performance-tuning) — verified WAL + synchronous=NORMAL pairing.
- [Node.js crypto.randomUUID()](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions) — stable since Node 14.17 via `node:crypto`; Web Crypto `globalThis.crypto.randomUUID()` added in Node 19.
- [Vitest in-process mocking (`vi.mock`, `vi.hoisted`, `vi.doMock`)](https://vitest.dev/api/vi.html) — patterns confirmed.

### Tertiary (LOW confidence — web search only, flagged for verification)

- "vitest + better-sqlite3 worker compatibility" — no known incompatibility surfaced in 2026-era discussions. Vitest's default `forks` pool isolates better-sqlite3 native bindings per-worker. **Recommendation:** smoke-test on the CI matrix early if any test flakes.
- "SQLite WAL mode on Windows NTFS" — equivalent to ext4/APFS per docs; no platform-specific gotchas surfaced.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already declared, versions verified against installed `node_modules`.
- Architecture: HIGH — pattern lifted verbatim from Phase 32 dep-graph + vector-store; both in production.
- Pitfalls: HIGH on 1-5 (verified against source); MEDIUM on 6-8 (defensive guidance, low-frequency scenarios).
- Validation matrix: HIGH — every assertion is grep-able against the recommended code paths.
- Wire-in line numbers: HIGH — verified by Read on generate.ts at exactly the stated line ranges.

**Research date:** 2026-05-14
**Valid until:** 2026-06-14 (30 days — stable toolchain, no upstream breaking changes anticipated)

---

## RESEARCH COMPLETE

**Phase:** 33 - Cost Telemetry
**Confidence:** HIGH

### Key Findings

- **Status enum mismatch:** CONTEXT.md D-01 uses `'full'`, code at `src/renderers/types.ts:63` uses `'complete'`. The planner MUST use `'complete' | 'partial' | 'static-only' | 'not-generated' | 'reused'`. This affects the "consuming renderer" predicate in `reader.ts`.
- **WAL sidecar gitignore is broken** for `.handover/telemetry.db-wal` and `.handover/telemetry.db-shm`. Existing `patchGitignore` uses literal-line match. Extend `GITIGNORE_ENTRIES` in `src/cli/init.ts:20` by two strings.
- **Use `import { randomUUID } from 'node:crypto'`** — NOT `globalThis.crypto.randomUUID()`. The latter needs Node 19+; engines field declares Node 18+.
- **Wire-in surface in `generate.ts`** is between lines 1170 and 1210, after `displayState.totalCost = tracker.getTotalCost()` and before `renderer.onComplete()`. The `statuses` array (lines 1042-1091) needs to be threaded out of the rendering-step closure — A4 in the assumptions log is the highest-risk planner item.
- **D-13 rotation SQL** is best expressed as a CTE with `ROW_NUMBER() OVER (PARTITION BY renderer_id)` plus a `started_at >= datetime('now', '-90 days')` filter — three child-first DELETE statements in a separate transaction from the write.

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | All deps verified against `node_modules` + `package.json`; versions pinned. |
| Architecture | HIGH | Pattern is Phase 32 + vector-store hybrid; both are in production. |
| Pitfalls | HIGH | 1-5 verified by source-code Read; 6-8 are defensive guidance. |
| Code examples | HIGH | All compiled against the actual `src/` types and API shapes. |
| Validation matrix | HIGH | Assertions are concrete enough to write directly. |
| Phase 36 contract | HIGH | Mirrors Phase 32 `formatVersion: 1` precedent verbatim. |

### Open Questions

5 open questions enumerated above. Highest-priority for the planner: **A4** (how to thread `statuses` out of the render closure) and **Q1** (the same question, restated as a design decision). Recommend Option (a) — extend `displayState` with a `renderResults` Map.

### Ready for Planning

Research complete. Planner can derive `33-VALIDATION.md` from the `## Validation Architecture` H2 section verbatim, then proceed to plan-decomposition. Recommended plan shape (planner's call): Wave 0 test scaffolds → Wave 1 (db.ts + schema.ts + writer.ts + reader.ts + rotation.ts in parallel) → Wave 2 (cost.ts CLI + generate.ts wire-in) → Wave 3 (gitignore patch + final integration test). Approximately 3-5 plans, mirroring Phase 32's 4-plan shape.
