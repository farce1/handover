import type { z } from 'zod';
import type { LLMProvider } from '../providers/base.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext } from '../context/types.js';
import type { HandoverConfig } from '../config/schema.js';
import type { TokenUsageTracker } from '../context/tracker.js';
import type { StepDefinition } from '../orchestrator/types.js';
import type { RoundExecutionResult } from './types.js';
import type {
  Round1Output,
  Round2Output,
  Round3Output,
  Round4Output,
} from './schemas.js';
import { Round4OutputSchema } from './schemas.js';
import { createStep } from '../orchestrator/step.js';
import {
  buildRoundPrompt,
  buildRetrySystemPrompt,
  ROUND_SYSTEM_PROMPTS,
} from './prompts.js';
import { validateRoundClaims } from './validator.js';
import { buildRound4Fallback } from './fallbacks.js';
import { executeRound } from './runner.js';

// ─── Round 4: Architecture Detection ────────────────────────────────────────

/**
 * Create a StepDefinition for Round 4: Architecture Detection.
 *
 * Round 4 identifies high-confidence architecture patterns from module
 * relationships, feature cross-module flows, and directory structure.
 * It depends on Round 3 (needs feature context for flow analysis) and
 * runs parallel with Rounds 5 and 6.
 *
 * @param getPriorResults - Retrieves Round 1, 2, and 3 results from DAG context.
 */
export function createRound4Step(
  provider: LLMProvider,
  staticAnalysis: StaticAnalysisResult,
  packedContext: PackedContext,
  config: HandoverConfig,
  tracker: TokenUsageTracker,
  estimateTokensFn: (text: string) => number,
  getPriorResults: () => {
    round1?: RoundExecutionResult<Round1Output>;
    round2?: RoundExecutionResult<Round2Output>;
    round3?: RoundExecutionResult<Round3Output>;
  },
): StepDefinition {
  return createStep({
    id: 'ai-round-4',
    name: 'AI Round 4: Architecture Detection',
    deps: ['ai-round-3'], // Sequential after R3 (needs feature context), parallel with R5 and R6
    execute: async (_ctx): Promise<RoundExecutionResult<Round4Output>> => {
      // 1. Gather prior round compressed contexts
      const priorResults = getPriorResults();
      const priorRounds = [
        priorResults.round1?.context,
        priorResults.round2?.context,
        priorResults.round3?.context,
      ].filter(
        (ctx): ctx is NonNullable<typeof ctx> => ctx !== undefined,
      );

      // 2. Build round-specific data from static analysis + prior results
      const roundData = buildRound4Data(staticAnalysis, priorResults);

      // 3. Execute the round via the shared engine
      return executeRound<Round4Output>({
        roundNumber: 4,
        provider,
        schema: Round4OutputSchema as z.ZodType<Round4Output>,
        buildPrompt: (isRetry: boolean) => {
          const systemPrompt = isRetry
            ? buildRetrySystemPrompt(ROUND_SYSTEM_PROMPTS[4])
            : ROUND_SYSTEM_PROMPTS[4];

          const request = buildRoundPrompt(
            4,
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
        validate: (data: Round4Output) =>
          validateRoundClaims(
            4,
            data as unknown as Record<string, unknown>,
            staticAnalysis,
          ),
        buildFallback: () => buildRound4Fallback(staticAnalysis),
        tracker,
        estimateTokensFn,
      });
    },
    onSkip: () => buildRound4Fallback(staticAnalysis),
  });
}

// ─── Round 4 Data Builder ───────────────────────────────────────────────────

/**
 * Build the round-specific data string for Round 4 from static analysis
 * and prior round results (R1 overview, R2 modules, R3 features).
 */
function buildRound4Data(
  analysis: StaticAnalysisResult,
  priorResults: {
    round1?: RoundExecutionResult<Round1Output>;
    round2?: RoundExecutionResult<Round2Output>;
    round3?: RoundExecutionResult<Round3Output>;
  },
): string {
  const sections: string[] = [];

  // Module relationships from Round 2 (dependency graph between modules)
  const round2Data = priorResults.round2?.data;
  if (round2Data) {
    if (round2Data.relationships.length > 0) {
      sections.push('## Module Relationships (from Round 2)');
      for (const rel of round2Data.relationships) {
        sections.push(
          `  ${rel.from} -> ${rel.to} (${rel.type}): ${rel.evidence}`,
        );
      }
      sections.push('');
    }

    if (round2Data.modules.length > 0) {
      sections.push('## Module Boundaries');
      for (const mod of round2Data.modules) {
        sections.push(`  ${mod.name} (${mod.path}): ${mod.purpose}`);
        if (mod.publicApi.length > 0) {
          sections.push(`    API: ${mod.publicApi.slice(0, 10).join(', ')}`);
        }
      }
      sections.push('');
    }
  }

  // Feature cross-module flows from Round 3
  const round3Data = priorResults.round3?.data;
  if (round3Data) {
    if (round3Data.crossModuleFlows.length > 0) {
      sections.push('## Cross-Module Feature Flows (from Round 3)');
      for (const flow of round3Data.crossModuleFlows) {
        sections.push(`  ${flow.name}: ${flow.path.join(' -> ')}`);
        sections.push(`    ${flow.description}`);
      }
      sections.push('');
    }

    if (round3Data.features.length > 0) {
      sections.push('## Features (from Round 3)');
      for (const feat of round3Data.features.slice(0, 20)) {
        const modList = feat.modules.join(', ');
        sections.push(
          `  ${feat.name}: ${feat.description} [modules: ${modList}]`,
        );
      }
      sections.push('');
    }
  }

  // Import/export patterns from AST data
  const importPatterns = new Map<string, number>();
  for (const file of analysis.ast.files) {
    for (const imp of file.imports) {
      // Track import source patterns (e.g., relative vs package)
      const pattern = imp.source.startsWith('.')
        ? 'relative'
        : imp.source.startsWith('@')
          ? 'scoped-package'
          : 'package';
      importPatterns.set(pattern, (importPatterns.get(pattern) ?? 0) + 1);
    }
  }

  if (importPatterns.size > 0) {
    sections.push('## Import Patterns');
    for (const [pattern, count] of importPatterns) {
      sections.push(`  ${pattern}: ${count} imports`);
    }
    sections.push('');
  }

  // Directory structure suggesting layering (controllers/, services/, models/, etc.)
  const layerKeywords = [
    'controller',
    'service',
    'model',
    'middleware',
    'route',
    'handler',
    'repository',
    'util',
    'helper',
    'lib',
    'core',
    'domain',
    'infrastructure',
    'presentation',
    'api',
    'view',
    'component',
    'store',
    'reducer',
    'action',
    'hook',
    'provider',
    'adapter',
    'gateway',
    'factory',
    'strategy',
    'command',
    'query',
    'event',
  ];

  const layerDirs: Array<{ path: string; keyword: string }> = [];
  for (const entry of analysis.fileTree.directoryTree) {
    if (entry.type === 'directory') {
      const dirName = entry.path.split('/').pop()?.toLowerCase() ?? '';
      for (const keyword of layerKeywords) {
        if (dirName.includes(keyword)) {
          layerDirs.push({ path: entry.path, keyword });
          break;
        }
      }
    }
  }

  if (layerDirs.length > 0) {
    sections.push('## Directories Suggesting Architecture Layers');
    for (const { path, keyword } of layerDirs.slice(0, 30)) {
      sections.push(`  ${path} (suggests: ${keyword})`);
    }
    sections.push('');
  }

  // File count by top-level directory (structural overview)
  const dirFileCount = new Map<string, number>();
  for (const entry of analysis.fileTree.directoryTree) {
    if (entry.type === 'file') {
      const topDir = entry.path.split('/')[0] ?? 'root';
      dirFileCount.set(topDir, (dirFileCount.get(topDir) ?? 0) + 1);
    }
  }

  if (dirFileCount.size > 0) {
    sections.push('## Files by Top-Level Directory');
    const sorted = [...dirFileCount.entries()].sort(([, a], [, b]) => b - a);
    for (const [dir, count] of sorted.slice(0, 20)) {
      sections.push(`  ${dir}/: ${count} files`);
    }
    sections.push('');
  }

  // High-confidence constraint (locked decision)
  sections.push('## Analysis Instructions');
  sections.push(
    'Only report architecture patterns you can identify with high confidence based on concrete code evidence. ' +
      'Do not hedge or report uncertain matches. ' +
      'If you cannot point to specific files and imports as evidence, omit the pattern entirely. ' +
      'Confidence over coverage.',
  );

  return sections.join('\n');
}
