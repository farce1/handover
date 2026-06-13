import type { ParsedFile } from '../parsing/types.js';

/**
 * Internal import resolution helpers (shared).
 *
 * Resolves relative import sources to concrete internal file paths, trying the
 * common extension/`index` suffixes a module resolver would. External package
 * imports (no `.`/`..` prefix) resolve to `null`.
 *
 * Originally private to the context scorer (CTX-02); extracted so the import
 * dependency graph builder can share the exact same resolution semantics.
 */

// ─── Commonly tried extensions for import resolution ────────────────────────

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

/**
 * JavaScript-style import extensions. Under NodeNext/ESM resolution, TypeScript
 * sources are imported with these extensions (e.g. `./foo.js` resolves to
 * `foo.ts` on disk), so they are stripped before retrying the suffix list.
 */
const JS_IMPORT_EXTENSION = /\.(?:js|jsx|mjs|cjs)$/;

// ─── Path resolution helpers ────────────────────────────────────────────────

/**
 * Resolve an import path relative to the importing file's directory.
 * Returns null for external packages (no `.` or `..` prefix).
 */
export function resolveImportPath(fromDir: string, importSource: string): string | null {
  // Skip external packages
  if (!importSource.startsWith('.') && !importSource.startsWith('..')) {
    return null;
  }

  // Join fromDir + importSource and collapse segments
  const parts = fromDir ? fromDir.split('/') : [];
  const importParts = importSource.split('/');

  for (const segment of importParts) {
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

/**
 * Strip file extension for extensionless import matching.
 * e.g., "src/utils/helpers.ts" -> "src/utils/helpers"
 */
export function stripExtension(filePath: string): string {
  return filePath.replace(/\.[^./]+$/, '');
}

/**
 * Resolve a single import from a source file to a concrete known internal file
 * path, trying common extension/`index` suffixes. Returns null for external
 * packages and for imports that don't resolve to any known path.
 */
export function resolveToKnownPath(
  fromPath: string,
  importSource: string,
  knownPaths: Set<string>,
): string | null {
  const fromDir = fromPath.includes('/') ? fromPath.substring(0, fromPath.lastIndexOf('/')) : '';

  const resolved = resolveImportPath(fromDir, importSource);
  if (resolved === null) return null;

  // Base paths to try the suffix list against:
  //  1. the resolved path as-is — handles extensionless specifiers (`./b` -> b.ts)
  //  2. the path with a JS-style extension stripped — handles NodeNext/ESM
  //     specifiers that target a TS source (`./b.js` -> b.ts)
  // The exact path is tried first (suffix ''), so a real `.js` file still wins
  // over a `.ts` sibling when both exist.
  const bases = [resolved];
  if (JS_IMPORT_EXTENSION.test(resolved)) {
    bases.push(resolved.replace(JS_IMPORT_EXTENSION, ''));
  }

  for (const base of bases) {
    for (const suffix of EXTENSION_SUFFIXES) {
      const candidate = base + suffix;
      if (knownPaths.has(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Build a reverse-import map: for each file path, how many unique files import it.
 */
export function buildReverseImportMap(
  files: ParsedFile[],
  knownPaths: Set<string>,
): Map<string, number> {
  // Track which importers reference which paths (avoid double-counting)
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

  // Convert sets to counts
  const result = new Map<string, number>();
  for (const [path, importers] of importerSets) {
    result.set(path, importers.size);
  }
  return result;
}
