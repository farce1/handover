/**
 * Vector database schema management
 *
 * Handles SQLite schema creation, migration, and embedding dimension validation.
 */

import type Database from 'better-sqlite3';
import type { VectorStoreConfig, SchemaMetadata } from './types.js';
import { SCHEMA_VERSION } from './types.js';

/**
 * Initialize database schema if it doesn't exist.
 * Creates schema_metadata, document_metadata, and vec_chunks tables.
 *
 * @param db - SQLite database instance
 * @param config - Vector store configuration
 */
export function initSchema(db: Database.Database, config: VectorStoreConfig): void {
  // Create schema metadata table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Create document metadata table for incremental indexing
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_metadata (
      doc_id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      chunk_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Create vec0 virtual table with configured dimensions
  // Note: The embedding column must specify dimensions as float[N]
  // Auxiliary columns (prefixed with +) are stored but not indexed
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
      embedding float[${config.embeddingDimensions}],
      doc_id TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      source_file TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      +section_path TEXT,
      +h1 TEXT,
      +h2 TEXT,
      +h3 TEXT,
      +token_count INTEGER,
      +content_preview TEXT,
      +content TEXT
    );
  `);

  // Initialize or verify schema metadata
  const existingMetadata = getSchemaMetadata(db);
  if (!existingMetadata) {
    // First time initialization
    const now = new Date().toISOString();
    const insert = db.prepare('INSERT INTO schema_metadata (key, value) VALUES (?, ?)');
    insert.run('schema_version', String(SCHEMA_VERSION));
    insert.run('embedding_model', config.embeddingModel);
    insert.run('embedding_dimensions', String(config.embeddingDimensions));
    insert.run('created_at', now);
  }
}

/**
 * Validate embedding dimensions match database schema.
 * Throws error if model changed with incompatible dimensions.
 *
 * @param db - SQLite database instance
 * @param currentModel - Current embedding model from config
 * @param currentDimensions - Current embedding dimensions from config
 * @throws Error if dimensions mismatch with remediation instructions
 */
export function validateEmbeddingDimensions(
  db: Database.Database,
  currentModel: string,
  currentDimensions: number,
): void {
  const metadata = getSchemaMetadata(db);
  if (!metadata) {
    // No metadata yet - first run, skip validation
    return;
  }

  const storedModel = metadata.embeddingModel;
  const storedDimensions = metadata.embeddingDimensions;

  // Check for dimension mismatch
  if (storedDimensions !== currentDimensions) {
    throw new Error(`Embedding model mismatch detected!

Database was created with: ${storedModel} (${storedDimensions} dimensions)
Current config uses: ${currentModel} (${currentDimensions} dimensions)

To rebuild the vector database with the new model:
  1. Delete .handover/search.db
  2. Run: handover reindex

Warning: This will re-embed all documents (may incur API costs).`);
  }

  // Model changed but dimensions are the same - update model silently
  // (This handles model aliases or version upgrades with same dimensions)
  if (storedModel !== currentModel) {
    db.prepare('UPDATE schema_metadata SET value = ? WHERE key = ?').run(
      currentModel,
      'embedding_model',
    );
  }
}

/**
 * Get schema metadata from database.
 * Returns null if schema_metadata table is empty (first run).
 *
 * @param db - SQLite database instance
 * @returns Schema metadata or null if not initialized
 */
export function getSchemaMetadata(db: Database.Database): SchemaMetadata | null {
  try {
    const rows = db.prepare('SELECT key, value FROM schema_metadata').all() as Array<{
      key: string;
      value: string;
    }>;

    if (rows.length === 0) {
      return null;
    }

    const metadata: Record<string, string> = {};
    for (const row of rows) {
      metadata[row.key] = row.value;
    }

    return {
      schemaVersion: Number(metadata.schema_version),
      embeddingModel: metadata.embedding_model,
      embeddingDimensions: Number(metadata.embedding_dimensions),
      createdAt: metadata.created_at,
    };
  } catch {
    // Table doesn't exist yet
    return null;
  }
}
