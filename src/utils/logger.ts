import pc from 'picocolors';
import { HandoverError } from './errors.js';

type StepStatus = 'start' | 'done' | 'fail';

/**
 * Structured logger with verbosity levels and semantic colors.
 *
 * Color palette (from CONTEXT.md):
 * - Cyan: headers, paths, info
 * - Green: success
 * - Yellow: warnings, cost
 * - Red: errors
 * - Magenta: AI activity
 *
 * Respects NO_COLOR env var automatically (picocolors handles this).
 */
export class Logger {
  private verbose = false;
  private suppressed = false;

  /**
   * Enable or disable verbose output.
   * Verbose messages are hidden by default.
   */
  setVerbose(enabled: boolean): void {
    this.verbose = enabled;
  }

  /**
   * Enable or disable suppress mode.
   * When suppressed, all stdout-based methods (info, log, warn, success,
   * step, ai, blank) are no-ops to prevent corrupting the renderer's
   * multi-line display. Error output (stderr) is never suppressed.
   */
  setSuppressed(enabled: boolean): void {
    this.suppressed = enabled;
  }

  /**
   * Informational message — always shown.
   * Cyan colored for headers and paths.
   */
  info(msg: string): void {
    if (this.suppressed) return;
    console.log(pc.cyan('ℹ') + ' ' + msg);
  }

  /**
   * Verbose message — only shown when -v flag is active.
   */
  log(msg: string): void {
    if (this.suppressed) return;
    if (this.verbose) {
      console.log(pc.dim('  ' + msg));
    }
  }

  /**
   * Warning message — always shown.
   * Yellow colored.
   */
  warn(msg: string): void {
    if (this.suppressed) return;
    console.log(pc.yellow('⚠') + ' ' + msg);
  }

  /**
   * Error message — always shown.
   * Accepts HandoverError for rich formatting or plain string.
   */
  error(err: HandoverError | string): void {
    if (err instanceof HandoverError) {
      console.error(err.format());
    } else {
      console.error(pc.red('✗') + ' ' + err);
    }
  }

  /**
   * Success message — always shown.
   * Green colored.
   */
  success(msg: string): void {
    if (this.suppressed) return;
    console.log(pc.green('✓') + ' ' + msg);
  }

  /**
   * Step progress indicator.
   * Shows spinner-like start, checkmark done, or X fail.
   */
  step(name: string, status: StepStatus): void {
    if (this.suppressed) return;
    switch (status) {
      case 'start':
        console.log(pc.magenta('◆') + ' ' + name + pc.dim('...'));
        break;
      case 'done':
        console.log(pc.green('✓') + ' ' + name);
        break;
      case 'fail':
        console.log(pc.red('✗') + ' ' + name);
        break;
    }
  }

  /**
   * AI activity indicator — magenta colored.
   */
  ai(msg: string): void {
    if (this.suppressed) return;
    console.log(pc.magenta('⚡') + ' ' + msg);
  }

  /**
   * Blank line for visual separation.
   */
  blank(): void {
    if (this.suppressed) return;
    console.log();
  }
}

/**
 * Singleton logger instance.
 * Import and use directly: `import { logger } from './utils/logger.js'`
 */
export const logger = new Logger();
