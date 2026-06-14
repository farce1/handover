import { describe, it, expect } from 'vitest';
import type { ParsedFile } from '../parsing/types.js';
import type { RenderContext } from './types.js';
import { renderModules } from './render-06-modules.js';

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

function mkCtx(
  modules: Array<{ name: string; files: string[] }>,
  relationships: Array<{ from: string; to: string; type: string; evidence: string }>,
  files: ParsedFile[],
): RenderContext {
  const fullModules = modules.map((m) => ({ ...m, path: m.name, purpose: 'p', publicApi: [] }));
  return {
    rounds: {
      r2: {
        data: {
          modules: fullModules,
          relationships,
          boundaryIssues: [],
          findings: [],
          openQuestions: [],
        },
      },
    },
    staticAnalysis: {
      fileTree: { directoryTree: files.map((f) => ({ path: f.path, type: 'file' as const })) },
      ast: { files },
    },
    audience: 'human',
    generatedAt: '2026-01-01T00:00:00Z',
    projectName: 'test',
  } as unknown as RenderContext;
}

describe('renderModules — relationship table', () => {
  it('omits relationships not backed by a real import', () => {
    const ctx = mkCtx(
      [
        { name: 'a', files: ['a/x.ts'] },
        { name: 'b', files: ['b/y.ts'] },
        { name: 'c', files: ['c/z.ts'] },
      ],
      [
        { from: 'a', to: 'b', type: 'imports', evidence: 'REAL_EDGE' },
        { from: 'a', to: 'c', type: 'imports', evidence: 'HALLUCINATED' },
      ],
      [mkFile('a/x.ts', ['../b/y.js']), mkFile('b/y.ts', []), mkFile('c/z.ts', [])],
    );

    const doc = renderModules(ctx);

    expect(doc).toContain('REAL_EDGE');
    expect(doc).not.toContain('HALLUCINATED');
  });
});

describe('renderModules — isolated modules', () => {
  it('flags modules with no real cross-module import edge', () => {
    const ctx = mkCtx(
      [
        { name: 'a', files: ['a/x.ts'] },
        { name: 'b', files: ['b/y.ts'] },
        { name: 'c', files: ['c/z.ts'] },
      ],
      [{ from: 'a', to: 'b', type: 'imports', evidence: 'e' }],
      [mkFile('a/x.ts', ['../b/y.js']), mkFile('b/y.ts', []), mkFile('c/z.ts', [])],
    );

    const doc = renderModules(ctx);

    expect(doc).toContain('## Isolated Modules');
    expect(doc).toContain('`c`');
  });

  it('omits the section when every module is connected', () => {
    const ctx = mkCtx(
      [
        { name: 'a', files: ['a/x.ts'] },
        { name: 'b', files: ['b/y.ts'] },
      ],
      [{ from: 'a', to: 'b', type: 'imports', evidence: 'e' }],
      [mkFile('a/x.ts', ['../b/y.js']), mkFile('b/y.ts', [])],
    );

    expect(renderModules(ctx)).not.toContain('## Isolated Modules');
  });
});

describe('renderModules — file grounding', () => {
  it('drops module files that do not exist in the codebase', () => {
    const ctx = mkCtx(
      [{ name: 'a', files: ['a/real.ts', 'a/ghost.ts'] }],
      [],
      [mkFile('a/real.ts', [])],
    );

    const doc = renderModules(ctx);

    expect(doc).toContain('a/real.ts');
    expect(doc).not.toContain('a/ghost.ts');
  });
});
