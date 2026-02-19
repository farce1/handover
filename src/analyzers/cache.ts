import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Compute SHA-256 hash of content for cache comparison.
 */
export function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * File-content-hash cache for skip-on-unchanged optimization.
 * Persists between runs as a JSON file mapping relative paths to content hashes.
 */
export class AnalysisCache {
  private entries = new Map<string, { hash: string; analyzedAt: number }>();
  private dirty = false;

  constructor(private readonly cachePath: string) {}

  /**
   * Load cache from disk. Corrupted cache files are silently ignored (start fresh).
   */
  async load(): Promise<void> {
    if (!existsSync(this.cachePath)) return;
    try {
      const raw = await readFile(this.cachePath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, { hash: string; analyzedAt: number }>;
      for (const [key, value] of Object.entries(data)) {
        this.entries.set(key, value);
      }
    } catch {
      // Corrupted cache -- start fresh
      this.entries.clear();
    }
  }

  /**
   * Check if a file's content hash matches the cached hash.
   */
  isUnchanged(relativePath: string, contentHash: string): boolean {
    return this.entries.get(relativePath)?.hash === contentHash;
  }

  /**
   * Update the cached hash for a file. Marks cache as dirty for save.
   */
  update(relativePath: string, contentHash: string): void {
    this.entries.set(relativePath, {
      hash: contentHash,
      analyzedAt: Date.now(),
    });
    this.dirty = true;
  }

  /**
   * Persist cache to disk if any entries were updated.
   * Creates parent directories if needed.
   */
  async save(): Promise<void> {
    if (!this.dirty) return;
    await mkdir(dirname(this.cachePath), { recursive: true });
    await writeFile(this.cachePath, JSON.stringify(Object.fromEntries(this.entries), null, 2));
  }

  /**
   * Return the set of file paths that have changed (or are new) since the last cache save.
   * Compares current content hashes against cached hashes.
   *
   * @param currentHashes - Map of relative file paths to their current SHA-256 content hashes
   * @returns Set of file paths whose hash differs from the cache (or are absent from cache)
   */
  getChangedFiles(currentHashes: Map<string, string>): Set<string> {
    const changed = new Set<string>();
    for (const [path, currentHash] of currentHashes) {
      if (!this.isUnchanged(path, currentHash)) {
        changed.add(path);
      }
    }
    return changed;
  }

  /**
   * Number of cached entries (for stats/diagnostics).
   */
  get size(): number {
    return this.entries.size;
  }
}
