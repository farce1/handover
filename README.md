# handover

<p align="center">
  <strong>Generate a complete knowledge base from any codebase with a single command.</strong>
</p>

<p align="center">
  <a href="https://github.com/farce1/handover/actions"><img src="https://img.shields.io/github/actions/workflow/status/farce1/handover/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/handover-cli"><img src="https://img.shields.io/npm/v/handover-cli?style=for-the-badge" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/handover-cli"><img src="https://img.shields.io/npm/dm/handover-cli?style=for-the-badge" alt="npm downloads"></a>
</p>

**handover** scans your codebase, runs multi-round AI analysis, and produces 14 interconnected markdown documents that explain your project end-to-end. Use it for onboarding, knowledge transfer, due diligence, or as a RAG corpus for AI coding tools.

Works with any language. Supports 8 LLM providers. Runs from a single `npx` command.

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

| Document | What it covers |
|----------|----------------|
| `00-INDEX.md` | Master index with status and navigation |
| `01-PROJECT-OVERVIEW.md` | Purpose, tech stack, entry points |
| `02-GETTING-STARTED.md` | Setup, first run, dev workflow |
| `03-ARCHITECTURE.md` | System design, patterns, module relationships |
| `04-FILE-STRUCTURE.md` | Annotated directory tree |
| `05-FEATURES.md` | Feature inventory with code traces |
| `06-MODULES.md` | Module-by-module deep dive |
| `07-DEPENDENCIES.md` | External deps, internal graph, risk assessment |
| `08-ENVIRONMENT.md` | Env vars, secrets, config files |
| `09-EDGE-CASES.md` | Gotchas, error handling, failure modes |
| `10-TECH-DEBT.md` | TODOs, complexity hotspots, refactoring opportunities |
| `11-CONVENTIONS.md` | Coding patterns, naming, project-specific rules |
| `12-TESTING.md` | Test strategy, coverage, test file locations |
| `13-DEPLOYMENT.md` | Build process, CI/CD, deployment targets |

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

| Provider | Env var | Default model | Local? |
|----------|---------|---------------|--------|
| **Anthropic** (default) | `ANTHROPIC_API_KEY` | `claude-opus-4-6` | No |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o` | No |
| **Ollama** | -- | `llama3.1:8b` | Yes |
| **Groq** | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | No |
| **Together** | `TOGETHER_API_KEY` | `Meta-Llama-3.1-70B-Instruct-Turbo` | No |
| **DeepSeek** | `DEEPSEEK_API_KEY` | `deepseek-chat` | No |
| **Azure OpenAI** | `AZURE_OPENAI_API_KEY` | `gpt-4o` | No |
| **Custom** | `LLM_API_KEY` | -- | Varies |

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
audience: human           # or "ai" for RAG-optimized output

project:
  name: My Project
  description: "E-commerce platform for artisan goods"

exclude:
  - "**/*.generated.ts"
  - "legacy/**"

contextWindow:
  pin:
    - "src/core/**"       # always include in AI context
  boost:
    - "src/api/**"        # prioritize in context window
```

Run `handover init` for an interactive config wizard.

### Configuration reference

<details>
<summary>All config fields</summary>

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider` | string | `anthropic` | LLM provider |
| `model` | string | Provider default | Model name |
| `output` | string | `./handover` | Output directory |
| `audience` | string | `human` | `human` or `ai` for RAG-optimized output |
| `include` | string[] | `["**/*"]` | Glob patterns to include |
| `exclude` | string[] | `[]` | Glob patterns to exclude |
| `context` | string | | Additional project context |
| `costWarningThreshold` | number | `1.00` | Cost warning threshold (USD) |
| `apiKeyEnv` | string | Provider default | Custom env var for API key |
| `baseUrl` | string | Provider default | Custom API endpoint |
| `timeout` | number | Provider default | Request timeout (ms) |
| `project.name` | string | | Project name override |
| `project.description` | string | | Brief description |
| `project.domain` | string | | Business domain |
| `project.teamSize` | string | | Team size context |
| `project.deployTarget` | string | | Deployment target |
| `analysis.concurrency` | number | `4` | Max concurrent API calls |
| `analysis.staticOnly` | boolean | `false` | Static analysis only |
| `contextWindow.maxTokens` | number | Auto | Token budget override |
| `contextWindow.pin` | string[] | `[]` | Files to always include |
| `contextWindow.boost` | string[] | `[]` | Files to prioritize |

</details>

## CLI commands

### `handover generate`

Run the full analysis and documentation pipeline.

```bash
handover generate [options]
```

| Flag | Description |
|------|-------------|
| `--provider <name>` | LLM provider override |
| `--model <name>` | Model override |
| `--only <docs>` | Generate specific docs (comma-separated) |
| `--audience <mode>` | `human` (default) or `ai` |
| `--static-only` | Static analysis only, no AI calls (free) |
| `--no-cache` | Discard cached round results |
| `-v, --verbose` | Verbose output |

```bash
# Full pipeline
handover generate

# Specific documents only (reduces cost)
handover generate --only overview,architecture,modules

# Different provider
handover generate --provider openai --model gpt-4o
```

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

## Language support

| Language | Parsing | Notes |
|----------|---------|-------|
| TypeScript / JavaScript | Full AST (tree-sitter) | Classes, functions, imports, exports |
| Python | Full AST (tree-sitter) | Classes, functions, imports |
| Rust | Full AST (tree-sitter) | Structs, impls, traits, functions |
| Go | Full AST (tree-sitter) | Types, functions, interfaces |
| All others | Regex fallback | Function/class detection, best-effort |

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
