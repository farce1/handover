import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { bearerAuth, originPolicy } from './http-security.js';

export type McpRegisterHook = (server: McpServer) => void;

export interface CreateMcpServerOptions {
  name?: string;
  version?: string;
  registerHooks?: McpRegisterHook[];
}

export interface StartMcpHttpServerOptions extends CreateMcpServerOptions {
  port?: number;
  host?: string;
  mcpPath?: string;
  allowedOrigins?: string[];
  authToken?: string;
}

export async function startMcpServer(options: CreateMcpServerOptions = {}): Promise<void> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function startMcpHttpServer(options: StartMcpHttpServerOptions = {}): Promise<void> {
  const server = createMcpServer(options);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3000;
  const mcpPath = options.mcpPath ?? '/mcp';

  const app = createMcpExpressApp({ host });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  type HttpRequest = Parameters<StreamableHTTPServerTransport['handleRequest']>[0] & {
    body?: unknown;
  };
  type HttpResponse = Parameters<StreamableHTTPServerTransport['handleRequest']>[1] & {
    status: (code: number) => {
      json: (payload: unknown) => void;
    };
  };

  await server.connect(transport);

  app.use(originPolicy({ allowedOrigins: options.allowedOrigins }));
  if (options.authToken) {
    app.use(bearerAuth({ token: options.authToken }));
  }

  app.post(mcpPath, async (req: HttpRequest, res: HttpResponse) => {
    await transport.handleRequest(req, res, req.body);
  });

  app.get(mcpPath, async (req: HttpRequest, res: HttpResponse) => {
    await transport.handleRequest(req, res);
  });

  app.delete(mcpPath, async (req: HttpRequest, res: HttpResponse) => {
    await transport.handleRequest(req, res);
  });

  app.use((_req: HttpRequest, res: HttpResponse) => {
    res.status(404).json({
      ok: false,
      error: {
        code: 'MCP_HTTP_NOT_FOUND',
        message: 'Unknown HTTP path.',
        action: `MCP requests must target ${mcpPath}. No alias paths are supported.`,
      },
    });
  });

  await new Promise<void>((resolve, reject) => {
    const httpServer = createServer(app);
    httpServer.listen(port, host, resolve);
    httpServer.on('error', reject);
  });
}

export function createMcpServer(options: CreateMcpServerOptions = {}): McpServer {
  const server = new McpServer({
    name: options.name ?? 'handover',
    version: options.version ?? '0.1.0',
  });

  for (const registerHook of options.registerHooks ?? []) {
    registerHook(server);
  }

  return server;
}
