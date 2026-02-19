# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.
**Current focus:** v3.0 Robustness — Phase 10 in progress (Plan 2 complete)

## Current Position

Phase: 10 of 11 (Algorithm and Validation Tests — In Progress)
Plan: 2 of N (Phase 10 Plan 02 complete — DAGOrchestrator and TokenUsageTracker unit tests)
Status: In progress
Last activity: 2026-02-19 — Phase 10 Plan 02 complete (45 unit tests: 21 DAGOrchestrator + 24 TokenUsageTracker)

Progress: [███████████░░░░░░░░░] 61% (13/18 plans complete across all milestones)

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
| Phase 09-code-hardening P01      | 3 min    | 2 tasks | 10 files |
| Phase 09-pure-function-tests P02 | 3 min    | 2 tasks | 3 files  |
| Phase 09-pure-function-tests P03 | 5 min    | 2 tasks | 3 files  |
| Phase 10-algorithm-tests P02     | 3 min    | 2 tasks | 2 files  |

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
- [Phase 09-01]: SCORE\_\* constants exported (not private) so unit tests can import them without special access
- [Phase 09-01]: logger.debug() in recoverable catch blocks — verbose-only, not shown in normal output
- [Phase 09-01]: resolveSelectedDocs() moved before validateProviderConfig() in generate.ts — pure function, no env/API deps (HARD-03)
- [Phase 09-01]: Stale plan 02-02 pending comments in parsing/index.ts replaced with accurate rationale about unsupported file type handling
- [Phase 09]: buildMockAnalysis() factory kept local to scorer.test.ts (not shared)
- [Phase 09-02]: LLMProvider mock cast via as unknown as LLMProvider to satisfy ESLint no-explicit-any
- [Phase 09-02]: SCORE_TEST_PENALTY used in assertion via Math.max(SCORE_MIN, 0 - SCORE_TEST_PENALTY) to satisfy no-unused-vars
- [Phase 09]: computeRequiredRounds expansion is one-level (ROUND_DEPS pre-expresses transitive deps)
- [Phase 09]: HandoverError.fix field contains 'Valid aliases' text - tested via caught error inspection
- [Phase 10-02]: New DAGOrchestrator instance per test — stateful steps Map would pollute tests if reused
- [Phase 10-02]: Diamond/fan-out parallel ordering not asserted — JS Promise resolution is non-deterministic
- [Phase 10-02]: Large budgetTokens in cost tests suppress logger.warn stdout noise (acceptable)

### Pending Todos

None.

### Blockers/Concerns

**Phase 8 flag (still open):** Before finalizing `makeAnthropicToolResponse()` and `makeOpenAIToolResponse()` mock factories, read `src/providers/anthropic.ts` and `src/providers/openai-compat.ts` to verify which response fields are actually consumed. Mock shape must match actual consumption, not just the SDK type definition.

**Phase 10 flag:** Confirm during execution whether `loadConfig()` uses `node:fs` or `node:fs/promises` for existence checks — determines correct `vi.spyOn` target. (Phase 10-02 did not require loadConfig tests; flag remains for remaining Phase 10 plans.)

External setup still required from v1.0:

- GitHub Sponsors enrollment (FUNDING.yml ready, account enrollment needed)
- npm trusted publishing OIDC config on npmjs.com
- RELEASE_PLEASE_TOKEN (GitHub fine-grained PAT) as repo secret
- CODECOV_TOKEN as repo secret

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 10-02-PLAN.md (DAGOrchestrator + TokenUsageTracker unit tests — 45 tests, 131 total)
Resume file: .planning/phases/10-algorithm-and-validation-tests/ (next plan in Phase 10)
