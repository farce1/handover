import type { HandoverConfig } from '../config/schema.js';
import type { LLMProvider } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAICompatibleProvider } from './openai-compat.js';
import { PROVIDER_PRESETS, type ProviderPreset } from './presets.js';
import { DEFAULT_API_KEY_ENV, DEFAULT_CONCURRENCY } from '../config/defaults.js';
import { ProviderError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Valid provider names for error messages.
 */
const VALID_PROVIDERS = [...Object.keys(PROVIDER_PRESETS), 'custom'];

/**
 * Fail-fast validation of provider configuration.
 * Runs at startup before any pipeline work begins.
 * PROV-05: Clear errors for misconfigured providers.
 */
export function validateProviderConfig(config: HandoverConfig): void {
  const preset = PROVIDER_PRESETS[config.provider];

  // Unknown provider (not in presets and not 'custom')
  if (!preset && config.provider !== 'custom') {
    throw new ProviderError(
      `Unknown provider: ${config.provider}`,
      'The specified provider is not recognized',
      `Use one of: ${VALID_PROVIDERS.join(', ')}`,
      'PROVIDER_UNKNOWN',
    );
  }

  if (preset) {
    // Ollama requires explicit model
    if (preset.name === 'ollama' && !config.model) {
      throw new ProviderError(
        'Ollama requires an explicit model name',
        'Ollama does not have a default model -- you must specify which model to use',
        'Set model in .handover.yml: model: "llama3.1:8b"',
        'PROVIDER_OLLAMA_NO_MODEL',
      );
    }

    // Azure OpenAI requires baseUrl (check before API key since both are needed)
    if (preset.name === 'azure-openai' && !config.baseUrl) {
      throw new ProviderError(
        'Azure OpenAI requires a baseUrl',
        'Azure OpenAI deployments use custom endpoints that must be configured',
        'Set baseUrl in .handover.yml: baseUrl: "https://your-resource.openai.azure.com/openai/deployments/your-deployment"',
        'PROVIDER_AZURE_NO_BASE_URL',
      );
    }

    // Cloud providers need an API key
    if (!preset.isLocal) {
      const envVarName = config.apiKeyEnv ?? preset.apiKeyEnv;
      if (envVarName && !process.env[envVarName]) {
        throw ProviderError.missingApiKey(config.provider);
      }
    }

    // Warn on unknown model (non-blocking)
    if (config.model && preset.supportedModels.length > 0 && !preset.supportedModels.includes(config.model)) {
      logger.warn(
        `Model "${config.model}" is not in the known models for ${preset.displayName}. ` +
        `Known models: ${preset.supportedModels.join(', ')}. Proceeding anyway.`,
      );
    }
  }

  // Custom provider needs baseUrl
  if (config.provider === 'custom' && !config.baseUrl) {
    throw new ProviderError(
      'Custom provider requires a baseUrl',
      'Custom providers need an explicit API endpoint',
      'Set baseUrl in .handover.yml: baseUrl: "https://your-api.example.com/v1"',
      'PROVIDER_CUSTOM_NO_BASE_URL',
    );
  }
}

/**
 * Create an LLM provider from configuration.
 * PROV-05: Switching providers requires only a config change.
 * Runs fail-fast validation, then creates the appropriate provider.
 */
export function createProvider(config: HandoverConfig): LLMProvider {
  validateProviderConfig(config);

  const preset = PROVIDER_PRESETS[config.provider];

  // Custom provider -- build a minimal preset
  if (config.provider === 'custom') {
    const customApiKeyEnv = config.apiKeyEnv ?? 'LLM_API_KEY';
    const apiKey = process.env[customApiKeyEnv] ?? '';
    const model = config.model ?? 'gpt-4o';
    const concurrency = config.analysis.concurrency ?? DEFAULT_CONCURRENCY.custom;

    const customPreset: ProviderPreset = {
      name: 'custom',
      displayName: 'Custom',
      baseUrl: config.baseUrl!,
      apiKeyEnv: customApiKeyEnv,
      defaultModel: model,
      contextWindow: 128_000,
      defaultConcurrency: concurrency,
      isLocal: false,
      sdkType: 'openai-compat',
      pricing: {},
      supportedModels: [],
      timeoutMs: config.timeout ?? 120_000,
    };

    return new OpenAICompatibleProvider(
      customPreset,
      apiKey,
      model,
      concurrency,
      config.baseUrl,
    );
  }

  // Resolve configuration with preset fallbacks
  const apiKeyEnv = config.apiKeyEnv ?? preset.apiKeyEnv;
  const apiKey = preset.isLocal
    ? 'ollama' // Required by SDK but ignored by Ollama
    : (process.env[apiKeyEnv] ?? '');
  const model = config.model ?? preset.defaultModel;
  const concurrency = config.analysis.concurrency ?? preset.defaultConcurrency;

  switch (preset.sdkType) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, model, concurrency);

    case 'openai-compat':
      return new OpenAICompatibleProvider(
        preset,
        apiKey,
        model,
        concurrency,
        config.baseUrl,
      );

    default:
      throw new ProviderError(
        `Unknown SDK type: ${(preset as ProviderPreset).sdkType}`,
        'Internal error: provider preset has an unrecognized sdkType',
        'This is a bug -- please report it',
        'PROVIDER_UNKNOWN',
      );
  }
}
