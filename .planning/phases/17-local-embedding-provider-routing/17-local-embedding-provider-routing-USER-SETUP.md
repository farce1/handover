# Phase 17 Local Embedding Provider Routing - User Setup

Status: Incomplete (requires local runtime setup)

## Why this setup is required

Local embedding health checks and local embedding modes require a reachable Ollama-compatible endpoint.

## Environment Variables

None required for local Ollama health checks.

## Manual Setup Checklist

- [ ] Install and start Ollama (or compatible local embedding service).
- [ ] Verify endpoint is reachable at `http://localhost:11434` (or your configured `embedding.local.baseUrl`).
- [ ] Pull the selected embedding model:

```bash
ollama pull <model>
```

## Local Configuration Example

Add/update `.handover.yml`:

```yaml
embedding:
  mode: local-preferred
  local:
    baseUrl: http://localhost:11434
    model: embeddinggemma
```

## Verification Commands

```bash
npm run dev -- embedding-health
npm run dev -- reindex --embedding-mode local-only --verbose
npm run dev -- search "architecture" --embedding-mode local-only
```

Expected:
- `embedding-health` reports ready in success mode.
- `reindex` and `search` include `Embedding route: mode ..., provider ...` lines.
