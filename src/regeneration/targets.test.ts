import { describe, it, expect } from 'vitest';
import {
  normalizeRegenerationTarget,
  listSupportedRegenerationTargets,
  RegenerationTargetError,
} from './targets.js';

describe('normalizeRegenerationTarget', () => {
  it('defaults to full-project when no target is given', () => {
    expect(normalizeRegenerationTarget()).toEqual({
      key: 'full-project',
      requested: 'full-project',
      canonical: 'full-project',
    });
    expect(normalizeRegenerationTarget('   ').key).toBe('full-project');
  });

  it('resolves aliases to their canonical key', () => {
    expect(normalizeRegenerationTarget('all').key).toBe('full-project');
    expect(normalizeRegenerationTarget('embeddings').key).toBe('search-index');
  });

  it('canonicalizes case, spaces, and underscores before matching', () => {
    const ref = normalizeRegenerationTarget('Vector_Index');
    expect(ref.key).toBe('search-index');
    expect(ref.requested).toBe('Vector_Index');
  });

  it('accepts a direct canonical key', () => {
    expect(normalizeRegenerationTarget('docs').key).toBe('docs');
  });

  it('throws a structured error for an unknown target', () => {
    try {
      normalizeRegenerationTarget('bogus');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RegenerationTargetError);
      const { response } = err as RegenerationTargetError;
      expect(response.error.code).toBe('REGENERATION_TARGET_UNKNOWN');
      expect(response.validTargets).toContain('full-project');
    }
  });
});

describe('listSupportedRegenerationTargets', () => {
  it('lists the supported target keys', () => {
    expect(listSupportedRegenerationTargets().map((t) => t.key)).toEqual([
      'full-project',
      'docs',
      'search-index',
    ]);
  });
});
