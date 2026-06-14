import { resolve, relative } from 'node:path';
import { loadConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { handleCliError } from '../utils/errors.js';
import { loadDepGraph } from '../regen/dep-graph.js';
import { getGitChangedFiles } from '../cache/git-fingerprint.js';
import { DOCUMENT_REGISTRY } from '../renderers/registry.js';
import { detectStaleDocs, formatStaleness, formatStalenessJson } from '../regen/staleness.js';

export interface CheckOptions {
  since?: string;
  verbose?: boolean;
  json?: boolean;
}

/**
 * `handover check`: exit non-zero when generated docs are stale relative to
 * source changes since `--since` (default HEAD, i.e. uncommitted changes).
 * Intended as a CI gate alongside `handover generate --since`.
 */
export async function runCheck(options: CheckOptions): Promise<void> {
  try {
    if (options.verbose) logger.setVerbose(true);

    const config = loadConfig({});
    const rootDir = resolve(process.cwd());
    // Repo-relative, forward-slash form so it prefix-matches git's paths.
    const outputDir = relative(rootDir, resolve(rootDir, config.output)).replace(/\\/g, '/');

    const graph = await loadDepGraph(rootDir);
    if (!graph) {
      process.stderr.write('No dependency graph found. Run `handover generate` first.\n');
      process.exitCode = 2;
      return;
    }

    const since = options.since ?? 'HEAD';
    // Invalid ref → exit 2 (cannot determine), distinct from the stale code (1).
    const git = await getGitChangedFiles(rootDir, since).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Cannot compare against "${since}": ${message}\n`);
      process.exitCode = 2;
      return undefined;
    });
    if (!git) return;
    if (git.kind === 'fallback') {
      process.stderr.write(`Skipping staleness check: ${git.reason}.\n`);
      return;
    }

    // Ignore the tool's own cache/state dir. Any other unclaimed non-infra change
    // conservatively flags the whole corpus stale (consistent with `generate --since`).
    const changedFiles = new Set([...git.changedFiles].filter((f) => !f.startsWith('.handover/')));

    const result = detectStaleDocs({
      changedFiles,
      graph,
      docs: DOCUMENT_REGISTRY.filter((d) => d.id !== '00-index'),
      outputDir,
    });

    process.stdout.write(options.json ? formatStalenessJson(result) : formatStaleness(result));
    process.exitCode = result.stale.length > 0 ? 1 : 0;
  } catch (err) {
    handleCliError(err);
  }
}
