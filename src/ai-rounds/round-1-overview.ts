import type { z } from 'zod';
import type { LLMProvider } from '../providers/base.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext } from '../context/types.js';
import type { HandoverConfig } from '../config/schema.js';
import type { TokenUsageTracker } from '../context/tracker.js';
import type { StepDefinition } from '../orchestrator/types.js';
import type { Round1Output } from './schemas.js';
import type { StandardRoundConfig } from './round-factory.js';
import { Round1OutputSchema } from './schemas.js';
import { buildRound1Fallback } from './fallbacks.js';
import { createStandardRoundStep } from './round-factory.js';

// ─── Round 1 Config ─────────────────────────────────────────────────────────

export const ROUND_1_CONFIG: StandardRoundConfig<Round1Output> = {
  roundNumber: 1,
  name: 'Project Overview',
  deps: ['static-analysis'],
  maxTokens: 4096,
  schema: Round1OutputSchema as z.ZodType<Round1Output>,
  buildData: (analysis, config, _getter) => buildRound1Data(analysis, config),
  buildFallback: buildRound1Fallback,
  getPriorContexts: (_getter) => [], // No prior rounds -- this is Round 1
};

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
  onRetry?: (attempt: number, delayMs: number, reason: string) => void,
): StepDefinition {
  // Round 1 has no prior results, so the getter always returns undefined
  const roundGetter = <U>(_n: number) =>
    undefined as import('./types.js').RoundExecutionResult<U> | undefined;

  return createStandardRoundStep(
    ROUND_1_CONFIG,
    provider,
    staticAnalysis,
    packedContext,
    config,
    tracker,
    estimateTokensFn,
    roundGetter,
    onRetry,
  );
}

// ─── Round 1 Data Builder ──────────────────────────────────────────────────

/**
 * Build the round-specific data string for Round 1 from static analysis.
 * Includes file tree summary, dependency summary, git history, docs coverage,
 * and business context from config.
 */
function buildRound1Data(analysis: StaticAnalysisResult, config: HandoverConfig): string {
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
    .flatMap((m) => m.dependencies.map((d) => `  ${d.name}@${d.version} (${d.type})`))
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
    sections.push('', '## Business Context (from project configuration)', config.context);
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
