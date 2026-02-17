/**
 * Pure formatting utility functions for the terminal UI.
 *
 * All functions are side-effect-free and return plain strings.
 * NO_COLOR handling degrades Unicode symbols to ASCII equivalents.
 */

/** Check if NO_COLOR environment variable is set. */
export function isNoColor(): boolean {
  return process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '';
}

/**
 * Format a token count for display.
 *
 * Examples: `342 tokens`, `48K tokens`, `1.2M tokens`
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M tokens`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K tokens`;
  }
  return `${n} tokens`;
}

/**
 * Format a dollar amount for display.
 *
 * Examples: `$0.12`, `$1.23`, `$0.00`
 */
export function formatCost(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

/**
 * Format a duration in milliseconds for display.
 *
 * Examples: `0s`, `45s`, `1m 23s`
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format a progress bar.
 *
 * @param progress - 0-1 float representing completion
 * @param width - Character width of the bar
 * @returns Formatted bar string (no color applied)
 *
 * Uses heavy style: filled `━` (U+2501), empty `─` (U+2500).
 * With NO_COLOR: filled `=`, empty `-`.
 */
export function formatBar(progress: number, width: number): string {
  const clamped = Math.max(0, Math.min(1, progress));
  const filled = Math.round(clamped * width);
  const empty = width - filled;

  if (isNoColor()) {
    return '='.repeat(filled) + '-'.repeat(empty);
  }
  return '\u2501'.repeat(filled) + '\u2500'.repeat(empty);
}

/** TTY symbols for status display. */
const ttySymbols = {
  pending: '\u25CB',   // ○
  running: '\u25C6',   // ◆
  done: '\u2713',      // ✓
  failed: '\u2717',    // ✗
  arrow: '\u25B6',     // ▶
  warning: '\u26A0',   // ⚠
  cost: '$',
  retry: '\u21BB',     // ↻
} as const;

/** ASCII fallback symbols for NO_COLOR environments. */
export const asciiSymbols = {
  pending: 'o',
  running: '*',
  done: '[ok]',
  failed: '[FAIL]',
  arrow: '>',
  warning: '[!]',
  cost: '$',
  retry: '[R]',
} as const;

/**
 * Symbol set that respects NO_COLOR.
 * When NO_COLOR is set, Unicode symbols degrade to ASCII equivalents.
 */
export const SYMBOLS = new Proxy(ttySymbols, {
  get(target, prop: string) {
    if (isNoColor()) {
      return asciiSymbols[prop as keyof typeof asciiSymbols];
    }
    return target[prop as keyof typeof ttySymbols];
  },
}) as typeof ttySymbols;

/** Spinner frames for animated progress indicators. */
export const SPINNER_FRAMES = {
  get frames(): readonly string[] {
    if (isNoColor()) {
      return ['|', '/', '-', '\\'];
    }
    return ['\u25D2', '\u25D0', '\u25D3', '\u25D1']; // ◒ ◐ ◓ ◑
  },
};
