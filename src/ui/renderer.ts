/**
 * Multi-line TTY renderer with in-place updates.
 *
 * Uses sisteransi for cursor manipulation and picocolors for color.
 * Renders a managed display region that erases and rewrites lines
 * on each state change, producing the Docker-build-style layout
 * for static analysis and the stacked AI round progress.
 *
 * Cursor safety: hides cursor during rendering, restores on
 * exit/SIGINT/destroy. Process event handlers are idempotent.
 */

import { cursor, erase } from 'sisteransi';
import pc from 'picocolors';

import type { DisplayState, Renderer } from './types.js';
import {
  renderAnalyzerBlock,
  renderBanner,
  renderCompletionSummary,
  renderDocLine,
  renderErrorSummary,
  renderRoundBlock,
} from './components.js';
import { formatDuration, SYMBOLS } from './formatters.js';
import { CIRenderer } from './ci-renderer.js';

/**
 * TerminalRenderer - multi-line in-place rendering for TTY terminals.
 *
 * Manages a "render region" of N lines that gets erased and rewritten
 * on each update. Uses sisteransi erase.lines() for clean overwrites.
 *
 * Render calls are throttled to ~16fps (60ms) to prevent flooding
 * from concurrent state updates (multiple analyzers/rounds completing
 * in the same event loop tick).
 */
export class TerminalRenderer implements Renderer {
  private output: NodeJS.WriteStream;
  private isTTY: boolean;

  private prevLineCount = 0;
  private spinnerFrame = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  // Throttle state
  private renderQueued = false;
  private lastRenderTime = 0;
  private readonly MIN_INTERVAL = 60; // ms, ~16fps

  // Store reference for spinner interval access
  private currentState: DisplayState | null = null;

  // Process event handler references (for cleanup)
  private exitHandler: () => void;
  private sigintHandler: () => void;

  constructor(output: NodeJS.WriteStream = process.stdout) {
    this.output = output;
    this.isTTY = output.isTTY === true;

    // Hide cursor during rendering (TTY only)
    if (this.isTTY) {
      this.output.write(cursor.hide);
    }

    // Cursor safety: restore on exit/SIGINT
    this.exitHandler = () => this.destroy();
    this.sigintHandler = () => {
      this.destroy();
      process.exit(130);
    };
    process.on('exit', this.exitHandler);
    process.on('SIGINT', this.sigintHandler);
  }

  /**
   * Erase prevLineCount lines and write new content.
   * Used for phases that update in-place (analyzers, rounds).
   */
  private write(lines: string[]): void {
    if (this.destroyed) return;

    // Erase previous render
    if (this.prevLineCount > 0) {
      this.output.write(erase.lines(this.prevLineCount));
    }

    // Write new content
    const content = lines.join('\n') + '\n';
    this.output.write(content);
    this.prevLineCount = lines.length;
  }

  /**
   * Append lines without erasing. Used for document rendering phase
   * where each file is added below the last.
   */
  private append(lines: string[]): void {
    if (this.destroyed) return;

    const content = lines.join('\n') + '\n';
    this.output.write(content);
    // Reset prevLineCount since appended content should not be erased
    this.prevLineCount = 0;
  }

  /**
   * Throttled render scheduling. If a render is already queued, skip.
   * Otherwise schedule at the next available interval slot.
   */
  private scheduleRender(buildFn: () => string[]): void {
    if (this.renderQueued || this.destroyed) return;
    this.renderQueued = true;

    const elapsed = Date.now() - this.lastRenderTime;
    const delay = Math.max(0, this.MIN_INTERVAL - elapsed);

    setTimeout(() => {
      this.renderQueued = false;
      this.lastRenderTime = Date.now();
      this.write(buildFn());
    }, delay);
  }

  /**
   * Start the spinner interval for animated updates.
   * Ticks at 80ms, incrementing the spinner frame and re-rendering
   * when in static-analysis or ai-rounds phase.
   */
  private startSpinner(): void {
    if (this.spinnerInterval) return;

    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame++;
      const state = this.currentState;
      if (!state) return;

      if (state.phase === 'static-analysis') {
        this.write(renderAnalyzerBlock(state.analyzers));
      } else if (state.phase === 'ai-rounds') {
        this.write(this.buildRoundLines(state));
      }
    }, 80);
  }

  /**
   * Build round block lines including retry countdowns.
   * Retry countdown computation happens inside renderRoundBlock
   * via the component's computeSecondsLeft helper.
   */
  private buildRoundLines(state: DisplayState): string[] {
    return renderRoundBlock(
      state.rounds,
      state.totalCost,
      state.costWarningThreshold,
      this.spinnerFrame,
      state.isLocal,
    );
  }

  // --- Renderer interface implementation ---

  onBanner(state: DisplayState): void {
    this.currentState = state;
    const lines = renderBanner(state);
    this.append(lines);
    this.append(['']); // blank line after banner
    this.startSpinner();
  }

  onAnalyzerUpdate(state: DisplayState): void {
    this.currentState = state;
    this.scheduleRender(() => renderAnalyzerBlock(state.analyzers));
  }

  onAnalyzersDone(state: DisplayState): void {
    this.currentState = state;

    // Write final state of analyzer block
    this.write(renderAnalyzerBlock(state.analyzers));

    // Count done/total
    let doneCount = 0;
    for (const [, status] of state.analyzers) {
      if (status === 'done') doneCount++;
    }
    const total = state.analyzers.size;

    // Collapse to summary line
    const duration = formatDuration(state.analyzerElapsedMs);
    const summaryLine = `${pc.green(SYMBOLS.done)} Static analysis ${pc.dim('\u00B7')} ${doneCount}/${total} analyzers ${pc.dim('\u00B7')} ${duration}`;
    this.write([summaryLine]);

    // Phase complete: stop overwriting
    this.prevLineCount = 0;
    this.append(['']); // blank line
  }

  onRoundUpdate(state: DisplayState): void {
    this.currentState = state;
    this.scheduleRender(() => this.buildRoundLines(state));
  }

  onRoundsDone(state: DisplayState): void {
    this.currentState = state;

    // Write final round state
    this.write(this.buildRoundLines(state));

    // Phase complete: stop overwriting
    this.prevLineCount = 0;
    this.append(['']); // blank line
  }

  onDocRendered(state: DisplayState): void {
    this.currentState = state;

    // Append the latest doc line (last entry in renderedDocs)
    if (state.renderedDocs.length > 0) {
      const latest = state.renderedDocs[state.renderedDocs.length - 1];
      this.append([renderDocLine(latest)]);
    }
  }

  onComplete(state: DisplayState): void {
    this.currentState = state;
    this.append(['']); // blank line before completion
    this.append(renderCompletionSummary(state));

    // Print error summary if there are errors
    if (state.errors.length > 0) {
      this.append(renderErrorSummary(state.errors));
    }

    this.destroy();
  }

  onError(state: DisplayState): void {
    this.currentState = state;
    this.append(renderErrorSummary(state.errors));
    this.destroy();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Clear spinner interval
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }

    // Show cursor
    if (this.isTTY) {
      this.output.write(cursor.show);
    }

    // Remove process event handlers
    process.removeListener('exit', this.exitHandler);
    process.removeListener('SIGINT', this.sigintHandler);
  }
}

/**
 * Factory function to create the appropriate renderer.
 *
 * Returns CIRenderer for non-TTY, CI, or TF_BUILD environments.
 * Otherwise returns TerminalRenderer.
 */
export function createRenderer(output: NodeJS.WriteStream = process.stdout): Renderer {
  const isTTY = output.isTTY === true;
  const isCI = !isTTY || Boolean(process.env.CI) || Boolean(process.env.TF_BUILD);

  if (isCI) {
    return new CIRenderer();
  }

  return new TerminalRenderer(output);
}
