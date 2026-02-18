# External Integrations

**Analysis Date:** 2026-02-18

## APIs & External Services

**LLM Providers (8 Supported):**
- **Anthropic Claude** - Primary LLM provider
  - SDK: `@anthropic-ai/sdk` 0.39.0
  - Auth: `ANTHROPIC_API_KEY` environment variable
  - Default model: `claude-opus-4-6` (200k context window)
  - Implementation: `src/providers/anthropic.ts`
  - Tool format: Anthropic `tool_use` pattern with structured output validation

- **OpenAI** - OpenAI API
  - SDK: `openai` 5.23.2
  - Auth: `OPENAI_API_KEY` environment variable
  - Default model: `gpt-4o` (128k context window)
  - Base URL: `https://api.openai.com/v1`
  - Implementation: `src/providers/openai-compat.ts`

- **Azure OpenAI** - Azure-hosted OpenAI
  - SDK: `openai` (AzureOpenAI class) 5.23.2
  - Auth: `AZURE_OPENAI_API_KEY` environment variable
  - Implementation: `src/providers/openai-compat.ts` (dedicated client branch)
  - API version: `2024-10-21`

- **Ollama** - Local LLM inference
  - SDK: `openai` (OpenAI-compatible endpoint)
  - Auth: None (local)
  - Base URL: `http://localhost:11434/v1/` (default)
  - Context window: 128k
  - Timeout: 300s (5 min for local inference)
  - Model: User-specified, no defaults

- **Groq** - High-speed inference
  - SDK: `openai` (OpenAI-compatible)
  - Auth: `GROQ_API_KEY` environment variable
  - Base URL: `https://api.groq.com/openai/v1`
  - Default model: `llama-3.3-70b-versatile`

- **Together AI** - LLM inference platform
  - SDK: `openai` (OpenAI-compatible)
  - Auth: `TOGETHER_API_KEY` environment variable
  - Base URL: `https://api.together.xyz/v1`
  - Default model: `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo`

- **DeepSeek** - Reasoning model provider
  - SDK: `openai` (OpenAI-compatible)
  - Auth: `DEEPSEEK_API_KEY` environment variable
  - Base URL: `https://api.deepseek.com`
  - Default model: `deepseek-chat`

- **Custom OpenAI-Compatible** - Any OpenAI-compatible endpoint
  - SDK: `openai` with custom baseURL
  - Configurable via `baseUrl` in `.handover.yml`

**Provider Registry:**
- Location: `src/providers/presets.ts`
- Contains: 8 presets with default models, context windows, pricing, and timeouts
- Factory pattern: `src/providers/factory.ts` - Instantiates correct provider based on config

## Data Storage

**Databases:**
- None - Handover is a stateless analysis tool
- Input: Scans filesystem and reads source files
- Output: Generates markdown documents to local filesystem

**File Storage:**
- Local filesystem only
- Input discovery: `src/analyzers/file-discovery.ts` (uses `fast-glob` and `ignore`)
- Output directory: Configurable via `output` field in `.handover.yml` (default: `./handover`)
- Max file size: 2MB (larger files are skipped in analysis)

**Caching:**
- Client-side caching: `--no-cache` flag bypasses cached results
- Cache location: Not exposed in configuration, likely in `.handover/` or runtime memory

## Git Integration

**Git Operations:**
- Library: `simple-git` 3.31.1
- Purpose: Extract branch patterns, commit history, contributors, file ownership
- Analyzer: `src/analyzers/git-history.ts`
- Operations:
  - Branch listing with sort
  - Recent commits extraction (configurable depth)
  - Branch pattern detection (Git Flow, GitHub Flow, Trunk-Based)
  - Contributor extraction
  - File churn analysis
- Graceful fallback: Returns empty result if not a git repository

## Configuration

**Config File Format:**
- File: `.handover.yml` (YAML)
- Parsing: `yaml` package 2.8.2 via `src/config/loader.ts`
- Validation: Zod schema `HandoverConfigSchema` in `src/config/schema.ts`

**Configuration Schema:**
```yaml
provider: anthropic|openai|ollama|groq|together|deepseek|azure-openai|custom
model: string (optional, uses provider default if not specified)
apiKeyEnv: string (optional, uses provider default)
baseUrl: string (optional, for custom or azure endpoints)
timeout: number (milliseconds, optional)
output: string (default: ./handover)
audience: human|ai (default: human)
include: [glob patterns] (default: [**/*])
exclude: [glob patterns]
context: string (optional, additional context file path)
analysis:
  concurrency: number (default: 4)
  staticOnly: boolean (default: false)
project:
  name: string (optional)
  description: string (optional)
  domain: string (optional)
  teamSize: string (optional)
  deployTarget: string (optional)
contextWindow:
  maxTokens: number (optional)
  pin: [file patterns] (always include)
  boost: [file patterns] (prioritize)
costWarningThreshold: number (optional, USD)
```

**Environment Variables Required:**
- API key env var based on selected provider (see LLM Providers section)
- No other environment variables required for operation
- Secrets are never logged; `.env` files are not committed

## Analysis Input Formats

**Supported Source Languages:**
- TypeScript/JavaScript - Via `web-tree-sitter` AST parser
- Python - Via `web-tree-sitter` AST parser
- Go - Via `web-tree-sitter` AST parser
- Rust - Via `web-tree-sitter` AST parser
- Regex fallback - For unsupported languages (pattern-based extraction)

**Dependency Parsing:**
- `package.json` (Node.js) - Direct JSON parsing
- `Cargo.toml` (Rust) - TOML parsing via `smol-toml`
- `pyproject.toml` (Python) - TOML parsing via `smol-toml`
- Other formats detected but may fall back to regex extraction

**Special Files Analyzed:**
- `.gitignore` - Patterns applied to file discovery
- `.env` files - Detected and listed (contents not exposed in output)
- README files - Extracted for documentation
- License files - Detected and included
- Configuration files (tsconfig.json, webpack.config.js, etc.) - Parsed for metadata

## Output Formats

**Generated Documents:**
- 14 Markdown files (`.md`)
- YAML front-matter with metadata
- Cross-referenced internal links
- Plain text rendering (no binary outputs)
- Format optimized for:
  - Human reading (default audience)
  - AI consumption (with `--audience ai` flag)

**Output Location:**
- Default: `./handover/` directory
- Customizable via `output` field in `.handover.yml`
- Files follow naming pattern: `00-INDEX.md`, `01-PROJECT-OVERVIEW.md`, etc.

## Webhooks & Callbacks

**Incoming:**
- None - Handover is a CLI-only tool

**Outgoing:**
- None - No webhooks or external callbacks

## Monitoring & Observability

**Error Tracking:**
- None - Errors logged to console only
- Custom error types: `src/utils/errors.ts`
  - `ProviderError` - LLM provider failures
  - `OrchestratorError` - Analysis orchestration failures
  - `ValidationError` - Schema validation failures

**Logging:**
- Framework: Console-based logging via `src/utils/logger.ts`
- No external logging service
- Verbose mode: `--verbose` flag for detailed output
- Terminal colors: `picocolors` for readable output

**Cost Estimation:**
- Pre-flight cost calculator: `src/cli/estimate.ts`
- Provider pricing lookup: `src/providers/presets.ts` (per-million-token rates)
- Cost threshold warning: `costWarningThreshold` in config

**Token Tracking:**
- Token counter: `src/context/tracker.ts`
- Tracks input/output tokens per LLM call
- Reports total cost at end of analysis

## CI/CD & Deployment

**Hosting:**
- NPM Package Registry
- Published as: `handover-cli@0.1.0`
- Distribution: Installable via `npm install -g handover-cli` or `npx handover-cli`

**CI Pipeline:**
- GitHub Actions workflow (referenced in README badges)
- Likely runs: build, test, lint on pull requests

**Build Output:**
- Single executable: `dist/index.js` (ESM format)
- Type declarations: `dist/index.d.ts` (disabled in tsup config)
- Source maps: Enabled for debugging

---

*Integration audit: 2026-02-18*
