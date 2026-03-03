# Phase 27: Test Coverage & Infrastructure - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Raise the CI coverage gate from the currently-failing 80% to a verified 90%+ (85% branches). Write new test suites for six untested/under-tested modules. Freeze the vitest coverage exclusion list with written justifications per entry. Ensure json-summary reporter and GitHub Actions coverage comment reflect the new thresholds.

</domain>

<decisions>
## Implementation Decisions

### Test design philosophy
- Unit-focused with real outputs: isolate units with mocks, but always assert on actual return values/output — not just that mocks were called
- Every test must verify what the code *produces*, not only what it *calls*

### Test file organization
- Match the existing project convention — do not introduce a new pattern
- Follow whatever colocated/mirror structure the codebase already uses

### Assertion style
- Use inline snapshots for large/complex outputs (rendered markdown, packed context, serialized structures)
- Use explicit value assertions for simple/scalar values
- Snapshots serve as living documentation of expected output shapes

### Claude's Discretion
- Mock depth per module — choose shallow mocks vs boundary mocks based on what's practical for each target (auth, mcp/tools, etc.)
- Exclusion documentation format and level of detail per entry
- CI coverage reporting — PR comment format and failure presentation
- Threshold progression strategy — how to validate and gate each batch step (80→85→88→90)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 27-test-coverage-infrastructure*
*Context gathered: 2026-03-01*
