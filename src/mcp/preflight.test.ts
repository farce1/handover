import { describe, it, expect, afterEach } from 'vitest';
import type { HandoverConfig } from '../config/schema.js';
import { isLoopbackHost, verifyHttpSecurityPrerequisites } from './preflight.js';

function mkConfig(transport: string, host: string, token?: string): HandoverConfig {
  return {
    serve: { transport, http: { host, auth: token ? { token } : undefined } },
  } as unknown as HandoverConfig;
}

const ORIGINAL_TOKEN = process.env.HANDOVER_AUTH_TOKEN;
function clearAuthEnv(): void {
  delete process.env.HANDOVER_AUTH_TOKEN;
}
afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.HANDOVER_AUTH_TOKEN;
  else process.env.HANDOVER_AUTH_TOKEN = ORIGINAL_TOKEN;
});

describe('isLoopbackHost', () => {
  it('recognizes loopback and rejects a non-loopback address', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
  });
});

describe('verifyHttpSecurityPrerequisites', () => {
  it('is a no-op for non-http transport', () => {
    clearAuthEnv();
    expect(() => verifyHttpSecurityPrerequisites(mkConfig('stdio', '0.0.0.0'))).not.toThrow();
  });

  it('allows loopback http without a token', () => {
    clearAuthEnv();
    expect(() => verifyHttpSecurityPrerequisites(mkConfig('http', '127.0.0.1'))).not.toThrow();
  });

  it('rejects non-loopback http with no auth configured', () => {
    clearAuthEnv();
    expect(() => verifyHttpSecurityPrerequisites(mkConfig('http', '0.0.0.0'))).toThrow(
      /without authentication/,
    );
  });

  it('allows non-loopback http when a token is configured', () => {
    clearAuthEnv();
    expect(() =>
      verifyHttpSecurityPrerequisites(mkConfig('http', '0.0.0.0', 'secret')),
    ).not.toThrow();
  });

  it('allows non-loopback http when HANDOVER_AUTH_TOKEN is set in the env', () => {
    process.env.HANDOVER_AUTH_TOKEN = 'env-token';
    expect(() => verifyHttpSecurityPrerequisites(mkConfig('http', '0.0.0.0'))).not.toThrow();
  });
});
