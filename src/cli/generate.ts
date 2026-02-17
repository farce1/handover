import pc from 'picocolors';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
import { createRound1Step } from '../ai-rounds/round-1-overview.js';
import { createRound2Step } from '../ai-rounds/round-2-modules.js';
import { createRound3Step } from '../ai-rounds/round-3-features.js';
import { createRound4Step } from '../ai-rounds/round-4-architecture.js';
import { createRound5Step } from '../ai-rounds/round-5-edge-cases.js';
import { createRound6Step } from '../ai-rounds/round-6-deployment.js';
import {
  buildValidationSummary,
  formatValidationLine,
  buildFailureReport,
} from '../ai-rounds/summary.js';
import { TokenUsageTracker } from '../context/tracker.js';
import { scoreFiles } from '../context/scorer.js';
import { packFiles } from '../context/packer.js';
import { computeTokenBudget } from '../context/token-counter.js';
import { createProvider } from '../providers/factory.js';
import type { RoundExecutionResult } from '../ai-rounds/types.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext } from '../context/types.js';

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

    // Create the LLM provider and token tracker
    const provider = createProvider(config);
    const tracker = new TokenUsageTracker();
    const estimateTokensFn = (text: string) => provider.estimateTokens(text);

    // Shared mutable state for inter-round result passing.
    // Safe because the DAG guarantees dependency ordering -- a round's
    // execute() only runs after all its deps have completed and stored
    // their results.
    const roundResults = new Map<number, RoundExecutionResult<unknown>>();

    // Shared state populated by static-analysis step, consumed by round steps.
    // Uses deferred Proxy objects so round step creators can capture references
    // at construction time. The Proxy forwards all property access to the real
    // object once it is populated. This is safe because the DAG guarantees
    // the static-analysis step completes before any ai-round step executes.
    let staticAnalysisResult: StaticAnalysisResult | undefined;
    let packedContext: PackedContext | undefined;

    const deferredAnalysis = new Proxy({} as StaticAnalysisResult, {
      get: (_target, prop) => (staticAnalysisResult as Record<string | symbol, unknown>)?.[prop],
    });

    const deferredContext = new Proxy({} as PackedContext, {
      get: (_target, prop) => (packedContext as unknown as Record<string | symbol, unknown>)?.[prop],
    });

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

    // Helper to get typed round results from the shared Map
    type RoundResultOf<T> = RoundExecutionResult<T> | undefined;
    const getRound = <T>(n: number): RoundResultOf<T> =>
      roundResults.get(n) as RoundResultOf<T>;

    const steps = [
      // Step 1: Static Analysis + Context Packing
      createStep({
        id: 'static-analysis',
        name: 'Static Analysis',
        deps: [],
        execute: async () => {
          const result = await runStaticAnalysis(rootDir, config);
          staticAnalysisResult = result;

          // Context packing: score files and pack into token budget
          const scored = scoreFiles(result);
          const budget = computeTokenBudget(provider.maxContextTokens());
          const getFileContent = async (path: string) =>
            readFile(join(rootDir, path), 'utf-8');

          packedContext = await packFiles(
            scored,
            result.ast,
            budget,
            estimateTokensFn,
            getFileContent,
          );

          logger.log(
            `Context packed: ${packedContext.metadata.fullFiles} full, ` +
              `${packedContext.metadata.signatureFiles} signatures, ` +
              `${packedContext.metadata.skippedFiles} skipped ` +
              `(${packedContext.metadata.utilizationPercent}% budget)`,
          );

          return result;
        },
      }),

      // Step 2: AI Round 1 -- Project Overview (sequential after static-analysis)
      createRound1Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
      ),

      // Step 3: AI Round 2 -- Module Detection (sequential after Round 1)
      createRound2Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
        () => getRound<import('../ai-rounds/schemas.js').Round1Output>(1),
      ),

      // Step 4: AI Round 3 -- Feature Extraction (parallel with R5, R6 after R2)
      createRound3Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
        () => ({
          round1: getRound<import('../ai-rounds/schemas.js').Round1Output>(1),
          round2: getRound<import('../ai-rounds/schemas.js').Round2Output>(2),
        }),
      ),

      // Step 5: AI Round 4 -- Architecture Detection (sequential after R3)
      createRound4Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
        () => ({
          round1: getRound<import('../ai-rounds/schemas.js').Round1Output>(1),
          round2: getRound<import('../ai-rounds/schemas.js').Round2Output>(2),
          round3: getRound<import('../ai-rounds/schemas.js').Round3Output>(3),
        }),
      ),

      // Step 6: AI Round 5 -- Edge Cases & Conventions (parallel with R3, R6 after R2)
      createRound5Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
        () => ({
          round1: getRound<import('../ai-rounds/schemas.js').Round1Output>(1),
          round2: getRound<import('../ai-rounds/schemas.js').Round2Output>(2),
        }),
      ),

      // Step 7: AI Round 6 -- Deployment Inference (parallel with R3, R5 after R2)
      createRound6Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
        () => ({
          round1: getRound<import('../ai-rounds/schemas.js').Round1Output>(1),
          round2: getRound<import('../ai-rounds/schemas.js').Round2Output>(2),
        }),
      ),

      // Step 8: Document Rendering (placeholder for Phase 6)
      createStep({
        id: 'render',
        name: 'Document Rendering',
        deps: ['ai-round-4', 'ai-round-5', 'ai-round-6'],
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

    // Hook into step completion to store round results for inter-round passing
    const originalOnStepComplete = orchestrator['events'].onStepComplete;
    orchestrator['events'].onStepComplete = (result) => {
      originalOnStepComplete?.(result);

      // Extract round number from step ID (e.g., 'ai-round-1' -> 1)
      const match = result.stepId.match(/^ai-round-(\d+)$/);
      if (match && result.data) {
        const roundNumber = parseInt(match[1], 10);
        roundResults.set(roundNumber, result.data as RoundExecutionResult<unknown>);
      }
    };

    const dagResults = await orchestrator.execute(config);

    const elapsed = Date.now() - startTime;
    const completed = [...dagResults.values()].filter(
      (r) => r.status === 'completed',
    ).length;
    const failed = [...dagResults.values()].filter(
      (r) => r.status === 'failed',
    ).length;

    logger.blank();
    if (failed === 0) {
      logger.success(
        `Pipeline complete — ${completed} steps in ${elapsed}ms`,
      );
    } else {
      logger.warn(
        `Pipeline finished with ${failed} failure(s) — ${completed}/${dagResults.size} steps completed`,
      );
    }

    // Validation summary and failure report
    const pipelineSummary = buildValidationSummary(roundResults);
    logger.info(formatValidationLine(pipelineSummary));

    // Token usage summary
    logger.log(tracker.toSummary());

    // If any rounds are degraded/failed/skipped: log the failure report
    const hasProblemRounds = pipelineSummary.roundSummaries.some(
      (r) => r.status === 'degraded' || r.status === 'skipped' || r.status === 'failed',
    );
    if (hasProblemRounds) {
      logger.warn(buildFailureReport(roundResults));
    }
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
