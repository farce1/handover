import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DOCUMENT_REGISTRY } from '../renderers/registry.js';
import { HandoverError } from '../utils/errors.js';

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
