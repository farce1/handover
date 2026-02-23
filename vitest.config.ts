import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.claude', '.planning'],
    testTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        // Test files
        'src/**/*.test.ts',
        'src/**/*.spec.ts',

        // Type-only files
        'src/**/types.ts',

        // Schema / Zod declarations
        'src/domain/schemas.ts',

        // CLI entry point and commands — integration-only (require full pipeline)
        'src/cli/index.ts',
        'src/cli/generate.ts',
        'src/cli/analyze.ts',
        'src/cli/estimate.ts',
        'src/cli/init.ts',
        'src/cli/monorepo.ts',
        'src/cli/search.ts',
        'src/cli/reindex.ts',
        'src/cli/serve.ts',

        // WASM grammar downloader and parsing layer
        'src/grammars/downloader.ts',
        'src/parsing/**',

        // Configuration constants and filesystem-dependent loader
        'src/config/defaults.ts',
        'src/config/loader.ts',

        // Analyzers — require real filesystem / git context
        'src/analyzers/**',

        // Cache layer — requires real filesystem
        'src/cache/**',

        // UI components — require full renderer pipeline
        'src/ui/**',

        // Individual document renderers — require full pipeline context
        'src/renderers/render-*.ts',
        'src/renderers/audience.ts',
        'src/renderers/mermaid.ts',
        'src/renderers/renderer-template.ts',

        // Domain entity factories — integration-only
        'src/domain/entities.ts',

        // Provider SDK wrappers — require real SDKs / network
        'src/providers/anthropic.ts',
        'src/providers/openai-compat.ts',
        'src/providers/base-provider.ts',
        'src/providers/base.ts',
        'src/providers/schema-utils.ts',

        // Semantic search and MCP runtime surfaces — integration-only
        'src/vector/embedder.ts',
        'src/vector/query-engine.ts',
        'src/vector/reindex.ts',
        'src/vector/schema.ts',
        'src/vector/vector-store.ts',
        'src/mcp/**',
        'src/qa/**',

        // Provider factory — imports real SDK constructors (integration-only)
        'src/providers/factory.ts',

        // AI round executors and factory — integration-only (require full LLM pipeline)
        'src/ai-rounds/round-*.ts',
        'src/ai-rounds/round-factory.ts',
        'src/ai-rounds/prompts.ts',
        'src/ai-rounds/fallbacks.ts',
        'src/ai-rounds/schemas.ts',
        'src/ai-rounds/summary.ts',

        // Logger — color-formatting/verbosity utility tested indirectly via all modules
        'src/utils/logger.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
