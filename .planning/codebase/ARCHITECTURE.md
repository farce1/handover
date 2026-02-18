# Architecture

**Analysis Date:** 2026-02-18

## Pattern Overview

**Overall:** Multi-stage pipeline with layered separation: CLI → Orchestration → Analysis → AI Rounds → Rendering

**Key Characteristics:**
- **DAG-based orchestration** - Steps execute as dependencies resolve (Kahn's algorithm)
- **Multi-phase static analysis** - 8 concurrent analyzers feed context to AI rounds
- **Iterative AI analysis** - 6 sequential rounds, each with validation, quality checking, and fallback
- **Context packing** - Token budget management with tiered file content (full/signatures/skip)
- **Plugin-based rendering** - 14 documents register via DocumentSpec and render from unified RenderContext
- **Provider abstraction** - Single interface supports Anthropic, OpenAI, Groq, Ollama, DeepSeek, Azure, Together
- **Zod-first domain model** - All data types derive from Zod schemas for runtime validation

## Layers

**CLI Layer:**
- Purpose: Command routing, config loading, option parsing
- Location: `src/cli/`
- Contains: Command handlers (generate, analyze, estimate, init, monorepo)
- Depends on: Config schema, error handling, orchestrator
- Used by: Process entry point (`src/cli/index.ts`)

**Configuration Layer:**
- Purpose: Load and validate `.handover.yml`, set defaults, resolve API keys
- Location: `src/config/`
- Contains: Schema definition, loader, default values
- Depends on: Zod validation, file I/O
- Used by: All phases require loaded config

**Orchestration Layer:**
- Purpose: DAG execution, step dependency resolution, error recovery
- Location: `src/orchestrator/`
- Contains: DAGOrchestrator class, step creation helpers, event emission
- Depends on: Domain types (StepDefinition, StepResult)
- Used by: Generate command to run all phases

**Static Analysis Layer:**
- Purpose: Extract file structure, dependencies, AST, tests, git history, TODOs
- Location: `src/analyzers/`
- Contains: 8 concurrent analyzers (file-tree, dependencies, git-history, ast, tests, docs, todos, env-scanner)
- Depends on: Parsing module, file system, git/tree-sitter
- Used by: First orchestration phase via `runStaticAnalysis()`

**Parsing Layer:**
- Purpose: Language-aware symbol extraction from source files
- Location: `src/parsing/`
- Contains: ParserService (registry), extractors (TypeScript, Python, Rust, Go, regex-fallback), language map
- Depends on: Tree-sitter via web-tree-sitter, language detection
- Used by: AST analyzer, AI rounds for code references

**Context Management Layer:**
- Purpose: Token budget computation, file priority scoring, context packing for AI rounds
- Location: `src/context/`
- Contains: TokenBudget computation, file Scorer, Packer (tiered content), token counters, usage tracker
- Depends on: Analyzers output, provider token estimation
- Used by: Between static analysis and AI rounds

**AI Rounds Layer:**
- Purpose: Iterative AI analysis with validation, quality checking, fallback
- Location: `src/ai-rounds/`
- Contains: 6 round factories (overview, modules, features, architecture, edge-cases, deployment), runner, validator, quality checker
- Depends on: Providers, context packing, Zod schemas
- Used by: Orchestrator to generate analysis data

**Provider Layer:**
- Purpose: Abstraction for LLM APIs with unified interface
- Location: `src/providers/`
- Contains: Base interface, implementations (Anthropic, OpenAI, ollama-compat), factory, schema utilities, presets
- Depends on: SDK clients (@anthropic-ai/sdk, openai), HTTP
- Used by: AI rounds for LLM calls

**Rendering Layer:**
- Purpose: Convert AI rounds + static analysis into 14 markdown documents
- Location: `src/renderers/`
- Contains: Registry (document registry with aliases and round deps), 14 render functions, template utilities, audience modes
- Depends on: RenderContext (all rounds + static analysis)
- Used by: Generate command to write output files

**UI Layer:**
- Purpose: Terminal rendering with progress, status display
- Location: `src/ui/`
- Contains: TerminalRenderer (TTY with in-place updates), CI renderer, components, formatters
- Depends on: sisteransi (cursor control), picocolors
- Used by: Generate and analyze commands for progress display

**Utility Layer:**
- Purpose: Cross-cutting concerns (logging, errors, rate limiting)
- Location: `src/utils/`
- Contains: Logger, custom error classes, rate limiter
- Depends on: None
- Used by: All layers

## Data Flow

**Generate Command Flow:**

1. CLI loads config from `.handover.yml` (or defaults)
2. Validate API key from env
3. Create DAGOrchestrator with phase steps
4. **Phase: Static Analysis**
   - Run 8 concurrent analyzers on codebase
   - Produce StaticAnalysisResult
5. **Phase: Context Preparation**
   - Score files by importance (entry point, imports, git activity, edge cases)
   - Compute token budget based on provider context window
   - Pack files into tiers (full, signatures, skip) → PackedContext
6. **Phase: AI Rounds**
   - Round 1: Project overview (static analysis + config)
   - Round 2: Module detection (adds Round 1 compressed context)
   - Round 3: Feature extraction (adds Round 2 compressed context)
   - Round 4: Architecture detection (adds Rounds 1-3 compressed)
   - Round 5: Edge cases & conventions (adds all prior)
   - Round 6: Deployment inference (adds all prior)
   - **Per-round flow:**
     - Build prompt with current + prior findings
     - Call LLM with Zod schema validation
     - Validate claims against static data (drop-rate check)
     - Quality metrics check
     - Single retry if drop-rate > 30% or quality fails
     - Degrade to static fallback on persistent failure (never throws)
     - Compress output to 2000 tokens for next round
7. **Phase: Document Rendering**
   - Build RenderContext from all 6 rounds + static analysis
   - For each selected document (via --only filter):
     - Verify required rounds are available
     - Call document renderer function
     - Write to output directory
   - Generate INDEX with document statuses

**State Management:**

- **Results**: Immutable per phase, stored in DAGOrchestrator's results Map
- **Context**: Progressive accumulation (each round reads prior results)
- **Tokens**: Tracked continuously via TokenUsageTracker
- **Errors**: Graceful degradation (rounds fail safely, downstream documents partial)

## Key Abstractions

**StepDefinition/DAGOrchestrator:**
- Purpose: Generic task scheduling with dependency resolution
- Examples: `createStep()` factory, round creation helpers
- Pattern: Steps register with ID, dependency list, execute function; orchestrator validates DAG and executes

**DocumentSpec:**
- Purpose: Self-contained document metadata and render function
- Examples: Each entry in DOCUMENT_REGISTRY
- Pattern: Title, aliases for CLI, required rounds, render function taking unified RenderContext

**LLMProvider Interface:**
- Purpose: Pluggable LLM backend abstraction
- Examples: `src/providers/anthropic.ts`, `src/providers/openai-compat.ts`
- Pattern: All providers implement complete(), estimateTokens(), maxContextTokens()

**LanguageExtractor:**
- Purpose: Language-specific symbol extraction strategy
- Examples: TypeScriptExtractor, RustExtractor, RegexFallbackExtractor
- Pattern: Base class with extractFromSource(), language-specific implementations

**Analyzer (8 instances):**
- Purpose: Focused static analysis with independent concerns
- Examples: FileTreeAnalyzer, DependencyGraphAnalyzer, ASTAnalyzer
- Pattern: Each returns typed result (FileTreeResult, DependencyResult, etc.) or empty fallback on error

## Entry Points

**`src/cli/index.ts`:**
- Location: `src/cli/index.ts`
- Triggers: `npm run dev` or `handover` binary
- Responsibilities: Commander.js program setup, route to handlers (generate, analyze, estimate, init)

**`runGenerate` function:**
- Location: `src/cli/generate.ts`
- Triggers: `handover generate` command or default action
- Responsibilities: Load config, validate API key, build DAG, run orchestrator, render documents, write output

**`runAnalyze` function:**
- Location: `src/cli/analyze.ts`
- Triggers: `handover analyze` command
- Responsibilities: Run static analysis only, produce markdown or JSON report

**`runEstimate` function:**
- Location: `src/cli/estimate.ts`
- Triggers: `handover estimate` command
- Responsibilities: Estimate token cost before running full generate

**DAGOrchestrator.execute():**
- Location: `src/orchestrator/dag.ts`
- Triggers: Called by generate command after DAG is registered
- Responsibilities: Validate DAG, execute steps in dependency order, emit events, collect results

## Error Handling

**Strategy:** Graceful degradation with layered fallback

**Patterns:**

- **Static Analysis**: Individual analyzer failures return empty result (EMPTY_* constants), coordinator continues
- **AI Rounds**: Failed LLM calls retry once, then degrade to static fallback, never throw
- **Rendering**: Missing rounds produce partial documents (status: 'partial' or 'static-only'), all documents still written
- **DAG Validation**: Cyclic dependencies and missing deps detected pre-execution, execution stops with clear error
- **Config Loading**: Schema validation via Zod, invalid config stops at CLI boundary with schema error message
- **Provider Selection**: Invalid provider/model combo caught at config load, clear error in CLI

## Cross-Cutting Concerns

**Logging:**
- Approach: `src/utils/logger.ts` with --verbose flag
- Usage: Info/warn/debug via logger.info(), logger.warn()
- When: Major phase transitions, analyzer completion, round execution

**Validation:**
- Approach: Zod schemas throughout domain model, claim validation against static data in rounds
- Enforcement: CompletionResult validated by provider, ValidationResult.dropRate checked post-LLM
- Fallback: Claims with 0 supporting evidence are omitted, graceful omission

**Token Accounting:**
- Approach: TokenUsageTracker accumulates per-round, TokenBudget computed upfront
- Display: UI shows cumulative tokens/cost in real-time
- Enforcement: File content tier selection (full/signatures) respects budget, no budget overrun

**Provider Switching:**
- Approach: Unified LLMProvider interface, factory function selects impl via config
- Constraints: All providers must support structured output (Zod schema validation)
- Cost Estimation: Each provider has cost presets (PROVIDER_PRESETS)

---

*Architecture analysis: 2026-02-18*
