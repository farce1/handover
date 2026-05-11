# Phase 31: Init Wizard Upgrade + Action Scaffolding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 31-init-wizard-action-scaffold
**Areas discussed:** Provider precedence, Monorepo scope handling, --upgrade contract, Action scaffold behavior
**Discussion style:** User delegated all decisions to Claude with instruction "answer questions yourself. best practices only." All four areas resolved by Claude using research SUMMARY.md, REQUIREMENTS.md, and best-practice analysis.

---

## Area 1 — Provider precedence (INIT-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-select cheapest detected; show all providers with `(detected)` suffix | Cheapest-cost provider is the safe default; full list preserves explicit user choice | ✓ |
| Pre-select most-capable detected (Anthropic > OpenAI > Gemini) | Optimizes for output quality | |
| Auto-skip provider prompt when only one is detected | Fewest keystrokes; assumes detection is correct | |
| Pre-select in env-var declaration order | Honors user's environment hygiene | |

**Claude's choice:** Cheapest-detected pre-selection in BOTH interactive and `--yes` (consistency); show ALL providers always (explicit confirmation respects user intent).
**Rationale:** Research SUMMARY.md pitfall #1 calls out "provider detection picks expensive model with multiple keys" as a real risk. Cheapest-detected mirrors the policy already locked for `--yes`. Showing all providers (not auto-skipping) protects users who have keys for other tools and don't want handover consuming their Anthropic quota silently. Codex subscription is preferred over an OpenAI API key when both exist because the subscription is already flat-rate.

---

## Area 2 — Monorepo scope handling (INIT-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Detection-only: record root + tool, no schema change, show confirmation line | Minimal additive surface; matches v8.0 "additive over rewrite" philosophy | ✓ |
| Enumerate packages (parse pnpm-workspace.yaml/nx.json/turbo.json) and multi-select picker | Maximum flexibility; biggest scope addition | |
| Add `scope:` config key; default to root; allow override | New config surface for explicit scope control | |

**Claude's choice:** Detection-only + informational display + optional confirmation. Add NX and Turbo to `detectMonorepo()`. No new schema key. Per-package picker is deferred.
**Rationale:** REQUIREMENTS.md INIT-02 says "auto-detection of scope" — not "scope picker." `detectMonorepo()` already returns the structured detection; the wizard just needs to display it. Per-package selection adds a YAML parser dependency for pnpm-workspace.yaml globs and a multi-select prompt — strictly more than the requirement asks for. v8.0 milestone scope (PROJECT.md "additive philosophy") favors narrow surface.

---

## Area 3 — `--upgrade` contract (INIT-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Three-bucket diff (customized/at-default/missing) + interactive table + `--yes` summary line + best-effort comment preservation | Honest about preservation tradeoffs; deterministic | ✓ |
| Always preserve everything; only ADD missing keys | Safest; never refreshes stale defaults | |
| Diff-and-replace with line-by-line confirm | Maximum control; tedious UX | |
| AST-preserving YAML merge with full comment retention | Best preservation; needs YAML CST library | |

**Claude's choice:** Three-bucket diff (customized = preserve, at-default = refresh, missing = add) with interactive table + `--yes` one-liner. Comment preservation is best-effort (full re-serialize); document the limitation. AST-preserving merge deferred.
**Rationale:** REQUIREMENTS.md INIT-04 explicitly says "without clobbering customized fields" — bucket diff is the natural data structure. Interactive table gives the user verification without forcing line-by-line approval. Best-effort comment handling keeps Phase 31 scope tight; AST merge is deferred with a clear trigger. STATE.md does NOT mandate comment preservation.

---

## Area 4 — Action scaffold behavior (ACTN-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Runnable composite smoke step that calls `npx handover-cli --version` + emits "v1.0 coming soon" banner, exits 0 | Action invocation works; consumers see preview behavior, not breakage | ✓ |
| `action.yml` only with no `runs.steps` | Metadata-only; Marketplace validation will fail until Phase 36 | |
| Composite with `exit 1` and "Phase 36 implementation" message | Forces early adopters to wait; loud failure | |
| Composite that calls `npx handover-cli@latest generate --dry-run` directly | Real output; depends on `--dry-run` flag from Phase 32 which may not exist when ACTN-07 ships | |

**Claude's choice:** Runnable composite with `npx handover-cli@latest --version` + a banner echoing "preview release — full functionality in v1.0" + exit 0. Full `action.yml` metadata (branding `refresh-cw`/`blue`, all inputs declared) ships in Phase 31. Tagged `v0.1.0` and floating `@v0`; `@v1` is reserved for Phase 36. Name-collision check runs as verification.
**Rationale:** A runnable action validates that the composite infrastructure works (token wiring, working-directory input, npm fetch) without depending on `--dry-run` (Phase 32) or peter-evans steps (Phase 36). Branding from day one is required for Phase 36's Marketplace listing — adding it later is friction. Pre-1.0 versioning means early adopters who pin `@v0` get expected preview behavior and Phase 36's `@v1` is a clean cutover.

---

## Claude's Discretion (deferred to plan/execute phase)

- Detection messaging tone and color usage (follow existing `runInit` panel/note conventions)
- Exact diff-table column widths and chalk colors for `--upgrade` summary
- Whether placeholder action uses `@latest` (always-current) or `@<pinned>` (reproducible) — default `@latest` for v0
- README structure for the action repo (title + "preview" note + token docs + back-link only for Phase 31; substantive content lands in Phase 36)

## Deferred Ideas

- **Per-package monorepo picker** — enumerate workspace packages and multi-select. Deferred to v8.x. Trigger: user request.
- **AST-preserving `--upgrade` merge** — full inline-comment preservation. Deferred. Trigger: 3+ user complaints about lost comments.
- **Migration framework for cross-version `--upgrade`** — version-aware default tables. Deferred. Trigger: v9.0+ where 2+ versions of defaults exist in the wild.
- **`handover init --print-detection` diagnostic subcommand** — print what would be detected without writing. Captured for a v8.x DX phase.
- **Codex subscription health-check during init** — probe stored token validity. Deferred; users can run `handover auth status` for that.

---

*Discussion log: 2026-05-11*
