# Phase 9: Code Hardening and Pure Function Tests - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract scoring constants into named exports, audit all catch blocks for silent error swallowing, reorder CLI validation so `--only` alias errors fire before API key prompts, and write unit tests for all pure functions: `scoreFiles()`, `computeTokenBudget()`, `estimateTokens()`, `resolveSelectedDocs()`, `computeRequiredRounds()`, `HandoverConfigSchema`, and `createStep()`.

</domain>

<decisions>
## Implementation Decisions

### Scoring weight exposure

- Named constants exported with `as const` — internal API only, not user-configurable
- Co-located in the scorer module (not a separate shared constants file) — keeps coupling local
- Group related weights together (e.g., file scoring weights, tier thresholds) with descriptive names
- Document the scoring model in code comments for contributor clarity, not user docs

### Catch block policy

- Every catch block gets one of three treatments:
  1. `logger.debug()` if the error is expected/recoverable (e.g., file not found, optional feature missing)
  2. Explanatory comment if truly intentional silent behavior with a clear reason why
  3. Re-throw or `logger.warn()` if the error indicates a real problem that shouldn't be swallowed
- No bare empty catches — zero tolerance for undocumented silent swallows
- Differentiate "expected failure" from "lazy error handling" — the audit tags each catch with its rationale

### CLI validation UX

- Validate in order of user control: cheapest/most-actionable check first
- `--only` unknown alias → fail immediately with actionable error listing valid aliases, before any API key check
- Error messages should name the invalid input and suggest the fix (e.g., "Unknown doc alias 'foo'. Valid aliases: readme, architecture, ...")
- No prompt for API key if the command will fail anyway due to bad flags

### Test organization and style

- Table-driven tests with `test.each` for functions with combinatorial inputs (scoring, token budgets)
- Explicit assertions over snapshots — tests document expected behavior, not implementation output
- Test names describe the business behavior, not the code path (e.g., "returns zero score for empty file" not "handles edge case")
- Cover boundary conditions systematically: zero values, single items, max capacity, empty inputs, malformed inputs
- Each test file co-located with source (e.g., `scorer.test.ts` next to `scorer.ts`)

### Claude's Discretion

- Exact constant naming conventions (UPPER_SNAKE vs camelCase with `as const`)
- Whether to split scorer constants into sub-groups or keep flat
- Logger.debug message format and verbosity level
- Test helper extraction — when shared setup warrants a helper vs inline
- Exact boundary values to test (specific numbers for budget thresholds, etc.)

</decisions>

<specifics>
## Specific Ideas

- User wants industry-standard robust practices — prioritize correctness and maintainability over speed
- Take time for best judgment on each decision — quality over quantity
- All decisions should follow established patterns in well-maintained open source projects

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 09-code-hardening-and-pure-function-tests_
_Context gathered: 2026-02-19_
