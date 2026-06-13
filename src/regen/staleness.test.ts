import { describe, it, expect } from 'vitest';
import type { DepGraph } from './dep-graph.js';
import { detectStaleDocs, formatStaleness } from './staleness.js';

function mkGraph(renderers: Record<string, string[]>, infrastructureFiles: string[] = []): DepGraph {
  return {
    graphVersion: 1,
    builtAt: '2026-01-01T00:00:00Z',
    renderers,
    infrastructurePaths: [],
    infrastructureFiles,
  };
}

const docs = [
  { id: '06-modules', filename: '06-MODULES.md' },
  { id: '05-features', filename: '05-FEATURES.md' },
];

describe('detectStaleDocs', () => {
  it('flags a doc whose source changed but whose output did not', () => {
    const result = detectStaleDocs({
      changedFiles: new Set(['src/a.ts']),
      graph: mkGraph({ '06-modules': ['src/a.ts'], '05-features': ['src/b.ts'] }),
      docs,
      outputDir: 'handover',
    });

    expect(result.stale.map((s) => s.rendererId)).toEqual(['06-modules']);
    expect(result.fullRegen).toBe(false);
  });

  it('does not flag a doc that was regenerated alongside its source', () => {
    const result = detectStaleDocs({
      changedFiles: new Set(['src/a.ts', 'handover/06-MODULES.md']),
      graph: mkGraph({ '06-modules': ['src/a.ts'] }),
      docs,
      outputDir: 'handover',
    });

    expect(result.stale).toEqual([]);
  });

  it('ignores infrastructure-only changes', () => {
    const result = detectStaleDocs({
      changedFiles: new Set(['src/utils/log.ts']),
      graph: mkGraph({ '06-modules': ['src/a.ts'] }, ['src/utils/log.ts']),
      docs,
      outputDir: 'handover',
    });

    expect(result.stale).toEqual([]);
    expect(result.fullRegen).toBe(false);
  });

  it('marks all un-regenerated docs stale on an unclaimed non-infra change', () => {
    const result = detectStaleDocs({
      changedFiles: new Set(['src/unclaimed.ts']),
      graph: mkGraph({ '06-modules': ['src/a.ts'], '05-features': ['src/b.ts'] }),
      docs,
      outputDir: 'handover',
    });

    expect(result.fullRegen).toBe(true);
    expect(result.stale.map((s) => s.rendererId)).toEqual(['05-features', '06-modules']);
  });
});

describe('formatStaleness', () => {
  it('reports when everything is up to date', () => {
    const out = formatStaleness({ stale: [], fullRegen: false });
    expect(out).toContain('up to date');
  });

  it('lists each stale doc with the source that changed', () => {
    const out = formatStaleness({
      stale: [{ rendererId: '06-modules', filename: '06-MODULES.md', reasons: ['src/a.ts'] }],
      fullRegen: false,
    });
    expect(out).toContain('out of date');
    expect(out).toContain('06-MODULES.md');
    expect(out).toContain('src/a.ts');
  });
});
