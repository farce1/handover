import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../config/loader.js';
import { createMcpStructuredError } from '../mcp/errors.js';
import {
  isLoopbackHost,
  verifyHttpSecurityPrerequisites,
  verifyServePrerequisites,
} from '../mcp/preflight.js';
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
  allowOrigin?: string[];
  port?: number;
  host?: string;
}

export async function runServe(opts: ServeCliOptions = {}): Promise<void> {
  try {
    const baseConfig = loadConfig();
    const existingServe = baseConfig.serve;
    const cliOverrides: Record<string, unknown> = {};
    const hasAllowOriginOverride = Array.isArray(opts.allowOrigin) && opts.allowOrigin.length > 0;

    if (
      opts.transport !== undefined ||
      opts.port !== undefined ||
      opts.host !== undefined ||
      hasAllowOriginOverride
    ) {
      cliOverrides.serve = {
        transport: opts.transport ?? existingServe.transport,
        http: {
          port: opts.port ?? existingServe.http.port,
          host: opts.host ?? existingServe.http.host,
          path: existingServe.http.path,
          allowedOrigins: hasAllowOriginOverride
            ? opts.allowOrigin
            : existingServe.http.allowedOrigins,
          auth: existingServe.http.auth,
        },
      };
    }

    const config = loadConfig(cliOverrides);
    verifyServePrerequisites(config.output);
    verifyHttpSecurityPrerequisites(config);
    const resolvedAuthToken = process.env.HANDOVER_AUTH_TOKEN ?? config.serve.http.auth?.token;
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
        allowedOrigins: config.serve.http.allowedOrigins,
        authToken: resolvedAuthToken,
      });

      writeToStderr('MCP server listening over HTTP.');
      writeToStderr('Transport: http');
      writeToStderr(`Base URL: http://${config.serve.http.host}:${config.serve.http.port}`);
      writeToStderr(`MCP path: ${config.serve.http.path}`);
      writeToStderr(
        `Endpoint: http://${config.serve.http.host}:${config.serve.http.port}${config.serve.http.path}`,
      );
      writeToStderr('Ready: POST/GET/DELETE requests accepted at MCP endpoint.');

      if (!isLoopbackHost(config.serve.http.host)) {
        writeToStderr(
          `Warning: HTTP endpoint is network-accessible (binding to ${config.serve.http.host}).`,
        );
        writeToStderr(
          'Warning: Ensure HANDOVER_AUTH_TOKEN and serve.http.allowedOrigins are configured.',
        );
      }

      if (config.serve.http.allowedOrigins?.includes('*')) {
        writeToStderr(
          'Warning: CORS wildcard mode is active — all cross-origin requests will be accepted.',
        );
      }
    }
  } catch (error) {
    const structured = createMcpStructuredError(error);
    writeToStderr('Failed to start MCP server.');
    writeToStderr(JSON.stringify(structured));
    process.exitCode = 1;
  }
}
