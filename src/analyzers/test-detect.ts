/**
 * Pure test-framework detection (no I/O), extracted from the filesystem test
 * analyzer so the per-framework rules are unit-testable. Patterns match the
 * relative file path (not just the basename) so directory-scoped conventions
 * like Rust's tests/ and Python test files in subpackages are detected.
 */

interface FrameworkPattern {
  filePatterns: RegExp[];
  configFiles: string[];
  testPatterns: RegExp[];
}

export const FRAMEWORK_PATTERNS: Record<string, FrameworkPattern> = {
  vitest: {
    filePatterns: [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/],
    configFiles: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts'],
    testPatterns: [/\b(?:it|test|describe)\s*\(/g],
  },
  jest: {
    filePatterns: [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/],
    configFiles: ['jest.config.ts', 'jest.config.js', 'jest.config.mjs'],
    testPatterns: [/\b(?:it|test|describe)\s*\(/g],
  },
  mocha: {
    filePatterns: [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/],
    configFiles: ['.mocharc.yml', '.mocharc.json', '.mocharc.js'],
    testPatterns: [/\b(?:it|describe)\s*\(/g],
  },
  pytest: {
    // (^|/) so test files in subpackages match, not only at the project root.
    filePatterns: [/(?:^|\/)test_[^/]*\.py$/, /_test\.py$/],
    configFiles: ['pytest.ini', 'pyproject.toml', 'setup.cfg'],
    testPatterns: [/\bdef\s+test_/g],
  },
  go_test: {
    filePatterns: [/_test\.go$/],
    configFiles: [],
    testPatterns: [/\bfunc\s+Test[A-Z]/g],
  },
  rust_test: {
    // (^|/) so only a real `tests/` segment matches, not e.g. `contests/`.
    filePatterns: [/(?:^|\/)tests\/.*\.rs$/],
    configFiles: [],
    testPatterns: [/#\[test\]/g, /#\[cfg\(test\)\]/g],
  },
};

/** First framework whose file patterns match the relative path, or null. */
export function detectFrameworkForFile(filePath: string): string | null {
  for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (patterns.filePatterns.some((re) => re.test(filePath))) {
      return framework;
    }
  }
  return null;
}

/** Count test declarations in a file's content for the given framework. */
export function countTestsInContent(content: string, framework: string): number {
  const patterns = FRAMEWORK_PATTERNS[framework]?.testPatterns ?? [];
  let count = 0;
  for (const pattern of patterns) {
    pattern.lastIndex = 0; // reused global regexes
    count += content.match(pattern)?.length ?? 0;
  }
  return count;
}
