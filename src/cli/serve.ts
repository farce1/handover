import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../config/loader.js';
import { createMcpStructuredError } from '../mcp/errors.js';
import { verifyServePrerequisites } from '../mcp/preflight.js';
import { registerMcpPrompts } from '../mcp/prompts.js';
import { createRegenerationExecutor } from '../mcp/regeneration-executor.js';
import { registerMcpResources } from '../mcp/resources.js';
import { startMcpHttpServer, startMcpServer } from '../mcp/server.js';
import { registerMcpTools } from '../mcp/tools.js';
import { createRegenerationJobManager } from '../regeneration/job-manager.js';

function writeToStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

interface ServeCliOptions {
  transport?: string;
  port?: number;
  host?: string;
}

export async function runServe(opts: ServeCliOptions = {}): Promise<void> {
  try {
    const baseConfig = loadConfig();
    const existingServe = baseConfig.serve;
    const cliOverrides: Record<string, unknown> = {};

    if (opts.transport !== undefined || opts.port !== undefined || opts.host !== undefined) {
      cliOverrides.serve = {
        transport: opts.transport ?? existingServe.transport,
        http: {
          port: opts.port ?? existingServe.http.port,
          host: opts.host ?? existingServe.http.host,
          path: existingServe.http.path,
        },
      };
    }

    const config = loadConfig(cliOverrides);
    verifyServePrerequisites(config.output);
    const regenerationExecutor = createRegenerationExecutor({
      config,
      outputDir: config.output,
    });
    const regenerationManager = createRegenerationJobManager({
      runner: ({ jobId, target }) => regenerationExecutor.execute({ jobId, target }),
    });
    const registerHooks = [
      (server: McpServer) => registerMcpResources(server, { outputDir: config.output }),
      (server: McpServer) =>
        registerMcpTools(server, {
          config,
          outputDir: config.output,
          regenerationManager,
        }),
      (server: McpServer) => registerMcpPrompts(server, { config, outputDir: config.output }),
    ];

    if (config.serve.transport === 'stdio') {
      await startMcpServer({
        registerHooks,
      });

      writeToStderr('MCP server listening on stdio.');
      writeToStderr('Ready: stdout is reserved for JSON-RPC protocol frames only.');
    } else {
      await startMcpHttpServer({
        registerHooks,
        port: config.serve.http.port,
        host: config.serve.http.host,
        mcpPath: config.serve.http.path,
      });

      writeToStderr('MCP server listening over HTTP.');
      writeToStderr('Transport: http');
      writeToStderr(`Base URL: http://${config.serve.http.host}:${config.serve.http.port}`);
      writeToStderr(`MCP path: ${config.serve.http.path}`);
      writeToStderr(
        `Endpoint: http://${config.serve.http.host}:${config.serve.http.port}${config.serve.http.path}`,
      );
      writeToStderr('Ready: POST/GET/DELETE requests accepted at MCP endpoint.');
    }
  } catch (error) {
    const structured = createMcpStructuredError(error);
    writeToStderr('Failed to start MCP server.');
    writeToStderr(JSON.stringify(structured));
    process.exitCode = 1;
  }
}
