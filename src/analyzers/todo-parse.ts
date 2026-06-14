import type { TodoItem } from './types.js';

/**
 * Pure TODO-marker parsing for a single file's content (no I/O).
 * Extracted from the filesystem-walking scanner so the detection rules are
 * unit-testable. Scans for TODO/FIXME/HACK/XXX/NOTE/WARN/DEPRECATED/REVIEW/
 * OPTIMIZE/TEMP markers with categorization and issue-reference extraction.
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
const MARKER_REGEX = new RegExp(`\\b(${ALL_MARKERS.join('|')})\\b[:\\s]\\s*(.*)`, 'i');

// Issue reference regex: #123 and JIRA-456 / GH-789 patterns
const ISSUE_REF_REGEX = /(?:#(\d+)|([A-Z]{2,}-\d+))/g;

/** Scan a single file's content for TODO markers. */
export function scanContentForTodos(content: string, filePath: string): TodoItem[] {
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
