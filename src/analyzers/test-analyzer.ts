import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AnalysisContext, AnalyzerResult, TestResult } from './types.js';

// ─── Framework detection patterns ───────────────────────────────────────────

interface FrameworkPattern {
  filePatterns: RegExp[];
  configFiles: string[];
  testPatterns: RegExp[];
}

const FRAMEWORK_PATTERNS: Record<string, FrameworkPattern> = {
  vitest: {
    filePatterns: [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/],
    configFiles: [
      'vitest.config.ts',
      'vitest.config.js',
      'vitest.config.mts',
    ],
    testPatterns: [/\b(?:it|test|describe)\s*\(/g],
  },
  jest: {
    filePatterns: [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/],
    configFiles: [
      'jest.config.ts',
      'jest.config.js',
      'jest.config.mjs',
    ],
    testPatterns: [/\b(?:it|test|describe)\s*\(/g],
  },
  mocha: {
    filePatterns: [/\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/],
    configFiles: ['.mocharc.yml', '.mocharc.json', '.mocharc.js'],
    testPatterns: [/\b(?:it|describe)\s*\(/g],
  },
  pytest: {
    filePatterns: [/^test_.*\.py$/, /.*_test\.py$/],
    configFiles: ['pytest.ini', 'pyproject.toml', 'setup.cfg'],
    testPatterns: [/\bdef\s+test_/g],
  },
  go_test: {
    filePatterns: [/_test\.go$/],
    configFiles: [],
    testPatterns: [/\bfunc\s+Test[A-Z]/g],
  },
  rust_test: {
    filePatterns: [/tests\/.*\.rs$/],
    configFiles: [],
    testPatterns: [/#\[test\]/g, /#\[cfg\(test\)\]/g],
  },
};

// ─── Main analyzer ──────────────────────────────────────────────────────────

/**
 * Test analyzer (STAT-07).
 *
 * Identifies test files, detects test frameworks, and estimates test counts
 * by pattern matching across six framework patterns: vitest, jest, mocha,
 * pytest, go_test, and rust_test.
 */
export async function analyzeTests(
  ctx: AnalysisContext,
): Promise<AnalyzerResult<TestResult>> {
  const start = performance.now();

  try {
    const testFiles: Array<{
      path: string;
      framework: string;
      testCount: number;
    }> = [];
    const detectedFrameworks = new Set<string>();
    const configFiles: string[] = [];
    let coverageDataPath: string | null = null;

    // ── Identify test files ───────────────────────────────────────────────

    for (const file of ctx.files) {
      const fileName = basename(file.path);

      for (const [framework, patterns] of Object.entries(
        FRAMEWORK_PATTERNS,
      )) {
        const isTestFile = patterns.filePatterns.some((re) =>
          re.test(fileName),
        );
        if (isTestFile) {
          testFiles.push({
            path: file.path,
            framework,
            testCount: 0, // Will be filled by content scanning
          });
          detectedFrameworks.add(framework);
          break; // Only match first framework to avoid duplicates
        }
      }
    }

    // ── Detect frameworks via config files ──────────────────────────────

    const allFileNames = new Set(ctx.files.map((f) => basename(f.path)));
    const allFilePaths = new Set(ctx.files.map((f) => f.path));

    for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
      for (const configFile of patterns.configFiles) {
        if (allFileNames.has(configFile)) {
          detectedFrameworks.add(framework);
          // Find the full path of the config file
          const match = ctx.files.find(
            (f) => basename(f.path) === configFile,
          );
          if (match) {
            configFiles.push(match.path);
          }
        }
      }
    }

    // Check package.json devDependencies for JS test frameworks
    const packageJsonFile = ctx.files.find(
      (f) => f.path === 'package.json',
    );
    if (packageJsonFile) {
      try {
        const content = await readFile(
          packageJsonFile.absolutePath,
          'utf-8',
        );
        const pkg = JSON.parse(content) as Record<string, unknown>;
        const devDeps = (pkg.devDependencies ?? {}) as Record<
          string,
          string
        >;
        const allDeps = {
          ...((pkg.dependencies ?? {}) as Record<string, string>),
          ...devDeps,
        };
        if ('vitest' in allDeps) detectedFrameworks.add('vitest');
        if ('jest' in allDeps) detectedFrameworks.add('jest');
        if ('mocha' in allDeps) detectedFrameworks.add('mocha');
      } catch {
        // Invalid package.json -- non-critical
      }
    }

    // ── Count tests in test files ──────────────────────────────────────

    for (const testFile of testFiles) {
      try {
        const file = ctx.files.find((f) => f.path === testFile.path);
        if (!file) continue;

        const content = await readFile(file.absolutePath, 'utf-8');
        const patterns =
          FRAMEWORK_PATTERNS[testFile.framework]?.testPatterns ?? [];
        let count = 0;
        for (const pattern of patterns) {
          // Reset lastIndex for each file since we reuse global regexes
          pattern.lastIndex = 0;
          const matches = content.match(pattern);
          count += matches?.length ?? 0;
        }
        testFile.testCount = count;
      } catch {
        // File read failure -- non-critical, leave count at 0
      }
    }

    // ── Look for coverage data ──────────────────────────────────────────

    const coverageFiles = ['coverage/lcov.info', 'coverage/coverage-summary.json'];
    for (const coverageFile of coverageFiles) {
      if (allFilePaths.has(coverageFile)) {
        coverageDataPath = coverageFile;
        break;
      }
    }

    // ── Build summary ────────────────────────────────────────────────────

    const totalTestFiles = testFiles.length;
    const totalTests = testFiles.reduce((sum, f) => sum + f.testCount, 0);
    const frameworksDetected = [...detectedFrameworks].sort();

    return {
      success: true,
      data: {
        testFiles,
        frameworks: frameworksDetected,
        hasConfig: configFiles.length > 0,
        configFiles,
        coverageDataPath,
        summary: {
          totalTestFiles,
          totalTests,
          frameworksDetected,
        },
      },
      elapsed: performance.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      elapsed: performance.now() - start,
    };
  }
}
