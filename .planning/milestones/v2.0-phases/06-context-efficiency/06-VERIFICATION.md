---
phase: 06-context-efficiency
verified: 2026-02-19T12:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 06: Context Efficiency Verification Report

**Phase Goal:** Incremental runs send only changed file content to the LLM, Anthropic users benefit from prompt caching, and token counts are accurate enough to prevent context window overflows
**Verified:** 2026-02-19T12:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                 | Status   | Evidence                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Changed files receive priority for full tier — unchanged files fall to signatures tier, subject to budget enforcement | VERIFIED | `packer.ts` lines 317-331: `changedFiles.has(entry.path)` block runs before oversized/normal logic; falls through to normal tier on budget exhaust               |
| 2   | Terminal displays incremental run label and unchanged file count                                                      | VERIFIED | `components.ts` `renderRunLabel()` + `renderFileCoverage()` with optional `incremental` param; both `renderer.ts` and `ci-renderer.ts` pass incremental metadata |
| 3   | The file coverage line shows counts for both analyzed and unchanged files                                             | VERIFIED | `ci-renderer.ts` line 65: logs `unchangedFileCount`; `components.ts` line 164-166: renders unchanged dim count                                                   |
| 4   | Budget enforcement still applies to changed files                                                                     | VERIFIED | `packer.ts` lines 318-331: `if (fullTokens <= remaining)` gate on changed-file block; fall-through comment present                                               |
| 5   | Anthropic provider sends system prompt with cache_control ephemeral marker                                            | VERIFIED | `anthropic.ts` lines 33-39: `systemBlocks` array with `cache_control: { type: 'ephemeral' }` passed as `system:` param                                           |
| 6   | CompletionResult carries cacheReadTokens and cacheCreationTokens from Anthropic usage response                        | VERIFIED | `anthropic.ts` lines 101-102 (streaming) and 135-136 (non-streaming): `?? undefined` extraction of both cache fields                                             |
| 7   | TokenUsageTracker records per-round cache token counts and can compute savings                                        | VERIFIED | `tracker.ts` lines 164-188: `getRoundCacheSavings()` reads `cacheReadTokens` from stored round, computes tokensSaved/dollarsSaved/percentSaved                   |
| 8   | OpenAI-family providers use BPE tokenization via gpt-tokenizer                                                        | VERIFIED | `openai-compat.ts` lines 3-4: `gpt-tokenizer` imports; lines 57-62: `estimateTokens()` override routes by model prefix                                           |
| 9   | Each completed round shows per-round savings line when savings exist                                                  | VERIFIED | `components.ts` lines 222-236: `renderRoundSavings()` called in `case 'done'` when `cacheSavingsTokens > 0`                                                      |
| 10  | Completion summary shows per-round breakdown                                                                          | VERIFIED | `components.ts` lines 363-378: iterates `state.roundSummaries`, emits per-round tokens/cost and savings lines                                                    |
| 11  | Document renderers execute in parallel via Promise.allSettled with error isolation                                    | VERIFIED | `generate.ts` line 842: `await Promise.allSettled(docsToRender.map(...))` with rejected-case handling and error recording                                        |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact                         | Expected                                                                                                                                                                | Status   | Details                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/analyzers/cache.ts`         | `getChangedFiles()` public method returning `Set<string>`                                                                                                               | VERIFIED | Lines 75-83: method iterates currentHashes, calls `isUnchanged()`, returns `Set<string>`                                                                        |
| `src/context/packer.ts`          | `changedFiles` parameter forcing changed files to full tier with budget enforcement                                                                                     | VERIFIED | Line 211: optional `changedFiles?: Set<string>` param; lines 316-331: priority block with budget check and fall-through                                         |
| `src/cli/generate.ts`            | Wiring of changed-files detection, incremental label, parallel rendering, roundSummaries                                                                                | VERIFIED | Lines 476-533: change detection; line 519: `isIncremental ? changedFiles : undefined`; lines 842-854: `Promise.allSettled`; lines 971-999: roundSummaries build |
| `src/ui/types.ts`                | `DisplayState` with incremental fields; `RoundDisplayState` with cache fields; `Renderer` with optional render hooks                                                    | VERIFIED | Lines 82-87: incremental fields; lines 29-38: cache savings fields; lines 121-122: optional `onRenderStart`/`onRenderDone`                                      |
| `src/providers/anthropic.ts`     | `cache_control` on system prompt; cache usage extraction from response                                                                                                  | VERIFIED | Lines 33-44: `systemBlocks` with `cache_control: { type: 'ephemeral' }`; lines 101-102, 135-136: cache field extraction                                         |
| `src/domain/schemas.ts`          | `UsageSchema` with optional `cacheReadTokens` and `cacheCreationTokens`                                                                                                 | VERIFIED | Lines 146-147: optional fields on `UsageSchema`                                                                                                                 |
| `src/context/tracker.ts`         | `getRoundCacheSavings()`, cache-aware `estimateCost()`, updated `getRoundCost()`/`getTotalCost()`                                                                       | VERIFIED | Lines 14-15: multiplier constants; lines 132-157: `estimateCost()` with cache params; lines 164-188: `getRoundCacheSavings()`                                   |
| `src/providers/openai-compat.ts` | `estimateTokens()` override using BPE via gpt-tokenizer                                                                                                                 | VERIFIED | Lines 3-4: imports; lines 57-62: override routing by model prefix                                                                                               |
| `src/ui/components.ts`           | `renderRoundSavings()`, `renderRunLabel()`, `renderRenderProgress()`, updated `renderFileCoverage()`, updated `renderRoundBlock()`, updated `renderCompletionSummary()` | VERIFIED | Lines 101-106, 113-122, 128-130, 138-171, 222-236, 363-378                                                                                                      |
| `src/ui/renderer.ts`             | `TerminalRenderer.onFileCoverage()` passes incremental metadata; `onRenderStart`/`onRenderDone` implemented                                                             | VERIFIED | Lines 209-220: `renderFileCoverage()` with incremental object; lines 223-228: no-op implementations                                                             |
| `src/ui/ci-renderer.ts`          | `CIRenderer.onFileCoverage()` logs incremental/full label; `onRenderStart`/`onRenderDone` implemented                                                                   | VERIFIED | Lines 60-73: conditional incremental log; lines 75-85: functional log implementations                                                                           |

### Key Link Verification

| From                             | To                       | Via                                                                     | Status | Details                                                                                         |
| -------------------------------- | ------------------------ | ----------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `src/cli/generate.ts`            | `src/analyzers/cache.ts` | `getChangedFiles()` called after fingerprint build                      | WIRED  | Line 488: `analysisCache.getChangedFiles(currentHashes)`                                        |
| `src/cli/generate.ts`            | `src/context/packer.ts`  | `changedFiles` set passed to `packFiles()`                              | WIRED  | Line 519: `isIncremental ? changedFiles : undefined`                                            |
| `src/cli/generate.ts`            | `src/context/tracker.ts` | `getRoundCacheSavings()` called per round in onStepComplete             | WIRED  | Line 341: `tracker.getRoundCacheSavings(roundNum)`                                              |
| `src/cli/generate.ts`            | `src/ui/components.ts`   | `displayState.roundSummaries` consumed by `renderCompletionSummary()`   | WIRED  | Lines 971-999: roundSummaries built; `components.ts` lines 363-378: consumed                    |
| `src/providers/anthropic.ts`     | `src/domain/schemas.ts`  | `CompletionResult.usage` carries cache fields through `UsageSchema`     | WIRED  | `cacheReadTokens`/`cacheCreationTokens` in both `UsageSchema` and Anthropic return values       |
| `src/context/tracker.ts`         | `src/context/types.ts`   | `TokenUsage` extended with cache fields, `getRoundUsage()` returns them | WIRED  | `context/types.ts` lines 95-96: optional cache fields; `tracker.ts` line 226: `getRoundUsage()` |
| `src/providers/openai-compat.ts` | `gpt-tokenizer`          | `countTokens` import for BPE estimation                                 | WIRED  | `package.json`: `"gpt-tokenizer": "^3.4.0"`; `openai-compat.ts` lines 3-4: imports active       |

### Requirements Coverage

Phase goal requirements from ROADMAP.md:

| Requirement                                             | Status    | Notes                                                                                         |
| ------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| EFF-01: Incremental runs send only changed file content | SATISFIED | `getChangedFiles()` + `changedFiles` param in `packFiles()` wired end-to-end                  |
| EFF-02: Anthropic users benefit from prompt caching     | SATISFIED | `cache_control: { type: 'ephemeral' }` on system prompt; cache fields extracted from response |
| EFF-03: Per-round cache savings displayed               | SATISFIED | `renderRoundSavings()` in round block done case + completion summary                          |
| EFF-04: Parallel document rendering                     | SATISFIED | `Promise.allSettled` with error isolation in render step                                      |
| EFF-05: BPE tokenization for accurate token counts      | SATISFIED | `OpenAICompatibleProvider.estimateTokens()` override using gpt-tokenizer                      |

### Anti-Patterns Found

| File            | Line    | Pattern                              | Severity | Impact                                                                                        |
| --------------- | ------- | ------------------------------------ | -------- | --------------------------------------------------------------------------------------------- |
| `packer.ts`     | 116     | `TODO\|FIXME\|HACK` in regex literal | Info     | False positive — regex used to detect edge-case markers in user source files, not a code stub |
| `generate.ts`   | 567     | `return null`                        | Info     | False positive — legitimate early return for empty-repo short-circuit in cache wrapper        |
| `tracker.ts`    | 170     | `return null`                        | Info     | False positive — legitimate guard: no cache data for round means no savings                   |
| `components.ts` | 320-322 | `return null`                        | Info     | False positive — legitimate guards in `computeParallelSavings()`                              |

No blocker or warning anti-patterns found. All flagged items are legitimate code patterns.

### Human Verification Required

The following behaviors require runtime observation:

#### 1. Prompt Cache Activation

**Test:** Run `handover generate` twice in the same directory using Anthropic Claude. Compare output token counts on round 2+.
**Expected:** Second run shows `cacheReadTokens > 0` in Anthropic API response; per-round savings lines appear in terminal output for rounds 2-6.
**Why human:** Requires live Anthropic API calls to verify cache hits occur; cannot verify from static code alone that Anthropic's cache TTL and eligibility criteria are met.

#### 2. Incremental Run Label Display

**Test:** Run `handover generate` twice; modify one source file between runs.
**Expected:** Second run terminal shows "Incremental run (1 file changed)" in file coverage line, with unchanged file count shown.
**Why human:** Requires actual `.handover/cache/analysis.json` to be populated on first run and read on second run; end-to-end flow through filesystem.

#### 3. BPE Token Count Accuracy

**Test:** Run with an OpenAI provider; compare estimated budget to actual tokens returned.
**Expected:** Token estimates are within 5% of actual API-reported counts (not the 15-25% error of chars/4 heuristic).
**Why human:** Requires live OpenAI API calls; programmatic verification would require running the tokenizer against test inputs.

#### 4. Parallel Rendering Time Savings

**Test:** Run `handover generate` with a large doc set; observe completion summary.
**Expected:** "Rendered N docs in Xs (saved ~Ys vs sequential)" line appears when render savings > 500ms.
**Why human:** Savings threshold (500ms) only triggers on runs with meaningful doc sets; render timing is wall-clock dependent.

### Gaps Summary

No gaps found. All 11 observable truths are verified against the actual codebase. All key links are wired and substantive (not stubs). The implementations match the plan specifications with two documented deviations (both auto-fixed: `RoundExecutionResult` has no `usage` field, so cache tokens are read via `tracker.getRoundUsage()`; `terminal-renderer.ts` does not exist as a separate file — `TerminalRenderer` lives in `renderer.ts`).

Commits are all verified present in git history:

- `2255fdd` — getChangedFiles() and changedFiles tier forcing
- `7e61328` — generate.ts incremental wiring
- `065efdc` — Anthropic prompt caching and Usage schema extension
- `47fcf30` — gpt-tokenizer BPE tokenization
- `c063aff` — per-round savings display and incremental label
- `4b3aa94` — parallel rendering and savings wiring

---

_Verified: 2026-02-19T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
