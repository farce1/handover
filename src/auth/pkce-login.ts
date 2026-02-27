import { confirm, isCancel, log, spinner } from '@clack/prompts';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  Configuration,
  None,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import { logger } from '../utils/logger.js';
import type { TokenStore } from './token-store.js';
import { AuthError, type StoredCredential } from './types.js';

const CALLBACK_PATH = '/auth/callback';
const DISCOVERY_URL = 'https://auth.openai.com';
const AUTHORIZATION_ENDPOINT = 'https://auth.openai.com/oauth/authorize';
const TOKEN_ENDPOINT = 'https://auth.openai.com/oauth/token';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OAUTH_SCOPE = 'openid offline_access';
const OAUTH_AUDIENCE = 'https://api.openai.com/v1';
const AUTH_TIMEOUT_MS = 120_000;

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

type CallbackResult = {
  callbackUrl: URL;
  code: string;
};

function isFutureIsoTimestamp(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const expiresAt = new Date(value).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

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

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function startCallbackServer(): Promise<{
  server: Server;
  port: number;
  callbackPromise: Promise<CallbackResult>;
}> {
  let port = 0;
  let settled = false;
  let resolveCallback: (value: CallbackResult) => void = () => {};
  let rejectCallback: (error: Error) => void = () => {};
  const callbackPromise = new Promise<CallbackResult>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const settleResolve = (value: CallbackResult): void => {
    if (settled) {
      return;
    }
    settled = true;
    resolveCallback(value);
  };

  const settleReject = (error: Error): void => {
    if (settled) {
      return;
    }
    settled = true;
    rejectCallback(error);
  };

  const server = createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', `http://localhost:${port}`);

    if (req.method !== 'GET' || requestUrl.pathname !== CALLBACK_PATH) {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<h1>Not found</h1>');
      return;
    }

    const code = requestUrl.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'content-type': 'text/html' });
      res.end('<h1>Authentication failed</h1><p>Missing authorization code.</p>');
      settleReject(
        new AuthError(
          'OAuth callback did not include an authorization code',
          'The OAuth redirect to localhost completed without a valid code',
          'Retry with: handover auth login openai',
          'AUTH_CALLBACK_INVALID',
        ),
      );
      return;
    }

    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>Authentication successful</h1><p>You can close this tab.</p>');
    settleResolve({
      callbackUrl: new URL(req.url ?? CALLBACK_PATH, `http://localhost:${port}`),
      code,
    });
  });

  server.on('error', (error) => {
    settleReject(
      new AuthError(
        'Failed to start OAuth callback server',
        error.message,
        'Retry with: handover auth login openai',
        'AUTH_CALLBACK_SERVER',
      ),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new AuthError(
      'Failed to determine callback server port',
      'The localhost callback server did not expose a numeric port',
      'Retry with: handover auth login openai',
      'AUTH_CALLBACK_SERVER',
    );
  }

  port = (address as AddressInfo).port;
  return { server, port, callbackPromise };
}

function createFallbackConfig(): Configuration {
  return new Configuration(
    {
      issuer: DISCOVERY_URL,
      authorization_endpoint: AUTHORIZATION_ENDPOINT,
      token_endpoint: TOKEN_ENDPOINT,
    },
    CLIENT_ID,
    undefined,
    None(),
  );
}

async function waitForCallbackWithTimeout(
  callbackPromise: Promise<CallbackResult>,
  timeoutMs: number,
  provider: string,
): Promise<CallbackResult> {
  return new Promise<CallbackResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new AuthError(
          `Authentication timed out for ${provider}`,
          `No OAuth callback was received within ${Math.round(timeoutMs / 1000)} seconds`,
          `Retry with: handover auth login ${provider}`,
          'AUTH_TIMEOUT',
        ),
      );
    }, timeoutMs);
    timeout.unref?.();

    callbackPromise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

async function exchangeAuthorizationCode(
  provider: string,
  config: Configuration,
  callbackUrl: URL,
  codeVerifier: string,
  expectedState: string,
): Promise<TokenResponse> {
  try {
    const tokens = await authorizationCodeGrant(config, callbackUrl, {
      expectedState,
      pkceCodeVerifier: codeVerifier,
    });
    return tokens;
  } catch (error) {
    throw new AuthError(
      `Failed to exchange OAuth code for ${provider}`,
      error instanceof Error ? error.message : 'OAuth token exchange failed',
      `Retry with: handover auth login ${provider}`,
      'AUTH_TOKEN_EXCHANGE_FAILED',
    );
  }
}

export async function pkceLogin(provider: string, store: TokenStore): Promise<StoredCredential> {
  const headless = !process.stdout.isTTY;
  const existing = await store.read();

  if (existing && existing.provider === provider && isFutureIsoTimestamp(existing.expiresAt)) {
    if (!headless) {
      const shouldReauthenticate = await confirm({
        message: `You already have valid tokens for ${provider}. Re-authenticate?`,
        initialValue: false,
      });
      if (isCancel(shouldReauthenticate)) {
        throw new AuthError(
          `Authentication cancelled for ${provider}`,
          'User cancelled token re-authentication prompt',
          `Retry with: handover auth login ${provider}`,
          'AUTH_CANCELLED',
        );
      }
      if (!shouldReauthenticate) {
        return existing;
      }
    }
  }

  const codeVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
  const state = randomState();
  const { server, port, callbackPromise } = await startCallbackServer();
  const redirectUri = `http://localhost:${port}${CALLBACK_PATH}`;

  let oauthConfig: Configuration;
  try {
    oauthConfig = await discovery(new URL(DISCOVERY_URL), CLIENT_ID, undefined, None());
  } catch (error) {
    logger.debug(
      `[auth] OpenID discovery failed, using hard-coded endpoints: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
    oauthConfig = createFallbackConfig();
  }

  const authorizationUrl = buildAuthorizationUrl(oauthConfig, {
    audience: OAUTH_AUDIENCE,
    client_id: CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPE,
    state,
  });

  const authUrl = authorizationUrl.toString();
  if (headless) {
    log.info(`Open this URL to authenticate:\n${authUrl}`);
  } else {
    try {
      const { default: openUrl } = await import('open');
      await openUrl(authUrl);
    } catch (error) {
      logger.debug(
        `[auth] Failed to open browser automatically: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      log.info(`Open this URL to authenticate:\n${authUrl}`);
    }
  }

  const authSpinner = spinner();
  authSpinner.start('Waiting for authentication...');

  try {
    const callback = await waitForCallbackWithTimeout(callbackPromise, AUTH_TIMEOUT_MS, provider);
    authSpinner.message('Exchanging tokens...');

    const tokenResponse = await exchangeAuthorizationCode(
      provider,
      oauthConfig,
      callback.callbackUrl,
      codeVerifier,
      state,
    );

    const accessToken = asNonEmptyString(tokenResponse.access_token);
    if (!accessToken) {
      throw new AuthError(
        `Failed to authenticate with ${provider}`,
        'OAuth token exchange did not return an access token',
        `Retry with: handover auth login ${provider}`,
        'AUTH_TOKEN_EXCHANGE_FAILED',
      );
    }

    const expiresIn = parseExpiresIn(tokenResponse.expires_in);
    const credential: StoredCredential = {
      provider,
      token: accessToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
      refreshToken: asNonEmptyString(tokenResponse.refresh_token),
    };

    await store.write(credential);
    logger.debug(`[auth] OAuth authentication succeeded for ${provider}`);
    authSpinner.stop('Authentication successful');
    return credential;
  } catch (error) {
    authSpinner.stop('Authentication failed');
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError(
      `Failed to authenticate with ${provider}`,
      error instanceof Error ? error.message : 'Unknown authentication error',
      `Retry with: handover auth login ${provider}`,
      'AUTH_LOGIN_FAILED',
    );
  } finally {
    await closeServer(server);
  }
}
