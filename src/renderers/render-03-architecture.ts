import type { RenderContext } from './types.js';
import { buildFrontMatter, crossRef, codeRef, buildTable, sectionIntro } from './utils.js';
import { buildArchitectureDiagram } from './mermaid.js';
import { structuredBlock } from './audience.js';

// ─── renderArchitecture ────────────────────────────────────────────────────

/**
 * Render 03-ARCHITECTURE.md from Round 4 (Architecture Detection) data.
 *
 * Primary data: R4 (architecture patterns, layering, data flow).
 * If no R4 data: return empty string (architecture cannot be meaningfully
 * determined from static analysis alone).
 */
export function renderArchitecture(ctx: RenderContext): string {
  const r4 = ctx.rounds.r4?.data;
  if (!r4) return '';

  const lines: string[] = [];

  // Determine status based on available data
  const roundsUsed = [4];
  if (ctx.rounds.r1) roundsUsed.push(1);
  if (ctx.rounds.r2) roundsUsed.push(2);
  if (ctx.rounds.r3) roundsUsed.push(3);

  // YAML front-matter
  lines.push(buildFrontMatter({
    title: '03 - Architecture',
    document_id: '03-architecture',
    category: 'architecture',
    project: ctx.projectName,
    generated_at: ctx.generatedAt,
    handover_version: '0.1.0',
    audience: ctx.audience,
    ai_rounds_used: roundsUsed.sort(),
    status: 'complete',
  }));

  // Title
  lines.push('# Architecture');
  lines.push('');

  // 2-sentence summary (DOC-17)
  const patternNames = r4.patterns.map((p) => p.name).slice(0, 3).join(', ') || 'undetermined';
  lines.push(
    `${ctx.projectName} follows a ${patternNames} architecture. This document maps patterns, layers, and data flows with concrete code evidence.`,
  );
  lines.push('');

  // ── Architecture Patterns ──────────────────────────────────────────────
  if (r4.patterns.length > 0) {
    lines.push('## Architecture Patterns');
    lines.push('');
    lines.push(sectionIntro('These are the dominant architecture patterns identified in the codebase.'));
    lines.push('');

    for (const pattern of r4.patterns) {
      lines.push(`### ${pattern.name}`);
      lines.push('');
      lines.push(pattern.description);
      lines.push('');
      lines.push(`**Confidence:** ${pattern.confidence}`);
      lines.push('');

      if (pattern.evidence.length > 0) {
        lines.push('**Evidence:**');
        lines.push('');
        for (const ev of pattern.evidence) {
          lines.push(`- ${codeRef(ev)}`);
        }
        lines.push('');
      }

      if (pattern.modules.length > 0) {
        lines.push(`**Modules involved:** ${pattern.modules.join(', ')}`);
        lines.push('');
      }

      // AI audience: structured block per pattern
      if (ctx.audience === 'ai') {
        lines.push(structuredBlock(ctx.audience, {
          pattern: pattern.name,
          confidence: pattern.confidence,
          modules: pattern.modules,
          evidence: pattern.evidence,
          description: pattern.description,
        }));
      }
    }
  }

  // ── System Layering ────────────────────────────────────────────────────
  lines.push('## System Layering');
  lines.push('');

  if (r4.layering?.layers.length) {
    lines.push(buildTable(
      ['Layer', 'Modules', 'Responsibility'],
      r4.layering.layers.map((layer) => [
        layer.name,
        layer.modules.join(', '),
        layer.responsibility,
      ]),
    ));
    lines.push('');
  } else {
    lines.push('No clear layering detected.');
    lines.push('');
  }

  // ── Data Flow ──────────────────────────────────────────────────────────
  if (r4.dataFlow.length > 0) {
    lines.push('## Data Flow');
    lines.push('');

    for (const flow of r4.dataFlow) {
      lines.push(`- **${flow.from}** -> **${flow.to}**: ${flow.data} (${flow.mechanism})`);
    }
    lines.push('');
  }

  // ── Key Findings ───────────────────────────────────────────────────────
  if (r4.findings.length > 0) {
    lines.push('## Key Findings');
    lines.push('');
    for (const finding of r4.findings) {
      lines.push(`- ${finding}`);
    }
    lines.push('');
  }

  // ── Diagrams (at END per locked decision) ──────────────────────────────
  const diagram = buildArchitectureDiagram(ctx);
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
  lines.push(`- ${crossRef('05-FEATURES', undefined, 'Features')}`);
  lines.push(`- ${crossRef('04-FILE-STRUCTURE', undefined, 'File Structure')}`);
  lines.push('');

  return lines.join('\n');
}
