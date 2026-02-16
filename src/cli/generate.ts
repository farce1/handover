import pc from 'picocolors';
import { loadConfig, resolveApiKey } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { HandoverError } from '../utils/errors.js';

export interface GenerateOptions {
  provider?: string;
  model?: string;
  only?: string;
  staticOnly?: boolean;
  verbose?: boolean;
}

/**
 * Generate command handler.
 * Loads config, validates API key, and invokes the pipeline.
 *
 * CLI-02: User can run `handover generate` to produce documentation.
 * SEC-03: Terminal indicates when code sent to cloud.
 */
export async function runGenerate(options: GenerateOptions): Promise<void> {
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

    // Resolve API key (validates it exists)
    const apiKey = resolveApiKey(config);

    // Display header
    logger.blank();
    logger.info(
      `${pc.bold('handover')} v0.1.0 — analyzing ${pc.cyan(config.project.name ?? 'project')}`,
    );
    logger.blank();

    // SEC-03: Clear indication when code is sent to cloud
    if (config.provider !== 'ollama') {
      logger.warn(
        `Code will be sent to ${pc.bold(config.provider)} (${pc.cyan(config.model ?? 'default')}) for analysis`,
      );
    } else {
      logger.success('Using Ollama — all analysis runs locally');
    }
    logger.blank();

    // Placeholder: Pipeline execution (Plans 03 wires this to the DAG orchestrator)
    logger.step('Static Analysis', 'start');
    logger.log('Static analysis will run here (Phase 3)');
    logger.step('Static Analysis', 'done');

    logger.step('AI Round 1: Project Overview', 'start');
    logger.log('AI analysis will run here (Phase 5)');
    logger.step('AI Round 1: Project Overview', 'done');

    logger.step('Document Rendering', 'start');
    logger.log('Document rendering will run here (Phase 6)');
    logger.step('Document Rendering', 'done');

    logger.blank();
    logger.success(
      `Pipeline foundation ready. Implement analyzers in Phase 2-3.`,
    );
  } catch (err) {
    if (err instanceof HandoverError) {
      logger.error(err);
      process.exit(1);
    }
    // Wrap unknown errors
    const wrapped = new HandoverError(
      err instanceof Error ? err.message : String(err),
      'An unexpected error occurred',
      'Check the error above and try again',
    );
    logger.error(wrapped);
    process.exit(1);
  }
}
