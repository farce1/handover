import type { RenderContext } from './types.js';
import { buildTable, codeRef, crossRef, sectionIntro } from './utils.js';
import { renderDocument, collectRoundsUsed } from './render-template.js';

// ─── renderEnvironment ─────────────────────────────────────────────────────

/**
 * Render 08-ENVIRONMENT.md from Round 6 (Deployment Inference) env var data
 * combined with static env analysis.
 *
 * Primary data: R6 (env vars with purpose, required flag, source) + static env data.
 * If no R6 data: render from static env data with warning banner.
 */
export function renderEnvironment(ctx: RenderContext): string {
  const r6 = ctx.rounds.r6?.data;
  const staticEnv = ctx.staticAnalysis.env;
  const hasR6 = !!r6;

  const envVarCount = hasR6 ? r6.envVars.length : staticEnv.envReferences.length;

  if (envVarCount === 0 && staticEnv.envFiles.length === 0) return '';

  const roundsUsed = collectRoundsUsed(ctx, 1, 2, 6);

  return renderDocument(ctx, {
    title: '08 - Environment',
    documentId: '08-environment',
    category: 'environment',
    aiRoundsUsed: roundsUsed,
    status: hasR6 ? 'complete' : 'static-only',
    relatedDocs: [
      { docId: '02-GETTING-STARTED', label: 'Getting Started' },
      { docId: '13-DEPLOYMENT', label: 'Deployment' },
    ],
    renderBody: (lines) => {
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

      // ── Environment Files ───────────────────────────────────────────
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

      // ── Environment Variables ───────────────────────────────────────
      lines.push('## Environment Variables');
      lines.push('');

      if (hasR6 && r6.envVars.length > 0) {
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

      // ── Variable References ─────────────────────────────────────────
      if (staticEnv.envReferences.length > 0) {
        lines.push('## Variable References');
        lines.push('');
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

      // ── Warnings ────────────────────────────────────────────────────
      if (staticEnv.warnings.length > 0) {
        lines.push('## Warnings');
        lines.push('');
        for (const warning of staticEnv.warnings) {
          lines.push(`- ${warning}`);
        }
        lines.push('');
      }
    },
  });
}
