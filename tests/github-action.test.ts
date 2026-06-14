import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

describe('GitHub Action contract (action.yml)', () => {
  it('is a composite action with a name and description', () => {
    expect(action.name).toBeTruthy();
    expect(action.description).toBeTruthy();
    expect(action.runs?.using).toBe('composite');
  });

  it('exposes the core inputs with sensible defaults', () => {
    const inputs = action.inputs ?? {};
    expect(inputs.provider?.default).toBe('anthropic');
    expect(inputs).toHaveProperty('api-key');
    expect(inputs['api-key-env']?.default).toBe('ANTHROPIC_API_KEY');
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
