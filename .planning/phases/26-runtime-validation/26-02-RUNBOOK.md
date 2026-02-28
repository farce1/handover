# Phase 26 Plan 02: Runtime Validation Runbook (MCP Clients, Streaming QA, Regeneration)

Date: 2026-02-28
Requirements covered: `VAL-03`, `VAL-04`, `VAL-06`
Target repo: `handover` (this repository)

## Results Summary

| Scenario | Requirement | Client | Risk | PASS | FAIL | SKIP | Notes |
|---|---|---|---|---|---|---|---|
| S-01: Tool/resource discovery (Claude Desktop) | VAL-03 | Claude Desktop | HIGH | [ ] | [ ] | [ ] | |
| S-02: Semantic search via MCP (Claude Desktop) | VAL-03 | Claude Desktop | HIGH | [ ] | [ ] | [ ] | |
| S-03: Tool/resource discovery (Cursor) | VAL-03 | Cursor | MEDIUM | [ ] | [ ] | [ ] | |
| S-04: Semantic search via MCP (Cursor) | VAL-03 | Cursor | MEDIUM | [ ] | [ ] | [ ] | |
| S-05: Tool/resource discovery (VS Code) | VAL-03 | VS Code | MEDIUM | [ ] | [ ] | [ ] | |
| S-06: Semantic search via MCP (VS Code) | VAL-03 | VS Code | MEDIUM | [ ] | [ ] | [ ] | |
| S-07: QA stream start with progress | VAL-04 | Any MCP client (Claude preferred) | HIGH | [ ] | [ ] | [ ] | |
| S-08: QA stream status check | VAL-04 | Any MCP client | HIGH | [ ] | [ ] | [ ] | |
| S-09: QA stream resume after disconnect | VAL-04 | Any MCP client | HIGH | [ ] | [ ] | [ ] | |
| S-10: Regeneration trigger | VAL-06 | Any MCP client | HIGH | [ ] | [ ] | [ ] | |
| S-11: Regeneration status polling | VAL-06 | Any MCP client | HIGH | [ ] | [ ] | [ ] | |
| S-12: Regeneration dedupe on duplicate trigger | VAL-06 | Any MCP client | MEDIUM | [ ] | [ ] | [ ] | |

## Prerequisites

1. `handover generate` and `handover reindex` already completed (14 docs + populated index required).
2. Build artifacts exist:
```bash
npm run build
```
3. At least two MCP-capable clients are installed: Claude Desktop, Cursor, VS Code.
4. Provider key is available in environment for QA/regeneration tool operations.
5. Run from repo root. If `handover` is not globally installed, use `node dist/index.js`.
6. Confirm MCP server binary path for your machine:
```bash
pwd
ls dist/index.js
```

## Client Setup

### Claude Desktop

```json
// macOS: ~/.config/claude/claude_desktop_config.json
// Windows: %APPDATA%\\Claude\\claude_desktop_config.json
{
  "mcpServers": {
    "handover": {
      "command": "node",
      "args": ["/absolute/path/to/handover/dist/index.js", "serve"],
      "cwd": "/absolute/path/to/handover"
    }
  }
}
```

Restart Claude Desktop after updating config.

### Cursor

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "handover": {
      "command": "node",
      "args": ["dist/index.js", "serve"],
      "cwd": "."
    }
  }
}
```

Restart Cursor or reload window after config changes.

### VS Code (Copilot Chat MCP)

```json
// .vscode/mcp.json
{
  "servers": {
    "handover": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js", "serve"]
    }
  }
}
```

Reload VS Code after config changes.

## Troubleshooting Notes

- `MCP_DOCS_MISSING`: run `handover generate` first so required markdown docs exist.
- JSON-RPC corruption symptoms (malformed JSON / protocol errors): ensure server startup logs stay on stderr; stdout must be protocol-only.
- Connection refused/server not found: verify absolute binary path (`dist/index.js`), working directory, and client restart.
- For stream status/resume, use `lastAckSequence` (not `cursor`).

### S-01: Tool and resource discovery (Claude Desktop)

**Requirement:** `VAL-03`  
**Risk:** HIGH

**Setup:**
1. Configure Claude Desktop MCP entry and restart client.
2. Open a fresh conversation.

**Steps:**
1. Verify `handover` MCP server appears connected in client UI.
2. Call MCP `resources/list`.
3. From returned URIs, call `resources/read` for at least one `handover://docs/...` URI.
4. Confirm tool list includes `semantic_search` with `query`, `limit`, `types`.

**Expected:**
- Connection is healthy.
- `resources/list` returns resources.
- `resources/read` returns markdown contents.
- `semantic_search` tool is discoverable with expected parameters.

**Pass gate:** Connected server + readable resource + visible `semantic_search` tool schema.  
**Fail gate:** Cannot connect, resources empty/unreadable, or tool missing.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-02: Semantic search via MCP tool (Claude Desktop)

**Requirement:** `VAL-03`  
**Risk:** HIGH

**Setup:**
1. Complete `S-01`.

**Steps:**
1. Call tool `semantic_search` with:
```json
{
  "query": "architecture overview",
  "limit": 5
}
```

**Expected:**
- Structured payload includes:
  - `ok: true`
  - `results` array
  - each result has `relevance`, `source`, `section`, `snippet`

**Pass gate:** `ok: true` with at least one result entry.  
**Fail gate:** Tool error, malformed payload, or empty results on known populated index.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-03: Tool and resource discovery (Cursor)

**Requirement:** `VAL-03`  
**Risk:** MEDIUM

**Setup:**
1. Configure `.cursor/mcp.json`.
2. Reload Cursor window.

**Steps:**
1. Confirm MCP `handover` server is connected.
2. Call `resources/list`.
3. Call `resources/read` on at least one `handover://docs/...` URI.
4. Verify `semantic_search` tool appears with expected input fields.

**Expected:**
- Resource discovery/read works in Cursor transport path.

**Pass gate:** Connection + resource read + tool visibility all succeed.  
**Fail gate:** Any of the three capability checks fails.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-04: Semantic search via MCP tool (Cursor)

**Requirement:** `VAL-03`  
**Risk:** MEDIUM

**Setup:**
1. Complete `S-03`.

**Steps:**
1. Call `semantic_search`:
```json
{
  "query": "architecture overview",
  "limit": 5
}
```

**Expected:**
- Response payload returns `ok: true` and at least one structured result.

**Pass gate:** Successful result payload with non-empty `results`.  
**Fail gate:** Tool call fails or returns invalid structure.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-05: Tool and resource discovery (VS Code)

**Requirement:** `VAL-03`  
**Risk:** MEDIUM

**Setup:**
1. Configure `.vscode/mcp.json`.
2. Reload VS Code window.

**Steps:**
1. Confirm `handover` MCP server appears connected.
2. Call `resources/list`.
3. Call `resources/read` on one docs URI.
4. Confirm `semantic_search` tool availability and expected fields.

**Expected:**
- Discovery and resource read behave correctly in VS Code MCP integration.

**Pass gate:** All three checks pass: connection, resources, tool availability.  
**Fail gate:** Missing connection, missing resources, or missing tool.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-06: Semantic search via MCP tool (VS Code)

**Requirement:** `VAL-03`  
**Risk:** MEDIUM

**Setup:**
1. Complete `S-05`.

**Steps:**
1. Call `semantic_search`:
```json
{
  "query": "architecture overview",
  "limit": 5
}
```

**Expected:**
- Response includes `ok: true`, and result entries with relevance/source/section/snippet.

**Pass gate:** Structured successful payload with at least one result.  
**Fail gate:** Invocation fails or payload does not match expected fields.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-07: QA stream start with progress

**Requirement:** `VAL-04`  
**Risk:** HIGH

**Setup:**
1. Use Claude Desktop if available (best progress visibility).
2. Ensure provider credentials are available.

**Steps:**
1. Call `qa_stream_start`:
```json
{
  "query": "How does the caching system work?",
  "topK": 10
}
```
2. Capture returned `sessionId`.
3. Observe whether progress notifications appear in client UI.

**Expected:**
- Response includes `ok: true`, `sessionId`, `state`, `events`.
- Final answer payload is present (`result` field).
- Multiple progress notifications may appear if run duration is long enough.

**Pass gate:** Valid `sessionId` plus completed answer payload. Progress notifications are a strong positive signal but not strictly required on very fast runs.  
**Fail gate:** Missing `sessionId`, missing final answer, or tool-level error.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-08: QA stream status check

**Requirement:** `VAL-04`  
**Risk:** HIGH

**Setup:**
1. Complete `S-07` and keep its `sessionId`.

**Steps:**
1. Call `qa_stream_status`:
```json
{
  "sessionId": "<session-id-from-s07>",
  "lastAckSequence": 0
}
```

**Expected:**
- Response includes `ok: true`, `state`, `lastSequence`, and non-empty `events`.

**Pass gate:** `events` array is non-empty and reflects session lifecycle events.  
**Fail gate:** Session lookup errors or empty event history for known completed session.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-09: QA stream resume after disconnect

**Requirement:** `VAL-04`  
**Risk:** HIGH

**Setup:**
1. Use a query likely to run long enough to test resume.
2. Record `sessionId` before disconnecting.

**Steps:**
1. Start a new stream:
```json
{
  "query": "Explain the full document generation pipeline from analysis through rendering",
  "topK": 20
}
```
2. Capture `sessionId`.
3. Disconnect/restart the MCP client (or toggle server connection).
4. Call `qa_stream_resume`:
```json
{
  "sessionId": "<new-session-id>",
  "lastAckSequence": 0
}
```

**Expected:**
- Resume succeeds with `ok: true`.
- Returned events replay missed lifecycle messages and may include completion.

**Pass gate:** Resume returns events without protocol/session errors.  
**Fail gate:** Resume fails despite valid session ID and cursor semantics.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-10: Regeneration trigger

**Requirement:** `VAL-06`  
**Risk:** HIGH

**Setup:**
1. Use any connected MCP client from previous scenarios.

**Steps:**
1. Call `regenerate_docs`:
```json
{
  "target": "docs"
}
```
2. Record `jobId`.

**Expected:**
- Response includes:
  - `ok: true`
  - `jobId`
  - `state: "queued" | "running"`
  - `dedupe.joined: false` on first trigger
  - `next.tool: "regenerate_docs_status"`

**Pass gate:** Valid job reference returned with expected fields and first-call dedupe state.  
**Fail gate:** Trigger rejected or no pollable job metadata returned.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-11: Regeneration status polling to completion

**Requirement:** `VAL-06`  
**Risk:** HIGH

**Setup:**
1. Complete `S-10` and keep the `jobId`.

**Steps:**
1. Poll `regenerate_docs_status` repeatedly:
```json
{
  "jobId": "<job-id-from-s10>"
}
```
2. Continue polling until `state` is terminal (`completed` or `failed`).

**Expected:**
- Legal progression through lifecycle states.
- Terminal response includes lifecycle summary.
- On completed jobs, `lifecycle.progressPercent` is `100`.

**Pass gate:** Terminal state reached with valid lifecycle metadata and no protocol errors.  
**Fail gate:** Invalid transitions, missing status payloads, or polling dead-end.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

### S-12: Regeneration dedupe on rapid duplicate trigger

**Requirement:** `VAL-06`  
**Risk:** MEDIUM

**Setup:**
1. Start a regeneration job and attempt duplicate trigger before completion.
2. If initial job finishes too quickly, this scenario can be marked `SKIP` with note.

**Steps:**
1. First call:
```json
{
  "target": "docs"
}
```
2. Immediately issue the same call again.
3. Compare `jobId` and `dedupe.joined` values.

**Expected:**
- Second call joins existing in-flight job:
  - same `jobId`
  - `dedupe.joined: true`

**Pass gate:** Duplicate call joins in-flight job and returns same `jobId`.  
**Fail gate:** Duplicate call creates a separate concurrent job for same target while first is still running.  
**Result:** [ ] PASS  [ ] FAIL  [ ] SKIP  Notes: __________

## Cleanup

1. Remove project-local MCP configs if they were added only for this run:
```bash
rm -f .cursor/mcp.json .vscode/mcp.json
```
2. Restore personal Claude Desktop config if temporary edits were made.
3. Keep this runbook with completed checkboxes as validation artifact.

