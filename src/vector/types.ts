/**
 * Type definitions for the vector storage subsystem.
 *
 * This module defines all interfaces for document chunking, embedding storage,
 * and vector database configuration used throughout Phase 12-15 (v4.0).
 */

/**
 * Metadata about a document chunk's origin and context.
 * Used for filtering search results and displaying provenance.
 */
export interface ChunkMetadata {
  /** Absolute path to the source file */
  sourceFile: string;
  /** Unique document identifier (typically content hash) */
  docId: string;
  /** Document type (e.g., 'typescript', 'markdown', 'python') */
  docType: string;
  /** Section path in the document (e.g., 'MyClass.myMethod') */
  sectionPath: string;
  /** Index of this chunk within the document (0-based) */
  chunkIndex: number;
  /** H1 heading context (if inside a markdown heading) */
  h1?: string;
  /** H2 heading context (if inside a markdown heading) */
  h2?: string;
  /** H3 heading context (if inside a markdown heading) */
  h3?: string;
  /** Number of tokens in this chunk */
  tokenCount: number;
  /** First 200 characters of content for preview */
  contentPreview: string;
}

/**
 * A document chunk before embedding.
 * Created by the chunker, passed to the embedder.
 */
export interface DocumentChunk {
  /** The actual text content to embed */
  content: string;
  /** Metadata about the chunk's origin */
  metadata: ChunkMetadata;
}

/**
 * A stored chunk retrieved from the vector database.
 * Extends DocumentChunk with database-specific fields.
 */
export interface StoredChunk extends DocumentChunk {
  /** SQLite rowid from vec_chunks table */
  rowid: number;
  /** Embedding vector (stored as Float32Array for efficiency) */
  embedding: Float32Array;
}

/**
 * Result from an embedding API call.
 * Returned by EmbeddingProvider.embed().
 */
export interface EmbeddingResult {
  /** Array of embedding vectors (one per input chunk) */
  embeddings: number[][];
  /** Model used to generate embeddings (e.g., 'text-embedding-3-small') */
  model: string;
  /** Dimensionality of each embedding vector */
  dimensions: number;
  /** Token usage statistics */
  usage: {
    /** Total tokens consumed by the embedding request */
    totalTokens: number;
  };
}

/**
 * Configuration for the VectorStore.
 * Passed to VectorStore constructor.
 */
export interface VectorStoreConfig {
  /** Absolute path to the SQLite database file */
  dbPath: string;
  /** Embedding model name (used for dimension validation) */
  embeddingModel: string;
  /** Expected embedding vector dimensions */
  embeddingDimensions: number;
}

/**
 * Document fingerprint tracking.
 * Stored in document_metadata table for incremental indexing.
 */
export interface DocumentFingerprint {
  /** Unique document identifier */
  docId: string;
  /** Content hash fingerprint */
  fingerprint: string;
  /** ISO 8601 timestamp when indexed */
  indexedAt: string;
  /** Number of chunks created for this document */
  chunkCount: number;
}

/**
 * Schema metadata stored in the vector database.
 * Used to validate embedding model compatibility on startup.
 */
export interface SchemaMetadata {
  /** Database schema version (for future migrations) */
  schemaVersion: number;
  /** Embedding model used to create this database */
  embeddingModel: string;
  /** Embedding vector dimensions */
  embeddingDimensions: number;
  /** ISO 8601 timestamp when schema was created */
  createdAt: string;
}

/** Current database schema version */
export const SCHEMA_VERSION = 1;

/** Default embedding model for new installations */
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Default embedding dimensions for text-embedding-3-small */
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

/**
 * Known embedding models and their dimensions.
 * Used for dimension validation and auto-configuration.
 */
export const EMBEDDING_MODELS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};
