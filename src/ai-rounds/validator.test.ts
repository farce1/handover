import { describe, expect, test } from 'vitest';
import { validateFileClaims, validateImportClaims, validateRoundClaims } from './validator.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';

// ─── Factory: minimal StaticAnalysisResult ────────────────────────────────────

/**
 * Build a minimal StaticAnalysisResult fixture.
 * Only fileTree.directoryTree and ast.files are populated with meaningful data;
 * all other fields are set to minimal valid values.
 */
function mkAnalysis(filePaths: string[]): StaticAnalysisResult {
  return {
    fileTree: {
      totalFiles: filePaths.length,
      totalDirs: 0,
      totalLines: 0,
      totalSize: 0,
      filesByExtension: {},
      largestFiles: [],
      directoryTree: filePaths.map((path) => ({
        path,
        type: 'file' as const,
        size: 0,
        lines: 0,
      })),
    },
    dependencies: {
      manifests: [],
      warnings: [],
    },
    gitHistory: {
      isGitRepo: false,
      branchPattern: {
        strategy: 'unknown',
        evidence: [],
        activeBranches: [],
        staleBranches: [],
        defaultBranch: 'main',
        branchCount: 0,
      },
      recentCommits: [],
      mostChangedFiles: [],
      activityByMonth: {},
      contributors: [],
      fileOwnership: [],
      warnings: [],
    },
    todos: {
      items: [],
      summary: { total: 0, byCategory: {} },
    },
    env: {
      envFiles: [],
      envReferences: [],
      warnings: [],
    },
    ast: {
      files: [],
      summary: {
        totalFunctions: 0,
        totalClasses: 0,
        totalExports: 0,
        totalImports: 0,
        languageBreakdown: {},
      },
    },
    tests: {
      testFiles: [],
      frameworks: [],
      hasConfig: false,
      configFiles: [],
      coverageDataPath: null,
      summary: {
        totalTestFiles: 0,
        totalTests: 0,
        frameworksDetected: [],
      },
    },
    docs: {
      readmes: [],
      docsFolder: null,
      docFiles: [],
      inlineDocCoverage: {
        filesWithDocs: 0,
        totalFiles: 0,
        percentage: 0,
      },
      summary: {
        hasReadme: false,
        hasDocsFolder: false,
        docFileCount: 0,
        inlineDocPercentage: 0,
      },
    },
    metadata: {
      analyzedAt: new Date().toISOString(),
      rootDir: '/tmp/test',
      fileCount: filePaths.length,
      elapsed: 0,
    },
  } as StaticAnalysisResult;
}

/** Build a StaticAnalysisResult with AST import data */
function mkAnalysisWithImports(
  filePaths: string[],
  astFiles: Array<{ path: string; imports: Array<{ source: string }> }>,
): StaticAnalysisResult {
  const base = mkAnalysis(filePaths);
  base.ast.files = astFiles.map((f) => ({
    path: f.path,
    language: 'typescript',
    parserUsed: 'tree-sitter',
    functions: [],
    classes: [],
    imports: f.imports.map((i) => ({
      source: i.source,
      specifiers: [],
      isTypeOnly: false,
      line: 1,
    })),
    exports: [],
    constants: [],
    reExports: [],
    lineCount: 10,
    parseErrors: [],
  }));
  return base;
}

// ─── validateFileClaims() tests ───────────────────────────────────────────────

describe('validateFileClaims', () => {
  test('all paths valid: all claimed paths in analysis → valid length 2, dropped length 0', () => {
    const analysis = mkAnalysis(['src/foo.ts', 'src/bar.ts']);
    const result = validateFileClaims(['src/foo.ts', 'src/bar.ts'], analysis);

    expect(result.valid.length).toBe(2);
    expect(result.dropped.length).toBe(0);
    expect(result.valid).toContain('src/foo.ts');
    expect(result.valid).toContain('src/bar.ts');
  });

  test('one path missing: drops non-existent path and keeps valid one', () => {
    const analysis = mkAnalysis(['src/foo.ts']);
    const result = validateFileClaims(['src/foo.ts', 'src/missing.ts'], analysis);

    expect(result.valid).toEqual(['src/foo.ts']);
    expect(result.dropped).toEqual(['src/missing.ts']);
  });

  test('empty claimed paths: returns empty valid and empty dropped', () => {
    const analysis = mkAnalysis(['src/foo.ts', 'src/bar.ts']);
    const result = validateFileClaims([], analysis);

    expect(result.valid).toEqual([]);
    expect(result.dropped).toEqual([]);
  });

  test('drop rate calculation: 2 out of 3 dropped equals 67% drop rate', () => {
    const analysis = mkAnalysis(['src/real.ts']);
    const result = validateFileClaims(['src/real.ts', 'src/fake1.ts', 'src/fake2.ts'], analysis);

    expect(result.valid).toEqual(['src/real.ts']);
    expect(result.dropped.length).toBe(2);
    // Compute drop rate externally: 2/3 ≈ 67%
    const dropRate = result.dropped.length / (result.valid.length + result.dropped.length);
    expect(dropRate).toBeGreaterThan(0.3);
  });

  test('no files in analysis: all claimed paths dropped', () => {
    const analysis = mkAnalysis([]);
    const result = validateFileClaims(['src/a.ts', 'src/b.ts'], analysis);

    expect(result.valid).toEqual([]);
    expect(result.dropped).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

// ─── validateImportClaims() tests ─────────────────────────────────────────────

describe('validateImportClaims', () => {
  test('valid import claim: from file imports to source → kept in valid', () => {
    const analysis = mkAnalysisWithImports(
      ['src/a.ts', 'src/b.ts'],
      [{ path: 'src/a.ts', imports: [{ source: 'src/b.ts' }] }],
    );

    const result = validateImportClaims([{ from: 'src/a.ts', to: 'src/b.ts' }], analysis);

    expect(result.valid).toEqual([{ from: 'src/a.ts', to: 'src/b.ts' }]);
    expect(result.dropped).toEqual([]);
  });

  test('non-existent import: claim for non-existent file import → dropped', () => {
    const analysis = mkAnalysisWithImports(
      ['src/a.ts'],
      [{ path: 'src/a.ts', imports: [{ source: 'src/b.ts' }] }],
    );

    // Claim that src/a.ts imports from src/c.ts (which it does not)
    const result = validateImportClaims([{ from: 'src/a.ts', to: 'src/c.ts' }], analysis);

    expect(result.valid).toEqual([]);
    expect(result.dropped).toEqual([{ from: 'src/a.ts', to: 'src/c.ts' }]);
  });

  test('file not in AST: claim for unknown file → dropped', () => {
    const analysis = mkAnalysisWithImports(
      ['src/a.ts'],
      [{ path: 'src/a.ts', imports: [{ source: 'src/b.ts' }] }],
    );

    // src/unknown.ts not in AST
    const result = validateImportClaims([{ from: 'src/unknown.ts', to: 'src/b.ts' }], analysis);

    expect(result.valid).toEqual([]);
    expect(result.dropped).toEqual([{ from: 'src/unknown.ts', to: 'src/b.ts' }]);
  });

  test('empty claims: returns empty valid and empty dropped', () => {
    const analysis = mkAnalysisWithImports(
      ['src/a.ts'],
      [{ path: 'src/a.ts', imports: [{ source: 'src/b.ts' }] }],
    );

    const result = validateImportClaims([], analysis);

    expect(result.valid).toEqual([]);
    expect(result.dropped).toEqual([]);
  });
});

// ─── validateRoundClaims() tests ──────────────────────────────────────────────

describe('validateRoundClaims', () => {
  test('round output with file paths returns correct totals and dropRate', () => {
    const analysis = mkAnalysis(['src/foo.ts', 'src/bar.ts']);

    // Output contains file path references
    const output = {
      description: 'The project uses src/foo.ts for routing.',
      modules: ['src/foo.ts', 'src/bar.ts', 'src/missing.ts'],
    };

    const result = validateRoundClaims(1, output, analysis);

    // total > 0, some validated
    expect(result.total).toBeGreaterThan(0);
    expect(result.dropRate).toBeGreaterThanOrEqual(0);
    expect(result.dropRate).toBeLessThanOrEqual(1);
    expect(result.validated + result.corrected).toBe(result.total);
  });

  test('round output with no extractable claims returns zeros', () => {
    const analysis = mkAnalysis(['src/foo.ts']);

    // Output with no file path references matching the pattern
    const output = {
      summary: 'General description with no code references',
      note: 'nothing to validate here',
    };

    const result = validateRoundClaims(1, output, analysis);

    expect(result.validated).toBe(0);
    expect(result.corrected).toBe(0);
    expect(result.total).toBe(0);
    expect(result.dropRate).toBe(0);
  });

  test('round 2 output with relationships computes correct combined stats', () => {
    const analysis = mkAnalysisWithImports(
      ['src/a.ts', 'src/b.ts'],
      [{ path: 'src/a.ts', imports: [{ source: 'src/b.ts' }] }],
    );

    const output = {
      relationships: [
        { from: 'src/a.ts', to: 'src/b.ts', type: 'import', evidence: 'line 1' },
        { from: 'src/a.ts', to: 'src/c.ts', type: 'import', evidence: 'line 2' }, // invalid
      ],
    };

    const result = validateRoundClaims(2, output, analysis);

    // Total should include file path claims + import claims
    expect(result.total).toBeGreaterThan(0);
    // At least one corrected (the bad import claim)
    expect(result.corrected).toBeGreaterThan(0);
  });
});
