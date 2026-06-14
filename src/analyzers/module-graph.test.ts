import { describe, it, expect } from 'vitest';
import type { ParsedFile } from '../parsing/types.js';
import type { StaticAnalysisResult } from './types.js';
import { buildImportGraph } from './import-graph.js';
import { aggregateModuleGraph, moduleDependencyGraph, isolatedModules } from './module-graph.js';

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

    expect(aggregateModuleGraph(fileGraph, topDir).get('a')).toEqual(new Set(['b']));
  });

  it('drops intra-module imports (no self-edges)', () => {
    const fileGraph = buildImportGraph(
      [mkFile('a/x.ts', ['./y.js']), mkFile('a/y.ts', [])],
      new Set(['a/x.ts', 'a/y.ts']),
    );

    expect(aggregateModuleGraph(fileGraph, topDir).get('a')).toBeUndefined();
  });

  it('ignores files mapped to no module (null)', () => {
    const fileGraph = buildImportGraph(
      [mkFile('a/x.ts', ['../vendor/v.js']), mkFile('vendor/v.ts', [])],
      new Set(['a/x.ts', 'vendor/v.ts']),
    );
    const noVendor = (p: string): string | null => (p.startsWith('vendor/') ? null : topDir(p));

    expect(aggregateModuleGraph(fileGraph, noVendor).get('a')).toBeUndefined();
  });
});

// Minimal StaticAnalysisResult: only directoryTree (files) and ast.files are read.
function mkAnalysis(files: ParsedFile[]): StaticAnalysisResult {
  return {
    fileTree: { directoryTree: files.map((f) => ({ path: f.path, type: 'file' as const })) },
    ast: { files },
  } as unknown as StaticAnalysisResult;
}

describe('moduleDependencyGraph', () => {
  it('derives module edges from real cross-module file imports', () => {
    const analysis = mkAnalysis([mkFile('a/x.ts', ['../b/y.js']), mkFile('b/y.ts', [])]);
    const modules = [
      { name: 'a', files: ['a/x.ts'] },
      { name: 'b', files: ['b/y.ts'] },
    ];

    expect(moduleDependencyGraph(analysis, modules).get('a')).toEqual(new Set(['b']));
  });

  it('drops intra-module imports', () => {
    const analysis = mkAnalysis([mkFile('a/x.ts', ['./y.js']), mkFile('a/y.ts', [])]);
    const modules = [{ name: 'a', files: ['a/x.ts', 'a/y.ts'] }];

    expect(moduleDependencyGraph(analysis, modules).get('a')).toBeUndefined();
  });
});

describe('isolatedModules', () => {
  it('flags a module with no cross-module edge in either direction', () => {
    const deps = new Map([['a', new Set(['b'])]]);
    const modules = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];

    expect(isolatedModules(deps, modules)).toEqual(['c']);
  });

  it('does not flag a module that is only depended upon', () => {
    const deps = new Map([['a', new Set(['b'])]]);
    const modules = [{ name: 'a' }, { name: 'b' }];

    expect(isolatedModules(deps, modules)).toEqual([]);
  });

  it('treats empty dependency sets as no connection', () => {
    const deps = new Map([['a', new Set<string>()]]);
    const modules = [{ name: 'a' }, { name: 'b' }];

    expect(isolatedModules(deps, modules)).toEqual(['a', 'b']);
  });
});
