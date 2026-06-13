import { getOrCreateSet } from './import-resolution.js';

/**
 * Aggregate a file-level import map into module-level dependencies using a
 * file->module mapping (null excludes the file). Intra-module imports are dropped.
 */
export function aggregateModuleGraph(
  fileImports: Map<string, Set<string>>,
  fileToModule: (filePath: string) => string | null,
): Map<string, Set<string>> {
  const dependencies = new Map<string, Set<string>>();

  for (const [file, deps] of fileImports) {
    const from = fileToModule(file);
    if (from === null) continue;
    for (const dep of deps) {
      const to = fileToModule(dep);
      if (to === null || to === from) continue;
      getOrCreateSet(dependencies, from).add(to);
    }
  }

  return dependencies;
}
