import type { z } from 'zod';
import type { LLMProvider } from '../providers/base.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext } from '../context/types.js';
import type { HandoverConfig } from '../config/schema.js';
import type { TokenUsageTracker } from '../context/tracker.js';
import type { StepDefinition } from '../orchestrator/types.js';
import type { RoundExecutionResult } from './types.js';
import type { Round1Output, Round2Output, Round3Output } from './schemas.js';
import { Round3OutputSchema } from './schemas.js';
import { createStep } from '../orchestrator/step.js';
import {
  buildRoundPrompt,
  buildRetrySystemPrompt,
  ROUND_SYSTEM_PROMPTS,
} from './prompts.js';
import { validateRoundClaims } from './validator.js';
import { buildRound3Fallback } from './fallbacks.js';
import { executeRound } from './runner.js';

// ─── Round 3: Feature Extraction ────────────────────────────────────────────

/**
 * Create a StepDefinition for Round 3: Feature Extraction.
 *
 * Round 3 traces features across modules, identifying cross-module data flows.
 * It depends on Round 2 (needs module boundaries) and runs parallel with
 * Rounds 5 and 6. Its output feeds Round 4 for architecture detection.
 *
 * @param getPriorResults - Retrieves Round 1 and Round 2 results from DAG context.
 */
export function createRound3Step(
  provider: LLMProvider,
  staticAnalysis: StaticAnalysisResult,
  packedContext: PackedContext,
  config: HandoverConfig,
  tracker: TokenUsageTracker,
  estimateTokensFn: (text: string) => number,
  getPriorResults: () => {
    round1?: RoundExecutionResult<Round1Output>;
    round2?: RoundExecutionResult<Round2Output>;
  },
): StepDefinition {
  return createStep({
    id: 'ai-round-3',
    name: 'AI Round 3: Feature Extraction',
    deps: ['ai-round-2'], // Runs after R2, parallel with R5 and R6
    execute: async (_ctx): Promise<RoundExecutionResult<Round3Output>> => {
      // 1. Gather prior round compressed contexts
      const priorResults = getPriorResults();
      const priorRounds = [
        priorResults.round1?.context,
        priorResults.round2?.context,
      ].filter(
        (ctx): ctx is NonNullable<typeof ctx> => ctx !== undefined,
      );

      // 2. Build round-specific data from static analysis + prior results
      const roundData = buildRound3Data(staticAnalysis, priorResults);

      // 3. Execute the round via the shared engine
      return executeRound<Round3Output>({
        roundNumber: 3,
        provider,
        schema: Round3OutputSchema as z.ZodType<Round3Output>,
        buildPrompt: (isRetry: boolean) => {
          const systemPrompt = isRetry
            ? buildRetrySystemPrompt(ROUND_SYSTEM_PROMPTS[3])
            : ROUND_SYSTEM_PROMPTS[3];

          const request = buildRoundPrompt(
            3,
            systemPrompt,
            packedContext,
            priorRounds,
            roundData,
            estimateTokensFn,
          );

          return {
            ...request,
            temperature: isRetry ? 0.1 : 0.3,
            maxTokens: 4096,
          };
        },
        validate: (data: Round3Output) =>
          validateRoundClaims(
            3,
            data as unknown as Record<string, unknown>,
            staticAnalysis,
          ),
        buildFallback: () => buildRound3Fallback(staticAnalysis),
        tracker,
        estimateTokensFn,
      });
    },
    onSkip: () => buildRound3Fallback(staticAnalysis),
  });
}

// ─── Round 3 Data Builder ───────────────────────────────────────────────────

/**
 * Build the round-specific data string for Round 3 from static analysis
 * and prior round results (Round 1 entry points, Round 2 modules).
 */
function buildRound3Data(
  analysis: StaticAnalysisResult,
  priorResults: {
    round1?: RoundExecutionResult<Round1Output>;
    round2?: RoundExecutionResult<Round2Output>;
  },
): string {
  const sections: string[] = [];

  // Module list from Round 2 output
  const round2Data = priorResults.round2?.data;
  if (round2Data && round2Data.modules.length > 0) {
    sections.push('## Detected Modules');
    for (const mod of round2Data.modules) {
      sections.push(`### ${mod.name} (${mod.path})`);
      sections.push(`Purpose: ${mod.purpose}`);
      if (mod.publicApi.length > 0) {
        sections.push(`Public API: ${mod.publicApi.join(', ')}`);
      }
      if (mod.files.length > 0) {
        sections.push(`Files: ${mod.files.slice(0, 20).join(', ')}${mod.files.length > 20 ? ` ... and ${mod.files.length - 20} more` : ''}`);
      }
      sections.push('');
    }
  }

  // Entry points from Round 1 output
  const round1Data = priorResults.round1?.data;
  if (round1Data && round1Data.entryPoints.length > 0) {
    sections.push('## Entry Points');
    for (const ep of round1Data.entryPoints) {
      sections.push(`- ${ep.path} (${ep.type}): ${ep.description}`);
    }
    sections.push('');
  }

  // AST export/import map: which functions are exported, what imports what
  const exportMap = analysis.ast.files
    .filter((f) => f.exports.length > 0)
    .sort((a, b) => b.exports.length - a.exports.length)
    .slice(0, 30);

  if (exportMap.length > 0) {
    sections.push('## Export Map');
    for (const file of exportMap) {
      const exportNames = file.exports
        .map((e) => e.name)
        .slice(0, 10)
        .join(', ');
      const suffix = file.exports.length > 10 ? '...' : '';
      sections.push(`  ${file.path}: ${exportNames}${suffix}`);
    }
    sections.push('');
  }

  // Import relationships: who imports whom (top 40 by import count)
  const importEntries: Array<{ file: string; imports: string[] }> = [];
  for (const file of analysis.ast.files) {
    if (file.imports.length > 0) {
      importEntries.push({
        file: file.path,
        imports: file.imports.map((i) => i.source),
      });
    }
  }

  importEntries.sort((a, b) => b.imports.length - a.imports.length);

  if (importEntries.length > 0) {
    sections.push('## Import Map (files with most imports)');
    for (const entry of importEntries.slice(0, 40)) {
      sections.push(`  ${entry.file}:`);
      for (const imp of entry.imports.slice(0, 8)) {
        sections.push(`    -> ${imp}`);
      }
      if (entry.imports.length > 8) {
        sections.push(`    ... and ${entry.imports.length - 8} more`);
      }
    }
    sections.push('');
  }

  // Test file mapping: which modules have test coverage
  if (analysis.tests.testFiles.length > 0) {
    sections.push('## Test File Mapping');
    for (const testFile of analysis.tests.testFiles.slice(0, 30)) {
      sections.push(
        `  ${testFile.path} (${testFile.framework}, ${testFile.testCount} tests)`,
      );
    }
    sections.push('');
  }

  // Cross-module tracing instruction (locked decision)
  sections.push('## Analysis Instructions');
  sections.push(
    'Trace features across modules even when the trace is uncertain in places. ' +
      'Incomplete traces are more useful than missing ones. ' +
      'For each feature, identify which modules it touches and the data flow path.',
  );

  return sections.join('\n');
}
