import type { Node as SyntaxNode } from 'web-tree-sitter';

// ─── Tree-sitter AST walking utilities ──────────────────────────────────────

/**
 * Walk the named children of a node using the cursor API for efficiency.
 * More efficient than iterating node.namedChildren for large ASTs.
 */
export function walkChildren(
  node: SyntaxNode,
  visitor: (child: SyntaxNode) => void,
): void {
  const cursor = node.walk();
  if (!cursor.gotoFirstChild()) return;

  do {
    if (cursor.currentNode.isNamed) {
      visitor(cursor.currentNode);
    }
  } while (cursor.gotoNextSibling());
}

/**
 * Find the first child node with a matching type string.
 * Returns null if no child matches.
 */
export function findChildByType(
  node: SyntaxNode,
  type: string,
): SyntaxNode | null {
  for (const child of node.namedChildren) {
    if (child.type === type) return child;
  }
  return null;
}

/**
 * Find all children with a matching type string.
 */
export function findChildrenByType(
  node: SyntaxNode,
  type: string,
): SyntaxNode[] {
  const results: SyntaxNode[] = [];
  for (const child of node.namedChildren) {
    if (child.type === type) results.push(child);
  }
  return results;
}

/**
 * Get a child node by field name with null safety.
 * Wrapper around SyntaxNode.childForFieldName().
 */
export function getFieldNode(
  node: SyntaxNode,
  fieldName: string,
): SyntaxNode | null {
  return node.childForFieldName(fieldName);
}

/**
 * Check if a node has any child of the given type.
 */
export function hasChildOfType(node: SyntaxNode, type: string): boolean {
  for (const child of node.namedChildren) {
    if (child.type === type) return true;
  }
  return false;
}
