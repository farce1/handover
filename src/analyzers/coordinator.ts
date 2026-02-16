import { buildAnalysisContext } from './context.js';
import { analyzeFileTree } from './file-tree.js';
import { analyzeDependencies } from './dependency-graph.js';
import { analyzeGitHistory } from './git-history.js';
import { scanTodos } from './todo-scanner.js';
import { scanEnvVars } from './env-scanner.js';
import { analyzeAST } from './ast-analyzer.js';
import { analyzeTests } from './test-analyzer.js';
import { analyzeDocs } from './doc-analyzer.js';
import type { HandoverConfig } from '../config/schema.js';
import type {
  StaticAnalysisResult,
  AnalyzerResult,
  FileTreeResult,
  DependencyResult,
  GitHistoryResult,
  TodoResult,
  EnvResult,
  ASTResult,
  TestResult,
  DocResult,
} from './types.js';

// ─── Analyzer name labels (for progress reporting) ──────────────────────────

const ANALYZER_NAMES = [
  'file-tree',
  'dependencies',
  'git-history',
  'todos',
  'env',
  'ast',
  'tests',
  'docs',
] as const;

// ─── Default empty results (used when individual analyzers fail) ─────────────

const EMPTY_FILE_TREE: FileTreeResult = {
  totalFiles: 0,
  totalDirs: 0,
  totalLines: 0,
  totalSize: 0,
  filesByExtension: {},
  largestFiles: [],
  directoryTree: [],
};

const EMPTY_DEPENDENCIES: DependencyResult = {
  manifests: [],
  warnings: [],
};

const EMPTY_GIT_HISTORY: GitHistoryResult = {
  isGitRepo: false,
  branchPattern: {
    strategy: 'unknown',
    evidence: [],
    activeBranches: [],
    staleBranches: [],
    defaultBranch: '',
    branchCount: 0,
  },
  recentCommits: [],
  mostChangedFiles: [],
  activityByMonth: {},
  contributors: [],
  fileOwnership: [],
  warnings: [],
};

const EMPTY_TODOS: TodoResult = {
  items: [],
  summary: { total: 0, byCategory: {} },
};

const EMPTY_ENV: EnvResult = {
  envFiles: [],
  envReferences: [],
  warnings: [],
};

const EMPTY_AST: ASTResult = {
  files: [],
  summary: {
    totalFunctions: 0,
    totalClasses: 0,
    totalExports: 0,
    totalImports: 0,
    languageBreakdown: {},
  },
};

const EMPTY_TESTS: TestResult = {
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
};

const EMPTY_DOCS: DocResult = {
  readmes: [],
  docsFolder: null,
  docFiles: [],
  inlineDocCoverage: { filesWithDocs: 0, totalFiles: 0, percentage: 0 },
  summary: {
    hasReadme: false,
    hasDocsFolder: false,
    docFileCount: 0,
    inlineDocPercentage: 0,
  },
};

const EMPTY_RESULTS = [
  EMPTY_FILE_TREE,
  EMPTY_DEPENDENCIES,
  EMPTY_GIT_HISTORY,
  EMPTY_TODOS,
  EMPTY_ENV,
  EMPTY_AST,
  EMPTY_TESTS,
  EMPTY_DOCS,
] as const;

// ─── Coordinator ─────────────────────────────────────────────────────────────

export interface RunStaticAnalysisOptions {
  gitDepth?: 'default' | 'full';
  onProgress?: (analyzer: string, status: 'start' | 'done' | 'fail') => void;
}

/**
 * STAT-09: Run all 8 static analyzers concurrently via Promise.allSettled().
 *
 * Individual analyzer failures produce partial results — one failing analyzer
 * does NOT discard successful results from others (pitfall #2 from research).
 *
 * Saves the file-hash cache after analysis for instant repeat runs on
 * unchanged files.
 */
export async function runStaticAnalysis(
  rootDir: string,
  config: HandoverConfig,
  options?: RunStaticAnalysisOptions,
): Promise<StaticAnalysisResult> {
  const startTime = Date.now();
  const onProgress = options?.onProgress;

  // 1. Build shared analysis context (file discovery + cache load)
  const ctx = await buildAnalysisContext(rootDir, config, {
    gitDepth: options?.gitDepth,
  });

  // 2. Report all analyzers as starting (they run concurrently)
  for (const name of ANALYZER_NAMES) {
    onProgress?.(name, 'start');
  }

  // 3. Run all 8 analyzers concurrently via Promise.allSettled
  const results = await Promise.allSettled([
    analyzeFileTree(ctx),
    analyzeDependencies(ctx),
    analyzeGitHistory(ctx),
    scanTodos(ctx),
    scanEnvVars(ctx),
    analyzeAST(ctx),
    analyzeTests(ctx),
    analyzeDocs(ctx),
  ]);

  // 4. Unwrap results: extract .data from fulfilled, use empty fallback for rejected
  function unwrap<T>(
    settled: PromiseSettledResult<AnalyzerResult<T>>,
    index: number,
    emptyResult: T,
  ): T {
    if (settled.status === 'fulfilled') {
      const result = settled.value;
      onProgress?.(ANALYZER_NAMES[index], result.success ? 'done' : 'fail');
      return result.data ?? emptyResult;
    }
    // Promise itself rejected (unexpected)
    onProgress?.(ANALYZER_NAMES[index], 'fail');
    return emptyResult;
  }

  const fileTree = unwrap<FileTreeResult>(results[0], 0, EMPTY_RESULTS[0]);
  const dependencies = unwrap<DependencyResult>(results[1], 1, EMPTY_RESULTS[1]);
  const gitHistory = unwrap<GitHistoryResult>(results[2], 2, EMPTY_RESULTS[2]);
  const todos = unwrap<TodoResult>(results[3], 3, EMPTY_RESULTS[3]);
  const env = unwrap<EnvResult>(results[4], 4, EMPTY_RESULTS[4]);
  const ast = unwrap<ASTResult>(results[5], 5, EMPTY_RESULTS[5]);
  const tests = unwrap<TestResult>(results[6], 6, EMPTY_RESULTS[6]);
  const docs = unwrap<DocResult>(results[7], 7, EMPTY_RESULTS[7]);

  // 5. Save cache for instant repeat runs on unchanged files
  await ctx.cache.save();

  // 6. Assemble and return StaticAnalysisResult
  const elapsed = Date.now() - startTime;

  return {
    fileTree,
    dependencies,
    gitHistory,
    todos,
    env,
    ast,
    tests,
    docs,
    metadata: {
      analyzedAt: new Date().toISOString(),
      rootDir,
      fileCount: ctx.files.length,
      elapsed,
    },
  };
}
