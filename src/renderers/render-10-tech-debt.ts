import type { RenderContext } from './types.js';
import {
  buildFrontMatter,
  buildTable,
  codeRef,
  crossRef,
  sectionIntro,
} from './utils.js';
import { structuredBlock } from './audience.js';

// ─── renderTechDebt ────────────────────────────────────────────────────────

/**
 * Render the Tech Debt & TODOs document (10-TECH-DEBT-AND-TODOS.md).
 *
 * Primary data: R5 edge cases/findings + static todo items.
 * This doc renders well with static-only data.
 */
export function renderTechDebt(ctx: RenderContext): string {
  const lines: string[] = [];
  const r5 = ctx.rounds.r5?.data;
  const todos = ctx.staticAnalysis.todos;

  // Determine which rounds contributed
  const roundsUsed: number[] = [];
  if (r5) roundsUsed.push(5);

  // Tech Debt renders well from static data alone, so partial if R5
  // is missing but we have static data, complete if both
  const status =
    r5 ? 'complete' : todos.items.length > 0 ? 'static-only' : 'static-only';

  const totalTodos = todos.summary.total;
  const categories = Object.keys(todos.summary.byCategory);
  const categoryCount = categories.length;

  // ── YAML front-matter ──────────────────────────────────────────────────
  lines.push(
    buildFrontMatter({
      title: 'Tech Debt & TODOs',
      document_id: '10-tech-debt',
      category: 'tech-debt',
      project: ctx.projectName,
      generated_at: ctx.generatedAt,
      handover_version: '0.1.0',
      audience: ctx.audience,
      ai_rounds_used: roundsUsed,
      status,
    }),
  );

  // ── Title ──────────────────────────────────────────────────────────────
  lines.push('# Tech Debt & TODOs');
  lines.push('');

  // ── 2-sentence summary (DOC-17) ───────────────────────────────────────
  lines.push(
    `${ctx.projectName} has ${totalTodos} tracked items across ${categoryCount} categories. This document prioritizes every TODO, FIXME, HACK, and technical debt marker.`,
  );
  lines.push('');

  // ── Summary ───────────────────────────────────────────────────────────
  lines.push('## Summary');
  lines.push('');

  if (categoryCount > 0) {
    lines.push(
      sectionIntro(
        'Breakdown of tracked items by category.',
      ),
    );
    lines.push('');

    const summaryRows = Object.entries(todos.summary.byCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([category, count]) => {
        const pct =
          totalTodos > 0 ? ((count / totalTodos) * 100).toFixed(1) : '0.0';
        return [capitalize(category), String(count), `${pct}%`];
      });

    lines.push(
      buildTable(['Category', 'Count', 'Percentage'], summaryRows),
    );
  } else {
    lines.push('No tracked items found.');
  }
  lines.push('');

  // ── Items by Category ─────────────────────────────────────────────────
  const categoryOrder = ['bugs', 'debt', 'tasks', 'notes', 'optimization'];

  for (const category of categoryOrder) {
    const items = todos.items.filter((item) => item.category === category);
    if (items.length === 0) continue;

    lines.push(`## ${capitalize(category)}`);
    lines.push('');

    const itemRows = items.map((item) => [
      `\`${item.marker}\``,
      item.text,
      codeRef(item.file, item.line),
      item.issueRefs.length > 0 ? item.issueRefs.join(', ') : '-',
    ]);

    lines.push(
      buildTable(['Marker', 'Description', 'Location', 'Issues'], itemRows),
    );
    lines.push('');
  }

  // ── AI Insights (if R5 available) ─────────────────────────────────────
  if (r5) {
    // Collect tech-debt related findings from R5 modules
    const debtInsights: string[] = [];

    for (const mod of r5.modules) {
      // Edge cases related to tech debt
      for (const ec of mod.edgeCases) {
        if (
          ec.severity === 'warning' ||
          ec.severity === 'critical'
        ) {
          debtInsights.push(
            `**${mod.moduleName}** (${ec.severity}): ${ec.description} (${codeRef(ec.file, ec.line)})`,
          );
        }
      }

      // Error handling gaps
      if (mod.errorHandling.gaps.length > 0) {
        for (const gap of mod.errorHandling.gaps) {
          debtInsights.push(
            `**${mod.moduleName}** (error handling gap): ${gap}`,
          );
        }
      }
    }

    // Cross-cutting findings
    for (const finding of r5.findings) {
      debtInsights.push(finding);
    }

    if (debtInsights.length > 0) {
      lines.push('## AI Insights');
      lines.push('');
      lines.push(
        sectionIntro(
          'Additional technical debt and quality concerns identified by AI analysis.',
        ),
      );
      lines.push('');

      for (const insight of debtInsights) {
        lines.push(`- ${insight}`);
      }
      lines.push('');

      // AI structured block for insights
      const aiBlock = structuredBlock(ctx.audience, {
        section: 'ai_insights',
        insight_count: debtInsights.length,
        module_count: r5.modules.length,
        edge_case_severities: {
          critical: r5.modules.flatMap((m) =>
            m.edgeCases.filter((e) => e.severity === 'critical'),
          ).length,
          warning: r5.modules.flatMap((m) =>
            m.edgeCases.filter((e) => e.severity === 'warning'),
          ).length,
          info: r5.modules.flatMap((m) =>
            m.edgeCases.filter((e) => e.severity === 'info'),
          ).length,
        },
      });
      if (aiBlock) {
        lines.push(aiBlock);
      }
    }
  }

  // ── Cross-references ──────────────────────────────────────────────────
  lines.push('## Related Documents');
  lines.push('');
  lines.push(
    `- ${crossRef('09-EDGE-CASES-AND-GOTCHAS', undefined, 'Edge Cases and Gotchas')}`,
  );
  lines.push(`- ${crossRef('11-CONVENTIONS', undefined, 'Conventions')}`);
  lines.push('');

  return lines.join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Capitalize the first letter of a string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
