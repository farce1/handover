import { isCI, isCancel, isTTY, password } from '@clack/prompts';
import pc from 'picocolors';
import { DEFAULT_API_KEY_ENV } from '../config/defaults.js';
import type { HandoverConfig } from '../config/schema.js';
import { PROVIDER_PRESETS } from '../providers/presets.js';
import { logger } from '../utils/logger.js';
import { TokenStore } from './token-store.js';
import { AuthError, type AuthResult, type AuthSource } from './types.js';

function logSource(provider: string, source: AuthSource, detail: string): void {
  logger.info(`[auth] ${provider} resolved via ${source} (${detail})`);
}

export async function resolveAuth(
  config: HandoverConfig,
  cliApiKey?: string,
  store?: TokenStore,
): Promise<AuthResult> {
  if (PROVIDER_PRESETS[config.provider]?.isLocal) {
    logSource(config.provider, 'env-var', 'local provider does not require credentials');
    return { apiKey: '', source: 'env-var' };
  }

  if (cliApiKey) {
    logSource(config.provider, 'cli-flag', 'using --api-key flag');
    return { apiKey: cliApiKey, source: 'cli-flag' };
  }

  const envVarName =
    DEFAULT_API_KEY_ENV[config.provider] ?? `${config.provider.toUpperCase()}_API_KEY`;
  const envValue = process.env[envVarName];
  if (envValue) {
    logSource(config.provider, 'env-var', `using ${envVarName}`);
    return { apiKey: envValue, source: 'env-var' };
  }

  const tokenStore = store ?? new TokenStore();
  if (config.authMethod === 'subscription') {
    const credential = await tokenStore.read();
    if (credential && credential.provider === config.provider) {
      logSource(config.provider, 'credential-store', 'using stored subscription token');
      return { apiKey: credential.token, source: 'credential-store' };
    }
  }

  if (!isTTY(process.stdout) || isCI()) {
    throw AuthError.noCredential(config.provider, envVarName);
  }

  const entered = await password({
    message: `Enter your ${config.provider} API key:`,
  });

  if (isCancel(entered) || typeof entered !== 'string' || entered.trim().length === 0) {
    throw new AuthError(
      `Authentication cancelled for ${config.provider}`,
      'No credential was provided at the interactive prompt',
      [
        `Provide an API key via ${pc.cyan('--api-key')} or ${pc.cyan(`export ${envVarName}=your-api-key-here`)}`,
        `Or authenticate with ${pc.cyan(`handover auth login ${config.provider}`)}`,
      ].join('\n'),
      'AUTH_CANCELLED',
    );
  }

  logSource(config.provider, 'interactive-prompt', 'user provided key interactively');
  return { apiKey: entered, source: 'interactive-prompt' };
}
