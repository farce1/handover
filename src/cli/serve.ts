import { loadConfig } from '../config/loader.js';
import { startMcpServer } from '../mcp/server.js';

function writeToStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

export async function runServe(): Promise<void> {
  try {
    loadConfig();

    await startMcpServer();

    writeToStderr('MCP server listening on stdio.');
    writeToStderr('Ready: stdout is reserved for JSON-RPC protocol frames only.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeToStderr('Failed to start MCP server.');
    writeToStderr(message);
    process.exitCode = 1;
  }
}
