# Architecture

## Overview

handover is a CLI tool that generates comprehensive codebase documentation by combining static analysis with LLM reasoning. When you run `handover generate`, it collects facts about your repository through eight concurrent analyzers, packs the most relevant source files into a context window, runs six sequential AI reasoning rounds through a DAG orchestrator, and renders up to fourteen structured markdown documents. The tool supports seven LLM providers out of the box, requires only an API key in your environment, and caches round outputs to make repeat runs fast.

## How a handover run works

### Entry: CLI and command routing

Everything starts at `src/cli/index.ts`. This file uses [Commander.js](https://github.com/tj/commander.js/) to register four commands: `generate`, `init`, `analyze`, and `estimate`. When you run `handover generate` (or just `handover` with no subcommand), Commander calls `runGenerate()` in `src/cli/generate.ts`.

`runGenerate()` owns the full pipeline. It creates the terminal renderer, loads configuration, sets up the DAG orchestrator, registers pipeline steps, and drives execution to completion.

### Config loading

Before any analysis starts, `src/config/loader.ts` assembles configuration through four layers in precedence order, with later layers winning:

1. **Defaults** — Zod schema defaults in `src/config/schema.ts` (provider: anthropic, output: ./handover, etc.)
2. **File** — `.handover.yml` in the project root, parsed with the `yaml` package
3. **Environment** — `HANDOVER_PROVIDER`, `HANDOVER_MODEL`, `HANDOVER_OUTPUT` environment variables
4. **CLI flags** — `--provider`, `--model`, and other flags passed to the command

The merged result is validated by `HandoverConfigSchema` (a Zod schema in `src/config/schema.ts`). Validation failures throw a `ConfigError` immediately — the tool never starts pipeline work with an invalid config.

### Static analysis: eight concurrent analyzers

`src/analyzers/coordinator.ts` runs all eight analyzers concurrently via `Promise.allSettled()`. No analyzer blocks another — if one fails, the others continue and that slot gets an empty-but-valid fallback result. The eight analyzers are:

| Analyzer     | File                                | What it produces                                             |
| ------------ | ----------------------------------- | ------------------------------------------------------------ |
| file-tree    | `src/analyzers/file-tree.ts`        | Directory structure, file counts, extension breakdown        |
| dependencies | `src/analyzers/dependency-graph.ts` | package.json manifests, dependency warnings                  |
| git-history  | `src/analyzers/git-history.ts`      | Commits, contributors, activity patterns, branch strategy    |
| todos        | `src/analyzers/todo-scanner.ts`     | TODO/FIXME/HACK comments with file locations                 |
| env          | `src/analyzers/env-scanner.ts`      | Environment variable references across the codebase          |
| ast          | `src/analyzers/ast-analyzer.ts`     | Functions, classes, exports, imports via Tree-sitter parsing |
| tests        | `src/analyzers/test-analyzer.ts`    | Test framework detection, test file inventory                |
| docs         | `src/analyzers/doc-analyzer.ts`     | README presence, docs folder, inline doc coverage            |

Results are assembled into a `StaticAnalysisResult` object that flows into every subsequent stage.

### Context packing: fitting your repo into a token budget

After static analysis, three modules in `src/context/` determine which source files the LLM actually reads:

- `src/context/scorer.ts` scores every file by relevance signals (recency in git, import frequency, test coverage, file size)
- `src/context/token-counter.ts` computes a token budget from the provider's context window
- `src/context/packer.ts` fills the budget greedily with the highest-scoring files, reading them from disk

The packed context travels with the static analysis result into every AI round.

### DAG orchestration

`src/orchestrator/dag.ts` contains `DAGOrchestrator`, which coordinates all pipeline steps. Each step declares its `id`, `name`, and `deps` (an array of step IDs it depends on). The orchestrator uses Kahn's topological sort algorithm to determine execution order: steps with no remaining dependencies run immediately; when a step finishes, its dependents are checked and started as soon as all their dependencies have resolved.

Failed steps skip their dependents automatically, so an independent branch of the DAG continues running even if an unrelated step fails.

The concrete pipeline built in `src/cli/generate.ts` looks like this:

```
static-analysis
    └── ai-round-1 (overview)
    └── ai-round-2 (modules)       depends on: static-analysis
    └── ai-round-3 (features)      depends on: ai-round-1, ai-round-2
    └── ai-round-4 (architecture)  depends on: ai-round-1, ai-round-2, ai-round-3
    └── ai-round-5 (edge-cases)    depends on: ai-round-1, ai-round-2
    └── ai-round-6 (deployment)    depends on: ai-round-1, ai-round-2
         └── render (document rendering)
```

### AI rounds: six reasoning passes

Six round files in `src/ai-rounds/` define the LLM prompts and output schemas:

| Round | File                                    | Purpose                                     |
| ----- | --------------------------------------- | ------------------------------------------- |
| 1     | `src/ai-rounds/round-1-overview.ts`     | Project identity, purpose, tech stack       |
| 2     | `src/ai-rounds/round-2-modules.ts`      | Module inventory and responsibilities       |
| 3     | `src/ai-rounds/round-3-features.ts`     | User-facing features and use cases          |
| 4     | `src/ai-rounds/round-4-architecture.ts` | Architectural patterns and design decisions |
| 5     | `src/ai-rounds/round-5-edge-cases.ts`   | Error handling, edge cases, failure modes   |
| 6     | `src/ai-rounds/round-6-deployment.ts`   | Deployment, environment variables, CI/CD    |

Each round calls `provider.complete()` which handles rate limiting and retry with exponential backoff (3 retries, 30 second base delay). Round outputs are Zod-validated structured objects. Results are cached between runs using `src/cache/round-cache.ts` — if the codebase fingerprint has not changed, cached round data is used instead of calling the API again.

Round 5 is a fan-out round: it depends on rounds 1 and 2 (like round 6) rather than on the sequential chain.

### Rendering: fourteen documents

Once all required rounds complete, the render step assembles output documents. Each renderer in `src/renderers/` follows the same pattern: it receives a `RenderContext` (containing all round outputs and static analysis) and calls `renderDocument()` from `src/renderers/render-template.ts`. That helper writes the YAML front-matter, document heading, body, and Related Documents footer.

The fourteen documents are:

| File                   | Renderer                                     |
| ---------------------- | -------------------------------------------- |
| 00-INDEX.md            | `src/renderers/render-00-index.ts`           |
| 01-PROJECT-OVERVIEW.md | `src/renderers/render-01-overview.ts`        |
| 02-GETTING-STARTED.md  | `src/renderers/render-02-getting-started.ts` |
| 03-ARCHITECTURE.md     | `src/renderers/render-03-architecture.ts`    |
| 04-FILE-STRUCTURE.md   | `src/renderers/render-04-file-structure.ts`  |
| 05-FEATURES.md         | `src/renderers/render-05-features.ts`        |
| 06-MODULES.md          | `src/renderers/render-06-modules.ts`         |
| 07-DEPENDENCIES.md     | `src/renderers/render-07-dependencies.ts`    |
| 08-ENVIRONMENT.md      | `src/renderers/render-08-environment.ts`     |
| 09-EDGE-CASES.md       | `src/renderers/render-09-edge-cases.ts`      |
| 10-TECH-DEBT.md        | `src/renderers/render-10-tech-debt.ts`       |
| 11-CONVENTIONS.md      | `src/renderers/render-11-conventions.ts`     |
| 12-TESTING.md          | `src/renderers/render-12-testing.ts`         |
| 13-DEPLOYMENT.md       | `src/renderers/render-13-deployment.ts`      |

Documents are written to the `output` directory (default: `./handover/`). The index is always written last because it lists the status of every other document.

### Output

At the end of a successful run, the `./handover/` directory contains fourteen markdown files. Each document has a YAML front-matter block with metadata (document ID, generation timestamp, audience mode, AI rounds used, and status). The `00-INDEX.md` provides a summary table linking to all other documents.

## Key patterns

**Zod-first types** — All data shapes are defined as Zod schemas first, and TypeScript types are inferred with `z.infer<>`. See `src/config/schema.ts` for config types and `src/ai-rounds/schemas.ts` for round output types. This means runtime validation and static types are always in sync.

**Template Method providers** — `src/providers/base-provider.ts` implements retry logic, rate limiting, and token estimation. Concrete providers only implement `doComplete()` (the provider-specific API call) and `isRetryable()`. See `src/providers/anthropic.ts` and `src/providers/openai-compat.ts`.

**Config + Factory rounds** — AI rounds follow a factory pattern. Each round file exports a `createRoundNStep()` function that takes the provider, analysis, and context and returns a `StepDefinition`. Round prompts live in `src/ai-rounds/prompts.ts` and output schemas in `src/ai-rounds/schemas.ts`.

**DAG orchestration** — The pipeline is a directed acyclic graph, not a fixed sequence. Steps declare dependencies by ID and run as soon as those dependencies resolve. This makes it straightforward to add new steps or change dependency relationships without touching the orchestrator itself. See `src/orchestrator/dag.ts`.

**Three-tier error handling** — Errors are classified as `ConfigError`, `ProviderError`, or `OrchestratorError`. Each class carries a message, detail, and suggestion for the user. The `handleCliError()` function in `src/utils/errors.ts` formats these for the terminal.

## Directory structure

```
src/
├── ai-rounds/         Six LLM reasoning rounds — prompts, schemas, round factories
├── analyzers/         Eight static analyzers + coordinator + context builder
├── cache/             Round result caching keyed on codebase fingerprint
├── cli/               CLI entry point (index.ts) and command handlers (generate, init, analyze, estimate)
├── config/            Config schema (Zod), loader (four-layer merge), and defaults
├── context/           File scoring, context packing, and token budget calculation
├── domain/            Shared TypeScript types and DAG step types
├── grammars/          Tree-sitter WASM grammars for AST parsing
├── orchestrator/      DAGOrchestrator and StepDefinition builder
├── parsing/           Tree-sitter parsing utilities used by the AST analyzer
├── providers/         BaseProvider, AnthropicProvider, OpenAICompatibleProvider, presets, factory
├── renderers/         Fourteen document renderers, shared template, and document registry
├── ui/                Terminal renderer (progress display, banners, completion summary)
└── utils/             Logger, error classes, rate limiter with retry backoff
```
