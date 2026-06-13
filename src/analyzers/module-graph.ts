import type { DirectedGraph, ImportGraph } from './import-graph.js';

/**
 * Module-level dependency graph, aggregated from a file-level {@link ImportGraph}.
 *
 * This is the factual ground truth a downstream round can check LLM-asserted
 * module relationships against, and the basis for weighted, faithful dependency
 * diagrams. Because it is a {@link DirectedGraph}, it can also be ordered with
 * `dependenciesFirstOrder` to drive dependencies-first analysis.
 */
export interface ModuleEdge {
  from: string;
  to: string;
  /** Number of distinct cross-module file imports backing this edge. */
  weight: number;
}

export interface ModuleGraph extends DirectedGraph {
  /** Weighted module edges, sorted by (from, to). */
  edges: ModuleEdge[];
}

/**
 * Aggregate a file-level import graph into a module-level graph.
 *
 * `fileToModule` maps each file path to its owning module name, or `null` to
 * exclude the file (e.g. vendored/generated code). Intra-module imports are
 * dropped; cross-module imports are collapsed into weighted edges. Every module
 * that owns at least one file appears as a node, even if it has no edges.
 */
export function aggregateModuleGraph(
  fileGraph: ImportGraph,
  fileToModule: (filePath: string) => string | null,
): ModuleGraph {
  const nodes = new Set<string>();
  for (const file of fileGraph.nodes) {
    const mod = fileToModule(file);
    if (mod !== null) nodes.add(mod);
  }

  // Count distinct cross-module file imports: from -> to -> weight.
  const weights = new Map<string, Map<string, number>>();
  for (const [file, deps] of fileGraph.dependencies) {
    const fromMod = fileToModule(file);
    if (fromMod === null) continue;

    for (const dep of deps) {
      const toMod = fileToModule(dep);
      if (toMod === null || toMod === fromMod) continue;

      let inner = weights.get(fromMod);
      if (!inner) {
        inner = new Map<string, number>();
        weights.set(fromMod, inner);
      }
      inner.set(toMod, (inner.get(toMod) ?? 0) + 1);
    }
  }

  const ensure = (map: Map<string, Set<string>>, key: string): Set<string> => {
    let set = map.get(key);
    if (!set) {
      set = new Set<string>();
      map.set(key, set);
    }
    return set;
  };

  const edges: ModuleEdge[] = [];
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const from of [...weights.keys()].sort()) {
    const inner = weights.get(from)!;
    for (const to of [...inner.keys()].sort()) {
      edges.push({ from, to, weight: inner.get(to)! });
      ensure(dependencies, from).add(to);
      ensure(dependents, to).add(from);
    }
  }

  return {
    nodes: [...nodes].sort(),
    dependencies,
    dependents,
    edges,
  };
}
