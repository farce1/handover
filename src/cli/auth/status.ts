import pc from 'picocolors';
import { TokenStore } from '../../auth/token-store.js';
import { DEFAULT_API_KEY_ENV } from '../../config/defaults.js';
import { loadConfig } from '../../config/loader.js';
import type { HandoverConfig } from '../../config/schema.js';
import { handleCliError } from '../../utils/errors.js';

type AuthStatus =
  | 'configured'
  | 'not configured'
  | 'authenticated'
  | 'expired'
  | 'not authenticated';

type AuthStatusPayload = {
  provider: string;
  authMethod: HandoverConfig['authMethod'];
  status: AuthStatus;
  expiresAt: string | null;
};

function formatRelativeExpiry(expiresAt: string): string {
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) {
    return 'unknown';
  }

  const diffMs = expiresMs - Date.now();
  const minutes = Math.max(1, Math.round(Math.abs(diffMs) / 60_000));
  const suffix = minutes === 1 ? 'minute' : 'minutes';

  if (diffMs >= 0) {
    return `in ${minutes} ${suffix}`;
  }

  return `expired ${minutes} ${suffix} ago`;
}

function colorStatus(status: string, value: AuthStatus): string {
  if (value === 'configured' || value === 'authenticated') {
    return pc.green(status);
  }
  if (value === 'expired') {
    return pc.yellow(status);
  }
  return pc.red(status);
}

function loadProviderAuthConfig(): Pick<HandoverConfig, 'provider' | 'authMethod'> {
  try {
    const config = loadConfig({});
    return {
      provider: config.provider,
      authMethod: config.authMethod,
    };
  } catch {
    return {
      provider: 'anthropic',
      authMethod: 'api-key',
    };
  }
}

function resolveApiKeyStatus(provider: string): AuthStatus {
  const envVar = DEFAULT_API_KEY_ENV[provider] ?? `${provider.toUpperCase()}_API_KEY`;
  const value = process.env[envVar];
  return value && value.trim().length > 0 ? 'configured' : 'not configured';
}

export async function runAuthStatus(options: { json?: boolean }): Promise<void> {
  try {
    const { provider, authMethod } = loadProviderAuthConfig();
    const store = new TokenStore();
    const credential = await store.read();

    let status: AuthStatus;
    let expiresDisplay = '-';
    let expiresAt: string | null = null;

    if (authMethod === 'api-key') {
      status = resolveApiKeyStatus(provider);
    } else if (credential && credential.provider === provider) {
      expiresAt = credential.expiresAt ?? null;
      if (credential.expiresAt) {
        const expiresMs = new Date(credential.expiresAt).getTime();
        status =
          Number.isFinite(expiresMs) && expiresMs <= Date.now() ? 'expired' : 'authenticated';
        expiresDisplay = formatRelativeExpiry(credential.expiresAt);
      } else {
        status = 'authenticated';
      }
    } else {
      status = 'not authenticated';
    }

    const payload: AuthStatusPayload = {
      provider,
      authMethod,
      status,
      expiresAt,
    };

    if (options.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return;
    }

    const providerCol = 14;
    const methodCol = 15;
    const statusCol = 20;
    const expiresCol = 20;

    const header = `${pc.bold('Provider'.padEnd(providerCol))}${pc.bold(
      'Auth Method'.padEnd(methodCol),
    )}${pc.bold('Status'.padEnd(statusCol))}${pc.bold('Expires'.padEnd(expiresCol))}`;

    const row = `${provider.padEnd(providerCol)}${authMethod.padEnd(methodCol)}${colorStatus(
      status.padEnd(statusCol),
      status,
    )}${expiresDisplay.padEnd(expiresCol)}`;

    process.stdout.write(`${header}\n${row}\n`);
  } catch (err) {
    handleCliError(err, 'Failed to resolve authentication status');
  }
}
