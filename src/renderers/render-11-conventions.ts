import type { RenderContext } from './types.js';
import { buildFrontMatter, crossRef, codeRef, sectionIntro } from './utils.js';
import { structuredBlock } from './audience.js';

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

  const lines: string[] = [];

  const roundsUsed: number[] = [];
  if (ctx.rounds.r1) roundsUsed.push(1);
  if (ctx.rounds.r2) roundsUsed.push(2);
  if (ctx.rounds.r5) roundsUsed.push(5);

  const conventionCount = r5.crossCuttingConventions.length;

  // YAML front-matter
  lines.push(buildFrontMatter({
    title: '11 - Conventions',
    document_id: '11-conventions',
    category: 'conventions',
    project: ctx.projectName,
    generated_at: ctx.generatedAt,
    handover_version: '0.1.0',
    audience: ctx.audience,
    ai_rounds_used: roundsUsed.sort(),
    status: 'complete',
  }));

  // Title
  lines.push('# Conventions');
  lines.push('');

  // 2-sentence summary (DOC-17)
  lines.push(
    `${ctx.projectName} follows ${conventionCount} cross-cutting conventions. This document catalogs team patterns, naming rules, and code organization standards.`,
  );
  lines.push('');

  // ── Cross-Cutting Conventions ──────────────────────────────────────────
  if (r5.crossCuttingConventions.length > 0) {
    lines.push('## Cross-Cutting Conventions');
    lines.push('');
    lines.push(sectionIntro('Patterns that span multiple modules and represent team-wide standards.'));
    lines.push('');

    for (const convention of r5.crossCuttingConventions) {
      lines.push(`### ${convention.pattern}`);
      lines.push('');
      lines.push(convention.description);
      lines.push('');
      lines.push(`**Frequency:** ${convention.frequency}`);
      lines.push('');

      if (ctx.audience === 'ai') {
        lines.push(structuredBlock(ctx.audience, {
          convention: convention.pattern,
          description: convention.description,
          frequency: convention.frequency,
          scope: 'cross-cutting',
        }));
      }
    }
  }

  // ── Per-Module Conventions ─────────────────────────────────────────────
  const modulesWithConventions = r5.modules.filter(
    (m) => m.conventions.length > 0,
  );

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

      if (ctx.audience === 'ai') {
        lines.push(structuredBlock(ctx.audience, {
          module: mod.moduleName,
          conventionCount: mod.conventions.length,
          conventions: mod.conventions.map((c) => c.pattern),
        }));
      }
    }
  }

  // ── Cross-references ───────────────────────────────────────────────────
  lines.push('## Related Documents');
  lines.push('');
  lines.push(`- ${crossRef('03-ARCHITECTURE', undefined, 'Architecture')}`);
  lines.push(`- ${crossRef('06-MODULES', undefined, 'Modules')}`);
  lines.push(`- ${crossRef('12-TESTING-STRATEGY', undefined, 'Testing')}`);
  lines.push('');

  return lines.join('\n');
}
