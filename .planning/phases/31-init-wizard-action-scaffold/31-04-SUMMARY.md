---
phase: 31-init-wizard-action-scaffold
plan: 04
subsystem: infra
tags: [github-action, composite, action-scaffold, marketplace, external-repo]

requires: []
provides:
  - External repo farce1/regenerate-docs with composite action.yml + ACTN-07 token input
  - Floating @v0 + pinned v0.1.0 tags so Phase 36 has a stable entry point
affects: [36-action-pr-preview-scheduled-refresh]

tech-stack:
  added:
    - "composite action.yml (handover/regenerate-docs)"
  patterns:
    - "Floating @v0 + pinned v0.1.0 tag pair (standard GitHub Action major-version convention)"
    - "actionlint CI lint job + composite smoke job pattern"

key-files:
  created: []
  modified: []

key-decisions:
  - "Namespace = farce1/regenerate-docs (Option B fallback). Reason: the GitHub org `HandOver` exists at id 29050075 (case-sensitive, owned by an unrelated party since 2017) and is not the project's own. Per CONTEXT.md D-23 Plan 04 explicitly authorizes a personal-namespace fallback. Phase 36 must transfer the repo to a `handover` org before Marketplace publication; early adopters using `farce1/regenerate-docs@v0` will need to update to `handover/regenerate-docs@v0` after the transfer (documented one-time breaking change for Phase 36)."
  - "Skipped Task 4 human-verify (no browser available in this session). All 13 acceptance grep gates pass via `gh api`. User must run the 5 browser checks before treating Plan 04 as fully closed."

patterns-established:
  - "Marketplace name-collision pre-check via gh api /marketplace/actions before repo create — guards against name-squat / accidental clobber"
  - "Tag commit-SHA equality check (annotated tags dereferenced to underlying commit) instead of raw ref SHA compare"

requirements-completed: [ACTN-07]

duration: 6min
completed: 2026-05-12
---

# Phase 31, Plan 04: Action Repo Scaffold Summary

**External repo farce1/regenerate-docs created with composite action.yml, MIT license, CI workflow, and example workflows — tagged v0.1.0 + floating v0 for Phase 36 inheritance**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-12T07:29Z
- **Completed:** 2026-05-12T07:35Z
- **Tasks:** 4 (1 decision checkpoint resolved by user, 2 autonomous, 1 human-verify deferred)
- **Files modified in handover repo:** 0 (this plan only writes to the external repo, `files_modified: []`)

## Accomplishments
- **Decision checkpoint** resolved: user picked Option B fallback namespace `farce1` after the `handover` org check returned an unrelated case-mismatch org owned by a different party
- **Marketplace name-collision check** ran (D-23) — PASS, slug `regenerate-docs` available in target namespace
- **Repo created:** https://github.com/farce1/regenerate-docs (public, MIT, description set)
- **5 scaffold files** committed in one feat commit (`4dfd4ed`):
  - `action.yml` — composite, `inputs.token` defaults to `${{ github.token }}`, branding `refresh-cw`/`blue`, Pitfall 6 dry-run suffix in place
  - `README.md` — preview banner + PAT requirement explanation
  - `.github/workflows/ci.yml` — actionlint job + composite smoke job
  - `examples/pr-preview.yml` — `on: pull_request` (no bare `on: push` per Out-of-Scope guardrail)
  - `examples/scheduled-refresh.yml` — `on: schedule` (Mondays 06:00 UTC cron)
- **LICENSE** (MIT) created by `gh repo create --license MIT` (untouched per plan)
- **Topics added:** `handover-action`, `handover`, `documentation`, `composite-action`
- **Tags:** `v0.1.0` (annotated, "Phase 31 scaffold release") + `v0` (floating, force-updated) both point to commit `4dfd4ed484da6707a4c60d18bfb3a7a24e1560e2`

## Task Commits

This plan does NOT commit to the handover repo. The relevant commit is in the external repo:

1. **Tasks 1-3 (decision + name-collision + repo scaffold)** — external commit `4dfd4ed` in farce1/regenerate-docs
2. **Plan SUMMARY** — handover repo commit (this file)

Note: `files_modified: []` is accurate for this plan.

## Acceptance Gates (all PASS)

| Gate | Result |
|------|--------|
| Repo exists | ✓ |
| action.yml has `using: 'composite'` | ✓ |
| action.yml has `default: '${{ github.token }}'` (ACTN-07) | ✓ (verified direct grep — earlier grep with `\${{` failed due to shell escaping, content is correct) |
| action.yml has `icon: 'refresh-cw'` | ✓ |
| action.yml has Pitfall 6 `|| echo "[v0] --dry-run not yet available..."` | ✓ |
| README has "Preview release" banner | ✓ |
| README documents `contents:write` PAT requirement | ✓ |
| ci.yml uses `rhysd/actionlint@v1` | ✓ |
| pr-preview.yml uses `on: pull_request` | ✓ |
| scheduled-refresh.yml uses `on: schedule` | ✓ |
| No bare `on: push` in either example | ✓ |
| Tags `v0.1.0` and `v0` exist and dereference to same commit (`4dfd4ed484da…`) | ✓ |

## Decisions Made
- **Fallback namespace `farce1/`** instead of `handover/` (CONTEXT.md D-24's preferred path). The `HandOver` org exists on GitHub but is unrelated to this project. Plan 04 Task 1 anticipated this exact fallback. Phase 36 owns the eventual transfer + Marketplace publish.
- **Tag SHA comparison** uses underlying commit SHA (via dereferencing the annotated tag object) rather than the tag-ref SHA. Annotated tags create their own object, so `v0.1.0` and `v0` will always have different ref SHAs even when pointing to the same commit. The plan's acceptance criterion (line 430) implies same SHA — interpreted as same target commit.
- **Skipped Task 4 (human-verify checkpoint)**: I cannot open URLs in a browser from this session. All automatable gates pass; the user is asked to complete the 5-step browser check (see "Open follow-up actions") before treating Plan 04 as fully closed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule: Decision checkpoint] Namespace dropped from `handover` to `farce1`**
- **Found during:** Task 1 (decision checkpoint)
- **Issue:** `handover` GitHub org does not belong to this project (case-mismatch with unrelated `HandOver` org from 2017).
- **Fix:** User selected the documented fallback (Option B). Recorded as `farce1/regenerate-docs`.
- **Files modified:** None in handover repo
- **Verification:** `gh repo view farce1/regenerate-docs` returns 200; the URL is recorded in this SUMMARY.
- **Committed in:** External repo only (`4dfd4ed`)

---

**Total deviations:** 1 user-resolved decision (not technically a deviation — the plan explicitly defined this as an authorized branch)
**Impact on plan:** Phase 36 inherits a `farce1/`-prefixed scaffold instead of `handover/`. Tag layout and action.yml content are byte-identical. One-time consumer migration documented as a Phase 36 prerequisite.

## Issues Encountered
None blocking. The `handover` GitHub org being case-collision-occupied was a documented possibility in the plan's decision options.

## User Setup Required
**Plan 04's Task 4 (human-verify) is still open.** Before treating this plan as fully closed, please run the 5 browser checks:

1. Open https://github.com/farce1/regenerate-docs — confirm description, topics, README banner.
2. Open https://github.com/farce1/regenerate-docs/blob/main/action.yml — visually confirm branding, token default, smoke-step suffix.
3. Open https://github.com/farce1/regenerate-docs/actions — confirm the first CI run's `lint` job is GREEN. The `smoke` job may be RED because `handover-cli` is not yet published to npm; that is the documented exception.
4. Open https://github.com/farce1/regenerate-docs/tags — confirm both `v0` and `v0.1.0` are present.
5. Open https://github.com/marketplace?type=actions&query=regenerate-docs — confirm the action is NOT yet listed (Phase 36 publishes).

If any check fails, describe the gap and the fix can land before Plan 05 wraps Wave 2.

## Next Phase Readiness
- **Phase 36** inherits a working scaffold with no setup tax — composite structure, token input (ACTN-07), branding, tags, MIT license, CI lint already in place.
- **Phase 36 transfer prerequisite:** repo must move from `farce1/` to `handover/` (or chosen org) before Marketplace publish (ACTN-05). One-time breaking change for `@v0` consumers.
- **Plan 05 (Wave 2)** is unblocked — it is parallel-safe with Plan 04 by design (`files_modified: []` here, separate files in Plan 05).

---
*Phase: 31-init-wizard-action-scaffold*
*Plan: 04*
*Completed: 2026-05-12*
