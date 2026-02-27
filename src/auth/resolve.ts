import { isCI, isCancel, isTTY, password } from '@clack/prompts';
import { Configuration, None, discovery, refreshTokenGrant } from 'openid-client';
import pc from 'picocolors';
import { DEFAULT_API_KEY_ENV } from '../config/defaults.js';
import type { HandoverConfig } from '../config/schema.js';
import { PROVIDER_PRESETS } from '../providers/presets.js';
import { logger } from '../utils/logger.js';
import { TokenStore } from './token-store.js';
import { AuthError, type AuthResult, type AuthSource, type StoredCredential } from './types.js';

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const OAUTH_DISCOVERY_URL = 'https://auth.openai.com';
const OAUTH_TOKEN_ENDPOINT = 'https://auth.openai.com/oauth/token';
const OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseExpiresIn(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function createRefreshConfig(): Configuration {
  return new Configuration(
    {
      issuer: OAUTH_DISCOVERY_URL,
      token_endpoint: OAUTH_TOKEN_ENDPOINT,
    },
    OAUTH_CLIENT_ID,
    undefined,
    None(),
  );
}

async function refreshIfNeeded(
  credential: StoredCredential,
  store: TokenStore,
): Promise<StoredCredential> {
  if (!credential.expiresAt || !credential.refreshToken) {
    return credential;
  }

  const expiresAtMs = new Date(credential.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return credential;
  }
  if (expiresAtMs - Date.now() > REFRESH_BUFFER_MS) {
    return credential;
  }

  try {
    const refreshConfig = await discovery(
      new URL(OAUTH_DISCOVERY_URL),
      OAUTH_CLIENT_ID,
      undefined,
      None(),
    ).catch(() => createRefreshConfig());

    const tokens = await refreshTokenGrant(refreshConfig, credential.refreshToken, {
      client_id: OAUTH_CLIENT_ID,
    });

    const accessToken = asNonEmptyString(tokens.access_token);
    if (!accessToken) {
      throw new Error('refresh response missing access_token');
    }

    const expiresIn = parseExpiresIn(tokens.expires_in);
    const refreshed: StoredCredential = {
      ...credential,
      token: accessToken,
      refreshToken: asNonEmptyString(tokens.refresh_token) ?? credential.refreshToken,
      expiresAt: expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : credential.expiresAt,
    };

    await store.write(refreshed);
    logger.debug(`[auth] Token refreshed for ${credential.provider}`);
    return refreshed;
  } catch {
    logger.warn('[auth] Token refresh failed, trying current token');
    return credential;
  }
}

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

  // Gemini-specific: fall back to GOOGLE_API_KEY if GEMINI_API_KEY is not set.
  if (!envValue && config.provider === 'gemini') {
    const fallbackValue = process.env['GOOGLE_API_KEY'];
    if (fallbackValue) {
      logSource(config.provider, 'env-var', 'using GOOGLE_API_KEY (fallback)');
      return { apiKey: fallbackValue, source: 'env-var' };
    }
  }

  if (envValue) {
    logSource(config.provider, 'env-var', `using ${envVarName}`);
    return { apiKey: envValue, source: 'env-var' };
  }

  const tokenStore = store ?? new TokenStore();
  if (config.authMethod === 'subscription') {
    const credential = await tokenStore.read();
    if (credential && credential.provider === config.provider) {
      const refreshed = await refreshIfNeeded(credential, tokenStore);
      logSource(config.provider, 'credential-store', 'using stored subscription token');
      return { apiKey: refreshed.token, source: 'credential-store' };
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
