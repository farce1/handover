---
title: Search
---

# Search

handover builds a semantic search index alongside generated documentation. Use `handover reindex` to build or refresh the index, then use `handover search` to query it.

## Building the index

Run `handover reindex` after `handover generate`:

```bash
handover reindex
```

Reindexing scans generated docs, chunks markdown sections, creates embeddings, and stores vectors in a local SQLite index (`.handover/search.db`).

Use `--force` to re-embed everything and ignore change detection:

```bash
handover reindex --force
```

Use `--embedding-mode` to control where embeddings are computed:

```bash
handover reindex --embedding-mode local-only
handover reindex --embedding-mode local-preferred
handover reindex --embedding-mode remote-only
```

By default, reindexing is incremental. It tracks fingerprints for each generated document and only re-embeds content that changed since the last run.

## Searching

Basic retrieval:

```bash
handover search "authentication"
```

`handover search` defaults to **fast mode** (`--mode fast`), which performs retrieval-only semantic ranking and returns matches with relevance scores.

QA mode synthesizes an answer from retrieved chunks:

```bash
handover search "How does auth work?" --mode qa
```

QA mode requires a working provider setup for answer generation. If provider setup is not ready, use fast mode until credentials are configured.

Fast-mode output includes:

- rank
- relevance percentage
- source file
- section path
- snippet

## Filtering results

Use flags to narrow or widen retrieval:

| Flag                      | Description                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `--type <type>`           | Filter by document type. Repeat the flag to include multiple types.                             |
| `--top-k <n>`             | Number of results to return. Default: `10`.                                                     |
| `--embedding-mode <mode>` | Override embedding locality for this search: `local-only`, `local-preferred`, or `remote-only`. |

Known `--type` values:

- `project-overview`
- `getting-started`
- `architecture`
- `file-structure`
- `features`
- `modules`
- `dependencies`
- `environment`
- `edge-cases-and-gotchas`
- `tech-debt-and-todos`
- `conventions`
- `testing-strategy`
- `deployment`

Examples:

```bash
handover search "dependency graph" --top-k 20
handover search "build pipeline" --type architecture --type modules
handover search "token handling" --type testing-strategy --embedding-mode local-only
```

## Quality signals

Search output includes signals to help you diagnose weak results:

- **Zero results + empty index:** run `handover generate`, then `handover reindex`.
- **Zero results + populated index:** refine terms, broaden/remove `--type` filters, or increase `--top-k`.
- **Low relevance warning:** if the best match is weak (distance above threshold), the CLI prints a warning.
- **TTY vs piped output:** TTY output uses clickable OSC8 `file://` links; piped output prints plain source paths.

## Next steps

- [configuration](/handover/user/configuration/) for embedding and output settings
