---
phase: 17-local-embedding-provider-routing
plan: 01
subsystem: api
tags: [embeddings, ollama, routing, zod]
requires:
  - phase: 15-llm-qa-advanced-features
    provides: Existing OpenAI embedding provider and vector indexing/search flows
provides:
  - Embedding locality-mode schema with local provider config validation
  - Local Ollama embedder, deterministic routing policy, and shared health diagnostics
affects: [17-02, 17-03, embedding-routing, mcp]
tech-stack:
  added: []
  patterns: [mode-aware embedding routing, structured health diagnostics]
key-files:
  created: [src/vector/local-embedder.ts, src/vector/embedding-router.ts, src/vector/embedding-health.ts]
  modified: [src/config/schema.ts, src/vector/types.ts, src/vector/embedder.ts]
key-decisions:
  - "local-preferred never silently falls back in non-interactive contexts; explicit confirmation is required in interactive mode"
  - "local health checks use Ollama /api/version and /api/show with /api/tags fallback for actionable model readiness diagnostics"
patterns-established:
  - "Routing Pattern: one EmbeddingRouter resolves provider by locality mode and execution context"
  - "Health Pattern: failures return structured checks + remediation while success returns concise summary text"
requirements-completed: [RMT-18, RMT-20, RMT-21]
duration: 3 min
completed: 2026-02-23
---

# Phase 17 Plan 01: Local Embedding Provider Routing Summary

**Embedding locality policy now drives deterministic local/remote provider resolution with Ollama-compatible local embedding and reusable provider health diagnostics.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T20:02:01Z
- **Completed:** 2026-02-23T20:05:46Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added embedding config schema support for `local-only`, `local-preferred`, and `remote-only` modes with local provider settings and model requirement guards.
- Added shared mode/provider route metadata types to avoid string-union drift across routing and health layers.
- Implemented an Ollama-compatible local embedding provider using `/api/embed` plus retry and timeout handling.
- Implemented a deterministic `EmbeddingRouter` that enforces explicit confirmation for local-preferred remote fallback and blocks silent fallback in non-interactive contexts.
- Implemented `EmbeddingHealthChecker` with structured connectivity/model checks, actionable fixes, and concise success summaries.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend embedding config schema for locality policy and local provider settings** - `f938551` (feat)
2. **Task 2: Implement local provider, centralized router, and reusable health-check service** - `f643c7c` (feat)

## Files Created/Modified
- `src/config/schema.ts` - Adds embedding locality mode, local provider config, and mode-aware validation.
- `src/vector/types.ts` - Adds shared locality mode/provider constants and route metadata types.
- `src/vector/embedder.ts` - Exposes shared embedding client/batch result contracts for router/provider interoperability.
- `src/vector/local-embedder.ts` - Implements local Ollama embedding provider against `/api/embed`.
- `src/vector/embedding-router.ts` - Adds deterministic mode-based provider selection with explicit fallback confirmation rules.
- `src/vector/embedding-health.ts` - Adds reusable local connectivity/model readiness diagnostics and remediation contract.

## Decisions Made
- Chose callback-driven fallback confirmation in router resolution so CLI paths can prompt while MCP/CI paths fail explicitly without silent remote fallback.
- Kept health diagnostics protocol-oriented (`/api/version`, `/api/show`, `/api/tags`) to produce actionable errors before embedding work starts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `gsd-tools state advance-plan` and `state record-session` could not parse the legacy STATE.md position/session format, so current-position and session fields were updated manually after automated metrics/decision updates.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Mode-aware routing, local provider, and health primitives are now in place for wiring into reindex/retrieval command flows in 17-02.

---
*Phase: 17-local-embedding-provider-routing*
*Completed: 2026-02-23*

## Self-Check: PASSED
