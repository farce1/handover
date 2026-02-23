import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../config/loader.js';
import { createMcpStructuredError } from '../mcp/errors.js';
import { verifyServePrerequisites } from '../mcp/preflight.js';
import { registerMcpPrompts } from '../mcp/prompts.js';
import { registerMcpResources } from '../mcp/resources.js';
import { startMcpServer } from '../mcp/server.js';
import { registerMcpTools } from '../mcp/tools.js';

function writeToStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

export async function runServe(): Promise<void> {
  try {
    const config = loadConfig();
    verifyServePrerequisites(config.output);
    const registerHooks = [
      (server: McpServer) => registerMcpResources(server, { outputDir: config.output }),
      (server: McpServer) => registerMcpTools(server, { config, outputDir: config.output }),
      (server: McpServer) => registerMcpPrompts(server, { config, outputDir: config.output }),
    ];

    await startMcpServer({
      registerHooks,
    });

    writeToStderr('MCP server listening on stdio.');
    writeToStderr('Ready: stdout is reserved for JSON-RPC protocol frames only.');
  } catch (error) {
    const structured = createMcpStructuredError(error);
    writeToStderr('Failed to start MCP server.');
    writeToStderr(JSON.stringify(structured));
    process.exitCode = 1;
  }
}
