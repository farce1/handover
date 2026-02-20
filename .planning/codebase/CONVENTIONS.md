# Coding Conventions

**Analysis Date:** 2026-02-18

## Naming Patterns

**Files:**

- Kebab-case for most files: `parser-service.ts`, `file-tree.ts`, `ast-analyzer.ts`
- Descriptive names indicating primary function/class: `anthropic.ts` (provider), `logger.ts` (utility)
- Analyzer modules follow pattern: `{area}-analyzer.ts` or `{area}-scanner.ts` (e.g., `test-analyzer.ts`, `env-scanner.ts`)
- Round files follow pattern: `round-{number}-{topic}.ts` (e.g., `round-1-overview.ts`, `round-5-edge-cases.ts`)

**Functions:**

- camelCase for all functions: `createProject()`, `analyzeFileTree()`, `parseFile()`
- Verb prefixes for operations: `create*`, `analyze*`, `build*`, `extract*`, `scan*`, `run*`
- Factory functions use `create` prefix: `createProject()`, `createModule()`, `createFeature()`
- Static factory methods in error classes use descriptive patterns: `ConfigError.fileNotFound()`, `ProviderError.missingApiKey()`

**Variables:**

- camelCase for all variables: `totalFiles`, `filesByExtension`, `langInfo`, `scopeDir`
- Descriptive names with semantic meaning: `nonBinaryFiles`, `lineCounts`, `dirSet`
- Constants use UPPER_SNAKE_CASE: `FIXTURES_DIR`, `CLI_PATH`, `EMPTY_FILE_TREE`, `ANALYZER_NAMES`
- Underscore prefix for internal/private: used with `private` access modifier in classes

**Types:**

- PascalCase for all types and interfaces: `Project`, `Module`, `Feature`, `SourceFile`
- Schema types end with `Schema`: `ProjectSchema`, `SourceFileSchema`, `CompletionRequestSchema`
- Type inference from schemas using `z.infer<>`: `export type Project = z.infer<typeof ProjectSchema>`
- Generic type parameters: single capital letters or descriptive names (`T`, `R`, `Result`)

## Code Style

**Formatting:**

- No explicit linter configured — relies on TypeScript strict mode
- 2-space indentation (inferred from source code)
- No semicolons enforced but generally present
- Single quotes for strings: `'path'`, `'utf-8'`, `'error'`

**Linting:**

- TypeScript strict mode enabled: `"strict": true` in `tsconfig.json`
- Module resolution: `NodeNext` for proper ESM support
- No ESLint or Prettier config — code formatted manually or via IDE defaults

**TypeScript Strictness:**

- `esModuleInterop: true` — allows default imports from CommonJS modules
- `isolatedModules: true` — enforces module boundaries
- `forceConsistentCasingInFileNames: true` — prevents path case mismatches
- `skipLibCheck: true` — skips type checking of node_modules

## Import Organization

**Order:**

1. Node.js built-ins: `import { readFile } from 'node:fs/promises'`
2. Third-party packages: `import { Command } from 'commander'`, `import Anthropic from '@anthropic-ai/sdk'`
3. Local modules: `import { logger } from './logger.js'`, `import type { HandoverConfig } from '../config/schema.js'`

**Path Aliases:**

- No path aliases configured
- Relative imports using `../` (parent) or `./` (sibling) are used throughout
- Always include file extension `.js` in imports (ESM convention for Node.js)

**Import Style:**

- Named imports for specific exports: `import { readFile } from 'node:fs/promises'`
- Default imports for classes and providers: `import Anthropic from '@anthropic-ai/sdk'`
- Separate `import type` for type-only imports: `import type { AnalysisContext } from './types.js'`
- Group and sort imports logically (node, third-party, local)

## Error Handling

**Patterns:**

- Custom error hierarchy extending `Error`: `HandoverError` base class at `src/utils/errors.ts`
- Error subclasses for specific domains: `ConfigError`, `ProviderError`, `OrchestratorError`
- Each error includes three semantic parts: `message`, `reason`, `fix` (Rust compiler-inspired)
- Static factory methods for domain-specific errors: `ConfigError.fileNotFound(path)`, `ProviderError.missingApiKey(provider)`
- Try-catch blocks wrap potentially failing async operations, with errors re-thrown or logged via `handleCliError()`

**Error Throwing:**

```typescript
// In config loading:
if (!exists) {
  throw ConfigError.fileNotFound('.handover.yml');
}

// In CLI entry:
try {
  await runGenerate(opts);
} catch (err) {
  throw new HandoverError(message, reason, fix, code);
}
```

**Assertions and Validation:**

- Zod schemas validate all data structures: `ProjectSchema.parse({...})`
- Parser validates nullable tree results: `if (!tree) throw new Error('parse returned null')`
- Extractor lookup with fallback: `const extractor = this.extractors.get(langId)`

## Logging

**Framework:** No logging library — uses `console` directly through custom `Logger` class at `src/utils/logger.ts`

**Patterns:**

- Structured logger with methods: `logger.info()`, `logger.log()` (verbose), `logger.warn()`, `logger.error()`, `logger.success()`, `logger.step()`, `logger.ai()`, `logger.blank()`
- Color-coded output via `picocolors`:
  - Cyan: headers, paths, info
  - Green: success
  - Yellow: warnings, cost
  - Red: errors
  - Magenta: AI activity
- Verbose mode controlled by `logger.setVerbose(true)` and `--verbose` CLI flag
- Suppress mode (for non-TTY output) via `logger.setSuppressed(true)` — prevents corrupting renderer output
- Respects `NO_COLOR` environment variable automatically (handled by picocolors)

**When to Log:**

- Info: Configuration loading, start/completion of major operations
- Log: Detailed diagnostic info (verbose mode only)
- Warn: Skipped files, fallback behaviors, missing optional config
- Error: Failures (via `logger.error(HandoverError)`)
- Success: Completion milestones
- Step: Progress tracking with spinner-like indicators (start/done/fail)
- AI: LLM activity and token usage

## Comments

**When to Comment:**

- JSDoc blocks above all public functions, classes, and exported types
- Inline comments explain "why" not "what" — code should be self-documenting
- Section dividers using Unicode box drawing: `// ─── Section Name ──────────────────────────`
- Comments for complex logic or non-obvious intent

**JSDoc/TSDoc:**

- Function docstring format with `/**` block:
  ```typescript
  /**
   * Create a new Project with sensible defaults.
   * All values are validated through the Zod schema.
   */
  export function createProject(
    name: string,
    language: string,
    overrides?: Partial<Project>,
  ): Project { ... }
  ```
- Class docstrings describe purpose and usage:
  ```typescript
  /**
   * WASM-safe parser service with lazy grammar loading.
   * Manages the web-tree-sitter lifecycle: init, language loading, memory safety.
   */
  export class ParserService { ... }
  ```
- No `@param` or `@returns` tags — signature is documentation
- Reference documentation sections by code: `PROV-01`, `STAT-01`, `DAG-02`

## Function Design

**Size:** Functions are concise (10-50 lines typical), with clear single responsibility

**Parameters:**

- Use context objects for multiple related params: `analyzeFileTree(ctx: AnalysisContext)`
- Options objects with defaults for optional parameters: `{ timeout?: number, env?: Record<string, string> }`
- Type narrowing in parameters: `block is Anthropic.ToolUseBlock => block.type === 'tool_use'`

**Return Values:**

- Async functions return `Promise<T>` for specific data: `Promise<ParsedFile>`, `Promise<FileTreeResult>`
- Result objects with data + metadata: `{ data: T, usage: Usage }`
- Result objects for analyzer outputs: `AnalyzerResult<FileTreeResult>`
- Throw errors on failure — no null/undefined returns for failures

**Async/Await:**

- Prefer `async/await` over `.then()` chains
- Use `await` in loops only when necessary; prefer `Promise.all()` for batches
- Try/finally blocks for resource cleanup (tree.delete() in parser)

## Module Design

**Exports:**

- Named exports for functions: `export function createProject(...)`
- Named exports for types: `export type Project = ...`
- Singleton instances exported as constants: `export const logger = new Logger()`
- No default exports (except barrel files in renderers/)

**Barrel Files:**

- Used in renderers/ for organizing multiple related exports
- Pattern: `registry.ts` imports and re-exports all `render-*.ts` modules
- Index files (`index.ts`) aggregate analyzers and providers

**File Organization:**

- One public API per module (main function or class)
- Helpers and types co-located in same file
- Private helper functions in same module (not extracted unless reused)
- Constants defined at module top level

**Imports within Modules:**

- Analyzer modules import shared types from `./types.js`
- Providers extend `BaseProvider` base class at `src/providers/base-provider.ts`
- Extractors implement `LanguageExtractor` interface from `src/parsing/extractors/base.ts`
- Domain entities import schemas from `src/domain/schemas.js`

## Conventions Summary

**Code Quality:**

- Strong typing with TypeScript strict mode — no `any` types
- Zod schemas validate all data at boundaries
- Error classes provide helpful "what/why/fix" messages
- No linting tool — rely on TypeScript and manual review
- Functions are small, focused, and well-named

---

_Convention analysis: 2026-02-18_
