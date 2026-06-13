import { describe, it, expect } from 'vitest';
import type { ParsedFile } from '../parsing/types.js';
import { buildImportGraph, dependenciesFirstOrder } from './import-graph.js';

/** Build a minimal ParsedFile fixture with the given internal import sources. */
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

describe('buildImportGraph', () => {
  it('records directed edges from importer to resolved internal target', () => {
    const files = [mkFile('a.ts', ['./b']), mkFile('b.ts', [])];
    const known = new Set(['a.ts', 'b.ts']);

    const graph = buildImportGraph(files, known);

    expect(graph.dependencies.get('a.ts')).toEqual(new Set(['b.ts']));
    expect(graph.dependents.get('b.ts')).toEqual(new Set(['a.ts']));
    expect(graph.nodes).toContain('a.ts');
    expect(graph.nodes).toContain('b.ts');
  });

  it('ignores external package imports', () => {
    const files = [mkFile('a.ts', ['react', './b']), mkFile('b.ts', [])];
    const known = new Set(['a.ts', 'b.ts']);

    const graph = buildImportGraph(files, known);

    expect(graph.dependencies.get('a.ts')).toEqual(new Set(['b.ts']));
  });

  it('ignores imports that do not resolve to a known path', () => {
    const files = [mkFile('a.ts', ['./missing'])];
    const known = new Set(['a.ts']);

    const graph = buildImportGraph(files, known);

    expect(graph.dependencies.get('a.ts') ?? new Set()).toEqual(new Set());
  });

  it('resolves directory imports to their index file', () => {
    const files = [mkFile('a.ts', ['./sub']), mkFile('sub/index.ts', [])];
    const known = new Set(['a.ts', 'sub/index.ts']);

    const graph = buildImportGraph(files, known);

    expect(graph.dependencies.get('a.ts')).toEqual(new Set(['sub/index.ts']));
  });

  it('resolves NodeNext/ESM ".js" specifiers to their TypeScript source', () => {
    // a.ts imports './b.js' but the real file on disk is b.ts (NodeNext style).
    const files = [mkFile('a.ts', ['./b.js']), mkFile('b.ts', [])];
    const known = new Set(['a.ts', 'b.ts']);

    const graph = buildImportGraph(files, known);

    expect(graph.dependencies.get('a.ts')).toEqual(new Set(['b.ts']));
  });

  it('prefers an exact .js file over a .ts sibling when both exist', () => {
    const files = [mkFile('a.ts', ['./b.js'])];
    const known = new Set(['a.ts', 'b.js', 'b.ts']);

    const graph = buildImportGraph(files, known);

    expect(graph.dependencies.get('a.ts')).toEqual(new Set(['b.js']));
  });

  it('deduplicates repeated imports to the same target', () => {
    const files = [mkFile('a.ts', ['./b', './b']), mkFile('b.ts', [])];
    const known = new Set(['a.ts', 'b.ts']);

    const graph = buildImportGraph(files, known);

    expect(graph.dependencies.get('a.ts')).toEqual(new Set(['b.ts']));
    expect(graph.dependents.get('b.ts')).toEqual(new Set(['a.ts']));
  });
});

describe('dependenciesFirstOrder', () => {
  it('orders dependencies before dependents in a linear chain', () => {
    // a imports b imports c  =>  c, then b, then a
    const files = [mkFile('a.ts', ['./b']), mkFile('b.ts', ['./c']), mkFile('c.ts', [])];
    const graph = buildImportGraph(files, new Set(['a.ts', 'b.ts', 'c.ts']));

    const { order, hasCycles } = dependenciesFirstOrder(graph);

    expect(hasCycles).toBe(false);
    expect(order.indexOf('c.ts')).toBeLessThan(order.indexOf('b.ts'));
    expect(order.indexOf('b.ts')).toBeLessThan(order.indexOf('a.ts'));
  });

  it('orders a diamond with the shared dependency first and the root last', () => {
    // a -> b, a -> c, b -> d, c -> d
    const files = [
      mkFile('a.ts', ['./b', './c']),
      mkFile('b.ts', ['./d']),
      mkFile('c.ts', ['./d']),
      mkFile('d.ts', []),
    ];
    const graph = buildImportGraph(files, new Set(['a.ts', 'b.ts', 'c.ts', 'd.ts']));

    const { order } = dependenciesFirstOrder(graph);

    expect(order[0]).toBe('d.ts');
    expect(order[order.length - 1]).toBe('a.ts');
  });

  it('detects cycles and reports the involved nodes', () => {
    const files = [mkFile('a.ts', ['./b']), mkFile('b.ts', ['./a'])];
    const graph = buildImportGraph(files, new Set(['a.ts', 'b.ts']));

    const { hasCycles, cyclicNodes } = dependenciesFirstOrder(graph);

    expect(hasCycles).toBe(true);
    expect(cyclicNodes).toEqual(['a.ts', 'b.ts']);
  });

  it('includes isolated nodes with no imports or importers', () => {
    const files = [mkFile('lonely.ts', [])];
    const graph = buildImportGraph(files, new Set(['lonely.ts']));

    const { order } = dependenciesFirstOrder(graph);

    expect(order).toEqual(['lonely.ts']);
  });

  it('breaks ties deterministically by path (alphabetical)', () => {
    // a -> c, b -> c  =>  c first, then a, b in alphabetical order
    const files = [mkFile('a.ts', ['./c']), mkFile('b.ts', ['./c']), mkFile('c.ts', [])];
    const graph = buildImportGraph(files, new Set(['a.ts', 'b.ts', 'c.ts']));

    const { order } = dependenciesFirstOrder(graph);

    expect(order).toEqual(['c.ts', 'a.ts', 'b.ts']);
  });
});
