# Technology Stack

**Analysis Date:** 2026-02-18

## Languages

**Primary:**
- TypeScript 5.9 - All application code, including CLI, analyzers, providers, and rendering

**Secondary:**
- JavaScript (Node.js native modules) - WASM loaders and runtime bindings for tree-sitter

## Runtime

**Environment:**
- Node.js >= 18.0.0 (specified in `package.json` engines field)

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

## Frameworks

**Core CLI:**
- Commander.js 13.1 - Command-line interface parsing and routing (`src/cli/index.ts`)

**Testing:**
- Vitest 3.2 - Test runner and assertion framework
- Configuration: `vitest.config.ts` (globals enabled, 2-minute timeout for integration tests)

**Build/Dev:**
- tsup 8.5 - TypeScript bundler for ESM distribution
  - Configuration: `tsup.config.ts` (bundles to single entry point, splits vendor chunks)
- tsx 4.21 - TypeScript executor for dev mode (`npm run dev`)
- TypeScript 5.9 - Type checking and compilation

## Key Dependencies

**Critical:**

- `@anthropic-ai/sdk` 0.39.0 - Claude LLM API integration
  - Purpose: Primary LLM provider for multi-round analysis
  - Usage: `src/providers/anthropic.ts` - Handles tool_use pattern for structured output

- `openai` 5.23.2 - OpenAI and OpenAI-compatible LLM APIs
  - Purpose: Supports OpenAI, Azure OpenAI, Ollama, Groq, Together, DeepSeek providers
  - Usage: `src/providers/openai-compat.ts` - Unified OpenAI-compatible client wrapper

- `web-tree-sitter` 0.25.10 - Syntax tree parsing via WASM
  - Purpose: Parse source code into ASTs for static analysis
  - Usage: `src/parsing/extractors/` - Language-specific extractors (TypeScript, Python, Go, Rust)
  - Wasm loaders installed separately via `tree-sitter-wasms` 0.1.13

**Infrastructure:**

- `zod` 3.25.76 - Type-safe schema validation and inference
  - Purpose: Runtime validation for config files, API responses, analysis results
  - Usage: `src/config/schema.ts`, `src/ai-rounds/schemas.ts`, throughout domain types

- `zod-to-json-schema` 3.25.1 - Convert Zod schemas to JSON Schema
  - Purpose: Generate tool schemas for LLM API calls
  - Usage: `src/providers/schema-utils.ts` - Converts Zod schemas to Anthropic/OpenAI tool formats

- `fast-glob` 3.3.3 - High-performance file globbing
  - Purpose: Discover source files with pattern matching and ignore support
  - Usage: `src/analyzers/file-discovery.ts`

- `ignore` 7.0.5 - .gitignore pattern matching
  - Purpose: Apply .gitignore rules to file discovery
  - Usage: `src/analyzers/file-discovery.ts` - Secondary filtering after fast-glob

- `simple-git` 3.31.1 - Git repository operations
  - Purpose: Extract git history, branch patterns, contributors, file churn
  - Usage: `src/analyzers/git-history.ts`

- `yaml` 2.8.2 - YAML parsing and serialization
  - Purpose: Read/write .handover.yml config files
  - Usage: `src/config/loader.ts`, `src/cli/init.ts`

- `smol-toml` 1.6.0 - TOML parsing
  - Purpose: Parse Cargo.toml, pyproject.toml for dependency analysis
  - Usage: `src/analyzers/dependency-graph.ts`

**UI & Output:**

- `@clack/prompts` 0.10.1 - Interactive CLI prompts
  - Purpose: User input for init command and configuration
  - Usage: `src/cli/init.ts`

- `picocolors` 1.1.1 - Terminal color output (bundled)
  - Purpose: Colored terminal output for messages and logs

- `sisteransi` 1.0.5 - Terminal color detection and ANSI utilities
  - Purpose: Detects terminal capabilities for color support

## Configuration

**Environment:**
- **ANTHROPIC_API_KEY** - Required for Anthropic provider (default provider)
- **OPENAI_API_KEY** - Required for OpenAI provider
- **GROQ_API_KEY** - Required for Groq provider
- **TOGETHER_API_KEY** - Required for Together provider
- **DEEPSEEK_API_KEY** - Required for DeepSeek provider
- **AZURE_OPENAI_API_KEY** - Required for Azure OpenAI provider
- **Ollama** - No API key needed (runs locally at http://localhost:11434/v1/)

**Config File:**
- `.handover.yml` - Project-specific configuration (optional, zero-config mode supported)
- Schema validation via Zod in `src/config/schema.ts`
- Supports: provider selection, model override, output directory, file include/exclude patterns, project metadata, context window tuning

**Build:**
- `tsconfig.json` - TypeScript compiler options
  - Target: ES2022
  - Module: NodeNext (ESM)
  - Strict mode enabled
  - Declaration maps and source maps enabled

- `tsup.config.ts` - Bundle configuration
  - Entry: `src/cli/index.ts`
  - Output: ESM to `dist/index.js`
  - External deps: `@anthropic-ai/sdk`, `openai`, `web-tree-sitter` (resolved at runtime)
  - Bundled deps: `picocolors` (for fewer install issues)

- `vitest.config.ts` - Test runner configuration
  - Environment: Node.js
  - Timeout: 2 minutes (for integration tests)
  - Include patterns: `src/**/*.test.ts`, `tests/**/*.test.ts`

## Platform Requirements

**Development:**
- Node.js >= 18.0.0
- npm (or equivalent package manager)
- TypeScript 5.9 (included as dev dependency)
- WASM support (for tree-sitter parsing)

**Production:**
- Node.js >= 18.0.0
- API key for selected LLM provider (Anthropic, OpenAI, Groq, Together, DeepSeek, Azure, or local Ollama)
- No database or external file storage required

**Published As:**
- NPM package: `handover-cli` (0.1.0)
- Entry point: `./dist/index.js` (executable via `npx handover-cli` or `handover` when globally installed)
- Shebang: `#!/usr/bin/env node` (in `src/cli/index.ts`)

---

*Stack analysis: 2026-02-18*
