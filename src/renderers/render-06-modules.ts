import type { RenderContext } from './types.js';
import { buildFrontMatter, crossRef, codeRef, buildTable, sectionIntro } from './utils.js';
import { buildModuleDiagram } from './mermaid.js';
import { structuredBlock } from './audience.js';

// ─── renderModules ─────────────────────────────────────────────────────────

/**
 * Render 06-MODULES.md from Round 2 (Module Detection) data.
 *
 * Primary data: R2 (modules, relationships).
 * If no R2 data: partial render from static file tree (group top-level
 * directories as modules) with a warning banner.
 */
export function renderModules(ctx: RenderContext): string {
  const r2 = ctx.rounds.r2?.data;
  const hasR2 = !!r2;

  // Use R2 modules if available, otherwise derive from file tree top-level directories
  const modules = hasR2
    ? r2.modules
    : deriveModulesFromFileTree(ctx);

  if (modules.length === 0) return '';

  const lines: string[] = [];

  const roundsUsed: number[] = [];
  if (ctx.rounds.r1) roundsUsed.push(1);
  if (ctx.rounds.r2) roundsUsed.push(2);

  // YAML front-matter
  lines.push(buildFrontMatter({
    title: '06 - Modules',
    document_id: '06-modules',
    category: 'modules',
    project: ctx.projectName,
    generated_at: ctx.generatedAt,
    handover_version: '0.1.0',
    audience: ctx.audience,
    ai_rounds_used: roundsUsed.sort(),
    status: hasR2 ? 'complete' : 'static-only',
  }));

  // Title
  lines.push('# Modules');
  lines.push('');

  // Warning banner if static-only
  if (!hasR2) {
    lines.push('> **Note:** AI analysis for this section was unavailable. Content is based on static analysis only and may be incomplete.');
    lines.push('');
  }

  // 2-sentence summary (DOC-17)
  const moduleCount = modules.length;
  lines.push(
    `${ctx.projectName} is organized into ${moduleCount} modules. This document describes each module's boundary, public API, and purpose.`,
  );
  lines.push('');

  // ── Module Overview ────────────────────────────────────────────────────
  lines.push('## Module Overview');
  lines.push('');

  lines.push(buildTable(
    ['Name', 'Path', 'Purpose', 'Files Count'],
    modules.map((mod) => [
      mod.name,
      codeRef(mod.path),
      mod.purpose,
      String(mod.files.length),
    ]),
  ));
  lines.push('');

  // ── Module Details ─────────────────────────────────────────────────────
  lines.push('## Module Details');
  lines.push('');

  for (const mod of modules) {
    lines.push(`### ${mod.name}`);
    lines.push('');
    lines.push(mod.purpose);
    lines.push('');
    lines.push(`**Path:** ${codeRef(mod.path)}`);
    lines.push('');

    if (mod.publicApi.length > 0) {
      lines.push('**Public API:**');
      lines.push('');
      for (const api of mod.publicApi) {
        lines.push(`- \`${api}\``);
      }
      lines.push('');
    }

    if (mod.files.length > 0) {
      lines.push('**Files:**');
      lines.push('');
      for (const file of mod.files) {
        lines.push(`- ${codeRef(file)}`);
      }
      lines.push('');
    }

    if (mod.concerns && mod.concerns.length > 0) {
      lines.push('**Concerns:**');
      lines.push('');
      for (const concern of mod.concerns) {
        lines.push(`- ${concern}`);
      }
      lines.push('');
    }

    if (ctx.audience === 'ai') {
      lines.push(structuredBlock(ctx.audience, {
        module: mod.name,
        path: mod.path,
        purpose: mod.purpose,
        publicApi: mod.publicApi,
        fileCount: mod.files.length,
      }));
    }
  }

  // ── Module Relationships ───────────────────────────────────────────────
  if (hasR2 && r2.relationships.length > 0) {
    lines.push('## Module Relationships');
    lines.push('');

    lines.push(buildTable(
      ['From', 'To', 'Type', 'Evidence'],
      r2.relationships.map((rel) => [
        rel.from,
        rel.to,
        rel.type,
        rel.evidence,
      ]),
    ));
    lines.push('');
  }

  // ── Boundary Issues ────────────────────────────────────────────────────
  if (hasR2 && r2.boundaryIssues.length > 0) {
    lines.push('## Boundary Issues');
    lines.push('');
    for (const issue of r2.boundaryIssues) {
      lines.push(`- ${issue}`);
    }
    lines.push('');
  }

  // ── Diagrams (at END per locked decision) ──────────────────────────────
  const diagram = buildModuleDiagram(ctx);
  if (diagram) {
    lines.push('## Diagrams');
    lines.push('');
    lines.push(diagram);
    lines.push('');
  }

  // ── Cross-references ───────────────────────────────────────────────────
  lines.push('## Related Documents');
  lines.push('');
  lines.push(`- ${crossRef('03-ARCHITECTURE', undefined, 'Architecture')}`);
  lines.push(`- ${crossRef('05-FEATURES', undefined, 'Features')}`);
  lines.push(`- ${crossRef('04-FILE-STRUCTURE', undefined, 'File Structure')}`);
  lines.push('');

  return lines.join('\n');
}

// ─── Static fallback: derive modules from file tree ────────────────────────

/**
 * When R2 data is unavailable, derive approximate modules from top-level
 * directories in the file tree. Each directory becomes a "module" with
 * minimal metadata.
 */
function deriveModulesFromFileTree(ctx: RenderContext): Array<{
  name: string;
  path: string;
  purpose: string;
  publicApi: string[];
  files: string[];
  concerns?: string[];
}> {
  const dirMap = new Map<string, string[]>();

  for (const entry of ctx.staticAnalysis.fileTree.directoryTree) {
    if (entry.type === 'directory') {
      // Use top-level directories as module proxies
      const topDir = entry.path.split('/')[0];
      if (topDir && !dirMap.has(topDir)) {
        dirMap.set(topDir, []);
      }
    }
    if (entry.type === 'file') {
      const topDir = entry.path.split('/')[0];
      if (topDir && dirMap.has(topDir)) {
        dirMap.get(topDir)!.push(entry.path);
      }
    }
  }

  return Array.from(dirMap.entries()).map(([dir, files]) => ({
    name: dir,
    path: dir,
    purpose: `Top-level directory (static analysis only)`,
    publicApi: [],
    files,
  }));
}
