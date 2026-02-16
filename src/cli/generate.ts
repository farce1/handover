import pc from 'picocolors';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig, resolveApiKey } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { HandoverError } from '../utils/errors.js';
import { DAGOrchestrator } from '../orchestrator/dag.js';
import { createStep } from '../orchestrator/step.js';
import { runStaticAnalysis } from '../analyzers/coordinator.js';
import {
  formatMarkdownReport,
  formatTerminalSummary,
} from '../analyzers/report.js';

export interface GenerateOptions {
  provider?: string;
  model?: string;
  only?: string;
  staticOnly?: boolean;
  verbose?: boolean;
}

/**
 * Generate command handler.
 * Loads config, validates API key, and runs the DAG pipeline.
 *
 * CLI-02: User can run `handover generate` and see the DAG orchestrator
 * execute placeholder steps in dependency order.
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

    // Static-only mode: run only static analysis, skip AI steps entirely
    if (options.staticOnly) {
      const rootDir = resolve(process.cwd());

      logger.blank();
      logger.info(
        `${pc.bold('handover')} v0.1.0 — static analysis only`,
      );
      logger.blank();
      logger.info(`Analyzing ${pc.cyan(rootDir)}...`);
      logger.blank();

      const result = await runStaticAnalysis(rootDir, config);

      const outputDir = resolve(config.output);
      await mkdir(outputDir, { recursive: true });

      const outputPath = join(outputDir, 'static-analysis.md');
      const markdown = formatMarkdownReport(result);
      await writeFile(outputPath, markdown, 'utf-8');

      logger.blank();
      logger.success('Static analysis complete');
      logger.blank();
      console.log(formatTerminalSummary(result));
      logger.blank();
      logger.info(`Report written to: ${pc.cyan(outputPath)}`);
      return;
    }

    // Resolve API key (validates it exists — fail fast)
    resolveApiKey(config);

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

    // Build the DAG pipeline
    const startTime = Date.now();
    const rootDir = resolve(process.cwd());

    const orchestrator = new DAGOrchestrator({
      onStepStart: (_id, name) => logger.step(name, 'start'),
      onStepComplete: (result) => {
        const step = result.stepId;
        const name = stepNames.get(step) ?? step;
        logger.step(name, 'done');
      },
      onStepFail: (result) => {
        const step = result.stepId;
        const name = stepNames.get(step) ?? step;
        logger.step(name, 'fail');
      },
    });

    // Step name lookup (events only get IDs)
    const stepNames = new Map<string, string>();

    const steps = [
      createStep({
        id: 'static-analysis',
        name: 'Static Analysis',
        deps: [],
        execute: async () => {
          const result = await runStaticAnalysis(rootDir, config);
          return result;
        },
      }),
      createStep({
        id: 'ai-round-1',
        name: 'AI Round 1: Project Overview',
        deps: ['static-analysis'],
        execute: async () => {
          logger.log('AI analysis will run here (Phase 5)');
          return {};
        },
      }),
      createStep({
        id: 'ai-round-2',
        name: 'AI Round 2: Module Detection',
        deps: ['ai-round-1'],
        execute: async () => {
          logger.log('Module detection will run here (Phase 5)');
          return {};
        },
      }),
      createStep({
        id: 'render',
        name: 'Document Rendering',
        deps: ['ai-round-2'],
        execute: async () => {
          logger.log('Document rendering will run here (Phase 6)');
          return {};
        },
      }),
    ];

    for (const step of steps) {
      stepNames.set(step.id, step.name);
    }

    orchestrator.addSteps(steps);

    // Validate and execute
    const validation = orchestrator.validate();
    if (!validation.valid) {
      throw new HandoverError(
        'Invalid pipeline configuration',
        validation.errors.join('; '),
        'This is a bug — please report it',
      );
    }

    const results = await orchestrator.execute(config);

    const elapsed = Date.now() - startTime;
    const completed = [...results.values()].filter(
      (r) => r.status === 'completed',
    ).length;
    const failed = [...results.values()].filter(
      (r) => r.status === 'failed',
    ).length;

    logger.blank();
    if (failed === 0) {
      logger.success(
        `Pipeline complete — ${completed} steps in ${elapsed}ms`,
      );
    } else {
      logger.warn(
        `Pipeline finished with ${failed} failure(s) — ${completed}/${results.size} steps completed`,
      );
    }

    logger.log(
      'Static analysis pipeline active. AI steps pending Phase 5.',
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
