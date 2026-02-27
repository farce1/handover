# Phase 25: Security Hardening - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Ensure no credential data leaks through npm publish, debug logs, or documentation gaps. Covers SEC-01 (publish safety), SEC-02 (log redaction), and SEC-03 (Anthropic restriction documentation). No new features or capabilities — this is a hardening pass on existing auth infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Publish safety mechanism
- Use `files` allowlist in package.json as the primary safeguard — anything not explicitly listed is excluded
- Scope limited to credential paths (credentials.json, auth token files) — not a full repo audit
- `npm pack --dry-run` verification runs in CI on every PR, not just releases
- Hard fail: PR cannot merge if credential paths are detected in the package contents

### Documentation tone
- Factual and brief — no editorializing about Anthropic's policies
- "Anthropic requires API key authentication. OAuth/subscription auth is not supported."

### Claude's Discretion
- **Log redaction approach**: Whether to use point-of-use audit, centralized filter, or both — based on existing logging architecture
- **Log content format**: Method name only vs method + masked token — pick the safest approach that still enables debugging
- **Log level audit scope**: Which levels to audit for token leaks — based on codebase logging patterns
- **Log redaction testing**: Whether to add automated tests for log output cleanliness
- **Documentation placement**: Where in the project docs to place the Anthropic restriction note — based on existing doc structure
- **Documentation scope**: Whether to document all providers' auth methods or just the Anthropic restriction
- **CLI guard for Anthropic + subscription**: Whether a runtime guard is needed based on current auth flow
- **CI job structure**: New dedicated job vs step in existing workflow — based on current CI structure
- **CI scan patterns**: What patterns to check for (credential paths only vs token patterns in file contents)
- **CI log redaction enforcement**: Whether to add CI-enforced log redaction tests
- **CI reporting**: Pass/fail only vs PR comment with details — based on current CI patterns

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The success criteria from ROADMAP.md are the binding constraints:
1. `npm pack --dry-run` confirms no credential paths in published package
2. Debug/info logs never contain token values — only auth method names
3. Provider setup docs state Anthropic requires API key auth

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 25-security-hardening*
*Context gathered: 2026-02-28*
