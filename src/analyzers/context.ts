import { join } from 'node:path';
import { discoverFiles } from './file-discovery.js';
import { AnalysisCache } from './cache.js';
import type { FileEntry, AnalysisContext } from './types.js';
import type { HandoverConfig } from '../config/schema.js';

// Re-export AnalysisContext from types for downstream convenience
export type { AnalysisContext } from './types.js';

/**
 * Build an immutable AnalysisContext from a project root and config.
 *
 * 1. Discovers all non-ignored files via fast-glob + .gitignore filtering
 * 2. Creates and loads the content-hash cache from .handover/.cache.json
 * 3. Returns a frozen context object (STAT-09: no analyzer can mutate shared state)
 */
export async function buildAnalysisContext(
  rootDir: string,
  config: HandoverConfig,
  options?: { gitDepth?: 'default' | 'full' },
): Promise<AnalysisContext> {
  // Discover files (shared, immutable file list for all analyzers)
  const files: FileEntry[] = await discoverFiles(rootDir);

  // Create and load content-hash cache
  const cache = new AnalysisCache(join(rootDir, '.handover', '.cache.json'));
  await cache.load();

  // Return frozen context -- Object.freeze ensures immutability
  return Object.freeze({
    rootDir,
    files: Object.freeze(files) as readonly FileEntry[],
    config,
    cache,
    gitDepth: options?.gitDepth ?? 'default',
  });
}
