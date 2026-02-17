/**
 * Content-hash-based disk cache for AI round results.
 * Enables crash recovery by persisting completed round outputs.
 * Stale cache (content changed) is detected via hash comparison.
 *
 * Pattern follows src/analyzers/cache.ts (AnalysisCache) but operates
 * at round granularity with JSON file-per-round storage.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Shape of a cached round entry on disk. */
interface RoundCacheEntry {
  hash: string;
  roundNumber: number;
  model: string;
  result: unknown;
  createdAt: string;
}

/**
 * Disk cache for AI round results with content-hash invalidation.
 *
 * Each round is stored as a separate JSON file (`round-N.json`).
 * On read, the stored hash is compared to the expected hash —
 * if the analysis input changed, the cache is treated as stale.
 */
export class RoundCache {
  constructor(
    private readonly cacheDir: string = '.handover/cache/rounds',
  ) {}

  /**
   * Compute a fingerprint from discovered files (paths + sizes).
   * Sorted by path for determinism. Fast — no file content reading.
   */
  static computeAnalysisFingerprint(
    files: Array<{ path: string; size: number }>,
  ): string {
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    const data = sorted.map((f) => `${f.path}:${f.size}`).join('\n');
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Compute a content hash for a specific round.
   * Combines round number, model, and analysis fingerprint.
   */
  computeHash(
    roundNumber: number,
    model: string,
    analysisFingerprint: string,
  ): string {
    return createHash('sha256')
      .update(JSON.stringify({ roundNumber, model, analysisFingerprint }))
      .digest('hex');
  }

  /**
   * Retrieve a cached round result if it exists and the hash matches.
   *
   * @returns The cached result, or null if missing/stale/corrupted.
   */
  async get(
    roundNumber: number,
    expectedHash: string,
  ): Promise<unknown | null> {
    const filePath = join(this.cacheDir, `round-${roundNumber}.json`);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const raw = await readFile(filePath, 'utf-8');
      const entry = JSON.parse(raw) as RoundCacheEntry;

      // Stale cache — content changed since this was stored
      if (entry.hash !== expectedHash) {
        return null;
      }

      return entry.result;
    } catch {
      // Corrupted file — treat as cache miss
      return null;
    }
  }

  /**
   * Store a round result to disk.
   * Creates the cache directory if it does not exist.
   */
  async set(
    roundNumber: number,
    hash: string,
    result: unknown,
    model: string,
  ): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });

    const filePath = join(this.cacheDir, `round-${roundNumber}.json`);
    const entry: RoundCacheEntry = {
      hash,
      roundNumber,
      model,
      result,
      createdAt: new Date().toISOString(),
    };

    await writeFile(filePath, JSON.stringify(entry, null, 2));
  }

  /**
   * Remove all cached round files.
   * Called by --no-cache to force fresh execution.
   */
  async clear(): Promise<void> {
    if (existsSync(this.cacheDir)) {
      await rm(this.cacheDir, { recursive: true, force: true });
    }
  }

  /**
   * List which rounds are currently cached (sorted ascending).
   * Useful for displaying cache status to the user.
   */
  async getCachedRounds(): Promise<number[]> {
    if (!existsSync(this.cacheDir)) {
      return [];
    }

    try {
      const entries = await readdir(this.cacheDir);
      const roundNumbers: number[] = [];

      for (const entry of entries) {
        const match = entry.match(/^round-(\d+)\.json$/);
        if (match) {
          roundNumbers.push(parseInt(match[1], 10));
        }
      }

      return roundNumbers.sort((a, b) => a - b);
    } catch {
      return [];
    }
  }
}
