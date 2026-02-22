import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ErrorCode,
  ListResourcesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../config/loader.js';
import { runStaticAnalysis } from '../analyzers/coordinator.js';
import { DOCUMENT_REGISTRY } from '../renderers/registry.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import { paginateResources } from './pagination.js';

const DOCS_URI_PREFIX = 'handover://docs/';
const ANALYSIS_URI_PREFIX = 'handover://analysis/';
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_PAGE_LIMIT_CAP = 50;

const ANALYSIS_RESOURCES = [
  {
    id: 'file-tree',
    title: 'Analysis - File Tree',
    description: 'Raw static file tree analysis payload (file and directory metadata).',
    select: (analysis: StaticAnalysisResult) => analysis.fileTree,
  },
  {
    id: 'dependency-graph',
    title: 'Analysis - Dependency Graph',
    description: 'Raw dependency graph analysis payload (package manifests and warnings).',
    select: (analysis: StaticAnalysisResult) => analysis.dependencies,
  },
  {
    id: 'git-history',
    title: 'Analysis - Git History',
    description: 'Raw git history analysis payload (commits, contributors, ownership).',
    select: (analysis: StaticAnalysisResult) => analysis.gitHistory,
  },
] as const;

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
  pageSize?: number;
  pageLimitCap?: number;
  analysisLoader?: () => Promise<StaticAnalysisResult>;
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

function buildAnalysisCatalog(
  loadAnalysis: () => Promise<StaticAnalysisResult>,
): ResourceCatalogEntry[] {
  return ANALYSIS_RESOURCES.map((resource) => {
    const uri = `${ANALYSIS_URI_PREFIX}${resource.id}`;

    return {
      uri,
      name: resource.id,
      title: resource.title,
      mimeType: 'application/json',
      description: resource.description,
      read: async () => {
        const analysis = await loadAnalysis();
        const payload = resource.select(analysis);

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      },
    };
  });
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
  let analysisPromise: Promise<StaticAnalysisResult> | undefined;
  const loadAnalysis =
    options.analysisLoader ??
    (() => {
      if (!analysisPromise) {
        const config = loadConfig();
        analysisPromise = runStaticAnalysis(process.cwd(), config);
      }

      return analysisPromise;
    });

  const docsCatalog = buildDocsCatalog(options.outputDir);
  const analysisCatalog = buildAnalysisCatalog(loadAnalysis);
  const catalog = sortCatalog([...docsCatalog, ...analysisCatalog]);
  const resourceByUri = new Map(catalog.map((entry) => [entry.uri, entry]));
  const availableUris = catalog.map((entry) => entry.uri);
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageLimitCap = options.pageLimitCap ?? DEFAULT_PAGE_LIMIT_CAP;

  server.server.registerCapabilities({
    resources: {
      listChanged: true,
    },
  });

  server.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    try {
      const paged = paginateResources({
        items: catalog.map(toMcpResource),
        cursor: request.params?.cursor,
        defaultLimit: pageSize,
        maxLimit: pageLimitCap,
      });

      return {
        resources: paged.items,
        nextCursor: paged.nextCursor,
      };
    } catch {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid resources cursor. Call resources/list without cursor to restart pagination.',
      );
    }
  });

  server.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const entry = resourceByUri.get(request.params.uri);
    if (!entry) {
      return createNotFoundResult(request.params.uri, availableUris);
    }

    return entry.read();
  });
}
