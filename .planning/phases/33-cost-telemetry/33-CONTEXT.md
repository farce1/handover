# Phase 33: Cost Telemetry - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a SQLite-backed cost-telemetry pipeline so users can answer "what did this run cost, per renderer, and is it trending in the wrong direction?". Five deliverables (REQUIREMENTS.md §TELEM):

1. **Persisted telemetry** (TELEM-01) — `.handover/telemetry.db` (already gitignored via Phase 31 D-10 → `src/cli/init.ts:131`) holds a `renderer_runs` table with an `idx_renderer_runs_renderer` index, written via existing `better-sqlite3@12.6.2` dependency.
2. **`handover cost` subcommand** (TELEM-02) — last-N per-renderer summary table (cost USD, input/output tokens, wall time, run timestamp).
3. **Metadata-only writes** (TELEM-03) — model id, renderer id, tokens, cost, timestamp, cache-hit flag — never prompt content, never credentials. Zod-validated on write.
4. **Automatic rotation** (TELEM-04) — last 90 days OR last 100 runs per renderer, whichever yields more.
5. **`costWarningThreshold` wired to persisted data** (TELEM-05) — the existing config key (already declared in `src/config/schema.ts` and consumed in `src/ui/components.ts`) starts sourcing its check from the row that was just written, not from in-memory totals.

**In scope:**
- New `src/regen/telemetry/` module — db wrapper, Zod schema, writer, reader, rotation, `handover cost` subcommand wiring.
- Two-table schema (`runs`, `round_runs`, `renderer_runs`) so per-renderer cost can be JOINed honestly without inventing attribution numbers that don't sum back to reality.
- `TELEMETRY_VERSION = 1` constant + `PRAGMA user_version` schema-mismatch handling (drop+recreate; local metadata, no migration cost).
- `handover cost` `--runs <N>`, `--since-date <ISO>`, `--renderer <id>`, `--json` flags. `--json` carries `formatVersion: 1` so Phase 36's GitHub Action can pin a stable contract (mirrors Phase 32 `--dry-run --json` precedent).
- Wire telemetry-write into `src/cli/generate.ts` end-of-run path. Threshold warning sourced from the just-persisted `runs.total_cost`.
- Graceful degradation on telemetry failure — log + continue, never fail `handover generate`. Mirrors Phase 32 D-22 / dep-graph load-failure pattern.

**Out of scope for Phase 33:**
- Per-renderer model routing (Phase 34 — schema accommodates a `model` column from day one so Phase 34 doesn't bump the schema, but the routing logic is its own phase).
- Eval-run cost recording (Phase 35 owns its own table or extends `runs` — out of scope here; we keep the schema narrow).
- Trend detection / budget regression alerts (TELEM-06 deferred to v8.x per `.planning/REQUIREMENTS.md` "Deferred to v8.x" — trigger is "30+ run baseline accumulates").
- Per-renderer cost thresholds (TELEM-05 is run-total; per-renderer alerts are a Deferred Idea).
- Cross-provider routing per single run (ROUTE-08 deferred).
- VS Code / Cursor surfacing of telemetry data — distribution work, not v8.0.
- AUTH-05..08 work — explicitly out of v8.0 per PROJECT.md.

</domain>

<decisions>
## Implementation Decisions

The user explicitly delegated — *"i trust your verdict that you will cover everything with robust and best practices solution"*. Every D-NN below is therefore **Claude's Discretion** by mandate. The Claude's Discretion section at the bottom lists where the planner has the most latitude to revise on research evidence.

### Cost attribution model — what does "per-renderer cost" mean?

**Background:** LLM cost is incurred at the AI-round level (`TokenUsageTracker` in `src/context/tracker.ts:56,209` records cost via `recordRound()` and exposes `getTotalCost()`). The 14 renderers (`src/renderers/render-*.ts`) are pure markdown-composition functions over `ctx.rounds.rN.data` — they do not call LLM APIs. Verified at `src/renderers/render-03-architecture.ts:16` (`const r4 = ctx.rounds.r4?.data; if (!r4) return '';` — pure read of round output). Wall time per renderer IS real — already measured at `src/cli/generate.ts:1007,1024,1035`. Cost-per-renderer is a derived quantity that has to be defined.

- **D-01:** **Three tables, JOIN-derived per-renderer cost.** Persist:
  1. `runs` — one row per `handover generate` invocation: `run_id`, `started_at`, `ended_at`, `total_cost_usd`, `total_input_tokens`, `total_output_tokens`, `top_model`, `provider`, `threshold_usd`, `threshold_exceeded`, `since_ref` (nullable — for `--since` runs), `dry_run` (bool — though dry runs SHOULD NOT write telemetry; see D-08).
  2. `round_runs` — one row per round per run: `run_id`, `round_num`, `model`, `provider`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `cost_usd`, `cache_hit` (bool), `elapsed_ms`, `started_at`.
  3. `renderer_runs` — one row per renderer per run (the TELEM-01 mandated table): `run_id`, `renderer_id`, `model` (nullable until Phase 34; populated with `top_model` for now), `status` (`'full' | 'partial' | 'static-only' | 'reused' | 'not-generated'`), `elapsed_ms`, `ran_at`.

  `handover cost`'s per-renderer view derives cost via a SQL JOIN that allocates each round's cost across the renderers that needed it. This keeps the DATA honest (totals reconcile: `Σ runs.total_cost_usd == Σ round_runs.cost_usd`) while still presenting the user-facing per-renderer table the success criterion #1 demands. The two attribution views are defined precisely:

  - **`attributed_cost`** (default in `handover cost` output): `round_runs.cost_usd ÷ count(consuming renderers in this run)`, where a "consuming renderer" is one whose `requiredRounds` includes the round AND whose `renderer_runs.status` is `'full'` or `'partial'` (i.e., the renderer actually used the round's output). Sums across consuming renderers to exactly each round's cost.
  - **Orphan-cost bucket.** If a round's cost has NO consuming renderers (every dependent renderer was skipped via `--only`, status `'reused'`, `'static-only'`, or `'not-generated'`), the round's cost is attributed to a synthetic renderer row with `renderer_id = '_orphan'` so `Σ attributed_cost == Σ round_runs.cost_usd` always holds. `handover cost` shows `_orphan` only when non-zero, with a short header explaining "rounds ran but no doc consumed them — usually a `--only` mismatch."
  - **`standalone_cost`** (available via `handover cost --view standalone`): `SUM(round_runs.cost_usd)` over all rounds the renderer requires, with no division. Answers "what would it cost if I generated only this doc?" Will double-count when summed across renderers; the output header documents that explicitly.

  This satisfies TELEM-01 (renderer_runs table + index exists), TELEM-02 (per-renderer cost table is shippable), TELEM-03 (no prompt content; columns are all metadata), and gives Phase 34 a clean migration path (when a renderer's model differs from the round's run-model, `renderer_runs.model` records the resolved choice independently of `round_runs.model`).

- **D-02:** **`requiredRounds` is the JOIN key.** `DOCUMENT_REGISTRY` already has `requiredRounds: number[]` on every entry. The cost-attribution view reads this metadata at query time. No need to denormalize the renderer-round graph into a separate junction table — it's a code constant. Planner verifies this doesn't tempt a circular import; if the CLI command needs the registry, fine — `handover cost` already runs in the same process.

- **D-03:** **Wall time is the only "real" per-renderer number we record directly.** `renderer_runs.elapsed_ms` is sourced from `Date.now() - docStart` in the Promise.allSettled loop at `src/cli/generate.ts:987,1007,1024,1035`. This already exists; Phase 33 wires it into a writer call after the loop completes. Time per renderer is a TRUE per-renderer measurement; cost is a synthesized view per D-01. Be honest in the docs.

### Schema, granularity, module placement

- **D-04:** **`TELEMETRY_VERSION = 1`**, exported as `const TELEMETRY_VERSION = 1` from `src/regen/telemetry/db.ts`. Mirrors Phase 32 `GRAPH_VERSION = 1` in `src/regen/dep-graph.ts` and `CACHE_VERSION = 2` in `src/cache/round-cache.ts:18`. Bump policy: any column rename, type change, or semantic re-interpretation. Index-only additions: no bump. Pure column additions with default-null: no bump for v8.0 (Phase 34's nullable `model` qualifies). The constant is the doc-of-record for schema state.
- **D-05:** **Schema versioning via `PRAGMA user_version` + drop-and-recreate on mismatch.** SQLite native `PRAGMA user_version` holds the integer; on telemetry-DB open, if `user_version != TELEMETRY_VERSION`, all tables are dropped and recreated. Local metadata; user does not need a backup-and-migrate story for cost history (and explicitly does not get one in v8.0). The first-run path (no file) is identical to the version-mismatch path.
- **D-06:** **Module location: `src/regen/telemetry/`** (subdirectory). Phase 32 D-20 set the precedent — the smarter-regen track lives in `src/regen/`. Phase 33 is the second module in that track. Files:
  - `db.ts` — `better-sqlite3` connection lifecycle, `PRAGMA user_version` check, DDL strings, `TELEMETRY_VERSION` constant.
  - `schema.ts` — Zod schemas for write boundaries (`RunRecordSchema`, `RoundRunRecordSchema`, `RendererRunRecordSchema`). Mirrors Phase 32 D-D-04 `DepGraphSchema` pattern.
  - `writer.ts` — `recordRun(db, run, roundRuns, rendererRuns)` — all-or-nothing transaction.
  - `reader.ts` — `getRecentRuns(db, opts)`, `getRendererSummary(db, opts)` — query helpers used by `handover cost`.
  - `rotation.ts` — `rotateRetention(db)` — the 90d-OR-100-per-renderer SQL.
  - `index.ts` — barrel exporting the public API.
- **D-07:** **Row granularity:** 1 `runs` row per `handover generate` invocation. 1 `round_runs` row per round actually executed (so a run with `--only` selecting docs that need rounds 1,2 only writes 2 round_runs rows). 1 `renderer_runs` row per renderer that participated in the run (including `'reused'` and `'not-generated'` statuses — see D-09 for visibility rationale). **`run_id` is `crypto.randomUUID()`** — Node 19+ built-in, zero deps, sufficient collision-resistance, no rabbit hole. We never need lexicographic time-sort (the canonical sort is `ORDER BY started_at DESC`), so ULID's specific guarantees aren't required. `--only` and `--no-cache` runs DO write telemetry (only `--dry-run` skips per D-08).
- **D-08:** **`--dry-run` writes NO telemetry.** Phase 32 D-19 says `--dry-run` exits 0 and makes zero LLM calls. Recording a `runs` row for a no-cost preview pollutes the cost history and breaks the user's mental model of `handover cost`. The `dry_run` column on the `runs` table is for completeness in case we change our minds in a later phase; in Phase 33 it is unused (always `false`).

### `handover cost` output + `--json` contract

- **D-09:** **Default output (`handover cost` no flags):** Two sections.
  ```
  Recent runs (last 10):
    run_id                       when         cost      tokens          top model
    01HZK...3M                   3m ago       $0.42     124.3k / 8.9k   claude-sonnet-4-5
    01HZJ...AB   (1)             2h ago       $1.18     312.1k / 21.4k  claude-opus-4-6  ⚠ over $1.00
    ...

  Per-renderer aggregate (over 10 runs):
    renderer            avg time   total cost   tokens (in/out)   runs
    03-architecture     2.1s       $0.84        58.2k / 4.3k      10
    06-modules          1.8s       $0.62        44.1k / 3.0k      10
    ...
  ```
  Plain text, scannable in 3 seconds, no box-drawing. `⚠` for runs where `threshold_exceeded = true`. Empty DB prints `No telemetry yet. Run \`handover generate\` to record cost data.` and exits 0. Matches Phase 32 D-15 minimal-chrome philosophy.

- **D-10:** **Flag surface:**
  - `--runs <N>` (default 10) — how many recent runs to include.
  - `--since-date <ISO>` — alternative window: `--since-date 2026-04-01`. Mutually exclusive with `--runs`.
  - `--renderer <id>` — filter to one renderer; drops the per-run section, shows a time-series for that renderer with one row per run.
  - `--view standalone` — switches the per-renderer cost from D-01's `attributed_cost` to `standalone_cost` (with a one-line header documenting that totals will double-count).
  - `--json` — see D-11.
  - No `--days N` flag. `--since-date` is more precise and avoids "is 30 days 720 hours or roughly-a-month?" ambiguity.

- **D-11:** **`--json` contract for Phase 36 consumption.** Shape (sketch — planner finalizes; format-version stability matters more than any field name):
  ```json
  {
    "formatVersion": 1,
    "telemetryVersion": 1,
    "window": { "kind": "runs", "count": 10 },
    "runs": [
      {
        "runId": "01HZK...3M",
        "startedAt": "2026-05-14T08:12:33.000Z",
        "elapsedMs": 184230,
        "totalCostUsd": 0.42,
        "totalInputTokens": 124312,
        "totalOutputTokens": 8901,
        "topModel": "claude-sonnet-4-5",
        "provider": "anthropic",
        "thresholdUsd": 1.0,
        "thresholdExceeded": false,
        "sinceRef": null
      }
    ],
    "rendererAggregate": [
      {
        "rendererId": "03-architecture",
        "avgElapsedMs": 2104,
        "totalAttributedCostUsd": 0.84,
        "totalInputTokens": 58210,
        "totalOutputTokens": 4310,
        "runsCount": 10
      }
    ]
  }
  ```
  `formatVersion` bumps on breaking shape changes (renames, removals). Additive changes (new fields) do NOT bump. Phase 36 pins to `formatVersion: 1`. This mirrors the Phase 32 D-16 precedent exactly. All `*Usd` numbers are rounded to 6 decimal places per D-20b — Phase 36 can sum without float-accumulator drift. ISO-8601 strings (not "3m ago") for all timestamps in `--json` output; relative timestamps are TTY-only sugar (D-09 text mode).

- **D-12:** **Exit code is always 0** (read-only, observability mode). No "fail when over threshold" surface; that's `handover generate`'s job, not `handover cost`'s.

### Rotation trigger + cache-hit accounting

- **D-13:** **Rotation runs in a separate transaction AFTER the write commits.** Two transactions: (a) `INSERT runs + round_runs + renderer_runs` in one transaction; commit. (b) DELETE rotation in a second transaction; commit. Reason: D-19 says telemetry failures never break `handover generate`. If rotation and write share a transaction, a rotation DELETE failure (rare, but disk-full / corruption is real) rolls back the INSERT and the user loses the run record. Two-transaction split: even if rotation fails, the run row is preserved; the warn-and-continue path (D-19) covers the rotation error. The window is the UNION of (last 100 run_ids per renderer) and (run_ids within last 90 days). Three DELETE statements (renderer_runs, then round_runs, then runs — child-first ordering even though no FK constraints per D-15). Sub-millisecond on a typical DB. Self-cleaning: every successful write triggers rotation. Matches Phase 32 D-06 self-maintenance pattern; differs by acknowledging the failure-domain isolation D-19 requires.

- **D-14:** **Fully-cached runs ARE persisted.** A run with all 6 rounds cache_hit (cost ≈ 0) still gets a `runs` row + 6 `round_runs` rows (each with `cache_hit = true`, `cost_usd = 0`, `input_tokens = 0`, `output_tokens = 0`) + N `renderer_runs` rows. Reason: visibility into how often caching is helping is itself valuable; users SHOULD see "you ran generate 30 times this week, 22 were fully cached, $0.34 total" rather than "you ran generate 8 times, $0.34 total" (which is a lie). Also, signal-to-noise is fine because the `runs` row's `total_cost_usd = 0` shows up clearly in the default table; the user sees the pattern.

- **D-15:** **No `FOREIGN KEY` constraints on round_runs / renderer_runs → runs.** Reason: SQLite FKs need `PRAGMA foreign_keys = ON` set per-connection (easy to forget), and we never want a partial-write inconsistency to crash `handover generate`. The all-in-one-transaction discipline (D-13) gives us write atomicity. On read, JOINs filter to `run_id IN (SELECT run_id FROM runs)` defensively. Phase 35/36 may add FKs if they want stricter invariants; v8.0 stays loose.

- **D-16:** **Cache-hit info lives on `round_runs.cache_hit` only.** No per-renderer cache_hit boolean — the renderer-level cache-hit story is derived: a renderer is "fully cached" iff all of its `requiredRounds` had `cache_hit = true`. Query-time derivation, no denormalization.

### Threshold-warning sourcing (TELEM-05)

- **D-17:** **Warning fires AFTER the write commits, using the same totals we just persisted.** Current code at `src/ui/components.ts` checks `totalCost > costWarningThreshold` from in-memory state pre-write. Phase 33 reorders: (1) build the `runs` row from in-memory totals; (2) write transaction commits; (3) compare those same totals against `costWarningThreshold` and emit `renderCostWarning()` if exceeded. We do NOT SELECT the row back — the in-memory values ARE the data we just wrote; reading back is a no-value round trip. TELEM-05's "sourced from the actual persisted run data" wording is satisfied because the warning logically follows successful persistence (no warning fires if the write transaction failed). The renderer cost-warning hook stays at `src/ui/renderer.ts`; only the firing order moves. If telemetry write fails: existing in-memory pre-write check is the fallback (D-19 graceful degradation; no UX regression).

- **D-18:** **`threshold_usd` and `threshold_exceeded` are columns on `runs`.** So `handover cost` can show a ⚠ flag against historical over-budget runs (D-09 example). Stores the threshold at the time of the run — if the user later tightens their threshold, history doesn't get retroactively flagged (auditability).

### Failure semantics + observability

- **D-19:** **Telemetry write failures NEVER break `handover generate`.** Wrap the entire `recordRun()` call in a try/catch at the generate.ts wire-in. On failure: `logger.warn('Telemetry write failed: ...')`, continue. Threshold warning still emits from in-memory totals (D-17 fallback). Mirrors Phase 32 D-22 graceful degradation; same rule as analyzer failures throughout the codebase (per `.planning/codebase/ARCHITECTURE.md` — "DAG-based orchestration, graceful-degradation pattern").
- **D-20:** **Telemetry-DB open is lazy.** The DB is opened at the end of the run, right before `recordRun()`. No open-on-startup cost; failure to open is the same as failure to write (D-19). DB closed in a `finally`. `better-sqlite3` is synchronous — no async lifecycle complexity.
- **D-20a:** **`PRAGMA journal_mode = WAL` on every open.** Default `delete` journal mode locks the DB during writes — `handover cost` running concurrently with `handover generate` would block. WAL allows the reader to proceed against a consistent snapshot while the writer commits. Set right after `new Database(...)`, before any other PRAGMA. Cost: adds a `.handover/telemetry.db-wal` + `.handover/telemetry.db-shm` sidecar pair — both must be in `.gitignore` (already covered: `.handover/telemetry.db` entry matches via Phase 31's directory-prefix patterns; planner verifies `.handover/cache` style entry covers sidecars, otherwise extend `GITIGNORE_ENTRIES` in `src/cli/init.ts:131`).
- **D-20b:** **Cost-precision convention for JSON output.** All `*Usd` fields in `--json` and stored `cost_usd` columns are rounded to **6 decimal places** before persistence (`Math.round(cost * 1e6) / 1e6`). Six decimals = micro-dollars — well below LLM rounding noise, avoids float-drift surprise when summing 100+ rows. The `handover cost` text view rounds further to 2 decimals at display time. Phase 36 consumers can sum without worrying about float-accumulator error.
- **D-21:** **`handover cost` failure modes.** Missing DB file: `No telemetry yet.` + exit 0. Corrupt DB (better-sqlite3 throws): print a one-liner remediation (`Telemetry DB unreadable. Delete .handover/telemetry.db to reset.`) + exit 1. Schema mismatch is handled silently by D-05's drop-and-recreate at write time; if `handover cost` runs against a wrong-version DB before a generate has touched it, treat as missing-DB.

### Test coverage

- **D-22:** **90/90/90/85 coverage applies** (per `.planning/codebase/TESTING.md` and Phase 32 D-23). Tests must cover:
  - Success criterion #1: `handover cost` shows a per-renderer table (assertion: at least one row per non-skipped renderer; cost > 0 for at least one row).
  - Success criterion #2: only metadata in DB — assert no row contains keys named `prompt`, `apiKey`, `credentials`, `content` (negative-existence assertion at schema-Zod level).
  - Success criterion #3: rotation works — write 101 runs, assert oldest gone; rotation runs as a separate transaction (assertion: `runs` row count drops after the second tx, not the first).
  - Success criterion #4: threshold warning fires from persisted totals — set threshold to 0.001, run, assert warning string present; assert warning does NOT fire when the write transaction fails (D-19 path: warning fallback uses pre-write totals).
  - Success criterion #5: `idx_renderer_runs_renderer` exists — assert `PRAGMA index_list('renderer_runs')` returns it.
  - **Attribution reconciliation:** `Σ attributed_cost == Σ round_runs.cost_usd` per run, including the `_orphan` bucket (test: configure `--only` to skip every dependent of round N, assert `_orphan` row contains round N's cost).
  - **WAL mode:** assert `PRAGMA journal_mode` returns `wal` after open. Assert a second `Database` handle can read while the first is mid-write transaction.
  - **Cost precision:** write a cost of `0.123456789` USD, assert stored value is `0.123457` (6-decimal rounding).
  - Schema-mismatch path: bump `TELEMETRY_VERSION` in test, assert tables get recreated.
  - Graceful degradation: stub `recordRun` to throw, assert `handover generate` still exits 0 and the existing in-memory threshold check still fires.
  - **`--dry-run` skips telemetry write** (D-08): run with `--dry-run`, assert zero rows added.
  - **`crypto.randomUUID` uniqueness:** sanity test, two consecutive `recordRun` calls produce distinct `run_id`s.
- **D-23:** **Test fs strategy:** `memfs` will NOT work for `better-sqlite3` (native bindings need a real path). Default to `new Database(':memory:')` — better-sqlite3's first-class in-RAM mode, faster than tmpfs, auto-clean on close. Reserve `os.tmpdir()` + `crypto.randomUUID()` paths for tests that specifically need on-disk persistence (PRAGMA user_version round-trip, schema-mismatch drop-and-recreate, file-handle reopen). Tmpdir tests clean DB files in `afterEach`. Mirrors how `src/cache/round-cache.test.ts` already handles real-file tests (planner verifies pattern).

### Claude's Discretion

User said "i trust your verdict that you will cover everything with robust and best practices solution". Locked decisions above are all Claude-chosen. Areas where the planner has the most latitude to revise based on research evidence:

- **D-01 attribution math.** The "equal split among consuming renderers" formula is the standard accounting choice (cost reconciles across views) but a different formula (e.g., weighted by `input_tokens` per renderer-context-window-share) is defensible. Planner reviews if research surfaces a stronger convention. The schema does not lock in the formula — it's a query.
- **D-01 orphan-bucket name.** `_orphan` is a placeholder; planner may pick a clearer label (e.g., `_unconsumed`, `_unused-rounds`) if research shows users misread it.
- **D-07 ID source.** `crypto.randomUUID()` is the locked choice; planner switches to `ulid` only if a downstream consumer surfaces a real lexicographic-sort requirement.
- **D-09/D-10 output formatting details** (column widths, "3m ago" vs ISO timestamp, color coding) — follow `src/ui/` conventions (`picocolors`, `sisteransi`). Planner finalizes.
- **D-11 exact JSON field names beyond `formatVersion` + the top-level keys.** Stable v0; rename later requires `formatVersion` bump.
- **D-13 rotation SQL phrasing.** The window computation is "renderer-aware" (last 100 per renderer) — the planner picks between a UNION subquery or a CTE. Either is fine if it stays sub-millisecond.
- **D-22 specific assertion text.** Test names + fixtures are the planner's call.

### Folded Todos

The `cross_reference_todos` step surfaced no Phase 33 matches in `gsd-sdk query todo.match-phase` (gsd-sdk binary is unavailable in this environment per Phase 32 SUMMARY note; manual STATE.md scan corroborates — pending todos relate to Phases 34/35/36, not 33). None folded.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v8.0 milestone documents
- `.planning/PROJECT.md` — v8.0 milestone scope; "Smarter regen" bullet for Phase 33 cost telemetry positioning; explicit non-goals for v8.0
- `.planning/REQUIREMENTS.md` §"Cost Telemetry (TELEM)" — TELEM-01..05 full text; "Deferred to v8.x" §"Cost Telemetry / Routing follow-ups" (TELEM-06 trend detection, ROUTE-08 cross-provider routing — both deferred)
- `.planning/ROADMAP.md` §"Phase 33: Cost Telemetry" — phase goal, 5 success criteria, dependency note ("must PRECEDE Phase 34"), requirement mapping
- `.planning/STATE.md` §"Accumulated Context — Decisions" — v8.0 decision: "Telemetry (Phase 33) precedes routing (Phase 34) because routing records must flow into telemetry; telemetry must be the stable write target"
- `.planning/STATE.md` §"Pending Todos" — Phase 34 first task is "classify modelHint for all 14 renderers before implementing routing" (informs why Phase 33 schema must support `model` column from day one)

### Prior phase context (carried forward)
- `.planning/phases/32-source-doc-dependency-graph/32-CONTEXT.md` — Phase 32 D-06 (rebuild-on-write self-maintenance), D-07 (versioning constant pattern), D-11 (curated-over-clever), D-15 (minimal-chrome CLI output), D-16 (JSON formatVersion contract), D-19 (dry-run exit 0), D-20 (`src/regen/` placement), D-22 (no new gitignore), D-23 (test coverage targets). Same milestone; conventions transfer.
- `.planning/phases/31-init-wizard-action-scaffold/31-CONTEXT.md` — Phase 31 D-09..D-13 (gitignore-entry patching; `.handover/telemetry.db` already in `GITIGNORE_ENTRIES` at `src/cli/init.ts:131`). No new gitignore work in Phase 33.

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` — DAG orchestration; graceful-degradation pattern (applies to telemetry: never fail generate)
- `.planning/codebase/STACK.md` — `better-sqlite3@12.6.2` (already a dep per `package.json`), `zod@3.25.76` (for write-boundary validation)
- `.planning/codebase/STRUCTURE.md` — module-placement rules (confirms `src/regen/` for smarter-regen track)
- `.planning/codebase/TESTING.md` — Vitest, coverage thresholds (90/90/90/85), test patterns (note: memfs not applicable for better-sqlite3 native bindings — see D-23)
- `.planning/codebase/CONVENTIONS.md` — naming, file layout, conventional commits

### Existing source (must read before modifying)
- `src/cli/index.ts` — Commander.js entry; add `handover cost` subcommand here
- `src/cli/generate.ts:215-230` — `displayState` initialization including `costWarningThreshold: config.costWarningThreshold ?? 1.0`
- `src/cli/generate.ts:400-460` — round-completion event flow; where round cost/tokens land on `displayState.rounds.get(N)` (`rd.tokens`, `rd.cost`, `rd.elapsedMs`)
- `src/cli/generate.ts:985-1090` — Promise.allSettled render loop; `durationMs` per renderer is already captured (lines 1007/1024/1035); Phase 33 wires the telemetry write at the end of this block
- `src/context/tracker.ts:14-42` — `TokenUsageTracker.MODEL_COSTS` pricing table (canonical source for cost computation); reuse, do not duplicate
- `src/context/tracker.ts:56,195,209` — `recordRound`, `getRoundCost`, `getTotalCost` — telemetry writer reads from these accessors
- `src/config/schema.ts` — `costWarningThreshold` Zod schema already exists; no schema change needed
- `src/config/schema.test.ts` — existing threshold tests document the expected shape
- `src/ui/components.ts` — `renderCostWarning(totalCost, costWarningThreshold)` — reuse this string; do not write a divergent message
- `src/ui/renderer.ts` — where the warning is currently invoked; data source moves, code stays
- `src/cli/init.ts:131` — `GITIGNORE_ENTRIES = ['.handover/cache', '.handover/telemetry.db']`; confirms gitignore is already correct
- `src/cache/round-cache.ts:1-50` — versioning-constant pattern (`CACHE_VERSION = 2`); `ensureGitignored()` invocation pattern. Telemetry mirrors this discipline.
- `src/regen/dep-graph.ts` — Phase 32 dep-graph module; Phase 33's `src/regen/telemetry/` sits beside it (smarter-regen track). DO NOT confuse with `src/analyzers/dependency-graph.ts` (STAT-02 package-manifest analyzer; same naming pitfall flagged in Phase 32 D-20).
- `src/renderers/registry.ts` — `DOCUMENT_REGISTRY` with `requiredRounds` per entry (the JOIN key for D-02 cost attribution)
- `src/renderers/types.ts` — `DocumentStatus` enum (`'full' | 'partial' | 'static-only' | 'reused' | 'not-generated'`) — `renderer_runs.status` column accepts these values
- `package.json` — confirms `better-sqlite3@^12.6.2` and `@types/better-sqlite3@^7.6.13` are already declared
- `tsup.config.ts` — `better-sqlite3` already in externals (native bindings can't be bundled); confirms the build understands this dep

### External standards
- `better-sqlite3` synchronous API docs: <https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md>
- SQLite `PRAGMA user_version` semantics: <https://www.sqlite.org/pragma.html#pragma_user_version>
- ULID spec (if planner chooses npm `ulid` over hand-rolled): <https://github.com/ulid/spec>
- Conventional Commits — existing project convention

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`TokenUsageTracker`** (`src/context/tracker.ts`) — the canonical source of cost-per-round, model pricing, cache savings. `recordRound`, `getRoundCost(n)`, `getRoundUsage(n)`, `getRoundCacheSavings(n)`, `getTotalUsage()`, `getTotalCost()` are all the Phase 33 writer needs. **Do NOT duplicate the `MODEL_COSTS` table** — read from the tracker instance that already exists in `runGenerate`.
- **`displayState.rounds: Map<number, RoundDisplayState>`** (`src/cli/generate.ts:215-230`) — already carries `tokens`, `cost`, `elapsedMs`, `cacheReadTokens`, `cacheCreationTokens`, `cacheSavingsTokens`, `cacheSavingsPercent`, `cacheSavingsDollars` per round (wired at `generate.ts:428-442`). Telemetry writer reads this map at run end.
- **Promise.allSettled render result objects** (`generate.ts:985-1038`) — `{ doc, content, skipped, reused, lastRenderedAt, durationMs }`. `renderer_runs` writer reads `durationMs` directly (D-03).
- **`DocumentStatus` enum** (`src/renderers/types.ts`) — five states (`full | partial | static-only | reused | not-generated`); `renderer_runs.status` is a TEXT column constrained to these literals.
- **`DOCUMENT_REGISTRY` with `requiredRounds`** (`src/renderers/registry.ts`) — the JOIN key for D-02's cost-attribution query.
- **`renderCostWarning(totalCost, costWarningThreshold)`** (`src/ui/components.ts`) — reuse the warning string verbatim; D-17 only moves the data source, not the message.
- **`HandoverError`** (`src/utils/errors.ts`) — the project's error pattern; use for the `handover cost` corrupt-DB exit path (D-21). Per success-criterion-5 "safe degradation" rule, the `recordRun` path never throws.
- **Commander.js subcommand pattern** (`src/cli/index.ts`) — `handover serve`, `handover search`, `handover reindex`, `handover qa` are all existing subcommands; `handover cost` follows the same registration pattern.
- **`better-sqlite3`** (`package.json`) — already installed for the vector store (`src/vector/`). Phase 33 reuses; no new dep.
- **`fast-glob`** — not needed for Phase 33; included only because the planner may reach for it before realizing telemetry has zero globbing.

### Established Patterns

- **Versioned local stores** — `CACHE_VERSION = 2` in `round-cache.ts`, `GRAPH_VERSION = 1` in `dep-graph.ts`. `TELEMETRY_VERSION = 1` (D-04) follows the same constant-export-and-bump-discipline.
- **Schema-mismatch → drop-and-recreate** — Phase 32 dep-graph already does this for local metadata. Phase 33 telemetry mirrors. No migration code in v8.0.
- **Zod-at-the-boundary** — config (`src/config/schema.ts`), provider responses, analyzer outputs all Zod-validated. `recordRun` validates each row against a Zod schema before INSERT (D-06 `schema.ts`).
- **Graceful degradation** — analyzers, rounds, cache all return empty/fallback rather than throw at the user. Telemetry follows: write failure → log + continue (D-19).
- **Co-located test files** — `*.test.ts` adjacent to source; `vi.hoisted()` for mock setup. memfs **does not** work for better-sqlite3 (D-23); use `os.tmpdir()` + UUID.
- **Single-table-per-concept SQLite usage** — vector store uses `sqlite-vec`; nothing in the codebase currently has a multi-table local SQLite store, so Phase 33 sets the precedent. Keep it boring: 3 tables, 1 index, no triggers, no views.
- **CLI subcommands return exit codes via `process.exit(code)`** — read-only commands exit 0 even when "no data"; mutation commands exit non-zero on hard failures.
- **`--json` output is a typed contract** — Phase 32 D-16 set this for `--dry-run --json`; Phase 33 follows for `handover cost --json` (D-11).

### Integration Points

- **`src/cli/index.ts`** — register `handover cost` subcommand alongside the existing `generate`/`search`/`serve`/`reindex`/`qa` family. Flags per D-10.
- **`src/cli/generate.ts`** end-of-run path (after the Promise.allSettled render loop, before final renderer.onComplete) — wire-in: `await recordRun({ run, roundRuns, rendererRuns })` inside a try/catch (D-19). Data sources: `tracker.getTotalUsage()`, `tracker.getTotalCost()`, `tracker.getRoundUsage(n)`, `tracker.getRoundCost(n)`, `displayState.rounds`, the Promise.allSettled result array, `config.costWarningThreshold`.
- **`src/ui/renderer.ts`** — the cost-warning emission point. Data source switches from `displayState.totalCost` to `runs.total_cost_usd` of the just-written row. If telemetry write failed (D-19), fall back to existing in-memory check — no UX regression.
- **`src/regen/`** — new sibling subdirectory `src/regen/telemetry/` per D-06. Adjacent to `src/regen/dep-graph.ts`. No re-export from `src/regen/index.ts` if one exists (planner checks).
- **No `src/config/schema.ts` changes** — `costWarningThreshold` already exists; no new config keys for Phase 33. Per-renderer threshold map is a Deferred Idea.
- **`.handover/telemetry.db`** — file path is fixed by TELEM-01 and already gitignored (init.ts:131); confirm in the writer module that the path comes from a single named constant.

### Pitfalls

- **Don't name the new module `telemetry.ts` in `src/`** — it conflicts conceptually with future cross-cutting telemetry (eval, etc.). Keep it scoped: `src/regen/telemetry/` (smarter-regen track). Phase 35 can pick `src/eval/` for its own observability.
- **Don't invent per-renderer cost as a stored column** — store the underlying truth (round-level cost) and derive renderer-level cost as a view (D-01). Storing both invites drift.
- **Don't write telemetry from `--dry-run`** (D-08). The whole point of dry-run is "zero cost" — a row in cost history with `cost = 0` and a special flag is confusing UX.
- **Don't open the DB at process start** — open lazily at end-of-run (D-20). Avoids the "user just typed `handover --help` and we touched their FS" anti-pattern.
- **Don't add SQLite FK constraints** in v8.0 (D-15). Atomic-transaction discipline (D-13) covers our integrity needs; FKs add operational surface (PRAGMA forgotten on a connection → silent failure).
- **Don't reuse the term "graphVersion"** for `TELEMETRY_VERSION` — they are unrelated stores. Each has its own version constant in its own module.
- **Don't pull cost from `displayState.totalCost` for the threshold warning** post-Phase-33 (D-17). Source is the just-persisted `runs.total_cost_usd` row. The fallback to in-memory is only the failure path.
- **Don't denormalize the renderer→round graph** into a SQL junction table (D-02). `requiredRounds` lives in `DOCUMENT_REGISTRY` as a code constant; querying with a hardcoded list is cleaner than a sync'd DB table.
- **Don't ship a `--days N` flag** when `--since-date <ISO>` is precise (D-10). Two ways to express the same window is two ways to be inconsistent.
- **Don't break `handover generate` because telemetry threw** (D-19). Wrap, log, continue. This is the most important rule in the phase.
- **Don't forget WAL** (D-20a). Without it, `handover cost` blocks during `handover generate`. The pragma is one line; the consequence of omission is a confusing UX bug.
- **Don't attribute round cost to skipped renderers** (D-01). A renderer with status `'reused'` or `'static-only'` did not consume the round output; counting it as a consumer makes the per-renderer numbers misleading. Orphan rounds (no consumer) get an `_orphan` row so totals still reconcile.
- **Don't round `cost_usd` at write time below 6 decimals** (D-20b). A renderer accumulating $0.0003 / day for 90 days needs the precision; the display layer rounds to 2 decimals.

</code_context>

<specifics>
## Specific Ideas

- The `handover cost` output should be **scannable in 3 seconds** — two short blocks (runs table, renderer aggregate), no banners or box-drawing. Matches Phase 32 D-15 minimal-chrome philosophy.
- `--json` is an API contract for Phase 36 (analogous to Phase 32's `--dry-run --json`). `formatVersion` bumps on breaking changes. Adding fields is backward-compatible; renaming or removing requires bump.
- The `attributed_cost` math (round_cost ÷ N_renderers_using_round) is the **only** attribution that sums back to the run's total. Document the math in the `handover cost` man page / README so users understand what they're looking at.
- `runs.threshold_usd` and `runs.threshold_exceeded` are stored AS-OF the run — historical rows are not retroactively re-flagged when the user changes their threshold. This is auditability, not laziness.
- Telemetry visibility is for trend-spotting; the v8.x trend detection (TELEM-06) is the next step but Phase 33 ships the substrate without the trend logic.

</specifics>

<deferred>
## Deferred Ideas

- **Per-renderer `costWarningThreshold` map** — e.g., `costWarningThresholds: { "03-architecture": 0.30, "06-modules": 0.20 }`. TELEM-05 wording is run-total only; per-renderer is its own surface. Trigger to revisit: a user files an issue saying "I want to know which doc is the budget hog before I exceed the run total". Likely Phase 33+1 or v8.x.
- **Trend-regression alerts** (TELEM-06 from REQUIREMENTS.md Deferred) — emit a warning when a renderer's 7-day rolling cost is N% above its 30-day baseline. Trigger: 30+ run baseline accumulates per renderer. Phase 33 ships the data; the alert logic is its own phase.
- **Eval-run cost recording (Phase 35 interaction)** — Phase 35's `handover eval` will incur LLM cost (judge model). Phase 35 owns whether to extend `runs.kind` with `'generate' | 'eval'` or add a separate `eval_runs` table. Phase 33 keeps schema narrow.
- **Cross-provider routing in a single run** (ROUTE-08 from Deferred v8.x) — if Phase 34's routing later allows different renderers to call different PROVIDERS (not just different models in the same provider), `round_runs.provider` may need to vary per round. Currently we assume a single provider per run. Trigger: multi-provider auth per run is in scope.
- **`handover cost --export <csv|tsv>`** — for offline analysis (spreadsheets, dashboards). `--json` covers programmatic; CSV is a different audience. Add when a user asks.
- **Sticky-PR cost-diff badge** (Phase 36 interaction) — Phase 36's GitHub Action footer will show this run's cost vs the baseline. That logic belongs in Phase 36; Phase 33 just exposes the `--json` data it needs.
- **`handover cost --renderer X --since-date Y` time-series chart** — ASCII sparkline of cost over time. Nice-to-have. Trigger: user feedback that the time-series rows are hard to eyeball.
- **VS Code panel / web UI** — the `--json` contract enables this but distribution surface is explicitly out of v8.0 per PROJECT.md.
- **Per-round telemetry export for prompt-cache analysis** — `handover cost --rounds` showing cache_hit ratios per round. Useful for tuning; out of scope for v8.0's "renderer-table" surface.
- **OS-keychain protection of telemetry.db** — overkill for cost metadata. Local-file mode (matching existing `~/.handover/credentials.json` 0600 pattern from v6.0) is enough if a user requests it; not Phase 33.

### Reviewed Todos (not folded)

None — STATE.md pending todos relate to Phases 34/35/36 (modelHint classification, eval rubric, Marketplace name check), not 33. `gsd-sdk query todo.match-phase` binary is unavailable per Phase 32 SUMMARY; manual STATE.md scan confirms no 33-specific todos pending.

</deferred>

---

*Phase: 33-cost-telemetry*
*Context gathered: 2026-05-14*
