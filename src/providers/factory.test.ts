import { afterEach, describe, expect, test, vi } from 'vitest';
import { validateProviderConfig } from './factory.js';
import { ProviderError } from '../utils/errors.js';
import type { HandoverConfig } from '../config/schema.js';

// ─── Local factory ────────────────────────────────────────────────────────────

/** Returns a valid anthropic HandoverConfig with all required fields. */
function baseConfig(overrides: Partial<HandoverConfig> = {}): HandoverConfig {
  return {
    provider: 'anthropic',
    output: './handover',
    audience: 'human',
    include: ['**/*'],
    exclude: [],
    analysis: { concurrency: 4, staticOnly: false },
    project: {},
    contextWindow: { pin: [], boost: [] },
    ...overrides,
  };
}

// ─── validateProviderConfig() tests ──────────────────────────────────────────

describe('validateProviderConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'test-key');
    const config = baseConfig({ provider: 'azure-openai' });
    try {
      validateProviderConfig(config);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).code).toBe('PROVIDER_AZURE_NO_BASE_URL');
    }
  });

  test('throws PROVIDER_NO_API_KEY when anthropic API key env var is missing', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    const config = baseConfig({ provider: 'anthropic' });
    try {
      validateProviderConfig(config);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).code).toBe('PROVIDER_NO_API_KEY');
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

  test('does not throw for valid anthropic config with API key set', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-key');
    const config = baseConfig({ provider: 'anthropic' });
    expect(() => validateProviderConfig(config)).not.toThrow();
  });

  test('does not throw for local provider (ollama with model) — skips API key check', () => {
    const config = baseConfig({ provider: 'ollama', model: 'llama3.1:8b' });
    expect(() => validateProviderConfig(config)).not.toThrow();
  });

  test('does not throw for valid openai config with API key set', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    const config = baseConfig({ provider: 'openai' });
    expect(() => validateProviderConfig(config)).not.toThrow();
  });
});
