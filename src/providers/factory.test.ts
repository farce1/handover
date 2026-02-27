import { describe, expect, test } from 'vitest';
import { createProvider, validateProviderConfig } from './factory.js';
import { ProviderError } from '../utils/errors.js';
import type { HandoverConfig } from '../config/schema.js';

// ─── Local factory ────────────────────────────────────────────────────────────

/** Returns a valid anthropic HandoverConfig with all required fields. */
function baseConfig(overrides: Partial<HandoverConfig> = {}): HandoverConfig {
  return {
    provider: 'anthropic',
    authMethod: 'api-key',
    output: './handover',
    audience: 'human',
    include: ['**/*'],
    exclude: [],
    analysis: { concurrency: 4, staticOnly: false },
    project: {},
    contextWindow: { pin: [], boost: [] },
    serve: {
      transport: 'stdio',
      http: {
        port: 3000,
        host: '127.0.0.1',
        path: '/mcp',
      },
    },
    ...overrides,
  };
}

function getProviderConcurrency(provider: unknown): number {
  const limiter = (provider as { rateLimiter?: { maxConcurrent?: number } }).rateLimiter;
  return limiter?.maxConcurrent ?? -1;
}

// ─── validateProviderConfig() tests ──────────────────────────────────────────

describe('validateProviderConfig', () => {
  test('throws PROVIDER_UNKNOWN for unrecognized provider', () => {
    const config = { ...baseConfig(), provider: 'not-real' as HandoverConfig['provider'] };
    try {
      validateProviderConfig(config);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).code).toBe('PROVIDER_UNKNOWN');
    }
  });

  test('throws PROVIDER_OLLAMA_NO_MODEL when ollama provider has no model', () => {
    const config = baseConfig({ provider: 'ollama' });
    try {
      validateProviderConfig(config);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).code).toBe('PROVIDER_OLLAMA_NO_MODEL');
    }
  });

  test('throws PROVIDER_AZURE_NO_BASE_URL when azure-openai has no baseUrl', () => {
    const config = baseConfig({ provider: 'azure-openai' });
    try {
      validateProviderConfig(config);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).code).toBe('PROVIDER_AZURE_NO_BASE_URL');
    }
  });

  test('throws PROVIDER_CUSTOM_NO_BASE_URL when custom provider has no baseUrl', () => {
    const config = { ...baseConfig(), provider: 'custom' as HandoverConfig['provider'] };
    try {
      validateProviderConfig(config);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).code).toBe('PROVIDER_CUSTOM_NO_BASE_URL');
    }
  });

  test('does not throw for valid anthropic config', () => {
    const config = baseConfig({ provider: 'anthropic' });
    expect(() => validateProviderConfig(config)).not.toThrow();
  });

  test('does not throw for local provider (ollama with model) — skips API key check', () => {
    const config = baseConfig({ provider: 'ollama', model: 'llama3.1:8b' });
    expect(() => validateProviderConfig(config)).not.toThrow();
  });

  test('does not throw for valid openai config', () => {
    const config = baseConfig({ provider: 'openai' });
    expect(() => validateProviderConfig(config)).not.toThrow();
  });
});

describe('createProvider', () => {
  test('enforces concurrency=1 for subscription auth on preset providers', () => {
    const provider = createProvider(
      baseConfig({
        provider: 'openai',
        authMethod: 'subscription',
        analysis: { concurrency: 8, staticOnly: false },
      }),
      { apiKey: 'sub-token', source: 'credential-store' },
    );

    expect(getProviderConcurrency(provider)).toBe(1);
  });

  test('uses configured concurrency for api-key auth', () => {
    const provider = createProvider(
      baseConfig({
        provider: 'openai',
        authMethod: 'api-key',
        analysis: { concurrency: 6, staticOnly: false },
      }),
      { apiKey: 'api-key', source: 'env-var' },
    );

    expect(getProviderConcurrency(provider)).toBe(6);
  });

  test('enforces concurrency=1 for subscription auth on custom provider', () => {
    const provider = createProvider(
      baseConfig({
        provider: 'custom',
        authMethod: 'subscription',
        baseUrl: 'https://example.com/v1',
        analysis: { concurrency: 7, staticOnly: false },
      }),
      { apiKey: 'sub-token', source: 'credential-store' },
    );

    expect(getProviderConcurrency(provider)).toBe(1);
  });
});
