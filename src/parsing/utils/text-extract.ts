import type { Node as SyntaxNode } from 'web-tree-sitter';

import { getNamedChildren } from './node-helpers.js';

// ─── Safe text extraction utilities ─────────────────────────────────────────

/**
 * Extract text from a syntax node using source string slicing.
 * More efficient than node.text for large nodes (avoids full subtree traversal).
 */
export function getText(node: SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex);
}

/**
 * Extract text from a syntax node and trim whitespace.
 */
export function getTextTrimmed(node: SyntaxNode, source: string): string {
  return getText(node, source).trim();
}

/**
 * Look for a docstring/comment immediately above the given node.
 *
 * Checks the previous named sibling. If it is a comment node,
 * extracts and cleans the text. Handles //, /*, /**, #, and /// styles.
 *
 * Returns undefined if no preceding comment is found.
 */
export function getDocstringAbove(node: SyntaxNode, source: string): string | undefined {
  const prev = node.previousNamedSibling;
  if (!prev) return undefined;

  // Check if the previous sibling is a comment
  if (!isCommentNode(prev)) return undefined;

  // Only consider comments immediately above (no blank lines between)
  if (prev.endPosition.row < node.startPosition.row - 1) return undefined;

  const raw = getText(prev, source);
  return stripCommentMarkers(raw);
}

/**
 * Extract decorator text strings from nodes surrounding the given node.
 *
 * Handles tree-sitter grammars where decorators appear as:
 * - Preceding sibling `decorator` nodes (TypeScript/JavaScript)
 * - Child `decorator` nodes within a parent `decorated_definition` (Python)
 * - Preceding `attribute_item` siblings (Rust)
 *
 * Returns full decorator text including arguments (e.g., "@app.route('/api')").
 */
export function getDecoratorTexts(node: SyntaxNode, source: string): string[] {
  const decorators: string[] = [];

  // Pattern 1: Parent is a decorated_definition (Python)
  const parent = node.parent;
  if (parent && parent.type === 'decorated_definition') {
    for (const child of getNamedChildren(parent)) {
      if (child.type === 'decorator') {
        decorators.push(getText(child, source));
      }
    }
    return decorators;
  }

  // Pattern 2: Preceding sibling decorators (TypeScript/JavaScript)
  // Walk backwards through previous siblings to collect decorators
  let sibling = node.previousNamedSibling;
  const collected: string[] = [];
  while (sibling) {
    if (sibling.type === 'decorator') {
      collected.push(getText(sibling, source));
    } else if (sibling.type === 'attribute_item' || sibling.type === 'attribute') {
      // Rust attributes (#[...])
      collected.push(getText(sibling, source));
    } else {
      break; // Stop at first non-decorator sibling
    }
    sibling = sibling.previousNamedSibling;
  }

  // Reverse to preserve source order (we walked backwards)
  return collected.reverse();
}

/**
 * Strip comment markers from raw comment text.
 *
 * Handles: line comments (//), doc comments (///),
 * block comments, JSDoc comments, Python hash comments (#),
 * and asterisk line prefixes in block comments.
 *
 * Returns cleaned, trimmed text.
 */
export function stripCommentMarkers(text: string): string {
  let cleaned = text;

  // Block comment: remove opening /** or /* and closing */
  if (cleaned.startsWith('/**')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('/*')) {
    cleaned = cleaned.slice(2);
  }
  if (cleaned.endsWith('*/')) {
    cleaned = cleaned.slice(0, -2);
  }

  // Split into lines for per-line processing
  const lines = cleaned.split('\n').map((line) => {
    let trimmed = line.trim();

    // Remove leading * from block comment lines
    if (trimmed.startsWith('* ')) {
      trimmed = trimmed.slice(2);
    } else if (trimmed === '*') {
      trimmed = '';
    }

    // Remove /// (Rust doc comments)
    if (trimmed.startsWith('///')) {
      trimmed = trimmed.slice(3);
      if (trimmed.startsWith(' ')) trimmed = trimmed.slice(1);
    }
    // Remove // (line comments)
    else if (trimmed.startsWith('//')) {
      trimmed = trimmed.slice(2);
      if (trimmed.startsWith(' ')) trimmed = trimmed.slice(1);
    }

    // Remove # (Python comments)
    if (trimmed.startsWith('#')) {
      trimmed = trimmed.slice(1);
      if (trimmed.startsWith(' ')) trimmed = trimmed.slice(1);
    }

    return trimmed;
  });

  // Join and trim
  const result = lines.join('\n').trim();
  return result;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Check if a node is a comment type across different grammars.
 */
function isCommentNode(node: SyntaxNode): boolean {
  return (
    node.type === 'comment' ||
    node.type === 'line_comment' ||
    node.type === 'block_comment' ||
    node.type === 'doc_comment'
  );
}
