<img width="1024" height="1024" src="https://github.com/user-attachments/assets/92ab1cb5-ba66-4ddc-8dcf-c4035a8370e8" />

<p align="center">
  <strong>Generate a complete knowledge base from any codebase with a single command.</strong>
</p>

[![CI](https://github.com/farce1/handover/actions/workflows/ci.yml/badge.svg)](https://github.com/farce1/handover/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/handover-cli)](https://www.npmjs.com/package/handover-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

**handover** scans your codebase, runs multi-round AI analysis, and produces 14 interconnected markdown documents that explain your project end-to-end. Use it for onboarding, knowledge transfer, due diligence, or as a RAG corpus for AI coding tools.

Works with any language. Supports 8 LLM providers. Runs from a single `npx` command.

Continue in the full docs: https://farce1.github.io/handover/

## Quick start

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx handover-cli generate
```

That's it. Run this in any project directory to generate a complete knowledge base.

Want to preview cost first?

```bash
npx handover-cli estimate
```

Want to try without an API key?

```bash
npx handover-cli generate --static-only   # free, no AI calls
```

## What you get

handover produces 14 documents that together form a comprehensive knowledge base:

| Document                 | What it covers                                        |
| ------------------------ | ----------------------------------------------------- |
| `00-INDEX.md`            | Master index with status and navigation               |
| `01-PROJECT-OVERVIEW.md` | Purpose, tech stack, entry points                     |
| `02-GETTING-STARTED.md`  | Setup, first run, dev workflow                        |
| `03-ARCHITECTURE.md`     | System design, patterns, module relationships         |
| `04-FILE-STRUCTURE.md`   | Annotated directory tree                              |
| `05-FEATURES.md`         | Feature inventory with code traces                    |
| `06-MODULES.md`          | Module-by-module deep dive                            |
| `07-DEPENDENCIES.md`     | External deps, internal graph, risk assessment        |
| `08-ENVIRONMENT.md`      | Env vars, secrets, config files                       |
| `09-EDGE-CASES.md`       | Gotchas, error handling, failure modes                |
| `10-TECH-DEBT.md`        | TODOs, complexity hotspots, refactoring opportunities |
| `11-CONVENTIONS.md`      | Coding patterns, naming, project-specific rules       |
| `12-TESTING.md`          | Test strategy, coverage, test file locations          |
| `13-DEPLOYMENT.md`       | Build process, CI/CD, deployment targets              |

Documents are cross-referenced with links and include YAML front-matter for programmatic consumption.

## How it works

```
┌─────────────────────────────────────────────────────┐
│                    handover generate                 │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌────────────┐ ┌─────────┐ ┌──────────┐
   │  8 Static  │ │ Context │ │ 6 AI     │
   │  Analyzers │ │ Packer  │ │ Rounds   │
   │ (parallel) │ │         │ │ (DAG)    │
   └─────┬──────┘ └────┬────┘ └────┬─────┘
         │              │           │
         └──────────────┼───────────┘
                        ▼
               ┌─────────────────┐
               │  14 Renderers   │
               │  (markdown)     │
               └────────┬────────┘
                        ▼
                  handover/*.md
```

1. **Static analysis** -- 8 concurrent analyzers scan file tree, dependencies, git history, TODOs, env files, AST, tests, and docs.
2. **Context packing** -- Files are scored (6 factors) and packed into a token-budgeted context window.
3. **AI rounds** -- 6 rounds of LLM analysis run in dependency order via a DAG orchestrator, each building on prior rounds.
4. **Rendering** -- 14 renderers produce markdown documents, gracefully degrading when AI data is unavailable.

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

## Providers

handover supports 8 LLM providers. Set the appropriate environment variable and optionally configure the provider in `.handover.yml`.

| Provider                | Env var                | Default model                       | Local? |
| ----------------------- | ---------------------- | ----------------------------------- | ------ |
| **Anthropic** (default) | `ANTHROPIC_API_KEY`    | `claude-opus-4-6`                   | No     |
| **OpenAI**              | `OPENAI_API_KEY`       | `gpt-4o`                            | No     |
| **Ollama**              | --                     | `llama3.1:8b`                       | Yes    |
| **Groq**                | `GROQ_API_KEY`         | `llama-3.3-70b-versatile`           | No     |
| **Together**            | `TOGETHER_API_KEY`     | `Meta-Llama-3.1-70B-Instruct-Turbo` | No     |
| **DeepSeek**            | `DEEPSEEK_API_KEY`     | `deepseek-chat`                     | No     |
| **Azure OpenAI**        | `AZURE_OPENAI_API_KEY` | `gpt-4o`                            | No     |
| **Custom**              | `LLM_API_KEY`          | --                                  | Varies |

```bash
# Anthropic (default)
export ANTHROPIC_API_KEY=sk-ant-...
handover generate

# OpenAI
export OPENAI_API_KEY=sk-...
handover generate --provider openai

# Ollama (free, fully local -- no data leaves your machine)
ollama pull llama3.1:8b
handover generate --provider ollama --model llama3.1:8b
```

## Configuration

handover works with zero configuration. For customization, create a `.handover.yml`:

```yaml
provider: anthropic
model: claude-sonnet-4-5
output: docs/handover
audience: human # or "ai" for RAG-optimized output

project:
  name: My Project
  description: 'E-commerce platform for artisan goods'

exclude:
  - '**/*.generated.ts'
  - 'legacy/**'

contextWindow:
  pin:
    - 'src/core/**' # always include in AI context
  boost:
    - 'src/api/**' # prioritize in context window
```

Run `handover init` for an interactive config wizard.

### Configuration reference

<details>
<summary>All config fields</summary>

| Field                     | Type     | Default          | Description                              |
| ------------------------- | -------- | ---------------- | ---------------------------------------- |
| `provider`                | string   | `anthropic`      | LLM provider                             |
| `model`                   | string   | Provider default | Model name                               |
| `output`                  | string   | `./handover`     | Output directory                         |
| `audience`                | string   | `human`          | `human` or `ai` for RAG-optimized output |
| `compress`                | boolean  | `false`          | Pack files as signature summaries only   |
| `include`                 | string[] | `["**/*"]`       | Glob patterns to include                 |
| `exclude`                 | string[] | `[]`             | Glob patterns to exclude                 |
| `context`                 | string   |                  | Additional project context               |
| `costWarningThreshold`    | number   | `1.00`           | Cost warning threshold (USD)             |
| `apiKeyEnv`               | string   | Provider default | Custom env var for API key               |
| `baseUrl`                 | string   | Provider default | Custom API endpoint                      |
| `timeout`                 | number   | Provider default | Request timeout (ms)                     |
| `project.name`            | string   |                  | Project name override                    |
| `project.description`     | string   |                  | Brief description                        |
| `project.domain`          | string   |                  | Business domain                          |
| `project.teamSize`        | string   |                  | Team size context                        |
| `project.deployTarget`    | string   |                  | Deployment target                        |
| `analysis.concurrency`    | number   | `4`              | Max concurrent API calls                 |
| `analysis.staticOnly`     | boolean  | `false`          | Static analysis only                     |
| `contextWindow.maxTokens` | number   | Auto             | Token budget override                    |
| `contextWindow.pin`       | string[] | `[]`             | Files to always include                  |
| `contextWindow.boost`     | string[] | `[]`             | Files to prioritize                      |

</details>

## CLI commands

### `handover generate`

Run the full analysis and documentation pipeline.

```bash
handover generate [options]
```

| Flag                | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `--provider <name>` | LLM provider override                                     |
| `--model <name>`    | Model override                                            |
| `--only <docs>`     | Generate specific docs (comma-separated)                  |
| `--audience <mode>` | `human` (default) or `ai`                                 |
| `--static-only`     | Static analysis only, no AI calls (free)                  |
| `--no-cache`        | Discard cached round results                              |
| `--since <ref>`     | Only regenerate docs affected by changes since a git ref  |
| `--compress`        | Pack files as signature summaries only (fit larger repos) |
| `-v, --verbose`     | Verbose output                                            |

```bash
# Full pipeline
handover generate

# Specific documents only (reduces cost)
handover generate --only overview,architecture,modules

# Different provider
handover generate --provider openai --model gpt-4o
```

### `handover check`

Exit non-zero when the generated docs are stale relative to source changes. Use as a CI gate alongside `handover generate` to fail PRs that change documented code without regenerating the docs.

```bash
handover check [--since <ref>] [--json]
```

| Flag            | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `--since <ref>` | Git ref to compare against (default: `HEAD` / working tree) |
| `--json`        | Emit a machine-readable report instead of human text        |

```bash
# Fail CI if a PR changed documented source without regenerating docs
handover check --since origin/main

# Machine-readable result for custom CI tooling
handover check --since origin/main --json
```

Exit codes: `0` up to date, `1` stale docs, `2` cannot determine (no dep-graph yet, or an unresolvable ref).

### `handover build-site`

Convert the generated markdown docs into a browsable, self-contained HTML site (written alongside the markdown in the output directory). Internal doc links are rewritten to the HTML pages and mermaid diagrams render in the browser.

```bash
handover generate
handover build-site
# open ./handover/00-INDEX.html
```

Each document becomes a standalone page with a shared sidebar; serve the output directory from any static host (e.g. GitHub Pages) or open the index locally.

### `handover analyze`

Run static analysis and output a markdown report.

```bash
handover analyze [--json] [--git-depth default|full] [-v]
```

### `handover estimate`

Preview token count and cost before running the full pipeline.

```bash
handover estimate [--provider <name>] [--model <name>]
```

### `handover init`

Create a `.handover.yml` configuration file interactively.

```bash
handover init
```

## GitHub Action

Regenerate the docs in CI and open a pull request whenever code changes. The action runs `handover generate` and leaves the output in your working tree; pair it with a commit or pull-request step.

```yaml
name: Handover docs
on:
  push:
    branches: [main]
jobs:
  docs:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: farce1/handover@v1
        with:
          provider: anthropic
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: peter-evans/create-pull-request@v6
        with:
          commit-message: 'docs: regenerate handover docs'
          title: 'docs: regenerate handover docs'
          branch: handover/update-docs
```

### Inputs

| Input               | Default              | Description                                                                          |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `provider`          | `anthropic`          | LLM provider                                                                         |
| `model`             | _(provider default)_ | Model override                                                                       |
| `api-key`           | _(none)_             | Provider API key; pass a repository secret                                           |
| `api-key-env`       | _(provider default)_ | Override the env var the key is exported to; defaults to the provider's standard one |
| `args`              | _(none)_             | Extra args forwarded to `handover generate` (e.g. `--only 06-modules --compress`)    |
| `version`           | `latest`             | npm version of `handover-cli` to run                                                 |
| `working-directory` | `.`                  | Directory to run in (useful for monorepo packages)                                   |

For a non-default provider, set `provider` and `api-key` — the key is exported to that provider's standard env var automatically:

```yaml
- uses: farce1/handover@v1
  with:
    provider: openai
    api-key: ${{ secrets.OPENAI_API_KEY }}
```

To fail a PR when docs go stale instead of regenerating, run [`handover check`](#handover-check) as a CI step.

## Language support

| Language                | Parsing                | Notes                                 |
| ----------------------- | ---------------------- | ------------------------------------- |
| TypeScript / JavaScript | Full AST (tree-sitter) | Classes, functions, imports, exports  |
| Python                  | Full AST (tree-sitter) | Classes, functions, imports           |
| Rust                    | Full AST (tree-sitter) | Structs, impls, traits, functions     |
| Go                      | Full AST (tree-sitter) | Types, functions, interfaces          |
| All others              | Regex fallback         | Function/class detection, best-effort |

Static analysis (file structure, dependencies, git history, TODOs) works with any language.

## FAQ

**How much does it cost?**
Depends on provider, model, and project size. Use `handover estimate` to check. Typical: $0.50-2.00 for a medium project (~200 files) with Anthropic. Ollama is free.

**Is my code sent anywhere?**
Only to the configured LLM provider's API. Use `--static-only` for zero data transfer, or Ollama for fully local analysis.

**Does it work with monorepos?**
Monorepo roots are detected with a warning. Run from a specific package directory for best results.

**Can I generate only some documents?**
Yes: `handover generate --only overview,architecture,testing`. This also reduces cost.

**Can I use the output as context for AI coding tools?**
Yes. Use `--audience ai` to generate RAG-optimized output with structured YAML blocks.

## Development

```bash
git clone https://github.com/farce1/handover.git
cd handover

npm install
npm run build

# Dev loop (runs TypeScript directly)
npm run dev -- generate

# Type checking
npm run typecheck

# Tests (requires HANDOVER_INTEGRATION=1 + API key)
npm test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

AI-assisted PRs welcome.

## License

[MIT](LICENSE)
