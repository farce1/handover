---
phase: 05-ai-analysis-rounds
plan: 01
subsystem: ai-analysis
tags: [zod, llm-prompts, validation, quality-check, structured-output, xml-prompts]

# Dependency graph
requires:
  - phase: 04-context-window-management
    provides: "PackedContext, RoundContext, TokenBudget types for context packing and inter-round compression"
  - phase: 03-static-analysis
    provides: "StaticAnalysisResult with AST data for hallucination validation"
  - phase: 01-foundation
    provides: "CompletionRequest type, Zod schema-first pattern, HandoverConfig"
provides:
  - "Zod output schemas for all 6 AI rounds (Round1-6OutputSchema)"
  - "Shared types: RoundInput, RoundExecutionResult, ValidationResult, QualityMetrics, RoundFallback, PipelineValidationSummary"
  - "System prompt templates for all 6 rounds (ROUND_SYSTEM_PROMPTS)"
  - "Prompt assembly utility (buildRoundPrompt) with XML-tagged sections"
  - "Hallucination validator (validateFileClaims, validateImportClaims, validateRoundClaims)"
  - "Quality checker (checkRoundQuality) with round-specific thresholds"
affects: [05-02, 05-03, 05-04, 06-output-generation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "XML-tagged prompt sections (<codebase_context>, <prior_analysis>, <round_data>, <instructions>)"
    - "Round-specific quality thresholds (text length, code reference count)"
    - "Silent claim dropping for hallucination correction (trust code over model)"
    - "File-path and import-path extraction from round output for validation"

key-files:
  created:
    - src/ai-rounds/types.ts
    - src/ai-rounds/schemas.ts
    - src/ai-rounds/prompts.ts
    - src/ai-rounds/validator.ts
    - src/ai-rounds/quality.ts
  modified: []

key-decisions:
  - "Temperature 0.3 for all analysis rounds (low for determinism, per research recommendation)"
  - "Flat Zod schemas to avoid zod-to-json-schema $ref complexity issues with tool_use"
  - "Quality thresholds: 500 chars / 3-5 refs for Rounds 1-5, 200 chars / 2 refs for Round 6"
  - "Validator scoped to file paths and import claims only (not high-level observations)"
  - "Zero file path references always fails quality check regardless of text length"

patterns-established:
  - "Round schema pattern: z.object() with z.infer type alias export"
  - "Prompt template pattern: ROUND_SYSTEM_PROMPTS record + buildRoundPrompt assembly"
  - "Validation pattern: extract claims -> cross-check against StaticAnalysisResult -> return ValidationResult"
  - "Quality pattern: serialize to JSON -> count code refs -> apply round-specific thresholds"

# Metrics
duration: 5min
completed: 2026-02-17
---

# Phase 5 Plan 01: AI Round Foundation Summary

**Zod output schemas for 6 AI rounds, XML-tagged prompt templates, AST-based hallucination validator, and heuristic quality checker under src/ai-rounds/**

## Performance

- **Duration:** 5min
- **Started:** 2026-02-17T09:43:25Z
- **Completed:** 2026-02-17T09:48:28Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- Flat Zod schemas for all 6 AI analysis rounds that cleanly convert to JSON Schema via zod-to-json-schema
- System prompts for all 6 rounds encoding locked user decisions (tone, confidence handling, validation scope)
- Hallucination validator that cross-checks file path and import claims against StaticAnalysisResult AST data
- Quality checker with round-specific thresholds producing isAcceptable boolean

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared types and Zod schemas for all 6 rounds** - `a853966` (feat)
2. **Task 2: Create prompt templates, validator, and quality checker** - `897c8a3` (feat)

## Files Created/Modified
- `src/ai-rounds/types.ts` - Shared interfaces (RoundInput, RoundExecutionResult, ValidationResult, QualityMetrics, RoundFallback, PipelineValidationSummary) and ROUND_NAMES constant
- `src/ai-rounds/schemas.ts` - Zod schemas for all 6 round outputs with z.infer type aliases
- `src/ai-rounds/prompts.ts` - System prompts for 6 rounds, buildRoundPrompt with XML sections, buildRetrySystemPrompt
- `src/ai-rounds/validator.ts` - validateFileClaims, validateImportClaims, validateRoundClaims against AST data
- `src/ai-rounds/quality.ts` - checkRoundQuality with round-specific min text length and code reference thresholds

## Decisions Made
- Temperature set to 0.3 for all rounds (balances determinism with natural language flexibility)
- Kept schemas flat with z.string() for free-form text, avoiding deeply nested $ref structures
- Quality threshold for Round 6 (Deployment) lower than others (200 chars / 2 refs) since deployment info may be sparse
- Validator extracts file paths via regex from serialized JSON, checking against fileTree.directoryTree
- Import validation limited to rounds that produce relationship data (Rounds 2 and 3)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Foundation types, schemas, prompts, validator, and quality checker are ready for round runner implementation (05-02)
- All 5 files compile without TypeScript errors
- Schemas verified to convert to JSON Schema for tool_use structured output
- Validator and quality checker verified with mock data

## Self-Check: PASSED

All 5 created files verified to exist on disk. Both task commits (a853966, 897c8a3) verified in git log.

---
*Phase: 05-ai-analysis-rounds*
*Completed: 2026-02-17*
