import { describe, it, expect } from 'vitest';
import type { ParsedFile } from '../parsing/types.js';
import { buildImportGraph, dependenciesFirstOrder } from './import-graph.js';
import { aggregateModuleGraph } from './module-graph.js';

function mkFile(path: string, importSources: string[] = []): ParsedFile {
  return {
    path,
    language: 'typescript',
    parserUsed: 'tree-sitter',
    functions: [],
    classes: [],
    imports: importSources.map((source, i) => ({
      source,
      specifiers: [],
      isTypeOnly: false,
      line: i + 1,
    })),
    exports: [],
    constants: [],
    reExports: [],
    lineCount: 1,
    parseErrors: [],
  };
}

/** Module = top-level directory segment; root-level files belong to no module. */
function topDir(path: string): string | null {
  return path.includes('/') ? path.slice(0, path.indexOf('/')) : null;
}

describe('aggregateModuleGraph', () => {
  it('aggregates cross-module file imports into a weighted module edge', () => {
    const fileGraph = buildImportGraph(
      [mkFile('a/x.ts', ['../b/y.js']), mkFile('b/y.ts', [])],
      new Set(['a/x.ts', 'b/y.ts']),
    );

    const mg = aggregateModuleGraph(fileGraph, topDir);

    expect(mg.nodes).toEqual(['a', 'b']);
    expect(mg.edges).toEqual([{ from: 'a', to: 'b', weight: 1 }]);
    expect(mg.dependencies.get('a')).toEqual(new Set(['b']));
    expect(mg.dependents.get('b')).toEqual(new Set(['a']));
  });

  it('drops intra-module imports (no self-edges)', () => {
    const fileGraph = buildImportGraph(
      [mkFile('a/x.ts', ['./y.js']), mkFile('a/y.ts', [])],
      new Set(['a/x.ts', 'a/y.ts']),
    );

    const mg = aggregateModuleGraph(fileGraph, topDir);

    expect(mg.nodes).toEqual(['a']);
    expect(mg.edges).toEqual([]);
    expect(mg.dependencies.get('a')).toBeUndefined();
  });

  it('sums weight across multiple file imports crossing the same module boundary', () => {
    const fileGraph = buildImportGraph(
      [mkFile('a/x.ts', ['../b/y.js']), mkFile('a/z.ts', ['../b/y.js']), mkFile('b/y.ts', [])],
      new Set(['a/x.ts', 'a/z.ts', 'b/y.ts']),
    );

    const mg = aggregateModuleGraph(fileGraph, topDir);

    expect(mg.edges).toEqual([{ from: 'a', to: 'b', weight: 2 }]);
  });

  it('ignores files mapped to no module (null)', () => {
    const fileGraph = buildImportGraph(
      [mkFile('a/x.ts', ['../vendor/v.js']), mkFile('vendor/v.ts', [])],
      new Set(['a/x.ts', 'vendor/v.ts']),
    );
    const noVendor = (p: string): string | null => (p.startsWith('vendor/') ? null : topDir(p));

    const mg = aggregateModuleGraph(fileGraph, noVendor);

    expect(mg.nodes).toEqual(['a']);
    expect(mg.edges).toEqual([]);
  });

  it('includes modules with no edges as isolated nodes', () => {
    const fileGraph = buildImportGraph([mkFile('a/x.ts', [])], new Set(['a/x.ts']));

    const mg = aggregateModuleGraph(fileGraph, topDir);

    expect(mg.nodes).toEqual(['a']);
    expect(mg.edges).toEqual([]);
  });

  it('returns edges sorted deterministically by (from, to)', () => {
    const fileGraph = buildImportGraph(
      [mkFile('a/x.ts', ['../c/z.js', '../b/y.js']), mkFile('b/y.ts', []), mkFile('c/z.ts', [])],
      new Set(['a/x.ts', 'b/y.ts', 'c/z.ts']),
    );

    const mg = aggregateModuleGraph(fileGraph, topDir);

    expect(mg.edges).toEqual([
      { from: 'a', to: 'b', weight: 1 },
      { from: 'a', to: 'c', weight: 1 },
    ]);
  });

  it('produces a DirectedGraph that dependenciesFirstOrder can sort', () => {
    // p -> q -> r (module level)  =>  dependencies-first: r, q, p
    const fileGraph = buildImportGraph(
      [mkFile('p/a.ts', ['../q/b.js']), mkFile('q/b.ts', ['../r/c.js']), mkFile('r/c.ts', [])],
      new Set(['p/a.ts', 'q/b.ts', 'r/c.ts']),
    );

    const mg = aggregateModuleGraph(fileGraph, topDir);
    const { order, hasCycles } = dependenciesFirstOrder(mg);

    expect(hasCycles).toBe(false);
    expect(order).toEqual(['r', 'q', 'p']);
  });
});
