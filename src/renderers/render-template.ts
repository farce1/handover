import type { RenderContext } from './types.js';
import { buildFrontMatter, crossRef } from './utils.js';
import { structuredBlock } from './audience.js';

// ─── RenderDocumentOptions ─────────────────────────────────────────────────

export interface RenderDocumentOptions {
  title: string;
  heading?: string;
  documentId: string;
  category: string;
  aiRoundsUsed: number[];
  status: 'complete' | 'partial' | 'static-only';
  relatedDocs: Array<{ docId: string; label: string }>;
  renderBody: (lines: string[]) => void;
}

// ─── renderDocument ────────────────────────────────────────────────────────

/**
 * Shared document rendering scaffold.
 * Handles front-matter, title heading, body callback, and Related Documents.
 */
export function renderDocument(ctx: RenderContext, options: RenderDocumentOptions): string {
  const lines: string[] = [];

  // YAML front-matter
  lines.push(buildFrontMatter({
    title: options.title,
    document_id: options.documentId,
    category: options.category,
    project: ctx.projectName,
    generated_at: ctx.generatedAt,
    handover_version: '0.1.0',
    audience: ctx.audience,
    ai_rounds_used: options.aiRoundsUsed,
    status: options.status,
  }));

  // Title heading (strip number prefix from title if no explicit heading)
  const heading = options.heading ?? options.title.replace(/^\d+\s*-\s*/, '');
  lines.push(`# ${heading}`);
  lines.push('');

  // Body content
  options.renderBody(lines);

  // Related Documents section
  if (options.relatedDocs.length > 0) {
    lines.push('## Related Documents');
    lines.push('');
    for (const doc of options.relatedDocs) {
      lines.push(`- ${crossRef(doc.docId, undefined, doc.label)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── collectRoundsUsed ─────────────────────────────────────────────────────

/**
 * Collect which AI rounds contributed data, checking the RenderContext.
 * Returns a sorted array of round numbers that have data.
 */
export function collectRoundsUsed(ctx: RenderContext, ...roundNumbers: number[]): number[] {
  const used: number[] = [];
  const roundKeys: Record<number, keyof RenderContext['rounds']> = {
    1: 'r1', 2: 'r2', 3: 'r3', 4: 'r4', 5: 'r5', 6: 'r6',
  };
  for (const n of roundNumbers) {
    const key = roundKeys[n];
    if (key && ctx.rounds[key]) used.push(n);
  }
  return used.sort((a, b) => a - b);
}

// ─── pushStructuredBlock ───────────────────────────────────────────────────

/**
 * Conditionally push a structured YAML block for AI audience mode.
 */
export function pushStructuredBlock(
  lines: string[],
  ctx: RenderContext,
  data: Record<string, unknown>,
): void {
  const block = structuredBlock(ctx.audience, data);
  if (block) {
    lines.push(block);
  }
}
