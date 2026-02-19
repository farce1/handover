import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hashContent, AnalysisCache } from '../analyzers/cache.js';
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
import { computeParallelSavings } from '../ui/components.js';
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
  stream?: boolean;
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
      streamVisible: options.stream === true,
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

    // Fail-fast validation before pipeline starts
    // Order: cheapest/most-actionable first (HARD-03)
    // 1. Validate --only alias (pure, no env/API dependency)
    const selectedDocs = resolveSelectedDocs(options.only, DOCUMENT_REGISTRY);
    const requiredRounds = computeRequiredRounds(selectedDocs);

    // 2. Validate provider config (structural check — PROV-05)
    validateProviderConfig(config);

    // 3. Resolve API key (environment-dependent — fail fast)
    resolveApiKey(config);

    // Initialize round cache for crash recovery
    const roundCache = new RoundCache(undefined, resolve(process.cwd()));
    const noCacheMode = options.cache === false;

    // Show startup banner (SEC-03: provider/model in banner serves as cloud indicator)
    renderer.onBanner(displayState);

    // Resolve audience mode: CLI --audience overrides config
    const audience: 'human' | 'ai' =
      options.audience === 'ai' ? 'ai' : (config.audience ?? 'human');

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
    let migrationWarned = false;

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

    // Per-round onToken callbacks: update streamingTokens on each token event.
    // Stored in a Map so callbacks can be created in onStepStart and retrieved at step factory call sites.
    const roundTokenCallbacks = new Map<number, (count: number) => void>();

    // Lazy getter for use in round step factories: resolves callback at execute() time.
    const makeOnToken = (roundNum: number) => () => roundTokenCallbacks.get(roundNum);

    // DAG orchestrator events -- update display state and call renderer
    const orchestratorEvents: DAGEvents = {
      onStepStart: (id, name) => {
        // AI round steps start with 'ai-round-'
        const match = id.match(/^ai-round-(\d+)$/);
        if (match) {
          const roundNum = parseInt(match[1], 10);
          const roundName = ROUND_NAMES[roundNum] ?? name;
          const roundStartMs = Date.now();
          displayState.rounds.set(roundNum, {
            roundNumber: roundNum,
            name: roundName,
            status: 'running',
            elapsedMs: 0,
            roundStartMs,
          });

          // Create the per-round streaming token callback
          const onToken = (count: number) => {
            const rd = displayState.rounds.get(roundNum);
            if (rd && rd.status === 'running') {
              rd.streamingTokens = count;
            }
          };
          roundTokenCallbacks.set(roundNum, onToken);

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
            rd.streamingTokens = undefined; // Clear live counter -- authoritative value now in rd.tokens

            // Wire cache savings into round display state (from Plan 02's tracker extensions)
            const cacheSavings = tracker.getRoundCacheSavings(roundNum);
            if (cacheSavings) {
              const roundUsage = tracker.getRoundUsage(roundNum);
              rd.cacheReadTokens = roundUsage?.cacheReadTokens;
              rd.cacheCreationTokens = roundUsage?.cacheCreationTokens;
              rd.cacheSavingsTokens = cacheSavings.tokensSaved;
              rd.cacheSavingsPercent = cacheSavings.percentSaved;
              rd.cacheSavingsDollars = cacheSavings.dollarsSaved;
            }
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

          // Compute fingerprint for round cache invalidation (CACHE-01).
          // Read file content and hash it so same-size edits are detected.
          const discovered = result.fileTree.directoryTree.filter((e) => e.type === 'file');
          const fileEntries = await Promise.all(
            discovered.map(async (f) => {
              try {
                const content = await readFile(join(rootDir, f.path));
                return { path: f.path, contentHash: hashContent(content) };
              } catch {
                // Unreadable file: use empty hash as fallback
                return { path: f.path, contentHash: '' };
              }
            }),
          );
          analysisFingerprint = RoundCache.computeAnalysisFingerprint(fileEntries);

          if (options.verbose) {
            process.stderr.write(
              `[verbose] Cache fingerprint: ${analysisFingerprint.substring(0, 12)}... (${fileEntries.length} files)\n`,
            );
          }

          // Detect changed files for incremental context packing (EFF-01)
          const analysisCache = new AnalysisCache(
            join(rootDir, '.handover', 'cache', 'analysis.json'),
          );
          await analysisCache.load();

          const currentHashes = new Map<string, string>();
          for (const entry of fileEntries) {
            if (entry.contentHash) {
              currentHashes.set(entry.path, entry.contentHash);
            }
          }

          const changedFiles = analysisCache.getChangedFiles(currentHashes);
          const isIncremental = analysisCache.size > 0 && changedFiles.size < currentHashes.size;

          if (options.verbose && isIncremental) {
            process.stderr.write(
              `[verbose] Incremental run: ${changedFiles.size} changed, ${currentHashes.size - changedFiles.size} unchanged\n`,
            );
            for (const path of changedFiles) {
              process.stderr.write(`[verbose]   changed: ${path}\n`);
            }
          }

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
            isIncremental ? changedFiles : undefined, // Only pass on incremental runs
          );

          // Update analysis cache for next run's change detection
          for (const [path, hash] of currentHashes) {
            analysisCache.update(path, hash);
          }
          await analysisCache.save();

          // Set incremental run metadata for display
          if (isIncremental) {
            displayState.isIncremental = true;
            displayState.changedFileCount = changedFiles.size;
            displayState.unchangedFileCount = currentHashes.size - changedFiles.size;
          }

          // Transition to AI rounds phase
          displayState.phase = 'ai-rounds';

          // Emit file coverage indicator before AI rounds begin
          displayState.fileCoverage = {
            analyzing: packedContext.metadata.fullFiles + packedContext.metadata.signatureFiles,
            ignored: packedContext.metadata.skippedFiles,
            total: packedContext.metadata.totalFiles,
          };
          renderer.onFileCoverage(displayState);

          return result;
        },
      }),
    ];

    // Wrap a round step with cache awareness: check cache before executing,
    // store result after successful execution. Cached rounds skip API calls entirely.
    // priorRoundNums: the round numbers whose outputs form the cascade hash chain (CACHE-02).
    const wrapWithCache = (
      roundNum: number,
      step: StepDefinition,
      priorRoundNums: number[],
    ): StepDefinition => {
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

          // Build prior round hashes for cascade invalidation (CACHE-02)
          const priorHashes = priorRoundNums.map((n) => {
            const prior = roundResults.get(n);
            if (!prior) return '';
            return RoundCache.computeResultHash(prior);
          });

          const hash = roundCache.computeHash(
            roundNum,
            modelName,
            analysisFingerprint,
            priorHashes,
          );

          // Gate cache reads on noCacheMode (--no-cache skips reads but preserves files)
          if (!noCacheMode) {
            const cached = await roundCache.get(roundNum, hash);

            // Migration warning: show once when old cache format is detected
            if (roundCache.wasMigrated && !migrationWarned) {
              migrationWarned = true;
              process.stderr.write('Cache format updated, rebuilding...\n');
            }

            if (cached) {
              if (options.verbose) {
                process.stderr.write(
                  `[verbose] Round ${roundNum} cache HIT (key: ${hash.substring(0, 12)}...)\n`,
                );
              }
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

            if (options.verbose) {
              process.stderr.write(
                `[verbose] Round ${roundNum} cache MISS (key: ${hash.substring(0, 12)}...)\n`,
              );
            }
          }

          // Execute normally
          const result = await originalExecute(context);
          // Cache writes always happen (even in no-cache mode) for future normal runs
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
        makeOnToken(1),
      );
      steps.push(wrapWithCache(1, step, []));
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
        makeOnToken(2),
      );
      steps.push(wrapWithCache(2, step, [1]));
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
        makeOnToken(3),
      );
      steps.push(wrapWithCache(3, step, [1, 2]));
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
        makeOnToken(4),
      );
      steps.push(wrapWithCache(4, step, [1, 2, 3]));
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
        makeOnToken(5),
      );
      steps.push(wrapWithCache(5, step, [1, 2]));
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
        makeOnToken(6),
      );
      steps.push(wrapWithCache(6, step, [1, 2]));
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

          // Parallel document rendering (EFF-04)
          const renderStart = Date.now();
          const docsToRender = selectedDocs.filter((doc) => doc.id !== '00-index');

          // Set completionDocs to expected count before onRenderStart so CI renderer
          // can log "Rendering N documents..." with the correct count.
          displayState.completionDocs = docsToRender.length;

          // Emit render start (aggregate progress only — per locked decision)
          if (renderer.onRenderStart) {
            renderer.onRenderStart(displayState);
          }

          const renderResults = await Promise.allSettled(
            docsToRender.map(async (doc) => {
              const docStart = Date.now();
              const content = doc.render(ctx);

              if (content === '') {
                return { doc, content: '', skipped: true, durationMs: Date.now() - docStart };
              }

              await writeFile(join(outputDir, doc.filename), content, 'utf-8');
              return { doc, content, skipped: false, durationMs: Date.now() - docStart };
            }),
          );

          const renderTimingMs = Date.now() - renderStart;

          // Process results in input order (Promise.allSettled preserves order)
          const statuses: DocumentStatus[] = [];
          let sequentialEstimateMs = 0;
          const renderFailures: Array<{ doc: (typeof docsToRender)[0]; error: unknown }> = [];

          for (let i = 0; i < renderResults.length; i++) {
            const result = renderResults[i];
            const doc = docsToRender[i];

            if (result.status === 'rejected') {
              // Error isolation: record failure, continue (per locked decision)
              renderFailures.push({ doc, error: result.reason });
              statuses.push({
                id: doc.id,
                filename: doc.filename,
                title: doc.title,
                status: 'not-generated',
                reason: `Render failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
              });
            } else if (result.value.skipped) {
              statuses.push({
                id: doc.id,
                filename: doc.filename,
                title: doc.title,
                status: 'not-generated',
                reason: 'Required AI analysis unavailable',
              });
              sequentialEstimateMs += result.value.durationMs;
            } else {
              displayState.renderedDocs.push(doc.filename);
              const roundStatus = determineDocStatus(doc.requiredRounds, roundResults, true);
              statuses.push({
                id: doc.id,
                filename: doc.filename,
                title: doc.title,
                status: roundStatus,
              });
              sequentialEstimateMs += result.value.durationMs;
            }
          }

          // Report render failures as errors (per locked decision: report at the end)
          for (const failure of renderFailures) {
            displayState.errors.push({
              source: `Render: ${failure.doc.filename}`,
              message:
                failure.error instanceof Error ? failure.error.message : String(failure.error),
            });
          }

          // Store render timing for completion summary
          displayState.renderTimingMs = renderTimingMs;
          displayState.renderSequentialEstimateMs = sequentialEstimateMs;

          if (renderer.onRenderDone) {
            renderer.onRenderDone(displayState);
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

    // Compute and store parallel savings (rounds 5 and 6 run concurrently)
    const parallelSavedMs = computeParallelSavings(displayState.rounds);
    if (parallelSavedMs !== null) {
      displayState.parallelSavedMs = parallelSavedMs;
    }

    // Build per-round summaries for completion display (per locked decision: per-round breakdown)
    const roundSummaries: DisplayState['roundSummaries'] = [];
    for (const [roundNum, rd] of displayState.rounds) {
      if (rd.status === 'cached') continue; // Skip cached rounds (no API call)
      if (rd.status !== 'done' && rd.status !== 'failed') continue;

      const usage = tracker.getRoundUsage(roundNum);
      if (!usage) continue;

      const cost = tracker.getRoundCost(roundNum);
      const cacheSavings = tracker.getRoundCacheSavings(roundNum);

      roundSummaries.push({
        round: roundNum,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost,
        savings: cacheSavings
          ? {
              tokens: cacheSavings.tokensSaved,
              percent: cacheSavings.percentSaved,
              dollars: cacheSavings.dollarsSaved,
            }
          : undefined,
      });
    }

    // Per locked decision: skip summary on all-cached runs (no API calls made)
    if (roundSummaries.length > 0) {
      displayState.roundSummaries = roundSummaries;
    }

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
