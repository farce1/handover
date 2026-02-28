# Phase 26 Plan 01: Runtime Validation Runbook (CLI Pipeline, Search, Embeddings)

Date: 2026-02-28
Requirements covered: `VAL-01`, `VAL-02`, `VAL-05`
Target repo: `handover` (this repository)

## Results Summary

| Scenario | Requirement | Risk | PASS | FAIL | SKIP | Notes |
|---|---|---|---|---|---|---|
| S-01: End-to-end generate then reindex | VAL-01 | HIGH | [ ] | [ ] | [ ] | |
| S-02: Incremental reindex skip | VAL-01 | MEDIUM | [ ] | [ ] | [ ] | |
| S-03: Incremental reindex on modified doc | VAL-01 | MEDIUM | [ ] | [ ] | [ ] | |
| S-04: Index integrity check | VAL-01 | MEDIUM | [ ] | [ ] | [ ] | |
| S-05: Keyword semantic search | VAL-02 | HIGH | [ ] | [ ] | [ ] | |
| S-06: QA mode search | VAL-02 | HIGH | [ ] | [ ] | [ ] | |
| S-07: TTY vs non-TTY output | VAL-02 | LOW | [ ] | [ ] | [ ] | |
| S-08: Local-only embedding route | VAL-05 | MEDIUM | [ ] | [ ] | [ ] | |
| S-09: Remote-only embedding route | VAL-05 | MEDIUM | [ ] | [ ] | [ ] | |
| S-10: Local-preferred with local unavailable | VAL-05 | HIGH | [ ] | [ ] | [ ] | |

## Prerequisites

1. Node.js 20+ and npm installed.
2. Build artifacts available:
```bash
npm run build
```
3. A real provider key is set (at least one of: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.).
4. `sqlite3` is installed (required for index checks).
5. For `VAL-05`, Ollama is installed and local model is pulled:
```bash
ollama pull nomic-embed-text
```
6. Run all commands from repo root: `/absolute/path/to/handover`.
7. Ensure `handover` command resolves. If not globally installed, use `node dist/index.js` in place of `handover`.

## Scenario Format

Every scenario below uses this structure:
- `Requirement`
- `Risk`
- `Setup`
- `Steps`
- `Expected`
- `Pass gate`
- `Fail gate`
- `Result`

### S-01: End-to-end generate then reindex

**Requirement:** `VAL-01`  
**Risk:** HIGH

**Setup:**
1. Ensure a provider key is exported for the provider you plan to use.
2. Select provider (`anthropic` shown below; replace if needed).
3. Clean previous outputs:
```bash
rm -rf handover .handover/search.db
```

**Steps:**
1. Generate documentation:
```bash
handover generate --provider anthropic --verbose
```
2. Build vector index:
```bash
handover reindex --verbose
```
3. Verify generated markdown document count:
```bash
find handover -maxdepth 1 -name '*.md' | wc -l
```
4. Verify chunk count:
```bash
sqlite3 .handover/search.db "SELECT COUNT(*) FROM chunks;"
```

**Expected:**
- `generate` exits `0`.
- `reindex` exits `0`.
- `find ... | wc -l` returns `14`.
- `chunks` query returns a value greater than `50`.

**Pass gate:** Both commands succeed, document count is `14`, and chunk count is `> 50`.  
**Fail gate:** Any command exits non-zero, docs are missing, or chunk count is `0`/unexpectedly low.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-02: Incremental reindex skip

**Requirement:** `VAL-01`  
**Risk:** MEDIUM

**Setup:**
1. Complete `S-01` first so index and docs already exist.
2. Do not modify generated docs before this scenario.

**Steps:**
1. Re-run reindex:
```bash
handover reindex --verbose 2>&1 | tee /tmp/phase26-s02-reindex.log
```
2. Check skip markers:
```bash
grep -E "Skipping unchanged|All [0-9]+ documents unchanged" /tmp/phase26-s02-reindex.log
```
3. Check summary line:
```bash
grep -E "Summary: processed 0, skipped [1-9][0-9]*" /tmp/phase26-s02-reindex.log
```

**Expected:**
- Output shows unchanged documents being skipped.
- Summary reports `processed 0` and non-zero skipped docs.

**Pass gate:** Skip evidence appears and summary confirms no re-embed work was needed.  
**Fail gate:** Reindex reprocesses many docs without any content changes.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-03: Incremental reindex on modified doc

**Requirement:** `VAL-01`  
**Risk:** MEDIUM

**Setup:**
1. Complete `S-01`.
2. Pick one generated file to mutate for the test.

**Steps:**
1. Append a marker line to one generated file:
```bash
echo "" >> handover/03-ARCHITECTURE.md
echo "<!-- phase-26-s03 marker -->" >> handover/03-ARCHITECTURE.md
```
2. Re-run reindex:
```bash
handover reindex --verbose 2>&1 | tee /tmp/phase26-s03-reindex.log
```
3. Verify the changed doc was detected:
```bash
grep -F "Changed: 03-ARCHITECTURE.md" /tmp/phase26-s03-reindex.log
```
4. Verify only one doc was reprocessed:
```bash
grep -E "Summary: processed 1, skipped [1-9][0-9]*" /tmp/phase26-s03-reindex.log
```

**Expected:**
- Exactly one document is processed.
- Remaining documents are skipped as unchanged.

**Pass gate:** Reindex shows the edited file as changed and summary reports `processed 1`.  
**Fail gate:** Multiple files are unexpectedly reprocessed or changed file is not detected.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-04: Index integrity check

**Requirement:** `VAL-01`  
**Risk:** MEDIUM

**Setup:**
1. Complete `S-01` (and optionally `S-03`) so index is populated.

**Steps:**
1. Run integrity queries:
```bash
sqlite3 .handover/search.db "SELECT COUNT(*) AS chunks FROM chunks; SELECT COUNT(DISTINCT source) AS sources FROM chunks;"
```

**Expected:**
- First line (`chunks`) is greater than `50`.
- Second line (`sources`) is a plausible non-zero document count (typically near `14`).

**Pass gate:** Both query values are non-zero and consistent with a populated index.  
**Fail gate:** Missing DB, query errors, zero chunks, or implausible source counts.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-05: Keyword semantic search

**Requirement:** `VAL-02`  
**Risk:** HIGH

**Setup:**
1. Complete `S-01` so search index is available.

**Steps:**
1. Run keyword searches:
```bash
handover search "authentication flow" --top-k 5
handover search "database schema" --top-k 5
handover search "error handling patterns" --top-k 5
```
2. Inspect top results for topical relevance (`source`, `section`, `snippet`).

**Expected:**
- Results include ranked entries with relevance percentages.
- Top snippets are clearly related to each query.

**Pass gate:** Top result is clearly relevant for at least `2` out of `3` queries.  
**Fail gate:** Most top results are off-topic or empty despite populated index.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-06: QA mode search

**Requirement:** `VAL-02`  
**Risk:** HIGH

**Setup:**
1. Complete `S-01`.
2. Ensure provider credentials are still valid for synthesis mode.

**Steps:**
1. Run QA mode:
```bash
handover search "How does the DAG orchestrator work?" --mode qa --top-k 10
```

**Expected:**
- Output includes an `Answer` section.
- Output includes `Sources` with at least one citation line.

**Pass gate:** Answer references DAG/orchestration behavior and includes citation(s).  
**Fail gate:** QA mode fails due to provider/config issues or returns uncited/non-answer output.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-07: TTY vs non-TTY output

**Requirement:** `VAL-02`  
**Risk:** LOW

**Setup:**
1. Complete `S-01`.

**Steps:**
1. Run in interactive TTY:
```bash
handover search "testing strategy" --top-k 3
```
2. Run in non-TTY pipeline:
```bash
handover search "testing strategy" --top-k 3 | cat
```

**Expected:**
- Both runs are readable and include search results.
- Non-TTY output remains parseable plain text.

**Pass gate:** Both modes produce valid readable results without corruption.  
**Fail gate:** Output corruption, missing fields, or unreadable piped output.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-08: Local-only embedding route

**Requirement:** `VAL-05`  
**Risk:** MEDIUM

**Setup:**
1. Ensure Ollama daemon is running.
2. Ensure `nomic-embed-text` model exists:
```bash
ollama list | grep nomic-embed-text
```
3. Remove old index metadata before mode switch:
```bash
rm -f .handover/search.db
```

**Steps:**
1. Reindex in local-only mode:
```bash
handover reindex --embedding-mode local-only --verbose
```

**Expected:**
- Reindex completes successfully.
- Output contains: `Embedding route: mode local-only, provider local.`

**Pass gate:** Command exits `0` and route line confirms local provider.  
**Fail gate:** Local provider availability errors or route reports remote provider.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-09: Remote-only embedding route

**Requirement:** `VAL-05`  
**Risk:** MEDIUM

**Setup:**
1. Keep generated docs from earlier scenarios.
2. Remove old index metadata before switching from local to remote:
```bash
rm -f .handover/search.db
```

**Steps:**
1. Reindex in remote-only mode:
```bash
handover reindex --embedding-mode remote-only --verbose
```

**Expected:**
- Reindex completes successfully.
- Output contains: `Embedding route: mode remote-only, provider remote.`

**Pass gate:** Command exits `0` and route line confirms remote provider.  
**Fail gate:** Route does not match mode or command fails before indexing.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-10: Local-preferred with local unavailable

**Requirement:** `VAL-05`  
**Risk:** HIGH

**Setup:**
1. Stop Ollama so local embeddings are unavailable.
2. Keep generated docs available.

**Steps:**
1. Stop Ollama (choose the method that matches your environment):
```bash
pkill -f "ollama" || true
```
2. Run reindex in non-interactive context and capture exit:
```bash
set +e
CI=1 handover reindex --embedding-mode local-preferred --verbose 2>&1 | tee /tmp/phase26-s10-local-preferred.log
status=$?
set -e
echo "exit_code=$status"
```
3. Check for explicit confirmation-required error:
```bash
grep -F "EMBEDDING_CONFIRMATION_REQUIRED" /tmp/phase26-s10-local-preferred.log
```

**Expected:**
- Command exits non-zero.
- Error includes `EMBEDDING_CONFIRMATION_REQUIRED`.
- Remediation guidance is printed (rerun interactively or remote-only).

**Pass gate:** Non-zero exit with explicit confirmation-required error (no silent remote fallback).  
**Fail gate:** Command silently falls back to remote without confirmation semantics.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

## Cleanup

1. Revert scenario mutation from `S-03`:
```bash
git checkout -- handover/03-ARCHITECTURE.md
```
2. Optionally remove validation artifacts:
```bash
rm -rf handover .handover
```
3. Restart Ollama if needed:
```bash
ollama serve
```

