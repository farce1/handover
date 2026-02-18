import type { DocumentStatus, RenderContext } from './types.js';
import { buildFrontMatter, buildTable } from './utils.js';
import { structuredBlock } from './audience.js';

// ─── renderIndex ───────────────────────────────────────────────────────────

/**
 * Render the master INDEX document (00-INDEX.md).
 *
 * Unlike other renderers, INDEX takes an extra `statuses` parameter containing
 * the generation status of every other document. It produces a table linking
 * to each document with its status indicator.
 */
export function renderIndex(ctx: RenderContext, statuses: DocumentStatus[]): string {
  const lines: string[] = [];

  // ── YAML front-matter ──────────────────────────────────────────────────
  const generatedCount = statuses.filter((s) => s.status !== 'not-generated').length;
  const roundsUsed = new Set<number>();
  for (const [key, val] of Object.entries(ctx.rounds)) {
    if (val != null) {
      const roundNum = parseInt(key.replace('r', ''), 10);
      roundsUsed.add(roundNum);
    }
  }

  lines.push(
    buildFrontMatter({
      title: 'Handover Knowledge Base',
      document_id: '00-index',
      category: 'index',
      project: ctx.projectName,
      generated_at: ctx.generatedAt,
      handover_version: '0.1.0',
      audience: ctx.audience,
      ai_rounds_used: [...roundsUsed].sort(),
      status: 'complete',
    }),
  );

  // ── Title ──────────────────────────────────────────────────────────────
  lines.push('# Handover Knowledge Base');
  lines.push('');

  // ── 2-sentence summary (DOC-17) ───────────────────────────────────────
  const totalDocs = statuses.length;
  lines.push(
    `${ctx.projectName} knowledge base generated on ${ctx.generatedAt}. This index links to all ${totalDocs} documents covering architecture, features, modules, dependencies, and more.`,
  );
  lines.push('');

  // ── Documents table ───────────────────────────────────────────────────
  lines.push('## Documents');
  lines.push('');

  const statusLabel = (s: DocumentStatus['status']): string => {
    switch (s) {
      case 'complete':
        return 'Complete';
      case 'partial':
        return 'Partial (static analysis only)';
      case 'static-only':
        return 'Static Only';
      case 'not-generated':
        return 'Not Generated';
    }
  };

  const rows = statuses.map((s, i) => {
    const num = String(i).padStart(2, '0');
    const docLink = s.status !== 'not-generated' ? `[${s.title}](${s.filename})` : s.title;
    return [num, docLink, statusLabel(s.status)];
  });

  lines.push(buildTable(['#', 'Document', 'Status'], rows));
  lines.push('');

  // ── Generation Details ────────────────────────────────────────────────
  lines.push('## Generation Details');
  lines.push('');
  lines.push(`- **Audience mode:** ${ctx.audience}`);
  lines.push(
    `- **AI rounds used:** ${roundsUsed.size > 0 ? [...roundsUsed].sort().join(', ') : 'none (static only)'}`,
  );
  lines.push(`- **Generation timestamp:** ${ctx.generatedAt}`);
  lines.push(`- **Handover version:** 0.1.0`);
  lines.push('');

  // ── AI structured block ───────────────────────────────────────────────
  const aiBlock = structuredBlock(ctx.audience, {
    document_count: totalDocs,
    generated_count: generatedCount,
    statuses: statuses.map((s) => ({
      id: s.id,
      filename: s.filename,
      status: s.status,
      reason: s.reason,
    })),
  });
  if (aiBlock) {
    lines.push(aiBlock);
  }

  return lines.join('\n');
}
