/**
 * Integration tests for edge case handling.
 *
 * Tests the CLI's behavior with:
 * - Empty repositories (no source files)
 * - Enormous files (>2MB threshold)
 * - Binary-only directories
 * - Repositories with no git history
 *
 * All tests use `--static-only` to avoid AI API calls and cost.
 * Requires `npm run build` before running.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFixtureScope, runCLI } from './setup.js';

const scope = createFixtureScope();

afterAll(() => {
  scope.cleanup();
});

describe('empty repository', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = scope.createFixture(`empty-repo-${Date.now()}`, {
      // README is not a source file for analysis purposes
      'README.md': '# Empty Project\n\nThis repo has no source code.',
    });
  });

  it('does not crash', () => {
    const result = runCLI(fixtureDir, ['generate', '--static-only']);
    expect(result.exitCode).toBe(0);
  });

  it('produces output directory', () => {
    runCLI(fixtureDir, ['generate', '--static-only']);
    const outputDir = join(fixtureDir, 'handover');
    expect(existsSync(outputDir)).toBe(true);
  });

  it('produces static-analysis report', () => {
    runCLI(fixtureDir, ['generate', '--static-only']);
    const reportPath = join(fixtureDir, 'handover', 'static-analysis.md');
    expect(existsSync(reportPath)).toBe(true);

    const content = readFileSync(reportPath, 'utf-8');
    // Report should exist and contain a header
    expect(content).toContain('# Static Analysis Report');
  });
});

describe('enormous file skipping', () => {
  let fixtureDir: string;

  beforeEach(() => {
    // Create a fixture with one normal file and one enormous file (>2MB)
    const normalContent = Array.from(
      { length: 50 },
      (_, i) => `export function handler${i}(): string { return 'ok'; }`,
    ).join('\n');

    // Generate 2.1MB of content to exceed the 2MB threshold
    const enormousContent = 'x'.repeat(2.1 * 1024 * 1024);

    fixtureDir = scope.createFixture(`enormous-file-${Date.now()}`, {
      'normal.ts': normalContent,
      'enormous.js': enormousContent,
    });
  });

  it('completes without error', () => {
    const result = runCLI(fixtureDir, ['generate', '--static-only']);
    expect(result.exitCode).toBe(0);
  });

  it('includes normal file in output', () => {
    runCLI(fixtureDir, ['generate', '--static-only']);
    const reportPath = join(fixtureDir, 'handover', 'static-analysis.md');
    const content = readFileSync(reportPath, 'utf-8');
    expect(content).toContain('normal.ts');
  });

  it('skips enormous file', () => {
    runCLI(fixtureDir, ['generate', '--static-only']);
    const reportPath = join(fixtureDir, 'handover', 'static-analysis.md');
    const content = readFileSync(reportPath, 'utf-8');
    // The enormous file should not appear in the static analysis report file tree
    expect(content).not.toContain('enormous.js');
    // Only the normal file should be counted (fileCount in frontmatter)
    const fileCountMatch = content.match(/fileCount:\s*(\d+)/);
    expect(fileCountMatch).not.toBeNull();
    expect(Number(fileCountMatch![1])).toBe(1);
  });
});

describe('binary-only directory', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = scope.createFixture(`binary-only-${Date.now()}`, {
      'src/app.ts': 'export const main = (): void => { console.log("hello"); };',
    });

    // Add binary files using the dedicated helper
    scope.addBinaryFile(
      fixtureDir,
      'assets/logo.png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    scope.addBinaryFile(
      fixtureDir,
      'assets/icon.ico',
      Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]),
    );
  });

  it('excludes binary files from file tree', () => {
    runCLI(fixtureDir, ['generate', '--static-only']);
    const reportPath = join(fixtureDir, 'handover', 'static-analysis.md');
    const content = readFileSync(reportPath, 'utf-8');
    // Binary files should be invisible in the output
    expect(content).not.toContain('logo.png');
    expect(content).not.toContain('icon.ico');
  });

  it('counts source files only', () => {
    runCLI(fixtureDir, ['generate', '--static-only']);
    const reportPath = join(fixtureDir, 'handover', 'static-analysis.md');
    const content = readFileSync(reportPath, 'utf-8');
    // Only the source file should be counted
    expect(content).toContain('app.ts');
    // The file count in frontmatter should reflect only source files
    const fileCountMatch = content.match(/fileCount:\s*(\d+)/);
    expect(fileCountMatch).not.toBeNull();
    // Should count only source files (app.ts) -- not binary files
    expect(Number(fileCountMatch![1])).toBe(1);
  });
});

describe('no git history', () => {
  let fixtureDir: string;

  beforeEach(() => {
    // Create fixture with TypeScript files but NO .git/ directory
    fixtureDir = scope.createFixture(`no-git-${Date.now()}`, {
      'src/index.ts': 'export const version = "1.0.0";',
      'src/utils.ts': 'export function add(a: number, b: number): number { return a + b; }',
      'package.json': JSON.stringify({ name: 'no-git-project', version: '1.0.0' }),
    });
  });

  it('completes without crash', () => {
    const result = runCLI(fixtureDir, ['generate', '--static-only']);
    expect(result.exitCode).toBe(0);
  });

  it('produces valid output', () => {
    runCLI(fixtureDir, ['generate', '--static-only']);
    const outputDir = join(fixtureDir, 'handover');
    expect(existsSync(outputDir)).toBe(true);

    const reportPath = join(outputDir, 'static-analysis.md');
    expect(existsSync(reportPath)).toBe(true);

    const content = readFileSync(reportPath, 'utf-8');
    expect(content).toContain('# Static Analysis Report');
    // Source files should be present
    expect(content).toContain('index.ts');
    expect(content).toContain('utils.ts');
  });
});
