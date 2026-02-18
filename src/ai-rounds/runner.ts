import type { z } from 'zod';
import type { LLMProvider } from '../providers/base.js';
import type { CompletionRequest } from '../domain/types.js';
import type { TokenUsageTracker } from '../context/tracker.js';
import type { RoundExecutionResult } from './types.js';
import type { RoundContext } from '../context/types.js';
import { compressRoundOutput } from '../context/compressor.js';
import { checkRoundQuality } from './quality.js';
import { logger } from '../utils/logger.js';

// ─── ExecuteRound Options ──────────────────────────────────────────────────

export interface ExecuteRoundOptions<T> {
  roundNumber: number;
  provider: LLMProvider;
  schema: z.ZodType<T>;
  buildPrompt: (isRetry: boolean) => CompletionRequest;
  validate: (data: T) => ValidationResult;
  buildFallback: () => T;
  tracker: TokenUsageTracker;
  estimateTokensFn: (text: string) => number;
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
}

// ─── Round Execution Engine ────────────────────────────────────────────────

/**
 * Execute a single AI analysis round with validation, quality check,
 * single retry, context compression, and graceful fallback.
 *
 * Flow: LLM call -> validate claims -> quality check -> retry once if needed
 *       -> compress for next round -> return result
 *
 * Failed rounds degrade to static fallback data (never throw).
 */
export async function executeRound<T>(
  options: ExecuteRoundOptions<T>,
): Promise<RoundExecutionResult<T>> {
  const {
    roundNumber,
    provider,
    schema,
    buildPrompt,
    validate,
    buildFallback,
    tracker,
    estimateTokensFn,
  } = options;

  let hasRetried = false;

  async function attempt(isRetry: boolean): Promise<RoundExecutionResult<T>> {
    // 1. Build prompt
    const request = buildPrompt(isRetry);

    // 2. Call LLM with Zod schema validation
    const result = await provider.complete<T>(request, schema, { onRetry: options.onRetry });

    // 3. Record token usage
    const promptText = request.systemPrompt + request.userPrompt;
    tracker.recordRound({
      round: roundNumber,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      contextTokens: estimateTokensFn(promptText),
      fileContentTokens: 0, // tracked separately by context packer
      budgetTokens: provider.maxContextTokens(),
    });

    // 4. Validate claims against static analysis
    const validation = validate(result.data);

    // 5. Retry on high drop rate (>30%) if not already retried
    if (validation.dropRate > 0.3 && !hasRetried) {
      hasRetried = true;
      return attempt(true);
    }

    // 6. Quality check
    const quality = checkRoundQuality(result.data as Record<string, unknown>, roundNumber);

    // 7. Retry on quality failure if not already retried
    if (!quality.isAcceptable && !hasRetried) {
      hasRetried = true;
      return attempt(true);
    }

    // 8. Compute tokens and cost for this round
    const totalTokens = result.usage.inputTokens + result.usage.outputTokens;
    const roundCost = tracker.getRoundCost(roundNumber);

    // 9. Compress output for next round (2000 tokens per prior round)
    const context = compressRoundOutput(
      roundNumber,
      result.data as Record<string, unknown>,
      2000,
      estimateTokensFn,
    );

    // 10. Return result
    return {
      data: result.data,
      validation,
      quality,
      context,
      status: hasRetried ? 'retried' : 'success',
      tokens: totalTokens,
      cost: roundCost,
    };
  }

  try {
    return await attempt(false);
  } catch (error) {
    // Failed round: degrade gracefully with static fallback data
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Round ${roundNumber} failed: ${errorMessage} -- falling back to static data`);

    const fallbackData = buildFallback();

    // Compress fallback data for downstream rounds
    const context: RoundContext = compressRoundOutput(
      roundNumber,
      fallbackData as Record<string, unknown>,
      2000,
      estimateTokensFn,
    );

    // Use tracker data if available (partial round may have recorded usage), otherwise 0
    const roundUsage = tracker.getRoundUsage(roundNumber);
    const fallbackTokens = roundUsage ? roundUsage.inputTokens + roundUsage.outputTokens : 0;
    const fallbackCost = tracker.getRoundCost(roundNumber);

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
      tokens: fallbackTokens,
      cost: fallbackCost,
    };
  }
}
