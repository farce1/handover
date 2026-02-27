import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TokenStore } from './token-store.js';
import type { StoredCredential } from './types.js';
import { pkceLogin } from './pkce-login.js';

const CANCELLED = Symbol('clack:cancel');

const mockSpinner = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  message: vi.fn(),
}));

const mockClack = vi.hoisted(() => ({
  confirm: vi.fn(),
  isCancel: vi.fn((value: unknown) => value === CANCELLED),
  spinner: vi.fn(() => mockSpinner),
  log: {
    info: vi.fn(),
  },
}));

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
}));

const mockOpen = vi.hoisted(() => vi.fn());

const mockOpenIdClient = vi.hoisted(() => ({
  Configuration: class {
    constructor() {
      // no-op test stub
    }
  },
  None: vi.fn(() => Symbol('none')),
  authorizationCodeGrant: vi.fn(),
  buildAuthorizationUrl: vi.fn((_config, params: URLSearchParams | Record<string, string>) => {
    const url = new URL('https://auth.openai.com/oauth/authorize');
    const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params);
    for (const [key, value] of searchParams.entries()) {
      url.searchParams.set(key, value);
    }
    return url;
  }),
  calculatePKCECodeChallenge: vi.fn(async () => 'pkce-challenge'),
  discovery: vi.fn(),
  randomPKCECodeVerifier: vi.fn(() => 'pkce-verifier'),
  randomState: vi.fn(() => 'state-123'),
}));

vi.mock('@clack/prompts', () => mockClack);
vi.mock('../utils/logger.js', () => ({ logger: mockLogger }));
vi.mock('openid-client', () => mockOpenIdClient);
vi.mock('open', () => ({ default: mockOpen }));

type MockStore = {
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
};

function createStore(existingCredential: StoredCredential | null = null): MockStore {
  return {
    read: vi.fn(async () => existingCredential),
    write: vi.fn(async () => {}),
  };
}

async function triggerCallbackFromAuthorizationUrl(url: string): Promise<void> {
  const authorizationUrl = new URL(url);
  const redirectUri = authorizationUrl.searchParams.get('redirect_uri');
  const state = authorizationUrl.searchParams.get('state');

  if (!redirectUri || !state) {
    throw new Error('Missing redirect_uri or state from authorization URL');
  }

  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set('code', 'auth-code-123');
  callbackUrl.searchParams.set('state', state);
  await fetch(callbackUrl.toString());
}

function setStdoutTTY(value: boolean): void {
  (process.stdout as { isTTY?: boolean }).isTTY = value;
}

describe('pkceLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    setStdoutTTY(true);
    mockClack.confirm.mockResolvedValue(true);
    mockOpenIdClient.discovery.mockResolvedValue({ discovered: true });
    mockOpenIdClient.authorizationCodeGrant.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    });
    mockOpen.mockImplementation(async (url: string) => {
      await triggerCallbackFromAuthorizationUrl(url);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('starts localhost callback server and constructs OAuth authorization URL', async () => {
    const store = createStore();

    await pkceLogin('openai', store as unknown as TokenStore);

    expect(mockOpen).toHaveBeenCalledTimes(1);
    const openedUrl = new URL(mockOpen.mock.calls[0][0] as string);
    expect(openedUrl.origin + openedUrl.pathname).toBe('https://auth.openai.com/oauth/authorize');

    const redirectUri = openedUrl.searchParams.get('redirect_uri');
    expect(redirectUri).toMatch(/^http:\/\/localhost:\d+\/auth\/callback$/);
    expect(openedUrl.searchParams.get('scope')).toBe('openid offline_access');
    expect(openedUrl.searchParams.get('code_challenge_method')).toBe('S256');
  });

  test('exchanges callback code and writes returned tokens to token store', async () => {
    const store = createStore();

    const credential = await pkceLogin('openai', store as unknown as TokenStore);

    expect(mockOpenIdClient.authorizationCodeGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(URL),
      {
        expectedState: 'state-123',
        pkceCodeVerifier: 'pkce-verifier',
      },
    );
    expect(store.write).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        token: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );
    expect(credential).toEqual(
      expect.objectContaining({
        provider: 'openai',
        token: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );
  });

  test('times out when callback is never received', async () => {
    vi.useFakeTimers();
    mockOpen.mockResolvedValue(undefined);

    const store = createStore();
    const loginPromise = pkceLogin('openai', store as unknown as TokenStore);
    const handledRejection = loginPromise.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(120_000);
    const error = await handledRejection;
    expect(error).toMatchObject({ code: 'AUTH_TIMEOUT' });
  });

  test('headless mode prints URL and skips browser auto-open', async () => {
    setStdoutTTY(false);
    mockOpen.mockResolvedValue(undefined);

    const store = createStore();
    const loginPromise = pkceLogin('openai', store as unknown as TokenStore);

    await vi.waitFor(() => {
      expect(mockClack.log.info).toHaveBeenCalled();
    });

    const infoMessage = String(mockClack.log.info.mock.calls[0][0] ?? '');
    const urlMatch = infoMessage.match(/https?:\/\/\S+/);
    expect(urlMatch).toBeTruthy();
    await triggerCallbackFromAuthorizationUrl(urlMatch![0]);

    await loginPromise;
    expect(mockOpen).not.toHaveBeenCalled();
  });

  test('returns existing valid credential when user declines re-authentication', async () => {
    const existingCredential: StoredCredential = {
      provider: 'openai',
      token: 'existing-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const store = createStore(existingCredential);
    mockClack.confirm.mockResolvedValue(false);

    const result = await pkceLogin('openai', store as unknown as TokenStore);

    expect(result).toEqual(existingCredential);
    expect(store.write).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockClack.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'You already have valid tokens for openai. Re-authenticate?',
      }),
    );
  });
});
