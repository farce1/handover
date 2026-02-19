import type { z } from 'zod';
import type { LLMProvider } from '../providers/base.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext } from '../context/types.js';
import type { HandoverConfig } from '../config/schema.js';
import type { TokenUsageTracker } from '../context/tracker.js';
import type { StepDefinition } from '../orchestrator/types.js';
import type { RoundExecutionResult } from './types.js';
import type { Round1Output, Round2Output, Round6Output } from './schemas.js';
import type { StandardRoundConfig } from './round-factory.js';
import { Round6OutputSchema } from './schemas.js';
import { buildRound6Fallback } from './fallbacks.js';
import { createStandardRoundStep } from './round-factory.js';

// ─── Round 6: Deployment Inference ──────────────────────────────────────────

/**
 * Create a StepDefinition for Round 6: Deployment Inference.
 *
 * Round 6 pieces together deployment configuration from env vars, Dockerfiles,
 * CI configs, infrastructure files, and package scripts. It depends only on
 * Round 2 and runs parallel with Rounds 3, 4, and 5.
 *
 * @param getPriorResults - Retrieves Round 1 and Round 2 results from DAG context.
 */
export function createRound6Step(
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
  onRetry?: (attempt: number, delayMs: number, reason: string) => void,
  onToken?: () => ((tokenCount: number) => void) | undefined,
): StepDefinition {
  // Round 6's buildData needs packedContext, so we create the config inside
  // this function to capture packedContext in the closure.
  const round6Config: StandardRoundConfig<Round6Output> = {
    roundNumber: 6,
    name: 'Deployment Inference',
    deps: ['ai-round-2'],
    maxTokens: 4096,
    schema: Round6OutputSchema as z.ZodType<Round6Output>,
    buildData: (analysis, _config, _getter) => buildRound6Data(analysis, packedContext),
    buildFallback: buildRound6Fallback,
    getPriorContexts: (getter) => {
      const contexts = [getter<Round1Output>(1)?.context, getter<Round2Output>(2)?.context];
      return contexts.filter((ctx): ctx is NonNullable<typeof ctx> => ctx !== undefined);
    },
  };

  // Map the prior-results getter to the factory's generic round getter
  const roundGetter = <U>(n: number) => {
    const results = getPriorResults();
    if (n === 1) return results.round1 as RoundExecutionResult<U> | undefined;
    if (n === 2) return results.round2 as RoundExecutionResult<U> | undefined;
    return undefined;
  };

  return createStandardRoundStep(
    round6Config,
    provider,
    staticAnalysis,
    packedContext,
    config,
    tracker,
    estimateTokensFn,
    roundGetter,
    onRetry,
    onToken,
  );
}

// ─── Round 6 Data Builder ───────────────────────────────────────────────────

/** CI/CD config file patterns to detect */
const CI_CONFIG_PATTERNS = [
  '.github/workflows',
  '.gitlab-ci.yml',
  'Jenkinsfile',
  '.circleci/config.yml',
  '.circleci',
  'bitbucket-pipelines.yml',
  'azure-pipelines.yml',
  '.travis.yml',
];

/** Infrastructure file patterns to detect */
const INFRA_PATTERNS = [
  'terraform/',
  'k8s/',
  'kubernetes/',
  'helm/',
  'serverless.yml',
  'serverless.ts',
  'vercel.json',
  'netlify.toml',
  'fly.toml',
  'render.yaml',
  'railway.json',
  'Procfile',
  'app.yaml',
  'app.json',
];

/** Deployment-related file extensions/names */
const DEPLOYMENT_FILE_PATTERNS = [
  'Dockerfile',
  'docker-compose',
  '.dockerignore',
  'nginx.conf',
  'Caddyfile',
  'pm2.config',
  'ecosystem.config',
];

/**
 * Build the round-specific data string for Round 6 focused on deployment signals.
 */
function buildRound6Data(analysis: StaticAnalysisResult, packedContext: PackedContext): string {
  const sections: string[] = [];

  // Env vars from static analysis
  if (analysis.env.envFiles.length > 0) {
    sections.push('## Environment Variables');
    for (const envFile of analysis.env.envFiles) {
      sections.push(`### ${envFile.path}`);
      for (const variable of envFile.variables.slice(0, 30)) {
        sections.push(`  ${variable}`);
      }
      if (envFile.variables.length > 30) {
        sections.push(`  ... and ${envFile.variables.length - 30} more`);
      }
    }
    sections.push('');
  }

  // Env references in source code
  if (analysis.env.envReferences.length > 0) {
    sections.push('## Environment Variable References in Code');
    // Deduplicate by variable name
    const uniqueVars = new Map<string, string[]>();
    for (const ref of analysis.env.envReferences) {
      const existing = uniqueVars.get(ref.variable) ?? [];
      existing.push(`${ref.file}:${ref.line}`);
      uniqueVars.set(ref.variable, existing);
    }

    for (const [variable, locations] of [...uniqueVars.entries()].slice(0, 30)) {
      sections.push(
        `  ${variable}: referenced in ${locations.slice(0, 5).join(', ')}${locations.length > 5 ? ` (+${locations.length - 5} more)` : ''}`,
      );
    }
    sections.push('');
  }

  // Dockerfile/docker-compose presence
  const dockerFiles = findMatchingFiles(analysis, DEPLOYMENT_FILE_PATTERNS);

  if (dockerFiles.length > 0) {
    sections.push('## Docker Configuration Files');
    for (const file of dockerFiles) {
      sections.push(`  ${file}`);
    }

    // Include actual content of Dockerfiles from packed context if available
    for (const dockerFile of dockerFiles) {
      const packed = packedContext.files.find(
        (f) => f.path === dockerFile || f.path.endsWith(dockerFile),
      );
      if (packed && packed.tier !== 'skip') {
        sections.push(`### Content of ${dockerFile}`);
        sections.push('```');
        sections.push(packed.content.slice(0, 3000));
        sections.push('```');
      }
    }
    sections.push('');
  }

  // CI config files
  const ciFiles = findMatchingFiles(analysis, CI_CONFIG_PATTERNS);

  if (ciFiles.length > 0) {
    sections.push('## CI/CD Configuration Files');
    for (const file of ciFiles) {
      sections.push(`  ${file}`);
    }

    // Include actual content of CI configs from packed context
    for (const ciFile of ciFiles) {
      const packed = packedContext.files.find((f) => f.path === ciFile || f.path.endsWith(ciFile));
      if (packed && packed.tier !== 'skip') {
        sections.push(`### Content of ${ciFile}`);
        sections.push('```');
        sections.push(packed.content.slice(0, 3000));
        sections.push('```');
      }
    }
    sections.push('');
  }

  // Package scripts from dependency manifests
  const manifests = analysis.dependencies.manifests;
  if (manifests.length > 0) {
    sections.push('## Package Manifests');
    for (const manifest of manifests) {
      sections.push(`  ${manifest.file} (${manifest.packageManager})`);
      const prodDeps = manifest.dependencies.filter((d) => d.type === 'production').slice(0, 15);
      if (prodDeps.length > 0) {
        sections.push('  Production dependencies:');
        for (const dep of prodDeps) {
          sections.push(`    ${dep.name}@${dep.version}`);
        }
      }
    }

    // Include actual content of package.json from packed context
    // (may contain scripts section with build/deploy commands)
    for (const manifest of manifests) {
      const packed = packedContext.files.find((f) => f.path === manifest.file);
      if (packed && packed.tier !== 'skip') {
        sections.push(`### Content of ${manifest.file}`);
        sections.push('```');
        sections.push(packed.content.slice(0, 3000));
        sections.push('```');
      }
    }
    sections.push('');
  }

  // Infrastructure signals
  const infraFiles = findMatchingFiles(analysis, INFRA_PATTERNS);

  if (infraFiles.length > 0) {
    sections.push('## Infrastructure Configuration Files');
    for (const file of infraFiles) {
      sections.push(`  ${file}`);
    }

    // Include actual content if available
    for (const infraFile of infraFiles) {
      const packed = packedContext.files.find(
        (f) => f.path === infraFile || f.path.endsWith(infraFile),
      );
      if (packed && packed.tier !== 'skip') {
        sections.push(`### Content of ${infraFile}`);
        sections.push('```');
        sections.push(packed.content.slice(0, 2000));
        sections.push('```');
      }
    }
    sections.push('');
  }

  // Best-effort instruction (locked decision)
  sections.push('## Analysis Instructions');
  sections.push(
    'Piece together whatever deployment signals you can find. ' +
      'If evidence is limited, state what you found and what is unclear. ' +
      'Some answer is always better than no answer. ' +
      'For each finding, cite the specific file or config that provides the evidence.',
  );

  return sections.join('\n');
}

// ─── File Pattern Matcher ───────────────────────────────────────────────────

/**
 * Find files in the directory tree matching any of the given patterns.
 */
function findMatchingFiles(analysis: StaticAnalysisResult, patterns: string[]): string[] {
  const matches: string[] = [];

  for (const entry of analysis.fileTree.directoryTree) {
    for (const pattern of patterns) {
      if (entry.path.includes(pattern) || entry.path.endsWith(pattern)) {
        matches.push(entry.path);
        break; // Only add once per entry
      }
    }
  }

  return matches;
}
