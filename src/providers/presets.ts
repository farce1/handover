/**
 * Provider preset registry.
 * PROV-05: Named provider presets with base URL, pricing, and config.
 * Each preset defines everything needed to configure a provider from just its name.
 */

/**
 * Configuration preset for a named LLM provider.
 */
export interface ProviderPreset {
  /** Preset identifier matching config.provider value */
  name: string;
  /** Human-readable name for terminal display */
  displayName: string;
  /** API endpoint (empty for Anthropic which uses its own SDK, and azure-openai which user must configure) */
  baseUrl: string;
  /** Default environment variable name for API key (empty for Ollama) */
  apiKeyEnv: string;
  /** Default model when user doesn't specify */
  defaultModel: string;
  /** Default context window in tokens */
  contextWindow: number;
  /** Default concurrent requests (1 for Ollama, 4 for cloud) */
  defaultConcurrency: number;
  /** True for Ollama only (controls LOCAL badge, cost omission) */
  isLocal: boolean;
  /** Which SDK to use */
  sdkType: 'anthropic' | 'openai-compat';
  /** Model pricing lookup: per-million input/output tokens */
  pricing: Record<string, { inputPerMillion: number; outputPerMillion: number }>;
  /** Known models for validation (non-exhaustive, warn on unknown) */
  supportedModels: string[];
  /** Request timeout in ms (300000 for Ollama, 120000 for cloud) */
  timeoutMs: number;
}

/**
 * Registry of all named provider presets.
 * 7 entries: anthropic, openai, ollama, groq, together, deepseek, azure-openai.
 */
export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: '',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-opus-4-6',
    contextWindow: 200_000,
    defaultConcurrency: 4,
    isLocal: false,
    sdkType: 'anthropic',
    pricing: {
      'claude-opus-4-6': { inputPerMillion: 15, outputPerMillion: 75 },
      'claude-opus-4-5': { inputPerMillion: 15, outputPerMillion: 75 },
      'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
      'claude-haiku-4-5': { inputPerMillion: 1, outputPerMillion: 5 },
    },
    supportedModels: ['claude-opus-4-6', 'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    timeoutMs: 120_000,
  },

  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    contextWindow: 128_000,
    defaultConcurrency: 4,
    isLocal: false,
    sdkType: 'openai-compat',
    pricing: {
      'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
      'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    },
    supportedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini'],
    timeoutMs: 120_000,
  },

  ollama: {
    name: 'ollama',
    displayName: 'Ollama',
    baseUrl: 'http://localhost:11434/v1/',
    apiKeyEnv: '',
    defaultModel: '',
    contextWindow: 128_000,
    defaultConcurrency: 1,
    isLocal: true,
    sdkType: 'openai-compat',
    pricing: {},
    supportedModels: [],
    timeoutMs: 300_000,
  },

  groq: {
    name: 'groq',
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    contextWindow: 128_000,
    defaultConcurrency: 4,
    isLocal: false,
    sdkType: 'openai-compat',
    pricing: {
      'llama-3.3-70b-versatile': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
    },
    supportedModels: ['llama-3.3-70b-versatile'],
    timeoutMs: 120_000,
  },

  together: {
    name: 'together',
    displayName: 'Together',
    baseUrl: 'https://api.together.xyz/v1',
    apiKeyEnv: 'TOGETHER_API_KEY',
    defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    contextWindow: 128_000,
    defaultConcurrency: 4,
    isLocal: false,
    sdkType: 'openai-compat',
    pricing: {
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': { inputPerMillion: 0.88, outputPerMillion: 0.88 },
    },
    supportedModels: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'],
    timeoutMs: 120_000,
  },

  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    contextWindow: 128_000,
    defaultConcurrency: 4,
    isLocal: false,
    sdkType: 'openai-compat',
    pricing: {
      'deepseek-chat': { inputPerMillion: 0.28, outputPerMillion: 0.42 },
    },
    supportedModels: ['deepseek-chat'],
    timeoutMs: 120_000,
  },

  'azure-openai': {
    name: 'azure-openai',
    displayName: 'Azure OpenAI',
    baseUrl: '',
    apiKeyEnv: 'AZURE_OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    contextWindow: 128_000,
    defaultConcurrency: 4,
    isLocal: false,
    sdkType: 'openai-compat',
    pricing: {
      'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
      'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    },
    supportedModels: ['gpt-4o', 'gpt-4o-mini'],
    timeoutMs: 120_000,
  },
};
