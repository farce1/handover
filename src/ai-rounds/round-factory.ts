import type { z } from 'zod';
import type { LLMProvider } from '../providers/base.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext, RoundContext } from '../context/types.js';
import type { HandoverConfig } from '../config/schema.js';
import type { TokenUsageTracker } from '../context/tracker.js';
import type { StepDefinition } from '../orchestrator/types.js';
import type { RoundExecutionResult } from './types.js';
import type { CompletionRequest } from '../domain/types.js';
import { createStep } from '../orchestrator/step.js';
import { buildRoundPrompt, buildRetrySystemPrompt, ROUND_SYSTEM_PROMPTS } from './prompts.js';
import { validateRoundClaims } from './validator.js';
import { executeRound } from './runner.js';

// ─── StandardRoundConfig ────────────────────────────────────────────────────

/**
 * Configuration for a standard (non-fan-out) AI round.
 *
 * Captures everything that varies between rounds 1, 2, 3, 4, and 6
 * so that the shared execution pattern can be factored into
 * {@link createStandardRoundStep}.
 */
export interface StandardRoundConfig<T> {
  roundNumber: number;
  name: string;
  deps: string[];
  maxTokens: number;
  schema: z.ZodType<T>;
  buildData: (
    analysis: StaticAnalysisResult,
    config: HandoverConfig,
    getter: <U>(n: number) => RoundExecutionResult<U> | undefined,
  ) => string;
  buildFallback: (analysis: StaticAnalysisResult) => T;
  getPriorContexts: (
    getter: <U>(n: number) => RoundExecutionResult<U> | undefined,
  ) => RoundContext[];
}

// ─── Factory Function ───────────────────────────────────────────────────────

/**
 * Create a {@link StepDefinition} for a standard AI round using the shared
 * execute-validate-retry-compress pattern.
 *
 * This factory encapsulates the boilerplate that rounds 1-4 and 6 all share:
 *   1. Gather prior round contexts via `getPriorContexts`
 *   2. Build round-specific data via `buildData`
 *   3. Call `executeRound` with prompt assembly, validation, and fallback
 *   4. Wire up `onSkip` to the static fallback
 *
 * Round 5 (fan-out) is structurally different and is NOT handled here.
 */
export function createStandardRoundStep<T>(
  roundConfig: StandardRoundConfig<T>,
  provider: LLMProvider,
  staticAnalysis: StaticAnalysisResult,
  packedContext: PackedContext,
  config: HandoverConfig,
  tracker: TokenUsageTracker,
  estimateTokensFn: (text: string) => number,
  roundGetter: <U>(n: number) => RoundExecutionResult<U> | undefined,
  onRetry?: (attempt: number, delayMs: number, reason: string) => void,
): StepDefinition {
  const { roundNumber, name, deps, maxTokens, schema, buildData, buildFallback, getPriorContexts } =
    roundConfig;

  return createStep({
    id: `ai-round-${roundNumber}`,
    name: `AI Round ${roundNumber}: ${name}`,
    deps,
    execute: async (_ctx): Promise<RoundExecutionResult<T>> => {
      const priorRounds = getPriorContexts(roundGetter).filter(
        (ctx): ctx is RoundContext => ctx !== undefined,
      );
      const roundData = buildData(staticAnalysis, config, roundGetter);

      return executeRound<T>({
        roundNumber,
        provider,
        schema,
        buildPrompt: (isRetry: boolean): CompletionRequest => {
          const systemPrompt = isRetry
            ? buildRetrySystemPrompt(ROUND_SYSTEM_PROMPTS[roundNumber])
            : ROUND_SYSTEM_PROMPTS[roundNumber];

          const request = buildRoundPrompt(
            roundNumber,
            systemPrompt,
            packedContext,
            priorRounds,
            roundData,
            estimateTokensFn,
          );

          return {
            ...request,
            temperature: isRetry ? 0.1 : 0.3,
            maxTokens,
          };
        },
        validate: (data: T) =>
          validateRoundClaims(
            roundNumber,
            data as unknown as Record<string, unknown>,
            staticAnalysis,
          ),
        buildFallback: () => buildFallback(staticAnalysis),
        tracker,
        estimateTokensFn,
        onRetry,
      });
    },
    onSkip: () => buildFallback(staticAnalysis),
  });
}
