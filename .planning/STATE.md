# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.
**Current focus:** v2.0 Performance — Phase 6: Context Efficiency (in progress)

## Current Position

Phase: 6 of 6 (Context Efficiency) — COMPLETE
Plan: 3 of 3 in current phase (plan 03 complete)
Status: Phase 6 complete — incremental packing, prompt caching + BPE tokenization, per-round savings display and parallel rendering
Last activity: 2026-02-19 — 06-03 UX display complete (Phase 6 done)

Progress: [█████████░] 90% (9/10 plans complete across v2.0)

## Performance Metrics

**v1.0 Velocity:**

- Total plans completed: 9
- Average duration: ~5 min/plan
- Total execution time: ~0.7 hours
- Timeline: 3 days (2026-02-16 to 2026-02-18)

**By Phase (v1.0):**

| Phase                         | Plans | Avg/Plan |
| ----------------------------- | ----- | -------- |
| 1. Community Health           | 2     | ~5 min   |
| 2. CI/CD Automation           | 4     | ~5 min   |
| 3. Docs and LLM Accessibility | 3     | ~5 min   |

**v2.0:**

| Plan                            | Duration | Tasks   | Files    |
| ------------------------------- | -------- | ------- | -------- |
| Phase 04-cache-correctness P01  | 3 min    | 2 tasks | 2 files  |
| Phase 04-cache-correctness P02  | 2 min    | 1 tasks | 3 files  |
| Phase 05-ux-responsiveness P01  | 6 min    | 2 tasks | 16 files |
| Phase 05-ux-responsiveness P02  | 4 min    | 2 tasks | 6 files  |
| Phase 06-context-efficiency P01 | 3 min    | 2 tasks | 4 files  |
| Phase 06-context-efficiency P02 | 4 min    | 2 tasks | 6 files  |
| Phase 06-context-efficiency P03 | 4 min    | 2 tasks | 5 files  |

## Accumulated Context

### Decisions

All v1.0 decisions archived in PROJECT.md Key Decisions table.

v2.0 key constraints from research:

- Phase 4 (cache correctness) must ship before Phase 5 (streaming) — streaming on a broken cache delivers fast stale results
- SDK upgrades (@anthropic-ai/sdk 0.39.0 to 0.76.0, openai 5.23.2 to 6.22.0) happen in Phase 5, not Phase 6 — prompt caching (Phase 6) uses the already-upgraded SDK
- Streaming accumulates full response before Zod validation — never parse partial JSON mid-stream
- [Phase 04-cache-correctness]: hashContent imported at generate.ts call site, not in round-cache.ts — keeps cache module decoupled from file I/O
- [Phase 04-cache-correctness]: RoundCache.clear() preserved as public method for migration; --no-cache uses noCacheMode flag to skip reads only, always writes
- [Phase 04-cache-correctness]: All-cached check in renderRoundBlock: early return with single summary line before per-round loop
- [Phase 04-cache-correctness]: Migration warning uses process.stderr.write because logger is suppressed during renderer-managed output
- [Phase 05-ux-responsiveness]: onToken is optional in all provider/round signatures — no callback means non-streaming path unchanged (backward compatible)
- [Phase 05-ux-responsiveness]: Lazy getter makeOnToken(n) resolves callback at step execute() time to handle timing between onStepStart registration and step execution
- [Phase 05-ux-responsiveness]: Spinner tick (80ms) drives elapsed time updates; onToken callback does NOT trigger re-renders to avoid ~100 renders/sec flooding
- [Phase 05-ux-responsiveness]: Round 5 fan-out accepts onToken for API consistency but does not wire it into parallel per-module calls (display noise)
- [Phase 05-ux-responsiveness P02]: signatureFiles included in "analyzing" count alongside fullFiles — both sent to LLM so both represent analyzed scope
- [Phase 05-ux-responsiveness P02]: parallel savings only shown when both r5 and r6 are done (not cached) and saved > 2s — avoids noise for cached runs
- [Phase 05-ux-responsiveness P02]: streamVisible carried on DisplayState (not passed per-call) so 80ms spinner interval re-renders see the flag consistently
- [Phase 06-context-efficiency]: Changed files fall through to normal tier when budget exhausted — ensures max coverage
- [Phase 06-context-efficiency]: isIncremental requires prior cache AND not all files changed — first runs unchanged
- [Phase 06-context-efficiency]: Analysis cache path: .handover/cache/analysis.json separate from round cache to avoid coupling
- [Phase 06-context-efficiency]: cache_read_input_tokens and cache_creation_input_tokens are directly accessible on SDK 0.39.0 Usage type — no cast needed; null coerced to undefined with ?? undefined
- [Phase 06-context-efficiency]: BPE model routing in OpenAICompatibleProvider: gpt-4- and gpt-3.5- prefixes use cl100k_base; all others (gpt-4o, gpt-4.1, o-series) use o200k_base via gpt-tokenizer main export
- [Phase 06-context-efficiency P03]: Per-round savings expressed in all three units: tokens, percentage, dollars
- [Phase 06-context-efficiency P03]: All-cached runs skip roundSummaries entirely — no API calls means no token summary
- [Phase 06-context-efficiency P03]: Render timing only shown when savings > 500ms to avoid noise on fast runs
- [Phase 06-context-efficiency P03]: RoundExecutionResult has no usage field — cache tokens read from tracker.getRoundUsage()

### Pending Todos

None.

### Blockers/Concerns

External setup still required from v1.0:

- GitHub Sponsors enrollment (FUNDING.yml ready, account enrollment needed)
- npm trusted publishing OIDC config on npmjs.com
- RELEASE_PLEASE_TOKEN (GitHub fine-grained PAT) as repo secret
- CODECOV_TOKEN as repo secret

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 06-03-PLAN.md (per-round savings display, parallel rendering — Phase 6 complete)
Resume file: .planning/phases/06-context-efficiency/06-03-SUMMARY.md
