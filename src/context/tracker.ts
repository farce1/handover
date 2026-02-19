import type { TokenUsage } from './types.js';
import { logger } from '../utils/logger.js';

/**
 * Per-round token usage tracker with budget warning logging.
 *
 * Records token consumption for each AI round and warns when
 * utilization exceeds the configured threshold (default 85%).
 */
export class TokenUsageTracker {
  private rounds: TokenUsage[] = [];
  private readonly warnThreshold: number;

  private static readonly CACHE_READ_MULTIPLIER = 0.1;
  private static readonly CACHE_WRITE_MULTIPLIER = 1.25;

  private static readonly MODEL_COSTS: Record<
    string,
    { inputPerMillion: number; outputPerMillion: number }
  > = {
    // Anthropic
    'claude-opus-4-6': { inputPerMillion: 15, outputPerMillion: 75 },
    'claude-opus-4-5': { inputPerMillion: 5, outputPerMillion: 25 },
    'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
    'claude-haiku-4-5': { inputPerMillion: 1, outputPerMillion: 5 },
    // OpenAI
    'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
    'o3-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
    // Groq
    'llama-3.3-70b-versatile': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
    // Together
    'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': {
      inputPerMillion: 0.88,
      outputPerMillion: 0.88,
    },
    // DeepSeek
    'deepseek-chat': { inputPerMillion: 0.28, outputPerMillion: 0.42 },
    // Default fallback (most expensive = safe for cost estimates)
    default: { inputPerMillion: 15, outputPerMillion: 75 },
  };

  constructor(
    warnThreshold = 0.85,
    private readonly model: string = 'default',
  ) {
    this.warnThreshold = warnThreshold;
  }

  /**
   * Record token usage for a completed round.
   * Logs a warning if utilization exceeds the warn threshold.
   * Always logs detailed breakdown at verbose level.
   */
  recordRound(usage: TokenUsage): void {
    this.rounds.push(usage);

    const utilization = usage.budgetTokens > 0 ? usage.inputTokens / usage.budgetTokens : 0;

    if (utilization >= this.warnThreshold) {
      logger.warn(
        `Round ${usage.round}: ${Math.round(utilization * 100)}% of token budget used (${usage.inputTokens.toLocaleString()}/${usage.budgetTokens.toLocaleString()} tokens)`,
      );
    }

    logger.log(
      `Round ${usage.round} tokens: input=${usage.inputTokens}, output=${usage.outputTokens}, context=${usage.contextTokens}, files=${usage.fileContentTokens}`,
    );
  }

  /**
   * Get aggregate input and output token counts across all recorded rounds.
   */
  getTotalUsage(): { input: number; output: number } {
    let input = 0;
    let output = 0;
    for (const r of this.rounds) {
      input += r.inputTokens;
      output += r.outputTokens;
    }
    return { input, output };
  }

  /**
   * Number of rounds recorded so far.
   */
  getRoundCount(): number {
    return this.rounds.length;
  }

  /**
   * Get the most recently recorded round, or undefined if none.
   */
  getLastRound(): TokenUsage | undefined {
    return this.rounds.length > 0 ? this.rounds[this.rounds.length - 1] : undefined;
  }

  /**
   * Multi-line summary of all rounds and totals, suitable for terminal display.
   */
  toSummary(): string {
    if (this.rounds.length === 0) {
      return 'No rounds recorded.';
    }

    const lines: string[] = ['Token Usage Summary', ''];

    for (const r of this.rounds) {
      const util =
        r.budgetTokens > 0 ? `${Math.round((r.inputTokens / r.budgetTokens) * 100)}%` : 'N/A';

      lines.push(
        `  Round ${r.round}: ${r.inputTokens.toLocaleString()} input, ${r.outputTokens.toLocaleString()} output (${util} budget)`,
      );
    }

    const total = this.getTotalUsage();
    lines.push('');
    lines.push(
      `  Total: ${total.input.toLocaleString()} input, ${total.output.toLocaleString()} output across ${this.rounds.length} round(s)`,
    );

    return lines.join('\n');
  }

  /**
   * Estimate the dollar cost for a given number of input and output tokens
   * based on the configured model's pricing.
   * Optionally accounts for cache read (0.1x) and cache creation (1.25x) pricing.
   */
  estimateCost(
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens?: number,
    cacheCreationTokens?: number,
  ): number {
    const costs =
      TokenUsageTracker.MODEL_COSTS[this.model] ?? TokenUsageTracker.MODEL_COSTS['default'];
    let total =
      (inputTokens / 1_000_000) * costs.inputPerMillion +
      (outputTokens / 1_000_000) * costs.outputPerMillion;

    if (cacheReadTokens) {
      total +=
        (cacheReadTokens / 1_000_000) *
        costs.inputPerMillion *
        TokenUsageTracker.CACHE_READ_MULTIPLIER;
    }
    if (cacheCreationTokens) {
      total +=
        (cacheCreationTokens / 1_000_000) *
        costs.inputPerMillion *
        TokenUsageTracker.CACHE_WRITE_MULTIPLIER;
    }

    return total;
  }

  /**
   * Compute cache savings for a specific round.
   * Returns null if no cache data for this round.
   */
  getRoundCacheSavings(roundNumber: number): {
    tokensSaved: number;
    dollarsSaved: number;
    percentSaved: number;
  } | null {
    const usage = this.rounds.find((r) => r.round === roundNumber);
    if (!usage?.cacheReadTokens) return null;

    const costs =
      TokenUsageTracker.MODEL_COSTS[this.model] ?? TokenUsageTracker.MODEL_COSTS['default'];
    const cacheRead = usage.cacheReadTokens;

    // Tokens saved = cache reads (those weren't re-processed at full cost)
    const tokensSaved = cacheRead;

    // Dollar savings = cacheRead * (fullRate - cacheReadRate) / 1M
    const fullCostPerToken = costs.inputPerMillion / 1_000_000;
    const cacheReadCostPerToken = fullCostPerToken * TokenUsageTracker.CACHE_READ_MULTIPLIER;
    const dollarsSaved = cacheRead * (fullCostPerToken - cacheReadCostPerToken);

    // Percentage saved relative to total input (input + cacheRead + cacheCreation)
    const totalInput = usage.inputTokens + cacheRead + (usage.cacheCreationTokens ?? 0);
    const percentSaved = totalInput > 0 ? tokensSaved / totalInput : 0;

    return { tokensSaved, dollarsSaved, percentSaved };
  }

  /**
   * Get the estimated cost for a specific round by round number.
   * Returns 0 if the round has not been recorded.
   */
  getRoundCost(roundNumber: number): number {
    const usage = this.rounds.find((r) => r.round === roundNumber);
    if (!usage) return 0;
    return this.estimateCost(
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens,
      usage.cacheCreationTokens,
    );
  }

  /**
   * Get the total estimated cost across all recorded rounds.
   */
  getTotalCost(): number {
    let total = 0;
    for (const r of this.rounds) {
      total += this.estimateCost(
        r.inputTokens,
        r.outputTokens,
        r.cacheReadTokens,
        r.cacheCreationTokens,
      );
    }
    return total;
  }

  /**
   * Get the token usage entry for a specific round by round number.
   * Returns undefined if the round has not been recorded.
   */
  getRoundUsage(roundNumber: number): TokenUsage | undefined {
    return this.rounds.find((r) => r.round === roundNumber);
  }
}
