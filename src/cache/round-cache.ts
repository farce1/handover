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

/** Cache format version — bump when the entry shape changes. */
const CACHE_VERSION = 2;

/** Shape of a cached round entry on disk. */
interface RoundCacheEntry {
  version: number;
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
  private migrationHandled = false;
  private _gitignoreChecked = false;

  constructor(
    private readonly cacheDir: string = '.handover/cache/rounds',
    private readonly projectRoot: string = process.cwd(),
  ) {}

  /**
   * Compute a fingerprint from discovered files (paths + content hashes).
   * Sorted by path for determinism. Uses SHA-256 of file content (CACHE-01).
   */
  static computeAnalysisFingerprint(files: Array<{ path: string; contentHash: string }>): string {
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    const data = sorted.map((f) => `${f.path}:${f.contentHash}`).join('\n');
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Compute a content hash for a specific round.
   * Combines round number, model, analysis fingerprint, and prior round hashes (CACHE-02).
   */
  computeHash(
    roundNumber: number,
    model: string,
    analysisFingerprint: string,
    priorRoundHashes: string[] = [],
  ): string {
    return createHash('sha256')
      .update(JSON.stringify({ roundNumber, model, analysisFingerprint, priorRoundHashes }))
      .digest('hex');
  }

  /**
   * Compute a hash of a round's output result for use in cascade invalidation.
   * Used by the caller to hash a completed round's output before threading it
   * into downstream rounds via priorRoundHashes.
   */
  static computeResultHash(result: unknown): string {
    return createHash('sha256').update(JSON.stringify(result)).digest('hex');
  }

  /**
   * Whether a cache migration occurred during this session.
   * Allows the caller to display a warning to the user.
   */
  get wasMigrated(): boolean {
    return this.migrationHandled;
  }

  /**
   * Retrieve a cached round result if it exists and the hash matches.
   * Handles version migration: if the entry is from an older cache version,
   * the entire cache is cleared once and null is returned.
   *
   * @returns The cached result, or null if missing/stale/corrupted/migrated.
   */
  async get(roundNumber: number, expectedHash: string): Promise<unknown | null> {
    const filePath = join(this.cacheDir, `round-${roundNumber}.json`);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const raw = await readFile(filePath, 'utf-8');
      const entry = JSON.parse(raw) as RoundCacheEntry;

      // Version migration: clear cache once on first mismatch detected
      if (entry.version !== CACHE_VERSION) {
        if (!this.migrationHandled) {
          this.migrationHandled = true;
          await this.clear();
        }
        return null;
      }

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
   * Ensures .handover/cache is added to .gitignore.
   */
  async set(roundNumber: number, hash: string, result: unknown, model: string): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });

    const filePath = join(this.cacheDir, `round-${roundNumber}.json`);
    const entry: RoundCacheEntry = {
      version: CACHE_VERSION,
      hash,
      roundNumber,
      model,
      result,
      createdAt: new Date().toISOString(),
    };

    await writeFile(filePath, JSON.stringify(entry, null, 2));
    await this.ensureGitignored();
  }

  /**
   * Remove all cached round files.
   * Called during version migration to force fresh execution.
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

  /**
   * Ensure `.handover/cache` is listed in the project's `.gitignore`.
   * Runs at most once per RoundCache instance. Non-fatal if write fails.
   */
  private async ensureGitignored(): Promise<void> {
    if (this._gitignoreChecked) return;
    this._gitignoreChecked = true;

    const gitignorePath = join(this.projectRoot, '.gitignore');

    try {
      let content = '';
      try {
        content = await readFile(gitignorePath, 'utf-8');
      } catch {
        // .gitignore may not exist — start with empty content
      }

      // Check if already covered
      const lines = content.split('\n').map((l) => l.trim());
      if (lines.includes('.handover/cache') || lines.includes('.handover/')) {
        return;
      }

      // Append with proper newline handling
      const needsLeadingNewline = content.length > 0 && !content.endsWith('\n');
      const addition = `${needsLeadingNewline ? '\n' : ''}.handover/cache\n`;
      await writeFile(gitignorePath, content + addition, 'utf-8');
    } catch {
      // Non-fatal — gitignore update failure should not block cache writes
    }
  }
}
