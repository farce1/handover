/**
 * Vector store implementation using SQLite + sqlite-vec
 *
 * Provides CRUD operations for document chunks with embeddings.
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { VectorStoreConfig, DocumentChunk, DocumentFingerprint } from './types.js';
import { initSchema, validateEmbeddingDimensions } from './schema.js';

/**
 * VectorStore wraps SQLite + sqlite-vec for vector storage and retrieval.
 *
 * Usage:
 * ```ts
 * const store = new VectorStore(config);
 * store.open();
 * store.insertChunks(chunks, embeddings);
 * store.close();
 * ```
 */
export class VectorStore {
  private db: Database.Database | null = null;
  private config: VectorStoreConfig;

  constructor(config: VectorStoreConfig) {
    this.config = config;
  }

  /**
   * Open database connection and initialize schema.
   * Creates .handover directory if it doesn't exist.
   * Loads sqlite-vec extension and validates dimensions.
   */
  open(): void {
    // Ensure parent directory exists
    const dbDir = dirname(this.config.dbPath);
    try {
      mkdirSync(dbDir, { recursive: true });
    } catch {
      // Directory might already exist - ignore error
    }

    // Open database
    this.db = new Database(this.config.dbPath);

    // Load sqlite-vec extension
    try {
      this.db.loadExtension(sqliteVec.getLoadablePath());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to load sqlite-vec extension: ${message}\n` +
          'This may indicate an unsupported platform or missing native dependencies.',
      );
    }

    // Initialize schema
    initSchema(this.db, this.config);

    // Validate dimensions
    validateEmbeddingDimensions(
      this.db,
      this.config.embeddingModel,
      this.config.embeddingDimensions,
    );
  }

  /**
   * Close database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Insert document chunks with their embeddings.
   * Uses a transaction for atomicity.
   *
   * @param chunks - Array of document chunks
   * @param embeddings - Array of embedding vectors (must match chunks length)
   */
  insertChunks(chunks: DocumentChunk[], embeddings: number[][]): void {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.');
    }

    if (chunks.length !== embeddings.length) {
      throw new Error(
        `Chunk count (${chunks.length}) does not match embedding count (${embeddings.length})`,
      );
    }

    // Prepare insert statement
    const insert = this.db.prepare(`
      INSERT INTO vec_chunks (
        embedding,
        doc_id,
        doc_type,
        source_file,
        chunk_index,
        section_path,
        h1,
        h2,
        h3,
        token_count,
        content_preview,
        content
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Insert all chunks in a transaction
    const transaction = this.db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        // Serialize embedding as JSON array for sqlite-vec
        const embeddingJson = JSON.stringify(embedding);

        insert.run(
          embeddingJson,
          chunk.metadata.docId,
          chunk.metadata.docType,
          chunk.metadata.sourceFile,
          chunk.metadata.chunkIndex,
          chunk.metadata.sectionPath,
          chunk.metadata.h1 ?? null,
          chunk.metadata.h2 ?? null,
          chunk.metadata.h3 ?? null,
          chunk.metadata.tokenCount,
          chunk.metadata.contentPreview,
          chunk.content,
        );
      }
    });

    transaction();
  }

  /**
   * Delete all chunks for a document.
   *
   * @param docId - Document identifier
   * @returns Number of chunks deleted
   */
  deleteDocumentChunks(docId: string): number {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.');
    }

    const result = this.db.prepare('DELETE FROM vec_chunks WHERE doc_id = ?').run(docId);
    return result.changes;
  }

  /**
   * Get document fingerprint from metadata table.
   *
   * @param docId - Document identifier
   * @returns Document fingerprint or null if not found
   */
  getDocumentFingerprint(docId: string): DocumentFingerprint | null {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.');
    }

    const row = this.db
      .prepare(
        'SELECT doc_id, fingerprint, indexed_at, chunk_count FROM document_metadata WHERE doc_id = ?',
      )
      .get(docId) as
      | {
          doc_id: string;
          fingerprint: string;
          indexed_at: string;
          chunk_count: number;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      docId: row.doc_id,
      fingerprint: row.fingerprint,
      indexedAt: row.indexed_at,
      chunkCount: row.chunk_count,
    };
  }

  /**
   * Upsert document fingerprint metadata.
   * Uses INSERT OR REPLACE to handle both new and existing documents.
   *
   * @param fingerprint - Document fingerprint data
   */
  upsertDocumentFingerprint(fingerprint: DocumentFingerprint): void {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.');
    }

    this.db
      .prepare(
        `INSERT OR REPLACE INTO document_metadata (doc_id, fingerprint, indexed_at, chunk_count)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        fingerprint.docId,
        fingerprint.fingerprint,
        fingerprint.indexedAt,
        fingerprint.chunkCount,
      );
  }

  /**
   * Get total number of chunks in the database.
   *
   * @returns Total chunk count
   */
  getChunkCount(): number {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.');
    }

    const result = this.db.prepare('SELECT COUNT(*) as count FROM vec_chunks').get() as {
      count: number;
    };
    return result.count;
  }

  /**
   * Get number of indexed documents.
   *
   * @returns Document count
   */
  getDocumentCount(): number {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.');
    }

    const result = this.db.prepare('SELECT COUNT(*) as count FROM document_metadata').get() as {
      count: number;
    };
    return result.count;
  }
}
