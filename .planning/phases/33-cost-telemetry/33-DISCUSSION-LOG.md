# Phase 33: Cost Telemetry - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 33-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-14
**Phase:** 33-cost-telemetry
**Areas discussed:** all four offered areas — Cost attribution model; Schema, granularity + module placement; `handover cost` output + `--json`; Rotation trigger + cache-hit accounting

---

## Gray-area selection turn

| Option | Description | Selected |
|--------|-------------|----------|
| Cost attribution model | How does 'per-renderer cost' get computed when LLM cost is at the round level and renderers are pure markdown? Three real options: sum-of-required-rounds (each renderer = standalone cost; rows double-count), proportional split (round cost / number of dependents), or cost-at-round + time-at-renderer (two tables in `handover cost`). Foundational — sets schema shape. | (delegated) |
| Schema, granularity + module placement | Row granularity: one row per (run, renderer) vs one row per (run, renderer, round). `model`/`provider` columns from day one (Phase 34 will write routing decisions). Schema versioning (PRAGMA user_version vs explicit column; drop+recreate vs migrate). Module location: `src/regen/telemetry.ts` vs `src/telemetry/` vs `src/cost/`. | (delegated) |
| `handover cost` output + `--json` | Default lookback (last 10 runs? last 7 days?). Group by renderer or by run. Filters (`--renderer`, `--since-date`). `--json` mode with `formatVersion` for Phase 36 consumption (mirroring Phase 32 `--dry-run --json` precedent). Threshold warning UX — inline-during-generate post-write, on `handover cost`, or both. | (delegated) |
| Rotation trigger + cache-hit accounting | When does the 90d/100-runs rotation execute — every write, only on `handover cost` reads, or post-generate hook? Do fully-cached runs (cost ≈ 0) get a telemetry row (visibility) or get skipped (signal-to-noise)? Mixed runs: persist a per-round cache_hit boolean array on the renderer row? | (delegated) |

**User's choice:** *"i trust your verdict that you will cover everything with roboust and best practices solution"* — explicit blanket delegation across all four gray areas.

**Notes:** This is the same pattern as Phase 32 D-06 / D-07 / D-11 ("user trusted Claude's recommendation"). The user has signaled they prefer to delegate implementation specifics when the question is "best practice" rather than "personal preference". All decisions are therefore captured in CONTEXT.md `<decisions>` as locked Claude's Discretion calls. Planner/executor may revise within the spirit of these defaults if research surfaces a concrete reason, but the user is comfortable not relitigating them.

No follow-up turns were initiated — the user's response was a single blanket delegation that closed all four open areas.

---

## Claude's Discretion (carried into CONTEXT.md)

The user delegated all four areas. The locked decisions and where the planner has latitude to revise:

- **D-01** — three-table schema, `attributed_cost` view, no per-renderer cost column. Planner may revise the attribution math (proportional vs token-weighted) if research justifies it.
- **D-04 / D-05** — `TELEMETRY_VERSION = 1` + `PRAGMA user_version` + drop-and-recreate on mismatch (mirrors Phase 32 `GRAPH_VERSION` pattern).
- **D-06** — module location `src/regen/telemetry/` (smarter-regen track per Phase 32 D-20).
- **D-07** — ULID for `run_id`; hand-rolled vs npm `ulid` is planner's call.
- **D-08** — `--dry-run` writes no telemetry.
- **D-09 / D-10 / D-11** — `handover cost` two-section output, `--runs` / `--since-date` / `--renderer` / `--view` / `--json` flags; `formatVersion: 1` for Phase 36 contract.
- **D-13** — rotation runs inside every write's SQLite transaction.
- **D-14** — fully-cached runs ARE persisted (visibility argument).
- **D-15** — no FK constraints in v8.0.
- **D-17** — threshold warning sourced from the just-persisted `runs` row; in-memory fallback only on write failure.
- **D-19 / D-20 / D-21** — graceful degradation: telemetry failures never break `handover generate`; lazy DB open; `handover cost` exits 0 on missing DB.
- **D-23** — `os.tmpdir()` + UUID per test (memfs doesn't work with better-sqlite3 native bindings).

## Deferred Ideas (carried into CONTEXT.md `<deferred>`)

- Per-renderer `costWarningThreshold` map
- TELEM-06 trend-regression alerts (already deferred in REQUIREMENTS.md)
- Eval-run cost recording (Phase 35 owns)
- Cross-provider routing (ROUTE-08 already deferred)
- `handover cost --export <csv|tsv>`
- Sticky-PR cost-diff badge (Phase 36)
- ASCII time-series sparkline
- VS Code panel / web UI
- Per-round cache-ratio export
- OS-keychain protection of telemetry.db
