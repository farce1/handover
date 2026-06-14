import { describe, it, expect } from 'vitest';
import { detectBranchStrategy } from './git-branch-strategy.js';

describe('detectBranchStrategy', () => {
  it('detects git-flow from develop + release branches', () => {
    const { strategy, evidence } = detectBranchStrategy([
      'main',
      'develop',
      'release/1.0',
      'feature/x',
      'hotfix/y',
    ]);

    expect(strategy).toBe('git-flow');
    expect(evidence).toContain('release branches found');
    expect(evidence).toContain('hotfix branches found');
  });

  it('detects feature-branch from feature branches without develop', () => {
    const { strategy, evidence } = detectBranchStrategy(['main', 'feature/x', 'release/1.0']);

    expect(strategy).toBe('feature-branch');
    expect(evidence).toContain('release branches found');
  });

  it('detects trunk-based from a small number of branches', () => {
    expect(detectBranchStrategy(['main']).strategy).toBe('trunk-based');
  });

  it('returns unknown for many branches with no convention', () => {
    expect(detectBranchStrategy(['main', 'a', 'b', 'c', 'd']).strategy).toBe('unknown');
  });
});
