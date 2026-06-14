import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AnalysisContext, AnalyzerResult, TestResult } from './types.js';
import { logger } from '../utils/logger.js';
import { FRAMEWORK_PATTERNS, detectFrameworkForFile, countTestsInContent } from './test-detect.js';

// ─── Main analyzer ──────────────────────────────────────────────────────────

/**
 * Test analyzer (STAT-07).
 *
 * Identifies test files, detects test frameworks, and estimates test counts
 * using the pure detectors in test-detect.ts across six framework patterns:
 * vitest, jest, mocha, pytest, go_test, and rust_test.
 */
export async function analyzeTests(ctx: AnalysisContext): Promise<AnalyzerResult<TestResult>> {
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
      const framework = detectFrameworkForFile(file.path);
      if (framework) {
        testFiles.push({ path: file.path, framework, testCount: 0 });
        detectedFrameworks.add(framework);
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
          const match = ctx.files.find((f) => basename(f.path) === configFile);
          if (match) {
            configFiles.push(match.path);
          }
        }
      }
    }

    // Check package.json devDependencies for JS test frameworks
    const packageJsonFile = ctx.files.find((f) => f.path === 'package.json');
    if (packageJsonFile) {
      try {
        const content = await readFile(packageJsonFile.absolutePath, 'utf-8');
        const pkg = JSON.parse(content) as Record<string, unknown>;
        const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
        const allDeps = {
          ...((pkg.dependencies ?? {}) as Record<string, string>),
          ...devDeps,
        };
        if ('vitest' in allDeps) detectedFrameworks.add('vitest');
        if ('jest' in allDeps) detectedFrameworks.add('jest');
        if ('mocha' in allDeps) detectedFrameworks.add('mocha');
      } catch (err) {
        logger.debug(
          `Failed to parse package.json: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── Count tests in test files ──────────────────────────────────────

    for (const testFile of testFiles) {
      try {
        const file = ctx.files.find((f) => f.path === testFile.path);
        if (!file) continue;

        const content = await readFile(file.absolutePath, 'utf-8');
        testFile.testCount = countTestsInContent(content, testFile.framework);
      } catch (err) {
        logger.debug(
          `Failed to read test file ${testFile.path}: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Leave count at 0 -- non-critical
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
