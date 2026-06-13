import type { ParsedFile } from '../parsing/types.js';
import { resolveToKnownPath } from './import-resolution.js';

/**
 * File-level internal import dependency graph.
 *
 * Built statically from AST import data (no LLM). This is the factual ground
 * truth that downstream rounds can use to (a) validate LLM-asserted module
 * relationships, (b) order analysis dependencies-first, and (c) drive faithful
 * dependency diagrams.
 */
export interface ImportGraph {
  /** All participating internal file paths, sorted. */
  nodes: string[];
  /** Forward edges: file -> set of internal files it imports. */
  dependencies: Map<string, Set<string>>;
  /** Reverse edges: file -> set of internal files that import it. */
  dependents: Map<string, Set<string>>;
}

export interface TopoResult {
  /**
   * Dependencies-first ordering: a file appears only after every internal file
   * it imports. Files involved in a cycle are omitted (see `cyclicNodes`).
   */
  order: string[];
  /** True when one or more import cycles prevented a complete ordering. */
  hasCycles: boolean;
  /**
   * Sorted file paths that could not be ordered: those participating in an
   * import cycle, plus any that transitively depend on one.
   */
  cyclicNodes: string[];
}

/**
 * Build a directed import graph from parsed files. Edges are recorded only for
 * imports that resolve to a known internal file path; external packages and
 * unresolved imports are ignored.
 */
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

  return {
    nodes: [...nodes].sort(),
    dependencies,
    dependents,
  };
}

/**
 * Produce a dependencies-first ordering of the graph via wave-based Kahn's
 * algorithm. Within each wave, nodes are emitted in alphabetical order so the
 * result is deterministic. Nodes left over after the algorithm terminates are
 * part of an import cycle and are reported separately.
 */
export function dependenciesFirstOrder(graph: ImportGraph): TopoResult {
  // Remaining unmet dependencies per node.
  const remaining = new Map<string, number>();
  for (const node of graph.nodes) {
    remaining.set(node, graph.dependencies.get(node)?.size ?? 0);
  }

  const order: string[] = [];

  // Initial wave: nodes with no internal dependencies.
  let ready = graph.nodes.filter((node) => remaining.get(node) === 0).sort();

  while (ready.length > 0) {
    const next: string[] = [];

    for (const node of ready) {
      order.push(node);

      // Decrement each dependent's unmet-dependency count; the order we visit
      // them here is irrelevant because `next` is sorted before the next wave.
      for (const dependent of graph.dependents.get(node) ?? []) {
        const count = (remaining.get(dependent) ?? 0) - 1;
        remaining.set(dependent, count);
        if (count === 0) {
          next.push(dependent);
        }
      }
    }

    ready = next.sort();
  }

  // Anything not emitted is part of a cycle.
  const emitted = new Set(order);
  const cyclicNodes = graph.nodes.filter((node) => !emitted.has(node)).sort();

  return {
    order,
    hasCycles: cyclicNodes.length > 0,
    cyclicNodes,
  };
}
