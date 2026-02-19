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
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/types.ts', // Type-only files (pure type exports)
        'src/domain/schemas.ts', // Zod schema declarations
        'src/cli/index.ts', // CLI entry point
        'src/grammars/downloader.ts', // WASM grammar downloader
        'src/parsing/**', // WASM-dependent parsing layer
        'src/config/defaults.ts', // Configuration constants
      ],
      // Thresholds deliberately omitted — Phase 11 enforces 80%
    },
  },
});
