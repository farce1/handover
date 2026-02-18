/**
 * Shared test utilities for integration tests.
 *
 * Provides helpers for creating synthetic fixtures, running the CLI as a
 * subprocess, and cleaning up after tests.
 *
 * Each call to `createFixtureScope()` returns an isolated scope with its own
 * temp directory, preventing parallel test file cleanup from interfering
 * with other test files' fixtures.
 *
 * NOTE: Tests require `npm run build` first -- the CLI runs from dist/.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

/** Path to the built CLI entry point. */
export const CLI_PATH = join(__dirname, '../../dist/index.js');

/** Base temp directory prefix for test fixtures. */
export const FIXTURES_DIR = join(tmpdir(), 'handover-test-fixtures');

/**
 * Create an isolated fixture scope for a test file.
 *
 * Returns `createFixture` and `cleanup` functions that operate on
 * an isolated temp directory, safe for parallel test execution.
 */
export function createFixtureScope(): {
  createFixture: (name: string, files: Record<string, string>) => string;
  addBinaryFile: (fixtureDir: string, relativePath: string, content: Buffer) => void;
  cleanup: () => void;
} {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const scopeDir = mkdtempSync(join(FIXTURES_DIR, 'scope-'));

  return {
    createFixture(name: string, files: Record<string, string>): string {
      const fixtureDir = join(scopeDir, name);
      mkdirSync(fixtureDir, { recursive: true });

      for (const [relativePath, content] of Object.entries(files)) {
        const fullPath = join(fixtureDir, relativePath);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
      }

      return fixtureDir;
    },

    addBinaryFile(fixtureDir: string, relativePath: string, content: Buffer): void {
      const fullPath = join(fixtureDir, relativePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);
    },

    cleanup(): void {
      try {
        rmSync(scopeDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Legacy API: Create a fixture directory directly.
 * Each fixture gets a unique directory under FIXTURES_DIR.
 *
 * WARNING: Use `createFixtureScope()` for parallel-safe test files.
 * This function is kept for simple single-file usage.
 */
export function createFixture(name: string, files: Record<string, string>): string {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const fixtureDir = mkdtempSync(join(FIXTURES_DIR, `${name}-`));

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(fixtureDir, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }

  return fixtureDir;
}

/**
 * Legacy API: Add binary file content to an existing fixture directory.
 */
export function addBinaryFile(fixtureDir: string, relativePath: string, content: Buffer): void {
  const fullPath = join(fixtureDir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

export interface RunCLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run the handover CLI as a subprocess.
 *
 * @param cwd - Working directory for the CLI process
 * @param args - CLI arguments (e.g., ['generate', '--static-only'])
 * @param options - Optional timeout and env overrides
 * @returns stdout, stderr, and exitCode
 */
export function runCLI(
  cwd: string,
  args: string[] = [],
  options?: { timeout?: number; env?: Record<string, string> },
): RunCLIResult {
  const timeout = options?.timeout ?? 120_000;
  const env = { ...process.env, NO_COLOR: '1', ...options?.env };

  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
      cwd,
      timeout,
      env,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return { stdout: stdout ?? '', stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const err = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number | null;
    };
    return {
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? ''),
      exitCode: err.status ?? 1,
    };
  }
}

/**
 * Remove all test fixtures under FIXTURES_DIR.
 * Only use in global teardown or when no other test files are running.
 */
export function cleanupFixtures(): void {
  try {
    rmSync(FIXTURES_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
