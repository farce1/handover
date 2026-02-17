import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  splitting: true,
  sourcemap: true,
  dts: false, // No type declarations needed for CLI tool
  shims: false,
  // Shebang is preserved from src/cli/index.ts source -- no banner needed
  external: [
    // Keep native/WASM deps external -- resolved at runtime
    'web-tree-sitter',
    // Keep heavy SDK deps external -- installed as dependencies
    '@anthropic-ai/sdk',
    'openai',
  ],
  noExternal: [
    // Bundle small utility deps for fewer install issues
    'picocolors',
  ],
});
