import type { RenderContext } from './types.js';
import { buildTable, codeRef, sectionIntro } from './utils.js';
import { renderDocument, collectRoundsUsed, pushStructuredBlock } from './render-template.js';

// ─── renderFileStructure ───────────────────────────────────────────────────

/**
 * Render the File Structure document (04-FILE-STRUCTURE.md).
 *
 * Primary data: static analysis fileTree + R1 + R2 (module info for annotations).
 * Fallback: static file tree (always available).
 */
export function renderFileStructure(ctx: RenderContext): string {
  const r1 = ctx.rounds.r1?.data;
  const r2 = ctx.rounds.r2?.data;
  const fileTree = ctx.staticAnalysis.fileTree;

  const roundsUsed = collectRoundsUsed(ctx, 1, 2);
  const status =
    r1 && r2 ? 'complete' : roundsUsed.length > 0 ? 'partial' : 'static-only';

  return renderDocument(ctx, {
    title: 'File Structure',
    documentId: '04-file-structure',
    category: 'structure',
    aiRoundsUsed: roundsUsed,
    status,
    relatedDocs: [
      { docId: '03-ARCHITECTURE', label: 'Architecture' },
      { docId: '06-MODULES', label: 'Modules' },
    ],
    renderBody: (lines) => {
      // ── 2-sentence summary (DOC-17) ─────────────────────────────────
      lines.push(
        `${ctx.projectName} contains ${fileTree.totalFiles} files across ${fileTree.totalDirs} directories. This document maps every directory and key file to its purpose.`,
      );
      lines.push('');

      // ── Warning banner ──────────────────────────────────────────────
      if (!r1 && !r2) {
        lines.push(
          '> **Note:** AI analysis was unavailable. Content is based on static analysis only.',
        );
        lines.push('');
      }

      // ── Overview ────────────────────────────────────────────────────
      lines.push('## Overview');
      lines.push('');
      lines.push(`- **Total files:** ${fileTree.totalFiles}`);
      lines.push(`- **Total directories:** ${fileTree.totalDirs}`);
      lines.push(`- **Total lines:** ${fileTree.totalLines.toLocaleString()}`);
      lines.push(`- **Total size:** ${formatBytes(fileTree.totalSize)}`);
      lines.push('');

      // ── Directory Tree ──────────────────────────────────────────────
      lines.push('## Directory Tree');
      lines.push('');

      const moduleAnnotations = new Map<string, string>();
      if (r2) {
        for (const mod of r2.modules) {
          moduleAnnotations.set(mod.path, mod.purpose);
        }
      }

      lines.push(
        sectionIntro(
          'The project directory structure with annotations for key directories.',
        ),
      );
      lines.push('');

      const directories = fileTree.directoryTree.filter(
        (e) => e.type === 'directory',
      );
      lines.push('```');
      for (const dir of directories) {
        const depth = dir.path.split('/').length - 1;
        const indent = '  '.repeat(depth);
        const name = dir.path.split('/').pop() ?? dir.path;
        const annotation = moduleAnnotations.get(dir.path);
        const annotationSuffix = annotation ? `  # ${annotation}` : '';
        const childCount =
          dir.children !== undefined ? ` (${dir.children} items)` : '';
        lines.push(`${indent}${name}/${childCount}${annotationSuffix}`);
      }
      lines.push('```');
      lines.push('');

      // ── File Distribution ───────────────────────────────────────────
      lines.push('## File Distribution');
      lines.push('');
      lines.push(sectionIntro('Breakdown of files by extension.'));
      lines.push('');

      const extensionEntries = Object.entries(fileTree.filesByExtension)
        .sort(([, a], [, b]) => b - a);

      if (extensionEntries.length > 0) {
        const extRows = extensionEntries.map(([ext, count]) => {
          const pct = ((count / fileTree.totalFiles) * 100).toFixed(1);
          return [ext, String(count), `${pct}%`];
        });
        lines.push(buildTable(['Extension', 'Count', 'Percentage'], extRows));
      } else {
        lines.push('No file extension data available.');
      }
      lines.push('');

      // ── Largest Files ───────────────────────────────────────────────
      if (fileTree.largestFiles.length > 0) {
        lines.push('## Largest Files');
        lines.push('');
        lines.push(
          sectionIntro(
            'The largest files in the project, which may warrant special attention during handover.',
          ),
        );
        lines.push('');

        const fileRows = fileTree.largestFiles.map((f) => [
          codeRef(f.path),
          formatBytes(f.size),
          String(f.lines),
        ]);
        lines.push(buildTable(['File', 'Size', 'Lines'], fileRows));
        lines.push('');
      }

      // ── AI structured block ─────────────────────────────────────────
      pushStructuredBlock(lines, ctx, {
        total_files: fileTree.totalFiles,
        total_dirs: fileTree.totalDirs,
        total_lines: fileTree.totalLines,
        total_size: fileTree.totalSize,
        top_extensions: extensionEntries.slice(0, 5).map(([ext, count]) => ({
          extension: ext,
          count,
        })),
        largest_files: fileTree.largestFiles.slice(0, 5).map((f) => ({
          path: f.path,
          size: f.size,
          lines: f.lines,
        })),
      });
    },
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
