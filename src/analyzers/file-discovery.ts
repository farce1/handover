import fg from 'fast-glob';
import ignore from 'ignore';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
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

/**
 * Known binary file extensions that should be counted in stats
 * but never content-scanned (TODO, env, AST analysis).
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

  // Apply .gitignore as secondary filter, then map to FileEntry
  const files: FileEntry[] = entries
    .filter((entry) => !ig.ignores(entry.path))
    .map((entry) => ({
      path: entry.path,
      absolutePath: join(rootDir, entry.path),
      size: entry.stats?.size ?? 0,
      extension: extname(entry.path),
    }));

  // Sort by path for deterministic output
  files.sort((a, b) => a.path.localeCompare(b.path));

  return files;
}
