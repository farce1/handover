/**
 * Shared test utilities for integration tests.
 *
 * Provides helpers for creating synthetic fixtures, running the CLI as a
 * subprocess, and cleaning up after tests. All fixtures are created in
 * a temp directory for speed and determinism.
 *
 * NOTE: Tests require `npm run build` first -- the CLI runs from dist/.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

/** Path to the built CLI entry point. */
export const CLI_PATH = join(__dirname, '../../dist/index.js');

/** Temp directory for all test fixtures. */
export const FIXTURES_DIR = join(tmpdir(), 'handover-test-fixtures');

/**
 * Create a synthetic fixture directory with the given files.
 *
 * @param name - Unique name for this fixture (used as subdirectory)
 * @param files - Map of relative path to file content
 * @returns Absolute path to the created fixture directory
 */
export function createFixture(
  name: string,
  files: Record<string, string>,
): string {
  const fixtureDir = join(FIXTURES_DIR, name);
  mkdirSync(fixtureDir, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(fixtureDir, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }

  return fixtureDir;
}

/**
 * Create a synthetic fixture with binary file content.
 * Separated from createFixture because binary content is a Buffer, not a string.
 *
 * @param fixtureDir - Existing fixture directory path
 * @param relativePath - Relative path for the binary file
 * @param content - Binary content as a Buffer
 */
export function addBinaryFile(
  fixtureDir: string,
  relativePath: string,
  content: Buffer,
): void {
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
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
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
 * Remove all test fixtures.
 */
export function cleanupFixtures(): void {
  rmSync(FIXTURES_DIR, { recursive: true, force: true });
}
