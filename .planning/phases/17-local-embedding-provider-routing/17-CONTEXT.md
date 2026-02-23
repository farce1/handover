# Phase 17: Local Embedding Provider Routing - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Let users choose local embedding execution for indexing and retrieval with predictable routing, fail-fast model/dimension validation, explicit locality modes, and clear health-check diagnostics.

</domain>

<decisions>
## Implementation Decisions

### Locality mode behavior
- Default mode is `local-preferred`.
- In `local-preferred`, if local embedding is unavailable, ask before falling back to remote.
- In `local-only`, fail with guidance (do not silently fallback).
- Mode selection supports persistent config plus per-run CLI override.

### Configuration experience
- Local embedding configuration is required only when mode is `local-only` or `local-preferred`.
- Default local endpoint assumes Ollama localhost.
- Local model must be explicitly set by the user (no auto-pick model behavior).
- Every run summary shows active embedding mode/provider.

### Validation and mismatch recovery
- Validate model/dimension compatibility before each embedding operation.
- Mismatch errors prioritize actionable fix steps.
- First suggested fix is reindex with the chosen model.
- Retrieval blocks on incompatible metadata until user fixes the mismatch.

### Health-check behavior
- Health checks run both automatically (before embedding operations) and explicitly (manual check path).
- Default check scope is connectivity plus model readiness.
- Failed checks return structured JSON output.
- Successful checks return a short normal-mode summary.

### Claude's Discretion
- Exact prompt copy for fallback confirmation in `local-preferred`.
- Exact JSON field names for failed health-check output, as long as they remain structured and actionable.
- Exact placement/formatting of run-summary mode/provider display in existing command outputs.

</decisions>

<specifics>
## Specific Ideas

- Keep local embedding routing explicit and user-controlled rather than implicit/automatic.
- Prefer visible, deterministic behavior over silent fallback.
- Use remediation-first messaging for mismatch failures.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 17-local-embedding-provider-routing*
*Context gathered: 2026-02-23*
