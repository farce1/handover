import type { QualityMetrics } from './types.js';

// ─── Quality thresholds per round ───────────────────────────────────────────

interface QualityThresholds {
  minTextLength: number;
  minCodeReferences: number;
}

const ROUND_THRESHOLDS: Record<number, QualityThresholds> = {
  1: { minTextLength: 500, minCodeReferences: 3 },
  2: { minTextLength: 500, minCodeReferences: 5 },
  3: { minTextLength: 500, minCodeReferences: 5 },
  4: { minTextLength: 500, minCodeReferences: 5 },
  5: { minTextLength: 500, minCodeReferences: 5 },
  6: { minTextLength: 200, minCodeReferences: 2 },
};

// ─── Code reference detection pattern ───────────────────────────────────────

const CODE_REF_PATTERN =
  /(?:src\/|\.ts\b|\.js\b|\.py\b|\.rs\b|\.go\b|function\s+\w+|class\s+\w+)/g;

// ─── Quality checker ────────────────────────────────────────────────────────

/**
 * Check the quality of a round's output using heuristic thresholds.
 * Returns metrics including an isAcceptable boolean.
 *
 * Thresholds (from research):
 * - Min text length: 500 chars for Rounds 1-5, 200 chars for Round 6
 * - Min code references: 3 for Round 1, 5 for Rounds 2-5, 2 for Round 6
 * - Zero file path references always fails regardless of length
 */
export function checkRoundQuality(
  output: Record<string, unknown>,
  roundNumber: number,
): QualityMetrics {
  const text = JSON.stringify(output);
  const textLength = text.length;

  // Count code references using pattern matching
  const matches = text.match(CODE_REF_PATTERN) ?? [];
  const codeReferences = matches.length;

  // Calculate specificity: code refs per 100 chars of text
  const specificity = codeReferences / Math.max(textLength / 100, 1);

  // Look up thresholds for this round (default to strict thresholds)
  const thresholds = ROUND_THRESHOLDS[roundNumber] ?? {
    minTextLength: 500,
    minCodeReferences: 5,
  };

  // Zero file path references always fails
  const hasAnyFilePaths = /(?:src\/|[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.\w+)/.test(text);

  const isAcceptable =
    textLength >= thresholds.minTextLength &&
    codeReferences >= thresholds.minCodeReferences &&
    hasAnyFilePaths;

  return {
    textLength,
    codeReferences,
    specificity,
    isAcceptable,
  };
}
