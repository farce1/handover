---
gsd_state_version: 1.0
milestone: v8.0
milestone_name: Distribution & Smarter Regen
status: executing
stopped_at: Phase 31 Wave 1 complete — Plan 04 external repo scaffold landed (farce1/regenerate-docs), Wave 2 next
last_updated: "2026-05-12T07:35:30Z"
last_activity: 2026-05-12 -- Phase 31 Plan 04 complete (external repo + v0.1.0 + v0 tags)
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 5
  completed_plans: 4
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.
**Current focus:** v8.0 roadmap created — 6 phases (31-36), 37 requirements mapped; Phase 31 fully planned (5 plans across 3 waves)

## Current Position

Phase: Phase 31 — Init Wizard Upgrade + Action Scaffolding (executing)
Plan: 31-05 (Wave 2 — wire runInit + register --upgrade + bump @clack/prompts)
Status: Wave 1 complete (Plans 02 + 03 + 04 all done); Wave 2 ready
Last activity: 2026-05-12 -- Phase 31 Plan 04 complete (external repo farce1/regenerate-docs scaffolded, v0.1.0 + v0 tags published)

## Performance Metrics

**v6.0 Velocity:**

- Total plans completed: 13
- Average duration: ~8.5 min/plan (includes human validation checkpoints)
- Total execution time: ~110 min

**v7.0 Velocity:**

- Total plans completed: 14
- Average duration: ~8.5 min/plan
- Total execution time: ~119 min

## Accumulated Context

### Decisions

Decisions from v7.0 are archived in .planning/milestones/v7.0-ROADMAP.md and .planning/PROJECT.md Key Decisions table.

**v8.0 Roadmap Decisions:**

- ACTN-07 (token input for protected branches) placed in Phase 31 (scaffold) because it is an input parameter definition that must be present in action.yml from day one, not runtime behavior
- ACTN-01..06 (both operational modes, upsert pattern, cost footer, Marketplace publish, example workflows) placed in Phase 36 (complete) because they depend on the fully instrumented CLI
- Phase 31 and Phase 32 are independent and may be executed in parallel (both start from stable v7.0 codebase)
- Telemetry (Phase 33) precedes routing (Phase 34) because routing records must flow into telemetry; telemetry must be the stable write target
- Eval (Phase 35) is last among CLI features: benefits from telemetry and routing being stable; most design-heavy scope; uses telemetry to track eval run costs
- Action (Phase 36) is last overall: wraps fully instrumented CLI; repo scaffold from Phase 31 means action development is not blocked on Phases 32-35

**Phase 31 Planning Decisions (2026-05-12):**

- 5-plan cut across 3 waves: Wave 0 (Plan 01 test scaffold) → Wave 1 (Plans 02 init-detectors module, 03 monorepo extension, 04 action repo scaffold — all parallel) → Wave 2 (Plan 05 wiring)
- Codex subscription cost rank locked at `0.001` per RESEARCH.md Open Q1 — sits between Ollama (0) and metered providers (>= 0.28)
- `monorepo.test.ts` lives in Plan 03 (paired with the source change) rather than Plan 01 Wave 0, because monorepo.ts is in the coverage exclude list and the test is regression-pair-style not RED-target-style
- Plan 04 (action repo) has `files_modified: []` because it touches an external repo only — fully parallel-safe with Plans 02/03

### Pending Todos

- Phase 35 (Eval Harness) should begin with a rubric design research task before writing `src/eval/rubric-v1.md` — completeness/navigability/code-accuracy criteria need explicit specification
- Phase 34 first task: classify `modelHint` for all 14 renderers before implementing routing
- Before Phase 36 Marketplace publish: verify `handover/regenerate-docs` name is not already listed via `gh api /marketplace/actions` (Plan 31-04 Task 2 performs this check at scaffold time too)
- Clarify in Phase 31 implementation that `patchGitignore()` should add `.handover/telemetry.db` (not `.handover/telemetry.jsonl` or `.handover/telemetry/` — superseded paths from earlier research) — RESOLVED in Plan 02 interfaces block

### Blockers/Concerns

None.

External setup still required (unchanged from v5.0):

- GitHub Sponsors enrollment
- npm trusted publishing OIDC config
- RELEASE_PLEASE_TOKEN repo secret
- CODECOV_TOKEN repo secret

Additional for Phase 31:

- `handover` GitHub org membership (Plan 04 Task 1 decision checkpoint resolves this — fallback to personal namespace if org does not exist)
- `gh` CLI authenticated with `repo` + `workflow` scopes (Plan 04 prerequisite)

## Session Continuity

Last session: 2026-05-12
Stopped at: Phase 31 Wave 1 complete — Wave 2 next
Resume with: /gsd-execute-phase 31
Resume file: .planning/phases/31-init-wizard-action-scaffold/31-05-PLAN.md
Open checkpoints:
- Plan 04 Task 4 (human-verify) — user to run 5 browser checks against https://github.com/farce1/regenerate-docs (see 31-04-SUMMARY.md)
- Phase 36 prerequisite: transfer farce1/regenerate-docs → handover/ org before Marketplace publish
