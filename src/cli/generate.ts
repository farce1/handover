import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig, resolveApiKey } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { HandoverError, handleCliError } from '../utils/errors.js';
import { DAGOrchestrator } from '../orchestrator/dag.js';
import { createStep } from '../orchestrator/step.js';
import { runStaticAnalysis } from '../analyzers/coordinator.js';
import { formatMarkdownReport } from '../analyzers/report.js';
import { detectMonorepo } from './monorepo.js';
import { createRound1Step } from '../ai-rounds/round-1-overview.js';
import { createRound2Step } from '../ai-rounds/round-2-modules.js';
import { createRound3Step } from '../ai-rounds/round-3-features.js';
import { createRound4Step } from '../ai-rounds/round-4-architecture.js';
import { createRound5Step } from '../ai-rounds/round-5-edge-cases.js';
import { createRound6Step } from '../ai-rounds/round-6-deployment.js';
import { TokenUsageTracker } from '../context/tracker.js';
import { scoreFiles } from '../context/scorer.js';
import { packFiles } from '../context/packer.js';
import { computeTokenBudget } from '../context/token-counter.js';
import { createProvider, validateProviderConfig } from '../providers/factory.js';
import { PROVIDER_PRESETS } from '../providers/presets.js';
import { RoundCache } from '../cache/round-cache.js';
import { createRenderer } from '../ui/renderer.js';
import { ROUND_NAMES } from '../ai-rounds/types.js';
import {
  DOCUMENT_REGISTRY,
  ROUND_DEPS,
  resolveSelectedDocs,
  computeRequiredRounds,
} from '../renderers/registry.js';
import type { RenderContext, DocumentStatus } from '../renderers/types.js';
import { renderIndex } from '../renderers/render-00-index.js';
import { determineDocStatus } from '../renderers/utils.js';
import type { RoundExecutionResult } from '../ai-rounds/types.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext } from '../context/types.js';
import type { DisplayState, AnalyzerStatus } from '../ui/types.js';
import type { DAGEvents, StepDefinition } from '../domain/types.js';
import type {
  Round1Output,
  Round2Output,
  Round3Output,
  Round4Output,
  Round5Output,
  Round6Output,
} from '../ai-rounds/schemas.js';

export interface GenerateOptions {
  provider?: string;
  model?: string;
  only?: string;
  audience?: string;
  staticOnly?: boolean;
  verbose?: boolean;
  cache?: boolean;
}

/**
 * Map a file extension to a human-readable language name.
 */
function extToLanguage(ext: string): string {
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'TypeScript';
    case '.js':
    case '.jsx':
      return 'JavaScript';
    case '.py':
      return 'Python';
    case '.rs':
      return 'Rust';
    case '.go':
      return 'Go';
    case '.java':
      return 'Java';
    case '.rb':
      return 'Ruby';
    default:
      // Capitalize the extension without the dot
      return ext.replace(/^\./, '').charAt(0).toUpperCase() + ext.replace(/^\./, '').slice(1);
  }
}

/**
 * Generate command handler.
 * Loads config, validates API key, and runs the DAG pipeline.
 *
 * CLI-02: User can run `handover generate` and see the DAG orchestrator
 * execute steps in dependency order with rich terminal progress.
 * SEC-03: Terminal indicates when code sent to cloud (via banner).
 */
export async function runGenerate(options: GenerateOptions): Promise<void> {
  const renderer = createRenderer();

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

    // Determine if provider is local (drives LOCAL badge and cost omission)
    const preset = PROVIDER_PRESETS[config.provider];
    const isLocal = preset?.isLocal ?? false;

    // Monorepo detection -- non-blocking warning before pipeline starts
    const projectRoot = resolve(process.cwd());
    const monorepo = detectMonorepo(projectRoot);
    if (monorepo.isMonorepo) {
      const toolLabel = monorepo.tool ?? 'unknown';
      logger.warn(
        `Monorepo detected (${toolLabel} workspaces). ` +
          `Run \`handover generate\` from a specific package directory for best results.`,
      );
    }

    // Mutable display state -- updated throughout the pipeline, renderer reads it
    const displayState: DisplayState = {
      phase: 'startup',
      projectName: config.project.name ?? 'project',
      provider: config.provider,
      model: config.model ?? 'default',
      fileCount: 0,
      language: '',
      isLocal,
      analyzers: new Map(),
      analyzerElapsedMs: 0,
      rounds: new Map(),
      totalTokens: 0,
      totalCost: 0,
      costWarningThreshold: config.costWarningThreshold ?? 1.0,
      elapsedMs: 0,
      renderedDocs: [],
      completionDocs: 0,
      errors: [],
    };

    // Suppress logger during renderer-managed output
    logger.setSuppressed(true);

    // Static-only mode: run only static analysis, skip AI steps entirely
    if (options.staticOnly) {
      const rootDir = resolve(process.cwd());

      // Initialize analyzers for progress display
      const ANALYZER_NAMES = [
        'file-tree',
        'dependencies',
        'git-history',
        'todos',
        'env',
        'ast',
        'tests',
        'docs',
      ];
      for (const name of ANALYZER_NAMES) {
        displayState.analyzers.set(name, 'pending');
      }
      displayState.phase = 'static-analysis';

      // Show banner (file count / language updated later)
      renderer.onBanner(displayState);

      const analyzerStart = Date.now();
      const result = await runStaticAnalysis(rootDir, config, {
        onProgress: (analyzer, status) => {
          const mapped: AnalyzerStatus =
            status === 'start' ? 'running' : status === 'fail' ? 'failed' : 'done';
          displayState.analyzers.set(analyzer, mapped);
          displayState.analyzerElapsedMs = Date.now() - analyzerStart;
          if (status === 'fail') {
            displayState.errors.push({
              source: `Analyzer: ${analyzer}`,
              message: `${analyzer} failed during static analysis`,
            });
          }
          renderer.onAnalyzerUpdate(displayState);
        },
      });

      // Detect language from file extensions
      const exts = result.fileTree.filesByExtension;
      const topExt = Object.entries(exts).sort((a, b) => b[1] - a[1])[0];
      displayState.language = topExt ? extToLanguage(topExt[0]) : 'Unknown';
      displayState.fileCount = result.metadata.fileCount;
      displayState.analyzerElapsedMs = Date.now() - analyzerStart;
      renderer.onAnalyzersDone(displayState);

      // Write static analysis report
      const outputDir = resolve(config.output);
      await mkdir(outputDir, { recursive: true });
      const outputPath = join(outputDir, 'static-analysis.md');
      const markdown = formatMarkdownReport(result);
      await writeFile(outputPath, markdown, 'utf-8');

      // Completion
      displayState.phase = 'complete';
      displayState.elapsedMs = Date.now() - analyzerStart;
      displayState.completionDocs = 1;
      renderer.onComplete(displayState);
      return;
    }

    // Fail-fast validation before pipeline starts (PROV-05)
    validateProviderConfig(config);

    // Resolve API key (validates it exists -- fail fast)
    resolveApiKey(config);

    // Initialize round cache for crash recovery
    const roundCache = new RoundCache();
    if (options.cache === false) {
      await roundCache.clear();
    }

    // Show startup banner (SEC-03: provider/model in banner serves as cloud indicator)
    renderer.onBanner(displayState);

    // Resolve audience mode: CLI --audience overrides config
    const audience: 'human' | 'ai' =
      options.audience === 'ai' ? 'ai' : (config.audience ?? 'human');

    // Resolve selected documents and required AI rounds
    const selectedDocs = resolveSelectedDocs(options.only, DOCUMENT_REGISTRY);
    const requiredRounds = computeRequiredRounds(selectedDocs);

    // Build the DAG pipeline
    const startTime = Date.now();
    const rootDir = resolve(process.cwd());

    // Create the LLM provider and token tracker
    const provider = createProvider(config);
    const tracker = new TokenUsageTracker(0.85, config.model ?? 'claude-opus-4-6');
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
    let analysisFingerprint = '';
    let isEmptyRepo = false;

    const deferredAnalysis = new Proxy({} as StaticAnalysisResult, {
      get: (_target, prop) => (staticAnalysisResult as Record<string | symbol, unknown>)?.[prop],
    });

    const deferredContext = new Proxy({} as PackedContext, {
      get: (_target, prop) =>
        (packedContext as unknown as Record<string | symbol, unknown>)?.[prop],
    });

    // Helper to get typed round results from the shared Map
    type RoundResultOf<T> = RoundExecutionResult<T> | undefined;
    const getRound = <T>(n: number): RoundResultOf<T> => roundResults.get(n) as RoundResultOf<T>;

    // Create per-round onRetry callbacks that delegate to the orchestrator's onStepRetry event
    const makeOnRetry =
      (roundNum: number) => (attempt: number, delayMs: number, reason: string) => {
        orchestratorEvents.onStepRetry?.(`ai-round-${roundNum}`, attempt, delayMs, reason);
      };

    // DAG orchestrator events -- update display state and call renderer
    const orchestratorEvents: DAGEvents = {
      onStepStart: (id, name) => {
        // AI round steps start with 'ai-round-'
        const match = id.match(/^ai-round-(\d+)$/);
        if (match) {
          const roundNum = parseInt(match[1], 10);
          const roundName = ROUND_NAMES[roundNum] ?? name;
          displayState.rounds.set(roundNum, {
            roundNumber: roundNum,
            name: roundName,
            status: 'running',
            elapsedMs: 0,
          });
          renderer.onRoundUpdate(displayState);
        }
      },
      onStepComplete: (result) => {
        const match = result.stepId.match(/^ai-round-(\d+)$/);
        if (match && result.data) {
          const roundNum = parseInt(match[1], 10);
          roundResults.set(roundNum, result.data as RoundExecutionResult<unknown>);

          // Don't overwrite cached status -- cache wrapper already set display state
          const existingRd = displayState.rounds.get(roundNum);
          if (existingRd?.status === 'cached') return;

          // Update display state with round completion info
          const rd = displayState.rounds.get(roundNum);
          const roundData = result.data as RoundExecutionResult<unknown>;
          if (rd) {
            // Degraded rounds returned a result but failed quality checks -- show as failed (red X), not done (green check)
            rd.status = roundData.status === 'degraded' ? 'failed' : 'done';
            rd.tokens = roundData.tokens;
            rd.cost = roundData.cost;
            rd.elapsedMs = result.duration;
            rd.retrying = false; // Clear any retry state from a preceding retry attempt
          }

          // If degraded, also record an error and affected docs
          if (roundData.status === 'degraded') {
            const affectedDocs = DOCUMENT_REGISTRY.filter((d) =>
              d.requiredRounds.includes(roundNum),
            ).map((d) => d.filename);
            displayState.errors.push({
              source: `Round ${roundNum}`,
              message: 'Degraded: round completed but failed quality checks',
              affectedDocs,
            });
          }

          displayState.totalTokens = tracker.getTotalUsage().input + tracker.getTotalUsage().output;
          displayState.totalCost = tracker.getTotalCost();
          renderer.onRoundUpdate(displayState);
        }
      },
      onStepFail: (result) => {
        const match = result.stepId.match(/^ai-round-(\d+)$/);
        if (match) {
          const roundNum = parseInt(match[1], 10);
          const rd = displayState.rounds.get(roundNum);
          if (rd) {
            rd.status = 'failed';
          }
          // Determine affected documents
          const affectedDocs = DOCUMENT_REGISTRY.filter((d) =>
            d.requiredRounds.includes(roundNum),
          ).map((d) => d.filename);
          displayState.errors.push({
            source: `Round ${roundNum}`,
            message: result.error instanceof Error ? result.error.message : String(result.error),
            affectedDocs,
          });
          renderer.onRoundUpdate(displayState);
        }
      },
      onStepRetry: (stepId, attempt, delayMs, reason) => {
        const match = stepId.match(/^ai-round-(\d+)$/);
        if (match) {
          const roundNum = parseInt(match[1], 10);
          const rd = displayState.rounds.get(roundNum);
          if (rd) {
            rd.retrying = true;
            rd.retryDelayMs = delayMs;
            rd.retryStartMs = Date.now();
            rd.retryReason = reason;
          }
          renderer.onRoundUpdate(displayState);
        }
      },
    };

    const orchestrator = new DAGOrchestrator(orchestratorEvents);

    // Initialize analyzer map and run static analysis with progress
    const ANALYZER_NAMES = [
      'file-tree',
      'dependencies',
      'git-history',
      'todos',
      'env',
      'ast',
      'tests',
      'docs',
    ];
    for (const name of ANALYZER_NAMES) {
      displayState.analyzers.set(name, 'pending');
    }
    displayState.phase = 'static-analysis';

    const steps = [
      // Step 1: Static Analysis + Context Packing (always runs)
      createStep({
        id: 'static-analysis',
        name: 'Static Analysis',
        deps: [],
        execute: async () => {
          const analyzerStart = Date.now();
          const result = await runStaticAnalysis(rootDir, config, {
            onProgress: (analyzer, status) => {
              const mapped: AnalyzerStatus =
                status === 'start' ? 'running' : status === 'fail' ? 'failed' : 'done';
              displayState.analyzers.set(analyzer, mapped);
              displayState.analyzerElapsedMs = Date.now() - analyzerStart;
              if (status === 'fail') {
                displayState.errors.push({
                  source: `Analyzer: ${analyzer}`,
                  message: `${analyzer} failed during static analysis`,
                });
              }
              renderer.onAnalyzerUpdate(displayState);
            },
          });
          staticAnalysisResult = result;

          // Check for empty repo (no source files after filtering)
          if (result.metadata.fileCount === 0) {
            isEmptyRepo = true;
          }

          // Compute fingerprint for round cache invalidation
          // Use directoryTree file entries (path + size) for deterministic hashing
          const fileEntries = result.fileTree.directoryTree
            .filter((e) => e.type === 'file')
            .map((f) => ({ path: f.path, size: f.size ?? 0 }));
          analysisFingerprint = RoundCache.computeAnalysisFingerprint(fileEntries);

          // Detect language from file extensions
          const exts = result.fileTree.filesByExtension;
          const topExt = Object.entries(exts).sort((a, b) => b[1] - a[1])[0];
          displayState.language = topExt ? extToLanguage(topExt[0]) : 'Unknown';
          displayState.fileCount = result.metadata.fileCount;
          displayState.analyzerElapsedMs = Date.now() - analyzerStart;
          renderer.onAnalyzersDone(displayState);

          // Context packing: score files and pack into token budget
          const scored = scoreFiles(result);
          const budget = computeTokenBudget(provider.maxContextTokens());
          const getFileContent = async (path: string) => readFile(join(rootDir, path), 'utf-8');

          packedContext = await packFiles(
            scored,
            result.ast,
            budget,
            estimateTokensFn,
            getFileContent,
          );

          // Transition to AI rounds phase
          displayState.phase = 'ai-rounds';

          return result;
        },
      }),
    ];

    // Wrap a round step with cache awareness: check cache before executing,
    // store result after successful execution. Cached rounds skip API calls entirely.
    const wrapWithCache = (roundNum: number, step: StepDefinition): StepDefinition => {
      const originalExecute = step.execute;
      return createStep({
        id: step.id,
        name: step.name,
        deps: [...step.deps],
        execute: async (context) => {
          // Skip AI rounds entirely for empty repos (no source files)
          if (isEmptyRepo) {
            return null;
          }

          const modelName = config.model ?? preset?.defaultModel ?? 'default';
          const hash = roundCache.computeHash(roundNum, modelName, analysisFingerprint);
          const cached = await roundCache.get(roundNum, hash);
          if (cached) {
            // Report cached round to display
            const roundName = ROUND_NAMES[roundNum] ?? `Round ${roundNum}`;
            displayState.rounds.set(roundNum, {
              roundNumber: roundNum,
              name: roundName,
              status: 'cached',
              elapsedMs: 0,
            });
            renderer.onRoundUpdate(displayState);
            // Store in roundResults for downstream rounds
            roundResults.set(roundNum, cached as RoundExecutionResult<unknown>);
            return cached;
          }
          // Execute normally
          const result = await originalExecute(context);
          // Cache the result for future runs
          if (result) {
            await roundCache.set(roundNum, hash, result, modelName);
          }
          return result;
        },
      });
    };

    // Conditionally register AI round steps based on requiredRounds (--only optimization)
    if (requiredRounds.has(1)) {
      const step = createRound1Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
        makeOnRetry(1),
      );
      steps.push(wrapWithCache(1, step));
    }

    if (requiredRounds.has(2)) {
      const step = createRound2Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
        () => getRound<Round1Output>(1),
        makeOnRetry(2),
      );
      steps.push(wrapWithCache(2, step));
    }

    if (requiredRounds.has(3)) {
      const step = createRound3Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
        () => ({
          round1: getRound<Round1Output>(1),
          round2: getRound<Round2Output>(2),
        }),
        makeOnRetry(3),
      );
      steps.push(wrapWithCache(3, step));
    }

    if (requiredRounds.has(4)) {
      const step = createRound4Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
        () => ({
          round1: getRound<Round1Output>(1),
          round2: getRound<Round2Output>(2),
          round3: getRound<Round3Output>(3),
        }),
        makeOnRetry(4),
      );
      steps.push(wrapWithCache(4, step));
    }

    if (requiredRounds.has(5)) {
      const step = createRound5Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
        () => ({
          round1: getRound<Round1Output>(1),
          round2: getRound<Round2Output>(2),
        }),
        makeOnRetry(5),
      );
      steps.push(wrapWithCache(5, step));
    }

    if (requiredRounds.has(6)) {
      const step = createRound6Step(
        provider,
        deferredAnalysis,
        deferredContext,
        config,
        tracker,
        estimateTokensFn,
        () => ({
          round1: getRound<Round1Output>(1),
          round2: getRound<Round2Output>(2),
        }),
        makeOnRetry(6),
      );
      steps.push(wrapWithCache(6, step));
    }

    // Compute render step dependencies dynamically from registered rounds.
    // Terminal rounds = those not depended upon by any other registered round.
    const registeredRoundIds = [...requiredRounds].map((n) => `ai-round-${n}`);
    const terminalRounds = registeredRoundIds.filter((id) => {
      const roundNum = parseInt(id.split('-')[2], 10);
      return !registeredRoundIds.some((otherId) => {
        const otherNum = parseInt(otherId.split('-')[2], 10);
        return otherNum !== roundNum && ROUND_DEPS[otherNum]?.includes(roundNum);
      });
    });
    const renderDeps = terminalRounds.length > 0 ? terminalRounds : ['static-analysis'];

    // Render step (always runs -- produces documents on disk)
    steps.push(
      createStep({
        id: 'render',
        name: 'Document Rendering',
        deps: renderDeps,
        execute: async () => {
          displayState.phase = 'rendering';

          // Signal rounds done before transitioning to rendering
          renderer.onRoundsDone(displayState);

          // Empty repo short-circuit: produce minimal INDEX + overview
          if (isEmptyRepo) {
            const outputDir = resolve(config.output);
            await mkdir(outputDir, { recursive: true });

            const overviewContent = renderEmptyRepoOverview();
            await writeFile(join(outputDir, '01-PROJECT-OVERVIEW.md'), overviewContent, 'utf-8');
            displayState.renderedDocs.push('01-PROJECT-OVERVIEW.md');
            renderer.onDocRendered(displayState);

            const emptyStatuses: DocumentStatus[] = [
              {
                id: '01-project-overview',
                filename: '01-PROJECT-OVERVIEW.md',
                title: 'Project Overview',
                status: 'static-only',
                reason: 'Empty repository -- no source files found',
              },
            ];

            // Add not-generated statuses for all other documents
            for (const doc of DOCUMENT_REGISTRY) {
              if (doc.id === '00-index' || doc.id === '01-project-overview') continue;
              emptyStatuses.push({
                id: doc.id,
                filename: doc.filename,
                title: doc.title,
                status: 'not-generated',
                reason: 'Empty repository -- no source files to analyze',
              });
            }

            const emptyCtx: RenderContext = {
              rounds: {},
              staticAnalysis: staticAnalysisResult!,
              config,
              audience,
              generatedAt: new Date().toISOString(),
              projectName: config.project.name ?? 'Unknown Project',
            };
            const indexContent = renderIndex(emptyCtx, emptyStatuses);
            await writeFile(join(outputDir, '00-INDEX.md'), indexContent, 'utf-8');
            displayState.renderedDocs.push('00-INDEX.md');
            renderer.onDocRendered(displayState);

            return { generatedDocs: emptyStatuses, outputDir };
          }

          // Build the RenderContext from pipeline results
          const ctx: RenderContext = {
            rounds: {
              r1: getRound<Round1Output>(1),
              r2: getRound<Round2Output>(2),
              r3: getRound<Round3Output>(3),
              r4: getRound<Round4Output>(4),
              r5: getRound<Round5Output>(5),
              r6: getRound<Round6Output>(6),
            },
            staticAnalysis: staticAnalysisResult!,
            config,
            audience,
            generatedAt: new Date().toISOString(),
            projectName:
              getRound<Round1Output>(1)?.data?.projectName ??
              config.project.name ??
              'Unknown Project',
          };

          // Create output directory
          const outputDir = resolve(config.output);
          await mkdir(outputDir, { recursive: true });

          // Render each selected document (except INDEX, generated last)
          const statuses: DocumentStatus[] = [];

          for (const doc of selectedDocs) {
            if (doc.id === '00-index') continue; // INDEX generated last

            const content = doc.render(ctx);

            // Renderer returned empty = document cannot be generated (missing AI data)
            if (content === '') {
              statuses.push({
                id: doc.id,
                filename: doc.filename,
                title: doc.title,
                status: 'not-generated',
                reason: 'Required AI analysis unavailable',
              });
              continue;
            }

            // Write document to disk
            await writeFile(join(outputDir, doc.filename), content, 'utf-8');

            // Update display state and notify renderer
            displayState.renderedDocs.push(doc.filename);
            renderer.onDocRendered(displayState);

            // Determine status based on round availability
            const roundStatus = determineDocStatus(doc.requiredRounds, roundResults, true);
            statuses.push({
              id: doc.id,
              filename: doc.filename,
              title: doc.title,
              status: roundStatus,
            });
          }

          // Add statuses for non-selected documents (for INDEX completeness)
          for (const doc of DOCUMENT_REGISTRY) {
            if (doc.id === '00-index') continue;
            if (!selectedDocs.find((d) => d.id === doc.id)) {
              statuses.push({
                id: doc.id,
                filename: doc.filename,
                title: doc.title,
                status: 'not-generated',
                reason: 'Not included in --only selection',
              });
            }
          }

          // Generate INDEX last (it needs all statuses)
          const indexContent = renderIndex(ctx, statuses);
          await writeFile(join(outputDir, '00-INDEX.md'), indexContent, 'utf-8');

          // Notify renderer of INDEX completion
          displayState.renderedDocs.push('00-INDEX.md');
          renderer.onDocRendered(displayState);

          return { generatedDocs: statuses, outputDir };
        },
      }),
    );

    orchestrator.addSteps(steps);

    // Validate pipeline
    const validation = orchestrator.validate();
    if (!validation.valid) {
      throw new HandoverError(
        'Invalid pipeline configuration',
        validation.errors.join('; '),
        'This is a bug — please report it',
      );
    }

    const _dagResults = await orchestrator.execute(config);

    // Completion summary
    displayState.phase = 'complete';
    displayState.elapsedMs = Date.now() - startTime;
    displayState.completionDocs = displayState.renderedDocs.length;
    displayState.totalTokens = tracker.getTotalUsage().input + tracker.getTotalUsage().output;
    displayState.totalCost = tracker.getTotalCost();
    renderer.onComplete(displayState);
  } catch (err) {
    handleCliError(err, 'An unexpected error occurred during handover generation');
  } finally {
    renderer.destroy();
    logger.setSuppressed(false);
  }
}

/**
 * Render a minimal overview document for empty repositories.
 * Produces a clear explanation of why no analysis was generated.
 */
function renderEmptyRepoOverview(): string {
  const now = new Date().toISOString();
  return `---
title: Project Overview
generated: ${now}
---

# Project Overview

This repository contains no source files that could be analyzed. The handover documentation generator found no recognizable source code files after applying file filters.

## Possible Reasons

- The repository is newly initialized and has no code yet
- All source files are in directories excluded by \`.gitignore\` or handover configuration
- The repository contains only binary files, configuration, or documentation

## Next Steps

Add source code to the repository and run \`handover generate\` again.
`;
}
