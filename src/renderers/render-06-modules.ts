import type { RenderContext } from './types.js';
import { codeRef, buildTable, sectionIntro } from './utils.js';
import { buildModuleDiagram } from './mermaid.js';
import { renderDocument, collectRoundsUsed, pushStructuredBlock } from './render-template.js';

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

  const modules = hasR2
    ? r2.modules
    : deriveModulesFromFileTree(ctx);

  if (modules.length === 0) return '';

  const roundsUsed = collectRoundsUsed(ctx, 1, 2);

  return renderDocument(ctx, {
    title: '06 - Modules',
    documentId: '06-modules',
    category: 'modules',
    aiRoundsUsed: roundsUsed,
    status: hasR2 ? 'complete' : 'static-only',
    relatedDocs: [
      { docId: '03-ARCHITECTURE', label: 'Architecture' },
      { docId: '05-FEATURES', label: 'Features' },
      { docId: '04-FILE-STRUCTURE', label: 'File Structure' },
    ],
    renderBody: (lines) => {
      // Warning banner if static-only
      if (!hasR2) {
        lines.push('> **Note:** AI analysis for this section was unavailable. Content is based on static analysis only and may be incomplete.');
        lines.push('');
      }

      // 2-sentence summary (DOC-17)
      lines.push(
        `${ctx.projectName} is organized into ${modules.length} modules. This document describes each module's boundary, public API, and purpose.`,
      );
      lines.push('');

      // ── Module Overview ─────────────────────────────────────────────
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

      // ── Module Details ──────────────────────────────────────────────
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

        pushStructuredBlock(lines, ctx, {
          module: mod.name,
          path: mod.path,
          purpose: mod.purpose,
          publicApi: mod.publicApi,
          fileCount: mod.files.length,
        });
      }

      // ── Module Relationships ────────────────────────────────────────
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

      // ── Boundary Issues ─────────────────────────────────────────────
      if (hasR2 && r2.boundaryIssues.length > 0) {
        lines.push('## Boundary Issues');
        lines.push('');
        for (const issue of r2.boundaryIssues) {
          lines.push(`- ${issue}`);
        }
        lines.push('');
      }

      // ── Diagrams ────────────────────────────────────────────────────
      const diagram = buildModuleDiagram(ctx);
      if (diagram) {
        lines.push('## Diagrams');
        lines.push('');
        lines.push(diagram);
        lines.push('');
      }
    },
  });
}

// ─── Static fallback: derive modules from file tree ────────────────────────

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
