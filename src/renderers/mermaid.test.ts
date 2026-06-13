import { describe, it, expect } from 'vitest';
import type { ParsedFile } from '../parsing/types.js';
import type { RenderContext } from './types.js';
import { buildModuleDiagram } from './mermaid.js';

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
  const fullModules = modules.map((m) => ({ ...m, path: m.name, purpose: '', publicApi: [] }));
  return {
    rounds: {
      r2: {
        data: { modules: fullModules, relationships, boundaryIssues: [], findings: [], openQuestions: [] },
      },
    },
    staticAnalysis: {
      fileTree: { directoryTree: files.map((f) => ({ path: f.path, type: 'file' as const })) },
      ast: { files },
    },
  } as unknown as RenderContext;
}

describe('buildModuleDiagram', () => {
  it('renders edges from the real import graph, not LLM-asserted relationships', () => {
    const ctx = mkCtx(
      [
        { name: 'a', files: ['a/x.ts'] },
        { name: 'b', files: ['b/y.ts'] },
      ],
      [], // no LLM relationships — only the real import should produce an edge
      [mkFile('a/x.ts', ['../b/y.js']), mkFile('b/y.ts', [])],
    );

    expect(buildModuleDiagram(ctx)).toContain('a --> b');
  });

  it('returns empty string when Round 2 data is absent', () => {
    const ctx = {
      rounds: {},
      staticAnalysis: { fileTree: { directoryTree: [] }, ast: { files: [] } },
    } as unknown as RenderContext;

    expect(buildModuleDiagram(ctx)).toBe('');
  });
});
