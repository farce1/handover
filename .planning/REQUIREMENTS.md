# Requirements: Handover v2.0 Performance

**Defined:** 2026-02-18
**Core Value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

## v2.0 Requirements

Requirements for v2.0 Performance milestone. Each maps to roadmap phases.

### Caching & Correctness

- [ ] **CACHE-01**: Cache fingerprint uses file content hash instead of file size
- [ ] **CACHE-02**: Round N cache invalidates when Round N-1 output changes (cascade invalidation)

### UX Responsiveness

- [ ] **UX-01**: User sees live token counter and elapsed timer during each LLM round
- [ ] **UX-02**: User sees streaming token output as LLM generates response
- [ ] **UX-03**: Rounds 5 and 6 execute in parallel when their dependencies are met
- [ ] **UX-04**: User sees file coverage indicator showing analyzed vs skipped files on large repos

### Context Efficiency

- [ ] **EFF-01**: Only changed files sent at full detail on incremental runs
- [ ] **EFF-02**: Anthropic provider uses prompt caching for static context blocks
- [ ] **EFF-03**: User sees token usage summary with savings vs full re-run
- [ ] **EFF-04**: Document renderers execute in parallel instead of sequentially
- [ ] **EFF-05**: Token counting uses gpt-tokenizer for OpenAI-family providers instead of chars/4 heuristic

## v2.1 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Caching Enhancements

- **CACHE-03**: Cache invalidates when analysis-affecting config fields change (model, provider, context window)
- **CACHE-04**: Cache detects deleted files and triggers re-analysis for affected rounds
- **CACHE-05**: User sees cache hit/miss summary per round in completion output

### Startup Optimization

- **START-01**: CLI startup uses dynamic imports for WASM parser (only loaded for generate command)
- **START-02**: Documentation for NODE_COMPILE_CACHE opt-in on Node.js 22+

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                            | Reason                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Multi-threaded analyzer execution  | Analyzers already run concurrently via Promise.allSettled; they are I/O-bound, not CPU-bound    |
| Persistent background daemon       | Disk cache provides fast re-runs; daemon adds battery drain, race conditions, IPC complexity    |
| Streaming output to markdown files | Rendering requires complete, Zod-validated JSON; streaming creates partial documents            |
| Provider-level request batching    | Rounds are sequentially dependent by design; batching requires restructuring round architecture |
| In-memory cache (lru-cache, keyv)  | CLI runs once and exits; in-memory cache lost on every invocation; wrong model                  |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| CACHE-01    | —     | Pending |
| CACHE-02    | —     | Pending |
| UX-01       | —     | Pending |
| UX-02       | —     | Pending |
| UX-03       | —     | Pending |
| UX-04       | —     | Pending |
| EFF-01      | —     | Pending |
| EFF-02      | —     | Pending |
| EFF-03      | —     | Pending |
| EFF-04      | —     | Pending |
| EFF-05      | —     | Pending |

**Coverage:**

- v2.0 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11

---

_Requirements defined: 2026-02-18_
_Last updated: 2026-02-18 after initial definition_
