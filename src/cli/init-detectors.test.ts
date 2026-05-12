import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}));

// Mock TokenStore so Codex subscription detection is deterministic
vi.mock('../auth/token-store.js', () => ({
  TokenStore: vi.fn().mockImplementation(() => ({
    read: vi.fn().mockResolvedValue(null),
  })),
}));

import {
  detectProviders,
  cheapestDetected,
  patchGitignore,
  computeUpgradeDiff,
} from './init-detectors.js';
import { readFileSync } from 'node:fs';
import { stringify as stringifyYaml } from 'yaml';

describe('detectProviders', () => {
  beforeEach(() => {
    vol.reset();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    // Default fetch: rejects (no Ollama)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
  });

  it('detects single env var (ANTHROPIC_API_KEY)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const result = await detectProviders();
    expect(result.find((d) => d.provider === 'anthropic')).toMatchObject({
      provider: 'anthropic',
      source: 'env-var',
    });
  });

  it('sorts multiple detected providers by cheapest first', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anth');
    vi.stubEnv('GROQ_API_KEY', 'gsk-test');
    const result = await detectProviders();
    // groq (0.59) is cheaper than anthropic (15.0), so groq must be first
    const providers = result.map((d) => d.provider);
    expect(providers.indexOf('groq')).toBeLessThan(providers.indexOf('anthropic'));
    expect(cheapestDetected(result)).toBe('groq');
  });

  it('Ollama probe wins outright when reachable', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anth');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      }),
    );
    const result = await detectProviders();
    expect(result[0]?.provider).toBe('ollama');
    expect(result[0]?.costPerMillion).toBe(0);
  });

  it('returns empty array when no providers detected', async () => {
    const result = await detectProviders();
    expect(result).toEqual([]);
  });
});

describe('patchGitignore', () => {
  beforeEach(() => {
    vol.reset();
    vi.restoreAllMocks();
  });

  it('creates a new .gitignore with the # handover block when none exists', () => {
    patchGitignore('/proj', ['.handover/cache', '.handover/telemetry.db']);
    const written = readFileSync('/proj/.gitignore', 'utf-8');
    expect(written).toContain('# handover');
    expect(written).toContain('.handover/cache');
    expect(written).toContain('.handover/telemetry.db');
    expect(written).toContain('# end handover');
  });

  it('is idempotent on second call (no diff)', () => {
    patchGitignore('/proj', ['.handover/cache', '.handover/telemetry.db']);
    const first = readFileSync('/proj/.gitignore', 'utf-8');
    patchGitignore('/proj', ['.handover/cache', '.handover/telemetry.db']);
    const second = readFileSync('/proj/.gitignore', 'utf-8');
    expect(second).toBe(first);
  });

  it('does not write when a negation rule for .handover exists', () => {
    vol.fromJSON({ '/proj/.gitignore': '!.handover/docs/\n' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    patchGitignore('/proj', ['.handover/cache', '.handover/telemetry.db']);
    const after = readFileSync('/proj/.gitignore', 'utf-8');
    expect(after).toBe('!.handover/docs/\n');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('skips entries already covered (literal match)', () => {
    vol.fromJSON({ '/proj/.gitignore': '.handover/cache\n' });
    patchGitignore('/proj', ['.handover/cache', '.handover/telemetry.db']);
    const after = readFileSync('/proj/.gitignore', 'utf-8');
    // .handover/cache should appear only once (the pre-existing one)
    const cacheCount = (after.match(/^\.handover\/cache$/gm) ?? []).length;
    expect(cacheCount).toBe(1);
    expect(after).toContain('.handover/telemetry.db');
  });
});

describe('computeUpgradeDiff', () => {
  it('marks a field that differs from schema default as customized', () => {
    // 'output' default is './handover'; user picked './my-docs'
    const yaml = stringifyYaml({ provider: 'anthropic', output: './my-docs' });
    const diffs = computeUpgradeDiff(yaml);
    const outputDiff = diffs.find((d) => d.key === 'output');
    expect(outputDiff?.action).toBe('customized');
    expect(outputDiff?.currentValue).toBe('./my-docs');
  });

  it('marks an absent key as missing', () => {
    const yaml = stringifyYaml({ provider: 'anthropic' });
    const diffs = computeUpgradeDiff(yaml);
    // 'audience' is a default-bearing key in HandoverConfigSchema
    const audienceDiff = diffs.find((d) => d.key === 'audience');
    expect(audienceDiff?.action).toBe('missing');
  });

  it('preserves unknown keys with action="unknown"', () => {
    const yaml = stringifyYaml({ provider: 'anthropic', myCustomKey: true });
    const diffs = computeUpgradeDiff(yaml);
    const unknownDiff = diffs.find((d) => d.key === 'myCustomKey');
    expect(unknownDiff?.action).toBe('unknown');
    expect(unknownDiff?.currentValue).toBe(true);
  });
});

describe('runInit --yes integration', () => {
  beforeEach(() => {
    vol.reset();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
  });

  it('writes provider=cheapest-detected when ANTHROPIC_API_KEY set and patches .gitignore', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    // memfs cwd is '/proj'. We spy on process.cwd() so init.ts (which uses
    // path.join(process.cwd(), ...) for every fs op) resolves all reads/writes
    // into the memfs virtual root.
    vol.fromJSON({ '/proj/package.json': JSON.stringify({ name: 'demo' }) });
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/proj');

    const { runInit } = await import('./init.js');
    await runInit({ yes: true });

    const written = readFileSync('/proj/.handover.yml', 'utf-8');
    expect(written).toContain('provider: anthropic');
    const gi = readFileSync('/proj/.gitignore', 'utf-8');
    expect(gi).toContain('# handover');
    expect(gi).toContain('.handover/cache');
    expect(gi).toContain('.handover/telemetry.db');
    expect(process.exitCode === 0 || process.exitCode === undefined).toBe(true);

    cwdSpy.mockRestore();
  });
});
