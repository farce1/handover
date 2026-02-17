import fg from 'fast-glob';
import ignore from 'ignore';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { logger } from '../utils/logger.js';
import type { FileEntry } from './types.js';

/**
 * Directories excluded at traversal time by fast-glob (never entered).
 * This prevents performance problems from walking into large directories.
 */
const ALWAYS_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/__pycache__/**',
  '**/target/**',
  '**/vendor/**',
  '**/.handover/**',
];

/** Maximum file size in bytes -- files larger than this are skipped (2MB). */
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

/** Maximum line heuristic -- informational only, size-based filter is primary. */
const MAX_LINE_HEURISTIC = 50_000;

/**
 * Format a byte count as a human-readable string (KB, MB).
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Known binary file extensions -- these files are excluded entirely
 * from discovery results (invisible in file tree output).
 */
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.mp4',
  '.mp3',
  '.avi',
  '.mov',
  '.webm',
  '.wav',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.wasm',
  '.o',
  '.obj',
  '.pyc',
  '.class',
]);

/**
 * Check if a file extension indicates a binary file.
 * Comparison is case-insensitive.
 */
export function isBinaryFile(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Discover all non-ignored, non-binary-filtered files in a project.
 *
 * 1. Uses fast-glob with ALWAYS_IGNORE for traversal-level exclusion
 * 2. Applies root .gitignore patterns as a secondary filter
 * 3. Returns FileEntry[] sorted by path for deterministic output
 */
export async function discoverFiles(rootDir: string): Promise<FileEntry[]> {
  // Load .gitignore for secondary filtering
  const ig = ignore();
  const gitignorePath = join(rootDir, '.gitignore');
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, 'utf-8'));
  }

  // Walk filesystem -- fast-glob handles traversal-level exclusion
  const entries = await fg('**/*', {
    cwd: rootDir,
    onlyFiles: true,
    stats: true,
    dot: false,
    followSymbolicLinks: false,
    ignore: ALWAYS_IGNORE,
  });

  // Apply .gitignore as secondary filter, exclude binary files entirely,
  // and skip enormous files (>2MB) with a log warning.
  const files: FileEntry[] = [];

  for (const entry of entries) {
    // Secondary .gitignore filter
    if (ig.ignores(entry.path)) continue;

    const ext = extname(entry.path);
    const size = entry.stats?.size ?? 0;

    // Binary files are entirely invisible -- filtered out before file tree
    if (isBinaryFile(ext)) continue;

    // Enormous file filter -- skip files exceeding 2MB threshold
    if (size > MAX_FILE_SIZE_BYTES) {
      logger.warn(
        `Skipping enormous file: ${entry.path} (${formatBytes(size)}) -- exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB threshold`,
      );
      continue;
    }

    files.push({
      path: entry.path,
      absolutePath: join(rootDir, entry.path),
      size,
      extension: ext,
    });
  }

  // Sort by path for deterministic output
  files.sort((a, b) => a.path.localeCompare(b.path));

  return files;
}
