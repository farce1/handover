import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { isBinaryFile } from './file-discovery.js';
import type { AnalysisContext, AnalyzerResult, EnvResult } from './types.js';
import { logger } from '../utils/logger.js';
import { scanContentForEnvRefs, parseEnvFileVars } from './env-parse.js';

/**
 * STAT-05: EnvScanner Analyzer
 *
 * Walks files to find .env files and applies the pure env-var parser in
 * env-parse.ts across TypeScript/JavaScript, Python, Rust, and Go patterns.
 */

// Known .env file patterns
const ENV_FILE_PATTERNS = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.test',
  '.env.example',
  '.env.sample',
]);

export async function scanEnvVars(ctx: AnalysisContext): Promise<AnalyzerResult<EnvResult>> {
  const start = Date.now();

  try {
    const envFiles: EnvResult['envFiles'] = [];
    const envReferences: EnvResult['envReferences'] = [];
    const warnings: string[] = [];

    // Find .env files
    const envFileEntries = ctx.files.filter((f) => {
      const name = basename(f.path);
      return ENV_FILE_PATTERNS.has(name) || name.startsWith('.env');
    });

    // Parse .env files for variable names
    const envFileNames = new Set<string>();
    for (const file of envFileEntries) {
      try {
        const content = await readFile(file.absolutePath, 'utf-8');
        envFiles.push({ path: file.path, variables: parseEnvFileVars(content) });
        envFileNames.add(basename(file.path));
      } catch (err) {
        logger.debug(
          `Skipped unreadable .env file ${file.path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Check for .env without .env.example (potential secret exposure)
    if (
      envFileNames.has('.env') &&
      !envFileNames.has('.env.example') &&
      !envFileNames.has('.env.sample')
    ) {
      warnings.push(
        '.env file found without .env.example -- potential secret exposure risk. Consider adding a .env.example template.',
      );
    }

    // Scan source files for env var references in batches of 50
    const sourceFiles = ctx.files.filter(
      (f) => !isBinaryFile(f.extension) && !basename(f.path).startsWith('.env'),
    );

    for (let i = 0; i < sourceFiles.length; i += 50) {
      const batch = sourceFiles.slice(i, i + 50);
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const content = await readFile(file.absolutePath, 'utf-8');
            return scanContentForEnvRefs(content, file.path);
          } catch (err) {
            logger.debug(
              `Skipped unreadable source file ${file.path}: ${err instanceof Error ? err.message : String(err)}`,
            );
            return [];
          }
        }),
      );
      for (const refs of batchResults) {
        envReferences.push(...refs);
      }
    }

    const elapsed = Date.now() - start;
    return {
      success: true,
      data: { envFiles, envReferences, warnings },
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
