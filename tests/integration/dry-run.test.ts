/**
 * Integration tests for Phase 32 --dry-run + --since dep-graph fallback.
 *
 * Covers:
 *   - REGEN-04 (preview, zero LLM calls)
 *   - SC-2 (no LLM calls; the dry-run branch returns BEFORE auth/provider init)
 *   - SC-5 (no-graph → safe full regen)
 *   - D-16 (Phase 36 JSON contract: exactly 7 keys, formatVersion === 1)
 *   - D-18 (--only intersection with the dry-run preview)
 *
 * NOTE: Tests require `npm run build` first (CLI runs from dist/).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createFixtureScope, runCLI } from './setup.js';

const scope = createFixtureScope();

afterAll(() => {
  scope.cleanup();
});

describe('handover generate --dry-run', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = scope.createFixture(`dry-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, {
      'src/main.ts': 'export function main() { return 42; }\n',
      'package.json': JSON.stringify({ name: 'fixture-project', version: '0.1.0' }, null, 2),
      'README.md': '# Fixture Project\n',
    });
  });

  it('exits 0 with zero LLM calls and zero docs written (SC-2)', () => {
    // Strip API keys to PROVE the dry-run branch doesn't reach auth/provider init.
    const result = runCLI(fixtureDir, ['generate', '--dry-run'], {
      env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '' },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Would execute (');
    expect(result.stdout).toContain('Would skip (');
    expect(result.stdout).toContain('Zero LLM calls made.');

    // No docs rendered
    expect(existsSync(join(fixtureDir, 'handover', '00-INDEX.md'))).toBe(false);
    expect(existsSync(join(fixtureDir, 'handover', '03-ARCHITECTURE.md'))).toBe(false);

    // No round cache (no AI rounds ran)
    expect(existsSync(join(fixtureDir, '.handover', 'cache', 'rounds'))).toBe(false);
  });

  it('--dry-run --json emits the Phase 36 contract shape', () => {
    const result = runCLI(fixtureDir, ['generate', '--dry-run', '--json'], {
      env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '' },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({
      formatVersion: 1,
      since: null,
      graphVersion: null,
      fellBackToFullRegen: false,
      noGraph: true,
    });
    expect(Array.isArray(parsed.wouldExecute)).toBe(true);
    expect(Array.isArray(parsed.wouldSkip)).toBe(true);
    // Exact key set — Phase 36 contract.
    expect(Object.keys(parsed).sort()).toEqual([
      'fellBackToFullRegen',
      'formatVersion',
      'graphVersion',
      'noGraph',
      'since',
      'wouldExecute',
      'wouldSkip',
    ]);
  });

  it('--dry-run --only arch limits the would-execute set (D-18)', () => {
    const result = runCLI(fixtureDir, ['generate', '--dry-run', '--only', 'arch', '--json'], {
      env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '' },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const executeIds = parsed.wouldExecute.map((e: { renderer: string }) => e.renderer);
    expect(executeIds).toContain('03-architecture');
    expect(executeIds).not.toContain('06-modules');
    expect(executeIds).not.toContain('07-dependencies');
    // INDEX always renders (RESEARCH Open Question 4 RESOLVED — bias toward inclusion for transparency).
    // Plan 02 computeDryRunDecision branch 2 (no --since + graph null) puts every selected doc
    // including '00-index' into wouldExecute.
    expect(executeIds).toContain('00-index');
  });
});

describe('handover generate --since <ref> with no dep-graph (SC-5)', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = scope.createFixture(`since-no-graph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, {
      'src/main.ts': 'export function main() { return 42; }\n',
      'package.json': JSON.stringify({ name: 'fixture-project', version: '0.1.0' }, null, 2),
    });

    // Initialize a 2-commit git repo so `HEAD~1` is a valid ref.
    execSync('git init -q', { cwd: fixtureDir });
    execSync('git config user.email "test@example.com"', { cwd: fixtureDir });
    execSync('git config user.name "Test User"', { cwd: fixtureDir });
    execSync('git add . && git commit -q -m "initial"', { cwd: fixtureDir, shell: '/bin/sh' });
    // Make a second commit so HEAD~1 resolves to the first commit.
    execSync('echo "new" > new-file.ts', { cwd: fixtureDir, shell: '/bin/sh' });
    execSync('git add new-file.ts && git commit -q -m "second"', { cwd: fixtureDir, shell: '/bin/sh' });
  });

  it('--since HEAD~1 with no dep-graph falls back to full regen safely (SC-5)', () => {
    const result = runCLI(
      fixtureDir,
      ['generate', '--dry-run', '--since', 'HEAD~1', '--json'],
      {
        env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '' },
      },
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.noGraph).toBe(true);
    expect(parsed.fellBackToFullRegen).toBe(true);
    expect(parsed.since).toBe('HEAD~1');
    expect(parsed.graphVersion).toBeNull();
  });
});

describe('handover generate --dry-run --since <bad-ref> (CR-01 regression)', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = scope.createFixture(
      `bad-ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      {
        'src/main.ts': 'export function main() { return 42; }\n',
        'package.json': JSON.stringify({ name: 'fixture-project', version: '0.1.0' }, null, 2),
      },
    );
    // 2-commit fixture so --since has a valid revparse domain;
    // the bad ref still triggers the throw inside getGitChangedFiles.
    execSync('git init -q', { cwd: fixtureDir });
    execSync('git config user.email "test@example.com"', { cwd: fixtureDir });
    execSync('git config user.name "Test User"', { cwd: fixtureDir });
    execSync('git add . && git commit -q -m "initial"', { cwd: fixtureDir, shell: '/bin/sh' });
    execSync('echo "new" > new-file.ts', { cwd: fixtureDir, shell: '/bin/sh' });
    execSync('git add new-file.ts && git commit -q -m "second"', {
      cwd: fixtureDir,
      shell: '/bin/sh',
    });
  });

  it('--dry-run --since not-a-real-ref exits 0 with friendly preview and stderr warning (CR-01)', () => {
    const result = runCLI(
      fixtureDir,
      ['generate', '--dry-run', '--since', 'not-a-real-ref'],
      { env: { ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '' } },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Would execute (');
    expect(result.stdout).toContain('Would skip (');
    expect(result.stdout).toContain('Zero LLM calls made.');
    // stderr must name the bad ref so the user understands why preview is unfiltered
    expect(result.stderr).toMatch(/--since/);
    expect(result.stderr).toContain('not-a-real-ref');
    // No docs written — dry-run contract preserved
    expect(existsSync(join(fixtureDir, 'handover', '00-INDEX.md'))).toBe(false);
  });
});
