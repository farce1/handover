# Phase 28: Git-Aware Incremental Regeneration - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

CLI feature: `handover generate --since <ref>` skips re-analysis of unchanged files by comparing against a git ref. Graceful fallback when git context is unavailable (non-git directory, shallow clone, detached HEAD). The existing content-hash cache remains the default; git-aware mode is opt-in via `--since`.

</domain>

<decisions>
## Implementation Decisions

### Run-time feedback
- Incremental mode must be visually distinct from a full run — clear banner or badge showing incremental mode and the ref being compared against (e.g., "Incremental mode (since abc123)")
- When `--since` detects 0 changed files, exit early with a message ("No files changed since <ref> — nothing to regenerate") and exit code 0
- `--since` is combinable with `--only` (document selection) — both filters apply together

### Fallback experience
- When git context is unavailable, show a one-liner warning then fall back to full content-hash analysis
- Warning messages are specific per scenario: "Not a git repo", "Shallow clone detected", "Detached HEAD" — helps users diagnose the situation
- Fallback exits with code 0 (success) — the work still gets done, just not incrementally
- No strict mode — keep it simple with one flag and graceful behavior

### Ref flexibility
- Accept any valid git ref: branch names, tags, SHAs, relative refs (HEAD~N), time-based (@{yesterday}) — whatever `git rev-parse` accepts
- No convenience shortcuts (no `--since last-run`) — user always specifies the ref explicitly
- Invalid or non-existent ref is an error: print error message and exit non-zero (this is user input error, not a fallback scenario)

### Uncommitted changes
- Include uncommitted changes (staged + unstaged) in the changed file set — practical for local dev workflow
- Include untracked (brand new) files as "changed" — they're part of the work in progress
- No special CI auto-detection (no GITHUB_BASE_REF sniffing) — CI users provide their own ref

### Claude's Discretion
- Detail level of changed/unchanged file output (counts vs file list)
- Whether to show time/cost savings estimates
- Warning messaging style for uncommitted files (info note vs silent)
- Exact banner/badge format for incremental mode indicator

</decisions>

<specifics>
## Specific Ideas

- Invalid ref should error (exit non-zero), but missing git context should gracefully fall back (exit 0) — these are fundamentally different situations
- The tool should feel like a natural extension of `generate`, not a separate command — same output structure, just faster
- Local dev is the primary use case: developer changes a few files, wants to regenerate docs quickly without re-analyzing the whole repo

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 28-git-aware-incremental-regeneration*
*Context gathered: 2026-03-01*
