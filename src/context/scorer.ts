import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { ParsedFile } from '../parsing/types.js';
import type { FilePriority, ScoreBreakdown } from './types.js';

// ─── Lock files to exclude (zero handover value, machine-generated) ─────────

const LOCK_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'go.sum',
]);

// ─── Entry point patterns ───────────────────────────────────────────────────

const ENTRY_POINT_PATTERNS = [
  /^(index|main|app|server|cli)\.[^/]+$/, // Root-level entry points
  /\/(?:index|main|app|server)\.[^/]+$/, // Directory entry points
  /^src\/(?:index|main|app|server)\.[^/]+$/, // src/ entry points
];

// ─── Config file patterns ───────────────────────────────────────────────────

const CONFIG_FILE_PATTERNS = [
  /\.config\.[^/]+$/,
  /^\.?(babel|eslint|prettier|jest|vitest|webpack|tsconfig|rollup|vite)/,
  /^\.env/,
  /^(package\.json|Cargo\.toml|go\.mod|pyproject\.toml|Makefile|Dockerfile)$/,
];

// ─── Test file patterns ─────────────────────────────────────────────────────

const TEST_PATTERNS = [/\.test\./, /\.spec\./, /__tests__\//, /__test__\//];

// ─── File scoring weights (CTX-02) ──────────────────────────────────────────
// These weights define the relative importance of each scoring factor.
// They are internal constants — not user-configurable.

/** Bonus for entry point files (index, main, app, server) */
export const SCORE_ENTRY_POINT = 30 as const;

/** Bonus per unique importer (each file that imports this one) */
export const SCORE_IMPORT_PER_IMPORTER = 3 as const;

/** Maximum bonus from import count factor */
export const SCORE_IMPORT_CAP = 30 as const;

/** Bonus per exported symbol */
export const SCORE_EXPORT_PER_EXPORT = 2 as const;

/** Maximum bonus from export count factor */
export const SCORE_EXPORT_CAP = 20 as const;

/** Maximum bonus from git activity (change count, 1 point per change) */
export const SCORE_GIT_ACTIVITY_CAP = 10 as const;

/** Bonus when file contains TODO/FIXME markers */
export const SCORE_EDGE_CASES = 10 as const;

/** Bonus for configuration files (package.json, Dockerfile, etc.) */
export const SCORE_CONFIG_FILE = 15 as const;

/** Penalty applied to test files (.test., .spec., __tests__/) */
export const SCORE_TEST_PENALTY = 15 as const;

/** Minimum possible score (floor) */
export const SCORE_MIN = 0 as const;

/** Maximum possible score (cap) */
export const SCORE_MAX = 100 as const;

// ─── Commonly tried extensions for import resolution ────────────────────────

const EXTENSION_SUFFIXES = ['', '.ts', '.js', '.tsx', '.jsx', '/index.ts', '/index.js'];

// ─── Path resolution helpers ────────────────────────────────────────────────

/**
 * Resolve an import path relative to the importing file's directory.
 * Returns null for external packages (no `.` or `..` prefix).
 */
function resolveImportPath(fromDir: string, importSource: string): string | null {
  // Skip external packages
  if (!importSource.startsWith('.') && !importSource.startsWith('..')) {
    return null;
  }

  // Join fromDir + importSource and collapse segments
  const parts = fromDir ? fromDir.split('/') : [];
  const importParts = importSource.split('/');

  for (const segment of importParts) {
    if (segment === '.' || segment === '') {
      continue;
    } else if (segment === '..') {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }

  return parts.join('/');
}

/**
 * Build a reverse-import map: for each file path, how many unique files import it.
 */
function buildReverseImportMap(files: ParsedFile[], knownPaths: Set<string>): Map<string, number> {
  // Track which importers reference which paths (avoid double-counting)
  const importerSets = new Map<string, Set<string>>();

  for (const file of files) {
    const fromDir = file.path.includes('/')
      ? file.path.substring(0, file.path.lastIndexOf('/'))
      : '';

    for (const imp of file.imports) {
      const resolved = resolveImportPath(fromDir, imp.source);
      if (resolved === null) continue;

      // Try matching with common extensions
      for (const suffix of EXTENSION_SUFFIXES) {
        const candidate = resolved + suffix;
        if (knownPaths.has(candidate)) {
          let importers = importerSets.get(candidate);
          if (!importers) {
            importers = new Set<string>();
            importerSets.set(candidate, importers);
          }
          importers.add(file.path);
          break; // Found a match; stop trying extensions
        }
      }
    }
  }

  // Convert sets to counts
  const result = new Map<string, number>();
  for (const [path, importers] of importerSets) {
    result.set(path, importers.size);
  }
  return result;
}

/**
 * Strip file extension for extensionless import matching.
 * e.g., "src/utils/helpers.ts" -> "src/utils/helpers"
 */
function stripExtension(filePath: string): string {
  return filePath.replace(/\.[^./]+$/, '');
}

// ─── Main scorer ────────────────────────────────────────────────────────────

/**
 * Score all files from a StaticAnalysisResult using six CTX-02 weighted factors.
 *
 * Factors and caps:
 *   - Entry point:  +SCORE_ENTRY_POINT (boolean match)
 *   - Import count: +SCORE_IMPORT_PER_IMPORTER per importer, cap SCORE_IMPORT_CAP
 *   - Export count: +SCORE_EXPORT_PER_EXPORT per export, cap SCORE_EXPORT_CAP
 *   - Git activity: +1 per change, cap SCORE_GIT_ACTIVITY_CAP
 *   - Edge cases:   +SCORE_EDGE_CASES if any TODO/FIXME markers present
 *   - Config file:  +SCORE_CONFIG_FILE (boolean match)
 *
 * Test file penalty: -SCORE_TEST_PENALTY (floor at SCORE_MIN)
 * Lock files: excluded entirely
 *
 * Returns FilePriority[] sorted by score descending, tiebroken alphabetically.
 */
export function scoreFiles(analysis: StaticAnalysisResult): FilePriority[] {
  const { fileTree, gitHistory, todos, ast } = analysis;

  // ─── Step 1: Build known paths set and reverse-import map ───────────

  const knownPaths = new Set<string>(
    fileTree.directoryTree.filter((e) => e.type === 'file').map((e) => e.path),
  );

  const importerCount = buildReverseImportMap(ast.files, knownPaths);

  // ─── Step 2: Build lookup maps ─────────────────────────────────────

  // Git changes: path -> change count
  const gitChanges = new Map<string, number>();
  for (const entry of gitHistory.mostChangedFiles) {
    gitChanges.set(entry.path, entry.changes);
  }

  // Edge cases (TODOs): file -> count of items
  const edgeCaseMap = new Map<string, number>();
  for (const item of todos.items) {
    edgeCaseMap.set(item.file, (edgeCaseMap.get(item.file) ?? 0) + 1);
  }

  // Export count: path -> number of exports
  const exportMap = new Map<string, number>();
  for (const file of ast.files) {
    exportMap.set(file.path, file.exports.length);
  }

  // ─── Step 3: Collect all file paths ────────────────────────────────

  const allPaths = fileTree.directoryTree.filter((e) => e.type === 'file').map((e) => e.path);

  // ─── Step 4: Score each file ───────────────────────────────────────

  const results: FilePriority[] = [];

  // Build a set of extensionless paths for import matching
  const extensionlessToFull = new Map<string, string>();
  for (const p of knownPaths) {
    const stripped = stripExtension(p);
    // Only store first match (if collision, the explicit path match wins anyway)
    if (!extensionlessToFull.has(stripped)) {
      extensionlessToFull.set(stripped, p);
    }
  }

  for (const path of allPaths) {
    // Skip lock files
    const basename = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path;
    if (LOCK_FILES.has(basename)) {
      continue;
    }

    const breakdown: ScoreBreakdown = {
      entryPoint: ENTRY_POINT_PATTERNS.some((p) => p.test(path)) ? SCORE_ENTRY_POINT : 0,

      importCount: Math.min(
        (importerCount.get(path) ??
          // Also try extensionless matching for files imported without extension
          importerCount.get(stripExtension(path)) ??
          0) * SCORE_IMPORT_PER_IMPORTER,
        SCORE_IMPORT_CAP,
      ),

      exportCount: Math.min((exportMap.get(path) ?? 0) * SCORE_EXPORT_PER_EXPORT, SCORE_EXPORT_CAP),

      gitActivity: Math.min(gitChanges.get(path) ?? 0, SCORE_GIT_ACTIVITY_CAP),

      edgeCases: (edgeCaseMap.get(path) ?? 0) > 0 ? SCORE_EDGE_CASES : 0,

      configFile: CONFIG_FILE_PATTERNS.some((p) => p.test(path)) ? SCORE_CONFIG_FILE : 0,
    };

    // Sum breakdown
    let score =
      breakdown.entryPoint +
      breakdown.importCount +
      breakdown.exportCount +
      breakdown.gitActivity +
      breakdown.edgeCases +
      breakdown.configFile;

    // Test file penalty
    if (TEST_PATTERNS.some((p) => p.test(path))) {
      score -= SCORE_TEST_PENALTY;
    }

    // Cap at [SCORE_MIN, SCORE_MAX]
    score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, score));

    results.push({ path, score, breakdown });
  }

  // ─── Step 5: Sort and return ───────────────────────────────────────

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });

  return results;
}
