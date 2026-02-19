# Phase 11: AI Round Tests and Coverage Enforcement - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Test the AI round runner (executeRound, validateFileClaims, compressRoundOutput), renderer utilities (buildTable, codeRef, sectionIntro), and enforce the 80% CI coverage gate. Mock providers simulate LLM responses — no real API calls in tests.

</domain>

<decisions>
## Implementation Decisions

### Mock AI responses

- Shape-accurate typed mocks matching actual provider response interfaces — not minimal stubs, not full realistic payloads
- Mock tool_use responses include realistic field names (sections, signatures) but with minimal fixture data (1-2 items, not full documents)
- Reuse `createMockProvider()` factory from Phase 8 infrastructure — extend with scenario-specific return values per test
- Each test case controls its own mock return value — no shared mutable mock state between tests

### Coverage gate policy

- Global 80% threshold only — no per-file minimums (adds maintenance burden without proportional value)
- Exclude from coverage denominator: WASM files, type definition files (.d.ts), test files themselves, config/build files
- Threshold enforced in vitest.config.ts with `coverage.thresholds.global` — CI fails if coverage drops below 80%
- Coverage provider: v8 (already configured in Phase 8 infrastructure)

### Retry and error testing depth

- Cover all 3 specified paths: happy path (tool_use response), degraded (provider throw), retry with vi.useFakeTimers()
- Add timeout scenario: provider hangs past backoff window
- Test idempotency: same input produces same degraded result on repeated failures
- Assert error messages are actionable — not just "something went wrong"

### Renderer output format

- Exact string assertions for buildTable(), codeRef(), sectionIntro() — not snapshots (snapshots hide regressions)
- Test with edge cases: empty input, single row, special characters in content
- Markdown output must be valid — testable by checking structure (headers, code fences, table delimiters)

### Claude's Discretion

- Exact fixture data shapes and content values
- Test file organization within colocated pattern (src/\*_/_.test.ts)
- Whether to use test.each for parameterized renderer tests or individual test cases
- vi.useFakeTimers() advancement strategy (exact ms values)

</decisions>

<specifics>
## Specific Ideas

- User wants robust and reliable tests following industry best practices
- Prioritize test reliability over test count — fewer solid tests over many fragile ones
- Tests should catch real regressions, not just satisfy coverage numbers

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 11-ai-round-tests-and-coverage-enforcement_
_Context gathered: 2026-02-20_
