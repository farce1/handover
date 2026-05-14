---
phase: 33
slug: cost-telemetry
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `33-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (already installed; see `vitest.config.ts`) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run src/regen/telemetry` |
| **Full suite command** | `npx vitest run --coverage` |
| **Estimated runtime** | ~12s (telemetry subset) / ~90s (full suite with coverage) |

Coverage thresholds (enforced via `vitest.config.ts`): **90 / 90 / 90 / 85** (statements / branches / functions / lines) per `.planning/codebase/TESTING.md`. Telemetry module-level coverage MUST meet or exceed this.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed-file>.test.ts` — `<1s` typical, hard ceiling `5s`.
- **After every plan wave:** Run `npx vitest run src/regen/telemetry src/cli/generate.test.ts src/cli/cost.test.ts` — ≤30s.
- **Before `/gsd-verify-work`:** Full suite must be green AND `npx tsc --noEmit` must exit 0.
- **Max feedback latency:** 30 seconds per wave.

---

## Per-Task Verification Map

Tasks are owned by the planner; this table is populated after `*-PLAN.md` files exist. The required coverage is enumerated below; the planner MUST map each row to a plan/task ID:

| # | Success Criterion / Invariant | Requirement | Test Type | Automated Command | File Owner |
|---|-------------------------------|-------------|-----------|-------------------|------------|
| 1 | `handover cost` shows per-renderer table with cost/in-tokens/out-tokens/wall-time/run-ts | TELEM-02 | integration | `npx vitest run src/cli/cost.test.ts -t "renders per-renderer table"` | `src/cli/cost.test.ts` |
| 2 | DB contains metadata only — no `prompt`, `apiKey`, `credentials`, `content` keys appear in any row | TELEM-03 | unit (schema-level negative-existence) | `npx vitest run src/regen/telemetry/schema.test.ts -t "rejects forbidden keys"` | `src/regen/telemetry/schema.test.ts` |
| 3 | Rotation removes records past 90d OR 100/renderer | TELEM-04 | unit | `npx vitest run src/regen/telemetry/rotation.test.ts` | `src/regen/telemetry/rotation.test.ts` |
| 4a | Threshold warning fires from **persisted** totals when over threshold | TELEM-05 | integration | `npx vitest run src/cli/generate.test.ts -t "cost warning sources from persisted run"` | `src/cli/generate.test.ts` |
| 4b | Threshold warning fires from **in-memory** fallback when telemetry write fails (D-19 fallback path) | TELEM-05 + D-19 | integration | `npx vitest run src/cli/generate.test.ts -t "cost warning fallback on telemetry failure"` | `src/cli/generate.test.ts` |
| 5 | `idx_renderer_runs_renderer` index exists | TELEM-01 | unit | `npx vitest run src/regen/telemetry/db.test.ts -t "creates renderer_runs index"` | `src/regen/telemetry/db.test.ts` |
| 6 | Attribution reconciliation: `Σ attributed_cost == Σ round_runs.cost_usd` for each run (including `_unconsumed` orphan bucket) | D-01 | unit | `npx vitest run src/regen/telemetry/reader.test.ts -t "attributed cost sums equal round cost"` | `src/regen/telemetry/reader.test.ts` |
| 7 | WAL mode active after open; concurrent read works during write tx | D-20a | unit | `npx vitest run src/regen/telemetry/db.test.ts -t "WAL mode allows concurrent read"` | `src/regen/telemetry/db.test.ts` |
| 8 | Cost precision: `Math.round(x*1e6)/1e6` rounding round-trips through INSERT/SELECT | D-20b | unit | `npx vitest run src/regen/telemetry/writer.test.ts -t "rounds cost to 6 decimals"` | `src/regen/telemetry/writer.test.ts` |
| 9 | Schema-mismatch: bumping `TELEMETRY_VERSION` drops + recreates tables on next open | D-05 | unit | `npx vitest run src/regen/telemetry/db.test.ts -t "drops and recreates on version mismatch"` | `src/regen/telemetry/db.test.ts` |
| 10 | Graceful degradation: telemetry write throw → `handover generate` exits 0, logger.warn emitted | D-19 | integration | `npx vitest run src/cli/generate.test.ts -t "telemetry failure never fails generate"` | `src/cli/generate.test.ts` |
| 11 | `--dry-run` writes NO telemetry rows | D-08 | integration | `npx vitest run src/cli/generate.test.ts -t "dry-run skips telemetry"` | `src/cli/generate.test.ts` |
| 12 | `crypto.randomUUID()` (from `node:crypto`) — two consecutive `recordRun` calls yield distinct `run_id`s | D-07 | unit | `npx vitest run src/regen/telemetry/writer.test.ts -t "run_id is unique per call"` | `src/regen/telemetry/writer.test.ts` |
| 13 | `runs.threshold_usd` and `runs.threshold_exceeded` stored AS-OF the run; later threshold change doesn't retroactively flag | D-18 | unit | `npx vitest run src/regen/telemetry/writer.test.ts -t "threshold columns stored as-of run"` | `src/regen/telemetry/writer.test.ts` |
| 14 | `handover cost --json` output validates against `formatVersion: 1` schema (Zod or shape assertion) | D-11 | integration | `npx vitest run src/cli/cost.test.ts -t "json output matches formatVersion 1 contract"` | `src/cli/cost.test.ts` |
| 15 | Empty DB: `handover cost` prints `No telemetry yet.` and exits 0 | D-09 / D-21 | integration | `npx vitest run src/cli/cost.test.ts -t "empty DB exits 0 with friendly message"` | `src/cli/cost.test.ts` |
| 16 | Corrupt DB: `handover cost` prints remediation message + exits 1 | D-21 | integration | `npx vitest run src/cli/cost.test.ts -t "corrupt DB exits 1 with remediation"` | `src/cli/cost.test.ts` |
| 17 | Cached-only run (cost ≈ 0) still writes a `runs` row + N `round_runs` rows | D-14 | unit | `npx vitest run src/regen/telemetry/writer.test.ts -t "fully-cached run is persisted"` | `src/regen/telemetry/writer.test.ts` |
| 18 | Renderer status enum matches `DocumentStatus` from `src/renderers/types.ts` — `'complete' \| 'partial' \| 'static-only' \| 'reused' \| 'not-generated'` (NOT `'full'`) | D-01 + RESEARCH §F-01 fix | unit | `grep -E "'(complete\|partial\|static-only\|reused\|not-generated)'" src/regen/telemetry/schema.ts` | `src/regen/telemetry/schema.ts` |
| 19 | `.handover/telemetry.db-wal` and `.handover/telemetry.db-shm` are in `GITIGNORE_ENTRIES` | D-20a + RESEARCH §F-02 fix | unit | `grep -E "telemetry\\.db-(wal\|shm)" src/cli/init.ts` | `src/cli/init.test.ts` |

> Planner contract: every PLAN.md task that maps to a row above MUST cite the row number in its `<acceptance_criteria>` or `requirements` field so traceability holds during execution.

---

## Wave 0 Requirements

Wave 0 lays the test infrastructure BEFORE any production code in Wave 1. The planner MUST assign tasks for:

- [ ] `src/regen/telemetry/db.test.ts` — stubs for rows 5, 7, 9 (skeleton + `it.todo` for each).
- [ ] `src/regen/telemetry/schema.test.ts` — stubs for rows 2, 18.
- [ ] `src/regen/telemetry/writer.test.ts` — stubs for rows 8, 12, 13, 17.
- [ ] `src/regen/telemetry/reader.test.ts` — stubs for row 6.
- [ ] `src/regen/telemetry/rotation.test.ts` — stub for row 3.
- [ ] `src/cli/cost.test.ts` — stubs for rows 1, 14, 15, 16.
- [ ] `src/cli/generate.test.ts` — **EXTEND existing file** with `it.todo` for rows 4a, 4b, 10, 11.
- [ ] `src/cli/init.test.ts` — **EXTEND existing file** with `it.todo` for row 19.

> No new framework install needed — Vitest, `@vitest/coverage-v8`, `better-sqlite3`, `zod` are all declared in `package.json` and consumed elsewhere in `src/`.

> No new fixtures directory needed for Phase 33 — every test uses `new Database(':memory:')` per D-23 (better-sqlite3 first-class in-memory mode). Tests that specifically need on-disk persistence (rows 7 and 9, the WAL-sidecar + version-mismatch roundtrips) use `path.join(os.tmpdir(), \`telem-${randomUUID()}.db\`)` and clean up in `afterEach`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `handover cost` output is "scannable in 3 seconds" — column widths, alignment, `⚠` icon legibility | D-09 specifics | UX judgement; can't be asserted in a unit test | After implementation, run `handover generate && handover cost` and visually confirm column alignment, that the `⚠` icon is the over-threshold indicator, and that the runs/aggregate sections render in <80 columns |
| WAL sidecar files appear next to `.handover/telemetry.db` after first write | D-20a | Filesystem visibility check | After running `handover generate` once, `ls .handover/telemetry.db*` should list `telemetry.db`, `telemetry.db-wal`, `telemetry.db-shm`; verify `git status` does NOT list them as untracked |

---

## Validation Sign-Off

- [ ] All 19 rows above are mapped to PLAN.md tasks with cited row numbers
- [ ] Sampling continuity: no 3 consecutive Wave-1+ tasks without an automated verify
- [ ] Wave 0 stubs (8 files / extensions) all exist before Wave 1 starts
- [ ] No watch-mode flags in any task (`vitest run`, never `vitest`)
- [ ] Feedback latency < 30s per wave
- [ ] `nyquist_compliant: true` set in frontmatter once gsd-plan-checker confirms coverage

**Approval:** pending
