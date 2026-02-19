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
 * Render the completion summary line.
 *
 * Per CONTEXT.md: compact single line, NOT framed box.
 * Format: `✓ 14 documents · 48K tokens · $0.12 · 1m 23s`
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
  return [parts.join(sep)];
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
