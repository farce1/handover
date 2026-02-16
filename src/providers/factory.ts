import type { HandoverConfig } from '../config/schema.js';
import type { LLMProvider } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { DEFAULT_API_KEY_ENV, DEFAULT_CONCURRENCY } from '../config/defaults.js';
import { ProviderError } from '../utils/errors.js';

/**
 * Create an LLM provider from configuration.
 * PROV-05: Switching providers requires only a config change.
 */
export function createProvider(config: HandoverConfig): LLMProvider {
  switch (config.provider) {
    case 'anthropic': {
      const envVarName =
        config.apiKeyEnv ?? DEFAULT_API_KEY_ENV.anthropic;
      const apiKey = process.env[envVarName];

      if (!apiKey) {
        throw ProviderError.missingApiKey('anthropic');
      }

      return new AnthropicProvider(
        apiKey,
        config.model ?? 'claude-opus-4-6',
        config.analysis.concurrency ?? DEFAULT_CONCURRENCY.anthropic,
      );
    }

    case 'openai':
      throw ProviderError.notImplemented('OpenAI');

    case 'ollama':
      throw ProviderError.notImplemented('Ollama');

    case 'custom':
      throw ProviderError.notImplemented('Custom');

    default:
      throw new ProviderError(
        `Unknown provider: ${config.provider}`,
        'The specified provider is not recognized',
        'Use one of: anthropic, openai, ollama, custom',
        'PROVIDER_UNKNOWN',
      );
  }
}
