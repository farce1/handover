import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HandoverConfig } from '../config/schema.js';
import { HandoverError } from '../utils/errors.js';
import type { RegenerationTargetRef } from '../regeneration/schema.js';
import type { RegenerationRunnerResult } from '../regeneration/job-manager.js';

interface RegenerationExecutorInput {
  jobId: string;
  target: RegenerationTargetRef;
}

interface CliRunner {
  command: string;
  args: string[];
}

export interface CreateRegenerationExecutorOptions {
  config: HandoverConfig;
  outputDir: string;
  cwd?: string;
}

function resolveCliRunner(cwd: string): CliRunner {
  const distEntrypoint = join(cwd, 'dist/index.js');
  if (existsSync(distEntrypoint)) {
    return {
      command: process.execPath,
      args: [distEntrypoint],
    };
  }

  const sourceEntrypoint = join(cwd, 'src/cli/index.ts');
  if (existsSync(sourceEntrypoint)) {
    return {
      command: process.execPath,
      args: ['--import', 'tsx', sourceEntrypoint],
    };
  }

  throw new HandoverError(
    'Unable to locate handover CLI entrypoint for regeneration',
    `Expected dist/index.js or src/cli/index.ts in ${cwd}`,
    'Build the project (`npm run build`) or run from repository root before retrying regenerate_docs.',
    'REGENERATION_CLI_ENTRYPOINT_MISSING',
  );
}

function runCliSubcommand(runner: CliRunner, cwd: string, subcommand: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(runner.command, [...runner.args, subcommand], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(subcommand);
        return;
      }

      reject(
        new HandoverError(
          `Regeneration subcommand failed: ${subcommand}`,
          stderr.trim() || `CLI exited with status ${code ?? 'unknown'}`,
          `Resolve the ${subcommand} failure and retry regenerate_docs.`,
          `REGENERATION_${subcommand.toUpperCase()}_FAILED`,
        ),
      );
    });
  });
}

function resolvePlanForTarget(targetKey: RegenerationTargetRef['key']): string[] {
  if (targetKey === 'docs') {
    return ['generate'];
  }

  if (targetKey === 'search-index') {
    return ['reindex'];
  }

  return ['generate', 'reindex'];
}

export function createRegenerationExecutor(options: CreateRegenerationExecutorOptions) {
  const cwd = options.cwd ?? process.cwd();
  const runner = resolveCliRunner(cwd);

  return {
    async execute(input: RegenerationExecutorInput): Promise<RegenerationRunnerResult> {
      const steps = resolvePlanForTarget(input.target.key);
      const completedSteps: string[] = [];

      for (const step of steps) {
        await runCliSubcommand(runner, cwd, step);
        completedSteps.push(step);
      }

      return {
        outcome: 'completed',
        summary: `Completed regeneration for target ${input.target.key} via ${completedSteps.join(' -> ')}.`,
        steps: completedSteps,
      };
    },
  };
}
