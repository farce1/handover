import { describe, it, expect } from 'vitest';
import type { ParsedFile } from '../parsing/types.js';
import {
  resolveImportPath,
  stripExtension,
  getOrCreateSet,
  resolveToKnownPath,
  buildReverseImportMap,
} from './import-resolution.js';

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

describe('resolveImportPath', () => {
  it('returns null for non-relative (external) package specifiers', () => {
    expect(resolveImportPath('src/a', 'react')).toBeNull();
    expect(resolveImportPath('src/a', '@scope/pkg')).toBeNull();
  });

  it('resolves a sibling import against the importing directory', () => {
    expect(resolveImportPath('src/a', './b')).toBe('src/a/b');
  });

  it('resolves a parent import by popping a directory segment', () => {
    expect(resolveImportPath('src/a', '../b')).toBe('src/b');
  });

  it('resolves against an empty directory (root-level importer)', () => {
    expect(resolveImportPath('', './b')).toBe('b');
  });

  it('walks multiple parent segments', () => {
    expect(resolveImportPath('src/a/c', '../../b')).toBe('src/b');
  });

  it('ignores empty and current-dir segments', () => {
    expect(resolveImportPath('src', './a//b')).toBe('src/a/b');
  });
});

describe('stripExtension', () => {
  it('strips a trailing file extension', () => {
    expect(stripExtension('foo/bar.ts')).toBe('foo/bar');
  });

  it('leaves an extensionless path unchanged', () => {
    expect(stripExtension('foo/bar')).toBe('foo/bar');
  });

  it('only strips the final extension segment', () => {
    expect(stripExtension('foo.test.ts')).toBe('foo.test');
  });

  it('does not treat a dot in a directory name as an extension', () => {
    expect(stripExtension('a.b/c')).toBe('a.b/c');
  });
});

describe('getOrCreateSet', () => {
  it('creates and inserts an empty set when the key is absent', () => {
    const map = new Map<string, Set<string>>();
    const set = getOrCreateSet(map, 'k');
    expect(set).toEqual(new Set());
    expect(map.get('k')).toBe(set);
  });

  it('returns the existing set without replacing it', () => {
    const map = new Map<string, Set<string>>();
    const existing = new Set(['v']);
    map.set('k', existing);
    expect(getOrCreateSet(map, 'k')).toBe(existing);
  });
});

describe('resolveToKnownPath', () => {
  it('returns null for external specifiers', () => {
    expect(resolveToKnownPath('src/a/foo.ts', 'react', new Set(['src/a/bar.ts']))).toBeNull();
  });

  it('resolves an extensionless specifier via the suffix list', () => {
    const known = new Set(['src/a/bar.ts']);
    expect(resolveToKnownPath('src/a/foo.ts', './bar', known)).toBe('src/a/bar.ts');
  });

  it('resolves a NodeNext .js specifier to its .ts source', () => {
    const known = new Set(['src/a/bar.ts']);
    expect(resolveToKnownPath('src/a/foo.ts', './bar.js', known)).toBe('src/a/bar.ts');
  });

  it('prefers a real .js file over a .ts sibling', () => {
    const known = new Set(['src/a/bar.js', 'src/a/bar.ts']);
    expect(resolveToKnownPath('src/a/foo.ts', './bar.js', known)).toBe('src/a/bar.js');
  });

  it('resolves a directory specifier to its index file', () => {
    const known = new Set(['src/a/dir/index.ts']);
    expect(resolveToKnownPath('src/a/foo.ts', './dir', known)).toBe('src/a/dir/index.ts');
  });

  it('resolves relative to a root-level importer with no directory', () => {
    expect(resolveToKnownPath('foo.ts', './bar', new Set(['bar.ts']))).toBe('bar.ts');
  });

  it('resolves a parent-directory .js specifier', () => {
    const known = new Set(['src/b.ts']);
    expect(resolveToKnownPath('src/a/foo.ts', '../b.js', known)).toBe('src/b.ts');
  });

  it('returns null when no known path matches', () => {
    expect(resolveToKnownPath('src/a/foo.ts', './missing', new Set(['src/a/bar.ts']))).toBeNull();
  });
});

describe('buildReverseImportMap', () => {
  it('counts the number of distinct files importing each target', () => {
    const known = new Set(['src/c.ts', 'src/a.ts', 'src/b.ts']);
    const files = [
      mkFile('src/a.ts', ['./c.js']),
      mkFile('src/b.ts', ['./c.js']),
      mkFile('src/c.ts', []),
    ];
    expect(buildReverseImportMap(files, known).get('src/c.ts')).toBe(2);
  });

  it('counts an importer once even when it imports the target twice', () => {
    const known = new Set(['src/c.ts', 'src/a.ts']);
    const files = [mkFile('src/a.ts', ['./c.js', './c'])];
    expect(buildReverseImportMap(files, known).get('src/c.ts')).toBe(1);
  });

  it('ignores external and unresolved imports', () => {
    const known = new Set(['src/a.ts']);
    const files = [mkFile('src/a.ts', ['react', './missing'])];
    expect(buildReverseImportMap(files, known).size).toBe(0);
  });
});
