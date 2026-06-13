import type { ParsedFile } from '../parsing/types.js';
import { resolveToKnownPath } from './import-resolution.js';

/** A directed graph over string nodes, orderable by {@link dependenciesFirstOrder}. */
export interface DirectedGraph {
  nodes: string[];
  /** node -> nodes it depends on. */
  dependencies: Map<string, Set<string>>;
  /** node -> nodes that depend on it. */
  dependents: Map<string, Set<string>>;
}

/** File-level import dependency graph (nodes are internal file paths). */
export type ImportGraph = DirectedGraph;

export interface TopoResult {
  /** Dependencies-first order: a node appears only after everything it imports. */
  order: string[];
  hasCycles: boolean;
  /** Nodes left unordered: those in an import cycle, or transitively depending on one. */
  cyclicNodes: string[];
}

/** Build a directed import graph from parsed files; edges only for resolved internal imports. */
export function buildImportGraph(files: ParsedFile[], knownPaths: Set<string>): ImportGraph {
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  const nodes = new Set<string>();

  const ensure = (map: Map<string, Set<string>>, key: string): Set<string> => {
    let set = map.get(key);
    if (!set) {
      set = new Set<string>();
      map.set(key, set);
    }
    return set;
  };

  for (const file of files) {
    nodes.add(file.path);

    for (const imp of file.imports) {
      const target = resolveToKnownPath(file.path, imp.source, knownPaths);
      if (target === null || target === file.path) continue;

      nodes.add(target);
      ensure(dependencies, file.path).add(target);
      ensure(dependents, target).add(file.path);
    }
  }

  return { nodes: [...nodes].sort(), dependencies, dependents };
}

/**
 * Dependencies-first ordering via wave-based Kahn's algorithm. Within each wave
 * nodes are emitted alphabetically so the result is deterministic; nodes left
 * over are part of (or blocked by) a cycle.
 */
export function dependenciesFirstOrder(graph: DirectedGraph): TopoResult {
  const remaining = new Map<string, number>();
  for (const node of graph.nodes) {
    remaining.set(node, graph.dependencies.get(node)?.size ?? 0);
  }

  const order: string[] = [];
  let ready = graph.nodes.filter((node) => remaining.get(node) === 0).sort();

  while (ready.length > 0) {
    const next: string[] = [];

    for (const node of ready) {
      order.push(node);
      for (const dependent of graph.dependents.get(node) ?? []) {
        const count = (remaining.get(dependent) ?? 0) - 1;
        remaining.set(dependent, count);
        if (count === 0) next.push(dependent);
      }
    }

    ready = next.sort();
  }

  const emitted = new Set(order);
  const cyclicNodes = graph.nodes.filter((node) => !emitted.has(node)).sort();

  return { order, hasCycles: cyclicNodes.length > 0, cyclicNodes };
}
