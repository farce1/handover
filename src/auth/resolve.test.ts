import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HandoverConfigSchema, type HandoverConfig } from '../config/schema.js';
import type { StoredCredential } from './types.js';
import type { TokenStore } from './token-store.js';
import { AuthError } from './types.js';
import { resolveAuth } from './resolve.js';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

const mockOpenIdClient = vi.hoisted(() => ({
  Configuration: class {
    constructor() {
      // no-op test stub
    }
  },
  None: vi.fn(() => Symbol('none')),
  discovery: vi.fn(),
  refreshTokenGrant: vi.fn(),
}));

const CANCELLED = Symbol('clack:cancel');

const mockClack = vi.hoisted(() => ({
  isTTY: vi.fn(() => true),
  isCI: vi.fn(() => false),
  password: vi.fn(),
  isCancel: vi.fn((value: unknown) => value === CANCELLED),
}));

vi.mock('../utils/logger.js', () => ({ logger: mockLogger }));
vi.mock('@clack/prompts', () => mockClack);
vi.mock('openid-client', () => mockOpenIdClient);

type MockStore = {
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createMockStore(credential: StoredCredential | null = null): MockStore {
  return {
    read: vi.fn(async () => credential),
    write: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  };
}

function makeConfig(overrides: Partial<HandoverConfig> = {}): HandoverConfig {
  return HandoverConfigSchema.parse({
    provider: 'openai',
    authMethod: 'api-key',
    ...overrides,
  });
}

describe('resolveAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    mockClack.isTTY.mockReturnValue(true);
    mockClack.isCI.mockReturnValue(false);
    mockClack.password.mockResolvedValue('prompted-key');
    mockClack.isCancel.mockImplementation((value: unknown) => value === CANCELLED);
    mockOpenIdClient.discovery.mockResolvedValue({ discovered: true });
    mockOpenIdClient.refreshTokenGrant.mockResolvedValue({
      access_token: 'refreshed-key',
      refresh_token: 'rotated-refresh',
      expires_in: 3600,
    });
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  test('uses CLI --api-key flag as highest precedence', async () => {
    const store = createMockStore({ provider: 'openai', token: 'stored-token' });
    const config = makeConfig({ authMethod: 'subscription' });

    const result = await resolveAuth(config, 'cli-key-123', store as unknown as TokenStore);

    expect(result).toEqual({ apiKey: 'cli-key-123', source: 'cli-flag' });
    expect(store.read).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('--api-key flag'));
  });

  test('uses env var over credential store', async () => {
    process.env.OPENAI_API_KEY = 'env-key-456';
    const store = createMockStore({ provider: 'openai', token: 'stored-token' });

    const result = await resolveAuth(
      makeConfig({ authMethod: 'subscription' }),
      undefined,
      store as unknown as TokenStore,
    );

    expect(result).toEqual({ apiKey: 'env-key-456', source: 'env-var' });
    expect(store.read).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('OPENAI_API_KEY'));
  });

  test('uses env var even when authMethod is subscription', async () => {
    process.env.OPENAI_API_KEY = 'env-key-789';
    const store = createMockStore({ provider: 'openai', token: 'sub-token' });

    const result = await resolveAuth(
      makeConfig({ provider: 'openai', authMethod: 'subscription' }),
      undefined,
      store as unknown as TokenStore,
    );

    expect(result.source).toBe('env-var');
    expect(result.apiKey).toBe('env-key-789');
    expect(store.read).not.toHaveBeenCalled();
  });

  test('uses credential store for subscription when provider matches', async () => {
    const store = createMockStore({ provider: 'openai', token: 'sub-token' });

    const result = await resolveAuth(
      makeConfig({ provider: 'openai', authMethod: 'subscription' }),
      undefined,
      store as unknown as TokenStore,
    );

    expect(result).toEqual({ apiKey: 'sub-token', source: 'credential-store' });
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  test('refreshes subscription token when credential expires within five minutes', async () => {
    const store = createMockStore({
      provider: 'openai',
      token: 'stale-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    });

    const result = await resolveAuth(
      makeConfig({ provider: 'openai', authMethod: 'subscription' }),
      undefined,
      store as unknown as TokenStore,
    );

    expect(mockOpenIdClient.refreshTokenGrant).toHaveBeenCalledTimes(1);
    expect(store.write).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        token: 'refreshed-key',
        refreshToken: 'rotated-refresh',
      }),
    );
    expect(result).toEqual({ apiKey: 'refreshed-key', source: 'credential-store' });
  });

  test('does not refresh subscription token when expiry is more than five minutes away', async () => {
    const store = createMockStore({
      provider: 'openai',
      token: 'current-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    const result = await resolveAuth(
      makeConfig({ provider: 'openai', authMethod: 'subscription' }),
      undefined,
      store as unknown as TokenStore,
    );

    expect(mockOpenIdClient.refreshTokenGrant).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
    expect(result).toEqual({ apiKey: 'current-token', source: 'credential-store' });
  });

  test('does not check credential store when authMethod is api-key', async () => {
    const store = createMockStore({ provider: 'openai', token: 'stored-token' });

    const result = await resolveAuth(
      makeConfig({ authMethod: 'api-key' }),
      undefined,
      store as unknown as TokenStore,
    );

    expect(store.read).not.toHaveBeenCalled();
    expect(result).toEqual({ apiKey: 'prompted-key', source: 'interactive-prompt' });
  });

  test('skips credential store when provider mismatches', async () => {
    const store = createMockStore({ provider: 'anthropic', token: 'wrong-provider-token' });

    const result = await resolveAuth(
      makeConfig({ provider: 'openai', authMethod: 'subscription' }),
      undefined,
      store as unknown as TokenStore,
    );

    expect(result).toEqual({ apiKey: 'prompted-key', source: 'interactive-prompt' });
  });

  test('uses interactive prompt as final precedence step', async () => {
    const store = createMockStore(null);

    const result = await resolveAuth(makeConfig(), undefined, store as unknown as TokenStore);

    expect(result).toEqual({ apiKey: 'prompted-key', source: 'interactive-prompt' });
    expect(mockClack.password).toHaveBeenCalledWith({ message: 'Enter your openai API key:' });
  });

  test('throws AUTH_NO_CREDENTIAL when no TTY is available', async () => {
    mockClack.isTTY.mockReturnValue(false);
    const store = createMockStore(null);

    await expect(
      resolveAuth(
        makeConfig({ provider: 'openai', authMethod: 'subscription' }),
        undefined,
        store as unknown as TokenStore,
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_NO_CREDENTIAL',
    });

    await expect(
      resolveAuth(
        makeConfig({ provider: 'openai', authMethod: 'subscription' }),
        undefined,
        store as unknown as TokenStore,
      ),
    ).rejects.toThrow(AuthError);

    await resolveAuth(
      makeConfig({ provider: 'openai', authMethod: 'subscription' }),
      undefined,
      store as unknown as TokenStore,
    ).catch((error: unknown) => {
      expect(error).toBeInstanceOf(AuthError);
      if (!(error instanceof AuthError)) return;
      expect(error.fix).toContain('OPENAI_API_KEY');
      expect(error.fix).toContain('handover auth login openai');
      expect(error.fix).toContain('handover init');
    });
  });

  test('throws AUTH_NO_CREDENTIAL in CI mode', async () => {
    mockClack.isCI.mockReturnValue(true);

    await expect(resolveAuth(makeConfig())).rejects.toMatchObject({
      code: 'AUTH_NO_CREDENTIAL',
    });
  });

  test('short-circuits for local providers without prompting', async () => {
    const store = createMockStore({ provider: 'ollama', token: 'ignored' });

    const result = await resolveAuth(
      makeConfig({ provider: 'ollama', authMethod: 'api-key' }),
      undefined,
      store as unknown as TokenStore,
    );

    expect(result).toEqual({ apiKey: '', source: 'env-var' });
    expect(store.read).not.toHaveBeenCalled();
    expect(mockClack.password).not.toHaveBeenCalled();
  });

  test('throws AUTH_CANCELLED when interactive prompt is cancelled', async () => {
    mockClack.password.mockResolvedValue(CANCELLED);

    await expect(resolveAuth(makeConfig())).rejects.toMatchObject({
      code: 'AUTH_CANCELLED',
    });
  });

  test('logs the provider and source for every successful path', async () => {
    const store = createMockStore({ provider: 'openai', token: 'stored-token' });

    await resolveAuth(makeConfig(), 'cli-key-123', store as unknown as TokenStore);
    process.env.OPENAI_API_KEY = 'env-key-456';
    await resolveAuth(
      makeConfig({ authMethod: 'subscription' }),
      undefined,
      store as unknown as TokenStore,
    );
    delete process.env.OPENAI_API_KEY;
    await resolveAuth(
      makeConfig({ authMethod: 'subscription' }),
      undefined,
      createMockStore({ provider: 'openai', token: 'sub-token' }) as unknown as TokenStore,
    );
    await resolveAuth(makeConfig(), undefined, createMockStore(null) as unknown as TokenStore);

    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('openai'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('cli-flag'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('env-var'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('credential-store'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('interactive-prompt'));
  });
});
