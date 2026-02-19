---
phase: 04-cache-correctness
plan: 01
subsystem: cache
tags: [sha256, content-hashing, cache-invalidation, gitignore]

# Dependency graph
requires: []
provides:
  - SHA-256 content-hash fingerprint replacing size-only detection (CACHE-01)
  - Cascade hash chain across rounds so upstream changes invalidate downstream (CACHE-02)
  - Cache version field (v2) with automatic migration clearing on mismatch
  - Auto-append of .handover/cache to .gitignore on first cache write
  - --no-cache flag preserves cache files on disk (skips reads only)
affects: [05-streaming, 06-prompt-caching]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Content-hash fingerprint: hash file bytes via SHA-256, not size, before comparing cache keys'
    - "Cascade hash chain: each round's key includes hashes of prior rounds' outputs"
    - 'Version-aware cache: bump CACHE_VERSION constant to force migration on format changes'
    - 'Non-destructive --no-cache: skip reads, always write, so next normal run sees warm cache'

key-files:
  created: []
  modified:
    - src/cache/round-cache.ts
    - src/cli/generate.ts

key-decisions:
  - 'hashContent not imported into round-cache.ts — fingerprint accepts pre-computed contentHash strings; hashing happens at call site in generate.ts'
  - 'RoundCache.clear() retained as public method for migration use, not called on --no-cache'
  - 'priorRoundHashes defaults to [] so existing computeHash callers without cascade remain valid'

patterns-established:
  - 'CACHE_VERSION constant: bump integer to trigger full migration on next startup'
  - 'ensureGitignored runs once per instance via _gitignoreChecked flag; non-fatal on write failure'

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 4 Plan 1: Cache Correctness Core Fixes Summary

**SHA-256 content-hash fingerprint (CACHE-01) and round-to-round cascade invalidation (CACHE-02) replacing the size-only cache strategy**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-18T16:46:44Z
- **Completed:** 2026-02-18T16:50:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- CACHE-01: `computeAnalysisFingerprint` now hashes file bytes (SHA-256) so same-size edits correctly invalidate cache
- CACHE-02: `computeHash` includes `priorRoundHashes` array so editing Round 1 output propagates invalidation to Rounds 2-6
- Cache entries carry `version: 2` field; entries without the field trigger a one-time `clear()` migration on next startup
- `.handover/cache` is auto-appended to `.gitignore` on first cache write via `ensureGitignored()`
- `--no-cache` now skips cache reads but always writes results, so the next normal run benefits from a warm cache

## Task Commits

Each task was committed atomically:

1. **Task 1: Content-hash fingerprint, cascade chain, version, auto-gitignore in RoundCache** - `2326493` (feat)
2. **Task 2: Content hashing, cascade threading, --no-cache fix in generate.ts** - `decca52` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/cache/round-cache.ts` - Content-hash fingerprint, priorRoundHashes cascade, CACHE_VERSION=2, ensureGitignored(), projectRoot constructor param, wasMigrated getter
- `src/cli/generate.ts` - hashContent import, async file content reading for fingerprint, noCacheMode flag replacing clear(), cascade priorRoundNums wired per round

## Decisions Made

- `hashContent` is imported in `generate.ts` (call site) rather than `round-cache.ts` — the cache module accepts pre-computed `contentHash` strings, keeping it decoupled from file I/O
- `RoundCache.clear()` is preserved as a public method (used by migration); it is no longer called on `--no-cache`, which now uses a `noCacheMode` flag to skip reads only
- `priorRoundHashes` defaults to `[]` in `computeHash` so any callers without cascade context remain valid without changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed unused hashContent import from round-cache.ts**

- **Found during:** Task 1 commit (eslint pre-commit hook)
- **Issue:** Plan said to import `hashContent` into `round-cache.ts` but the module only accepts already-computed `contentHash` strings; ESLint flagged it as unused
- **Fix:** Removed the import; `hashContent` is correctly imported only in `generate.ts` where file content is actually read
- **Files modified:** `src/cache/round-cache.ts`
- **Verification:** Pre-commit hook passed after removal; tsc and tests pass
- **Committed in:** `2326493` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — unused import caught by linter)
**Impact on plan:** Minor import placement correction, no scope change. The plan's intent (hashContent reuse) is correctly realized at the generate.ts call site.

## Issues Encountered

- Commit message header exceeded 100-character limit on first attempt — shortened to fit `commitlint` rule

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Cache correctness foundation is complete; Phase 5 (streaming) can proceed on a correct cache layer
- The pre-existing `runner.ts` type error (`ValidationResult` not found) is out of scope and not introduced by this plan

## Self-Check: PASSED

- `src/cache/round-cache.ts` — FOUND
- `src/cli/generate.ts` — FOUND
- `04-01-SUMMARY.md` — FOUND
- Commit `2326493` — FOUND
- Commit `decca52` — FOUND
- `contentHash: string` in computeAnalysisFingerprint — FOUND
- `priorRoundHashes` in computeHash — FOUND (3 occurrences)
- `CACHE_VERSION = 2` — FOUND
- `ensureGitignored` — FOUND (2 occurrences)
- `noCacheMode` in generate.ts — FOUND (3 occurrences)
- `hashContent` import in generate.ts — FOUND (2 occurrences)

---

_Phase: 04-cache-correctness_
_Completed: 2026-02-18_
