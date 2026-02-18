import { readFile } from 'node:fs/promises';
import { createParserService, isSupportedFile } from '../parsing/index.js';
import { isBinaryFile } from './file-discovery.js';
import type { ParsedFile } from '../parsing/types.js';
import type { AnalysisContext, AnalyzerResult, ASTResult } from './types.js';

/**
 * AST analyzer (STAT-06).
 *
 * Wraps the Phase 2 ParserService for batch extraction of exports, imports,
 * and function/class symbols from all supported source files.
 * Processes files in batches of 30 to avoid overwhelming WASM memory.
 * Handles individual file parse failures gracefully (logs warning, continues).
 */
export async function analyzeAST(ctx: AnalysisContext): Promise<AnalyzerResult<ASTResult>> {
  const start = performance.now();

  try {
    // Create and initialize parser service
    const service = await createParserService();
    await service.init();

    try {
      // Filter to supported, non-binary files
      const supportedFiles = ctx.files.filter(
        (file) => isSupportedFile(file.path) && !isBinaryFile(file.extension),
      );

      const parsedFiles: ParsedFile[] = [];
      const warnings: string[] = [];

      // Process files in batches of 30 to avoid overwhelming WASM memory
      const BATCH_SIZE = 30;
      for (let i = 0; i < supportedFiles.length; i += BATCH_SIZE) {
        const batch = supportedFiles.slice(i, i + BATCH_SIZE);

        for (const file of batch) {
          try {
            const content = await readFile(file.absolutePath, 'utf-8');
            const parsed = await service.parseFile(file.absolutePath, content);
            // Use relative path in parsed result for consistency
            parsedFiles.push({ ...parsed, path: file.path });
          } catch (error) {
            // Individual file parse failure: log warning and continue
            const msg = error instanceof Error ? error.message : String(error);
            warnings.push(`Failed to parse ${file.path}: ${msg}`);
          }
        }
      }

      // Build summary across all parsed files
      let totalFunctions = 0;
      let totalClasses = 0;
      let totalExports = 0;
      let totalImports = 0;
      const languageBreakdown: Record<string, number> = {};

      for (const pf of parsedFiles) {
        totalFunctions += pf.functions.length;
        totalClasses += pf.classes.length;
        totalExports += pf.exports.length;
        totalImports += pf.imports.length;
        languageBreakdown[pf.language] = (languageBreakdown[pf.language] ?? 0) + 1;
      }

      return {
        success: true,
        data: {
          files: parsedFiles,
          summary: {
            totalFunctions,
            totalClasses,
            totalExports,
            totalImports,
            languageBreakdown,
          },
        },
        elapsed: performance.now() - start,
      };
    } finally {
      // CRITICAL: Dispose WASM resources
      service.dispose();
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      elapsed: performance.now() - start,
    };
  }
}
