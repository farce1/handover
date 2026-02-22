import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchDocuments } from '../vector/query-engine.js';
import { HandoverError } from '../utils/errors.js';
import { createMcpStructuredError, type McpStructuredError } from './errors.js';
import type { SearchDocumentsInput, SearchDocumentsResult } from '../vector/query-engine.js';
import type { HandoverConfig } from '../config/schema.js';

const DEFAULT_LIMIT = 10;

const semanticSearchInputSchema = z.object({
  query: z
    .string({ error: 'query must be a string' })
    .trim()
    .min(1, { error: 'query must be a non-empty string' }),
  limit: z
    .number({ error: 'limit must be a number' })
    .int({ error: 'limit must be an integer' })
    .positive({ error: 'limit must be greater than 0' })
    .max(50, { error: 'limit must be <= 50' })
    .optional(),
  types: z
    .array(
      z
        .string({ error: 'types entries must be strings' })
        .trim()
        .min(1, { error: 'types entries cannot be empty' }),
    )
    .optional(),
});

type SemanticSearchFn = (input: SearchDocumentsInput) => Promise<SearchDocumentsResult>;

export interface RegisterMcpToolsOptions {
  config: HandoverConfig;
  outputDir?: string;
  searchFn?: SemanticSearchFn;
}

function createInvalidInputError(details: string): McpStructuredError {
  return createMcpStructuredError(
    new HandoverError(
      'Invalid semantic_search input',
      details,
      'Provide query as a non-empty string, optional numeric limit (1-50), and optional string[] types.',
      'SEARCH_INVALID_INPUT',
    ),
  );
}

function createToolErrorPayload(error: McpStructuredError) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          ok: false,
          error,
        }),
      },
    ],
    structuredContent: {
      ok: false,
      error,
    },
  };
}

export function registerMcpTools(server: McpServer, options: RegisterMcpToolsOptions): void {
  const executeSearch = options.searchFn ?? searchDocuments;

  server.registerTool(
    'semantic_search',
    {
      description: 'Semantic search over generated handover documentation.',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(50).optional(),
        types: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      const parsed = semanticSearchInputSchema.safeParse(input);
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
          .join('; ');
        return createToolErrorPayload(createInvalidInputError(details));
      }

      const limit = parsed.data.limit ?? DEFAULT_LIMIT;

      try {
        const result = await executeSearch({
          config: options.config,
          query: parsed.data.query,
          topK: limit,
          types: parsed.data.types,
          outputDir: options.outputDir,
        });

        const toolResult = {
          ok: true,
          query: result.query,
          limit: result.topK,
          total: result.totalMatches,
          results: result.matches.map((match) => ({
            relevance: match.relevance,
            source: match.sourceFile,
            section: match.sectionPath,
            snippet: match.contentPreview,
          })),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(toolResult) }],
          structuredContent: toolResult,
        };
      } catch (error) {
        return createToolErrorPayload(createMcpStructuredError(error));
      }
    },
  );
}
