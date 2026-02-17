import type { z } from 'zod';
import type { LLMProvider } from '../providers/base.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext } from '../context/types.js';
import type { HandoverConfig } from '../config/schema.js';
import type { TokenUsageTracker } from '../context/tracker.js';
import type { StepDefinition } from '../orchestrator/types.js';
import type { RoundExecutionResult } from './types.js';
import type { Round1Output, Round2Output } from './schemas.js';
import { Round2OutputSchema } from './schemas.js';
import { createStep } from '../orchestrator/step.js';
import { buildRoundPrompt, buildRetrySystemPrompt, ROUND_SYSTEM_PROMPTS } from './prompts.js';
import { validateRoundClaims } from './validator.js';
import { buildRound2Fallback } from './fallbacks.js';
import { executeRound } from './runner.js';

// ─── Round 2: Module Detection ─────────────────────────────────────────────

/**
 * Create a StepDefinition for Round 2: Module Detection.
 *
 * Round 2 identifies module boundaries from AST imports, directory structure,
 * and naming patterns. It depends on Round 1 and uses its compressed context
 * as prior analysis.
 *
 * @param getRound1Result - Function that retrieves Round 1's result from the
 *   DAG context. Returns undefined if Round 1 was skipped or failed.
 */
export function createRound2Step(
  provider: LLMProvider,
  staticAnalysis: StaticAnalysisResult,
  packedContext: PackedContext,
  config: HandoverConfig,
  tracker: TokenUsageTracker,
  estimateTokensFn: (text: string) => number,
  getRound1Result: () => RoundExecutionResult<Round1Output> | undefined,
  onRetry?: (attempt: number, delayMs: number, reason: string) => void,
): StepDefinition {
  return createStep({
    id: 'ai-round-2',
    name: 'AI Round 2: Module Detection',
    deps: ['ai-round-1'],
    execute: async (_ctx): Promise<RoundExecutionResult<Round2Output>> => {
      // 1. Get Round 1 compressed context for prior analysis
      const round1Result = getRound1Result();
      const priorRounds = round1Result ? [round1Result.context] : [];

      // 2. Build round-specific data from static analysis
      const roundData = buildRound2Data(staticAnalysis);

      // 3. Execute the round via the shared engine
      return executeRound<Round2Output>({
        roundNumber: 2,
        provider,
        schema: Round2OutputSchema as z.ZodType<Round2Output>,
        buildPrompt: (isRetry: boolean) => {
          const systemPrompt = isRetry
            ? buildRetrySystemPrompt(ROUND_SYSTEM_PROMPTS[2])
            : ROUND_SYSTEM_PROMPTS[2];

          const request = buildRoundPrompt(
            2,
            systemPrompt,
            packedContext,
            priorRounds,
            roundData,
            estimateTokensFn,
          );

          return {
            ...request,
            temperature: isRetry ? 0.1 : 0.3,
            maxTokens: 8192, // Module detection may need more output for complex projects
          };
        },
        validate: (data: Round2Output) =>
          validateRoundClaims(2, data as unknown as Record<string, unknown>, staticAnalysis),
        buildFallback: () => buildRound2Fallback(staticAnalysis),
        tracker,
        estimateTokensFn,
        onRetry,
      });
    },
    onSkip: () => buildRound2Fallback(staticAnalysis),
  });
}

// ─── Round 2 Data Builder ──────────────────────────────────────────────────

/**
 * Build the round-specific data string for Round 2 from static analysis.
 * Includes AST summary, directory structure, import graph, and export summary.
 */
function buildRound2Data(analysis: StaticAnalysisResult): string {
  const sections: string[] = [];

  // AST summary
  sections.push(
    '## AST Summary',
    `Total functions: ${analysis.ast.summary.totalFunctions}`,
    `Total classes: ${analysis.ast.summary.totalClasses}`,
    `Total exports: ${analysis.ast.summary.totalExports}`,
    `Total imports: ${analysis.ast.summary.totalImports}`,
    '',
    'Language breakdown:',
  );

  for (const [lang, count] of Object.entries(analysis.ast.summary.languageBreakdown)) {
    sections.push(`  ${lang}: ${count} files`);
  }

  // Directory structure (top 2 levels)
  const directories = analysis.fileTree.directoryTree
    .filter((entry) => entry.type === 'directory')
    .slice(0, 50);

  if (directories.length > 0) {
    sections.push('', '## Directory Structure');
    for (const dir of directories) {
      const childCount = dir.children ?? 0;
      sections.push(`  ${dir.path}/ (${childCount} items)`);
    }
  }

  // Import graph: for each file, its imports and what imports it
  const importMap = new Map<string, string[]>();
  const reverseImportMap = new Map<string, string[]>();

  for (const file of analysis.ast.files) {
    const imports = file.imports.map((i) => i.source);
    if (imports.length > 0) {
      importMap.set(file.path, imports);
    }

    // Build reverse map
    for (const imp of file.imports) {
      const existing = reverseImportMap.get(imp.source) ?? [];
      existing.push(file.path);
      reverseImportMap.set(imp.source, existing);
    }
  }

  // Show import relationships (limit to manageable size)
  const importEntries = [...importMap.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 40);

  if (importEntries.length > 0) {
    sections.push('', '## Import Graph (top files by import count)');
    for (const [file, imports] of importEntries) {
      sections.push(`  ${file}:`);
      for (const imp of imports.slice(0, 10)) {
        sections.push(`    -> ${imp}`);
      }
      if (imports.length > 10) {
        sections.push(`    ... and ${imports.length - 10} more`);
      }
    }
  }

  // Reverse imports: most-imported modules (entry point candidates)
  const reverseEntries = [...reverseImportMap.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 20);

  if (reverseEntries.length > 0) {
    sections.push('', '## Most-Imported Sources (likely module entry points)');
    for (const [source, importers] of reverseEntries) {
      sections.push(`  ${source} (imported by ${importers.length} files)`);
    }
  }

  // Export summary: files with most exports
  const exportFiles = analysis.ast.files
    .filter((f) => f.exports.length > 0)
    .sort((a, b) => b.exports.length - a.exports.length)
    .slice(0, 20);

  if (exportFiles.length > 0) {
    sections.push('', '## Files with Most Exports');
    for (const file of exportFiles) {
      sections.push(
        `  ${file.path}: ${file.exports.length} exports (${file.exports.slice(0, 5).join(', ')}${file.exports.length > 5 ? '...' : ''})`,
      );
    }
  }

  return sections.join('\n');
}
