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
import { formatCost, formatDuration, formatTokens, isNoColor, SPINNER_FRAMES, SYMBOLS } from './formatters.js';

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

  return [`${arrow} ${name}${sep}${providerModel}${sep}${files}${sep}${lang}`];
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
 * Render the AI rounds block.
 *
 * Stacked lines per active/complete round:
 * - Running: spinner + name + elapsed time
 * - Done:   `✓ R1 Project Overview · 12K tokens · $0.02`
 * - Failed: `✗ R3 failed (reason) · Missing: DOC1, DOC2`
 *
 * Bottom line: running total cost.
 * Cost warning line if over threshold.
 */
export function renderRoundBlock(
  rounds: Map<number, RoundDisplayState>,
  totalCost: number,
  costWarningThreshold: number,
  spinnerFrame?: number,
): string[] {
  const lines: string[] = [];
  const sep = pc.dim(' \u00B7 ');

  for (const [, rd] of rounds) {
    const roundLabel = `R${rd.roundNumber}`;

    switch (rd.status) {
      case 'done': {
        const tokenStr = rd.tokens !== undefined ? formatTokens(rd.tokens) : '';
        const costStr = rd.cost !== undefined ? pc.yellow(formatCost(rd.cost)) : '';
        const parts = [
          `${pc.green(SYMBOLS.done)} ${roundLabel} ${rd.name}`,
          tokenStr,
          costStr,
        ].filter(Boolean);
        lines.push(`  ${parts.join(sep)}`);
        break;
      }

      case 'running': {
        if (rd.retrying) {
          // Show retry countdown inline
          lines.push(`  ${renderRetryCountdown(
            rd.roundNumber,
            computeSecondsLeft(rd),
            rd.retryReason ?? 'unknown',
          )}`);
        } else {
          // Show spinner + elapsed time
          const frame = spinnerFrame !== undefined
            ? SPINNER_FRAMES.frames[spinnerFrame % SPINNER_FRAMES.frames.length]
            : SPINNER_FRAMES.frames[0];
          const elapsed = pc.dim(formatDuration(rd.elapsedMs));
          lines.push(`  ${pc.magenta(frame)} ${roundLabel} ${pc.bold(rd.name)}${sep}${elapsed}`);
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
        lines.push(`  ${pc.dim(SYMBOLS.pending)} ${pc.dim(`${roundLabel} ${rd.name}`)}`);
        break;
      }
    }
  }

  // Running total line
  if (totalCost > 0) {
    lines.push(`  ${pc.yellow(formatCost(totalCost))} total`);
  }

  // Cost warning
  if (totalCost > costWarningThreshold && costWarningThreshold > 0) {
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
    pc.yellow(formatCost(state.totalCost)),
    formatDuration(state.elapsedMs),
  ];
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
export function renderRetryCountdown(
  round: number,
  secondsLeft: number,
  reason: string,
): string {
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
