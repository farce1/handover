import pc from 'picocolors';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runStaticAnalysis } from '../analyzers/coordinator.js';
import {
  formatMarkdownReport,
  formatJsonReport,
  formatTerminalSummary,
} from '../analyzers/report.js';
import { loadConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { handleCliError } from '../utils/errors.js';

export interface AnalyzeOptions {
  provider?: string;
  model?: string;
  json?: boolean;
  gitDepth?: string;
  verbose?: boolean;
}

/**
 * CLI-03: `handover analyze` command handler.
 *
 * Runs the full static analysis pipeline at zero AI cost and outputs
 * either a markdown report (default) or JSON to stdout.
 */
export async function runAnalyze(options: AnalyzeOptions): Promise<void> {
  try {
    // Set verbosity
    if (options.verbose) {
      logger.setVerbose(true);
    }

    // Load config with CLI overrides
    const cliOverrides: Record<string, unknown> = {};
    if (options.provider) cliOverrides.provider = options.provider;
    if (options.model) cliOverrides.model = options.model;

    const config = loadConfig(cliOverrides);

    // Resolve root directory
    const rootDir = resolve(process.cwd());

    // Display header
    logger.blank();
    logger.info(`${pc.bold('handover')} v0.1.0 — static analysis`);
    logger.blank();
    logger.info(`Analyzing ${pc.cyan(rootDir)}...`);
    logger.blank();

    // Run static analysis
    const gitDepth = options.gitDepth === 'full' ? ('full' as const) : ('default' as const);
    const result = await runStaticAnalysis(rootDir, config, {
      gitDepth,
      onProgress: (analyzer, status) => {
        if (status === 'start') {
          logger.log(`Starting ${analyzer}...`);
        } else if (status === 'done') {
          logger.log(`Completed ${analyzer}`);
        } else {
          logger.log(`Failed ${analyzer}`);
        }
      },
    });

    // Output based on format flag
    if (options.json) {
      // JSON to stdout (no file written)
      console.log(formatJsonReport(result));
    } else {
      // Markdown report to output folder
      const outputDir = resolve(config.output);
      await mkdir(outputDir, { recursive: true });

      const outputPath = join(outputDir, 'static-analysis.md');
      const markdown = formatMarkdownReport(result);
      await writeFile(outputPath, markdown, 'utf-8');

      // Print terminal summary
      logger.blank();
      logger.success('Static analysis complete');
      logger.blank();
      console.log(formatTerminalSummary(result));
      logger.blank();
      logger.info(`Report written to: ${pc.cyan(outputPath)}`);
    }
  } catch (err) {
    handleCliError(err, 'An unexpected error occurred during static analysis');
  }
}
