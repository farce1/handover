import { stringify } from 'yaml';

// ─── structuredBlock ────────────────────────────────────────────────────────

/**
 * Build a machine-readable YAML block for AI audience mode.
 *
 * In AI mode: wraps data in HTML comments + YAML fenced code block.
 * These blocks are invisible in rendered markdown but parseable by RAG systems.
 *
 * In human mode: returns empty string (no visible output).
 */
export function structuredBlock(
  audience: 'human' | 'ai',
  data: Record<string, unknown>,
): string {
  if (audience !== 'ai') return '';

  const yamlContent = stringify(data).trimEnd();
  return `\n<!-- ai:structured -->\n\`\`\`yaml\n${yamlContent}\n\`\`\`\n<!-- /ai:structured -->\n`;
}
