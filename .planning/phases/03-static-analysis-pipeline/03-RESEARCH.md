# Phase 3: Static Analysis Pipeline - Research

**Researched:** 2026-02-16
**Domain:** Concurrent file-system analyzers, dependency manifest parsing, git history extraction, .gitignore filtering, content-hash caching
**Confidence:** HIGH

## Summary

Phase 3 builds eight concurrent analyzers that extract deterministic facts from any codebase: file tree, dependencies, git history, TODOs, env vars, AST data, tests, and existing docs. Each analyzer is a pure function that takes a project root path and returns a typed result. All eight run via `Promise.all()` with zero shared state -- the DAG orchestrator from Phase 1 already supports this concurrency model. The existing `ParserService` from Phase 2 provides the AST extraction foundation that the ASTParser analyzer wraps.

The core technical challenges are: (1) respecting `.gitignore` patterns during file discovery so `node_modules` and build artifacts never appear in results, (2) parsing five different dependency manifest formats (package.json, Cargo.toml, go.mod, requirements.txt, pyproject.toml) robustly, (3) extracting meaningful git history with configurable depth defaulting to 6 months, and (4) implementing file-hash caching so repeated runs skip unchanged files.

The recommended architecture uses a shared file-discovery layer (fast-glob + ignore) that all analyzers consume, a typed `AnalyzerResult<T>` envelope for each analyzer's output, and a coordinator function that runs `Promise.all()` and assembles the combined `StaticAnalysisResult`. The `handover analyze --static-only` CLI command wires directly to this coordinator, producing either a markdown report (default) or JSON (`--json` flag).

**Primary recommendation:** Use `fast-glob` for file discovery with the `ignore` package for `.gitignore` filtering, `simple-git` for git operations, `smol-toml` for Cargo.toml/pyproject.toml parsing, and Node.js built-in `crypto.createHash('sha256')` for content-hash caching. Each analyzer is a standalone module exporting an `analyze(ctx: AnalysisContext)` function. No shared mutable state between analyzers.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Static report output
- Dual format: default markdown report in output folder, `--json` flag for machine-readable JSON to stdout
- File-hash caching: results cached by file content hash, unchanged files skipped on re-run for instant repeat analysis

#### Git history scope
- Configurable depth: default to 6 months of history, `--git-depth full` for complete history
- Primary focus: branch patterns -- both branching strategy (feature branches, release branches, naming conventions, merge vs rebase) and current branch state (active branches, stale branches, in-flight work)

#### TODO/issue detection
- Expanded marker set: TODO, FIXME, HACK, XXX, NOTE, WARN, DEPRECATED, REVIEW, OPTIMIZE, TEMP
- Categorized by type: bugs (FIXME/HACK), tasks (TODO), notes (NOTE/WARN), debt (DEPRECATED/TEMP), optimization (OPTIMIZE/REVIEW)
- Context per item: line text, file path, and line number only (no surrounding code)
- Capture inline issue references: detect `#123`, `GH-456`, and similar patterns in comments

#### Dependency analysis
- Dev vs production dependencies tracked separately
- Flag significantly outdated dependencies for handover risk assessment
- Missing or malformed manifests: warn and skip, continue with what's parseable

### Claude's Discretion

#### Report output
- Single combined file vs per-analyzer files for markdown report
- Terminal summary behavior (print key stats or just output path)

#### Git
- Whether to include file ownership, churn, and contributor data as secondary metrics alongside branch patterns

#### Dependencies
- Whether dependency analyzer also tracks internal cross-module imports or defers that to the AST analyzer

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fast-glob | ^3.3.x | File system traversal with glob patterns | 41M+ weekly downloads, battle-tested, supports `stats` option for file sizes, `ignore` patterns, `onlyFiles` filtering. Used by Vite, ESLint, Prettier |
| ignore | ^7.0.x | .gitignore pattern filtering | 36M+ weekly downloads, used by ESLint, Prettier, many others. Spec-compliant .gitignore implementation. 500+ unit tests verified against `git check-ignore` |
| simple-git | ^3.27.x | Git operations (log, branch, raw) | 3M+ weekly downloads, promise-based API wrapping git CLI. Supports log with custom format, branch listing, raw commands. Handles process spawning limits |
| smol-toml | ^1.6.x | TOML parsing for Cargo.toml, pyproject.toml | Fastest TOML parser on npm (71K ops/sec), TOML 1.1.0 compliant, zero dependencies, 275+ dependents. Trusted by production systems |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:crypto | built-in | SHA-256 content hashing for cache | File-hash caching layer. `crypto.createHash('sha256')` is built into Node.js, no extra dependency |
| node:fs/promises | built-in | Async file reading | Reading file contents for hashing and analysis |
| node:path | built-in | Path manipulation | Cross-platform path joining, extension extraction |
| yaml (already installed) | ^2.7.x | YAML parsing | Already a project dependency. May be useful if any analyzer needs to read YAML configs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fast-glob | tinyglobby | tinyglobby is newer, smaller (179KB vs 513KB), faster in benchmarks. But fast-glob is more battle-tested with 41M weekly downloads and better documentation. Either works; fast-glob is safer for a v1 |
| fast-glob | fdir + picomatch | Lower-level, maximum performance. But requires manual composition. fast-glob wraps these patterns with a clean API |
| simple-git | child_process.execFile | Zero dependency, slightly less overhead per command. But simple-git provides typed results, built-in concurrency limits, and error handling. Worth the dependency |
| simple-git | isomorphic-git | Pure JS git implementation, no git CLI needed. But 618 code snippets of complexity, heavier, and the user's machine will always have git installed. Overkill for read-only operations |
| smol-toml | @iarna/toml | Older, more established. But smol-toml is faster, more spec-compliant (TOML 1.1.0 vs 1.0.0), actively maintained |
| ignore | glob-gitignore | Integrates ignore filtering directly into globbing. But coupling the two concerns reduces flexibility. Better to separate discovery from filtering |

**Installation:**
```bash
npm install fast-glob ignore simple-git smol-toml
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── analyzers/
│   ├── types.ts                # Zod schemas for all analyzer results + AnalysisContext
│   ├── context.ts              # Shared AnalysisContext: file list, config, project root
│   ├── file-discovery.ts       # fast-glob + ignore: discover files, respect .gitignore
│   ├── cache.ts                # File-hash cache: read/write, SHA-256 content hashing
│   ├── coordinator.ts          # Promise.all() coordinator, assembles StaticAnalysisResult
│   ├── file-tree.ts            # STAT-01: Directory structure, file types, sizes, line counts
│   ├── dependency-graph.ts     # STAT-02: Parse package.json, Cargo.toml, go.mod, etc.
│   ├── git-history.ts          # STAT-03: Commit patterns, branch analysis, activity
│   ├── todo-scanner.ts         # STAT-04: TODO/FIXME/HACK markers with categories
│   ├── env-scanner.ts          # STAT-05: .env files, env var references
│   ├── ast-analyzer.ts         # STAT-06: Wraps Phase 2 ParserService for batch analysis
│   ├── test-analyzer.ts        # STAT-07: Test file locations, patterns, coverage data
│   ├── doc-analyzer.ts         # STAT-08: README, docs folder, JSDoc, docstrings
│   └── report.ts               # Format results as markdown or JSON
├── cli/
│   ├── analyze.ts              # CLI-03: `handover analyze` command handler
│   └── index.ts                # EXISTING: add analyze command registration
```

### Pattern 1: Analyzer Interface with Typed Results
**What:** Every analyzer exports a single async function conforming to a common signature. Each returns a typed result envelope. The coordinator calls all eight via `Promise.all()`.
**When to use:** Every analyzer module.
**Example:**
```typescript
// Source: Project pattern - consistent analyzer interface
import { z } from 'zod';

// Each analyzer's result has a unique schema
export const FileTreeResultSchema = z.object({
  totalFiles: z.number(),
  totalDirs: z.number(),
  totalLines: z.number(),
  totalSize: z.number(),
  filesByExtension: z.record(z.string(), z.number()),
  largestFiles: z.array(z.object({
    path: z.string(),
    size: z.number(),
    lines: z.number(),
  })),
  directoryTree: z.array(z.object({
    path: z.string(),
    type: z.enum(['file', 'directory']),
    size: z.number().optional(),
    lines: z.number().optional(),
    children: z.number().optional(), // for directories
  })),
});

// Shared context passed to all analyzers
export interface AnalysisContext {
  rootDir: string;
  files: FileEntry[];          // Pre-discovered, .gitignore-filtered file list
  config: HandoverConfig;
  cache: AnalysisCache;        // Content-hash cache for skipping unchanged files
}

export interface FileEntry {
  path: string;                // Relative to rootDir
  absolutePath: string;
  size: number;
  extension: string;
}

// Analyzer function signature
export type AnalyzerFn<T> = (ctx: AnalysisContext) => Promise<T>;
```

### Pattern 2: Shared File Discovery with .gitignore Filtering (STAT-10)
**What:** A single file-discovery pass runs before all analyzers. It uses `fast-glob` to walk the filesystem and `ignore` to filter out .gitignore patterns. The result is a `FileEntry[]` shared (immutably) by all analyzers.
**When to use:** Once at the start of analysis, before any analyzer runs.
**Example:**
```typescript
// Source: fast-glob docs + ignore docs
import fg from 'fast-glob';
import ignore from 'ignore';
import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

export async function discoverFiles(rootDir: string): Promise<FileEntry[]> {
  // Load .gitignore patterns
  const ig = ignore();
  const gitignorePath = join(rootDir, '.gitignore');
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, 'utf-8'));
  }

  // Always ignore these regardless of .gitignore
  ig.add(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '__pycache__']);

  // Walk filesystem with fast-glob
  const entries = await fg('**/*', {
    cwd: rootDir,
    onlyFiles: true,
    stats: true,
    dot: false,           // Skip dotfiles by default
    followSymbolicLinks: false,
  });

  // Filter through .gitignore
  return entries
    .filter(entry => !ig.ignores(entry.path))
    .map(entry => ({
      path: entry.path,
      absolutePath: join(rootDir, entry.path),
      size: entry.stats?.size ?? 0,
      extension: extname(entry.path),
    }));
}
```

### Pattern 3: Content-Hash Caching
**What:** Each file's SHA-256 hash is computed from its content. A JSON cache file maps `{ [relativePath]: { hash, analyzedAt, results } }`. On re-run, files with unchanged hashes skip re-analysis.
**When to use:** Before each file-level analysis operation.
**Example:**
```typescript
// Source: Node.js crypto docs
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface CacheEntry {
  hash: string;
  analyzedAt: number;
}

export class AnalysisCache {
  private cache = new Map<string, CacheEntry>();
  private dirty = false;

  constructor(private cachePath: string) {}

  async load(): Promise<void> {
    if (existsSync(this.cachePath)) {
      const raw = await readFile(this.cachePath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, CacheEntry>;
      for (const [key, value] of Object.entries(data)) {
        this.cache.set(key, value);
      }
    }
  }

  isUnchanged(path: string, contentHash: string): boolean {
    const entry = this.cache.get(path);
    return entry?.hash === contentHash;
  }

  set(path: string, hash: string): void {
    this.cache.set(path, { hash, analyzedAt: Date.now() });
    this.dirty = true;
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    const obj = Object.fromEntries(this.cache);
    await writeFile(this.cachePath, JSON.stringify(obj, null, 2));
  }
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
```

### Pattern 4: Concurrent Analyzer Coordinator (STAT-09)
**What:** The coordinator function calls all eight analyzers via `Promise.all()`. Each analyzer receives the same immutable `AnalysisContext`. No analyzer modifies shared state.
**When to use:** The main entry point for static analysis.
**Example:**
```typescript
// Source: Project architecture pattern
export async function runStaticAnalysis(
  rootDir: string,
  config: HandoverConfig,
): Promise<StaticAnalysisResult> {
  // Phase 1: Discover files (shared, immutable)
  const files = await discoverFiles(rootDir);

  // Phase 2: Load cache
  const cache = new AnalysisCache(join(rootDir, '.handover', '.cache.json'));
  await cache.load();

  // Phase 3: Build shared context
  const ctx: AnalysisContext = { rootDir, files, config, cache };

  // Phase 4: Run all 8 analyzers concurrently (STAT-09)
  const [fileTree, deps, git, todos, env, ast, tests, docs] = await Promise.all([
    analyzeFileTree(ctx),
    analyzeDependencies(ctx),
    analyzeGitHistory(ctx),
    scanTodos(ctx),
    scanEnvVars(ctx),
    analyzeAST(ctx),
    analyzeTests(ctx),
    analyzeDocs(ctx),
  ]);

  // Phase 5: Save cache
  await cache.save();

  return { fileTree, deps, git, todos, env, ast, tests, docs };
}
```

### Pattern 5: Dependency Manifest Parsing (STAT-02)
**What:** Each manifest format gets a dedicated parser function. All parsers return the same `DependencyInfo` shape. Malformed manifests warn and return partial results.
**When to use:** DependencyGraph analyzer.
**Example:**
```typescript
// Source: Manifest format specifications
import { parse as parseTOML } from 'smol-toml';

interface DependencyInfo {
  name: string;
  version: string;
  type: 'production' | 'development' | 'peer' | 'optional';
}

// package.json -- already JSON, just parse and extract
function parsePackageJson(content: string): DependencyInfo[] {
  const pkg = JSON.parse(content);
  const deps: DependencyInfo[] = [];
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    deps.push({ name, version: String(version), type: 'production' });
  }
  for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
    deps.push({ name, version: String(version), type: 'development' });
  }
  for (const [name, version] of Object.entries(pkg.peerDependencies ?? {})) {
    deps.push({ name, version: String(version), type: 'peer' });
  }
  for (const [name, version] of Object.entries(pkg.optionalDependencies ?? {})) {
    deps.push({ name, version: String(version), type: 'optional' });
  }
  return deps;
}

// Cargo.toml -- TOML format, use smol-toml
function parseCargoToml(content: string): DependencyInfo[] {
  const cargo = parseTOML(content) as Record<string, unknown>;
  const deps: DependencyInfo[] = [];

  const extractDeps = (section: unknown, type: DependencyInfo['type']) => {
    if (!section || typeof section !== 'object') return;
    for (const [name, spec] of Object.entries(section as Record<string, unknown>)) {
      const version = typeof spec === 'string' ? spec
        : (spec as { version?: string })?.version ?? '*';
      deps.push({ name, version, type });
    }
  };

  extractDeps(cargo.dependencies, 'production');
  extractDeps((cargo as any)['dev-dependencies'], 'development');
  extractDeps((cargo as any)['build-dependencies'], 'development');
  return deps;
}

// go.mod -- line-based format, regex parse
function parseGoMod(content: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  // Match require blocks and single requires
  const requireBlock = /require\s*\(([\s\S]*?)\)/g;
  const singleRequire = /require\s+(\S+)\s+(\S+)/g;
  const depLine = /^\s*(\S+)\s+(\S+)/gm;

  // Block requires
  let match;
  while ((match = requireBlock.exec(content))) {
    let lineMatch;
    while ((lineMatch = depLine.exec(match[1]))) {
      if (!lineMatch[1].startsWith('//')) {
        deps.push({ name: lineMatch[1], version: lineMatch[2], type: 'production' });
      }
    }
  }
  return deps;
}

// requirements.txt -- line-based, simple regex
function parseRequirementsTxt(content: string): DependencyInfo[] {
  return content.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('-'))
    .map(line => {
      const match = line.match(/^([a-zA-Z0-9_.-]+)\s*([><=!~]+.+)?/);
      if (!match) return null;
      return { name: match[1], version: match[2] ?? '*', type: 'production' as const };
    })
    .filter(Boolean) as DependencyInfo[];
}

// pyproject.toml -- TOML format, multiple possible dependency locations
function parsePyprojectToml(content: string): DependencyInfo[] {
  const pyproject = parseTOML(content) as Record<string, unknown>;
  const deps: DependencyInfo[] = [];
  // PEP 621: [project] dependencies
  const project = pyproject.project as Record<string, unknown> | undefined;
  if (project?.dependencies && Array.isArray(project.dependencies)) {
    for (const dep of project.dependencies) {
      const match = String(dep).match(/^([a-zA-Z0-9_.-]+)/);
      if (match) deps.push({ name: match[1], version: String(dep), type: 'production' });
    }
  }
  // Optional dependencies are dev deps
  if (project?.['optional-dependencies'] && typeof project['optional-dependencies'] === 'object') {
    for (const group of Object.values(project['optional-dependencies'] as Record<string, string[]>)) {
      if (Array.isArray(group)) {
        for (const dep of group) {
          const match = String(dep).match(/^([a-zA-Z0-9_.-]+)/);
          if (match) deps.push({ name: match[1], version: String(dep), type: 'development' });
        }
      }
    }
  }
  return deps;
}
```

### Pattern 6: Git History Extraction with Configurable Depth (STAT-03)
**What:** Use `simple-git` to extract commit history, branch patterns, and activity data. Default to 6 months of history. The `--git-depth full` flag disables the time limit.
**When to use:** GitHistory analyzer.
**Example:**
```typescript
// Source: simple-git docs (Context7)
import { simpleGit, SimpleGit, LogResult, BranchSummary } from 'simple-git';

async function analyzeGitHistory(ctx: AnalysisContext): Promise<GitHistoryResult> {
  const git: SimpleGit = simpleGit(ctx.rootDir);

  // Check if this is a git repo
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    return emptyGitResult('Not a git repository');
  }

  // Branch analysis (always full -- branches are lightweight)
  const branches: BranchSummary = await git.branch(['-a']);

  // Commit log with configurable depth
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const since = ctx.config.gitDepth === 'full'
    ? undefined
    : sixMonthsAgo.toISOString().split('T')[0];

  const logOptions: string[] = ['--all', '--format=%H|%an|%ae|%ai|%s'];
  if (since) logOptions.push(`--since=${since}`);

  const rawLog = await git.raw(['log', ...logOptions]);

  // Parse log output into structured data
  // Extract: most-changed files, activity heatmap, commit patterns
  // ...
}
```

### Pattern 7: TODO Scanner with Categories and Issue References (STAT-04)
**What:** Line-by-line scan of source files for TODO markers. Each match is categorized by type and checked for issue references.
**When to use:** TodoScanner analyzer.
**Example:**
```typescript
// Source: User decisions (CONTEXT.md) -- marker set and categories
const TODO_MARKERS = {
  bugs: ['FIXME', 'HACK'],
  tasks: ['TODO'],
  notes: ['NOTE', 'WARN'],
  debt: ['DEPRECATED', 'TEMP'],
  optimization: ['OPTIMIZE', 'REVIEW'],
} as const;

// Build regex from all markers: matches "// TODO: message" or "# FIXME message" etc.
const ALL_MARKERS = Object.values(TODO_MARKERS).flat();
const MARKER_REGEX = new RegExp(
  `\\b(${ALL_MARKERS.join('|')})\\b[:\\s]?(.*)$`,
  'i'
);

// Issue reference patterns: #123, GH-456, JIRA-789
const ISSUE_REF_REGEX = /(?:#(\d+)|([A-Z]+-\d+))/g;

interface TodoItem {
  marker: string;
  category: 'bugs' | 'tasks' | 'notes' | 'debt' | 'optimization';
  text: string;
  file: string;
  line: number;
  issueRefs: string[];
}
```

### Anti-Patterns to Avoid
- **Reading all file contents into memory at once:** For large codebases (10K+ files), reading every file into memory simultaneously will cause OOM. Read files on-demand within each analyzer, or use streaming where possible.
- **Analyzers sharing mutable state:** The `AnalysisContext` must be immutable from the analyzers' perspective. If an analyzer needs to build an index (e.g., import graph), it builds its own local structure. No `Map<string, ...>` shared across analyzers.
- **Synchronous file operations in analyzers:** All file I/O must be async (`fs/promises`). The analyzers run concurrently -- a synchronous `readFileSync` in one analyzer blocks all others.
- **Parsing .gitignore from nested directories:** For v1, only the root `.gitignore` is respected. Walking nested `.gitignore` files adds significant complexity (directory-scoped rules) and is not required by the specs.
- **Using git log --all without depth limits:** On repositories with long histories (10K+ commits), `git log --all` can take 10+ seconds. The 6-month default depth keeps analysis fast.
- **Attempting to resolve npm registry versions for "outdated" detection:** Hitting the npm registry for each dependency introduces network dependency and latency. For v1, "significantly outdated" means checking if the version string uses very old major versions or is pinned to a known-old release. Defer live registry checks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .gitignore pattern matching | Custom glob matcher | `ignore` npm package | .gitignore has 20+ edge cases (negation, directory-only patterns, character classes, comments, trailing spaces). `ignore` is verified against `git check-ignore` output |
| File system walking | Recursive `readdir` | `fast-glob` | Handles symlinks, permission errors, encoding issues, platform differences. 41M weekly downloads of battle-testing |
| Git operations | `child_process.exec('git log ...')` | `simple-git` | Handles process spawning limits, output parsing, error types, and provides typed results. Saves hundreds of lines of output parsing |
| TOML parsing | Custom Cargo.toml regex | `smol-toml` | TOML has complex value types (inline tables, dotted keys, multiline strings). Regex cannot handle these reliably |
| Content hashing | Custom hash function | `crypto.createHash('sha256')` | Built-in, audited, fast. SHA-256 provides collision resistance suitable for caching |

**Key insight:** The file discovery and .gitignore filtering layer is the foundation that every analyzer depends on. Getting this wrong (including `node_modules`, missing `.gitignore` rules) corrupts every downstream result. Use proven libraries.

## Common Pitfalls

### Pitfall 1: .gitignore Path Relativity
**What goes wrong:** `ignore` expects paths relative to the `.gitignore` file's directory. Feeding absolute paths or paths relative to a different root causes incorrect filtering.
**Why it happens:** `fast-glob` returns paths relative to its `cwd`. If `cwd` doesn't match the `.gitignore` location, path comparison breaks.
**How to avoid:** Set `fast-glob`'s `cwd` to the project root (same directory as `.gitignore`). Always pass relative paths to `ignore.ignores()`. Never mix absolute and relative.
**Warning signs:** `node_modules` files appearing in results despite `.gitignore` containing `node_modules/`.

### Pitfall 2: Promise.all() Error Propagation
**What goes wrong:** One analyzer throws, and `Promise.all()` rejects immediately, discarding results from the other seven analyzers that completed successfully.
**Why it happens:** `Promise.all()` is fail-fast by design.
**How to avoid:** Use `Promise.allSettled()` instead, or wrap each analyzer in a try-catch that returns a typed error result instead of throwing. The coordinator then reports partial results with error annotations.
**Warning signs:** "Static analysis failed" when only the git analyzer had an issue (e.g., not a git repo).

### Pitfall 3: Git Not Available or Not a Repository
**What goes wrong:** `simple-git` throws when git is not installed or the directory is not a git repository.
**Why it happens:** Not every analyzed codebase is in a git repo (downloaded archives, unzipped source).
**How to avoid:** Wrap git operations in try-catch. The GitHistory analyzer should return an empty result with a warning message when git is unavailable, not crash the entire pipeline.
**Warning signs:** `ENOGIT` or `fatal: not a git repository` errors crashing the analysis.

### Pitfall 4: Large File Content Hashing Performance
**What goes wrong:** Computing SHA-256 of every file in a large codebase takes seconds, eating into the 5-second performance budget.
**Why it happens:** Reading and hashing 200 files at ~50KB each is ~10MB of I/O. Sequential hashing is slow.
**How to avoid:** Hash files in parallel batches (e.g., 50 at a time). For the cache check, compute hashes lazily -- only when an analyzer actually needs the file's content. The file-tree analyzer (sizes/counts) never needs content, so it never triggers hashing.
**Warning signs:** Static analysis taking 3+ seconds just in the cache-check phase.

### Pitfall 5: Dependency Manifest Parsing Failures
**What goes wrong:** A malformed `Cargo.toml` with invalid TOML syntax crashes the dependency analyzer, which crashes the entire pipeline.
**Why it happens:** `smol-toml.parse()` throws on invalid TOML.
**How to avoid:** Wrap every manifest parse in try-catch. Return partial results (whatever was parseable) and log a warning with the file path and error. The user decision explicitly says "warn and skip, continue with what's parseable."
**Warning signs:** `TomlError` or `SyntaxError` from manifest parsing.

### Pitfall 6: TODO Scanner False Positives
**What goes wrong:** The TODO regex matches inside string literals: `const msg = "TODO: fix this later"` is flagged as a real TODO.
**Why it happens:** Line-by-line regex has no concept of syntax context.
**How to avoid:** Accept this as a known limitation of string-based scanning. The false positive rate is low in practice because TODO markers in strings are uncommon. For v1, do NOT attempt to strip strings before scanning -- it adds complexity for marginal benefit. Consider documenting this limitation.
**Warning signs:** TODOs from test fixtures, documentation strings, or error messages.

### Pitfall 7: File Discovery Performance with deep node_modules
**What goes wrong:** `fast-glob` descends into `node_modules` despite `.gitignore` filtering, because filtering happens AFTER traversal.
**Why it happens:** `ignore` is a post-filter. `fast-glob` still traverses ignored directories unless told not to.
**How to avoid:** Pass `ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**']` directly to `fast-glob`'s `ignore` option. This prevents traversal into these directories entirely, rather than filtering after the fact. Then apply `.gitignore` rules as a secondary filter for everything else.
**Warning signs:** File discovery taking 2+ seconds due to traversing `node_modules`.

## Code Examples

### File Discovery with .gitignore Respect (STAT-10)
```typescript
// Source: fast-glob docs + ignore docs (Context7)
import fg from 'fast-glob';
import ignore, { Ignore } from 'ignore';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

// Hardcoded exclusions that fast-glob skips at traversal time (performance)
const ALWAYS_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/__pycache__/**',
  '**/target/**',        // Rust build output
  '**/vendor/**',        // Go vendor
];

export interface FileEntry {
  path: string;          // Relative to rootDir
  absolutePath: string;
  size: number;
  extension: string;
}

export async function discoverFiles(rootDir: string): Promise<FileEntry[]> {
  // Load .gitignore for secondary filtering
  const ig: Ignore = ignore();
  const gitignorePath = join(rootDir, '.gitignore');
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, 'utf-8'));
  }

  // Walk filesystem -- fast-glob handles the heavy lifting
  const entries = await fg('**/*', {
    cwd: rootDir,
    onlyFiles: true,
    stats: true,
    dot: false,
    followSymbolicLinks: false,
    ignore: ALWAYS_IGNORE,
  });

  // Apply .gitignore as secondary filter
  return entries
    .filter(entry => !ig.ignores(entry.path))
    .map(entry => ({
      path: entry.path,
      absolutePath: join(rootDir, entry.path),
      size: entry.stats?.size ?? 0,
      extension: extname(entry.path),
    }));
}
```

### Content-Hash Caching
```typescript
// Source: Node.js crypto.createHash docs
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export class AnalysisCache {
  private entries = new Map<string, { hash: string; analyzedAt: number }>();
  private dirty = false;

  constructor(private readonly cachePath: string) {}

  async load(): Promise<void> {
    if (!existsSync(this.cachePath)) return;
    try {
      const raw = await readFile(this.cachePath, 'utf-8');
      const data = JSON.parse(raw);
      for (const [key, value] of Object.entries(data)) {
        this.entries.set(key, value as { hash: string; analyzedAt: number });
      }
    } catch {
      // Corrupted cache -- start fresh
    }
  }

  isUnchanged(relativePath: string, contentHash: string): boolean {
    return this.entries.get(relativePath)?.hash === contentHash;
  }

  update(relativePath: string, contentHash: string): void {
    this.entries.set(relativePath, { hash: contentHash, analyzedAt: Date.now() });
    this.dirty = true;
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    await mkdir(dirname(this.cachePath), { recursive: true });
    await writeFile(
      this.cachePath,
      JSON.stringify(Object.fromEntries(this.entries), null, 2),
    );
  }
}
```

### Git Branch Pattern Analysis
```typescript
// Source: simple-git docs (Context7)
import { simpleGit, SimpleGit, BranchSummary } from 'simple-git';

interface BranchPattern {
  strategy: 'git-flow' | 'trunk-based' | 'feature-branch' | 'unknown';
  evidence: string[];
  activeBranches: Array<{ name: string; lastCommit: string; isStale: boolean }>;
  defaultBranch: string;
  branchCount: { local: number; remote: number };
}

async function analyzeBranches(git: SimpleGit): Promise<BranchPattern> {
  const branches: BranchSummary = await git.branch(['-a', '--sort=-committerdate']);
  const branchNames = branches.all;

  // Detect strategy from naming patterns
  const hasReleaseBranches = branchNames.some(b => /release[/-]/.test(b));
  const hasDevelop = branchNames.some(b => /^(develop|dev)$/.test(b));
  const hasFeatureBranches = branchNames.some(b => /feature[/-]/.test(b));
  const hasHotfix = branchNames.some(b => /hotfix[/-]/.test(b));

  let strategy: BranchPattern['strategy'] = 'unknown';
  const evidence: string[] = [];

  if (hasDevelop && hasReleaseBranches) {
    strategy = 'git-flow';
    evidence.push('develop branch present', 'release branches found');
  } else if (hasFeatureBranches && !hasDevelop) {
    strategy = 'feature-branch';
    evidence.push('feature branches without develop');
  } else if (branchNames.length <= 3) {
    strategy = 'trunk-based';
    evidence.push('few branches suggest trunk-based');
  }

  return { strategy, evidence, activeBranches: [], defaultBranch: branches.current, branchCount: { local: 0, remote: 0 } };
}
```

### TODO Scanner with Categories
```typescript
// Source: User decisions (CONTEXT.md)
const CATEGORY_MAP: Record<string, string> = {
  FIXME: 'bugs', HACK: 'bugs',
  TODO: 'tasks',
  NOTE: 'notes', WARN: 'notes',
  DEPRECATED: 'debt', TEMP: 'debt',
  OPTIMIZE: 'optimization', REVIEW: 'optimization',
  XXX: 'bugs',
};

const ALL_MARKERS = Object.keys(CATEGORY_MAP);
const MARKER_PATTERN = new RegExp(
  `\\b(${ALL_MARKERS.join('|')})\\b[:\\s]\\s*(.*)`,
  'i',
);
const ISSUE_REF_PATTERN = /(?:#(\d+)|([A-Z]{2,}-\d+))/g;

interface TodoItem {
  marker: string;
  category: string;
  text: string;
  file: string;
  line: number;
  issueRefs: string[];
}

function scanFileForTodos(content: string, filePath: string): TodoItem[] {
  const items: TodoItem[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = MARKER_PATTERN.exec(lines[i]);
    if (!match) continue;

    const marker = match[1].toUpperCase();
    const text = match[2].trim();

    // Extract issue references from the line
    const issueRefs: string[] = [];
    let refMatch;
    while ((refMatch = ISSUE_REF_PATTERN.exec(lines[i]))) {
      issueRefs.push(refMatch[0]);
    }

    items.push({
      marker,
      category: CATEGORY_MAP[marker] ?? 'tasks',
      text,
      file: filePath,
      line: i + 1,
      issueRefs,
    });
  }
  return items;
}
```

## Discretion Recommendations

### Report Output: Single Combined File vs Per-Analyzer Files
**Recommendation:** Single combined markdown file. Rationale: (1) Users want one file to read, not eight. (2) A combined report enables cross-references between sections (e.g., "the TODO in auth.ts relates to the stale branch `feature/auth-refactor`"). (3) Per-analyzer JSON is available via `--json` for machine consumption. The combined markdown file should have a clear table of contents with anchor links to each section.

**Confidence:** HIGH -- This aligns with the project's goal of producing "interconnected documents."

### Terminal Summary Behavior
**Recommendation:** Print key stats AND the output path. Show a compact summary: file count, dependency count, TODO count, git branch count, and elapsed time. Then show the output path. This gives instant feedback without requiring the user to open the report. Keep it to 4-5 lines maximum.

**Confidence:** HIGH -- Standard CLI UX pattern (e.g., `npm audit`, `eslint`).

### Git: File Ownership, Churn, and Contributor Data
**Recommendation:** YES -- include file ownership (top contributor per file), churn (most-changed files), and contributor count as secondary metrics. Rationale: (1) Churn data is highly valuable for handover -- it shows where active development is happening. (2) File ownership helps identify who to ask questions. (3) The data comes from the same `git log` call, so the marginal cost is near zero. (4) These are classic "bus factor" indicators that any handover document should include.

**Confidence:** HIGH -- Git churn and ownership are standard in code intelligence tools (CodeScene, GitPrime, LinearB).

### Dependencies: Internal Cross-Module Imports
**Recommendation:** Defer to the AST analyzer. The dependency analyzer should focus on external package dependencies from manifest files. Internal cross-module imports are already captured by the Phase 2 `ParsedFile.imports` data. The AST analyzer (STAT-06) wraps ParserService and will naturally have access to import data. Adding import graph construction to the dependency analyzer would duplicate work and create confusion about which analyzer owns import data.

**Confidence:** HIGH -- Clean separation of concerns. External deps = DependencyGraph analyzer. Internal imports = AST analyzer.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom recursive readdir | fast-glob / fdir | 2020+ | 10-100x faster for large directories, handles edge cases (permissions, symlinks, encoding) |
| Manual .gitignore regex | `ignore` npm package | Stable since 2017 | Spec-compliant filtering verified against `git check-ignore`. Used by ESLint, Prettier |
| `nodegit` for git operations | `simple-git` (wraps git CLI) | 2019+ | GitHub Engineering switched away from `nodegit` due to native binding issues. simple-git is simpler, more reliable |
| `toml` npm package (TOML v0.4) | `smol-toml` (TOML v1.1.0) | 2023+ | The old `toml` package only supports TOML v0.4.0 (2013 spec). Modern Cargo.toml and pyproject.toml use v1.0+ features |
| MD5 for content hashing | SHA-256 | Ongoing | MD5 is cryptographically broken (collision attacks). SHA-256 is standard for content addressing. Node.js `crypto` supports both with equal performance |

**Deprecated/outdated:**
- **`toml` npm package** (BinaryMuse/toml-node): Only supports TOML v0.4.0, does not handle modern Cargo.toml features. Use `smol-toml` instead
- **`nodegit`**: Native N-API binding to libgit2. Heavy native dependency, problematic in CI, discontinued for many use cases. `simple-git` is the ecosystem standard
- **`globby`**: Still works but is heavier (637KB, 23 subdeps) than alternatives. `fast-glob` (513KB) or `tinyglobby` (179KB) are better choices

## Open Questions

1. **Cache Storage Location**
   - What we know: The cache needs to persist between runs. Options: `.handover/.cache.json` in project root, or `~/.cache/handover/{project-hash}/cache.json` in user cache.
   - What's unclear: Whether project-local cache (visible, easily deleted) or user-level cache (hidden, survives project cleanups) is better UX.
   - Recommendation: Use `.handover/.cache.json` in the project root. It is visible, easy to clear (`rm -rf .handover`), and does not require computing a project identity hash. Add `.handover/` to the project's own `.gitignore` recommendations in `handover init`.

2. **Outdated Dependency Detection Strategy**
   - What we know: User wants to "flag significantly outdated dependencies." This requires knowing what the current version is for each package.
   - What's unclear: Whether to hit package registries (npm, crates.io, PyPI) for latest versions, or use a heuristic (e.g., semver major version distance, age of the lock file).
   - Recommendation: For v1, use a heuristic approach. Check if the specified version is pinned to a major version that is 2+ behind a commonly-known-current version. For npm specifically, check `package-lock.json` or `yarn.lock` for resolved versions and compare to the ranges in `package.json`. Defer live registry checks to a future enhancement.

3. **Binary and Media File Handling**
   - What we know: `fast-glob` will discover all files. Binary files (images, compiled assets, fonts) should be counted in the file tree but not content-scanned.
   - What's unclear: How to reliably detect binary files.
   - Recommendation: Use extension-based detection (a set of known binary extensions: `.png`, `.jpg`, `.gif`, `.woff`, `.woff2`, `.ttf`, `.ico`, `.mp4`, `.mp3`, `.pdf`, `.zip`, `.tar`, `.gz`, `.exe`, `.dll`, `.so`, `.wasm`). Count them in file tree stats, skip them for TODO scanning, env scanning, and AST analysis. This is simple and reliable.

## Sources

### Primary (HIGH confidence)
- `ignore` npm package (Context7 /kaelzhang/node-ignore) -- API usage, `.gitignore` pattern filtering, createFilter, add patterns
- `fast-glob` npm package (Context7 /mrmlnc/fast-glob) -- glob options, stats, ignore, onlyFiles, synchronous/async
- `simple-git` npm package (Context7 /steveukx/git-js) -- log options, branch management, raw commands, BranchSummary type
- Node.js `crypto` docs (https://nodejs.org/api/crypto.html) -- createHash, SHA-256, update, digest
- `smol-toml` GitHub (https://github.com/squirrelchat/smol-toml) -- parse/stringify API, TOML 1.1.0 compliance, performance benchmarks

### Secondary (MEDIUM confidence)
- tinyglobby comparison (https://superchupu.dev/tinyglobby/comparison) -- fast-glob vs tinyglobby vs fdir benchmarks
- npm-check-updates (https://www.npmjs.com/package/npm-check-updates) -- programmatic outdated detection approaches
- go.mod format (https://pkg.go.dev/golang.org/x/mod/modfile) -- structure: module, go, require, replace directives
- pyproject.toml PEP 621 (https://peps.python.org/pep-0633/) -- [project] dependencies, optional-dependencies format

### Tertiary (LOW confidence)
- Exact performance characteristics of Promise.allSettled vs Promise.all for 8 concurrent analyzers -- likely negligible difference for 8 items, but allSettled is safer
- Binary file detection by extension -- comprehensive list may miss some edge cases, but extension-based detection is standard practice
- "Significantly outdated" heuristic -- no established standard; the 2-major-version rule is a reasonable starting point

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries verified via Context7 and npm. fast-glob (41M/week), ignore (36M/week), simple-git (3M/week) are established ecosystem standards
- Architecture: HIGH -- Concurrent analyzers via Promise.all is a well-understood pattern. The shared file-discovery layer + typed result envelope is clean and testable
- Dependency parsing: HIGH -- package.json is JSON (trivial), Cargo.toml/pyproject.toml use smol-toml (verified), go.mod/requirements.txt are line-based (simple regex)
- Git integration: HIGH -- simple-git API verified via Context7, branch/log/raw operations confirmed
- Caching: HIGH -- Node.js crypto.createHash is built-in and well-documented
- Pitfalls: HIGH -- Based on documented issues with .gitignore path handling, Promise.all error propagation, and git availability

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (all libraries are stable, established ecosystem tools)
