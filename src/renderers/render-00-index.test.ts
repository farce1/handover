import { describe, it, expect } from 'vitest';
import type { RenderContext } from './types.js';
import type { ValidationResult } from '../ai-rounds/types.js';
import { renderIndex } from './render-00-index.js';

function mkRound(validation: ValidationResult): RenderContext['rounds']['r2'] {
  return { validation } as unknown as RenderContext['rounds']['r2'];
}

function mkCtx(rounds: RenderContext['rounds']): RenderContext {
  return {
    rounds,
    staticAnalysis: {},
    audience: 'human',
    generatedAt: '2026-01-01T00:00:00Z',
    projectName: 'test',
  } as unknown as RenderContext;
}

describe('renderIndex — claim validation', () => {
  it('surfaces grounding metrics when claims were validated', () => {
    const ctx = mkCtx({
      r2: mkRound({ validated: 8, corrected: 2, total: 10, dropRate: 0.2 }),
    });

    const doc = renderIndex(ctx, []);

    expect(doc).toContain('verified against static analysis');
    expect(doc).toContain('8/10');
    expect(doc).toContain('2 dropped');
  });

  it('omits the drop note when nothing was corrected', () => {
    const ctx = mkCtx({
      r2: mkRound({ validated: 10, corrected: 0, total: 10, dropRate: 0 }),
    });

    const doc = renderIndex(ctx, []);

    expect(doc).toContain('verified against static analysis');
    expect(doc).not.toContain('dropped');
  });

  it('omits grounding entirely when no claims were validated', () => {
    expect(renderIndex(mkCtx({}), [])).not.toContain('verified against static analysis');
  });
});
