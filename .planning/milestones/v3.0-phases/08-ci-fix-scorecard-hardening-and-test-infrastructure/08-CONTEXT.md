# Phase 8: CI Fix, Scorecard Hardening, and Test Infrastructure - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the CI error on main, merge all open Dependabot PRs, maximize the OpenSSF Scorecard (pin actions, workflow permissions, branch protection), and establish test infrastructure (vitest config, mock factories, coverage tooling). No actual test files are written in this phase — only the foundation.

</domain>

<decisions>
## Implementation Decisions

### Branch protection policy

- 1 required reviewer before merging to main
- Dismiss stale reviews when new commits are pushed
- Required status checks: CI (build + test) and typecheck must pass
- Open to external contributors — proper review gates in place

### CODEOWNERS setup

- Single global owner: `* @farce1`
- Explicit `.github/` rule: `.github/ @farce1` — Scorecard likes explicit CI file ownership
- Two lines total in CODEOWNERS

### Dependency version policy

- Merge all 5 Dependabot PRs at once (batch merge, CI catches breakage)
- Pin exact versions for 0.x dependencies (e.g., `"0.5.3"` not `"~0.5.0"`)
- Stable (1.x+) deps: auto-merge policy at Claude's discretion

### Coverage configuration

- No coverage threshold enforced in Phase 8 — infrastructure only, Phase 11 enforces 80%
- No fixture directories expected — tests will use inline data
- WASM files excluded from coverage denominator
- Additional exclusions (config files, types, CLI entry) at Claude's discretion

### Claude's Discretion

- Auto-merge configuration for stable dependency patches
- Coverage exclusion list beyond WASM (config files, type definitions, entry points)
- Mock factory internal design and patterns
- Vitest configuration details

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

_Phase: 08-ci-fix-scorecard-hardening-and-test-infrastructure_
_Context gathered: 2026-02-19_
