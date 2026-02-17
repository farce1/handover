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

  constructor(warnThreshold = 0.85) {
    this.warnThreshold = warnThreshold;
  }

  /**
   * Record token usage for a completed round.
   * Logs a warning if utilization exceeds the warn threshold.
   * Always logs detailed breakdown at verbose level.
   */
  recordRound(usage: TokenUsage): void {
    this.rounds.push(usage);

    const utilization =
      usage.budgetTokens > 0
        ? usage.inputTokens / usage.budgetTokens
        : 0;

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
    return this.rounds.length > 0
      ? this.rounds[this.rounds.length - 1]
      : undefined;
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
        r.budgetTokens > 0
          ? `${Math.round((r.inputTokens / r.budgetTokens) * 100)}%`
          : 'N/A';

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
}
