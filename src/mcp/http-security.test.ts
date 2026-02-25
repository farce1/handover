import { describe, expect, test } from 'vitest';
import {
  bearerAuth,
  hashToken,
  originPolicy,
  type SecurityRequest,
  type SecurityResponse,
} from './http-security.js';
import type { HandoverConfig } from '../config/schema.js';
import { HandoverError } from '../utils/errors.js';
import { isLoopbackHost, verifyHttpSecurityPrerequisites } from './preflight.js';

interface MockContext {
  req: SecurityRequest;
  res: SecurityResponse;
  next: () => void;
  getStatus: () => number | undefined;
  getBody: () => unknown;
  getHeaders: () => Record<string, string>;
  wasEnded: () => boolean;
  wasNextCalled: () => boolean;
}

function createMockContext(overrides: Partial<SecurityRequest> = {}): MockContext {
  const headers: Record<string, string> = {};
  let statusCode: number | undefined;
  let body: unknown;
  let ended = false;
  let nextCalled = false;

  const req: SecurityRequest = {
    method: overrides.method ?? 'POST',
    headers: {
      ...(overrides.headers ?? {}),
    },
  };

  const res: SecurityResponse = {
    setHeader: (name, value) => {
      headers[name] = value;
    },
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (payload) => {
      body = payload;
    },
    end: () => {
      ended = true;
    },
  };

  const next = () => {
    nextCalled = true;
  };

  return {
    req,
    res,
    next,
    getStatus: () => statusCode,
    getBody: () => body,
    getHeaders: () => headers,
    wasEnded: () => ended,
    wasNextCalled: () => nextCalled,
  };
}

describe('originPolicy', () => {
  test('passes through when Origin header is absent', () => {
    const middleware = originPolicy({ allowedOrigins: undefined });
    const ctx = createMockContext();

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.wasNextCalled()).toBe(true);
    expect(ctx.getStatus()).toBeUndefined();
  });

  test('rejects cross-origin request when allowedOrigins is undefined', () => {
    const middleware = originPolicy({ allowedOrigins: undefined });
    const ctx = createMockContext({
      headers: { origin: 'https://evil.example' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.getStatus()).toBe(403);
    expect(ctx.wasNextCalled()).toBe(false);
    expect(ctx.getBody()).toEqual({
      ok: false,
      error: {
        code: 'MCP_HTTP_ORIGIN_REJECTED',
        message: "Cross-origin request from 'https://evil.example' is not allowed.",
        action:
          "Add 'https://evil.example' to serve.http.allowedOrigins in .handover.yml, or set serve.http.allowedOrigins: ['*'] for development.",
      },
    });
  });

  test('rejects cross-origin request when allowedOrigins is empty', () => {
    const middleware = originPolicy({ allowedOrigins: [] });
    const ctx = createMockContext({
      headers: { origin: 'https://evil.example' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.getStatus()).toBe(403);
    expect(ctx.wasNextCalled()).toBe(false);
  });

  test('allows listed origin and sets CORS headers', () => {
    const middleware = originPolicy({ allowedOrigins: ['https://allowed.example'] });
    const ctx = createMockContext({
      headers: { origin: 'https://allowed.example' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.wasNextCalled()).toBe(true);
    expect(ctx.getStatus()).toBeUndefined();
    expect(ctx.getHeaders()['Access-Control-Allow-Origin']).toBe('https://allowed.example');
    expect(ctx.getHeaders().Vary).toBe('Origin');
  });

  test('allows wildcard origin and sets wildcard CORS header', () => {
    const middleware = originPolicy({ allowedOrigins: ['*'] });
    const ctx = createMockContext({
      headers: { origin: 'https://any.example' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.wasNextCalled()).toBe(true);
    expect(ctx.getHeaders()['Access-Control-Allow-Origin']).toBe('*');
  });

  test('handles OPTIONS preflight in wildcard mode', () => {
    const middleware = originPolicy({ allowedOrigins: ['*'] });
    const ctx = createMockContext({
      method: 'OPTIONS',
      headers: { origin: 'https://any.example' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.wasNextCalled()).toBe(false);
    expect(ctx.getStatus()).toBe(204);
    expect(ctx.wasEnded()).toBe(true);
    expect(ctx.getHeaders()['Access-Control-Allow-Methods']).toBe('GET, POST, DELETE, OPTIONS');
    expect(ctx.getHeaders()['Access-Control-Allow-Headers']).toBe(
      'Content-Type, Authorization, Mcp-Session-Id',
    );
  });

  test('rejects origin that is not in allowlist', () => {
    const middleware = originPolicy({ allowedOrigins: ['https://allowed.example'] });
    const ctx = createMockContext({
      headers: { origin: 'https://evil.example' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.getStatus()).toBe(403);
    expect(ctx.wasNextCalled()).toBe(false);
  });

  test('handles OPTIONS preflight in allowlist mode without calling next', () => {
    const middleware = originPolicy({ allowedOrigins: ['https://allowed.example'] });
    const ctx = createMockContext({
      method: 'OPTIONS',
      headers: { origin: 'https://allowed.example' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.getStatus()).toBe(204);
    expect(ctx.wasEnded()).toBe(true);
    expect(ctx.wasNextCalled()).toBe(false);
  });

  test('does not set Vary header in wildcard mode', () => {
    const middleware = originPolicy({ allowedOrigins: ['*'] });
    const ctx = createMockContext({
      headers: { origin: 'https://any.example' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.getHeaders().Vary).toBeUndefined();
  });

  test('sets Vary header in non-wildcard mode', () => {
    const middleware = originPolicy({ allowedOrigins: ['https://allowed.example'] });
    const ctx = createMockContext({
      headers: { origin: 'https://allowed.example' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.getHeaders().Vary).toBe('Origin');
  });
});

describe('bearerAuth', () => {
  test('rejects missing Authorization header', () => {
    const middleware = bearerAuth({ token: 'expected-token' });
    const ctx = createMockContext();

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.getStatus()).toBe(401);
    expect(ctx.wasNextCalled()).toBe(false);
    expect(ctx.getBody()).toEqual({
      ok: false,
      error: {
        code: 'MCP_HTTP_UNAUTHORIZED',
        message: 'Missing Authorization header.',
        action:
          'Include an Authorization: Bearer <token> header. Set the token via HANDOVER_AUTH_TOKEN env var or serve.http.auth.token in .handover.yml.',
      },
    });
  });

  test('rejects malformed Authorization header', () => {
    const middleware = bearerAuth({ token: 'expected-token' });
    const ctx = createMockContext({
      headers: { authorization: 'Token expected-token' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.getStatus()).toBe(401);
    expect(ctx.wasNextCalled()).toBe(false);
    expect(ctx.getBody()).toEqual({
      ok: false,
      error: {
        code: 'MCP_HTTP_UNAUTHORIZED',
        message: 'Invalid Authorization header format.',
        action:
          'Include an Authorization: Bearer <token> header. Set the token via HANDOVER_AUTH_TOKEN env var or serve.http.auth.token in .handover.yml.',
      },
    });
  });

  test('rejects incorrect bearer token', () => {
    const middleware = bearerAuth({ token: 'expected-token' });
    const ctx = createMockContext({
      headers: { authorization: 'Bearer wrong-token' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.getStatus()).toBe(401);
    expect(ctx.wasNextCalled()).toBe(false);
    expect(ctx.getBody()).toEqual({
      ok: false,
      error: {
        code: 'MCP_HTTP_UNAUTHORIZED',
        message: 'Invalid Bearer token.',
        action: 'Check the token matches HANDOVER_AUTH_TOKEN or serve.http.auth.token.',
      },
    });
  });

  test('accepts correct bearer token', () => {
    const middleware = bearerAuth({ token: 'expected-token' });
    const ctx = createMockContext({
      headers: { authorization: 'Bearer expected-token' },
    });

    middleware(ctx.req, ctx.res, ctx.next);

    expect(ctx.wasNextCalled()).toBe(true);
    expect(ctx.getStatus()).toBeUndefined();
  });

  test('uses hashed token comparison so different token lengths do not throw', () => {
    const middleware = bearerAuth({ token: 'short' });
    const ctx = createMockContext({
      headers: {
        authorization: 'Bearer this-token-is-much-longer-than-short',
      },
    });

    expect(() => middleware(ctx.req, ctx.res, ctx.next)).not.toThrow();
    expect(ctx.getStatus()).toBe(401);
    expect(hashToken('value').byteLength).toBe(32);
  });
});

function createConfig(overrides: Partial<HandoverConfig> = {}): HandoverConfig {
  return {
    provider: 'anthropic',
    output: './handover',
    audience: 'human',
    include: ['**/*'],
    exclude: [],
    analysis: {
      concurrency: 4,
      staticOnly: false,
    },
    project: {},
    contextWindow: {
      pin: [],
      boost: [],
    },
    serve: {
      transport: 'http',
      http: {
        port: 3000,
        host: '127.0.0.1',
        path: '/mcp',
      },
    },
    ...overrides,
  };
}

describe('verifyHttpSecurityPrerequisites', () => {
  test('does nothing for stdio transport', () => {
    const config = createConfig({
      serve: {
        transport: 'stdio',
        http: {
          port: 3000,
          host: '0.0.0.0',
          path: '/mcp',
        },
      },
    });

    expect(() => verifyHttpSecurityPrerequisites(config)).not.toThrow();
  });

  test.each(['localhost', '127.0.0.1', '::1'])('allows loopback host %s without auth', (host) => {
    const config = createConfig({
      serve: {
        transport: 'http',
        http: {
          port: 3000,
          host,
          path: '/mcp',
        },
      },
    });

    expect(() => verifyHttpSecurityPrerequisites(config)).not.toThrow();
  });

  test('throws for non-loopback host without auth', () => {
    const config = createConfig({
      serve: {
        transport: 'http',
        http: {
          port: 3000,
          host: '0.0.0.0',
          path: '/mcp',
        },
      },
    });

    try {
      verifyHttpSecurityPrerequisites(config);
      throw new Error('Expected verifyHttpSecurityPrerequisites to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HandoverError);
      expect((error as HandoverError).code).toBe('MCP_HTTP_AUTH_REQUIRED');
    }
  });

  test('allows non-loopback host with auth token in config', () => {
    const config = createConfig({
      serve: {
        transport: 'http',
        http: {
          port: 3000,
          host: '0.0.0.0',
          path: '/mcp',
          auth: {
            token: 'configured-token',
          },
        },
      },
    });

    expect(() => verifyHttpSecurityPrerequisites(config)).not.toThrow();
  });

  test('allows non-loopback host with HANDOVER_AUTH_TOKEN env var', () => {
    const previous = process.env.HANDOVER_AUTH_TOKEN;
    process.env.HANDOVER_AUTH_TOKEN = 'env-token';

    try {
      const config = createConfig({
        serve: {
          transport: 'http',
          http: {
            port: 3000,
            host: '0.0.0.0',
            path: '/mcp',
          },
        },
      });

      expect(() => verifyHttpSecurityPrerequisites(config)).not.toThrow();
    } finally {
      if (previous === undefined) {
        delete process.env.HANDOVER_AUTH_TOKEN;
      } else {
        process.env.HANDOVER_AUTH_TOKEN = previous;
      }
    }
  });

  test('throws for public IP without auth', () => {
    const config = createConfig({
      serve: {
        transport: 'http',
        http: {
          port: 3000,
          host: '192.168.1.100',
          path: '/mcp',
        },
      },
    });

    expect(() => verifyHttpSecurityPrerequisites(config)).toThrowError(HandoverError);
  });
});

describe('isLoopbackHost', () => {
  test('returns true for loopback hosts', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
  });

  test('returns false for non-loopback hosts', () => {
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('192.168.1.1')).toBe(false);
  });
});
