import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { HandoverConfigSchema, type HandoverConfig } from './schema.js';
import { DEFAULT_API_KEY_ENV, DEFAULT_MODEL } from './defaults.js';
import { ConfigError, ProviderError } from '../utils/errors.js';

/**
 * Load configuration with precedence layering:
 * CLI flags > Environment variables > .handover.yml > Defaults
 *
 * CONF-04: Configuration follows precedence order.
 * Zero-config: works with just ANTHROPIC_API_KEY in env.
 */
export function loadConfig(cliOverrides: Record<string, unknown> = {}): HandoverConfig {
  // Layer 2: File config (Layer 1 is defaults from Zod .default())
  let fileConfig: Record<string, unknown> = {};
  const configPath = '.handover.yml';

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = parseYaml(raw);
      if (parsed && typeof parsed === 'object') {
        fileConfig = parsed as Record<string, unknown>;
      }
    } catch (err) {
      throw ConfigError.invalidYaml(configPath, err instanceof Error ? err.message : String(err));
    }
  }

  // Layer 3: Environment variables
  const envConfig: Record<string, unknown> = {};
  if (process.env.HANDOVER_PROVIDER) {
    envConfig.provider = process.env.HANDOVER_PROVIDER;
  }
  if (process.env.HANDOVER_MODEL) {
    envConfig.model = process.env.HANDOVER_MODEL;
  }
  if (process.env.HANDOVER_OUTPUT) {
    envConfig.output = process.env.HANDOVER_OUTPUT;
  }

  // Layer 4: CLI flags (highest precedence)
  // Remove undefined values from overrides so they don't clobber
  const cleanOverrides: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cliOverrides)) {
    if (value !== undefined) {
      cleanOverrides[key] = value;
    }
  }

  // Merge layers
  const merged = { ...fileConfig, ...envConfig, ...cleanOverrides };

  // Validate with Zod
  const result = HandoverConfigSchema.safeParse(merged);
  if (!result.success) {
    throw ConfigError.validationFailed(
      result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }

  // Resolve defaults for model based on provider
  const config = result.data;
  if (!config.model) {
    config.model = DEFAULT_MODEL[config.provider] ?? DEFAULT_MODEL.anthropic;
  }

  return config;
}

/**
 * Resolve the actual API key value from environment.
 * SEC-02: API keys read from env only, never stored in config.
 *
 * @returns The API key string
 * @throws ProviderError if key not found in environment
 */
export function resolveApiKey(config: HandoverConfig): string {
  // Ollama doesn't need an API key
  if (config.provider === 'ollama') {
    return '';
  }

  const envVarName = config.apiKeyEnv ?? DEFAULT_API_KEY_ENV[config.provider] ?? '';

  if (!envVarName) {
    throw ProviderError.missingApiKey(config.provider);
  }

  const apiKey = process.env[envVarName];
  if (!apiKey) {
    throw ProviderError.missingApiKey(config.provider);
  }

  return apiKey;
}
