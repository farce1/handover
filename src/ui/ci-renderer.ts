/**
 * CI-friendly renderer for non-TTY environments.
 *
 * Emits structured log lines with timestamps, no ANSI escape codes.
 * Only logs at meaningful state transitions (not per-tick updates)
 * to avoid flooding CI logs.
 *
 * Output format: `[elapsed] [category] message`
 */

import type { AnalyzerStatus, DisplayState, Renderer } from './types.js';
import { formatCost, formatDuration, formatTokens } from './formatters.js';

/**
 * CIRenderer - structured log output for non-TTY/CI environments.
 *
 * Each method logs at phase boundaries rather than per-tick,
 * producing clean CI-friendly output without ANSI codes.
 */
export class CIRenderer implements Renderer {
  private startTime = Date.now();
  private lastAnalyzerStatuses = new Map<string, AnalyzerStatus>();

  /**
   * Generate elapsed timestamp prefix.
   * Format: `[1.2s]`
   */
  private timestamp(): string {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    return `[${elapsed}s]`;
  }

  onBanner(state: DisplayState): void {
    const authLabel = state.authMethod ? ` (${state.authMethod})` : '';
    console.log(
      `${this.timestamp()} handover \u00B7 ${state.provider}/${state.model}${authLabel} \u00B7 ${state.fileCount} files \u00B7 ${state.language}`,
    );
  }

  onAnalyzerUpdate(state: DisplayState): void {
    // Only log on status change to 'done' or 'failed'
    for (const [name, status] of state.analyzers) {
      const prev = this.lastAnalyzerStatuses.get(name);
      if (prev !== status && (status === 'done' || status === 'failed')) {
        console.log(`${this.timestamp()} [analyzer] ${name} ${status}`);
      }
    }
    // Update tracked statuses
    this.lastAnalyzerStatuses = new Map(state.analyzers);
  }

  onAnalyzersDone(state: DisplayState): void {
    let doneCount = 0;
    for (const [, status] of state.analyzers) {
      if (status === 'done') doneCount++;
    }
    const total = state.analyzers.size;
    console.log(`${this.timestamp()} [static] ${doneCount}/${total} analyzers complete`);
  }

  onFileCoverage(state: DisplayState): void {
    if (state.fileCoverage) {
      const { total, analyzing, ignored } = state.fileCoverage;
      if (state.isIncremental) {
        console.log(
          `${this.timestamp()} [files] Incremental run (${state.changedFileCount} files changed) · ${total} files: ${analyzing} analyzing, ${state.unchangedFileCount} unchanged, ${ignored} ignored`,
        );
      } else {
        console.log(
          `${this.timestamp()} [files] Full run · ${total} files: ${analyzing} analyzing, ${ignored} ignored`,
        );
      }
    }
  }

  onRenderStart(state: DisplayState): void {
    console.log(`${this.timestamp()} [render] Rendering ${state.completionDocs} documents...`);
  }

  onRenderDone(state: DisplayState): void {
    if (state.renderTimingMs !== undefined) {
      console.log(`${this.timestamp()} [render] Done in ${formatDuration(state.renderTimingMs)}`);
    }
  }

  onRoundUpdate(state: DisplayState): void {
    // Only log on round completion (status === 'done', 'cached', or 'failed')
    for (const [, rd] of state.rounds) {
      if (rd.status === 'cached') {
        console.log(`${this.timestamp()} [round-${rd.roundNumber}] ${rd.name} cached`);
      } else if (rd.status === 'done') {
        const tokenStr = rd.tokens !== undefined ? formatTokens(rd.tokens) : '';
        const costStr =
          !state.isLocal && !state.isSubscription && rd.cost !== undefined
            ? formatCost(rd.cost)
            : '';
        const savingsStr =
          rd.cacheSavingsTokens && rd.cacheSavingsTokens > 0 && rd.cacheSavingsPercent !== undefined
            ? `${formatTokens(rd.cacheSavingsTokens)} saved (${Math.round(rd.cacheSavingsPercent * 100)}%)`
            : '';
        const details = [tokenStr, costStr, savingsStr].filter(Boolean).join(', ');
        console.log(
          `${this.timestamp()} [round-${rd.roundNumber}] ${rd.name} complete${details ? ` (${details})` : ''}`,
        );
      } else if (rd.status === 'failed') {
        const reason = rd.retryReason ? ` (${rd.retryReason})` : '';
        console.log(`${this.timestamp()} [round-${rd.roundNumber}] ${rd.name} FAILED${reason}`);
      }
    }
  }

  onRoundsDone(state: DisplayState): void {
    const allCached =
      state.rounds.size > 0 && [...state.rounds.values()].every((r) => r.status === 'cached');
    if (allCached) {
      console.log(`${this.timestamp()} [ai] All ${state.rounds.size} rounds cached`);
    } else {
      console.log(`${this.timestamp()} [ai] ${state.rounds.size} rounds complete`);
    }
  }

  onDocRendered(state: DisplayState): void {
    if (state.renderedDocs.length > 0) {
      const latest = state.renderedDocs[state.renderedDocs.length - 1];
      console.log(`${this.timestamp()} [render] ${latest}`);
    }
  }

  onComplete(state: DisplayState): void {
    const duration = `${(state.elapsedMs / 1000).toFixed(0)}s`;
    const parts = [`${state.completionDocs} documents`, formatTokens(state.totalTokens)];
    if (!state.isLocal && !state.isSubscription) {
      parts.push(formatCost(state.totalCost));
    } else if (state.isSubscription) {
      parts.push('subscription credits');
    }
    parts.push(duration);
    console.log(`${this.timestamp()} [done] ${parts.join(', ')}`);

    // Log parallel savings if applicable
    if (state.parallelSavedMs !== undefined && state.parallelSavedMs > 0) {
      console.log(
        `${this.timestamp()} [perf] Parallel execution saved ~${Math.round(state.parallelSavedMs / 1000)}s`,
      );
    }

    // Print errors if any
    if (state.errors.length > 0) {
      for (const err of state.errors) {
        console.log(`${this.timestamp()} [error] ${err.source}: ${err.message}`);
        if (err.affectedDocs && err.affectedDocs.length > 0) {
          console.log(`${this.timestamp()} [error]   Affected: ${err.affectedDocs.join(', ')}`);
        }
      }
    }
  }

  onError(state: DisplayState): void {
    for (const err of state.errors) {
      console.log(`${this.timestamp()} [error] ${err.source}: ${err.message}`);
    }
  }

  destroy(): void {
    // No-op: no cursor to restore in CI
  }
}
