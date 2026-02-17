/**
 * Integration tests for monorepo detection.
 *
 * Tests the detectMonorepo() function directly with synthetic fixtures
 * covering all 5 supported workspace formats plus negative cases.
 *
 * Requires `npm run build` before running (only for consistency with
 * the test suite; this test does not invoke the CLI).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { detectMonorepo } from '../../src/cli/monorepo.js';
import { createFixtureScope } from './setup.js';

const scope = createFixtureScope();

afterAll(() => {
  scope.cleanup();
});

describe('detectMonorepo', () => {
  it('detects npm workspaces', () => {
    const fixtureDir = scope.createFixture('monorepo-npm', {
      'package.json': JSON.stringify({
        name: 'npm-monorepo',
        workspaces: ['packages/*'],
      }),
    });

    const result = detectMonorepo(fixtureDir);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe('npm');
  });

  it('detects pnpm workspaces', () => {
    const fixtureDir = scope.createFixture('monorepo-pnpm', {
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'",
    });

    const result = detectMonorepo(fixtureDir);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe('pnpm');
  });

  it('detects lerna', () => {
    const fixtureDir = scope.createFixture('monorepo-lerna', {
      'lerna.json': JSON.stringify({ packages: ['packages/*'] }),
    });

    const result = detectMonorepo(fixtureDir);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe('lerna');
  });

  it('detects Cargo workspace', () => {
    const fixtureDir = scope.createFixture('monorepo-cargo', {
      'Cargo.toml': '[workspace]\nmembers = ["crates/*"]',
    });

    const result = detectMonorepo(fixtureDir);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe('cargo');
  });

  it('detects Go workspace', () => {
    const fixtureDir = scope.createFixture('monorepo-go', {
      'go.work': 'go 1.21\nuse ./cmd',
    });

    const result = detectMonorepo(fixtureDir);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe('go');
  });

  it('returns false for non-monorepo package.json', () => {
    const fixtureDir = scope.createFixture('not-monorepo', {
      'package.json': JSON.stringify({ name: 'single-package', version: '1.0.0' }),
    });

    const result = detectMonorepo(fixtureDir);
    expect(result.isMonorepo).toBe(false);
    expect(result.tool).toBeNull();
  });

  it('returns false for directory with no package.json', () => {
    const fixtureDir = scope.createFixture('no-pkg', {
      'README.md': '# Just a readme',
    });

    const result = detectMonorepo(fixtureDir);
    expect(result.isMonorepo).toBe(false);
  });

  it('handles malformed package.json gracefully', () => {
    const fixtureDir = scope.createFixture('malformed-pkg', {
      'package.json': '{invalid json content}',
    });

    const result = detectMonorepo(fixtureDir);
    expect(result.isMonorepo).toBe(false);
  });
});
