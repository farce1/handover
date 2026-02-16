// ─── Language info type ──────────────────────────────────────────────────────

export interface LanguageInfo {
  langId: string;
  grammar: string;
  parser: 'tree-sitter' | 'regex';
}

// ─── Extension to language mapping ──────────────────────────────────────────

export const EXTENSION_MAP: Record<string, LanguageInfo> = {
  // Tree-sitter supported languages
  '.ts': { langId: 'typescript', grammar: 'typescript', parser: 'tree-sitter' },
  '.tsx': { langId: 'tsx', grammar: 'tsx', parser: 'tree-sitter' },
  '.js': { langId: 'javascript', grammar: 'javascript', parser: 'tree-sitter' },
  '.jsx': { langId: 'jsx', grammar: 'tsx', parser: 'tree-sitter' }, // TSX grammar handles JSX
  '.mts': { langId: 'typescript', grammar: 'typescript', parser: 'tree-sitter' },
  '.cts': { langId: 'typescript', grammar: 'typescript', parser: 'tree-sitter' },
  '.mjs': { langId: 'javascript', grammar: 'javascript', parser: 'tree-sitter' },
  '.cjs': { langId: 'javascript', grammar: 'javascript', parser: 'tree-sitter' },
  '.py': { langId: 'python', grammar: 'python', parser: 'tree-sitter' },
  '.pyi': { langId: 'python', grammar: 'python', parser: 'tree-sitter' },
  '.rs': { langId: 'rust', grammar: 'rust', parser: 'tree-sitter' },
  '.go': { langId: 'go', grammar: 'go', parser: 'tree-sitter' },

  // Regex fallback languages
  '.java': { langId: 'java', grammar: 'java', parser: 'regex' },
  '.kt': { langId: 'kotlin', grammar: 'kotlin', parser: 'regex' },
  '.kts': { langId: 'kotlin', grammar: 'kotlin', parser: 'regex' },
  '.scala': { langId: 'scala', grammar: 'scala', parser: 'regex' },
  '.rb': { langId: 'ruby', grammar: 'ruby', parser: 'regex' },
  '.php': { langId: 'php', grammar: 'php', parser: 'regex' },
  '.cs': { langId: 'csharp', grammar: 'csharp', parser: 'regex' },
  '.c': { langId: 'c', grammar: 'c', parser: 'regex' },
  '.h': { langId: 'c', grammar: 'c', parser: 'regex' },
  '.cpp': { langId: 'cpp', grammar: 'cpp', parser: 'regex' },
  '.hpp': { langId: 'cpp', grammar: 'cpp', parser: 'regex' },
  '.cc': { langId: 'cpp', grammar: 'cpp', parser: 'regex' },
  '.swift': { langId: 'swift', grammar: 'swift', parser: 'regex' },
  '.dart': { langId: 'dart', grammar: 'dart', parser: 'regex' },
  '.lua': { langId: 'lua', grammar: 'lua', parser: 'regex' },
  '.r': { langId: 'r', grammar: 'r', parser: 'regex' },
  '.R': { langId: 'r', grammar: 'r', parser: 'regex' },
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get language info for a file path based on its extension.
 * Handles the `.d.ts` special case before checking single extensions.
 */
export function getLanguageInfo(filePath: string): LanguageInfo | null {
  // Handle .d.ts before .ts — declaration files are still TypeScript
  if (filePath.endsWith('.d.ts')) {
    return EXTENSION_MAP['.ts']!;
  }

  // Extract extension from path
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return null;

  const ext = filePath.slice(lastDot);
  return EXTENSION_MAP[ext] ?? null;
}

/**
 * Check if a file is supported for parsing (tree-sitter or regex).
 */
export function isSupportedFile(filePath: string): boolean {
  return getLanguageInfo(filePath) !== null;
}
