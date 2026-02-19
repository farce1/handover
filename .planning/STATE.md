# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.
**Current focus:** v3.0 Robustness — Phase 8 complete, ready for Phase 9

## Current Position

Phase: 8 of 11 (CI Fix and Test Infrastructure — COMPLETE)
Plan: 3 of 3 (Phase 8 complete — all plans done)
Status: In progress
Last activity: 2026-02-19 — Phase 8 Plan 03 complete (memfs + vitest-mock-extended installed, coverage exclusions configured, createMockProvider() factory created)

Progress: [██████████░░░░░░░░░░] 55% (10/18 plans complete across all milestones)

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

| Plan                             | Duration | Tasks   | Files    |
| -------------------------------- | -------- | ------- | -------- |
| Phase 04-cache-correctness P01   | 3 min    | 2 tasks | 2 files  |
| Phase 04-cache-correctness P02   | 2 min    | 1 tasks | 3 files  |
| Phase 05-ux-responsiveness P01   | 6 min    | 2 tasks | 16 files |
| Phase 05-ux-responsiveness P02   | 4 min    | 2 tasks | 6 files  |
| Phase 06-context-efficiency P01  | 3 min    | 2 tasks | 4 files  |
| Phase 06-context-efficiency P02  | 4 min    | 2 tasks | 6 files  |
| Phase 06-context-efficiency P03  | 4 min    | 2 tasks | 5 files  |
| Phase 07-cache-savings-fix P01   | 3 min    | 2 tasks | 6 files  |
| Phase 08-ci-fix P01              | 9 min    | 2 tasks | 9 files  |
| Phase 08-scorecard-hardening P02 | 7 min    | 2 tasks | 6 files  |
| Phase 08-test-infrastructure P03 | 2 min    | 2 tasks | 4 files  |

## Accumulated Context

### Decisions

All v1.0 and v2.0 decisions archived in PROJECT.md Key Decisions table.

**v3.0 decisions:**

- Mock at `LLMProvider` interface boundary — not at Anthropic/OpenAI SDK level. MSW/nock cannot intercept undici transport. (research SUMMARY.md)
- Use `memfs` (not `mock-fs`) — mock-fs is unmaintained, breaks WASM loading. (research SUMMARY.md)
- Tests colocated with source files (`src/**/*.test.ts`) — not in separate `tests/unit/` directory. (research SUMMARY.md)
- Cover the 80% threshold only after Phase 11 has a real test suite — enforcing it in Phase 8 would fail every CI run. (research SUMMARY.md)
- [Phase 08-01]: vitest --passWithNoTests added to test script so CI passes before test files exist (Phase 11)
- [Phase 08-01]: Zod v4 object .default() requires full value not empty object; fixed in config/schema.ts
- [Phase 08-01]: responseSchema in CompletionRequestSchema made optional - passed separately to provider.complete()
- [Phase 08-01]: zodToJsonSchema cast to any: zod-to-json-schema@3.x imports from zod/v3 compat layer
- [Phase 08-02]: dependabot/fetch-metadata v2 tag = v2.5.0 SHA 21025c705c08248db411dc16f3619e6b5f9ea21a
- [Phase 08-02]: Branch protection enforce_admins=false to prevent repo owner lockout
- [Phase 08-02]: release-please publish job needs contents: read alongside id-token: write
- [Phase 08-03]: vi.fn() must be cast via `as unknown as TypedFn` to satisfy generic interface signatures (complete<T> cannot be directly assigned from Mock<Procedure>)
- [Phase 08-03]: createMockProvider() complete() default return includes model and duration fields to satisfy CompletionResult schema (not just data + usage)
- [Phase 08-03]: Coverage thresholds omitted from vitest.config.ts — Phase 11 enforces 80% after real test suite exists

### Pending Todos

None.

### Blockers/Concerns

**Phase 8 flag (still open):** Before finalizing `makeAnthropicToolResponse()` and `makeOpenAIToolResponse()` mock factories, read `src/providers/anthropic.ts` and `src/providers/openai-compat.ts` to verify which response fields are actually consumed. Mock shape must match actual consumption, not just the SDK type definition.

**Phase 10 flag:** Confirm during execution whether `loadConfig()` uses `node:fs` or `node:fs/promises` for existence checks — determines correct `vi.spyOn` target.

External setup still required from v1.0:

- GitHub Sponsors enrollment (FUNDING.yml ready, account enrollment needed)
- npm trusted publishing OIDC config on npmjs.com
- RELEASE_PLEASE_TOKEN (GitHub fine-grained PAT) as repo secret
- CODECOV_TOKEN as repo secret

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 08-03-PLAN.md (memfs + vitest-mock-extended installed, coverage exclusions, createMockProvider() factory)
Resume file: .planning/phases/09-scorecard-tests/09-01-PLAN.md (Phase 9 — Scorecard unit tests)
