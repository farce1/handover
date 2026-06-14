import type { StaticAnalysisResult } from './types.js';
import { buildImportGraph } from './import-graph.js';
import { getOrCreateSet } from './import-resolution.js';

/** Set of all known file paths from static analysis. */
export function knownFilePaths(analysis: StaticAnalysisResult): Set<string> {
  return new Set(
    analysis.fileTree.directoryTree.filter((e) => e.type === 'file').map((e) => e.path),
  );
}

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

/**
 * Module names with no real cross-module import edge in either direction.
 * Derived from the real import graph, so it flags components that are
 * genuinely disconnected from the rest of the codebase (dead code or a
 * decomposition seam), not merely unmentioned by the model.
 */
export function isolatedModules(
  moduleDeps: Map<string, Set<string>>,
  modules: Array<{ name: string }>,
): string[] {
  const connected = new Set<string>();
  for (const [from, tos] of moduleDeps) {
    if (tos.size === 0) continue;
    connected.add(from);
    for (const to of tos) connected.add(to);
  }

  return modules.map((m) => m.name).filter((name) => !connected.has(name));
}

/** True when a real import connects the two modules in either direction. */
export function moduleEdgeExists(
  moduleDeps: Map<string, Set<string>>,
  from: string,
  to: string,
): boolean {
  return Boolean(moduleDeps.get(from)?.has(to)) || Boolean(moduleDeps.get(to)?.has(from));
}

/**
 * Compute real module-level dependencies from static analysis and a module
 * decomposition (each module's file membership). Edges reflect actual
 * cross-module imports, not asserted relationships.
 */
export function moduleDependencyGraph(
  analysis: StaticAnalysisResult,
  modules: Array<{ name: string; files: string[] }>,
): Map<string, Set<string>> {
  const fileToModule = new Map<string, string>();
  for (const mod of modules) {
    for (const file of mod.files) fileToModule.set(file, mod.name);
  }

  return aggregateModuleGraph(
    buildImportGraph(analysis.ast.files, knownFilePaths(analysis)),
    (file) => fileToModule.get(file) ?? null,
  );
}
