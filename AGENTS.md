# AGENTS.md

Guidelines for AI agents working on the handover codebase.

## Project overview

handover is a CLI tool that generates comprehensive codebase documentation. It runs static analysis, packs context into a token budget, executes 6 rounds of LLM analysis via a DAG orchestrator, and renders 14 interconnected markdown documents.

- **Language:** TypeScript (strict mode, ESM)
- **Runtime:** Node >= 18
- **Build:** tsup (ESM, code-splitting, sourcemaps)
- **Test:** vitest (integration tests only, gated behind `HANDOVER_INTEGRATION=1`)
- **Package manager:** npm

## Architecture

```
src/
├── ai-rounds/       # 6 AI analysis rounds + factory + orchestration
├── analyzers/       # 8 concurrent static analyzers + coordinator
├── cache/           # Round cache for crash recovery
├── cli/             # Commander.js commands: generate, analyze, estimate, init
├── config/          # Zod config schema, YAML/env/CLI loader
├── context/         # Token scoring, packing, compression, tracking
├── domain/          # Core Zod schemas + derived TypeScript types
├── grammars/        # tree-sitter WASM grammar downloader
├── orchestrator/    # DAG executor with Kahn's topological sort
├── parsing/         # Multi-language AST parsing (tree-sitter + regex fallback)
├── providers/       # LLM providers: Anthropic, OpenAI-compatible (8 presets)
├── renderers/       # 14 document renderers + shared template
├── ui/              # TTY and CI terminal renderers
└── utils/           # Logger, error classes, rate limiter
```

## Key patterns

### Types: Zod-first

All domain types are defined as Zod schemas in `src/domain/schemas.ts`. TypeScript types are derived with `z.infer<>` in `src/domain/types.ts`. Never define a domain type without a corresponding schema.

### Providers: Template Method

`BaseProvider` (abstract class) handles retry, rate-limiting, and token estimation. Concrete providers (`AnthropicProvider`, `OpenAICompatibleProvider`) implement `doComplete()` and `isRetryable()`. Do not duplicate retry/rate-limit logic in provider subclasses.

### AI rounds: Config + Factory

Rounds 1-4 and 6 use `StandardRoundConfig` + `createStandardRoundStep()` factory. Round 5 is structurally different (fan-out) and has its own step creator. When adding a new round, follow the factory pattern unless it has unique execution semantics.

### Renderers: Template scaffold

All renderers use `renderDocument()` from `render-template.ts` which handles front-matter, heading, cross-references, and the body callback. Use `collectRoundsUsed()` for round tracking and `pushStructuredBlock()` for AI audience blocks.

### Error handling: Three-tier

1. **Provider level** -- `BaseProvider` retries transient errors via `retryWithBackoff`
2. **Round level** -- `executeRound` catches errors and degrades gracefully to fallback data
3. **CLI level** -- `handleCliError()` wraps unknown errors in `HandoverError` for consistent terminal output

### Orchestration: DAG

Steps are registered with `createStep()` and executed by `DAGOrchestrator` in topological order. Dependencies are declared as string arrays. The DAG validates for cycles and missing deps before execution.

## Conventions

### Code style

- No semicolons (auto-removed by formatter in future)
- Single quotes for strings
- 2-space indentation
- Trailing commas in multi-line structures
- `import type` for type-only imports
- File extensions in imports: always `.js` (ESM resolution)
- Section separators: `// ─── SectionName ───...` (box-drawing characters)

### Commit messages

Follow conventional commits: `feat(scope): description`, `fix(scope): description`, `docs(scope): description`. Scope is typically a phase number (e.g., `09`) or module name.

### File naming

- Source files: `kebab-case.ts`
- Renderers: `render-NN-name.ts` (numbered to match document output)
- AI rounds: `round-N-name.ts`
- Test files: `*.test.ts`

## Commands

```bash
npm run dev -- generate    # Run CLI in dev mode (tsx)
npm run build              # Production build (tsup -> dist/)
npm run typecheck          # Type checking only (tsc --noEmit)
npm test                   # Run tests (vitest)
```

## What NOT to do

- Do not add unit tests -- the project uses integration tests only (by design)
- Do not add ESLint/Prettier -- not yet configured, planned for future
- Do not modify files in `.planning/` unless explicitly asked -- these are internal project management docs
- Do not add `console.log` -- use `logger.log()` / `logger.warn()` / `logger.error()` from `src/utils/logger.ts`
- Do not bypass the DAG orchestrator -- all pipeline steps must be registered as DAG steps
- Do not add new dependencies without justification -- the project intentionally keeps a small dependency footprint
- Do not duplicate retry/rate-limit logic -- it belongs in `BaseProvider`
- Do not add inline `process.exit()` calls -- use `handleCliError()` for CLI error handling
