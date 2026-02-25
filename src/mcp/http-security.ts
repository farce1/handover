import { createHash, timingSafeEqual } from 'node:crypto';

export interface SecurityRequest {
  headers: {
    origin?: string | string[];
    authorization?: string | string[];
  };
  method: string;
}

export interface SecurityResponse {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => SecurityResponse;
  json: (payload: unknown) => void;
  end: () => void;
}

type Next = () => void;
type RequestHandler = (req: SecurityRequest, res: SecurityResponse, next: Next) => void;

const ALLOWED_METHODS = 'GET, POST, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization, Mcp-Session-Id';

interface OriginPolicyOptions {
  allowedOrigins: string[] | undefined;
}

interface BearerAuthOptions {
  token: string;
}

function rejectOrigin(origin: string, res: SecurityResponse): void {
  res.status(403).json({
    ok: false,
    error: {
      code: 'MCP_HTTP_ORIGIN_REJECTED',
      message: `Cross-origin request from '${origin}' is not allowed.`,
      action:
        `Add '${origin}' to serve.http.allowedOrigins in .handover.yml, ` +
        "or set serve.http.allowedOrigins: ['*'] for development.",
    },
  });
}

function rejectAuth(message: string, action: string, res: SecurityResponse): void {
  res.status(401).json({
    ok: false,
    error: {
      code: 'MCP_HTTP_UNAUTHORIZED',
      message,
      action,
    },
  });
}

export function originPolicy(options: OriginPolicyOptions): RequestHandler {
  const allowedOrigins = options.allowedOrigins ?? [];
  const wildcardMode = allowedOrigins.includes('*');
  const allowlist = new Set(allowedOrigins);

  return (req, res, next) => {
    const originHeader = req.headers.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

    if (!origin) {
      next();
      return;
    }

    if (!wildcardMode && !allowlist.has(origin)) {
      rejectOrigin(origin, res);
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', wildcardMode ? '*' : origin);
    if (!wildcardMode) {
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.status(204).end();
      return;
    }

    next();
  };
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function bearerAuth(options: BearerAuthOptions): RequestHandler {
  const expectedHash = hashToken(options.token);

  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    if (!authValue) {
      rejectAuth(
        'Missing Authorization header.',
        'Include an Authorization: Bearer <token> header. Set the token via HANDOVER_AUTH_TOKEN env var or serve.http.auth.token in .handover.yml.',
        res,
      );
      return;
    }

    const parts = authValue.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
      rejectAuth(
        'Invalid Authorization header format.',
        'Include an Authorization: Bearer <token> header. Set the token via HANDOVER_AUTH_TOKEN env var or serve.http.auth.token in .handover.yml.',
        res,
      );
      return;
    }

    const providedHash = hashToken(parts[1]);
    if (!timingSafeEqual(expectedHash, providedHash)) {
      rejectAuth(
        'Invalid Bearer token.',
        'Check the token matches HANDOVER_AUTH_TOKEN or serve.http.auth.token.',
        res,
      );
      return;
    }

    next();
  };
}
