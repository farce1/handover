import type { RenderContext } from './types.js';
import { buildTable, codeRef, sectionIntro } from './utils.js';
import { renderDocument, collectRoundsUsed, pushStructuredBlock } from './render-template.js';

// ─── renderOverview ────────────────────────────────────────────────────────

/**
 * Render the Project Overview document (01-PROJECT-OVERVIEW.md).
 *
 * Primary data: Round 1 (Project Overview). Fallback: static analysis metadata.
 */
export function renderOverview(ctx: RenderContext): string {
  const r1 = ctx.rounds.r1?.data;
  const meta = ctx.staticAnalysis.metadata;

  const roundsUsed = collectRoundsUsed(ctx, 1);
  const status = r1 ? 'complete' : 'static-only';

  return renderDocument(ctx, {
    title: 'Project Overview',
    documentId: '01-project-overview',
    category: 'overview',
    aiRoundsUsed: roundsUsed,
    status,
    relatedDocs: [
      { docId: '03-ARCHITECTURE', label: 'Architecture' },
      { docId: '04-FILE-STRUCTURE', label: 'File Structure' },
      { docId: '02-GETTING-STARTED', label: 'Getting Started' },
    ],
    renderBody: (lines) => {
      // ── 2-sentence summary (DOC-17) ─────────────────────────────────
      if (r1) {
        lines.push(
          `${ctx.projectName} is a ${r1.purpose}. Built with ${r1.primaryLanguage}, it ${r1.technicalLandscape}.`,
        );
      } else {
        const topLang =
          Object.entries(ctx.staticAnalysis.fileTree.filesByExtension)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 1)
            .map(([ext]) => ext)
            .join('') || 'multiple languages';
        lines.push(
          `${ctx.projectName} is a ${topLang} project with ${meta.fileCount} files. It was analyzed on ${meta.analyzedAt}.`,
        );
      }
      lines.push('');

      // ── Warning banner for static-only mode ─────────────────────────
      if (!r1) {
        lines.push(
          '> **Note:** AI analysis was unavailable. Content is based on static analysis only.',
        );
        lines.push('');
      }

      // ── What This Project Does ──────────────────────────────────────
      lines.push('## What This Project Does');
      lines.push('');
      if (r1) {
        lines.push(sectionIntro(r1.purpose));
      } else {
        const contextDesc = ctx.config.context ?? ctx.config.project?.description;
        lines.push(
          sectionIntro(
            contextDesc
              ? contextDesc
              : `${ctx.projectName} contains ${meta.fileCount} files. See configuration for more context.`,
          ),
        );
      }
      lines.push('');

      // ── Technical Landscape ─────────────────────────────────────────
      lines.push('## Technical Landscape');
      lines.push('');
      if (r1) {
        lines.push(`- **Primary language:** ${r1.primaryLanguage}`);
        if (r1.framework) {
          lines.push(`- **Framework:** ${r1.framework}`);
        }
        lines.push(
          `- **Project scale:** ${r1.projectScale.fileCount} files, ${r1.projectScale.estimatedComplexity} complexity`,
        );
        if (r1.projectScale.mainConcerns.length > 0) {
          lines.push(
            `- **Main concerns:** ${r1.projectScale.mainConcerns.join(', ')}`,
          );
        }
      } else {
        const langBreakdown = Object.entries(
          ctx.staticAnalysis.fileTree.filesByExtension,
        )
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5);
        for (const [ext, count] of langBreakdown) {
          lines.push(`- **${ext}:** ${count} files`);
        }
      }
      lines.push('');

      // ── Key Dependencies ────────────────────────────────────────────
      lines.push('## Key Dependencies');
      lines.push('');
      if (r1 && r1.keyDependencies.length > 0) {
        const depRows = r1.keyDependencies.map((d) => [d.name, d.role]);
        lines.push(buildTable(['Name', 'Role'], depRows));
      } else {
        const staticDeps = ctx.staticAnalysis.dependencies.manifests
          .flatMap((m) => m.dependencies)
          .slice(0, 10);
        if (staticDeps.length > 0) {
          const depRows = staticDeps.map((d) => [d.name, d.version]);
          lines.push(buildTable(['Name', 'Version'], depRows));
        } else {
          lines.push('No dependency information available.');
        }
      }
      lines.push('');

      // ── Entry Points ────────────────────────────────────────────────
      if (r1 && r1.entryPoints.length > 0) {
        lines.push('## Entry Points');
        lines.push('');
        for (const ep of r1.entryPoints) {
          lines.push(`- ${codeRef(ep.path)} (${ep.type}): ${ep.description}`);
        }
        lines.push('');
      }

      // ── Key Findings ────────────────────────────────────────────────
      if (r1 && r1.findings.length > 0) {
        lines.push('## Key Findings');
        lines.push('');
        for (const finding of r1.findings) {
          lines.push(`- ${finding}`);
        }
        lines.push('');
      }

      // ── Open Questions ──────────────────────────────────────────────
      if (r1 && r1.openQuestions.length > 0) {
        lines.push('## Open Questions');
        lines.push('');
        for (const question of r1.openQuestions) {
          lines.push(`- ${question}`);
        }
        lines.push('');
      }

      // ── AI structured block ─────────────────────────────────────────
      if (r1) {
        pushStructuredBlock(lines, ctx, {
          project_name: ctx.projectName,
          primary_language: r1.primaryLanguage,
          framework: r1.framework ?? 'none',
          purpose: r1.purpose,
          scale: r1.projectScale.estimatedComplexity,
          file_count: r1.projectScale.fileCount,
          key_dependencies: r1.keyDependencies.map((d) => d.name),
          entry_points: r1.entryPoints.map((e) => e.path),
        });
      }
    },
  });
}
