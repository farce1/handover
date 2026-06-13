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

const topDir = (path: string): string | null =>
  path.includes('/') ? path.slice(0, path.indexOf('/')) : null;

describe('aggregateModuleGraph', () => {
  it('records a cross-module edge from a cross-module file import', () => {
    const fileGraph = buildImportGraph(
      [mkFile('a/x.ts', ['../b/y.js']), mkFile('b/y.ts', [])],
      new Set(['a/x.ts', 'b/y.ts']),
    );

    const mg = aggregateModuleGraph(fileGraph, topDir);

    expect(mg.nodes).toEqual(['a', 'b']);
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
    expect(mg.dependencies.get('a')).toBeUndefined();
  });

  it('ignores files mapped to no module (null)', () => {
    const fileGraph = buildImportGraph(
      [mkFile('a/x.ts', ['../vendor/v.js']), mkFile('vendor/v.ts', [])],
      new Set(['a/x.ts', 'vendor/v.ts']),
    );
    const noVendor = (p: string): string | null => (p.startsWith('vendor/') ? null : topDir(p));

    const mg = aggregateModuleGraph(fileGraph, noVendor);

    expect(mg.nodes).toEqual(['a']);
    expect(mg.dependencies.get('a')).toBeUndefined();
  });

  it('includes modules with no edges as isolated nodes', () => {
    const fileGraph = buildImportGraph([mkFile('a/x.ts', [])], new Set(['a/x.ts']));

    const mg = aggregateModuleGraph(fileGraph, topDir);

    expect(mg.nodes).toEqual(['a']);
  });

  it('produces a DirectedGraph that dependenciesFirstOrder can sort', () => {
    const fileGraph = buildImportGraph(
      [mkFile('p/a.ts', ['../q/b.js']), mkFile('q/b.ts', ['../r/c.js']), mkFile('r/c.ts', [])],
      new Set(['p/a.ts', 'q/b.ts', 'r/c.ts']),
    );

    const { order, hasCycles } = dependenciesFirstOrder(aggregateModuleGraph(fileGraph, topDir));

    expect(hasCycles).toBe(false);
    expect(order).toEqual(['r', 'q', 'p']);
  });
});
