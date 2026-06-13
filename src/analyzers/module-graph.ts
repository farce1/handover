import type { DirectedGraph, ImportGraph } from './import-graph.js';

/**
 * Aggregate a file-level import graph into a module-level dependency graph.
 *
 * `fileToModule` maps each file to its owning module, or `null` to exclude it
 * (e.g. vendored/generated code). Intra-module imports are dropped; every module
 * owning at least one file becomes a node, even with no edges.
 */
export function aggregateModuleGraph(
  fileGraph: ImportGraph,
  fileToModule: (filePath: string) => string | null,
): DirectedGraph {
  const nodes = new Set<string>();
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  const ensure = (map: Map<string, Set<string>>, key: string): Set<string> => {
    let set = map.get(key);
    if (!set) {
      set = new Set<string>();
      map.set(key, set);
    }
    return set;
  };

  for (const file of fileGraph.nodes) {
    const mod = fileToModule(file);
    if (mod !== null) nodes.add(mod);
  }

  for (const [file, deps] of fileGraph.dependencies) {
    const from = fileToModule(file);
    if (from === null) continue;
    for (const dep of deps) {
      const to = fileToModule(dep);
      if (to === null || to === from) continue;
      ensure(dependencies, from).add(to);
      ensure(dependents, to).add(from);
    }
  }

  return { nodes: [...nodes].sort(), dependencies, dependents };
}
