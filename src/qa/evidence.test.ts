import { describe, it, expect } from 'vitest';
import type { SearchDocumentMatch } from '../vector/query-engine.js';
import { assessEvidence, needsClarification } from './evidence.js';

function mk(relevance: number, sourceFile: string): SearchDocumentMatch {
  return {
    sourceFile,
    sectionPath: 'section',
    docType: 'doc',
    chunkIndex: 0,
    contentPreview: '',
    content: '',
    distance: 1 - relevance / 100,
    relevance,
  };
}

describe('assessEvidence', () => {
  it('flags no matches as weak with a clear reason', () => {
    const result = assessEvidence([]);

    expect(result.isWeak).toBe(true);
    expect(result.uniqueSources).toBe(0);
    expect(result.reasons[0]).toMatch(/no matching/i);
  });

  it('treats strong, multi-source, consistent evidence as not weak', () => {
    const result = assessEvidence([mk(80, 'a.md'), mk(75, 'b.md')]);

    expect(result.isWeak).toBe(false);
    expect(result.hasConflictingSignals).toBe(false);
    expect(result.uniqueSources).toBe(2);
  });

  it('ranks by relevance regardless of input order', () => {
    const result = assessEvidence([mk(50, 'a.md'), mk(90, 'b.md')]);

    expect(result.topRelevance).toBe(90);
    expect(result.secondRelevance).toBe(50);
  });

  it('flags low top relevance as weak', () => {
    const result = assessEvidence([mk(40, 'a.md'), mk(35, 'b.md')]);

    expect(result.isWeak).toBe(true);
    expect(result.reasons.some((r) => /top result relevance/i.test(r))).toBe(true);
  });

  it('treats a lone match as having no second result', () => {
    const result = assessEvidence([mk(80, 'a.md')]);

    expect(result.secondRelevance).toBe(0);
    expect(result.isWeak).toBe(true);
  });

  it('flags single-source evidence as weak', () => {
    const result = assessEvidence([mk(80, 'a.md'), mk(75, 'a.md')]);

    expect(result.uniqueSources).toBe(1);
    expect(result.reasons.some((r) => /single source/i.test(r))).toBe(true);
  });

  it('detects conflicting signals from a large top-two relevance gap', () => {
    const result = assessEvidence([mk(90, 'a.md'), mk(50, 'b.md')]);

    expect(result.hasConflictingSignals).toBe(true);
    expect(result.isWeak).toBe(true);
  });
});

describe('needsClarification', () => {
  it('is true for weak evidence', () => {
    expect(needsClarification(assessEvidence([]))).toBe(true);
  });

  it('is false for strong, consistent evidence', () => {
    expect(needsClarification(assessEvidence([mk(80, 'a.md'), mk(75, 'b.md')]))).toBe(false);
  });
});
