import type { RenderContext } from './types.js';
import { buildTable, codeRef, sectionIntro } from './utils.js';
import { renderDocument, collectRoundsUsed, pushStructuredBlock } from './render-template.js';

// ─── renderEdgeCases ───────────────────────────────────────────────────────

/**
 * Render 09-EDGE-CASES-AND-GOTCHAS.md from Round 5 per-module edge case data.
 *
 * Primary data: R5 modules' edge cases per module.
 * If no R5 data: partial render from static todos (filter for 'bugs' and 'debt'
 * categories) with warning banner.
 */
export function renderEdgeCases(ctx: RenderContext): string {
  const r5 = ctx.rounds.r5?.data;
  const hasR5 = !!r5;

  const staticTodos = ctx.staticAnalysis.todos.items.filter(
    (t) => t.category === 'bugs' || t.category === 'debt',
  );

  if (!hasR5 && staticTodos.length === 0) return '';

  const totalEdgeCases = hasR5
    ? r5.modules.reduce((sum, mod) => sum + mod.edgeCases.length, 0)
    : staticTodos.length;
  const moduleCount = hasR5 ? r5.modules.length : 0;

  const roundsUsed = collectRoundsUsed(ctx, 1, 2, 5);

  return renderDocument(ctx, {
    title: '09 - Edge Cases and Gotchas',
    heading: 'Edge Cases & Gotchas',
    documentId: '09-edge-cases',
    category: 'edge-cases',
    aiRoundsUsed: roundsUsed,
    status: hasR5 ? 'complete' : 'static-only',
    relatedDocs: [
      { docId: '10-TECH-DEBT-AND-TODOS', label: 'Tech Debt' },
      { docId: '11-CONVENTIONS', label: 'Conventions' },
      { docId: '12-TESTING-STRATEGY', label: 'Testing' },
    ],
    renderBody: (lines) => {
      // Warning banner if static-only
      if (!hasR5) {
        lines.push('> **Note:** AI analysis for this section was unavailable. Content is based on static analysis only and may be incomplete.');
        lines.push('');
      }

      // 2-sentence summary (DOC-17)
      lines.push(
        `${ctx.projectName} has ${totalEdgeCases} documented edge cases across ${moduleCount} modules. This document catalogs non-obvious behaviors, error-prone areas, and gotchas.`,
      );
      lines.push('');

      if (hasR5) {
        // ── Summary (severity aggregate) ──────────────────────────────
        const severityCounts = { critical: 0, warning: 0, info: 0 };
        for (const mod of r5.modules) {
          for (const ec of mod.edgeCases) {
            severityCounts[ec.severity]++;
          }
        }

        lines.push('## Summary');
        lines.push('');
        lines.push(buildTable(
          ['Severity', 'Count'],
          [
            ['Critical', String(severityCounts.critical)],
            ['Warning', String(severityCounts.warning)],
            ['Info', String(severityCounts.info)],
          ],
        ));
        lines.push('');

        // ── By Module ─────────────────────────────────────────────────
        lines.push('## By Module');
        lines.push('');

        for (const mod of r5.modules) {
          if (mod.edgeCases.length === 0) continue;

          lines.push(`### ${mod.moduleName}`);
          lines.push('');

          const severityOrder = { critical: 0, warning: 1, info: 2 };
          const sorted = [...mod.edgeCases].sort(
            (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
          );

          lines.push(buildTable(
            ['Description', 'File', 'Line', 'Severity', 'Evidence'],
            sorted.map((ec) => [
              ec.description,
              codeRef(ec.file),
              ec.line !== undefined ? String(ec.line) : '-',
              ec.severity,
              ec.evidence,
            ]),
          ));
          lines.push('');

          pushStructuredBlock(lines, ctx, {
            module: mod.moduleName,
            edgeCaseCount: mod.edgeCases.length,
            criticalCount: mod.edgeCases.filter((e) => e.severity === 'critical').length,
          });
        }

        // ── Error Handling Patterns ───────────────────────────────────
        const modulesWithErrorHandling = r5.modules.filter(
          (m) => m.errorHandling.strategy || m.errorHandling.gaps.length > 0 || m.errorHandling.patterns.length > 0,
        );

        if (modulesWithErrorHandling.length > 0) {
          lines.push('## Error Handling Patterns');
          lines.push('');

          for (const mod of modulesWithErrorHandling) {
            lines.push(`### ${mod.moduleName}`);
            lines.push('');

            if (mod.errorHandling.strategy) {
              lines.push(`**Strategy:** ${mod.errorHandling.strategy}`);
              lines.push('');
            }

            if (mod.errorHandling.patterns.length > 0) {
              lines.push('**Patterns:**');
              lines.push('');
              for (const pattern of mod.errorHandling.patterns) {
                lines.push(`- ${pattern}`);
              }
              lines.push('');
            }

            if (mod.errorHandling.gaps.length > 0) {
              lines.push('**Gaps:**');
              lines.push('');
              for (const gap of mod.errorHandling.gaps) {
                lines.push(`- ${gap}`);
              }
              lines.push('');
            }
          }
        }

        // ── Key Findings ──────────────────────────────────────────────
        if (r5.findings.length > 0) {
          lines.push('## Key Findings');
          lines.push('');
          for (const finding of r5.findings) {
            lines.push(`- ${finding}`);
          }
          lines.push('');
        }
      } else {
        // Static-only: render from todos
        lines.push('## Detected Issues (from TODO/FIXME markers)');
        lines.push('');
        lines.push(sectionIntro('Issues detected from code markers in the source files.'));
        lines.push('');
        lines.push(buildTable(
          ['Description', 'File', 'Line', 'Category'],
          staticTodos.map((todo) => [
            todo.text,
            codeRef(todo.file),
            String(todo.line),
            todo.category,
          ]),
        ));
        lines.push('');
      }
    },
  });
}
