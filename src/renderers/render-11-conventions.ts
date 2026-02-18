import type { RenderContext } from './types.js';
import { codeRef, sectionIntro } from './utils.js';
import { renderDocument, collectRoundsUsed, pushStructuredBlock } from './render-template.js';

// ─── renderConventions ─────────────────────────────────────────────────────

/**
 * Render 11-CONVENTIONS.md from Round 5 cross-cutting conventions
 * and per-module conventions.
 *
 * Primary data: R5 crossCuttingConventions + per-module conventions.
 * If no R5 data: return empty string. Conventions cannot be meaningfully
 * determined from static analysis alone.
 */
export function renderConventions(ctx: RenderContext): string {
  const r5 = ctx.rounds.r5?.data;
  if (!r5) return '';

  const roundsUsed = collectRoundsUsed(ctx, 1, 2, 5);

  return renderDocument(ctx, {
    title: '11 - Conventions',
    documentId: '11-conventions',
    category: 'conventions',
    aiRoundsUsed: roundsUsed,
    status: 'complete',
    relatedDocs: [
      { docId: '03-ARCHITECTURE', label: 'Architecture' },
      { docId: '06-MODULES', label: 'Modules' },
      { docId: '12-TESTING-STRATEGY', label: 'Testing' },
    ],
    renderBody: (lines) => {
      // 2-sentence summary (DOC-17)
      const conventionCount = r5.crossCuttingConventions.length;
      lines.push(
        `${ctx.projectName} follows ${conventionCount} cross-cutting conventions. This document catalogs team patterns, naming rules, and code organization standards.`,
      );
      lines.push('');

      // ── Cross-Cutting Conventions ───────────────────────────────────
      if (r5.crossCuttingConventions.length > 0) {
        lines.push('## Cross-Cutting Conventions');
        lines.push('');
        lines.push(
          sectionIntro('Patterns that span multiple modules and represent team-wide standards.'),
        );
        lines.push('');

        for (const convention of r5.crossCuttingConventions) {
          lines.push(`### ${convention.pattern}`);
          lines.push('');
          lines.push(convention.description);
          lines.push('');
          lines.push(`**Frequency:** ${convention.frequency}`);
          lines.push('');

          pushStructuredBlock(lines, ctx, {
            convention: convention.pattern,
            description: convention.description,
            frequency: convention.frequency,
            scope: 'cross-cutting',
          });
        }
      }

      // ── Per-Module Conventions ──────────────────────────────────────
      const modulesWithConventions = r5.modules.filter((m) => m.conventions.length > 0);

      if (modulesWithConventions.length > 0) {
        lines.push('## Per-Module Conventions');
        lines.push('');
        lines.push(sectionIntro('Patterns specific to individual modules.'));
        lines.push('');

        for (const mod of modulesWithConventions) {
          lines.push(`### ${mod.moduleName}`);
          lines.push('');

          for (const convention of mod.conventions) {
            lines.push(`**${convention.pattern}**`);
            lines.push('');
            lines.push(convention.description);
            lines.push('');

            if (convention.examples.length > 0) {
              lines.push('Examples:');
              lines.push('');
              for (const example of convention.examples) {
                lines.push(`- ${codeRef(example)}`);
              }
              lines.push('');
            }
          }

          pushStructuredBlock(lines, ctx, {
            module: mod.moduleName,
            conventionCount: mod.conventions.length,
            conventions: mod.conventions.map((c) => c.pattern),
          });
        }
      }
    },
  });
}
