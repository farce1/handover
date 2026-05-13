# Phase 32: Source→Doc Dependency Graph - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 32-source-doc-dependency-graph
**Areas discussed:** Graph construction, Skip scope, Infrastructure exclusion, --dry-run output

---

## Graph construction

### Q1 — How should the source→renderer dependency map be built?

| Option | Description | Selected |
|--------|-------------|----------|
| Curated static map (Recommended) | Each renderer declares its source-glob deps explicitly alongside `requiredRounds`. Predictable, easy to reason about, fast to ship. | ✓ |
| Runtime provenance | Analyzers/rounds emit which files contributed; graph emerges from observed reads. Self-updating. First run produces no graph. | |
| Hybrid (curated baseline + runtime confirmation) | Curated baseline + runtime refinement; under-approximation: union of both. More accuracy long-term. | |

**User's choice:** Curated static map.
**Notes:** Maintenance burden accepted; planner ensures the engineer editing a renderer also updates its `requiredSources`.

### Q2 — Where should the per-renderer source dependencies live in code?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline on DocumentSpec (Recommended) | New `requiredSources: string[]` field on DocumentSpec; populated per entry in DOCUMENT_REGISTRY. Co-located with the renderer. | ✓ |
| Separate `dep-graph-spec.ts` module | All mappings in one source-of-truth file. Easy whole-map audit; drift risk. | |
| `.handover.yml` user-overridable | Default map in code; user can override. Maximum flexibility; pushes surface to users. | |

**User's choice:** Inline on DocumentSpec.

### Q3 — How should the graph handle source files that no renderer claims?

| Option | Description | Selected |
|--------|-------------|----------|
| Conservative: unclaimed = full regen (Recommended) | Unmatched changed file → run all 14 renderers. False positives over false negatives. | ✓ |
| Optimistic: unclaimed = ignored | Unclaimed file triggers nothing. Max savings; risk of silently stale docs. | |
| Warn-and-fallback | Unclaimed logs a warning AND falls back to full regen. Surfaces curation drift. | |

**User's choice:** Conservative.

### Q4 — What should the persisted graph file contain — the curated spec, computed graph, or both?

| Option | Description | Selected |
|--------|-------------|----------|
| Computed graph only (Recommended) | Cache stores expanded file-list per renderer; curated globs are source-of-truth in code. Fast lookup. | ✓ |
| Curated spec only (no expansion) | Cache stores glob patterns; expansion every `--since`. Smaller file; re-glob cost. | |
| Both: spec + expanded graph | Cache contains both with fingerprint. Detects drift; bigger file; more invalidation. | |

**User's choice:** Computed graph only.

---

## Skip scope

### Q1 — Should `--since` skip AI rounds when no downstream renderer needs them, or only skip renderers?

| Option | Description | Selected |
|--------|-------------|----------|
| Renderers only — always run all 6 rounds (Recommended) | Rounds 1–6 always execute on `--since`; only renderers gated by dep-graph. Simpler. | ✓ |
| Renderers + rounds (transitive) | Skip rounds whose downstream renderers all skipped. Bigger LLM win; complexity in compressed-round chain. | |
| Two-tier: renderers always, rounds opportunistic on cache hit | Round skipping only when round-cache already valid. Conservative middle ground. | |

**User's choice:** Renderers only.
**Notes:** Round skipping deferred (see Deferred Ideas in CONTEXT.md) — trigger to revisit is telemetry from Phase 33.

### Q2 — If a renderer is skipped, what happens to its existing output file in `./handover/`?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave in place, mark as 'reused' in INDEX (Recommended) | Skipped renderer's output file stays; INDEX shows `reused` status. New variant of DocumentStatus. | ✓ |
| Rewrite idempotently | Re-write same content. Simpler mental model; I/O cost. | |
| Delete on skip | Removes file. Forces full re-run for next read. Wrong UX. | |

**User's choice:** Leave in place + `'reused'` status.

### Q3 — How should the dep-graph cache get rebuilt over time?

| Option | Description | Selected |
|--------|-------------|----------|
| Rebuild on every full run (no --since) (Recommended) | Full `handover generate` writes the cache; `--since` reads only. | ✓ |
| Lazy: first --since builds, refresh on graphVersion bump | First `--since` builds; subsequent reads cache; only version change rebuilds. | |
| Explicit `handover refresh-graph` subcommand | User-triggered rebuild. Predictable; extra ceremony. | |

**User's choice:** Trusted Claude recommendation → Rebuild on every full run.

### Q4 — What's the `graphVersion` bump policy — manual integer or auto from a code fingerprint?

| Option | Description | Selected |
|--------|-------------|----------|
| Manual integer constant (Recommended) | `GRAPH_VERSION = 1`, bumped explicitly on schema change. Mirrors `CACHE_VERSION`. Reviewer-friendly. | ✓ |
| Auto hash of (DOCUMENT_REGISTRY + glob spec) | Content hash invalidates on any spec edit. Auto but harder to debug. | |
| Both: manual + specFingerprint | Manual for schema, fingerprint for spec drift. More control; more code. | |

**User's choice:** Trusted Claude recommendation → Manual integer constant.

---

## Infrastructure exclusion

### Q1 — How should 'infrastructure files' be excluded from source nodes?

| Option | Description | Selected |
|--------|-------------|----------|
| Curated explicit list (Recommended) | `INFRASTRUCTURE_PATHS` array; graph builder filters source nodes against it. Predictable, directly testable. | ✓ |
| Heuristic: high fan-in (imported by >N files) | Reverse-import count threshold. Auto-detects; misclassifies legitimate hubs. | |
| Hybrid: curated + `.handover.yml` opt-in | Curated default + user-extensible. Schema churn for unproven need. | |

**User's choice:** Trusted Claude recommendation → Curated explicit list.

### Q2 — Where should the infrastructure exclusion list live?

| Option | Description | Selected |
|--------|-------------|----------|
| Co-located with graph builder (Recommended) | `INFRASTRUCTURE_PATHS` exported from the new dep-graph module. Reviewer sees curated map + exclusion together. | ✓ |
| In a separate constants file under `src/config/` | Lives next to `defaults.ts`. The list is internal/structural, not user-facing config. | |
| Inline negation in each renderer's `requiredSources` | Per-renderer negations like `!src/utils/logger.ts`. Tedious; 14 duplications. | |

**User's choice:** Co-located with graph builder.

### Q3 — What's the initial seed list for infrastructure files in handover's codebase?

| Option | Description | Selected |
|--------|-------------|----------|
| Tight seed: utils + config + types only (Recommended) | `src/utils/**`, `src/config/{loader,defaults,schema}.ts`, `src/domain/types.ts`, `src/domain/entities.ts`, `**/types.ts`. Conservative. | ✓ |
| Wide seed: + parsing primitives + context utils | Adds `src/parsing/utils/**`, `src/context/token-counter.ts`. More aggressive; risk of false negatives. | |
| Just `src/utils/**` to start | Minimal; provably correct against success criterion #4. Under-aggressive on real infra like `defaults.ts`. | |

**User's choice:** Tight seed.

### Q4 — Should there be an escape hatch when a file is excluded as infrastructure but the user wants to force a regen?

| Option | Description | Selected |
|--------|-------------|----------|
| No flag — run without `--since` for full regen (Recommended) | Keeps surface narrow. Escape hatch already exists at workflow level. | ✓ |
| `--force-regen <renderer>` flag | Targeted opt-out. New flag surface to test/document. | |
| Both: no flag now, add later if asked | Defer to follow-up. Captures the idea without scope-creeping. | |

**User's choice:** No flag.
**Notes:** `--force-regen` captured as Deferred Idea.

---

## --dry-run output

### Q1 — What should `handover generate --dry-run` print by default?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-renderer list with one-line reason (Recommended) | Grouped `Would execute` / `Would skip` with `← changed_file` reasons. Scannable. Matches success criterion #2. | ✓ |
| Rich grouped summary with cost estimate | Adds tokens/cost-saved/would-skip ratio. Imprecise estimate invites bug reports. | |
| Minimal: just renderer names | Spartan; pipeable; loses the "why". | |

**User's choice:** Per-renderer list with one-line reason.

### Q2 — Should `--dry-run` also support a machine-readable JSON mode for Phase 36's GitHub Action?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — `--dry-run --json` emits structured output (Recommended) | JSON with `formatVersion`, `wouldExecute[]`, `wouldSkip[]`, `graphVersion`. Stable contract for Phase 36. | ✓ |
| Not yet — Phase 36 can parse the text output | Defer JSON. Text becomes an implicit API. | |
| Yes, but keep experimental | Ship without stability commitment. Worse than option 2. | |

**User's choice:** Yes — ship `--json` mode with `formatVersion`.

### Q3 — What should `--dry-run` do when invoked WITHOUT `--since`?

| Option | Description | Selected |
|--------|-------------|----------|
| Print 'all 14 would execute, no source filter applied' (Recommended) | Lists full set with note. Useful for previewing `--only` selections. Zero LLM calls. | ✓ |
| Refuse: error 'use --since for filtered preview' | Force pairing with `--since`. Less useful with `--only`. | |
| Same as option 1 with louder annotation | Marginal difference. | |

**User's choice:** Print full set with note.

### Q4 — How should `--dry-run` interact with `--only` (selective renderers) and `--since`?

| Option | Description | Selected |
|--------|-------------|----------|
| Intersect: `--only` first, then `--since` filters within (Recommended) | Predictable composition. `--only` narrows; `--since` filters. | ✓ |
| Union: `--only` overrides `--since` | `--only` forces run regardless of dep-graph. Conflicts with success criterion #1 wording. | |
| Error: `--only` and `--since` mutually exclusive | Refuse the combination. Blocks useful PR-preview workflows. | |

**User's choice:** Intersect.

---

## Claude's Discretion

The user explicitly delegated three decisions to Claude with "i trust your recommendation, that you will bring best practices and robust solution":

- **Skip-scope Q3:** Cache rebuild trigger → locked in **Rebuild on every full run**.
- **Skip-scope Q4:** `graphVersion` policy → locked in **Manual integer constant** (mirrors `CACHE_VERSION` in `src/cache/round-cache.ts:18`).
- **Infrastructure Q1:** Exclusion mechanism → locked in **Curated explicit list** (mirrors Phase 31's "explicit > clever" pattern).

Additional Claude-discretion items (planner/executor latitude, no user input expected):
- Exact new module path (`src/regen/dep-graph.ts` vs `src/cache/dep-graph.ts` vs `src/orchestrator/dep-graph.ts`)
- Exact field names inside `dep-graph.json` and `--dry-run --json` output beyond the sketched shape
- Whether graph builder runs in parallel with static analysis or as serial post-step
- `--dry-run` color/formatting in TTY mode (follow existing `src/ui/` conventions)
- Renderer self-reference helper vs explicit-per-entry path inclusion in `requiredSources`

---

## Deferred Ideas

- Round skipping under `--since` (likely v8.x post-telemetry)
- `--force-regen <renderer>` flag (if user feedback requests it)
- User-overridable `.handover.yml` infrastructure list (post-v8.0 if library scenario emerges)
- Estimated cost / token savings in `--dry-run` (after Phase 33 telemetry baseline)
- Runtime provenance refinement of the curated graph (if curated drift becomes painful)
