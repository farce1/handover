---
title: Regeneration
---

# Regeneration

After your first `handover generate`, you usually do not need to regenerate everything from scratch. Use `--since` for git-aware incremental regeneration and let cache fingerprints skip unchanged work.

## Incremental regeneration

Use `--since <ref>` to re-analyze only files changed since a git ref:

```bash
handover generate --since HEAD~3
handover generate --since main
handover generate --since v1.0
```

When `--since` is set, handover combines `git diff` and `git status` so it catches both committed and uncommitted changes (including untracked files).

If no files changed since the ref, handover exits early with a no-op message instead of running all AI rounds.

Use this mode when you changed a focused area and want faster runs with lower API usage.

## Cache behavior

handover uses content-hash caching in `.handover/cache/`:

- `analysis.json` stores per-file fingerprints for change detection.
- `rounds/round-N.json` stores AI round outputs keyed by content and dependency hashes.

Default behavior:

- unchanged inputs reuse cached round results
- changed inputs trigger fresh round execution
- cached values stay valid only when hash inputs match exactly

Use `--no-cache` to skip cache reads and force fresh execution:

```bash
handover generate --no-cache
```

`--since` and cache work together: git limits what is considered changed, and content hashes determine which downstream round outputs can be safely reused.

## Non-git fallback

If git-aware regeneration cannot run safely, handover warns and falls back to content-hash mode.

| Environment    | Behavior                                       |
| -------------- | ---------------------------------------------- |
| Not a git repo | Warns and falls back to content-hash mode      |
| Detached HEAD  | Warns and falls back to content-hash mode      |
| Shallow clone  | Warns and falls back to content-hash mode      |
| Invalid ref    | Fails with an explicit `Invalid git ref` error |

Fallback keeps regeneration functional even outside normal branch history contexts.

## Flags reference

| Flag            | Description                                 |
| --------------- | ------------------------------------------- |
| `--since <ref>` | Re-analyze files changed since this git ref |
| `--no-cache`    | Skip cache reads and run rounds fresh       |

## Next steps

- [getting started](/handover/user/getting-started/) for first-run workflow
- [search](/handover/user/search/) for querying generated docs
- [configuration](/handover/user/configuration/) for output and provider settings
