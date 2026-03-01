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
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        // ── Coverage Exclusion List (FROZEN) ──────────────────────────
        // Each entry requires a written justification comment.
        // Do NOT add entries without justification. Do NOT enable thresholds.autoUpdate.
        // To add a new exclusion: add the path + justification comment and update this date.
        // Last frozen: 2026-03-01 (updated in plan 27-01)

        // Test files — not application code
        'src/**/*.test.ts',
        // Test files — not application code
        'src/**/*.spec.ts',

        // Type-only declarations — no executable logic
        'src/**/types.ts',

        // Zod schema declarations — no imperative logic to cover
        'src/domain/schemas.ts',

        // Pure re-exports barrel — no executable logic
        'src/auth/index.ts',

        // CLI entry point — integration-only, requires full pipeline
        'src/cli/index.ts',
        // CLI entry point — integration-only, requires full pipeline
        'src/cli/generate.ts',
        // CLI entry point — integration-only, requires full pipeline
        'src/cli/analyze.ts',
        // CLI entry point — integration-only, requires full pipeline
        'src/cli/estimate.ts',
        // CLI entry point — integration-only, requires full pipeline
        'src/cli/init.ts',
        // CLI entry point — integration-only, requires full pipeline
        'src/cli/monorepo.ts',
        // CLI entry point — integration-only, requires full pipeline
        'src/cli/search.ts',
        // CLI entry point — integration-only, requires full pipeline
        'src/cli/reindex.ts',
        // CLI entry point — integration-only, requires full pipeline
        'src/cli/serve.ts',
        // CLI entry point — integration-only, requires full pipeline
        'src/cli/embedding-health.ts',
        // Interactive TTY onboarding wizard — integration-only
        'src/cli/onboarding.ts',
        // Commander command wiring — integration-only
        'src/cli/auth/index.ts',
        // Browser OAuth CLI command — integration-only
        'src/cli/auth/login.ts',
        // Credential display CLI command — integration-only
        'src/cli/auth/status.ts',

        // WASM grammar downloader / Tree-sitter parsing — binary-dependent integration code
        'src/grammars/downloader.ts',
        // WASM grammar downloader / Tree-sitter parsing — binary-dependent integration code
        'src/parsing/**',

        // Configuration constants / filesystem-dependent loader — integration-only
        'src/config/defaults.ts',
        // Configuration constants / filesystem-dependent loader — integration-only
        'src/config/loader.ts',

        // Static analyzers — require real filesystem and git context
        'src/analyzers/**',

        // Cache layer — requires real filesystem I/O
        'src/cache/**',

        // UI components — require full renderer pipeline with TTY
        'src/ui/**',

        // Individual renderers — require full pipeline context with all round data
        'src/renderers/render-*.ts',
        // Individual renderers — require full pipeline context with all round data
        'src/renderers/audience.ts',
        // Individual renderers — require full pipeline context with all round data
        'src/renderers/mermaid.ts',
        // Individual renderers — require full pipeline context with all round data
        'src/renderers/renderer-template.ts',

        // Domain entity factories — integration-only construction
        'src/domain/entities.ts',

        // Provider SDK wrappers — require real SDKs / network / API keys
        'src/providers/anthropic.ts',
        // Provider SDK wrappers — require real SDKs / network / API keys
        'src/providers/openai-compat.ts',
        // Provider SDK wrappers — require real SDKs / network / API keys
        'src/providers/base-provider.ts',
        // Provider SDK wrappers — require real SDKs / network / API keys
        'src/providers/base.ts',
        // Provider SDK wrappers — require real SDKs / network / API keys
        'src/providers/schema-utils.ts',
        // Gemini provider SDK wrapper — requires Google GenAI SDK + API key
        'src/providers/gemini.ts',

        // Semantic search runtime — require SQLite + embeddings infrastructure
        'src/vector/embedder.ts',
        // Semantic search runtime — require SQLite + embeddings infrastructure
        'src/vector/embedding-health.ts',
        // Semantic search runtime — require SQLite + embeddings infrastructure
        'src/vector/embedding-router.ts',
        // Semantic search runtime — require SQLite + embeddings infrastructure
        'src/vector/local-embedder.ts',
        // Semantic search runtime — require SQLite + embeddings infrastructure
        'src/vector/query-engine.ts',
        // Semantic search runtime — require SQLite + embeddings infrastructure
        'src/vector/reindex.ts',
        // Semantic search runtime — require SQLite + embeddings infrastructure
        'src/vector/schema.ts',
        // Semantic search runtime — require SQLite + embeddings infrastructure
        'src/vector/vector-store.ts',
        // Gemini embedding SDK wrapper — requires Google GenAI SDK + network
        'src/vector/gemini-embedder.ts',

        // MCP server runtime — require full MCP SDK server lifecycle
        'src/mcp/server.ts',
        // MCP server runtime — require full MCP SDK server lifecycle
        'src/mcp/regeneration-executor.ts',
        // MCP server runtime — require full MCP SDK server lifecycle
        'src/mcp/resources.ts',
        // MCP server runtime — require full MCP SDK server lifecycle
        'src/mcp/prompts.ts',
        // MCP server runtime — require full MCP SDK server lifecycle
        'src/mcp/workflow-checkpoints.ts',
        // MCP server runtime — require full MCP SDK server lifecycle
        'src/mcp/pagination.ts',
        // MCP server runtime — require full MCP SDK server lifecycle
        'src/mcp/preflight.ts',
        // NOTE: mcp/tools.ts, mcp/errors.ts, and mcp/http-security.ts are intentionally testable

        // QA session runtime — integration-only streaming lifecycle
        'src/qa/**',

        // Regeneration job runtime — filesystem/process orchestration
        'src/regeneration/**',

        // Provider factory — imports real SDK constructors
        'src/providers/factory.ts',

        // AI round executors — integration-only, require full LLM pipeline
        'src/ai-rounds/round-*.ts',
        // AI round executors — integration-only, require full LLM pipeline
        'src/ai-rounds/round-factory.ts',
        // AI round executors — integration-only, require full LLM pipeline
        'src/ai-rounds/prompts.ts',
        // AI round executors — integration-only, require full LLM pipeline
        'src/ai-rounds/fallbacks.ts',
        // AI round executors — integration-only, require full LLM pipeline
        'src/ai-rounds/schemas.ts',
        // AI round executors — integration-only, require full LLM pipeline
        'src/ai-rounds/summary.ts',

        // Logger — color-formatting/verbosity utility tested indirectly via all modules
        'src/utils/logger.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },
  },
});
