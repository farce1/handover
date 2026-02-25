---
title: MCP setup
---

# MCP setup

Use this guide to connect handover's MCP server to Claude Desktop, Cursor, or VS Code.

## Quickstart

1. Generate docs and search index in your project:

```bash
handover generate
handover reindex
```

2. Confirm the MCP server starts cleanly:

```bash
handover serve
```

Expected stderr output includes `MCP server listening on stdio.`

3. Add one of the client configs below.

4. Restart the client and run the verification checklist at the end of this document.

## Claude Desktop

Add this server under `mcpServers` in Claude Desktop config.

```json
{
  "mcpServers": {
    "handover": {
      "command": "handover",
      "args": ["serve"],
      "cwd": "/absolute/path/to/your/project"
    }
  }
}
```

- macOS config path: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows config path: `%APPDATA%\\Claude\\claude_desktop_config.json`

## Cursor

Add this server in Cursor MCP settings.

```json
{
  "mcpServers": {
    "handover": {
      "command": "handover",
      "args": ["serve"],
      "cwd": "/absolute/path/to/your/project"
    }
  }
}
```

If your environment does not include global npm binaries, use `npx`:

```json
{
  "mcpServers": {
    "handover": {
      "command": "npx",
      "args": ["-y", "handover-cli", "serve"],
      "cwd": "/absolute/path/to/your/project"
    }
  }
}
```

## VS Code

Add this to VS Code MCP server configuration.

```json
{
  "servers": {
    "handover": {
      "type": "stdio",
      "command": "handover",
      "args": ["serve"],
      "cwd": "/absolute/path/to/your/project"
    }
  }
}
```

If needed, swap `command`/`args` to the same `npx` variant shown in the Cursor section.

## Remote regeneration workflow

Use these MCP tool calls to trigger and monitor regeneration jobs from remote clients.

### 1) Trigger regeneration with `regenerate_docs`

Default behavior (no target) regenerates full project docs and search index.

```json
{
  "name": "regenerate_docs",
  "arguments": {}
}
```

Named target examples:

```json
{
  "name": "regenerate_docs",
  "arguments": { "target": "docs" }
}
```

```json
{
  "name": "regenerate_docs",
  "arguments": { "target": "search-index" }
}
```

Supported targets:

- `full-project` (default): run `generate`, then `reindex`
- `docs`: run `generate` only
- `search-index`: run `reindex` only

Successful trigger shape:

```json
{
  "ok": true,
  "jobId": "81f5c6d5-4de1-4b72-96be-5c3e5ae22d6b",
  "state": "queued",
  "target": {
    "key": "full-project",
    "requested": "full-project",
    "canonical": "full-project"
  },
  "createdAt": "2026-02-24T19:00:00.000Z",
  "dedupe": {
    "joined": false,
    "key": "full-project",
    "reason": "none"
  },
  "next": {
    "tool": "regenerate_docs_status",
    "message": "Poll regenerate_docs_status with this job ID until the job reaches a terminal state.",
    "pollAfterMs": 750
  }
}
```

If a second request hits the same in-flight target, you get the same `jobId` with dedupe join signaling:

```json
{
  "ok": true,
  "jobId": "81f5c6d5-4de1-4b72-96be-5c3e5ae22d6b",
  "dedupe": {
    "joined": true,
    "key": "full-project",
    "reason": "in_flight_target"
  }
}
```

### 2) Poll status with `regenerate_docs_status`

```json
{
  "name": "regenerate_docs_status",
  "arguments": { "jobId": "81f5c6d5-4de1-4b72-96be-5c3e5ae22d6b" }
}
```

Status response includes deterministic lifecycle state and progress summary:

```json
{
  "ok": true,
  "jobId": "81f5c6d5-4de1-4b72-96be-5c3e5ae22d6b",
  "state": "running",
  "lifecycle": {
    "stage": "running",
    "progressPercent": 50,
    "summary": "Regeneration is actively running for the requested target."
  },
  "next": {
    "tool": "regenerate_docs_status",
    "message": "Poll regenerate_docs_status with this job ID until the job reaches a terminal state.",
    "pollAfterMs": 750
  }
}
```

Keep polling until terminal state `completed` or `failed`.

### 3) Remediation examples

Unknown target:

```json
{
  "ok": false,
  "error": {
    "code": "REGENERATION_TARGET_UNKNOWN",
    "message": "Unknown regeneration target: everything",
    "action": "Use one of: full-project, docs, search-index."
  }
}
```

Failed job:

```json
{
  "ok": false,
  "error": {
    "code": "REGENERATION_GENERATE_FAILED",
    "message": "Regeneration subcommand failed: generate",
    "action": "Resolve the generate failure and retry regenerate_docs."
  }
}
```

## HTTP transport mode

`handover serve` uses stdio by default, but you can run Streamable HTTP when you want to connect over a networked endpoint.

Start HTTP mode:

```bash
# Start with HTTP transport
handover serve --transport http

# Customize port and host
handover serve --transport http --port 8080
handover serve --transport http --host 0.0.0.0 --port 8080
```

Or configure `.handover.yml`:

```yaml
serve:
  transport: http
  http:
    port: 3000
    host: 127.0.0.1
    path: /mcp
```

When HTTP mode starts, stderr includes endpoint discovery details:

```text
MCP server listening over HTTP.
Transport: http
Base URL: http://127.0.0.1:3000
MCP path: /mcp
Endpoint: http://127.0.0.1:3000/mcp
Ready: POST/GET/DELETE requests accepted at MCP endpoint.
```

Use any MCP client that supports Streamable HTTP and point it to `http://127.0.0.1:3000/mcp` (or your configured host/port/path).

HTTP and stdio expose the same tools, resources, and prompts.

For the current run, CLI flags override config values from `.handover.yml` (for example, `--transport` and `--port`).

## Troubleshooting

| Symptom                                                                  | Likely cause                                                          | Fix                                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Client cannot connect to server                                          | `handover` command not on PATH                                        | Use absolute command path or `npx -y handover-cli serve`                           |
| Server exits with missing docs/index error                               | `handover generate` or `handover reindex` not run in this project     | Run both commands in project root, then reconnect                                  |
| MCP protocol error or malformed JSON                                     | Non-MCP stdout output from wrappers/scripts                           | Run `handover serve` directly; do not wrap with shell scripts that print to stdout |
| `semantic_search` returns error with code `SEARCH_INVALID_INPUT`         | Invalid tool args (empty query, non-numeric limit, invalid type list) | Send `query` as non-empty string, `limit` as integer 1-50, `types` as string array |
| `semantic_search` returns `SEARCH_INDEX_MISSING` or `SEARCH_INDEX_EMPTY` | Search index database missing or empty                                | Run `handover reindex` and retry                                                   |
| `regenerate_docs` returns `REGENERATION_TARGET_UNKNOWN`                  | Unknown target passed to tool call                                    | Retry with one of `full-project`, `docs`, or `search-index`                        |
| `regenerate_docs_status` returns `JOB_NOT_FOUND`                         | Unknown or expired job reference                                      | Trigger a new run with `regenerate_docs` and poll the returned `jobId`             |
| Regeneration status reaches `failed`                                     | Generate/reindex subcommand failed in executor                        | Follow `error.action`, fix root issue, then call `regenerate_docs` again           |

## Verification checklist

- [ ] Client shows `handover` server as connected.
- [ ] Resource listing includes `handover://docs/*` and `handover://analysis/*` entries.
- [ ] Run `semantic_search` with `{ "query": "architecture" }` and confirm a successful response shape.
- [ ] Confirm each result includes `relevance`, `source`, `section`, and `snippet`.
- [ ] Run a no-match query and confirm success with `results: []` (not a tool failure).
- [ ] Run `regenerate_docs` and verify response includes `jobId`, `state`, and `dedupe` fields.
- [ ] Poll `regenerate_docs_status` with that `jobId` until `state` is `completed` or `failed`.
