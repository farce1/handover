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

import { detectProviders, cheapestDetected } from './init-detectors.js';

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

// Test blocks for patchGitignore and computeUpgradeDiff are added by Plan 01 Task 2.
