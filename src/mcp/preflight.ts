import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { HandoverConfig } from '../config/schema.js';
import { DOCUMENT_REGISTRY } from '../renderers/registry.js';
import { HandoverError } from '../utils/errors.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function summarizeMissing(paths: string[]): string {
  const preview = paths.slice(0, 5);
  if (paths.length <= 5) {
    return preview.join(', ');
  }

  return `${preview.join(', ')}, ...`;
}

export function verifyServePrerequisites(outputDir: string): void {
  const missingFiles: string[] = [];

  for (const document of DOCUMENT_REGISTRY) {
    const filePath = join(outputDir, document.filename);
    if (!existsSync(filePath)) {
      missingFiles.push(document.filename);
      continue;
    }

    const fileStats = statSync(filePath);
    if (fileStats.size === 0) {
      missingFiles.push(document.filename);
    }
  }

  if (missingFiles.length === 0) {
    return;
  }

  throw new HandoverError(
    `Generated documentation is missing or empty (${missingFiles.length}/${DOCUMENT_REGISTRY.length})`,
    `The MCP server requires generated docs before serving resources. Missing files include: ${summarizeMissing(missingFiles)}`,
    "Run 'handover generate' and retry 'handover serve'.",
    'MCP_DOCS_MISSING',
  );
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

export function verifyHttpSecurityPrerequisites(config: HandoverConfig): void {
  if (config.serve.transport !== 'http') {
    return;
  }

  const host = config.serve.http.host;
  const authToken = process.env.HANDOVER_AUTH_TOKEN ?? config.serve.http.auth?.token;

  if (!isLoopbackHost(host) && !authToken) {
    throw new HandoverError(
      `HTTP server cannot start on '${host}' without authentication configured.`,
      'Binding to a non-loopback address exposes the MCP endpoint to the network without access controls.',
      "Set the HANDOVER_AUTH_TOKEN environment variable, or add 'serve.http.auth.token' to .handover.yml.",
      'MCP_HTTP_AUTH_REQUIRED',
    );
  }
}
