# AGENTS.md

AI-operational rules for the handover codebase.

## Commands

```bash
npm run dev -- generate    # Run CLI in dev mode (tsx)
npm run build              # Production build (tsup -> dist/)
npm run typecheck          # Type checking only (tsc --noEmit)
npm test                   # Run tests (vitest)
npm run lint               # Lint src/ (eslint, zero warnings allowed)
npm run lint:fix           # Auto-fix lint errors
npm run format             # Format all files (prettier)
npm run format:check       # Check formatting without writing
```

## File conventions

- Source files: `kebab-case.ts` | Renderers: `render-NN-name.ts` | AI rounds: `round-N-name.ts` | Tests: `*.test.ts`
- Imports: always `.js` extension (ESM); use `import type` for type-only imports
- No semicolons; single quotes; 2-space indent; trailing commas; section separators `// ─── Name ───...`

## Where things live

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

## Commit messages

Conventional commits format: `type(scope): description`

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
Scope: phase number (e.g., `03`) or module name (e.g., `providers`)

## Rules

- Do not add unit tests — the project uses integration tests only (by design)
- Do not modify files in `.planning/` unless explicitly asked
- Do not add `console.log` — use `logger.log()` / `logger.warn()` / `logger.error()` from `src/utils/logger.ts`
- Do not bypass the DAG orchestrator — all pipeline steps must be registered as DAG steps
- Do not add new dependencies without justification — the project keeps a small dependency footprint
- Do not duplicate retry/rate-limit logic — it belongs in `BaseProvider`
- Do not add inline `process.exit()` calls — use `handleCliError()` for CLI error handling
- Domain types must be defined as Zod schemas in `src/domain/schemas.ts`; derive TypeScript types with `z.infer<>`
