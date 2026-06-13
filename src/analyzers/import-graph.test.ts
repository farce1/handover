import { describe, it, expect } from 'vitest';
import type { ParsedFile } from '../parsing/types.js';
import { buildImportGraph } from './import-graph.js';

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
  it('records an edge from importer to resolved internal target', () => {
    const graph = buildImportGraph(
      [mkFile('a.ts', ['./b']), mkFile('b.ts', [])],
      new Set(['a.ts', 'b.ts']),
    );

    expect(graph.get('a.ts')).toEqual(new Set(['b.ts']));
  });

  it('ignores external package imports', () => {
    const graph = buildImportGraph(
      [mkFile('a.ts', ['react', './b']), mkFile('b.ts', [])],
      new Set(['a.ts', 'b.ts']),
    );

    expect(graph.get('a.ts')).toEqual(new Set(['b.ts']));
  });

  it('ignores imports that do not resolve to a known path', () => {
    const graph = buildImportGraph([mkFile('a.ts', ['./missing'])], new Set(['a.ts']));

    expect(graph.get('a.ts')).toBeUndefined();
  });

  it('resolves directory imports to their index file', () => {
    const graph = buildImportGraph(
      [mkFile('a.ts', ['./sub']), mkFile('sub/index.ts', [])],
      new Set(['a.ts', 'sub/index.ts']),
    );

    expect(graph.get('a.ts')).toEqual(new Set(['sub/index.ts']));
  });

  it('deduplicates repeated imports to the same target', () => {
    const graph = buildImportGraph(
      [mkFile('a.ts', ['./b', './b']), mkFile('b.ts', [])],
      new Set(['a.ts', 'b.ts']),
    );

    expect(graph.get('a.ts')).toEqual(new Set(['b.ts']));
  });

  it('resolves NodeNext/ESM ".js" specifiers to their TypeScript source', () => {
    const graph = buildImportGraph(
      [mkFile('a.ts', ['./b.js']), mkFile('b.ts', [])],
      new Set(['a.ts', 'b.ts']),
    );

    expect(graph.get('a.ts')).toEqual(new Set(['b.ts']));
  });

  it('prefers an exact .js file over a .ts sibling when both exist', () => {
    const graph = buildImportGraph([mkFile('a.ts', ['./b.js'])], new Set(['a.ts', 'b.js', 'b.ts']));

    expect(graph.get('a.ts')).toEqual(new Set(['b.js']));
  });
});
