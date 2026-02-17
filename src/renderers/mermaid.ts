import type { RenderContext } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sanitize a string for use as a mermaid node ID.
 * Replaces non-alphanumeric chars with underscore, prefixes with n_ if starts with digit.
 */
function sanitizeId(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^\d/.test(cleaned) ? `n_${cleaned}` : cleaned;
}

// ─── buildArchitectureDiagram ───────────────────────────────────────────────

/**
 * Build a flowchart TD diagram from Round 4 (Architecture Detection) data.
 * Uses layering data if available: subgraphs per layer, nodes per module.
 * Connected via dataFlow edges. Capped at ~20 nodes.
 *
 * Placed in 03-ARCHITECTURE, Diagrams section.
 */
export function buildArchitectureDiagram(ctx: RenderContext): string {
  const r4 = ctx.rounds.r4?.data;
  if (!r4) return '';

  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('flowchart TD');

  // Track all node IDs we emit (for cap enforcement)
  const emittedNodes = new Set<string>();
  const NODE_CAP = 20;

  if (r4.layering?.layers.length) {
    // Build subgraphs per layer
    for (const layer of r4.layering.layers) {
      const layerId = sanitizeId(layer.name);
      lines.push(`  subgraph ${layerId}["${layer.name}"]`);

      for (const mod of layer.modules) {
        if (emittedNodes.size >= NODE_CAP) break;
        const nodeId = sanitizeId(mod);
        lines.push(`    ${nodeId}["${mod}"]`);
        emittedNodes.add(nodeId);
      }

      lines.push('  end');
    }
  } else {
    // No layering; emit pattern modules as flat nodes
    for (const pattern of r4.patterns) {
      for (const mod of pattern.modules) {
        if (emittedNodes.size >= NODE_CAP) break;
        const nodeId = sanitizeId(mod);
        if (!emittedNodes.has(nodeId)) {
          lines.push(`  ${nodeId}["${mod}"]`);
          emittedNodes.add(nodeId);
        }
      }
    }
  }

  // Add dataFlow edges
  for (const flow of r4.dataFlow) {
    const fromId = sanitizeId(flow.from);
    const toId = sanitizeId(flow.to);
    if (emittedNodes.has(fromId) && emittedNodes.has(toId)) {
      lines.push(`  ${fromId} -->|${flow.data}| ${toId}`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}

// ─── buildFeatureFlowDiagram ────────────────────────────────────────────────

/**
 * Build a flowchart LR diagram from Round 3 (Feature Extraction) data.
 * Shows top features as nodes connected by crossModuleFlows.
 * Capped at ~10 feature nodes.
 *
 * Placed in 05-FEATURES, Diagrams section.
 */
export function buildFeatureFlowDiagram(ctx: RenderContext): string {
  const r3 = ctx.rounds.r3?.data;
  if (!r3) return '';

  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('flowchart LR');

  const NODE_CAP = 10;
  const emittedNodes = new Set<string>();

  // Emit feature nodes
  for (const feature of r3.features.slice(0, NODE_CAP)) {
    const nodeId = sanitizeId(feature.name);
    lines.push(`  ${nodeId}["${feature.name}"]`);
    emittedNodes.add(nodeId);
  }

  // Connect via crossModuleFlows
  for (const flow of r3.crossModuleFlows) {
    const path = flow.path;
    for (let i = 0; i < path.length - 1; i++) {
      const fromId = sanitizeId(path[i]);
      const toId = sanitizeId(path[i + 1]);
      if (emittedNodes.has(fromId) && emittedNodes.has(toId)) {
        lines.push(`  ${fromId} -->|${flow.name}| ${toId}`);
      }
    }
  }

  lines.push('```');
  return lines.join('\n');
}

// ─── buildModuleDiagram ─────────────────────────────────────────────────────

/**
 * Build a graph LR diagram from Round 2 (Module Detection) data.
 * Nodes are modules, edges are relationships. Capped at ~15 nodes.
 *
 * Placed in 06-MODULES, Diagrams section.
 */
export function buildModuleDiagram(ctx: RenderContext): string {
  const r2 = ctx.rounds.r2?.data;
  if (!r2) return '';

  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('graph LR');

  const NODE_CAP = 15;
  const emittedNodes = new Set<string>();

  // Emit module nodes
  for (const mod of r2.modules.slice(0, NODE_CAP)) {
    const nodeId = sanitizeId(mod.name);
    lines.push(`  ${nodeId}["${mod.name}"]`);
    emittedNodes.add(nodeId);
  }

  // Emit relationship edges
  for (const rel of r2.relationships) {
    const fromId = sanitizeId(rel.from);
    const toId = sanitizeId(rel.to);
    if (emittedNodes.has(fromId) && emittedNodes.has(toId)) {
      lines.push(`  ${fromId} -->|${rel.type}| ${toId}`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}

// ─── buildDependencyDiagram ─────────────────────────────────────────────────

/**
 * Build a graph TD diagram from Round 1 keyDependencies + static dependency data.
 * Groups into production/dev subgraphs. Capped at ~15 nodes.
 *
 * Placed in 07-DEPENDENCIES, Diagrams section.
 */
export function buildDependencyDiagram(ctx: RenderContext): string {
  const r1 = ctx.rounds.r1?.data;
  const staticDeps = ctx.staticAnalysis.dependencies;

  if (!r1 && staticDeps.manifests.length === 0) return '';

  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('graph TD');

  const NODE_CAP = 15;
  let nodeCount = 0;

  // Central project node
  const projectId = sanitizeId(ctx.projectName || 'Project');
  lines.push(`  ${projectId}["${ctx.projectName || 'Project'}"]`);
  nodeCount++;

  // Collect production and dev dependencies from static analysis
  const prodDeps: Array<{ name: string; role: string }> = [];
  const devDeps: Array<{ name: string; role: string }> = [];

  // Use R1 keyDependencies for richer role information
  if (r1) {
    for (const dep of r1.keyDependencies) {
      prodDeps.push({ name: dep.name, role: dep.role });
    }
  }

  // Supplement from static deps if R1 is unavailable
  if (prodDeps.length === 0) {
    for (const manifest of staticDeps.manifests) {
      for (const dep of manifest.dependencies) {
        const target = dep.type === 'development' ? devDeps : prodDeps;
        target.push({ name: dep.name, role: dep.type });
      }
    }
  }

  // Production subgraph
  if (prodDeps.length > 0) {
    lines.push('  subgraph Production["Production"]');
    for (const dep of prodDeps.slice(0, Math.floor((NODE_CAP - 1) * 0.7))) {
      if (nodeCount >= NODE_CAP) break;
      const depId = sanitizeId(dep.name);
      lines.push(`    ${depId}["${dep.name}"]`);
      nodeCount++;
    }
    lines.push('  end');
  }

  // Dev subgraph
  if (devDeps.length > 0) {
    lines.push('  subgraph Development["Development"]');
    for (const dep of devDeps.slice(0, NODE_CAP - nodeCount)) {
      if (nodeCount >= NODE_CAP) break;
      const depId = sanitizeId(dep.name);
      lines.push(`    ${depId}["${dep.name}"]`);
      nodeCount++;
    }
    lines.push('  end');
  }

  // Connect project to dependency subgraphs
  if (prodDeps.length > 0) {
    lines.push(`  ${projectId} --> Production`);
  }
  if (devDeps.length > 0) {
    lines.push(`  ${projectId} -.-> Development`);
  }

  lines.push('```');
  return lines.join('\n');
}
