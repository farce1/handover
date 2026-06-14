import { readFile } from 'node:fs/promises';
import { isBinaryFile } from './file-discovery.js';
import type { AnalysisContext, AnalyzerResult, TodoItem, TodoResult } from './types.js';
import { logger } from '../utils/logger.js';
import { scanContentForTodos } from './todo-parse.js';

/**
 * STAT-04: TodoScanner Analyzer
 *
 * Walks source files and applies the pure marker parser in todo-parse.ts.
 */

export async function scanTodos(ctx: AnalysisContext): Promise<AnalyzerResult<TodoResult>> {
  const start = Date.now();

  try {
    const items: TodoItem[] = [];

    // Filter to non-binary files only
    const textFiles = ctx.files.filter((f) => !isBinaryFile(f.extension));

    // Process files in batches of 50 for memory efficiency
    for (let i = 0; i < textFiles.length; i += 50) {
      const batch = textFiles.slice(i, i + 50);
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const content = await readFile(file.absolutePath, 'utf-8');
            return scanContentForTodos(content, file.path);
          } catch (err) {
            logger.debug(
              `Failed to scan file for TODOs ${file.path}: ${err instanceof Error ? err.message : String(err)}`,
            );
            return [];
          }
        }),
      );
      for (const fileItems of batchResults) {
        items.push(...fileItems);
      }
    }

    // Build summary
    const byCategory: Record<string, number> = {};
    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    }

    const elapsed = Date.now() - start;
    return {
      success: true,
      data: {
        items,
        summary: {
          total: items.length,
          byCategory,
        },
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
