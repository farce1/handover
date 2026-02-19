import { describe, expect, test } from 'vitest';
import {
  scoreFiles,
  SCORE_ENTRY_POINT,
  SCORE_IMPORT_PER_IMPORTER,
  SCORE_IMPORT_CAP,
  SCORE_EXPORT_PER_EXPORT,
  SCORE_EXPORT_CAP,
  SCORE_GIT_ACTIVITY_CAP,
  SCORE_EDGE_CASES,
  SCORE_CONFIG_FILE,
  SCORE_TEST_PENALTY,
  SCORE_MIN,
  SCORE_MAX,
} from './scorer.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';

// ─── Mock factory ────────────────────────────────────────────────────────────

interface MockFile {
  path: string;
  type: 'file' | 'directory';
}

interface MockGitFile {
  path: string;
  changes: number;
}

interface MockTodoItem {
  file: string;
}

interface MockASTFile {
  path: string;
  imports: Array<{ source: string }>;
  exports: Array<{ name: string }>;
}

interface MockAnalysisOptions {
  files?: MockFile[];
  gitChangedFiles?: MockGitFile[];
  todoItems?: MockTodoItem[];
  astFiles?: MockASTFile[];
}

function buildMockAnalysis(opts: MockAnalysisOptions = {}): StaticAnalysisResult {
  const { files = [], gitChangedFiles = [], todoItems = [], astFiles = [] } = opts;

  return {
    fileTree: {
      totalFiles: files.filter((f) => f.type === 'file').length,
      totalDirs: files.filter((f) => f.type === 'directory').length,
      totalLines: 0,
      totalSize: 0,
      filesByExtension: {},
      largestFiles: [],
      directoryTree: files.map((f) => ({
        path: f.path,
        type: f.type,
        size: f.type === 'file' ? 100 : undefined,
        lines: f.type === 'file' ? 10 : undefined,
        children: f.type === 'directory' ? 0 : undefined,
      })),
    },
    dependencies: {
      manifests: [],
      warnings: [],
    },
    gitHistory: {
      isGitRepo: true,
      branchPattern: {
        strategy: 'trunk-based',
        evidence: [],
        activeBranches: [],
        staleBranches: [],
        defaultBranch: 'main',
        branchCount: 1,
      },
      recentCommits: [],
      mostChangedFiles: gitChangedFiles.map((f) => ({ path: f.path, changes: f.changes })),
      activityByMonth: {},
      contributors: [],
      fileOwnership: [],
      warnings: [],
    },
    todos: {
      items: todoItems.map((item) => ({
        marker: 'TODO',
        category: 'tasks' as const,
        text: 'placeholder',
        file: item.file,
        line: 1,
        issueRefs: [],
      })),
      summary: {
        total: todoItems.length,
        byCategory: {},
      },
    },
    env: {
      envFiles: [],
      envReferences: [],
      warnings: [],
    },
    ast: {
      files: astFiles.map((f) => ({
        path: f.path,
        language: 'typescript',
        parserUsed: 'tree-sitter' as const,
        functions: [],
        classes: [],
        imports: f.imports.map((imp, idx) => ({
          source: imp.source,
          specifiers: [],
          isTypeOnly: false,
          line: idx + 1,
        })),
        exports: f.exports.map((exp, idx) => ({
          name: exp.name,
          kind: 'variable' as const,
          isReExport: false,
          isTypeOnly: false,
          line: idx + 1,
        })),
        constants: [],
        reExports: [],
        lineCount: 10,
        parseErrors: [],
      })),
      summary: {
        totalFunctions: 0,
        totalClasses: 0,
        totalExports: astFiles.reduce((acc, f) => acc + f.exports.length, 0),
        totalImports: astFiles.reduce((acc, f) => acc + f.imports.length, 0),
        languageBreakdown: { typescript: astFiles.length },
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
      rootDir: '/project',
      fileCount: files.filter((f) => f.type === 'file').length,
      elapsed: 0,
    },
  } as unknown as StaticAnalysisResult;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('scoreFiles()', () => {
  test('empty input returns empty array', () => {
    const result = scoreFiles(buildMockAnalysis({ files: [] }));
    expect(result).toEqual([]);
  });

  test.each([['package-lock.json'], ['yarn.lock'], ['pnpm-lock.yaml']])(
    'excludes lock file: %s',
    (lockFile) => {
      const result = scoreFiles(
        buildMockAnalysis({
          files: [{ path: lockFile, type: 'file' }],
        }),
      );
      expect(result).toHaveLength(0);
    },
  );

  test.each([
    ['index.ts', SCORE_ENTRY_POINT],
    ['main.js', SCORE_ENTRY_POINT],
    ['src/index.ts', SCORE_ENTRY_POINT],
    ['utils.ts', 0],
  ])('entry point detection: %s gets entryPoint=%i', (filePath, expectedBonus) => {
    const result = scoreFiles(
      buildMockAnalysis({
        files: [{ path: filePath, type: 'file' }],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].breakdown.entryPoint).toBe(expectedBonus);
  });

  test('import count scoring: 5 importers gives 5 * SCORE_IMPORT_PER_IMPORTER', () => {
    const target = 'src/utils.ts';
    // 5 distinct files each importing target
    const astFiles = [
      { path: 'src/a.ts', imports: [{ source: './utils' }], exports: [] },
      { path: 'src/b.ts', imports: [{ source: './utils' }], exports: [] },
      { path: 'src/c.ts', imports: [{ source: './utils' }], exports: [] },
      { path: 'src/d.ts', imports: [{ source: './utils' }], exports: [] },
      { path: 'src/e.ts', imports: [{ source: './utils' }], exports: [] },
      { path: target, imports: [], exports: [] },
    ];
    const files = astFiles.map((f) => ({ path: f.path, type: 'file' as const }));
    const result = scoreFiles(buildMockAnalysis({ files, astFiles }));
    const targetResult = result.find((r) => r.path === target);
    expect(targetResult).toBeDefined();
    expect(targetResult!.breakdown.importCount).toBe(5 * SCORE_IMPORT_PER_IMPORTER);
  });

  test('import count cap: 20 importers gives SCORE_IMPORT_CAP, not 60', () => {
    const target = 'src/shared.ts';
    const importerFiles = Array.from({ length: 20 }, (_, i) => ({
      path: `src/consumer${i}.ts`,
      imports: [{ source: './shared' }],
      exports: [],
    }));
    const astFiles = [...importerFiles, { path: target, imports: [], exports: [] }];
    const files = astFiles.map((f) => ({ path: f.path, type: 'file' as const }));
    const result = scoreFiles(buildMockAnalysis({ files, astFiles }));
    const targetResult = result.find((r) => r.path === target);
    expect(targetResult).toBeDefined();
    // 20 importers * 3 = 60, but cap is 30
    expect(targetResult!.breakdown.importCount).toBe(SCORE_IMPORT_CAP);
    expect(targetResult!.breakdown.importCount).not.toBe(60);
  });

  test('export count scoring: 15 exports gives SCORE_EXPORT_CAP', () => {
    const target = 'src/api.ts';
    const exports15 = Array.from({ length: 15 }, (_, i) => ({ name: `export${i}` }));
    const astFiles = [{ path: target, imports: [], exports: exports15 }];
    const files = [{ path: target, type: 'file' as const }];
    const result = scoreFiles(buildMockAnalysis({ files, astFiles }));
    const targetResult = result.find((r) => r.path === target);
    expect(targetResult).toBeDefined();
    // 15 * 2 = 30, but cap is 20
    expect(targetResult!.breakdown.exportCount).toBe(
      Math.min(15 * SCORE_EXPORT_PER_EXPORT, SCORE_EXPORT_CAP),
    );
    expect(targetResult!.breakdown.exportCount).toBe(SCORE_EXPORT_CAP);
  });

  test('git activity scoring: 5 changes gives 5', () => {
    const target = 'src/feature.ts';
    const result = scoreFiles(
      buildMockAnalysis({
        files: [{ path: target, type: 'file' }],
        gitChangedFiles: [{ path: target, changes: 5 }],
      }),
    );
    expect(result[0].breakdown.gitActivity).toBe(5);
  });

  test('git activity cap: 50 changes gives SCORE_GIT_ACTIVITY_CAP', () => {
    const target = 'src/hotspot.ts';
    const result = scoreFiles(
      buildMockAnalysis({
        files: [{ path: target, type: 'file' }],
        gitChangedFiles: [{ path: target, changes: 50 }],
      }),
    );
    expect(result[0].breakdown.gitActivity).toBe(SCORE_GIT_ACTIVITY_CAP);
  });

  test('edge cases (TODOs): file with TODO items gets SCORE_EDGE_CASES', () => {
    const withTodo = 'src/with-todo.ts';
    const withoutTodo = 'src/without-todo.ts';
    const result = scoreFiles(
      buildMockAnalysis({
        files: [
          { path: withTodo, type: 'file' },
          { path: withoutTodo, type: 'file' },
        ],
        todoItems: [{ file: withTodo }],
      }),
    );
    const withTodoResult = result.find((r) => r.path === withTodo);
    const withoutTodoResult = result.find((r) => r.path === withoutTodo);
    expect(withTodoResult!.breakdown.edgeCases).toBe(SCORE_EDGE_CASES);
    expect(withoutTodoResult!.breakdown.edgeCases).toBe(0);
  });

  test.each([
    ['package.json', SCORE_CONFIG_FILE],
    ['.eslintrc.js', SCORE_CONFIG_FILE],
  ])('config file detection: %s gets configFile=%i', (configFile, expectedBonus) => {
    const result = scoreFiles(
      buildMockAnalysis({
        files: [{ path: configFile, type: 'file' }],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].breakdown.configFile).toBe(expectedBonus);
  });

  test('test file penalty: utils.test.ts gets penalized by SCORE_TEST_PENALTY, floors at SCORE_MIN', () => {
    const testFile = 'src/utils.test.ts';
    const result = scoreFiles(
      buildMockAnalysis({
        files: [{ path: testFile, type: 'file' }],
      }),
    );
    expect(result).toHaveLength(1);
    // Without any bonuses: raw sum = 0, after penalty 0 - SCORE_TEST_PENALTY is negative, floors at SCORE_MIN
    const rawPenalizedScore = Math.max(SCORE_MIN, 0 - SCORE_TEST_PENALTY);
    expect(result[0].score).toBe(rawPenalizedScore);
    expect(result[0].score).toBe(SCORE_MIN);
  });

  test('score cap: heavily boosted file does not exceed SCORE_MAX', () => {
    const superFile = 'index.ts'; // entry point match
    const exportCount = 15; // -> SCORE_EXPORT_CAP
    const importerCount = 20; // -> SCORE_IMPORT_CAP
    const astFiles = [
      // The target file itself with many exports
      {
        path: superFile,
        imports: [],
        exports: Array.from({ length: exportCount }, (_, i) => ({ name: `exp${i}` })),
      },
      // 20 importer files
      ...Array.from({ length: importerCount }, (_, i) => ({
        path: `src/consumer${i}.ts`,
        imports: [{ source: './index' }],
        exports: [],
      })),
    ];
    const files = astFiles.map((f) => ({ path: f.path, type: 'file' as const }));
    const result = scoreFiles(
      buildMockAnalysis({
        files,
        astFiles,
        gitChangedFiles: [{ path: superFile, changes: 50 }],
        todoItems: [{ file: superFile }],
      }),
    );
    const targetResult = result.find((r) => r.path === superFile);
    expect(targetResult).toBeDefined();
    // Would be: 30 + 30 + 20 + 10 + 10 + 15 = 115 > 100
    expect(targetResult!.score).toBeLessThanOrEqual(SCORE_MAX);
  });

  test('sort order: files sorted descending by score, ties sorted alphabetically', () => {
    const highFile = 'index.ts'; // entry point = 30
    const midFile = 'package.json'; // config file = 15
    const lowFile = 'src/utils.ts'; // no special bonuses = 0
    const result = scoreFiles(
      buildMockAnalysis({
        files: [
          { path: highFile, type: 'file' },
          { path: midFile, type: 'file' },
          { path: lowFile, type: 'file' },
        ],
      }),
    );
    expect(result).toHaveLength(3);
    // Scores should be descending
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    expect(result[1].score).toBeGreaterThanOrEqual(result[2].score);
    // Verify order: index.ts > package.json > src/utils.ts
    expect(result[0].path).toBe(highFile);
    expect(result[1].path).toBe(midFile);
    expect(result[2].path).toBe(lowFile);
  });

  test('sort order: ties broken alphabetically', () => {
    // Two plain files with no bonuses should sort alphabetically
    const fileA = 'src/aardvark.ts';
    const fileB = 'src/zebra.ts';
    const result = scoreFiles(
      buildMockAnalysis({
        files: [
          { path: fileB, type: 'file' },
          { path: fileA, type: 'file' },
        ],
      }),
    );
    expect(result).toHaveLength(2);
    expect(result[0].score).toBe(result[1].score);
    expect(result[0].path).toBe(fileA);
    expect(result[1].path).toBe(fileB);
  });
});
