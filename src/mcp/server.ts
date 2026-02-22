import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export type McpRegisterHook = (server: McpServer) => void;

export interface CreateMcpServerOptions {
  name?: string;
  version?: string;
  registerHooks?: McpRegisterHook[];
}

export async function startMcpServer(options: CreateMcpServerOptions = {}): Promise<void> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
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
