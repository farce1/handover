import type { ParsedFile } from '../parsing/types.js';

// Resolves relative import sources to concrete internal file paths. Shared by the
// context scorer and the import graph so they resolve imports identically.

export const EXTENSION_SUFFIXES = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.js',
];

// Under NodeNext/ESM, TS sources are imported with JS extensions (`./foo.js` ->
// `foo.ts` on disk), so these are stripped before retrying the suffix list.
const JS_IMPORT_EXTENSION = /\.(?:js|jsx|mjs|cjs)$/;

/** Resolve `importSource` against `fromDir`; null for external (non-relative) packages. */
export function resolveImportPath(fromDir: string, importSource: string): string | null {
  if (!importSource.startsWith('.') && !importSource.startsWith('..')) {
    return null;
  }

  const parts = fromDir ? fromDir.split('/') : [];

  for (const segment of importSource.split('/')) {
    if (segment === '.' || segment === '') {
      continue;
    } else if (segment === '..') {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }

  return parts.join('/');
}

export function stripExtension(filePath: string): string {
  return filePath.replace(/\.[^./]+$/, '');
}

/** Resolve a single import to a known internal file path, or null. */
export function resolveToKnownPath(
  fromPath: string,
  importSource: string,
  knownPaths: Set<string>,
): string | null {
  const fromDir = fromPath.includes('/') ? fromPath.substring(0, fromPath.lastIndexOf('/')) : '';

  const resolved = resolveImportPath(fromDir, importSource);
  if (resolved === null) return null;

  // Try the resolved path as-is (extensionless specifiers), then with a JS-style
  // extension stripped (NodeNext specifiers targeting a TS source). The exact
  // path wins first, so a real `.js` file still beats a `.ts` sibling.
  const bases = JS_IMPORT_EXTENSION.test(resolved)
    ? [resolved, resolved.replace(JS_IMPORT_EXTENSION, '')]
    : [resolved];

  for (const base of bases) {
    for (const suffix of EXTENSION_SUFFIXES) {
      if (knownPaths.has(base + suffix)) return base + suffix;
    }
  }

  return null;
}

/** Map each internal file path to the number of distinct files that import it. */
export function buildReverseImportMap(
  files: ParsedFile[],
  knownPaths: Set<string>,
): Map<string, number> {
  const importerSets = new Map<string, Set<string>>();

  for (const file of files) {
    for (const imp of file.imports) {
      const resolved = resolveToKnownPath(file.path, imp.source, knownPaths);
      if (resolved === null) continue;

      let importers = importerSets.get(resolved);
      if (!importers) {
        importers = new Set<string>();
        importerSets.set(resolved, importers);
      }
      importers.add(file.path);
    }
  }

  const result = new Map<string, number>();
  for (const [path, importers] of importerSets) {
    result.set(path, importers.size);
  }
  return result;
}
