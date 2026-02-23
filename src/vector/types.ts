/**
 * Vector storage type definitions
 *
 * Defines interfaces for document chunks, embeddings, and vector storage configuration.
 */

/**
 * Metadata for a document chunk
 */
export interface ChunkMetadata {
  /** Source file path */
  sourceFile: string;
  /** Unique document identifier */
  docId: string;
  /** Document type (e.g., 'architecture', 'readme') */
  docType: string;
  /** Section path (e.g., 'Introduction > Overview') */
  sectionPath: string;
  /** Zero-based chunk index within the document */
  chunkIndex: number;
  /** Top-level header text */
  h1?: string;
  /** Second-level header text */
  h2?: string;
  /** Third-level header text */
  h3?: string;
  /** Estimated token count for this chunk */
  tokenCount: number;
  /** First 200 characters of chunk content */
  contentPreview: string;
}

/**
 * A document chunk with content and metadata
 */
export interface DocumentChunk {
  /** The actual text content of the chunk */
  content: string;
  /** Metadata about the chunk */
  metadata: ChunkMetadata;
}

/**
 * A text chunk with minimal metadata (used by chunkMarkdown)
 */
export interface TextChunk {
  /** The actual text content of the chunk */
  content: string;
  /** Minimal metadata for text chunks */
  metadata: {
    /** Top-level header text */
    h1?: string;
    /** Second-level header text */
    h2?: string;
    /** Third-level header text */
    h3?: string;
    /** Section path (e.g., 'Introduction > Overview') */
    sectionPath: string;
  };
}

/**
 * Options for chunking configuration
 */
export interface ChunkOptions {
  /** Maximum size of each chunk in tokens (default: 512) */
  chunkSize?: number;
  /** Overlap between consecutive chunks in tokens (default: 75) */
  chunkOverlap?: number;
}

/**
 * A stored chunk with embedding and database ID
 */
export interface StoredChunk extends DocumentChunk {
  /** Database row ID */
  rowid: number;
  /** Embedding vector */
  embedding: Float32Array;
}

/**
 * Result from embedding API call
 */
export interface EmbeddingResult {
  /** Array of embedding vectors */
  embeddings: number[][];
  /** Model used for embeddings */
  model: string;
  /** Embedding dimension count */
  dimensions: number;
  /** Token usage statistics */
  usage: {
    /** Total tokens used */
    totalTokens: number;
  };
}

/**
 * Vector store configuration
 */
export interface VectorStoreConfig {
  /** Path to SQLite database file */
  dbPath: string;
  /** Embedding model name */
  embeddingModel: string;
  /** Embedding vector dimensions */
  embeddingDimensions: number;
}

/**
 * Document fingerprint for incremental indexing
 */
export interface DocumentFingerprint {
  /** Unique document identifier */
  docId: string;
  /** Content hash fingerprint */
  fingerprint: string;
  /** ISO timestamp of indexing */
  indexedAt: string;
  /** Number of chunks for this document */
  chunkCount: number;
}

/**
 * Schema metadata stored in database
 */
export interface SchemaMetadata {
  /** Schema version number */
  schemaVersion: number;
  /** Embedding model name */
  embeddingModel: string;
  /** Embedding vector dimensions */
  embeddingDimensions: number;
  /** ISO timestamp of database creation */
  createdAt: string;
}

// Constants
export const SCHEMA_VERSION = 1;
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_LOCALITY_MODE = 'local-preferred';
export const DEFAULT_EMBEDDING_LOCAL_BASE_URL = 'http://localhost:11434';

export const EMBEDDING_LOCALITY_MODES = ['local-only', 'local-preferred', 'remote-only'] as const;

export type EmbeddingLocalityMode = (typeof EMBEDDING_LOCALITY_MODES)[number];

export const EMBEDDING_PROVIDER_ROUTES = ['local', 'remote'] as const;

export type EmbeddingProviderRoute = (typeof EMBEDDING_PROVIDER_ROUTES)[number];

export interface EmbeddingRouteMetadata {
  mode: EmbeddingLocalityMode;
  provider: EmbeddingProviderRoute;
  reason: string;
}

/**
 * Mapping of embedding models to their dimension counts
 */
export const EMBEDDING_MODELS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};
