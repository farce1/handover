import { existsSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}));

import { TokenStore } from './token-store.js';

const credentialsPath = '/mock-home/.handover/credentials.json';

describe('TokenStore', () => {
  beforeEach(() => {
    vol.reset();
    vi.restoreAllMocks();
  });

  it('write creates the directory and credentials file', async () => {
    const store = new TokenStore();

    await store.write({ provider: 'openai', token: 'tok_123' });

    expect(existsSync(credentialsPath)).toBe(true);
    const contents = await readFile(credentialsPath, 'utf-8');
    expect(JSON.parse(contents)).toEqual({ provider: 'openai', token: 'tok_123' });
  });

  it('write calls chmod with 0o600', async () => {
    const chmodSpy = vi.spyOn(fsPromises, 'chmod');
    const store = new TokenStore();

    await store.write({ provider: 'openai', token: 'tok_123' });

    expect(chmodSpy).toHaveBeenCalledWith(credentialsPath, 0o600);
  });

  it('read returns stored credential when file is valid', async () => {
    const store = new TokenStore();
    vol.fromJSON({
      [credentialsPath]: JSON.stringify({ provider: 'openai', token: 'tok_123' }),
    });

    await expect(store.read()).resolves.toEqual({ provider: 'openai', token: 'tok_123' });
  });

  it('read returns null when file does not exist', async () => {
    const store = new TokenStore();

    await expect(store.read()).resolves.toBeNull();
  });

  it('read deletes corrupted json file and returns null', async () => {
    const store = new TokenStore();
    vol.fromJSON({
      [credentialsPath]: 'not valid json',
    });

    await expect(store.read()).resolves.toBeNull();
    expect(existsSync(credentialsPath)).toBe(false);
  });

  it('read deletes invalid credential file with missing required fields', async () => {
    const store = new TokenStore();
    vol.fromJSON({
      [credentialsPath]: JSON.stringify({ provider: 'openai' }),
    });

    await expect(store.read()).resolves.toBeNull();
    expect(existsSync(credentialsPath)).toBe(false);
  });

  it('delete removes credential file', async () => {
    const store = new TokenStore();
    vol.fromJSON({
      [credentialsPath]: JSON.stringify({ provider: 'openai', token: 'tok_123' }),
    });

    await store.delete();

    expect(existsSync(credentialsPath)).toBe(false);
  });

  it('delete is a no-op when file does not exist', async () => {
    const store = new TokenStore();

    await expect(store.delete()).resolves.toBeUndefined();
  });

  it('write replaces existing credentials', async () => {
    const store = new TokenStore();
    await store.write({ provider: 'openai', token: 'tok_123' });
    await store.write({ provider: 'codex', token: 'tok_456' });

    await expect(store.read()).resolves.toEqual({ provider: 'codex', token: 'tok_456' });
  });

  it('preserves expiresAt when provided', async () => {
    const store = new TokenStore();
    await store.write({
      provider: 'openai',
      token: 'tok_123',
      expiresAt: '2026-03-01T00:00:00Z',
    });

    await expect(store.read()).resolves.toEqual({
      provider: 'openai',
      token: 'tok_123',
      expiresAt: '2026-03-01T00:00:00Z',
    });
  });

  it('preserves refreshToken when provided', async () => {
    const store = new TokenStore();
    await store.write({
      provider: 'openai',
      token: 'tok_123',
      refreshToken: 'ref_123',
    });

    await expect(store.read()).resolves.toEqual({
      provider: 'openai',
      token: 'tok_123',
      refreshToken: 'ref_123',
    });
  });

  it('read deletes invalid credential file with empty refreshToken', async () => {
    const store = new TokenStore();
    vol.fromJSON({
      [credentialsPath]: JSON.stringify({
        provider: 'openai',
        token: 'tok_123',
        refreshToken: '',
      }),
    });

    await expect(store.read()).resolves.toBeNull();
    expect(existsSync(credentialsPath)).toBe(false);
  });
});
