import type { RenderContext } from './types.js';
import { codeRef, sectionIntro } from './utils.js';
import { buildFeatureFlowDiagram } from './mermaid.js';
import { renderDocument, collectRoundsUsed, pushStructuredBlock } from './render-template.js';

// ─── renderFeatures ────────────────────────────────────────────────────────

/**
 * Render 05-FEATURES.md from Round 3 (Feature Extraction) data.
 *
 * Primary data: R3 (features, cross-module flows).
 * If no R3 data: return empty string (features cannot be meaningfully
 * determined from static analysis alone).
 */
export function renderFeatures(ctx: RenderContext): string {
  const r3 = ctx.rounds.r3?.data;
  if (!r3) return '';

  const roundsUsed = collectRoundsUsed(ctx, 1, 2, 3);

  return renderDocument(ctx, {
    title: '05 - Features',
    documentId: '05-features',
    category: 'features',
    aiRoundsUsed: roundsUsed,
    status: 'complete',
    relatedDocs: [
      { docId: '06-MODULES', label: 'Modules' },
      { docId: '03-ARCHITECTURE', label: 'Architecture' },
    ],
    renderBody: (lines) => {
      // 2-sentence summary (DOC-17)
      const featureCount = r3.features.length;
      lines.push(
        `${ctx.projectName} exposes ${featureCount} user-facing features. This document traces each feature end-to-end from entry point through implementation.`,
      );
      lines.push('');

      // ── User-Facing Features ────────────────────────────────────────
      const userFacing = r3.features.filter((f) => f.userFacing);
      if (userFacing.length > 0) {
        lines.push('## User-Facing Features');
        lines.push('');
        lines.push(sectionIntro('Features that are directly accessible to end users.'));
        lines.push('');

        for (const feature of userFacing) {
          renderFeatureBlock(lines, ctx, feature);
        }
      }

      // ── Internal Features ───────────────────────────────────────────
      const internal = r3.features.filter((f) => !f.userFacing);
      if (internal.length > 0) {
        lines.push('## Internal Features');
        lines.push('');
        lines.push(sectionIntro('Features used internally by the system, not directly exposed to users.'));
        lines.push('');

        for (const feature of internal) {
          renderFeatureBlock(lines, ctx, feature);
        }
      }

      // ── Cross-Module Flows ──────────────────────────────────────────
      if (r3.crossModuleFlows.length > 0) {
        lines.push('## Cross-Module Flows');
        lines.push('');
        lines.push(sectionIntro('Data and control flows that span multiple modules.'));
        lines.push('');

        for (const flow of r3.crossModuleFlows) {
          lines.push(`### ${flow.name}`);
          lines.push('');
          lines.push(flow.description);
          lines.push('');
          lines.push(`**Flow:** ${flow.path.join(' -> ')}`);
          lines.push('');
        }
      }

      // ── Diagrams ────────────────────────────────────────────────────
      const diagram = buildFeatureFlowDiagram(ctx);
      if (diagram) {
        lines.push('## Diagrams');
        lines.push('');
        lines.push(diagram);
        lines.push('');
      }
    },
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function renderFeatureBlock(
  lines: string[],
  ctx: RenderContext,
  feature: { name: string; description: string; entryPoint: string; modules: string[]; files: string[]; userFacing: boolean },
): void {
  lines.push(`### ${feature.name}`);
  lines.push('');
  lines.push(feature.description);
  lines.push('');
  lines.push(`**Entry point:** ${codeRef(feature.entryPoint)}`);
  lines.push('');

  if (feature.modules.length > 0) {
    lines.push(`**Modules involved:** ${feature.modules.join(', ')}`);
    lines.push('');
  }

  if (feature.files.length > 0) {
    lines.push('**Files:**');
    lines.push('');
    for (const file of feature.files) {
      lines.push(`- ${codeRef(file)}`);
    }
    lines.push('');
  }

  pushStructuredBlock(lines, ctx, {
    feature: feature.name,
    userFacing: feature.userFacing,
    entryPoint: feature.entryPoint,
    modules: feature.modules,
    files: feature.files,
  });
}
