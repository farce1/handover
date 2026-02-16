import { readFile } from 'node:fs/promises';
import { isBinaryFile } from './file-discovery.js';
import type { AnalysisContext, AnalyzerResult, TodoItem, TodoResult } from './types.js';

/**
 * STAT-04: TodoScanner Analyzer
 *
 * Scans source files for TODO/FIXME/HACK/XXX/NOTE/WARN/DEPRECATED/REVIEW/
 * OPTIMIZE/TEMP markers with categorization and issue reference extraction.
 */

// Category mapping per LOCKED user decision
const CATEGORY_MAP: Record<string, TodoItem['category']> = {
  FIXME: 'bugs',
  HACK: 'bugs',
  XXX: 'bugs',
  TODO: 'tasks',
  NOTE: 'notes',
  WARN: 'notes',
  DEPRECATED: 'debt',
  TEMP: 'debt',
  OPTIMIZE: 'optimization',
  REVIEW: 'optimization',
};

// Build marker regex from CATEGORY_MAP keys
const ALL_MARKERS = Object.keys(CATEGORY_MAP);
const MARKER_REGEX = new RegExp(
  `\\b(${ALL_MARKERS.join('|')})\\b[:\\s]\\s*(.*)`,
  'i',
);

// Issue reference regex: #123 and JIRA-456 / GH-789 patterns
const ISSUE_REF_REGEX = /(?:#(\d+)|([A-Z]{2,}-\d+))/g;

export async function scanTodos(
  ctx: AnalysisContext,
): Promise<AnalyzerResult<TodoResult>> {
  const start = Date.now();

  try {
    const items: TodoItem[] = [];

    // Filter to non-binary files only
    const textFiles = ctx.files.filter((f) => !isBinaryFile(f.extension));

    // Process files in batches of 50 for memory efficiency
    for (let i = 0; i < textFiles.length; i += 50) {
      const batch = textFiles.slice(i, i + 50);
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const content = await readFile(file.absolutePath, 'utf-8');
            return scanFileForTodos(content, file.path);
          } catch {
            return [];
          }
        }),
      );
      for (const fileItems of batchResults) {
        items.push(...fileItems);
      }
    }

    // Build summary
    const byCategory: Record<string, number> = {};
    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    }

    const elapsed = Date.now() - start;
    return {
      success: true,
      data: {
        items,
        summary: {
          total: items.length,
          byCategory,
        },
      },
      elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      elapsed,
    };
  }
}

/**
 * Scan a single file's content for TODO markers.
 */
function scanFileForTodos(content: string, filePath: string): TodoItem[] {
  const fileItems: TodoItem[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = MARKER_REGEX.exec(lines[i]);
    if (!match) continue;

    const marker = match[1].toUpperCase();
    const text = match[2].trim();

    // Extract issue references from the full line
    const issueRefs: string[] = [];
    let refMatch: RegExpExecArray | null;
    // Reset lastIndex for global regex
    ISSUE_REF_REGEX.lastIndex = 0;
    while ((refMatch = ISSUE_REF_REGEX.exec(lines[i])) !== null) {
      // Capture either #123 or JIRA-456
      issueRefs.push(refMatch[1] ? `#${refMatch[1]}` : refMatch[2]);
    }

    fileItems.push({
      marker,
      category: CATEGORY_MAP[marker] ?? 'tasks',
      text,
      file: filePath,
      line: i + 1,
      issueRefs,
    });
  }

  return fileItems;
}
