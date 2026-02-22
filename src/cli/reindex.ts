/**
 * CLI handler for `handover reindex` command
 *
 * Rebuilds or updates the vector search index from generated documentation.
 */

import cliProgress from 'cli-progress';
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { handleCliError } from '../utils/errors.js';
import { reindexDocuments } from '../vector/reindex.js';
import type { ReindexProgressEvent } from '../vector/reindex.js';

/**
 * Options for reindex command
 */
export interface ReindexCommandOptions {
  /** Enable verbose logging */
  verbose?: boolean;
  /** Force re-embed all documents (bypass change detection) */
  force?: boolean;
}

/**
 * Run the reindex command
 */
export async function runReindex(options: ReindexCommandOptions): Promise<void> {
  try {
    // Load config
    const config = loadConfig();

    // Resolve output directory
    const outputDir = config.output;

    logger.info(`Reindexing documents from ${pc.cyan(outputDir)}`);

    if (options.force) {
      logger.warn('Force mode enabled - re-embedding all documents');
    }

    // Create progress bar
    const progressBar = new cliProgress.SingleBar(
      {
        format:
          'Reindexing | {bar} | {percentage}% | {value}/{total} chunks | {documentsProcessed}/{documentsTotal} docs',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
        stream: process.stderr, // Explicitly use stderr for MCP compatibility
      },
      cliProgress.Presets.shades_classic,
    );

    let progressStarted = false;
    let lastPhase: ReindexProgressEvent['phase'] | null = null;

    const stageLabels: Record<ReindexProgressEvent['phase'], string> = {
      scanning: 'Scanning generated documents',
      chunking: 'Chunking changed documents',
      embedding: 'Embedding chunk batches',
      storing: 'Writing vectors to SQLite index',
      complete: 'Finalizing reindex summary',
    };

    // Progress callback
    const onProgress = (event: ReindexProgressEvent) => {
      if (event.phase !== lastPhase) {
        logger.info(`Stage: ${stageLabels[event.phase]}`);
        lastPhase = event.phase;
      }

      if (event.phase === 'embedding' && !progressStarted) {
        progressBar.start(event.chunksTotal, 0, {
          documentsProcessed: event.documentsProcessed,
          documentsTotal: event.documentsTotal,
        });
        progressStarted = true;
      } else if (progressStarted) {
        progressBar.update(event.chunksProcessed, {
          documentsProcessed: event.documentsProcessed,
          documentsTotal: event.documentsTotal,
        });
      }
    };

    // Run reindexing
    const result = await reindexDocuments({
      config,
      outputDir,
      verbose: options.verbose,
      force: options.force,
      onProgress,
    });

    // Stop progress bar
    if (progressStarted) {
      progressBar.stop();
    }

    // Print summary
    logger.blank();

    logger.info(
      `Summary: processed ${result.documentsProcessed}, skipped ${result.documentsSkipped}, failed ${result.documentsFailed} (total ${result.documentsTotal}).`,
    );

    logger.info(
      `Embeddings: ${result.chunksCreated} stored chunks, ${result.totalTokens} tokens, model ${result.embeddingModel} (${result.embeddingDimensions}D).`,
    );

    if (result.documentsFailed > 0) {
      logger.warn('Reindex completed with partial failures.');
      for (const warning of result.warnings) {
        logger.warn(`- ${warning}`);
      }
      logger.warn(
        'Remediation: fix listed documents, then rerun `handover reindex --force --verbose`.',
      );
    } else if (result.documentsProcessed === 0 && result.documentsSkipped > 0) {
      logger.success(
        `All ${result.documentsSkipped} documents unchanged, index is already up to date.`,
      );
    } else {
      logger.success('Reindex completed successfully.');
      logger.info('Next steps:');
      logger.info('- handover search "architecture"');
      logger.info('- handover serve');
    }
  } catch (err) {
    handleCliError(err, 'Failed to reindex documents');
  }
}
