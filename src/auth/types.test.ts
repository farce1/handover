import { describe, expect, expectTypeOf, it } from 'vitest';
import { HandoverError } from '../utils/errors.js';
import { AuthError, type AuthResult, type AuthSource, type StoredCredential } from './types.js';

describe('AuthError', () => {
  it('stores constructor fields and sets AuthError name', () => {
    const err = new AuthError(
      'Missing key',
      'No key found',
      'Set OPENAI_API_KEY',
      'AUTH_NO_CREDENTIAL',
    );

    expect(err.message).toBe('Missing key');
    expect(err.reason).toBe('No key found');
    expect(err.fix).toBe('Set OPENAI_API_KEY');
    expect(err.code).toBe('AUTH_NO_CREDENTIAL');
    expect(err.name).toBe('AuthError');
  });

  it('extends HandoverError', () => {
    const err = new AuthError('m', 'r', 'f');
    expect(err).toBeInstanceOf(HandoverError);
  });

  it('formats using inherited HandoverError format', () => {
    const err = new AuthError('Auth failed', 'token invalid', 'login again', 'AUTH_ERROR');
    const output = err.format();

    expect(output).toContain('Error:');
    expect(output).toContain('Auth failed');
    expect(output).toContain('Why:');
    expect(output).toContain('token invalid');
    expect(output).toContain('Fix:');
    expect(output).toContain('login again');
  });

  it('builds noCredential with all auth options', () => {
    const err = AuthError.noCredential('openai', 'OPENAI_API_KEY');

    expect(err.code).toBe('AUTH_NO_CREDENTIAL');
    expect(err.message).toContain('openai');
    expect(err.fix).toContain('export OPENAI_API_KEY=');
    expect(err.fix).toContain('handover auth login openai');
    expect(err.fix).toContain('handover init');
  });

  it('builds sessionExpired with provider-specific re-auth command', () => {
    const err = AuthError.sessionExpired('codex');

    expect(err.code).toBe('AUTH_SESSION_EXPIRED');
    expect(err.fix).toContain('handover auth login codex');
  });
});

describe('auth types', () => {
  it('accepts valid AuthSource values', () => {
    const source: AuthSource = 'credential-store';
    expectTypeOf(source).toEqualTypeOf<AuthSource>();
  });

  it('AuthResult has apiKey and source', () => {
    const result: AuthResult = {
      apiKey: 'abc',
      source: 'env-var',
    };

    expectTypeOf(result.apiKey).toEqualTypeOf<string>();
    expectTypeOf(result.source).toEqualTypeOf<AuthSource>();
  });

  it('StoredCredential includes provider, token, and optional expiresAt', () => {
    const credential: StoredCredential = {
      provider: 'openai',
      token: 'tok_123',
      expiresAt: '2026-03-01T00:00:00Z',
    };

    expectTypeOf(credential.provider).toEqualTypeOf<string>();
    expectTypeOf(credential.token).toEqualTypeOf<string>();
    expectTypeOf(credential.expiresAt).toEqualTypeOf<string | undefined>();
  });
});
