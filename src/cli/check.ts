import { resolve } from 'node:path';
import { loadConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { handleCliError } from '../utils/errors.js';
import { loadDepGraph } from '../regen/dep-graph.js';
import { getGitChangedFiles } from '../cache/git-fingerprint.js';
import { DOCUMENT_REGISTRY } from '../renderers/registry.js';
import { detectStaleDocs, formatStaleness } from '../regen/staleness.js';

export interface CheckOptions {
  since?: string;
  verbose?: boolean;
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
    const outputDir = config.output.replace(/^\.\//, '').replace(/\/+$/, '');

    const graph = await loadDepGraph(rootDir);
    if (!graph) {
      process.stderr.write('No dependency graph found. Run `handover generate` first.\n');
      process.exitCode = 2;
      return;
    }

    const git = await getGitChangedFiles(rootDir, options.since ?? 'HEAD');
    if (git.kind === 'fallback') {
      process.stderr.write(`Skipping staleness check: ${git.reason}.\n`);
      return;
    }

    // The tool's own cache/state dir is not a source change.
    const changedFiles = new Set([...git.changedFiles].filter((f) => !f.startsWith('.handover/')));

    const result = detectStaleDocs({
      changedFiles,
      graph,
      docs: DOCUMENT_REGISTRY.filter((d) => d.id !== '00-index'),
      outputDir,
    });

    process.stdout.write(formatStaleness(result));
    process.exitCode = result.stale.length > 0 ? 1 : 0;
  } catch (err) {
    handleCliError(err);
  }
}
