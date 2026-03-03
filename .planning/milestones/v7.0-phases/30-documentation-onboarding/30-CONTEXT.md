# Phase 30: Documentation & Onboarding - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Write user-facing and contributor-facing documentation for features shipped in Phases 27-29 (search, incremental regen, coverage), harden `handover init` for non-interactive environments, and add broken-link CI validation. No new CLI features beyond the `--yes` flag and TTY guard on init.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User deferred all implementation decisions to Claude. The following areas are open for best-judgment choices during research and planning:

**Doc structure & tone:**
- Page depth (quick-start vs comprehensive) for search.md, regeneration.md, testing.md
- Code example density and inline vs linked examples
- Cross-linking strategy between user/contributor sections
- Match existing doc tone from getting-started.md and configuration.md

**Sidebar & navigation:**
- New user guide pages (`search.md`, `regeneration.md`) slot into existing "User Guides" sidebar group
- New contributor page (`testing.md`) slots into existing "Contributor docs" sidebar group
- Ordering within groups — place after existing entries or interleave logically

**`handover init` TTY guard behavior:**
- Detection method for non-TTY (e.g., `process.stdout.isTTY`)
- Messaging when non-TTY detected without `--yes` flag
- How silent `--yes` mode is (fully silent vs summary output)
- Overwrite detection: current code already checks `existsSync('.handover.yml')` — extend for `--yes` mode

**Contributor testing guide scope:**
- Document `createMockProvider()`, `memfs` setup, coverage exclusion rationale
- Depth of testing philosophy vs just the practical patterns
- Whether to include example test snippets from actual test files

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow existing doc conventions visible in `docs/src/content/docs/user/getting-started.md` and `docs/astro.config.mjs`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 30-documentation-onboarding*
*Context gathered: 2026-03-02*
