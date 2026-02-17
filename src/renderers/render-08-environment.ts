import type { RenderContext } from './types.js';
import { buildFrontMatter, crossRef, codeRef, buildTable, sectionIntro } from './utils.js';

// ─── renderEnvironment ─────────────────────────────────────────────────────

/**
 * Render 08-ENVIRONMENT.md from Round 6 (Deployment Inference) env var data
 * combined with static env analysis.
 *
 * Primary data: R6 (env vars with purpose, required flag, source) + static env data.
 * If no R6 data: render from static env data with warning banner.
 * Static env data is sufficient for basic documentation.
 */
export function renderEnvironment(ctx: RenderContext): string {
  const r6 = ctx.rounds.r6?.data;
  const staticEnv = ctx.staticAnalysis.env;
  const hasR6 = !!r6;

  // Count variables from best available source
  const envVarCount = hasR6 ? r6.envVars.length : staticEnv.envReferences.length;

  // If no data from either source, skip generation
  if (envVarCount === 0 && staticEnv.envFiles.length === 0) return '';

  const lines: string[] = [];

  const roundsUsed: number[] = [];
  if (ctx.rounds.r1) roundsUsed.push(1);
  if (ctx.rounds.r2) roundsUsed.push(2);
  if (ctx.rounds.r6) roundsUsed.push(6);

  // YAML front-matter
  lines.push(buildFrontMatter({
    title: '08 - Environment',
    document_id: '08-environment',
    category: 'environment',
    project: ctx.projectName,
    generated_at: ctx.generatedAt,
    handover_version: '0.1.0',
    audience: ctx.audience,
    ai_rounds_used: roundsUsed.sort(),
    status: hasR6 ? 'complete' : 'static-only',
  }));

  // Title
  lines.push('# Environment');
  lines.push('');

  // Warning banner if static-only
  if (!hasR6) {
    lines.push('> **Note:** AI analysis for this section was unavailable. Content is based on static analysis only and may be incomplete.');
    lines.push('');
  }

  // 2-sentence summary (DOC-17)
  lines.push(
    `${ctx.projectName} uses ${envVarCount} environment variables for configuration. This document explains every variable, its purpose, and where it's required.`,
  );
  lines.push('');

  // ── Environment Files ──────────────────────────────────────────────────
  if (staticEnv.envFiles.length > 0) {
    lines.push('## Environment Files');
    lines.push('');
    lines.push(sectionIntro('Environment files found in the project.'));
    lines.push('');

    for (const envFile of staticEnv.envFiles) {
      lines.push(`- ${codeRef(envFile.path)} (${envFile.variables.length} variables)`);
    }
    lines.push('');
  }

  // ── Environment Variables ──────────────────────────────────────────────
  lines.push('## Environment Variables');
  lines.push('');

  if (hasR6 && r6.envVars.length > 0) {
    // Full table from R6 data
    lines.push(buildTable(
      ['Name', 'Purpose', 'Required', 'Source'],
      r6.envVars.map((v) => [
        `\`${v.name}\``,
        v.purpose,
        v.required ? 'Yes' : 'No',
        v.source,
      ]),
    ));
    lines.push('');
  } else {
    // Static-only: show variable name + reference location
    const uniqueVars = new Map<string, string[]>();
    for (const ref of staticEnv.envReferences) {
      if (!uniqueVars.has(ref.variable)) {
        uniqueVars.set(ref.variable, []);
      }
      uniqueVars.get(ref.variable)!.push(ref.file);
    }

    if (uniqueVars.size > 0) {
      lines.push(buildTable(
        ['Name', 'Referenced In'],
        Array.from(uniqueVars.entries()).map(([name, files]) => [
          `\`${name}\``,
          files.slice(0, 3).map((f) => codeRef(f)).join(', ') +
            (files.length > 3 ? ` (+${files.length - 3} more)` : ''),
        ]),
      ));
      lines.push('');
    }
  }

  // ── Variable References ────────────────────────────────────────────────
  if (staticEnv.envReferences.length > 0) {
    lines.push('## Variable References');
    lines.push('');

    // Cap at 50 rows (consistent with report.ts pattern)
    const refs = staticEnv.envReferences.slice(0, 50);
    lines.push(buildTable(
      ['File', 'Line', 'Variable'],
      refs.map((ref) => [
        codeRef(ref.file),
        String(ref.line),
        `\`${ref.variable}\``,
      ]),
    ));

    if (staticEnv.envReferences.length > 50) {
      lines.push('');
      lines.push(`*Showing 50 of ${staticEnv.envReferences.length} references.*`);
    }
    lines.push('');
  }

  // ── Warnings ───────────────────────────────────────────────────────────
  if (staticEnv.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const warning of staticEnv.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  // ── Cross-references ───────────────────────────────────────────────────
  lines.push('## Related Documents');
  lines.push('');
  lines.push(`- ${crossRef('02-GETTING-STARTED', undefined, 'Getting Started')}`);
  lines.push(`- ${crossRef('13-DEPLOYMENT', undefined, 'Deployment')}`);
  lines.push('');

  return lines.join('\n');
}
