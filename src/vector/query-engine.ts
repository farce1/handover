import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createEmbeddingProvider } from './embedder.js';
import { VectorStore } from './vector-store.js';
import { HandoverError } from '../utils/errors.js';
import { EMBEDDING_MODELS } from './types.js';
import type { HandoverConfig } from '../config/schema.js';

const DEFAULT_TOP_K = 10;

const KNOWN_DOC_TYPES = [
  'project-overview',
  'getting-started',
  'architecture',
  'file-structure',
  'features',
  'modules',
  'dependencies',
  'environment',
  'edge-cases-and-gotchas',
  'tech-debt-and-todos',
  'conventions',
  'testing-strategy',
  'deployment',
] as const;

const KNOWN_DOC_TYPE_SET = new Set<string>(KNOWN_DOC_TYPES);

export interface SearchDocumentsInput {
  config: HandoverConfig;
  query: string;
  topK?: number;
  types?: string[];
  outputDir?: string;
}

export interface SearchDocumentMatch {
  sourceFile: string;
  sectionPath: string;
  docType: string;
  chunkIndex: number;
  contentPreview: string;
  content: string;
  distance: number;
  relevance: number;
}

export interface SearchDocumentsResult {
  query: string;
  topK: number;
  totalMatches: number;
  matches: SearchDocumentMatch[];
  filters: {
    types: string[];
  };
}

function toRelevance(distance: number): number {
  const normalized = 1 - distance / 2;
  const clamped = Math.max(0, Math.min(1, normalized));
  return Number((clamped * 100).toFixed(2));
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function suggestDocTypes(input: string): string[] {
  const fuzzy = KNOWN_DOC_TYPES.filter((candidate) => levenshteinDistance(candidate, input) <= 4);

  if (fuzzy.length > 0) {
    return fuzzy.slice(0, 3);
  }

  const contains = KNOWN_DOC_TYPES.filter((candidate) => candidate.includes(input));
  return contains.slice(0, 3);
}

function normalizeTypeFilters(rawTypes: string[]): string[] {
  const normalized = rawTypes.map((value) => value.trim().toLowerCase());
  const invalidEmpty = normalized.find((value) => value.length === 0);
  if (invalidEmpty !== undefined) {
    throw new HandoverError(
      'Invalid --type filter value',
      'A --type value was empty after trimming whitespace',
      `Use one or more known document types: ${KNOWN_DOC_TYPES.join(', ')}`,
      'SEARCH_INVALID_TYPE',
    );
  }

  for (const type of normalized) {
    if (KNOWN_DOC_TYPE_SET.has(type)) {
      continue;
    }

    const suggestions = suggestDocTypes(type);
    const suggestionMessage =
      suggestions.length > 0
        ? `Did you mean: ${suggestions.join(', ')}?`
        : `Known types: ${KNOWN_DOC_TYPES.join(', ')}`;

    throw new HandoverError(
      `Unknown document type: ${type}`,
      'The --type filter only accepts known document types from generated docs',
      `${suggestionMessage}\nRepeat the flag to filter multiple types (example: --type architecture --type modules).`,
      'SEARCH_UNKNOWN_TYPE',
    );
  }

  return Array.from(new Set(normalized));
}

export async function searchDocuments(input: SearchDocumentsInput): Promise<SearchDocumentsResult> {
  const query = input.query.trim();
  if (query.length === 0) {
    throw new HandoverError(
      'Search query cannot be empty',
      'Semantic search requires a non-empty query string',
      `Try: handover search "architecture overview"\nOr: handover search "test strategy" --type testing-strategy`,
      'SEARCH_EMPTY_QUERY',
    );
  }

  const topK = input.topK ?? DEFAULT_TOP_K;
  if (!Number.isInteger(topK) || topK <= 0) {
    throw new HandoverError(
      `Invalid --top-k value: ${String(input.topK)}`,
      '--top-k must be a positive integer',
      'Use a value like --top-k 10',
      'SEARCH_INVALID_TOP_K',
    );
  }

  const normalizedTypes = normalizeTypeFilters(input.types ?? []);

  const outputDir = input.outputDir ?? input.config.output;
  const dbPath = join(outputDir, '../.handover/search.db');
  if (!existsSync(dbPath)) {
    throw new HandoverError(
      `Search index not found at ${dbPath}`,
      'No vector database exists yet for this project',
      "Run 'handover reindex' to build the search index",
      'SEARCH_INDEX_MISSING',
    );
  }

  const embeddingModel = input.config.embedding?.model ?? 'text-embedding-3-small';
  const embeddingDimensions = EMBEDDING_MODELS[embeddingModel] ?? 1536;
  const vectorStore = new VectorStore({
    dbPath,
    embeddingModel,
    embeddingDimensions,
  });

  vectorStore.open();
  try {
    const indexedChunks = vectorStore.getChunkCount();
    if (indexedChunks === 0) {
      throw new HandoverError(
        'Search index is empty',
        'The vector database exists but contains no indexed chunks',
        "Run 'handover reindex' to populate the search index",
        'SEARCH_INDEX_EMPTY',
      );
    }

    const embedder = createEmbeddingProvider(input.config);
    const { embeddings } = await embedder.embedBatch([query]);
    const queryEmbedding = embeddings[0];

    const rows = vectorStore.search(queryEmbedding, {
      topK,
      docTypes: normalizedTypes,
    });

    return {
      query,
      topK,
      totalMatches: rows.length,
      matches: rows.map((row) => ({
        sourceFile: row.sourceFile,
        sectionPath: row.sectionPath,
        docType: row.docType,
        chunkIndex: row.chunkIndex,
        contentPreview: row.contentPreview,
        content: row.content,
        distance: row.distance,
        relevance: toRelevance(row.distance),
      })),
      filters: {
        types: normalizedTypes,
      },
    };
  } finally {
    vectorStore.close();
  }
}
