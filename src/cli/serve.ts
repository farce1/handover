import { loadConfig } from '../config/loader.js';
import { createMcpStructuredError } from '../mcp/errors.js';
import { verifyServePrerequisites } from '../mcp/preflight.js';
import { startMcpServer } from '../mcp/server.js';
import { registerMcpTools } from '../mcp/tools.js';

function writeToStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

export async function runServe(): Promise<void> {
  try {
    const config = loadConfig();
    verifyServePrerequisites(config.output);

    await startMcpServer({
      registerHooks: [(server) => registerMcpTools(server, { config })],
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
