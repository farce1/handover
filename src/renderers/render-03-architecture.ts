import type { RenderContext } from './types.js';
import { codeRef, buildTable, sectionIntro } from './utils.js';
import { buildArchitectureDiagram } from './mermaid.js';
import { renderDocument, collectRoundsUsed, pushStructuredBlock } from './render-template.js';

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

  const roundsUsed = collectRoundsUsed(ctx, 1, 2, 3, 4);

  return renderDocument(ctx, {
    title: '03 - Architecture',
    documentId: '03-architecture',
    category: 'architecture',
    aiRoundsUsed: roundsUsed,
    status: 'complete',
    relatedDocs: [
      { docId: '06-MODULES', label: 'Modules' },
      { docId: '05-FEATURES', label: 'Features' },
      { docId: '04-FILE-STRUCTURE', label: 'File Structure' },
    ],
    renderBody: (lines) => {
      // 2-sentence summary (DOC-17)
      const patternNames = r4.patterns.map((p) => p.name).slice(0, 3).join(', ') || 'undetermined';
      lines.push(
        `${ctx.projectName} follows a ${patternNames} architecture. This document maps patterns, layers, and data flows with concrete code evidence.`,
      );
      lines.push('');

      // ── Architecture Patterns ───────────────────────────────────────
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

          pushStructuredBlock(lines, ctx, {
            pattern: pattern.name,
            confidence: pattern.confidence,
            modules: pattern.modules,
            evidence: pattern.evidence,
            description: pattern.description,
          });
        }
      }

      // ── System Layering ─────────────────────────────────────────────
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

      // ── Data Flow ───────────────────────────────────────────────────
      if (r4.dataFlow.length > 0) {
        lines.push('## Data Flow');
        lines.push('');
        for (const flow of r4.dataFlow) {
          lines.push(`- **${flow.from}** -> **${flow.to}**: ${flow.data} (${flow.mechanism})`);
        }
        lines.push('');
      }

      // ── Key Findings ────────────────────────────────────────────────
      if (r4.findings.length > 0) {
        lines.push('## Key Findings');
        lines.push('');
        for (const finding of r4.findings) {
          lines.push(`- ${finding}`);
        }
        lines.push('');
      }

      // ── Diagrams ────────────────────────────────────────────────────
      const diagram = buildArchitectureDiagram(ctx);
      if (diagram) {
        lines.push('## Diagrams');
        lines.push('');
        lines.push(diagram);
        lines.push('');
      }
    },
  });
}
