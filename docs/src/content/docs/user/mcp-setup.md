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

## Troubleshooting

| Symptom                                                                  | Likely cause                                                          | Fix                                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Client cannot connect to server                                          | `handover` command not on PATH                                        | Use absolute command path or `npx -y handover-cli serve`                           |
| Server exits with missing docs/index error                               | `handover generate` or `handover reindex` not run in this project     | Run both commands in project root, then reconnect                                  |
| MCP protocol error or malformed JSON                                     | Non-MCP stdout output from wrappers/scripts                           | Run `handover serve` directly; do not wrap with shell scripts that print to stdout |
| `semantic_search` returns error with code `SEARCH_INVALID_INPUT`         | Invalid tool args (empty query, non-numeric limit, invalid type list) | Send `query` as non-empty string, `limit` as integer 1-50, `types` as string array |
| `semantic_search` returns `SEARCH_INDEX_MISSING` or `SEARCH_INDEX_EMPTY` | Search index database missing or empty                                | Run `handover reindex` and retry                                                   |

## Verification checklist

- [ ] Client shows `handover` server as connected.
- [ ] Resource listing includes `handover://docs/*` and `handover://analysis/*` entries.
- [ ] Run `semantic_search` with `{ "query": "architecture" }` and confirm a successful response shape.
- [ ] Confirm each result includes `relevance`, `source`, `section`, and `snippet`.
- [ ] Run a no-match query and confirm success with `results: []` (not a tool failure).
