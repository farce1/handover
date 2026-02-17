# handover

Generate a complete knowledge base from any codebase with a single command.

## Quick Start

```bash
npx handover-cli generate
```

That's it. Run this in any project directory to generate 14 interconnected markdown documents explaining your codebase.

## What You Get

handover produces 14 documents that together form a comprehensive knowledge base:

| Document | Description |
|----------|-------------|
| `00-INDEX.md` | Master index with status and navigation |
| `01-PROJECT-OVERVIEW.md` | High-level purpose, tech stack, entry points |
| `02-GETTING-STARTED.md` | Setup instructions, first run, dev workflow |
| `03-ARCHITECTURE.md` | System design, patterns, module relationships |
| `04-FILE-STRUCTURE.md` | Directory tree with annotations |
| `05-FEATURES.md` | Feature inventory with code references |
| `06-MODULES.md` | Module-by-module deep dive |
| `07-DEPENDENCIES.md` | External deps, internal dep graph, risk assessment |
| `08-ENVIRONMENT.md` | Environment variables, secrets, config files |
| `09-EDGE-CASES.md` | Known gotchas, error handling patterns, failure modes |
| `10-TECH-DEBT.md` | TODOs, complexity hotspots, refactoring opportunities |
| `11-CONVENTIONS.md` | Coding patterns, naming, project-specific rules |
| `12-TESTING.md` | Test strategy, coverage, test file locations |
| `13-DEPLOYMENT.md` | Build process, CI/CD, deployment targets |

Documents are cross-referenced with links and include YAML front-matter for programmatic consumption.

## Installation

### Zero-install (recommended)

```bash
npx handover-cli generate
```

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

## Configuration

handover works with zero configuration. For customization, create a `.handover.yml` file in your project root:

```yaml
provider: anthropic
model: claude-sonnet-4-5
output: docs/handover
project:
  name: My Project
  description: "E-commerce platform for artisan goods"
exclude:
  - "**/*.generated.ts"
  - "legacy/**"
```

### Configuration Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider` | string | `anthropic` | LLM provider: `anthropic`, `openai`, `ollama`, `groq`, `together`, `deepseek`, `azure-openai`, `custom` |
| `model` | string | Provider default | Model name (see provider defaults below) |
| `output` | string | `./handover` | Output directory for generated documents |
| `audience` | string | `human` | `human` for readable docs, `ai` for RAG-optimized output |
| `include` | string[] | `["**/*"]` | Glob patterns for files to include |
| `exclude` | string[] | `[]` | Glob patterns for files to exclude |
| `context` | string | | Additional context about the project |
| `costWarningThreshold` | number | `1.00` | Show warning when estimated cost exceeds this amount (USD) |
| `apiKeyEnv` | string | Provider default | Custom environment variable name for API key |
| `baseUrl` | string | Provider default | Custom API endpoint URL |
| `timeout` | number | Provider default | Request timeout in milliseconds |

**Project metadata:**

| Field | Type | Description |
|-------|------|-------------|
| `project.name` | string | Project name override |
| `project.description` | string | Brief project description |
| `project.domain` | string | Business domain (e.g., "fintech", "healthcare") |
| `project.teamSize` | string | Team size context |
| `project.deployTarget` | string | Deployment target (e.g., "AWS", "Vercel") |

**Analysis options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `analysis.concurrency` | number | `4` | Max concurrent API calls |
| `analysis.staticOnly` | boolean | `false` | Run static analysis only (no AI cost) |

**Context window options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `contextWindow.maxTokens` | number | Auto-detected | Token budget override |
| `contextWindow.pin` | string[] | `[]` | Glob patterns for files that must be included in context |
| `contextWindow.boost` | string[] | `[]` | Glob patterns for files to prioritize in context |

## Provider Setup

handover supports 8 LLM providers. Set the appropriate environment variable and optionally configure the provider in `.handover.yml`.

### Anthropic (default)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx handover-cli generate
```

Default model: `claude-opus-4-6`. Also supports `claude-sonnet-4-5` and `claude-haiku-4-5`.

### OpenAI

```bash
export OPENAI_API_KEY=sk-...
npx handover-cli generate --provider openai
```

Or in `.handover.yml`:

```yaml
provider: openai
model: gpt-4o  # default
```

### Ollama (free, local)

No API key needed. Install Ollama, pull a model, and run:

```bash
ollama pull llama3.1:8b
npx handover-cli generate --provider ollama --model llama3.1:8b
```

Or in `.handover.yml`:

```yaml
provider: ollama
model: llama3.1:8b
```

All processing happens locally. No data leaves your machine.

### Groq

```bash
export GROQ_API_KEY=gsk_...
npx handover-cli generate --provider groq
```

Default model: `llama-3.3-70b-versatile`.

### Together

```bash
export TOGETHER_API_KEY=...
npx handover-cli generate --provider together
```

Default model: `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo`.

### DeepSeek

```bash
export DEEPSEEK_API_KEY=sk-...
npx handover-cli generate --provider deepseek
```

Default model: `deepseek-chat`.

### Azure OpenAI

```bash
export AZURE_OPENAI_API_KEY=...
```

```yaml
provider: azure-openai
baseUrl: https://your-resource.openai.azure.com
model: gpt-4o
```

### Custom endpoint

For any OpenAI-compatible API:

```bash
export LLM_API_KEY=...
```

```yaml
provider: custom
baseUrl: https://your-api.example.com/v1
model: your-model-name
apiKeyEnv: LLM_API_KEY
```

## CLI Commands

### `handover generate`

Run the full analysis and documentation pipeline.

```
handover generate [options]
```

| Flag | Description |
|------|-------------|
| `--provider <name>` | LLM provider override |
| `--model <name>` | Model override |
| `--only <docs>` | Generate specific documents (comma-separated names or aliases) |
| `--audience <mode>` | `human` (default) or `ai` for RAG-optimized output |
| `--static-only` | Run static analysis only, no AI calls (free) |
| `--no-cache` | Discard cached round results and run fresh |
| `-v, --verbose` | Show detailed output |

Examples:

```bash
# Full pipeline with default provider
handover generate

# Static analysis only (no cost)
handover generate --static-only

# Generate only specific documents
handover generate --only overview,architecture,modules

# Use a different provider
handover generate --provider openai --model gpt-4o
```

### `handover analyze`

Run static analysis and output a markdown report.

```
handover analyze [options]
```

| Flag | Description |
|------|-------------|
| `--json` | Output JSON to stdout instead of markdown |
| `--git-depth <depth>` | Git history depth: `default` (6 months) or `full` |
| `-v, --verbose` | Show detailed output |

### `handover estimate`

Estimate token count and cost before running the full pipeline.

```
handover estimate [options]
```

| Flag | Description |
|------|-------------|
| `--provider <name>` | Provider to estimate for |
| `--model <name>` | Model to estimate for |
| `-v, --verbose` | Show detailed output |

### `handover init`

Create a `.handover.yml` configuration file interactively.

```
handover init
```

## Example Output

Here is an abbreviated example of what `01-PROJECT-OVERVIEW.md` looks like:

```markdown
---
title: Project Overview
generated: 2025-01-15T10:30:00Z
generator: handover
document: 01-PROJECT-OVERVIEW
---

# Project Overview

## Purpose

MyApp is a task management API built with Express and TypeScript.
It provides RESTful endpoints for creating, updating, and organizing
tasks with team collaboration features.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 |
| Framework | Express 4.18 |
| Language | TypeScript 5.3 |
| Database | PostgreSQL 16 |
| ORM | Prisma 5.8 |

## Entry Points

- `src/server.ts` -- HTTP server bootstrap
- `src/app.ts` -- Express app configuration
- `src/routes/index.ts` -- Route registration
```

Each document follows this pattern: YAML front-matter, clear sections, code references, and cross-links to related documents.

## FAQ

**How much does it cost?**

Depends on the provider, model, and project size. Use `handover estimate` to check before running. Typical cost for a medium project (200 files) with Anthropic is $0.50-2.00. Ollama is completely free since it runs locally.

**Is my code sent anywhere?**

Only to the configured LLM provider's API. Use `--static-only` for zero data transfer. Use Ollama for fully local analysis where no data leaves your machine.

**Does it work with monorepos?**

Monorepo roots are detected and a warning is shown. For best results, run handover from a specific package directory rather than the monorepo root.

**What languages are supported?**

TypeScript, JavaScript, Python, Rust, and Go have full AST parsing via tree-sitter. All other languages use regex-based extraction as a fallback. Static analysis (file structure, dependencies, git history) works with any language.

**Can I generate only some documents?**

Yes. Use `--only` with document names or aliases:

```bash
handover generate --only overview,architecture,testing
```

This also reduces cost since only the required AI rounds run.

**Where is the output?**

By default, in a `handover/` directory in your project root. Change it with the `output` config option or by setting it in `.handover.yml`.

## License

MIT
