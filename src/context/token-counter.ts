import type { LLMProvider } from '../providers/base.js';
import type { TokenBudget } from './types.js';

/**
 * Estimate token count for a text string.
 *
 * Uses chars/4 heuristic as standalone fallback.
 * If an LLMProvider is supplied, delegates to the provider's estimator.
 */
export function estimateTokens(text: string, provider?: LLMProvider): number {
  if (provider) {
    return provider.estimateTokens(text);
  }
  return Math.ceil(text.length / 4);
}

/**
 * Compute the token budget for context window packing.
 *
 * Reserves space for prompt overhead and output, then applies a safety margin
 * to the remaining budget available for file content.
 *
 * Defaults:
 *   promptOverhead = 3000 tokens
 *   outputReserve  = 4096 tokens
 *   safetyMargin   = 0.9 (90% of available space)
 */
export function computeTokenBudget(
  maxTokens: number,
  options?: {
    promptOverhead?: number;
    outputReserve?: number;
    safetyMargin?: number;
  },
): TokenBudget {
  const promptOverhead = options?.promptOverhead ?? 3000;
  const outputReserve = options?.outputReserve ?? 4096;
  const safetyMargin = options?.safetyMargin ?? 0.9;

  const fileContentBudget = Math.floor((maxTokens - promptOverhead - outputReserve) * safetyMargin);

  return {
    total: maxTokens,
    promptOverhead,
    outputReserve,
    fileContentBudget,
  };
}
