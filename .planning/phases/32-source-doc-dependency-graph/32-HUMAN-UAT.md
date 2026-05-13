---
status: partial
phase: 32-source-doc-dependency-graph
source: [32-VERIFICATION.md]
started: 2026-05-13T11:53:24Z
updated: 2026-05-13T11:53:24Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Full real-LLM run creates the dep-graph.json
expected: After a successful end-to-end `handover generate` run with API keys, `.handover/cache/dep-graph.json` exists with `graphVersion: 1`, 13 renderer keys, ISO-8601 `builtAt`, and a non-empty `infrastructureFiles` list. Confirm with: `jq '.graphVersion'` returns 1; `jq '.renderers | keys | length'` returns 13; `jq '.infrastructurePaths'` matches the curated D-12 seed list; `jq '.infrastructureFiles | length'` > 0.
result: [pending]

### 2. Surgical --since regen against a real prior run
expected: Commit a one-line change to a non-infra file (e.g. `src/orchestrator/dag.ts`), run `handover generate --since HEAD~1`, then inspect `handover/00-INDEX.md`. Fewer than 14 renderers actually execute (status `reused` for unchanged docs); INDEX shows ≥1 row labelled `Reused (last: <ISO>)`.
result: [pending]

### 3. Infrastructure-file-only change is a true no-op end-to-end (SC-4 live confirmation)
expected: Touch `src/utils/logger.ts` only, commit, then `handover generate --dry-run --since HEAD~1`. `wouldExecute` contains only `00-index` (always-renders) and renderers whose registry entry directly includes `logger.ts` (none — the file is in INFRASTRUCTURE_PATHS); JSON `fellBackToFullRegen` should be `false`; reasons should be `(always renders)` for INDEX only.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
