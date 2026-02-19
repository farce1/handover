import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isBinaryFile } from './file-discovery.js';
import type { AnalysisContext, AnalyzerResult, FileTreeResult } from './types.js';
import { logger } from '../utils/logger.js';

/**
 * STAT-01: FileTree Analyzer
 *
 * Analyzes the project's file structure: counts files, directories, sizes,
 * line counts, extension breakdown, largest files, and directory tree.
 */
export async function analyzeFileTree(
  ctx: AnalysisContext,
): Promise<AnalyzerResult<FileTreeResult>> {
  const start = Date.now();

  try {
    const files = ctx.files;
    const totalFiles = files.length;

    // Build extension breakdown
    const filesByExtension: Record<string, number> = {};
    for (const file of files) {
      const ext = file.extension || '(no extension)';
      filesByExtension[ext] = (filesByExtension[ext] ?? 0) + 1;
    }

    // Build directory set
    const dirSet = new Set<string>();
    for (const file of files) {
      let dir = dirname(file.path);
      while (dir && dir !== '.') {
        dirSet.add(dir);
        dir = dirname(dir);
      }
    }
    const totalDirs = dirSet.size;

    // Count lines for non-binary files in batches of 50
    let totalLines = 0;
    const lineCounts = new Map<string, number>();
    const nonBinaryFiles = files.filter((f) => !isBinaryFile(f.extension));

    for (let i = 0; i < nonBinaryFiles.length; i += 50) {
      const batch = nonBinaryFiles.slice(i, i + 50);
      const results = await Promise.all(
        batch.map(async (file) => {
          try {
            const content = await readFile(file.absolutePath, 'utf-8');
            const lines = content.split('\n').length;
            return { path: file.path, lines };
          } catch (err) {
            logger.debug(
              `Failed to read file for line count ${file.path}: ${err instanceof Error ? err.message : String(err)}`,
            );
            return { path: file.path, lines: 0 };
          }
        }),
      );
      for (const r of results) {
        lineCounts.set(r.path, r.lines);
        totalLines += r.lines;
      }
    }

    // Total size
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    // Largest files (top 20 by size)
    const sortedBySize = [...files].sort((a, b) => b.size - a.size);
    const largestFiles = sortedBySize.slice(0, 20).map((f) => ({
      path: f.path,
      size: f.size,
      lines: lineCounts.get(f.path) ?? 0,
    }));

    // Build directory tree: top 3 levels + files in largest set
    const largestPaths = new Set(largestFiles.map((f) => f.path));

    const directoryTree: FileTreeResult['directoryTree'] = [];

    // Add directories (top 3 levels)
    const dirChildCount = new Map<string, number>();
    for (const file of files) {
      const dir = dirname(file.path);
      dirChildCount.set(dir, (dirChildCount.get(dir) ?? 0) + 1);
    }

    for (const dir of dirSet) {
      const depth = dir.split('/').length;
      if (depth <= 3) {
        directoryTree.push({
          path: dir,
          type: 'directory',
          children: dirChildCount.get(dir) ?? 0,
        });
      }
    }

    // Add largest files as file entries in the tree
    for (const file of files) {
      if (largestPaths.has(file.path)) {
        directoryTree.push({
          path: file.path,
          type: 'file',
          size: file.size,
          lines: lineCounts.get(file.path) ?? 0,
        });
      }
    }

    // Sort tree entries by path
    directoryTree.sort((a, b) => a.path.localeCompare(b.path));

    const elapsed = Date.now() - start;
    return {
      success: true,
      data: {
        totalFiles,
        totalDirs,
        totalLines,
        totalSize,
        filesByExtension,
        largestFiles,
        directoryTree,
      },
      elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      elapsed,
    };
  }
}
