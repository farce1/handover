import { describe, expect, test } from 'vitest';
import {
  bearerAuth,
  hashToken,
  originPolicy,
  type SecurityRequest,
  type SecurityResponse,
} from './http-security.js';

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
