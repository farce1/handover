import type { ParsedFile } from '../parsing/types.js';
import { resolveToKnownPath, getOrCreateSet } from './import-resolution.js';

/**
 * Build a file-level import dependency map: each file maps to the set of internal
 * files it imports. External and unresolved imports are ignored.
 */
export function buildImportGraph(
  files: ParsedFile[],
  knownPaths: Set<string>,
): Map<string, Set<string>> {
  const dependencies = new Map<string, Set<string>>();

  for (const file of files) {
    for (const imp of file.imports) {
      const target = resolveToKnownPath(file.path, imp.source, knownPaths);
      if (target === null || target === file.path) continue;
      getOrCreateSet(dependencies, file.path).add(target);
    }
  }

  return dependencies;
}
