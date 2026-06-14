import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

interface ActionInput {
  default?: string;
  required?: boolean;
}
interface ActionDefinition {
  name?: string;
  description?: string;
  inputs?: Record<string, ActionInput>;
  runs?: { using?: string; steps?: Array<{ run?: string; shell?: string }> };
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const action = parseYaml(readFileSync(join(repoRoot, 'action.yml'), 'utf8')) as ActionDefinition;

/**
 * Execute the action's shell step with a stubbed `npx` that prints the
 * environment, so we can assert which provider env var the key was exported to.
 * A sentinel key value lets us inherit the real environment without collisions.
 */
function runActionScript(overrides: Record<string, string>): string {
  const runScript = (action.runs?.steps ?? [])[0]?.run ?? '';
  const dir = mkdtempSync(join(tmpdir(), 'handover-action-'));
  const binDir = join(dir, 'bin');
  mkdirSync(binDir, { recursive: true });
  const scriptPath = join(dir, 'run.sh');
  writeFileSync(scriptPath, runScript);
  const npxPath = join(binDir, 'npx');
  writeFileSync(npxPath, '#!/usr/bin/env bash\nenv | grep SENTINELKEY || true\n');
  chmodSync(npxPath, 0o755);
  return execFileSync('bash', [scriptPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      HANDOVER_API_KEY: '',
      HANDOVER_API_KEY_ENV: '',
      HANDOVER_PROVIDER: 'anthropic',
      HANDOVER_MODEL: '',
      HANDOVER_VERSION: 'latest',
      HANDOVER_ARGS: '',
      ...overrides,
    },
  });
}

describe('GitHub Action contract (action.yml)', () => {
  it('is a composite action with a name and description', () => {
    expect(action.name).toBeTruthy();
    expect(action.description).toBeTruthy();
    expect(action.runs?.using).toBe('composite');
  });

  it('defaults to anthropic with an auto-derived api-key-env', () => {
    const inputs = action.inputs ?? {};
    expect(inputs.provider?.default).toBe('anthropic');
    expect(inputs).toHaveProperty('api-key');
    expect(inputs['api-key-env']?.default).toBe('');
    expect(inputs.version?.default).toBe('latest');
  });

  it('invokes the handover CLI generate command', () => {
    const runScript = (action.runs?.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(runScript).toContain('handover-cli');
    expect(runScript).toContain('generate');
  });

  it('passes input values through env to avoid script injection', () => {
    const usesDirectInterpolation = (action.runs?.steps ?? []).some((s) =>
      /\$\{\{\s*inputs\./.test(s.run ?? ''),
    );
    expect(usesDirectInterpolation).toBe(false);
  });
});

describe('GitHub Action key resolution', () => {
  it('derives the provider env var when api-key-env is unset', () => {
    const out = runActionScript({ HANDOVER_PROVIDER: 'openai', HANDOVER_API_KEY: 'SENTINELKEY' });
    expect(out).toContain('OPENAI_API_KEY=SENTINELKEY');
    expect(out).not.toContain('ANTHROPIC_API_KEY=SENTINELKEY');
  });

  it('honors an explicit api-key-env override', () => {
    const out = runActionScript({
      HANDOVER_PROVIDER: 'custom',
      HANDOVER_API_KEY: 'SENTINELKEY',
      HANDOVER_API_KEY_ENV: 'MY_CUSTOM_KEY',
    });
    expect(out).toContain('MY_CUSTOM_KEY=SENTINELKEY');
  });
});
