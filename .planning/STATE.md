# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.
**Current focus:** v3.0 Robustness — Phase 8: CI Fix and Test Infrastructure

## Current Position

Phase: 8 of 11 (CI Fix and Test Infrastructure)
Plan: — (ready to plan)
Status: Ready to plan
Last activity: 2026-02-19 — Roadmap created for v3.0 Robustness milestone

Progress: [████████░░░░░░░░░░░░] 39% (7/18 plans complete across all milestones)

## Performance Metrics

**v1.0 Velocity:**

- Total plans completed: 9
- Average duration: ~5 min/plan
- Total execution time: ~0.7 hours
- Timeline: 3 days (2026-02-16 to 2026-02-18)

**v2.0 Velocity:**

- Total plans completed: 8
- Average duration: ~3.6 min/plan
- Total execution time: ~29 min
- Timeline: 2 days (2026-02-18 to 2026-02-19)

**By Phase (v2.0):**

| Plan                            | Duration | Tasks   | Files    |
| ------------------------------- | -------- | ------- | -------- |
| Phase 04-cache-correctness P01  | 3 min    | 2 tasks | 2 files  |
| Phase 04-cache-correctness P02  | 2 min    | 1 tasks | 3 files  |
| Phase 05-ux-responsiveness P01  | 6 min    | 2 tasks | 16 files |
| Phase 05-ux-responsiveness P02  | 4 min    | 2 tasks | 6 files  |
| Phase 06-context-efficiency P01 | 3 min    | 2 tasks | 4 files  |
| Phase 06-context-efficiency P02 | 4 min    | 2 tasks | 6 files  |
| Phase 06-context-efficiency P03 | 4 min    | 2 tasks | 5 files  |
| Phase 07-cache-savings-fix P01  | 3 min    | 2 tasks | 6 files  |

## Accumulated Context

### Decisions

All v1.0 and v2.0 decisions archived in PROJECT.md Key Decisions table.

**v3.0 decisions:**

- Mock at `LLMProvider` interface boundary — not at Anthropic/OpenAI SDK level. MSW/nock cannot intercept undici transport. (research SUMMARY.md)
- Use `memfs` (not `mock-fs`) — mock-fs is unmaintained, breaks WASM loading. (research SUMMARY.md)
- Tests colocated with source files (`src/**/*.test.ts`) — not in separate `tests/unit/` directory. (research SUMMARY.md)
- Cover the 80% threshold only after Phase 11 has a real test suite — enforcing it in Phase 8 would fail every CI run. (research SUMMARY.md)

### Pending Todos

None.

### Blockers/Concerns

**Phase 8 flag:** Before finalizing `makeAnthropicToolResponse()` and `makeOpenAIToolResponse()` mock factories, read `src/providers/anthropic.ts` and `src/providers/openai-compat.ts` to verify which response fields are actually consumed. Mock shape must match actual consumption, not just the SDK type definition.

**Phase 10 flag:** Confirm during execution whether `loadConfig()` uses `node:fs` or `node:fs/promises` for existence checks — determines correct `vi.spyOn` target.

External setup still required from v1.0:

- GitHub Sponsors enrollment (FUNDING.yml ready, account enrollment needed)
- npm trusted publishing OIDC config on npmjs.com
- RELEASE_PLEASE_TOKEN (GitHub fine-grained PAT) as repo secret
- CODECOV_TOKEN as repo secret

## Session Continuity

Last session: 2026-02-19
Stopped at: Phase 8 context gathered
Resume file: .planning/phases/08-ci-fix-scorecard-hardening-and-test-infrastructure/08-CONTEXT.md
