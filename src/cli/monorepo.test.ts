import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

import { detectMonorepo } from './monorepo.js';

describe('detectMonorepo', () => {
  beforeEach(() => {
    vol.reset();
    vi.restoreAllMocks();
  });

  // ── Existing detectors (regression coverage) ────────────────────────────

  it('detects npm/yarn workspaces from package.json', () => {
    vol.fromJSON({ '/proj/package.json': JSON.stringify({ workspaces: ['packages/*'] }) });
    expect(detectMonorepo('/proj')).toEqual({
      isMonorepo: true,
      tool: 'npm',
      workspaceRoot: '/proj',
    });
  });

  it('detects pnpm workspace from pnpm-workspace.yaml', () => {
    vol.fromJSON({ '/proj/pnpm-workspace.yaml': 'packages:\n  - packages/*\n' });
    expect(detectMonorepo('/proj')).toEqual({
      isMonorepo: true,
      tool: 'pnpm',
      workspaceRoot: '/proj',
    });
  });

  it('detects Lerna from lerna.json', () => {
    vol.fromJSON({ '/proj/lerna.json': '{}' });
    expect(detectMonorepo('/proj')).toEqual({
      isMonorepo: true,
      tool: 'lerna',
      workspaceRoot: '/proj',
    });
  });

  it('detects Cargo workspace from Cargo.toml [workspace] section', () => {
    vol.fromJSON({ '/proj/Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n' });
    expect(detectMonorepo('/proj')).toEqual({
      isMonorepo: true,
      tool: 'cargo',
      workspaceRoot: '/proj',
    });
  });

  it('detects Go workspace from go.work', () => {
    vol.fromJSON({ '/proj/go.work': 'go 1.22\n' });
    expect(detectMonorepo('/proj')).toEqual({
      isMonorepo: true,
      tool: 'go',
      workspaceRoot: '/proj',
    });
  });

  // ── New detectors (INIT-02 additions — RED until Task 2 lands) ──────────

  it('detects Nx monorepo from nx.json', () => {
    vol.fromJSON({ '/proj/nx.json': '{}' });
    expect(detectMonorepo('/proj')).toEqual({
      isMonorepo: true,
      tool: 'nx',
      workspaceRoot: '/proj',
    });
  });

  it('detects Turborepo from turbo.json', () => {
    vol.fromJSON({ '/proj/turbo.json': '{}' });
    expect(detectMonorepo('/proj')).toEqual({
      isMonorepo: true,
      tool: 'turbo',
      workspaceRoot: '/proj',
    });
  });

  // ── Negative case ───────────────────────────────────────────────────────

  it('returns isMonorepo: false when no workspace files present', () => {
    vol.fromJSON({ '/proj/.gitkeep': '' });
    expect(detectMonorepo('/proj')).toEqual({
      isMonorepo: false,
      tool: null,
      workspaceRoot: null,
    });
  });
});
