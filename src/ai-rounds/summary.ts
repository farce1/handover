import type { RoundExecutionResult, PipelineValidationSummary } from './types.js';
import { ROUND_NAMES } from './types.js';

// ─── Round-to-Document mapping ──────────────────────────────────────────────

const ROUND_DOCUMENT_MAP: Record<number, string> = {
  1: 'Project Overview document',
  2: 'Module Detection document',
  3: 'Feature Extraction document',
  4: 'Architecture Detection document',
  5: 'Edge Cases & Conventions document',
  6: 'Deployment Inference document',
};

// ─── Validation Summary Builder ─────────────────────────────────────────────

/**
 * Build a PipelineValidationSummary from all round execution results.
 *
 * Iterates over all 6 rounds, accumulating validation stats from each.
 * Missing rounds (not in the map) are recorded with status 'skipped' and zero counts.
 */
export function buildValidationSummary(
  roundResults: Map<number, RoundExecutionResult<unknown>>,
): PipelineValidationSummary {
  let totalClaims = 0;
  let validatedClaims = 0;
  let correctedClaims = 0;

  const roundSummaries: PipelineValidationSummary['roundSummaries'] = [];

  for (let round = 1; round <= 6; round++) {
    const result = roundResults.get(round);
    const name = ROUND_NAMES[round] ?? `Round ${round}`;

    if (!result) {
      // Missing round -- skipped
      roundSummaries.push({
        round,
        name,
        status: 'skipped',
        validated: 0,
        corrected: 0,
      });
      continue;
    }

    const { validation, status } = result;

    totalClaims += validation.total;
    validatedClaims += validation.validated;
    correctedClaims += validation.corrected;

    roundSummaries.push({
      round,
      name,
      status,
      validated: validation.validated,
      corrected: validation.corrected,
    });
  }

  return {
    totalClaims,
    validatedClaims,
    correctedClaims,
    roundSummaries,
  };
}

// ─── Failure Report Builder ─────────────────────────────────────────────────

/**
 * Build a markdown-formatted failure report from round execution results.
 *
 * Per locked decision: provides both per-section degraded indicators AND
 * a consolidated summary at the end.
 *
 * If all rounds succeeded, returns a brief success message.
 * If some rounds failed/degraded/skipped, lists them with status, reason,
 * and affected documents.
 */
export function buildFailureReport(
  roundResults: Map<number, RoundExecutionResult<unknown>>,
): string {
  const lines: string[] = [];

  // Check for any non-success rounds
  const problemRounds: Array<{
    round: number;
    name: string;
    status: string;
    reason?: string;
  }> = [];

  let totalClaims = 0;
  let correctedClaims = 0;

  for (let round = 1; round <= 6; round++) {
    const result = roundResults.get(round);
    const name = ROUND_NAMES[round] ?? `Round ${round}`;

    if (!result) {
      problemRounds.push({ round, name, status: 'skipped', reason: 'Round was not executed' });
      continue;
    }

    totalClaims += result.validation.total;
    correctedClaims += result.validation.corrected;

    if (result.status === 'degraded') {
      problemRounds.push({
        round,
        name,
        status: 'degraded',
        reason: 'Fell back to static data due to LLM failure',
      });
    }
  }

  // All rounds succeeded
  if (problemRounds.length === 0) {
    return `All 6 AI rounds completed successfully. ${totalClaims} claims validated, ${correctedClaims} corrected.`;
  }

  // Some rounds had issues -- build detailed report
  lines.push('## AI Analysis Pipeline Report');
  lines.push('');

  // Per-section indicators
  lines.push('### Round Status');
  lines.push('');

  for (let round = 1; round <= 6; round++) {
    const result = roundResults.get(round);
    const name = ROUND_NAMES[round] ?? `Round ${round}`;

    if (!result) {
      lines.push(`- **Round ${round} (${name}):** SKIPPED`);
      continue;
    }

    const statusIndicator =
      result.status === 'success'
        ? 'OK'
        : result.status === 'retried'
          ? 'RETRIED (passed)'
          : 'DEGRADED';

    const validationInfo = `${result.validation.validated} validated, ${result.validation.corrected} corrected`;
    lines.push(
      `- **Round ${round} (${name}):** ${statusIndicator} -- ${validationInfo}`,
    );
  }

  // Affected documents
  lines.push('');
  lines.push('### Affected Documents');
  lines.push('');

  for (const problem of problemRounds) {
    const doc = ROUND_DOCUMENT_MAP[problem.round] ?? `Round ${problem.round} output`;
    lines.push(
      `- **${doc}:** ${problem.status} -- ${problem.reason ?? 'unknown reason'}`,
    );
  }

  // Consolidated summary
  lines.push('');
  lines.push('### Summary');
  lines.push('');

  const successCount = 6 - problemRounds.length;
  const degradedCount = problemRounds.filter((r) => r.status === 'degraded').length;
  const skippedCount = problemRounds.filter((r) => r.status === 'skipped').length;

  lines.push(
    `${successCount}/6 rounds completed successfully. ` +
      (degradedCount > 0 ? `${degradedCount} degraded (using static fallback). ` : '') +
      (skippedCount > 0 ? `${skippedCount} skipped. ` : '') +
      `${totalClaims} claims validated, ${correctedClaims} corrected.`,
  );

  return lines.join('\n');
}

// ─── Terminal One-Liner ─────────────────────────────────────────────────────

/**
 * Format a one-line validation summary for terminal output.
 *
 * Examples:
 *   "AI analysis: 6/6 rounds complete, 42 claims validated, 3 corrected"
 *   "AI analysis: 4/6 rounds complete (2 degraded), 28 claims validated, 1 corrected"
 */
export function formatValidationLine(
  summary: PipelineValidationSummary,
): string {
  const successCount = summary.roundSummaries.filter(
    (r) => r.status === 'success' || r.status === 'retried',
  ).length;

  const degradedCount = summary.roundSummaries.filter(
    (r) => r.status === 'degraded',
  ).length;

  const totalRounds = summary.roundSummaries.length;

  const statusPart =
    degradedCount > 0
      ? `${successCount}/${totalRounds} rounds complete (${degradedCount} degraded)`
      : `${successCount}/${totalRounds} rounds complete`;

  return `AI analysis: ${statusPart}, ${summary.validatedClaims} claims validated, ${summary.correctedClaims} corrected`;
}
