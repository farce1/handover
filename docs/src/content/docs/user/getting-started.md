---
title: Getting started
---

# Getting started

handover scans a codebase and produces 14 interconnected markdown documents that explain the project end-to-end. This guide takes you from install to first output.

## Prerequisites

- **Node.js >= 18** — check with `node --version`
- **An LLM API key** — Anthropic is the default; see [providers](./providers/) for alternatives. Ollama works without an API key.

## Install

### Zero-install (recommended)

```bash
npx handover-cli generate
```

No global install required. npm downloads and runs the latest version on each call.

### Global install

```bash
npm install -g handover-cli
handover generate
```

### Project dependency

```bash
npm install --save-dev handover-cli
npx handover generate
```

## First run

**1. Set your API key:**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**2. Run in any project directory:**

```bash
npx handover-cli generate
```

That's all that's required. handover uses sensible defaults and needs no config file.

**3. View output:**

Output lands in `./handover/` by default:

```
handover/
  00-INDEX.md
  01-PROJECT-OVERVIEW.md
  02-GETTING-STARTED.md
  03-ARCHITECTURE.md
  04-FILE-STRUCTURE.md
  05-FEATURES.md
  06-MODULES.md
  07-DEPENDENCIES.md
  08-ENVIRONMENT.md
  09-EDGE-CASES-AND-GOTCHAS.md
  10-TECH-DEBT-AND-TODOS.md
  11-CONVENTIONS.md
  12-TESTING-STRATEGY.md
  13-DEPLOYMENT.md
```

### Example: what output looks like

The opening of `01-PROJECT-OVERVIEW.md` in a typical project:

```markdown
---
title: Project Overview
documentId: 01-project-overview
status: complete
---

# Project Overview

my-app is a Node.js REST API for managing customer orders. Built with TypeScript,
it exposes a GraphQL interface backed by PostgreSQL and is deployed to AWS Lambda.

## What This Project Does

Provides order lifecycle management — creation, payment, fulfilment, and returns —
via a GraphQL API consumed by the company's mobile and web clients.
```

## Common options

| Flag                | Description                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| `--provider <name>` | LLM provider (`anthropic`, `openai`, `ollama`, …)                        |
| `--model <name>`    | Model name override                                                      |
| `--static-only`     | Static analysis only — no AI calls, no cost, no API key required         |
| `--audience <mode>` | `human` (default) or `ai` for RAG-optimized output                       |
| `--only <aliases>`  | Generate specific documents only (comma-separated, e.g. `overview,arch`) |

### Preview cost before running

```bash
npx handover-cli estimate
```

### Free static-only run (no API key needed)

```bash
npx handover-cli generate --static-only
```

Static-only mode runs all file-tree, dependency, git-history, and AST analysis without any AI calls. Documents are generated with the available static data; AI-enriched sections are noted as unavailable.

### Minimal config file

Create `.handover.yml` in your project root to customize behavior. The minimal useful config:

```yaml
provider: anthropic
output: docs/handover

project:
  name: My Project
  description: 'A brief description of what this project does'
```

Run the same command after creating the file — handover picks it up automatically:

```bash
npx handover-cli generate
```

## Next steps

- [configuration](./configuration/) — all 21 config keys with types, defaults, and valid values
- [providers](./providers/) — compare all 8 supported LLM providers
- [output-documents](./output-documents/) — understand all 14 generated documents before running
