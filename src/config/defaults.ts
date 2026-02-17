/**
 * Default API key environment variable names per provider.
 * SEC-02: API keys referenced by env var NAME only, never stored in config.
 */
export const DEFAULT_API_KEY_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  ollama: '',
  groq: 'GROQ_API_KEY',
  together: 'TOGETHER_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  'azure-openai': 'AZURE_OPENAI_API_KEY',
  custom: 'LLM_API_KEY',
};

/**
 * Default model per provider.
 * PROV-01: Anthropic provider uses Claude Opus as default.
 */
export const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-opus-4-6',
  openai: 'gpt-4o',
  ollama: '',
  groq: 'llama-3.3-70b-versatile',
  together: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  deepseek: 'deepseek-chat',
  'azure-openai': 'gpt-4o',
  custom: 'gpt-4o',
};

/**
 * Default concurrency per provider.
 * PIPE-05: 4 for cloud, 1 for Ollama.
 */
export const DEFAULT_CONCURRENCY: Record<string, number> = {
  anthropic: 4,
  openai: 4,
  ollama: 1,
  groq: 4,
  together: 4,
  deepseek: 4,
  'azure-openai': 4,
  custom: 4,
};
