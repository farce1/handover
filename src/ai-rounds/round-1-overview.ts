import type { z } from 'zod';
import type { LLMProvider } from '../providers/base.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext } from '../context/types.js';
import type { HandoverConfig } from '../config/schema.js';
import type { TokenUsageTracker } from '../context/tracker.js';
import type { StepDefinition } from '../orchestrator/types.js';
import type { RoundExecutionResult } from './types.js';
import type { Round1Output } from './schemas.js';
import { Round1OutputSchema } from './schemas.js';
import { createStep } from '../orchestrator/step.js';
import { buildRoundPrompt, buildRetrySystemPrompt, ROUND_SYSTEM_PROMPTS } from './prompts.js';
import { validateRoundClaims } from './validator.js';
import { buildRound1Fallback } from './fallbacks.js';
import { executeRound } from './runner.js';

// ─── Round 1: Project Overview ─────────────────────────────────────────────

/**
 * Create a StepDefinition for Round 1: Project Overview.
 *
 * Round 1 produces a project overview interleaving business purpose with
 * technical landscape. It is the first sequential round -- all subsequent
 * rounds consume its compressed context.
 */
export function createRound1Step(
  provider: LLMProvider,
  staticAnalysis: StaticAnalysisResult,
  packedContext: PackedContext,
  config: HandoverConfig,
  tracker: TokenUsageTracker,
  estimateTokensFn: (text: string) => number,
): StepDefinition {
  return createStep({
    id: 'ai-round-1',
    name: 'AI Round 1: Project Overview',
    deps: ['static-analysis'],
    execute: async (_ctx): Promise<RoundExecutionResult<Round1Output>> => {
      // 1. Build round-specific data from static analysis
      const roundData = buildRound1Data(staticAnalysis, config);

      // 2. Execute the round via the shared engine
      return executeRound<Round1Output>({
        roundNumber: 1,
        provider,
        schema: Round1OutputSchema as z.ZodType<Round1Output>,
        buildPrompt: (isRetry: boolean) => {
          const systemPrompt = isRetry
            ? buildRetrySystemPrompt(ROUND_SYSTEM_PROMPTS[1])
            : ROUND_SYSTEM_PROMPTS[1];

          const request = buildRoundPrompt(
            1,
            systemPrompt,
            packedContext,
            [], // No prior rounds -- this is Round 1
            roundData,
            estimateTokensFn,
          );

          return {
            ...request,
            temperature: isRetry ? 0.1 : 0.3,
            maxTokens: 4096,
          };
        },
        validate: (data: Round1Output) =>
          validateRoundClaims(1, data as unknown as Record<string, unknown>, staticAnalysis),
        buildFallback: () => buildRound1Fallback(staticAnalysis),
        tracker,
        estimateTokensFn,
      });
    },
    onSkip: () => buildRound1Fallback(staticAnalysis),
  });
}

// ─── Round 1 Data Builder ──────────────────────────────────────────────────

/**
 * Build the round-specific data string for Round 1 from static analysis.
 * Includes file tree summary, dependency summary, git history, docs coverage,
 * and business context from config.
 */
function buildRound1Data(
  analysis: StaticAnalysisResult,
  config: HandoverConfig,
): string {
  const sections: string[] = [];

  // File tree summary
  const extBreakdown = Object.entries(analysis.fileTree.filesByExtension)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([ext, count]) => `  ${ext}: ${count}`)
    .join('\n');

  const largestFiles = analysis.fileTree.largestFiles
    .slice(0, 10)
    .map((f) => `  ${f.path} (${f.lines} lines, ${f.size} bytes)`)
    .join('\n');

  sections.push(
    '## File Tree Summary',
    `Total files: ${analysis.fileTree.totalFiles}`,
    `Total directories: ${analysis.fileTree.totalDirs}`,
    `Total lines: ${analysis.fileTree.totalLines}`,
    '',
    'Extension breakdown:',
    extBreakdown,
    '',
    'Largest files:',
    largestFiles,
  );

  // Dependency summary
  const deps = analysis.dependencies.manifests
    .flatMap((m) =>
      m.dependencies.map((d) => `  ${d.name}@${d.version} (${d.type})`),
    )
    .slice(0, 30);

  if (deps.length > 0) {
    sections.push('', '## Dependency Summary');
    sections.push(...deps);
  }

  // Git history summary
  if (analysis.gitHistory.isGitRepo) {
    const recentCommits = analysis.gitHistory.recentCommits
      .slice(0, 10)
      .map((c) => `  ${c.hash.slice(0, 7)} ${c.message} (${c.author}, ${c.date})`)
      .join('\n');

    const contributors = analysis.gitHistory.contributors
      .slice(0, 10)
      .map((c) => `  ${c.name} (${c.commitCount} commits)`)
      .join('\n');

    sections.push(
      '',
      '## Git History Summary',
      `Branch strategy: ${analysis.gitHistory.branchPattern.strategy}`,
      `Default branch: ${analysis.gitHistory.branchPattern.defaultBranch}`,
      `Active branches: ${analysis.gitHistory.branchPattern.activeBranches.length}`,
      '',
      'Recent commits:',
      recentCommits,
      '',
      'Top contributors:',
      contributors,
    );
  }

  // Docs summary
  sections.push(
    '',
    '## Documentation Summary',
    `READMEs found: ${analysis.docs.readmes.length > 0 ? analysis.docs.readmes.join(', ') : 'none'}`,
    `Doc files: ${analysis.docs.summary.docFileCount}`,
    `Inline doc coverage: ${analysis.docs.summary.inlineDocPercentage}%`,
  );

  // Business context from config
  if (config.context) {
    sections.push(
      '',
      '## Business Context (from project configuration)',
      config.context,
    );
  }

  if (config.project?.name || config.project?.description || config.project?.domain) {
    sections.push('', '## Project Metadata');
    if (config.project.name) sections.push(`Project name: ${config.project.name}`);
    if (config.project.description) sections.push(`Description: ${config.project.description}`);
    if (config.project.domain) sections.push(`Domain: ${config.project.domain}`);
    if (config.project.teamSize) sections.push(`Team size: ${config.project.teamSize}`);
    if (config.project.deployTarget) sections.push(`Deploy target: ${config.project.deployTarget}`);
  }

  return sections.join('\n');
}
