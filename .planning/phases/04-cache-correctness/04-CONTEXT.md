# Phase 4: Cache Correctness - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the cache fingerprint algorithm and implement cascade invalidation so that re-running handover on an unchanged or partially changed codebase produces correct, non-stale documentation. Requirements: CACHE-01 (content-hash fingerprint), CACHE-02 (cascade invalidation).

</domain>

<decisions>
## Implementation Decisions

### Fingerprint strategy

- Claude's discretion on algorithm choice (SHA-256 content hash vs mtime+size vs hybrid)
- Claude's discretion on file scope (included files only vs all)
- Claude's discretion on correctness vs speed tradeoff for large repos
- Claude's discretion on whether to include config fields in fingerprint (may pull in CACHE-03 scope if it fits naturally)

### Cascade scope

- Claude's discretion on cascade approach (clear-all-downstream vs hash-chain-per-round)
- Claude's discretion on granularity (all rounds re-run on any change vs smart partial)
- Add `--no-cache` flag to force full re-analysis — skips reading cache but does NOT delete it
- Cache files are preserved on disk when `--no-cache` is used; next normal run reads them

### Migration path

- Warn and clear on version mismatch: show message like "Cache format updated, rebuilding..." then clear old cache
- No cache version metadata — this is a one-time migration, handle future changes when they come
- Claude's discretion on cache location (keep in project dir vs system cache dir)
- Auto-add cache directory to .gitignore if not already present

### Cache feedback

- Per-round cache status shown inline: "Round 1: cached" or "Round 3: re-running..."
- Cached rounds visually distinct — dimmed or abbreviated compared to active rounds
- When ALL rounds are cached (unchanged repo), skip round-by-round display entirely — show instant summary like "All 6 rounds cached" and go straight to output
- Verbose mode (-v) shows detailed cache info: which files changed, which rounds they invalidated

### Claude's Discretion

- Fingerprint algorithm choice (SHA-256 vs mtime+size vs hybrid)
- File scope for fingerprinting
- Speed vs correctness tradeoff on large repos
- Whether to bundle config-hash invalidation (CACHE-03) into this phase
- Cascade invalidation approach (clear-downstream vs hash-chain)
- Cascade granularity
- Cache storage location

</decisions>

<specifics>
## Specific Ideas

- `--no-cache` should feel like a "trust nothing" escape hatch but not be destructive (preserves cache files)
- Full-cache runs should feel instant — no unnecessary round-by-round display, just results
- Verbose mode should help debug "why did this round re-run?" questions

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 04-cache-correctness_
_Context gathered: 2026-02-18_
