# Roadmap: Handover

## Milestones

- ✅ **v1.0 OSS Excellence** — Phases 1-3 (shipped 2026-02-18)
- 🚧 **v2.0 Performance** — Phases 4-7 (in progress)

## Phases

<details>
<summary>✅ v1.0 OSS Excellence (Phases 1-3) — SHIPPED 2026-02-18</summary>

- [x] Phase 1: Community Health (2/2 plans) — completed 2026-02-18
- [x] Phase 2: CI/CD Automation (4/4 plans) — completed 2026-02-18
- [x] Phase 3: Docs and LLM Accessibility (3/3 plans) — completed 2026-02-18

</details>

### v2.0 Performance (In Progress)

**Milestone Goal:** Full performance overhaul — make handover fast, responsive, and cost-efficient at any repo size. Measurable targets: 2-5x faster re-runs, 50%+ fewer tokens on incremental runs.

- [x] **Phase 4: Cache Correctness** - Fix fingerprint and cascade invalidation so fast re-runs produce correct, non-stale documentation
- [x] **Phase 5: UX Responsiveness** - Stream token output and show live progress so LLM waits feel interactive, not frozen
- [x] **Phase 6: Context Efficiency** - Reduce tokens sent on incremental runs, add Anthropic prompt caching, and replace the chars/4 heuristic with accurate counting
- [ ] **Phase 7: Cache Savings Pipeline Fix** - Forward cache token fields through runner to tracker, fix dead code and display bugs from milestone audit

## Phase Details

### Phase 4: Cache Correctness

**Goal**: Re-running handover on an unchanged or partially changed codebase produces correct, non-stale documentation users can trust
**Depends on**: Nothing (first phase of v2.0)
**Requirements**: CACHE-01, CACHE-02
**Success Criteria** (what must be TRUE):

1. Editing a file without changing its size causes that file's cached analysis to be invalidated and re-analyzed on the next run
2. Re-running handover after Round 1 output changes causes Rounds 2-6 to re-execute rather than serve cached results built on the old context
3. A re-run on a completely unchanged codebase completes with all 6 rounds served from cache, producing identical output to the prior run

**Plans**: 2 plans

Plans:

- [ ] 04-01-PLAN.md — Content-hash fingerprint, cascade invalidation, --no-cache fix, auto-gitignore
- [ ] 04-02-PLAN.md — Cache UX feedback: all-cached fast path, migration warning, verbose mode

### Phase 5: UX Responsiveness

**Goal**: Users see live progress during LLM rounds and streaming token output, so the 30-90 second wait feels interactive rather than like a hung process
**Depends on**: Phase 4
**Requirements**: UX-01, UX-02, UX-03, UX-04
**Success Criteria** (what must be TRUE):

1. During any active LLM round, the terminal displays a live token counter and elapsed timer that update in place without scrolling
2. Token output from the LLM appears in the terminal as it is generated — the user sees text streaming before the round completes
3. Rounds 5 and 6 execute concurrently when run from scratch, visibly reducing total wall-clock time compared to sequential execution
4. On a large repo run, the terminal shows how many files were analyzed vs. skipped, so the user knows the coverage scope of the output

**Plans**: 2 plans

Plans:

- [ ] 05-01-PLAN.md — Provider streaming callbacks, live token counter, elapsed timer, progress line format
- [ ] 05-02-PLAN.md — --stream flag, file coverage indicator, parallel round savings display

### Phase 6: Context Efficiency

**Goal**: Incremental runs send only changed file content to the LLM, Anthropic users benefit from prompt caching, and token counts are accurate enough to prevent context window overflows
**Depends on**: Phase 5
**Requirements**: EFF-01, EFF-02, EFF-03, EFF-04, EFF-05
**Success Criteria** (what must be TRUE):

1. On an incremental run where 10% of files changed, the token count sent to the LLM is proportionally reduced — unchanged files are not sent at full detail
2. Anthropic provider runs receive prompt cache hits on rounds 2-6, and the completion output reports the token savings vs. a full re-run
3. The token usage summary after each run shows actual token counts and the percentage savings vs. a full re-run, not an estimate
4. Document renderers execute in parallel — the render phase does not block on each document finishing before starting the next
5. Token counting for OpenAI-family providers uses BPE tokenization (gpt-tokenizer) rather than the chars/4 heuristic, eliminating the 15-25% counting error

**Plans**: 3 plans

Plans:

- [ ] 06-01-PLAN.md — Changed-files context packing: getChangedFiles() on AnalysisCache, changedFiles tier forcing in packFiles(), incremental run label
- [ ] 06-02-PLAN.md — Anthropic prompt caching and BPE tokenization: cache_control on system prompt, Usage schema cache fields, gpt-tokenizer for OpenAI providers
- [ ] 06-03-PLAN.md — Token summary, parallel rendering, savings display: per-round breakdown with savings, Promise.allSettled render phase, render timing

### Phase 7: Cache Savings Pipeline Fix

**Goal**: Cache token savings data flows end-to-end from Anthropic API response through runner.ts to tracker to display — users see per-round savings for prompt cache hits, dead code removed, display bugs fixed
**Depends on**: Phase 6
**Requirements**: EFF-02 (complete), EFF-03 (fix)
**Gap Closure**: Closes gaps from v2.0 milestone audit
**Success Criteria** (what must be TRUE):

1. `runner.ts` forwards `cacheReadTokens` and `cacheCreationTokens` from `CompletionResult.usage` to `tracker.recordRound()`
2. `round-5-edge-cases.ts` forwards the same cache fields for Round 5's fan-out usage recording
3. `tracker.getRoundCacheSavings()` returns non-null savings data when Anthropic cache hits occur
4. Per-round savings lines render in terminal output on Anthropic runs with cache hits
5. Dead code removed: `renderRenderProgress()`, `DisplayState.cumulativeTokens`
6. `CIRenderer.onRenderStart` logs correct document count

**Plans**: 1 plan

Plans:

- [ ] 07-01-PLAN.md — Forward cache fields through runner, remove dead code, fix CI renderer doc count

## Progress

**Execution Order:**
Phases execute in numeric order: 4 → 5 → 6 → 7

| Phase                         | Milestone | Plans Complete | Status      | Completed  |
| ----------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Community Health           | v1.0      | 2/2            | Complete    | 2026-02-18 |
| 2. CI/CD Automation           | v1.0      | 4/4            | Complete    | 2026-02-18 |
| 3. Docs and LLM Accessibility | v1.0      | 3/3            | Complete    | 2026-02-18 |
| 4. Cache Correctness          | v2.0      | 2/2            | Complete    | 2026-02-18 |
| 5. UX Responsiveness          | v2.0      | 2/2            | Complete    | 2026-02-19 |
| 6. Context Efficiency         | v2.0      | 3/3            | Complete    | 2026-02-19 |
| 7. Cache Savings Pipeline Fix | v2.0      | 0/1            | Not started | -          |
