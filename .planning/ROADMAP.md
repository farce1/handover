# Roadmap: Handover

## Milestones

- ✅ **v1.0 OSS Excellence** — Phases 1-3 (shipped 2026-02-18)
- 🚧 **v2.0 Performance** — Phases 4-6 (in progress)

## Phases

<details>
<summary>✅ v1.0 OSS Excellence (Phases 1-3) — SHIPPED 2026-02-18</summary>

- [x] Phase 1: Community Health (2/2 plans) — completed 2026-02-18
- [x] Phase 2: CI/CD Automation (4/4 plans) — completed 2026-02-18
- [x] Phase 3: Docs and LLM Accessibility (3/3 plans) — completed 2026-02-18

</details>

### v2.0 Performance (In Progress)

**Milestone Goal:** Full performance overhaul — make handover fast, responsive, and cost-efficient at any repo size. Measurable targets: 2-5x faster re-runs, 50%+ fewer tokens on incremental runs.

- [ ] **Phase 4: Cache Correctness** - Fix fingerprint and cascade invalidation so fast re-runs produce correct, non-stale documentation
- [ ] **Phase 5: UX Responsiveness** - Stream token output and show live progress so LLM waits feel interactive, not frozen
- [ ] **Phase 6: Context Efficiency** - Reduce tokens sent on incremental runs, add Anthropic prompt caching, and replace the chars/4 heuristic with accurate counting

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

**Plans**: TBD

Plans:

- [ ] 05-01: Live token counter and elapsed timer — add onRoundToken() callback to TerminalRenderer; route all stdout through TerminalRenderer
- [ ] 05-02: Streaming token output — extend provider interface with supportsStreaming() and completeStream(); upgrade @anthropic-ai/sdk and openai SDKs
- [ ] 05-03: Parallel rounds 5 and 6 — audit and fix dep declarations in round-5-edge-cases.ts and round-6-deployment.ts; file coverage indicator

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

**Plans**: TBD

Plans:

- [ ] 06-01: Changed-files context packing — expose AnalysisCache.getChangedFiles(); extend packFiles() to accept changed-files set; force changed files to full tier
- [ ] 06-02: Anthropic prompt caching — add cache_control blocks and betas header to AnthropicProvider.doComplete(); verify SDK upgrade from Phase 5
- [ ] 06-03: Token summary, parallel rendering, accurate counting — completion screen token savings report; parallel Promise.all render phase; gpt-tokenizer for OpenAI providers

## Progress

**Execution Order:**
Phases execute in numeric order: 4 → 5 → 6

| Phase                         | Milestone | Plans Complete | Status      | Completed  |
| ----------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Community Health           | v1.0      | 2/2            | Complete    | 2026-02-18 |
| 2. CI/CD Automation           | v1.0      | 4/4            | Complete    | 2026-02-18 |
| 3. Docs and LLM Accessibility | v1.0      | 3/3            | Complete    | 2026-02-18 |
| 4. Cache Correctness          | v2.0      | 0/2            | Not started | -          |
| 5. UX Responsiveness          | v2.0      | 0/3            | Not started | -          |
| 6. Context Efficiency         | v2.0      | 0/3            | Not started | -          |
