import type { RenderContext } from './types.js';
import { buildFrontMatter, crossRef, codeRef, sectionIntro } from './utils.js';
import { buildFeatureFlowDiagram } from './mermaid.js';
import { structuredBlock } from './audience.js';

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

  const lines: string[] = [];

  const roundsUsed = [3];
  if (ctx.rounds.r1) roundsUsed.push(1);
  if (ctx.rounds.r2) roundsUsed.push(2);

  // YAML front-matter
  lines.push(buildFrontMatter({
    title: '05 - Features',
    document_id: '05-features',
    category: 'features',
    project: ctx.projectName,
    generated_at: ctx.generatedAt,
    handover_version: '0.1.0',
    audience: ctx.audience,
    ai_rounds_used: roundsUsed.sort(),
    status: 'complete',
  }));

  // Title
  lines.push('# Features');
  lines.push('');

  // 2-sentence summary (DOC-17)
  const featureCount = r3.features.length;
  lines.push(
    `${ctx.projectName} exposes ${featureCount} user-facing features. This document traces each feature end-to-end from entry point through implementation.`,
  );
  lines.push('');

  // ── User-Facing Features ───────────────────────────────────────────────
  const userFacing = r3.features.filter((f) => f.userFacing);
  if (userFacing.length > 0) {
    lines.push('## User-Facing Features');
    lines.push('');
    lines.push(sectionIntro('Features that are directly accessible to end users.'));
    lines.push('');

    for (const feature of userFacing) {
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

      if (ctx.audience === 'ai') {
        lines.push(structuredBlock(ctx.audience, {
          feature: feature.name,
          userFacing: feature.userFacing,
          entryPoint: feature.entryPoint,
          modules: feature.modules,
          files: feature.files,
        }));
      }
    }
  }

  // ── Internal Features ──────────────────────────────────────────────────
  const internal = r3.features.filter((f) => !f.userFacing);
  if (internal.length > 0) {
    lines.push('## Internal Features');
    lines.push('');
    lines.push(sectionIntro('Features used internally by the system, not directly exposed to users.'));
    lines.push('');

    for (const feature of internal) {
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

      if (ctx.audience === 'ai') {
        lines.push(structuredBlock(ctx.audience, {
          feature: feature.name,
          userFacing: feature.userFacing,
          entryPoint: feature.entryPoint,
          modules: feature.modules,
          files: feature.files,
        }));
      }
    }
  }

  // ── Cross-Module Flows ─────────────────────────────────────────────────
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

  // ── Diagrams (at END per locked decision) ──────────────────────────────
  const diagram = buildFeatureFlowDiagram(ctx);
  if (diagram) {
    lines.push('## Diagrams');
    lines.push('');
    lines.push(diagram);
    lines.push('');
  }

  // ── Cross-references ───────────────────────────────────────────────────
  lines.push('## Related Documents');
  lines.push('');
  lines.push(`- ${crossRef('06-MODULES', undefined, 'Modules')}`);
  lines.push(`- ${crossRef('03-ARCHITECTURE', undefined, 'Architecture')}`);
  lines.push('');

  return lines.join('\n');
}
