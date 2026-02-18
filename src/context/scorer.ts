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
 *   - Entry point:  +30 (boolean match)
 *   - Import count: +3 per importer, cap 30
 *   - Export count: +2 per export, cap 20
 *   - Git activity: +1 per change, cap 10
 *   - Edge cases:   +10 if any TODO/FIXME markers present
 *   - Config file:  +15 (boolean match)
 *
 * Test file penalty: -15 (floor at 0)
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
      entryPoint: ENTRY_POINT_PATTERNS.some((p) => p.test(path)) ? 30 : 0,

      importCount: Math.min(
        (importerCount.get(path) ??
          // Also try extensionless matching for files imported without extension
          importerCount.get(stripExtension(path)) ??
          0) * 3,
        30,
      ),

      exportCount: Math.min((exportMap.get(path) ?? 0) * 2, 20),

      gitActivity: Math.min(gitChanges.get(path) ?? 0, 10),

      edgeCases: (edgeCaseMap.get(path) ?? 0) > 0 ? 10 : 0,

      configFile: CONFIG_FILE_PATTERNS.some((p) => p.test(path)) ? 15 : 0,
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
      score -= 15;
    }

    // Cap at [0, 100]
    score = Math.max(0, Math.min(100, score));

    results.push({ path, score, breakdown });
  }

  // ─── Step 5: Sort and return ───────────────────────────────────────

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });

  return results;
}
