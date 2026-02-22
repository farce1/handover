import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { DOCUMENT_REGISTRY } from '../renderers/registry.js';

const DOCS_URI_PREFIX = 'handover://docs/';

interface ResourceCatalogEntry {
  uri: string;
  name: string;
  title: string;
  mimeType: string;
  description: string;
  read: () => Promise<ReadResourceResult>;
}

export interface RegisterMcpResourcesOptions {
  outputDir: string;
}

function toMcpResource(entry: ResourceCatalogEntry): Resource {
  return {
    uri: entry.uri,
    name: entry.name,
    title: entry.title,
    mimeType: entry.mimeType,
    description: entry.description,
  };
}

function sortCatalog(entries: ResourceCatalogEntry[]): ResourceCatalogEntry[] {
  return [...entries].sort((a, b) => {
    const uriCompare = a.uri.localeCompare(b.uri);
    if (uriCompare !== 0) {
      return uriCompare;
    }

    return a.title.localeCompare(b.title);
  });
}

function buildDocsCatalog(outputDir: string): ResourceCatalogEntry[] {
  return sortCatalog(
    DOCUMENT_REGISTRY.map((document) => {
      const uri = `${DOCS_URI_PREFIX}${document.id}`;
      const filePath = join(outputDir, document.filename);

      return {
        uri,
        name: document.id,
        title: document.title,
        mimeType: 'text/markdown',
        description: `Generated handover document: ${document.filename}`,
        read: async () => {
          const markdown = await readFile(filePath, 'utf-8');

          return {
            contents: [
              {
                uri,
                mimeType: 'text/markdown',
                text: markdown,
              },
            ],
          };
        },
      };
    }),
  );
}

function createNotFoundResult(uri: string, availableUris: string[]): ReadResourceResult {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            code: 'MCP_RESOURCE_NOT_FOUND',
            message: `Resource not found: ${uri}`,
            action: 'Call resources/list to discover available URIs, then retry resources/read.',
            availableUris,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function registerMcpResources(
  server: McpServer,
  options: RegisterMcpResourcesOptions,
): void {
  const docsCatalog = buildDocsCatalog(options.outputDir);
  const resourceByUri = new Map(docsCatalog.map((entry) => [entry.uri, entry]));
  const availableUris = docsCatalog.map((entry) => entry.uri);

  server.server.registerCapabilities({
    resources: {
      listChanged: true,
    },
  });

  server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: docsCatalog.map(toMcpResource),
    };
  });

  server.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const entry = resourceByUri.get(request.params.uri);
    if (!entry) {
      return createNotFoundResult(request.params.uri, availableUris);
    }

    return entry.read();
  });
}
