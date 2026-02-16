import { z } from 'zod';
import { ParsedFileSchema } from '../parsing/types.js';
import type { HandoverConfig } from '../config/schema.js';

// ─── FileEntry ─────────────────────────────────────────────────────────────

export const FileEntrySchema = z.object({
  path: z.string(), // Relative to rootDir
  absolutePath: z.string(),
  size: z.number(),
  extension: z.string(),
});

export type FileEntry = z.infer<typeof FileEntrySchema>;

// ─── AnalysisConfig ────────────────────────────────────────────────────────

export const AnalysisConfigSchema = z.object({
  gitDepth: z.enum(['default', 'full']).default('default'),
  outputFormat: z.enum(['markdown', 'json']).default('markdown'),
  cachePath: z.string(),
});

export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;

// ─── AnalysisContext (Zod schema for validation, interface used at runtime) ─

export const AnalysisContextSchema = z.object({
  rootDir: z.string(),
  files: z.array(FileEntrySchema),
  config: z.any(), // HandoverConfig is validated by its own schema
  gitDepth: z.enum(['default', 'full']).default('default'),
});

// Runtime interface is used for stronger typing (readonly files, typed config)
// The Zod schema above is available for serialization/validation if needed.

// ─── FileTreeResult (STAT-01) ──────────────────────────────────────────────

export const FileTreeResultSchema = z.object({
  totalFiles: z.number(),
  totalDirs: z.number(),
  totalLines: z.number(),
  totalSize: z.number(),
  filesByExtension: z.record(z.string(), z.number()),
  largestFiles: z.array(
    z.object({
      path: z.string(),
      size: z.number(),
      lines: z.number(),
    }),
  ),
  directoryTree: z.array(
    z.object({
      path: z.string(),
      type: z.enum(['file', 'directory']),
      size: z.number().optional(),
      lines: z.number().optional(),
      children: z.number().optional(),
    }),
  ),
});

export type FileTreeResult = z.infer<typeof FileTreeResultSchema>;

// ─── DependencyResult (STAT-02) ────────────────────────────────────────────

export const DependencyInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  type: z.enum(['production', 'development', 'peer', 'optional']),
});

export type DependencyInfo = z.infer<typeof DependencyInfoSchema>;

export const DependencyManifestSchema = z.object({
  file: z.string(),
  packageManager: z.string(),
  dependencies: z.array(DependencyInfoSchema),
});

export const DependencyResultSchema = z.object({
  manifests: z.array(DependencyManifestSchema),
  warnings: z.array(z.string()),
});

export type DependencyResult = z.infer<typeof DependencyResultSchema>;

// ─── GitHistoryResult (STAT-03) ────────────────────────────────────────────

export const BranchPatternSchema = z.object({
  strategy: z.enum(['git-flow', 'trunk-based', 'feature-branch', 'unknown']),
  evidence: z.array(z.string()),
  activeBranches: z.array(z.string()),
  staleBranches: z.array(z.string()),
  defaultBranch: z.string(),
  branchCount: z.number(),
});

export const GitCommitSchema = z.object({
  hash: z.string(),
  author: z.string(),
  date: z.string(),
  message: z.string(),
});

export const ContributorSchema = z.object({
  name: z.string(),
  email: z.string(),
  commitCount: z.number(),
});

export const FileOwnershipSchema = z.object({
  path: z.string(),
  topContributor: z.string(),
  commitCount: z.number(),
});

export const GitHistoryResultSchema = z.object({
  isGitRepo: z.boolean(),
  branchPattern: BranchPatternSchema,
  recentCommits: z.array(GitCommitSchema),
  mostChangedFiles: z.array(
    z.object({
      path: z.string(),
      changes: z.number(),
    }),
  ),
  activityByMonth: z.record(z.string(), z.number()),
  contributors: z.array(ContributorSchema),
  fileOwnership: z.array(FileOwnershipSchema),
  warnings: z.array(z.string()),
});

export type BranchPattern = z.infer<typeof BranchPatternSchema>;
export type GitCommit = z.infer<typeof GitCommitSchema>;
export type Contributor = z.infer<typeof ContributorSchema>;
export type FileOwnership = z.infer<typeof FileOwnershipSchema>;
export type GitHistoryResult = z.infer<typeof GitHistoryResultSchema>;

// ─── TodoResult (STAT-04) ──────────────────────────────────────────────────

export const TodoItemSchema = z.object({
  marker: z.string(),
  category: z.enum(['bugs', 'tasks', 'notes', 'debt', 'optimization']),
  text: z.string(),
  file: z.string(),
  line: z.number(),
  issueRefs: z.array(z.string()),
});

export const TodoResultSchema = z.object({
  items: z.array(TodoItemSchema),
  summary: z.object({
    total: z.number(),
    byCategory: z.record(z.string(), z.number()),
  }),
});

export type TodoItem = z.infer<typeof TodoItemSchema>;
export type TodoResult = z.infer<typeof TodoResultSchema>;

// ─── EnvResult (STAT-05) ───────────────────────────────────────────────────

export const EnvResultSchema = z.object({
  envFiles: z.array(
    z.object({
      path: z.string(),
      variables: z.array(z.string()),
    }),
  ),
  envReferences: z.array(
    z.object({
      file: z.string(),
      line: z.number(),
      variable: z.string(),
    }),
  ),
  warnings: z.array(z.string()),
});

export type EnvResult = z.infer<typeof EnvResultSchema>;

// ─── ASTResult (STAT-06) ───────────────────────────────────────────────────

export const ASTResultSchema = z.object({
  files: z.array(ParsedFileSchema),
  summary: z.object({
    totalFunctions: z.number(),
    totalClasses: z.number(),
    totalExports: z.number(),
    totalImports: z.number(),
    languageBreakdown: z.record(z.string(), z.number()),
  }),
});

export type ASTResult = z.infer<typeof ASTResultSchema>;

// ─── TestResult (STAT-07) ──────────────────────────────────────────────────

export const TestResultSchema = z.object({
  testFiles: z.array(
    z.object({
      path: z.string(),
      framework: z.string(),
      testCount: z.number(),
    }),
  ),
  frameworks: z.array(z.string()),
  hasConfig: z.boolean(),
  configFiles: z.array(z.string()),
  coverageDataPath: z.string().nullable(),
  summary: z.object({
    totalTestFiles: z.number(),
    totalTests: z.number(),
    frameworksDetected: z.array(z.string()),
  }),
});

export type TestResult = z.infer<typeof TestResultSchema>;

// ─── DocResult (STAT-08) ───────────────────────────────────────────────────

export const DocResultSchema = z.object({
  readmes: z.array(z.string()),
  docsFolder: z.string().nullable(),
  docFiles: z.array(z.string()),
  inlineDocCoverage: z.object({
    filesWithDocs: z.number(),
    totalFiles: z.number(),
    percentage: z.number(),
  }),
  summary: z.object({
    hasReadme: z.boolean(),
    hasDocsFolder: z.boolean(),
    docFileCount: z.number(),
    inlineDocPercentage: z.number(),
  }),
});

export type DocResult = z.infer<typeof DocResultSchema>;

// ─── StaticAnalysisResult (envelope combining all 8) ───────────────────────

export const StaticAnalysisResultSchema = z.object({
  fileTree: FileTreeResultSchema,
  dependencies: DependencyResultSchema,
  gitHistory: GitHistoryResultSchema,
  todos: TodoResultSchema,
  env: EnvResultSchema,
  ast: ASTResultSchema,
  tests: TestResultSchema,
  docs: DocResultSchema,
  metadata: z.object({
    analyzedAt: z.string(),
    rootDir: z.string(),
    fileCount: z.number(),
    elapsed: z.number(),
  }),
});

export type StaticAnalysisResult = z.infer<typeof StaticAnalysisResultSchema>;

// ─── AnalyzerResult<T> generic envelope ────────────────────────────────────

export const AnalyzerResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    elapsed: z.number(),
  });

export interface AnalyzerResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  elapsed: number;
}

// ─── AnalyzerFn<T> function type ───────────────────────────────────────────

// Forward-declare AnalysisContext interface (defined in context.ts to avoid circular deps)
// Import from './context.js' at use site. The type is re-exported here for convenience.
export interface AnalysisContext {
  readonly rootDir: string;
  readonly files: readonly FileEntry[];
  readonly config: HandoverConfig;
  readonly cache: import('./cache.js').AnalysisCache;
  readonly gitDepth: 'default' | 'full';
}

export type AnalyzerFn<T> = (ctx: AnalysisContext) => Promise<AnalyzerResult<T>>;
