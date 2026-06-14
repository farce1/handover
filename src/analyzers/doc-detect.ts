/**
 * Pure documentation-detection helpers (no I/O), extracted from the filesystem
 * doc analyzer so the README and inline-doc rules are unit-testable.
 */

const README_PATTERN = /^readme(\.(md|txt|rst|adoc))?$/i;

/** Inline documentation patterns by language family. */
const INLINE_DOC_PATTERNS: Array<{ extensions: string[]; pattern: RegExp }> = [
  // JS/TS: JSDoc blocks
  {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'],
    pattern: /\/\*\*[\s\S]*?\*\//,
  },
  // Python: docstrings
  {
    extensions: ['.py', '.pyi'],
    pattern: /(?:"""[\s\S]*?"""|'''[\s\S]*?''')/,
  },
  // Rust: rustdoc comments
  {
    extensions: ['.rs'],
    pattern: /(?:\/\/\/|\/\/!)/,
  },
];

/** True when the filename is a README (with or without a doc extension). */
export function isReadmeFile(filename: string): boolean {
  return README_PATTERN.test(filename);
}

/** True when a file's extension has an inline-doc convention worth sampling. */
export function isInlineDocCandidate(extension: string): boolean {
  return INLINE_DOC_PATTERNS.some((p) => p.extensions.includes(extension));
}

/** True when the content contains inline documentation for its language. */
export function hasInlineDoc(content: string, extension: string): boolean {
  return INLINE_DOC_PATTERNS.some(
    (p) => p.extensions.includes(extension) && p.pattern.test(content),
  );
}
