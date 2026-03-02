import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitError, type DiffResult, type StatusResult } from 'simple-git';
import { getGitChangedFiles } from './git-fingerprint.js';

const mockSimpleGit = vi.hoisted(() => vi.fn());

vi.mock('simple-git', async () => {
  const actual = await vi.importActual<typeof import('simple-git')>('simple-git');
  return {
    ...actual,
    simpleGit: mockSimpleGit,
  };
});

type MockGit = {
  checkIsRepo: ReturnType<typeof vi.fn>;
  raw: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  revparse: ReturnType<typeof vi.fn>;
  diffSummary: ReturnType<typeof vi.fn>;
};

function makeStatus(overrides: Partial<StatusResult> = {}): StatusResult {
  return {
    not_added: [],
    conflicted: [],
    created: [],
    deleted: [],
    modified: [],
    renamed: [],
    staged: [],
    files: [],
    ahead: 0,
    behind: 0,
    current: 'main',
    tracking: 'origin/main',
    detached: false,
    isClean: () => true,
    ...overrides,
  };
}

function makeDiff(files: string[]): DiffResult {
  return {
    changed: files.length,
    insertions: 0,
    deletions: 0,
    files: files.map((file) => ({
      file,
      changes: 0,
      insertions: 0,
      deletions: 0,
      binary: false as const,
    })),
  };
}

function makeGitMock(overrides: Partial<MockGit> = {}): MockGit {
  return {
    checkIsRepo: vi.fn(async () => true),
    raw: vi.fn(async () => 'false\n'),
    status: vi.fn(async () => makeStatus()),
    revparse: vi.fn(async () => 'abc123'),
    diffSummary: vi.fn(async () => makeDiff([])),
    ...overrides,
  };
}

describe('getGitChangedFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns committed + uncommitted + untracked changes', async () => {
    const git = makeGitMock({
      status: vi.fn(async () =>
        makeStatus({
          modified: ['c.ts'],
          not_added: ['d.ts'],
        }),
      ),
      diffSummary: vi.fn(async () => makeDiff(['a.ts', 'b.ts'])),
    });
    mockSimpleGit.mockReturnValue(git);

    const result = await getGitChangedFiles('/repo', 'HEAD~1');

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect([...result.changedFiles].sort()).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
    expect(git.status).toHaveBeenCalledTimes(1);
  });

  it('returns ok with empty set when no changes exist', async () => {
    const git = makeGitMock({
      status: vi.fn(async () => makeStatus()),
      diffSummary: vi.fn(async () => makeDiff([])),
    });
    mockSimpleGit.mockReturnValue(git);

    const result = await getGitChangedFiles('/repo', 'main');

    expect(result).toMatchObject({ kind: 'ok' });
    if (result.kind !== 'ok') return;
    expect(result.changedFiles.size).toBe(0);
  });

  it('returns fallback when directory is not a git repo', async () => {
    const git = makeGitMock({
      checkIsRepo: vi.fn(async () => false),
    });
    mockSimpleGit.mockReturnValue(git);

    const result = await getGitChangedFiles('/repo', 'main');

    expect(result).toEqual({ kind: 'fallback', reason: 'Not a git repo' });
    expect(git.raw).not.toHaveBeenCalled();
    expect(git.status).not.toHaveBeenCalled();
    expect(git.revparse).not.toHaveBeenCalled();
  });

  it('returns fallback when repository is shallow', async () => {
    const git = makeGitMock({
      raw: vi.fn(async () => 'true\n'),
    });
    mockSimpleGit.mockReturnValue(git);

    const result = await getGitChangedFiles('/repo', 'main');

    expect(result).toEqual({ kind: 'fallback', reason: 'Shallow clone detected' });
    expect(git.status).not.toHaveBeenCalled();
    expect(git.revparse).not.toHaveBeenCalled();
  });

  it('returns fallback when HEAD is detached', async () => {
    const git = makeGitMock({
      status: vi.fn(async () => makeStatus({ detached: true })),
    });
    mockSimpleGit.mockReturnValue(git);

    const result = await getGitChangedFiles('/repo', 'main');

    expect(result).toEqual({ kind: 'fallback', reason: 'Detached HEAD' });
    expect(git.revparse).not.toHaveBeenCalled();
  });

  it('throws when ref is invalid', async () => {
    const git = makeGitMock({
      revparse: vi.fn(async () => {
        throw new GitError('bad revision');
      }),
    });
    mockSimpleGit.mockReturnValue(git);

    await expect(getGitChangedFiles('/repo', 'bad-ref')).rejects.toThrow(
      'Invalid git ref "bad-ref"',
    );
  });

  it('throws when revparse returns empty value', async () => {
    const git = makeGitMock({
      revparse: vi.fn(async () => ''),
    });
    mockSimpleGit.mockReturnValue(git);

    await expect(getGitChangedFiles('/repo', 'bad-ref')).rejects.toThrow(
      'Invalid git ref "bad-ref"',
    );
  });

  it('includes created, deleted, staged and renamed files', async () => {
    const git = makeGitMock({
      status: vi.fn(async () =>
        makeStatus({
          created: ['e.ts'],
          deleted: ['f.ts'],
          staged: ['g.ts'],
          renamed: [{ from: 'old.ts', to: 'h.ts' }],
        }),
      ),
    });
    mockSimpleGit.mockReturnValue(git);

    const result = await getGitChangedFiles('/repo', 'main');

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect([...result.changedFiles].sort()).toEqual(['e.ts', 'f.ts', 'g.ts', 'h.ts']);
  });

  it('continues when shallow check command fails', async () => {
    const git = makeGitMock({
      raw: vi.fn(async () => {
        throw new Error('unknown option --is-shallow-repository');
      }),
      status: vi.fn(async () => makeStatus({ modified: ['a.ts'] })),
      diffSummary: vi.fn(async () => makeDiff([])),
    });
    mockSimpleGit.mockReturnValue(git);

    const result = await getGitChangedFiles('/repo', 'main');

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect([...result.changedFiles]).toEqual(['a.ts']);
  });

  it('deduplicates files that appear in both diff and status', async () => {
    const git = makeGitMock({
      status: vi.fn(async () => makeStatus({ modified: ['a.ts'] })),
      diffSummary: vi.fn(async () => makeDiff(['a.ts'])),
    });
    mockSimpleGit.mockReturnValue(git);

    const result = await getGitChangedFiles('/repo', 'main');

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.changedFiles.size).toBe(1);
    expect([...result.changedFiles]).toEqual(['a.ts']);
  });
});
