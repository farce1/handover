/**
 * Pure display components for the terminal UI.
 *
 * Each function takes DisplayState (or subsets) and returns string arrays
 * (lines). These are side-effect-free building blocks consumed by the
 * TerminalRenderer and CIRenderer.
 *
 * Color palette (from CONTEXT.md/UX-08):
 * - Cyan: headers, paths
 * - Green: success
 * - Yellow: warnings, cost
 * - Red: errors
 * - Magenta: AI activity
 */

import pc from 'picocolors';

import type { AnalyzerStatus, DisplayState, ErrorInfo, RoundDisplayState } from './types.js';
import { formatCost, formatDuration, formatTokens, SPINNER_FRAMES, SYMBOLS } from './formatters.js';

/**
 * Render the startup banner line.
 *
 * Format: `▶ handover · provider/model · N files · Language`
 * Single line per CONTEXT.md specification.
 */
export function renderBanner(state: DisplayState): string[] {
  const sep = pc.dim(' \u00B7 '); // middle dot separator
  const arrow = pc.cyan(SYMBOLS.arrow);
  const name = pc.bold('handover');
  const providerModel = `${state.provider}/${state.model}`;
  const files = `${state.fileCount} files`;
  const lang = state.language;
  const localBadge = state.isLocal ? `${sep}${pc.green(pc.bold('LOCAL'))}` : '';

  return [`${arrow} ${name}${sep}${providerModel}${sep}${files}${sep}${lang}${localBadge}`];
}

/**
 * Render the static analysis block (Docker build style).
 *
 * One line per analyzer with status symbol:
 * - `✓ file-tree`    (done)
 * - `◆ ast`          (running, bold)
 * - `○ git-history`  (pending, dim)
 * - `✗ env-vars`     (failed)
 */
export function renderAnalyzerBlock(analyzers: Map<string, AnalyzerStatus>): string[] {
  const lines: string[] = [];

  for (const [name, status] of analyzers) {
    let symbol: string;
    let label: string;

    switch (status) {
      case 'done':
        symbol = pc.green(SYMBOLS.done);
        label = name;
        break;
      case 'running':
        symbol = pc.magenta(SYMBOLS.running);
        label = pc.bold(name);
        break;
      case 'failed':
        symbol = pc.red(SYMBOLS.failed);
        label = name + pc.dim(' (failed)');
        break;
      case 'pending':
      default:
        symbol = pc.dim(SYMBOLS.pending);
        label = pc.dim(name);
        break;
    }

    lines.push(`  ${symbol} ${label}`);
  }

  return lines;
}

/**
 * Compute the cumulative token count across all rounds.
 * Sums authoritative tokens for done rounds and streaming tokens for the running round.
 */
export function computeCumulativeTokens(rounds: Map<number, RoundDisplayState>): number {
  let total = 0;
  for (const [, rd] of rounds) {
    if (rd.status === 'done' || rd.status === 'cached') {
      total += rd.tokens ?? 0;
    } else if (rd.status === 'running') {
      total += rd.streamingTokens ?? 0;
    }
  }
  return total;
}

/**
 * Render the incremental/full run label shown before AI rounds.
 * Per locked decision: "Incremental run (3 files changed)" or "Full run".
 */
export function renderRunLabel(isIncremental: boolean, changedFileCount?: number): string {
  if (isIncremental && changedFileCount !== undefined) {
    return `Incremental run (${changedFileCount} file${changedFileCount !== 1 ? 's' : ''} changed)`;
  }
  return 'Full run';
}

/**
 * Render a savings line for a round that had cache/packing savings.
 * Format: "  Saved 12,400 tokens (62%, ~$0.03)" in green.
 * Per locked decision: express in all three units.
 */
export function renderRoundSavings(
  tokensSaved: number,
  pctSaved: number,
  dollarsSaved: number,
): string {
  const tokStr = tokensSaved.toLocaleString();
  const pctStr = Math.round(pctSaved * 100);
  const dolStr = dollarsSaved < 0.01 ? '<$0.01' : `~$${dollarsSaved.toFixed(2)}`;
  return pc.green(`    Saved ${tokStr} tokens (${pctStr}%, ${dolStr})`);
}

/**
 * Render the aggregate render start/done lines.
 * Per locked decision: "Rendering N documents..." then done — no per-doc status.
 */
export function renderRenderProgress(docCount: number): string {
  return `${pc.dim(SYMBOLS.running)} Rendering ${docCount} documents...`;
}

/**
 * Render the file coverage line shown before AI rounds begin.
 *
 * Format: `◆ 142 files · 104 analyzing · 10 ignored`
 * With incremental metadata: `◆ Incremental run (3 files changed) · 142 files · ...`
 */
export function renderFileCoverage(
  coverage: {
    analyzing: number;
    ignored: number;
    total: number;
  },
  incremental?: {
    isIncremental: boolean;
    changedFileCount?: number;
    unchangedFileCount?: number;
  },
): string {
  const sep = pc.dim(' \u00B7 ');
  const bullet = pc.dim('\u25C6'); // ◆

  const parts: string[] = [];

  // Run label first (per locked decision)
  if (incremental) {
    parts.push(renderRunLabel(incremental.isIncremental, incremental.changedFileCount));
  }

  parts.push(`${coverage.total} files`);
  parts.push(`${pc.cyan(String(coverage.analyzing))} analyzing`);

  // Show unchanged count on incremental runs (per locked decision: "skipped N unchanged")
  if (incremental?.isIncremental && incremental.unchangedFileCount !== undefined) {
    parts.push(`${pc.dim(String(incremental.unchangedFileCount))} unchanged`);
  }

  parts.push(`${pc.dim(String(coverage.ignored))} ignored`);

  return `${bullet} ${parts.join(sep)}`;
}

/**
 * Render the AI rounds block.
 *
 * Stacked lines per active/complete round:
 * - Running: `Round N/T ◆ X,XXX tokens (Y,YYY total) · Zs`
 * - Done:    `✓ Round N · X,XXX tokens · Zs`
 * - Failed:  `✗ Round N failed (reason) · Missing: DOC1, DOC2`
 *
 * Bottom line: running total cost.
 * Cost warning line if over threshold.
 */
export function renderRoundBlock(
  rounds: Map<number, RoundDisplayState>,
  totalCost: number,
  costWarningThreshold: number,
  spinnerFrame?: number,
  isLocal?: boolean,
  streamVisible?: boolean,
): string[] {
  const lines: string[] = [];
  const sep = pc.dim(' \u00B7 ');

  const allCached = rounds.size > 0 && [...rounds.values()].every((r) => r.status === 'cached');
  if (allCached) {
    return [`  ${pc.dim(`All ${rounds.size} rounds cached`)}`];
  }

  const totalRounds = rounds.size;
  const cumulativeTokens = computeCumulativeTokens(rounds);

  for (const [, rd] of rounds) {
    const roundLabel = `Round ${rd.roundNumber}`;

    switch (rd.status) {
      case 'cached': {
        // Cached round: show green check with "cached" label (no tokens/cost -- no API call)
        lines.push(`  ${pc.green(SYMBOLS.done)} ${roundLabel}${sep}${pc.dim('cached')}`);
        break;
      }

      case 'done': {
        const tokenStr = formatTokens(rd.tokens ?? 0);
        const durationStr = formatDuration(rd.elapsedMs);
        const parts = [`${pc.green(SYMBOLS.done)} ${roundLabel}`, tokenStr, durationStr];
        // Show cost for cloud providers
        if (!isLocal && rd.cost !== undefined) {
          parts.push(pc.yellow(formatCost(rd.cost)));
        }
        lines.push(`  ${parts.filter(Boolean).join(sep)}`);
        // Per-round savings line (per locked decision: show when savings exist)
        if (
          rd.cacheSavingsTokens &&
          rd.cacheSavingsTokens > 0 &&
          rd.cacheSavingsPercent !== undefined &&
          rd.cacheSavingsDollars !== undefined
        ) {
          lines.push(
            renderRoundSavings(
              rd.cacheSavingsTokens,
              rd.cacheSavingsPercent,
              rd.cacheSavingsDollars,
            ),
          );
        }
        break;
      }

      case 'running': {
        if (rd.retrying) {
          // Show retry countdown inline
          lines.push(
            `  ${renderRetryCountdown(
              rd.roundNumber,
              computeSecondsLeft(rd),
              rd.retryReason ?? 'unknown',
            )}`,
          );
        } else {
          // Show live progress: Round N/T ◆ X,XXX tokens (Y,YYY total) · Zs
          const frame =
            spinnerFrame !== undefined
              ? SPINNER_FRAMES.frames[spinnerFrame % SPINNER_FRAMES.frames.length]
              : SPINNER_FRAMES.frames[0];
          const streamTokens = rd.streamingTokens ?? 0;
          const tokenCount = streamTokens.toLocaleString();
          const totalCount = cumulativeTokens.toLocaleString();
          const elapsedSec = ((rd.elapsedMs ?? 0) / 1000).toFixed(1);
          lines.push(
            `  ${pc.magenta(frame)} ${roundLabel}/${totalRounds} ${pc.dim('\u00B7')} ${tokenCount} tokens ${pc.dim(`(${totalCount} total)`)} ${pc.dim('\u00B7')} ${pc.dim(`${elapsedSec}s`)}`,
          );
          // Streaming indicator: shown when --stream flag is active
          if (streamVisible) {
            lines.push(pc.dim('  streaming...'));
          }
        }
        break;
      }

      case 'failed': {
        const reason = rd.retryReason ? ` (${rd.retryReason})` : '';
        let line = `  ${pc.red(SYMBOLS.failed)} ${roundLabel} failed${pc.dim(reason)}`;
        if (rd.affectedDocs && rd.affectedDocs.length > 0) {
          line += `${sep}Missing: ${rd.affectedDocs.join(', ')}`;
        }
        lines.push(line);
        break;
      }

      case 'pending': {
        lines.push(`  ${pc.dim(SYMBOLS.pending)} ${pc.dim(`${roundLabel}`)}`);
        break;
      }
    }
  }

  // Running total line -- omit for local providers (no $0.00 shown)
  if (!isLocal && totalCost > 0) {
    lines.push(`  ${pc.yellow(formatCost(totalCost))} total`);
  }

  // Cost warning -- only for cloud providers
  if (!isLocal && totalCost > costWarningThreshold && costWarningThreshold > 0) {
    lines.push(`  ${renderCostWarning(totalCost, costWarningThreshold)}`);
  }

  return lines;
}

/**
 * Render a single document completion line.
 *
 * Format: `  ✓ 00-INDEX.md`
 */
export function renderDocLine(filename: string): string {
  return `  ${pc.green(SYMBOLS.done)} ${pc.cyan(filename)}`;
}

/**
 * Compute milliseconds saved by parallel execution of rounds 5 and 6.
 *
 * Returns null if either round is missing, cached, or not done.
 * Returns null if savings are <= 2 seconds (not worth reporting).
 */
export function computeParallelSavings(rounds: Map<number, RoundDisplayState>): number | null {
  const r5 = rounds.get(5);
  const r6 = rounds.get(6);

  if (!r5 || !r6) return null;
  if (r5.status === 'cached' || r6.status === 'cached') return null;
  if (r5.status !== 'done' || r6.status !== 'done') return null;

  const parallelWallTime = Math.max(r5.elapsedMs, r6.elapsedMs);
  const sequentialTime = r5.elapsedMs + r6.elapsedMs;
  const savedMs = sequentialTime - parallelWallTime;

  return savedMs > 2000 ? savedMs : null;
}

/**
 * Render the parallel savings line shown in the completion summary.
 *
 * Format: `  Parallel execution saved ~1m 23s`
 */
export function renderParallelSavings(savedMs: number): string {
  return pc.dim('  Parallel execution saved ~') + formatDuration(savedMs);
}

/**
 * Render the completion summary line.
 *
 * Per CONTEXT.md: compact single line, NOT framed box.
 * Format: `✓ 14 documents · 48K tokens · $0.12 · 1m 23s`
 * Includes per-round breakdown and render timing when available.
 */
export function renderCompletionSummary(state: DisplayState): string[] {
  const sep = pc.dim(' \u00B7 ');
  const parts = [
    `${pc.green(SYMBOLS.done)} ${state.completionDocs} documents`,
    formatTokens(state.totalTokens),
  ];
  // Only show cost for cloud providers (no $0.00 for local)
  if (!state.isLocal) {
    parts.push(pc.yellow(formatCost(state.totalCost)));
  }
  parts.push(formatDuration(state.elapsedMs));
  const completionLine = parts.join(sep);

  const lines: string[] = [completionLine];

  // Per-round breakdown (per locked decision: each round shows tokens and cost)
  if (state.roundSummaries && state.roundSummaries.length > 0) {
    for (const rs of state.roundSummaries) {
      const roundParts: string[] = [
        `  Round ${rs.round}`,
        formatTokens(rs.inputTokens + rs.outputTokens),
      ];
      if (!state.isLocal) {
        roundParts.push(pc.yellow(formatCost(rs.cost)));
      }
      lines.push(pc.dim(roundParts.join(sep)));

      // Savings line for this round (per locked decision: tokens, percentage, dollars)
      if (rs.savings && rs.savings.tokens > 0) {
        lines.push(renderRoundSavings(rs.savings.tokens, rs.savings.percent, rs.savings.dollars));
      }
    }
  }

  // parallelSavedMs is inherited from Phase 5 infrastructure (parallel round execution savings).
  if (state.parallelSavedMs !== undefined && state.parallelSavedMs > 0) {
    lines.push(renderParallelSavings(state.parallelSavedMs));
  }

  // Render timing line (per locked decision: show time saved by parallel rendering)
  if (state.renderTimingMs !== undefined && state.renderSequentialEstimateMs !== undefined) {
    const savedMs = state.renderSequentialEstimateMs - state.renderTimingMs;
    if (savedMs > 500) {
      // Only show if meaningful
      const docCount = state.completionDocs;
      const actualSec = (state.renderTimingMs / 1000).toFixed(1);
      const savedSec = formatDuration(savedMs);
      lines.push(
        pc.dim(`  Rendered ${docCount} docs in ${actualSec}s (saved ~${savedSec} vs sequential)`),
      );
    }
  }

  return lines;
}

/**
 * Render a cost warning line.
 *
 * Format: `⚠ Cost: $1.23 (threshold: $1.00)` in yellow.
 */
export function renderCostWarning(currentCost: number, threshold: number): string {
  return pc.yellow(
    `${SYMBOLS.warning} Cost: ${formatCost(currentCost)} (threshold: ${formatCost(threshold)})`,
  );
}

/**
 * Render a retry countdown line.
 *
 * Format: `↻ Round 3 failed (rate limit) · retrying in 28s...`
 *
 * The caller computes secondsLeft from RoundDisplayState.retryStartMs
 * and retryDelayMs.
 */
export function renderRetryCountdown(round: number, secondsLeft: number, reason: string): string {
  return `${pc.yellow(SYMBOLS.retry)} Round ${round} failed ${pc.dim(`(${reason})`)} ${pc.dim('\u00B7')} retrying in ${pc.yellow(`${secondsLeft}s`)}...`;
}

/**
 * Render the error summary section.
 *
 * Rendered at end of pipeline: full details for each error.
 * Section header + each error on its own lines.
 */
export function renderErrorSummary(errors: ErrorInfo[]): string[] {
  if (errors.length === 0) return [];

  const lines: string[] = [];
  lines.push('');
  lines.push(pc.red(`${SYMBOLS.failed} Errors:`));

  for (const err of errors) {
    lines.push(`  ${pc.red(SYMBOLS.failed)} ${pc.bold(err.source)}: ${err.message}`);
    if (err.affectedDocs && err.affectedDocs.length > 0) {
      lines.push(`    Affected: ${err.affectedDocs.join(', ')}`);
    }
  }

  return lines;
}

/**
 * Compute seconds left on a retry countdown from round display state.
 */
function computeSecondsLeft(rd: RoundDisplayState): number {
  if (!rd.retryStartMs || !rd.retryDelayMs) return 0;
  return Math.max(0, Math.ceil((rd.retryDelayMs - (Date.now() - rd.retryStartMs)) / 1000));
}
