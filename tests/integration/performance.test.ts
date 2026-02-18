/**
 * Performance threshold test for the 2-minute (120-second) target.
 *
 * Tests that the static-only pipeline completes under 120 seconds
 * for a synthetic 200-file TypeScript project. This validates the
 * performance characteristics without requiring API keys.
 *
 * The full AI pipeline timing depends on LLM API latency which is
 * outside our control. Static-only should complete well under 2 minutes
 * for 200 files (expected: under 10 seconds).
 *
 * Requires `npm run build` before running.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFixtureScope, runCLI } from './setup.js';

const scope = createFixtureScope();
let fixtureDir: string;

beforeAll(() => {
  // Create a fixture simulating a ~200-file TypeScript project
  const files: Record<string, string> = {};

  for (let i = 0; i < 200; i++) {
    files[`src/module-${i}/index.ts`] = [
      `export interface Config${i} { name: string; value: number; }`,
      `export function process${i}(config: Config${i}): string {`,
      `  return config.name + config.value;`,
      `}`,
      `export const DEFAULT_${i} = { name: 'default', value: ${i} };`,
    ].join('\n');
  }

  // Add package.json for realism
  files['package.json'] = JSON.stringify({ name: 'test-project', version: '1.0.0' });
  // Add tsconfig
  files['tsconfig.json'] = JSON.stringify({ compilerOptions: { target: 'es2020' } });

  fixtureDir = scope.createFixture('perf-200-files', files);
});

afterAll(() => {
  scope.cleanup();
});

describe('performance', () => {
  it('completes --static-only in under 120 seconds', () => {
    const start = Date.now();
    const result = runCLI(fixtureDir, ['generate', '--static-only'], {
      timeout: 120_000,
    });
    const elapsed = Date.now() - start;

    // Log actual time for visibility
    console.log(`Static-only pipeline (200 files): ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s)`);

    // Hard threshold: must complete in under 2 minutes
    expect(elapsed).toBeLessThan(120_000);
    // Must succeed (exit code 0)
    expect(result.exitCode).toBe(0);
  });
});
