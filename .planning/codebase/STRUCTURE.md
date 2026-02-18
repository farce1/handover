# Codebase Structure

**Analysis Date:** 2026-02-18

## Directory Layout

```
handover/
├── src/                          # All TypeScript source
│   ├── cli/                      # CLI commands and handlers
│   ├── config/                   # Configuration schema and loading
│   ├── orchestrator/             # DAG execution engine
│   ├── analyzers/                # 8 concurrent static analyzers
│   ├── parsing/                  # Language-aware symbol extraction
│   ├── context/                  # Token budget, file scoring, packing
│   ├── ai-rounds/                # 6 AI analysis rounds
│   ├── providers/                # LLM provider abstractions
│   ├── renderers/                # 14 document renderers
│   ├── ui/                       # Terminal UI and progress
│   ├── cache/                    # Round result caching
│   ├── domain/                   # Domain types and schemas
│   ├── utils/                    # Logging, errors, rate limiting
│   └── grammars/                 # Tree-sitter grammar downloads
├── tests/                        # Test files
├── dist/                         # Built output (generated)
├── node_modules/                 # Dependencies (generated)
├── package.json                  # Node dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── tsup.config.ts                # Build configuration
├── vitest.config.ts              # Test configuration
├── .handover.yml                 # Example configuration (if present)
└── .env                          # API keys (NOT committed)
```

## Directory Purposes

**`src/cli/`**
- Purpose: Command-line interface layer
- Contains: Command handlers for generate, analyze, estimate, init, monorepo
- Key files:
  - `index.ts` - Main CLI entry point with Commander.js setup
  - `generate.ts` - Generate command (main workflow)
  - `analyze.ts` - Static analysis command
  - `estimate.ts` - Token cost estimation
  - `init.ts` - Initialize .handover.yml
  - `monorepo.ts` - Monorepo detection

**`src/config/`**
- Purpose: Configuration management
- Contains: Zod schema, loader, defaults
- Key files:
  - `schema.ts` - HandoverConfigSchema definition (provider, model, output path, project metadata)
  - `loader.ts` - Load and validate .handover.yml
  - `defaults.ts` - Default values for zero-config mode

**`src/orchestrator/`**
- Purpose: DAG-based task scheduling
- Contains: DAGOrchestrator class, step creation helpers
- Key files:
  - `dag.ts` - DAGOrchestrator with Kahn's algorithm cycle detection
  - `step.ts` - createStep() factory, StepDefinition interface
  - `types.ts` - StepDefinition, StepContext, DAGEvents interfaces

**`src/analyzers/`**
- Purpose: Concurrent static analysis of codebase
- Contains: 8 independent analyzers, coordinator, reporting
- Key files:
  - `coordinator.ts` - runStaticAnalysis() that runs all 8 analyzers concurrently
  - `file-tree.ts` - STAT-01: Directory structure, file counts, sizes
  - `dependency-graph.ts` - STAT-02: Package manifests and dependencies
  - `git-history.ts` - STAT-03: Git commits, branches, contributors
  - `ast-analyzer.ts` - STAT-04: Symbol extraction via parsing service
  - `test-analyzer.ts` - STAT-05: Test framework detection
  - `doc-analyzer.ts` - STAT-06: Markdown documentation scan
  - `todo-scanner.ts` - STAT-07: TODO/FIXME comments
  - `env-scanner.ts` - STAT-08: Environment variable references
  - `types.ts` - StaticAnalysisResult, result types for each analyzer
  - `context.ts` - AnalysisContext building
  - `file-discovery.ts` - File listing with .gitignore respect
  - `cache.ts` - Result caching
  - `report.ts` - Markdown report formatting

**`src/parsing/`**
- Purpose: Multi-language symbol extraction
- Contains: ParserService, language-specific extractors, language registry
- Key files:
  - `index.ts` - Public API, createParserService() factory
  - `parser-service.ts` - ParserService: extractor registry and batch parsing
  - `types.ts` - ParsedFile, FunctionSymbol, ImportInfo, etc.
  - `language-map.ts` - Extension → language ID mapping, EXTENSION_MAP
  - `extractors/base.ts` - LanguageExtractor base class interface
  - `extractors/typescript.ts` - Tree-sitter TypeScript extractor
  - `extractors/python.ts` - Tree-sitter Python extractor
  - `extractors/rust.ts` - Tree-sitter Rust extractor
  - `extractors/go.ts` - Tree-sitter Go extractor
  - `extractors/regex-fallback.ts` - Regex fallback for other languages
  - `utils/node-helpers.ts` - Tree-sitter node traversal utilities
  - `utils/text-extract.ts` - Source text extraction helpers

**`src/context/`**
- Purpose: Token budget and context packing for AI rounds
- Contains: File scoring, tiering, budget computation, tracking
- Key files:
  - `types.ts` - PackedContext, PackedFile, TokenBudget, RoundContext
  - `scorer.ts` - scoreFiles() prioritizes by entry point, imports, git activity, config files
  - `packer.ts` - packFiles() tiers content (full/signatures/skip) to fit budget
  - `token-counter.ts` - computeTokenBudget() estimates available tokens for files
  - `compressor.ts` - compressRoundOutput() reduces prior round output to 2000 tokens
  - `tracker.ts` - TokenUsageTracker accumulates per-round tokens and cost

**`src/ai-rounds/`**
- Purpose: 6 sequential AI analysis rounds with validation and fallback
- Contains: Round factories, execution engine, validation, quality checking
- Key files:
  - `runner.ts` - executeRound() the core round execution engine with validation, quality check, retry, fallback
  - `round-1-overview.ts` - Round 1: Project overview (tech stack, features, entry points)
  - `round-2-modules.ts` - Round 2: Module/service boundaries
  - `round-3-features.ts` - Round 3: Feature extraction and cross-cutting concerns
  - `round-4-architecture.ts` - Round 4: Architecture patterns and design decisions
  - `round-5-edge-cases.ts` - Round 5: Edge cases, conventions, gotchas
  - `round-6-deployment.ts` - Round 6: Deployment, infrastructure, scaling
  - `round-factory.ts` - Factory functions for creating round steps
  - `types.ts` - RoundInput, RoundExecutionResult, QualityMetrics, ValidationResult
  - `schemas.ts` - Zod schemas for Round1Output through Round6Output
  - `prompts.ts` - Prompt templates for all 6 rounds
  - `validator.ts` - validateRound() checks claims against static data
  - `quality.ts` - checkRoundQuality() metrics computation
  - `fallbacks.ts` - buildFallback*() functions return static-only data
  - `summary.ts` - Validation summary reporting

**`src/providers/`**
- Purpose: LLM provider abstraction and implementations
- Contains: Provider interface, API-specific implementations, utilities
- Key files:
  - `base.ts` - LLMProvider interface (complete, estimateTokens, maxContextTokens)
  - `base-provider.ts` - BaseLLMProvider abstract base
  - `anthropic.ts` - Anthropic implementation
  - `openai-compat.ts` - OpenAI-compatible provider (OpenAI, Groq, Together, DeepSeek, Azure, Ollama)
  - `factory.ts` - createProvider() factory, validateProviderConfig()
  - `presets.ts` - PROVIDER_PRESETS with model defaults and cost data
  - `schema-utils.ts` - toJsonSchema() for Zod → JSON Schema conversion

**`src/renderers/`**
- Purpose: Convert analysis data to 14 markdown documents
- Contains: Document registry, 14 render functions, utilities
- Key files:
  - `types.ts` - RenderContext, DocumentSpec, DocumentStatus, FrontMatterFields
  - `registry.ts` - DOCUMENT_REGISTRY of all 14 documents, ROUND_DEPS mapping
  - `render-00-index.ts` - Index document with status for all docs
  - `render-01-overview.ts` - Project overview, tech stack, key features
  - `render-02-getting-started.ts` - Setup, build, run instructions
  - `render-03-architecture.ts` - Architecture patterns, layers, data flow
  - `render-04-file-structure.ts` - Directory structure, key files, naming conventions
  - `render-05-features.ts` - Feature list and descriptions
  - `render-06-modules.ts` - Module/service boundaries and interactions
  - `render-07-dependencies.ts` - External dependencies and integrations
  - `render-08-environment.ts` - Environment variables, configuration
  - `render-09-edge-cases.ts` - Edge cases, gotchas, known issues
  - `render-10-tech-debt.ts` - Technical debt and refactoring opportunities
  - `render-11-conventions.ts` - Coding conventions, naming patterns, style
  - `render-12-testing.ts` - Test framework, patterns, coverage
  - `render-13-deployment.ts` - Deployment process, CI/CD, scaling
  - `render-template.ts` - Base template with front-matter, shared formatting
  - `utils.ts` - Utility functions: determineDocStatus(), resolveSelectedDocs()
  - `audience.ts` - Audience-specific rendering (human vs. ai)
  - `mermaid.ts` - Diagram generation utilities

**`src/ui/`**
- Purpose: Terminal rendering and progress display
- Contains: Terminal renderer, CI fallback, components, formatters
- Key files:
  - `renderer.ts` - TerminalRenderer: TTY rendering with in-place updates
  - `ci-renderer.ts` - CIRenderer: Line-by-line output for CI environments
  - `components.ts` - Render functions: renderAnalyzerBlock(), renderRoundBlock(), renderBanner()
  - `formatters.ts` - Format functions: formatDuration(), SYMBOLS spinner frames
  - `types.ts` - DisplayState, Renderer interface, AnalyzerStatus

**`src/cache/`**
- Purpose: Caching of expensive AI round results
- Contains: Round cache implementation
- Key files:
  - `round-cache.ts` - RoundCache: Persist/load round results, --no-cache flag support

**`src/domain/`**
- Purpose: Domain types and unified data model
- Contains: Zod schemas for all entity types, derived TS types
- Key files:
  - `schemas.ts` - Zod definitions: Import, SourceFile, Module, Feature, ArchPattern, Convention, etc.
  - `types.ts` - Types derived from schemas via z.infer
  - `entities.ts` - Entity definitions (if needed)

**`src/utils/`**
- Purpose: Cross-cutting utilities
- Contains: Logger, error handling, rate limiting
- Key files:
  - `logger.ts` - Logger: info(), warn(), error(), setVerbose()
  - `errors.ts` - HandoverError, OrchestratorError, custom error classes
  - `rate-limiter.ts` - RateLimiter for API calls

**`src/grammars/`**
- Purpose: Tree-sitter grammar management
- Contains: Grammar downloader and manager
- Key files:
  - `downloader.ts` - Download/cache tree-sitter WASM grammars

**`tests/`**
- Purpose: Test files
- Contains: Unit and integration tests
- Pattern: `*.test.ts` or `*.spec.ts` alongside source

## Key File Locations

**Entry Points:**
- `src/cli/index.ts` - Binary entry point, main CLI router

**Configuration:**
- `.handover.yml` - User configuration (if present)
- `src/config/schema.ts` - Config schema definition
- `src/config/loader.ts` - Config loading logic
- `package.json` - npm dependencies, build scripts

**Core Logic:**
- `src/orchestrator/dag.ts` - DAG orchestrator (PIPE-01)
- `src/analyzers/coordinator.ts` - Static analysis coordinator
- `src/ai-rounds/runner.ts` - AI round execution engine
- `src/renderers/registry.ts` - Document registry

**Parsing:**
- `src/parsing/index.ts` - Public API
- `src/parsing/language-map.ts` - Language registry
- `src/parsing/extractors/` - Language implementations

**Output:**
- Handover markdown files written to `./handover/` by default (configurable via `output` in .handover.yml)

## Naming Conventions

**Files:**
- Source: `kebab-case.ts` (e.g., `file-tree.ts`, `round-1-overview.ts`)
- Tests: `{name}.test.ts` (e.g., `coordinator.test.ts`)
- Directories: `kebab-case/` (e.g., `src/analyzers/`, `src/ai-rounds/`)

**Functions:**
- Exported: `camelCase` (e.g., `analyzeFileTree()`, `runGenerate()`)
- Internal: `camelCase` (e.g., `buildPrompt()`)
- Factories: `create*` prefix (e.g., `createParserService()`, `createStep()`)
- Utilities: `*()` (e.g., `scoreFiles()`, `packFiles()`)

**Variables:**
- Constants: `UPPER_SNAKE_CASE` (e.g., `ANALYZER_NAMES`, `ROUND_NAMES`)
- Regular: `camelCase` (e.g., `staticAnalysis`, `packedContext`)
- Private class members: `#privateField` or `private field`

**Types:**
- Interfaces: `PascalCase` (e.g., `RenderContext`, `DocumentSpec`)
- Types: `PascalCase` (e.g., `StepDefinition`, `LLMProvider`)
- Schema types: `*Schema` suffix (e.g., `HandoverConfigSchema`)
- Derived types: Use `z.infer<typeof SomeSchema>`

**Classes:**
- `PascalCase` (e.g., `DAGOrchestrator`, `TerminalRenderer`, `TokenUsageTracker`)

## Where to Add New Code

**New Analyzer (static analysis):**
- Create: `src/analyzers/{name}-analyzer.ts`
- Implement: Function returning `AnalyzerResult<YourResultType>`
- Register: Add to ANALYZER_NAMES array in `src/analyzers/coordinator.ts`
- Schema: Define Zod schema in analyzer file or `src/analyzers/types.ts`

**New AI Round:**
- Create: `src/ai-rounds/round-{N}-{name}.ts`
- Implement: `createRound{N}Step()` factory function with schema and prompts
- Register: Import in `src/cli/generate.ts` and add to orchestrator
- Prompt: Define in `src/ai-rounds/prompts.ts`
- Fallback: Implement `buildRound{N}Fallback()` in `src/ai-rounds/fallbacks.ts`
- Schema: Define in `src/ai-rounds/schemas.ts`

**New Document Renderer:**
- Create: `src/renderers/render-{NN}-{name}.ts`
- Implement: Function with signature `(ctx: RenderContext) => string`
- Register: Add DocumentSpec entry to DOCUMENT_REGISTRY in `src/renderers/registry.ts`
- Include: Front-matter via `renderTemplate()` from `src/renderers/render-template.ts`

**New Language Support:**
- Create: `src/parsing/extractors/{language}.ts`
- Extend: `LanguageExtractor` base class
- Implement: `extractFromSource(source: string): ExtractorResult`
- Register: Add to `EXTENSION_MAP` in `src/parsing/language-map.ts`
- Register in service: Modify factory in `src/parsing/index.ts`

**New Provider:**
- Create: `src/providers/{provider-name}.ts`
- Implement: `LLMProvider` interface
- Register: Add case in `factory.ts` createProvider() function
- Add presets: Entry in PROVIDER_PRESETS in `src/providers/presets.ts`

**Utilities:**
- Shared helpers: `src/utils/{name}.ts`
- Domain helpers: `src/{domain}/{name}.ts`
- Layout helpers: `src/renderers/utils.ts`

## Special Directories

**`dist/`:**
- Purpose: Compiled JavaScript output
- Generated: By `npm run build` (tsup)
- Committed: No (in .gitignore)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: By `npm install`
- Committed: No (in .gitignore)

**`.planning/`:**
- Purpose: GSD phase documents and codebase analysis
- Committed: Yes, tracked in git
- Contains: Roadmap, phase plans, codebase documentation

**`.claude/`:**
- Purpose: Claude Code session context
- Generated: By Claude Code IDE
- Committed: No (in .gitignore)

---

*Structure analysis: 2026-02-18*
