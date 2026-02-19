import type { z } from 'zod';
import type { LLMProvider } from '../providers/base.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext, RoundContext } from '../context/types.js';
import type { HandoverConfig } from '../config/schema.js';
import type { TokenUsageTracker } from '../context/tracker.js';
import type { StepDefinition } from '../orchestrator/types.js';
import type { RoundExecutionResult } from './types.js';
import type { Round1Output, Round2Output, Round5Module, Round5Output } from './schemas.js';
import { Round5ModuleSchema } from './schemas.js';
import { createStep } from '../orchestrator/step.js';
import { buildRoundPrompt, buildRetrySystemPrompt, ROUND_SYSTEM_PROMPTS } from './prompts.js';
import { validateRoundClaims } from './validator.js';
import { checkRoundQuality } from './quality.js';
import { compressRoundOutput } from '../context/compressor.js';
import { buildRound5Fallback } from './fallbacks.js';
import { logger } from '../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum concurrent module calls in a single batch */
const MODULE_BATCH_SIZE = 10;

/** Maximum total modules to fan out to */
const MAX_MODULE_FANOUT = 20;

// ─── Round 5: Edge Cases & Conventions (per-module fan-out) ─────────────────

/**
 * Create a StepDefinition for Round 5: Edge Cases & Conventions.
 *
 * Round 5 fans out per module from Round 2 output (PIPE-03), running one
 * LLM call per module via Promise.allSettled. It depends only on Round 2
 * and runs parallel with Rounds 3, 4, and 6.
 *
 * @param getPriorResults - Retrieves Round 1 and Round 2 results from DAG context.
 */
export function createRound5Step(
  provider: LLMProvider,
  staticAnalysis: StaticAnalysisResult,
  packedContext: PackedContext,
  config: HandoverConfig,
  tracker: TokenUsageTracker,
  estimateTokensFn: (text: string) => number,
  getPriorResults: () => {
    round1?: RoundExecutionResult<Round1Output>;
    round2?: RoundExecutionResult<Round2Output>;
  },
  onRetry?: (attempt: number, delayMs: number, reason: string) => void,
  _onToken?: () => ((tokenCount: number) => void) | undefined,
): StepDefinition {
  // Note: Round 5 fans out per module (multiple parallel LLM calls), so onToken
  // is accepted for API consistency but not threaded into per-module calls.
  return createStep({
    id: 'ai-round-5',
    name: 'AI Round 5: Edge Cases & Conventions',
    deps: ['ai-round-2'], // Only needs R2 modules, parallel with R3/R4/R6
    execute: async (_ctx): Promise<RoundExecutionResult<Round5Output>> => {
      try {
        return await executeRound5(
          provider,
          staticAnalysis,
          packedContext,
          tracker,
          estimateTokensFn,
          getPriorResults,
          onRetry,
        );
      } catch (error) {
        // Failed round: degrade gracefully with static fallback data
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Round 5 failed: ${errorMessage} -- falling back to static data`);

        const fallbackData = buildRound5Fallback(staticAnalysis);
        const context: RoundContext = compressRoundOutput(
          5,
          fallbackData as unknown as Record<string, unknown>,
          2000,
          estimateTokensFn,
        );

        return {
          data: fallbackData,
          validation: { validated: 0, corrected: 0, total: 0, dropRate: 0 },
          quality: {
            textLength: 0,
            codeReferences: 0,
            specificity: 0,
            isAcceptable: false,
          },
          context,
          status: 'degraded',
        };
      }
    },
    onSkip: () => buildRound5Fallback(staticAnalysis),
  });
}

// ─── Round 5 Execution (per-module fan-out) ─────────────────────────────────

/**
 * Execute Round 5 with per-module fan-out via Promise.allSettled.
 * Each module gets its own LLM call with filtered context.
 */
async function executeRound5(
  provider: LLMProvider,
  staticAnalysis: StaticAnalysisResult,
  packedContext: PackedContext,
  tracker: TokenUsageTracker,
  estimateTokensFn: (text: string) => number,
  getPriorResults: () => {
    round1?: RoundExecutionResult<Round1Output>;
    round2?: RoundExecutionResult<Round2Output>;
  },
  onRetry?: (attempt: number, delayMs: number, reason: string) => void,
): Promise<RoundExecutionResult<Round5Output>> {
  const priorResults = getPriorResults();
  const r2Context = priorResults.round2?.context;
  const priorRounds = r2Context ? [r2Context] : [];

  // 1. Get modules from Round 2 results
  let modules = getModulesForAnalysis(priorResults.round2, staticAnalysis);

  // Cap at MAX_MODULE_FANOUT
  if (modules.length > MAX_MODULE_FANOUT) {
    modules = modules.slice(0, MAX_MODULE_FANOUT);
  }

  // 2. Fan-out: run module analyses in batches via Promise.allSettled
  const allModuleResults: Array<{
    moduleName: string;
    result: Round5Module | null;
  }> = [];

  for (let i = 0; i < modules.length; i += MODULE_BATCH_SIZE) {
    const batch = modules.slice(i, i + MODULE_BATCH_SIZE);

    const batchPromises = batch.map(async (mod) => {
      const moduleResult = await analyzeModule(
        mod,
        provider,
        staticAnalysis,
        packedContext,
        priorRounds,
        tracker,
        estimateTokensFn,
        false,
        onRetry,
      );
      return { moduleName: mod.name, result: moduleResult };
    });

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        allModuleResults.push(result.value);
      } else {
        logger.warn(`Module analysis failed: ${result.reason}`);
        allModuleResults.push({
          moduleName: 'unknown',
          result: null,
        });
      }
    }
  }

  // 3. Aggregate results
  const succeededModules = allModuleResults.filter((r) => r.result !== null).map((r) => r.result!);

  const failedCount = allModuleResults.filter((r) => r.result === null).length;

  if (failedCount > 0) {
    logger.warn(`Round 5: ${failedCount}/${modules.length} module analyses failed`);
  }

  // 4. Build cross-cutting conventions (patterns appearing in 2+ modules)
  const crossCuttingConventions = findCrossCuttingConventions(succeededModules);

  // 5. Assemble aggregated output
  const aggregatedOutput: Round5Output = {
    modules: succeededModules,
    crossCuttingConventions,
    findings: buildAggregatedFindings(succeededModules, failedCount, modules.length),
  };

  // 6. Validate aggregated output
  const validation = validateRoundClaims(
    5,
    aggregatedOutput as unknown as Record<string, unknown>,
    staticAnalysis,
  );

  // 7. Quality check
  const quality = checkRoundQuality(aggregatedOutput as unknown as Record<string, unknown>, 5);

  // 8. Retry failed modules if drop rate too high or quality fails
  let status: 'success' | 'degraded' | 'retried' = 'success';

  const dropRate = failedCount / Math.max(modules.length, 1);
  if ((dropRate > 0.3 || validation.dropRate > 0.3 || !quality.isAcceptable) && failedCount > 0) {
    // Retry failed modules only with stricter prompting
    const failedModuleNames = allModuleResults
      .filter((r) => r.result === null)
      .map((r) => r.moduleName);

    const failedModules = modules.filter((m) => failedModuleNames.includes(m.name));

    if (failedModules.length > 0) {
      const retryResults = await retryFailedModules(
        failedModules,
        provider,
        staticAnalysis,
        packedContext,
        priorRounds,
        tracker,
        estimateTokensFn,
        onRetry,
      );

      // Merge retry results
      for (const retried of retryResults) {
        if (retried.result !== null) {
          succeededModules.push(retried.result);
        }
      }

      // Rebuild aggregated output
      aggregatedOutput.modules = succeededModules;
      aggregatedOutput.crossCuttingConventions = findCrossCuttingConventions(succeededModules);

      status = 'retried';
    }
  }

  // 9. Compress for next round context
  const context = compressRoundOutput(
    5,
    aggregatedOutput as unknown as Record<string, unknown>,
    2000,
    estimateTokensFn,
  );

  return {
    data: aggregatedOutput,
    validation,
    quality,
    context,
    status,
  };
}

// ─── Module Analysis ────────────────────────────────────────────────────────

interface ModuleInfo {
  name: string;
  path: string;
  files: string[];
}

/**
 * Get modules to analyze from Round 2 output, or fall back to
 * top-level directories if Round 2 failed/degraded.
 */
function getModulesForAnalysis(
  round2Result: RoundExecutionResult<Round2Output> | undefined,
  analysis: StaticAnalysisResult,
): ModuleInfo[] {
  // Try Round 2 modules first
  if (round2Result?.data?.modules && round2Result.data.modules.length > 0) {
    return round2Result.data.modules.map((mod) => ({
      name: mod.name,
      path: mod.path,
      files: mod.files,
    }));
  }

  // Fallback: top-level directories as module approximation
  const topLevelDirs = analysis.fileTree.directoryTree.filter(
    (entry) =>
      entry.type === 'directory' && !entry.path.includes('/') && !entry.path.startsWith('.'),
  );

  return topLevelDirs.map((dir) => {
    const files = analysis.fileTree.directoryTree
      .filter((entry) => entry.type === 'file' && entry.path.startsWith(dir.path + '/'))
      .map((entry) => entry.path);

    return {
      name: dir.path,
      path: dir.path,
      files,
    };
  });
}

/**
 * Analyze a single module by making an LLM call with module-filtered context.
 * Returns null on failure (never throws).
 */
async function analyzeModule(
  mod: ModuleInfo,
  provider: LLMProvider,
  analysis: StaticAnalysisResult,
  packedContext: PackedContext,
  priorRounds: RoundContext[],
  tracker: TokenUsageTracker,
  estimateTokensFn: (text: string) => number,
  isRetry = false,
  onRetry?: (attempt: number, delayMs: number, reason: string) => void,
): Promise<Round5Module | null> {
  try {
    // Filter packed context files to this module's path prefix
    const modulePackedContext: PackedContext = {
      ...packedContext,
      files: packedContext.files.filter(
        (f) => f.path.startsWith(mod.path + '/') || f.path === mod.path,
      ),
    };

    // If no files match the module path, include all files (fallback for flat structures)
    if (modulePackedContext.files.length === 0) {
      modulePackedContext.files = packedContext.files.filter((f) =>
        mod.files.some((mf) => f.path === mf || f.path.startsWith(mf)),
      );
    }

    // Build module-specific data
    const moduleData = buildModuleData(mod, analysis);

    // Build prompt
    const systemPrompt = isRetry
      ? buildRetrySystemPrompt(ROUND_SYSTEM_PROMPTS[5])
      : ROUND_SYSTEM_PROMPTS[5];

    const request = buildRoundPrompt(
      5,
      systemPrompt,
      modulePackedContext,
      priorRounds,
      moduleData,
      estimateTokensFn,
    );

    const finalRequest = {
      ...request,
      temperature: isRetry ? 0.1 : 0.3,
      maxTokens: 4096,
    };

    // Call LLM with module-level schema
    const result = await provider.complete<Round5Module>(
      finalRequest,
      Round5ModuleSchema as z.ZodType<Round5Module>,
      { onRetry },
    );

    // Track token usage
    const promptText = finalRequest.systemPrompt + finalRequest.userPrompt;
    tracker.recordRound({
      round: 5,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      contextTokens: estimateTokensFn(promptText),
      fileContentTokens: 0,
      budgetTokens: provider.maxContextTokens(),
    });

    return result.data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Module ${mod.name} analysis failed: ${errorMessage}`);
    return null;
  }
}

/**
 * Build module-specific data string for Round 5 analysis.
 */
function buildModuleData(mod: ModuleInfo, analysis: StaticAnalysisResult): string {
  const sections: string[] = [];

  sections.push(`## Module: ${mod.name}`);
  sections.push(`Path: ${mod.path}`);
  sections.push(`Files: ${mod.files.length}`);
  sections.push('');

  // Filter AST files to this module
  const moduleAstFiles = analysis.ast.files.filter((f) => mod.files.includes(f.path));

  if (moduleAstFiles.length > 0) {
    sections.push('## Module Source Files');
    for (const file of moduleAstFiles.slice(0, 20)) {
      sections.push(`  ${file.path}:`);
      if (file.functions.length > 0) {
        sections.push(
          `    Functions: ${file.functions
            .map((f) => f.name)
            .slice(0, 10)
            .join(', ')}`,
        );
      }
      if (file.exports.length > 0) {
        sections.push(
          `    Exports: ${file.exports
            .map((e) => e.name)
            .slice(0, 10)
            .join(', ')}`,
        );
      }
    }
    sections.push('');
  }

  // Module-specific TODO items
  const moduleTodos = analysis.todos.items.filter((item) => mod.files.includes(item.file));

  if (moduleTodos.length > 0) {
    sections.push('## TODO/FIXME Items in Module');
    for (const todo of moduleTodos.slice(0, 15)) {
      sections.push(`  [${todo.marker}] ${todo.text} (${todo.file}:${todo.line})`);
    }
    sections.push('');
  }

  // Module-specific test files
  const moduleTestFiles = analysis.tests.testFiles.filter((tf) =>
    mod.files.some((_mf) => tf.path.startsWith(mod.path + '/') || tf.path.includes(mod.name)),
  );

  if (moduleTestFiles.length > 0) {
    sections.push('## Test Files for Module');
    for (const tf of moduleTestFiles.slice(0, 10)) {
      sections.push(`  ${tf.path} (${tf.framework}, ${tf.testCount} tests)`);
    }
    sections.push('');
  }

  // Locked decision: only provable issues
  sections.push('## Analysis Instructions');
  sections.push(
    'Only flag issues you can point to specific evidence in the code. ' +
      'Every edge case MUST cite a file path and ideally a line number. ' +
      'Do not speculate about "potential" issues.',
  );

  return sections.join('\n');
}

// ─── Cross-Cutting Convention Detection ─────────────────────────────────────

/**
 * Find conventions that appear in 2+ modules (cross-cutting patterns).
 */
function findCrossCuttingConventions(
  modules: Round5Module[],
): Round5Output['crossCuttingConventions'] {
  // Count how many modules share each convention pattern
  const patternCounts = new Map<string, { description: string; count: number }>();

  for (const mod of modules) {
    for (const conv of mod.conventions) {
      const key = conv.pattern.toLowerCase().trim();
      const existing = patternCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        patternCounts.set(key, {
          description: conv.description,
          count: 1,
        });
      }
    }
  }

  // Filter to patterns appearing in 2+ modules
  return [...patternCounts.entries()]
    .filter(([, data]) => data.count >= 2)
    .map(([pattern, data]) => ({
      pattern,
      description: data.description,
      frequency: `Found in ${data.count} of ${modules.length} modules`,
    }));
}

// ─── Aggregated Findings Builder ────────────────────────────────────────────

function buildAggregatedFindings(
  modules: Round5Module[],
  failedCount: number,
  totalModules: number,
): string[] {
  const findings: string[] = [];

  // Summary of edge case severity counts
  let critical = 0;
  let warning = 0;
  let info = 0;
  for (const mod of modules) {
    for (const ec of mod.edgeCases) {
      if (ec.severity === 'critical') critical++;
      else if (ec.severity === 'warning') warning++;
      else info++;
    }
  }

  findings.push(`Analyzed ${modules.length}/${totalModules} modules successfully`);

  if (critical + warning + info > 0) {
    findings.push(`Edge cases found: ${critical} critical, ${warning} warning, ${info} info`);
  }

  if (failedCount > 0) {
    findings.push(`${failedCount} module analyses failed and were excluded`);
  }

  return findings;
}

// ─── Retry Failed Modules ───────────────────────────────────────────────────

async function retryFailedModules(
  failedModules: ModuleInfo[],
  provider: LLMProvider,
  analysis: StaticAnalysisResult,
  packedContext: PackedContext,
  priorRounds: RoundContext[],
  tracker: TokenUsageTracker,
  estimateTokensFn: (text: string) => number,
  onRetry?: (attempt: number, delayMs: number, reason: string) => void,
): Promise<Array<{ moduleName: string; result: Round5Module | null }>> {
  const results: Array<{ moduleName: string; result: Round5Module | null }> = [];

  // Retry in batches
  for (let i = 0; i < failedModules.length; i += MODULE_BATCH_SIZE) {
    const batch = failedModules.slice(i, i + MODULE_BATCH_SIZE);

    const batchPromises = batch.map(async (mod) => {
      const moduleResult = await analyzeModule(
        mod,
        provider,
        analysis,
        packedContext,
        priorRounds,
        tracker,
        estimateTokensFn,
        true, // isRetry
        onRetry,
      );
      return { moduleName: mod.name, result: moduleResult };
    });

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({ moduleName: 'unknown', result: null });
      }
    }
  }

  return results;
}
