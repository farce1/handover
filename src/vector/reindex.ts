/**
 * Reindex orchestrator
 *
 * Connects chunker, embedder, and vector store into a full pipeline.
 * Implements incremental indexing with content-hash change detection.
 */

import Database from 'better-sqlite3';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { VectorStore } from './vector-store.js';
import { chunkDocument } from './chunker.js';
import { createEmbeddingProvider, type EmbeddingClient } from './embedder.js';
import { EmbeddingRouter } from './embedding-router.js';
import { EmbeddingHealthChecker } from './embedding-health.js';
import { LocalEmbeddingProvider } from './local-embedder.js';
import { logger } from '../utils/logger.js';
import { HandoverError } from '../utils/errors.js';
import {
  DEFAULT_EMBEDDING_LOCALITY_MODE,
  EMBEDDING_MODELS,
  type EmbeddingRouteMetadata,
  type EmbeddingLocalityMode,
} from './types.js';
import type { HandoverConfig } from '../config/schema.js';
import type { DocumentChunk } from './types.js';

interface StoredIndexMetadata {
  embeddingModel: string;
  embeddingDimensions: number;
}

function readStoredIndexMetadata(dbPath: string): StoredIndexMetadata | null {
  if (!existsSync(dbPath)) {
    return null;
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT key, value FROM schema_metadata').all() as Array<{
      key: string;
      value: string;
    }>;

    const metadata = rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    if (!metadata.embedding_model || !metadata.embedding_dimensions) {
      return null;
    }

    return {
      embeddingModel: metadata.embedding_model,
      embeddingDimensions: Number(metadata.embedding_dimensions),
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

async function resolveEmbeddingDimensions(
  provider: EmbeddingClient,
  storedMetadata: StoredIndexMetadata | null,
): Promise<number> {
  const configuredDimensions = provider.getDimensions();
  if (configuredDimensions > 0) {
    return configuredDimensions;
  }

  if (storedMetadata && storedMetadata.embeddingModel === provider.model) {
    return storedMetadata.embeddingDimensions;
  }

  const probeResult = await provider.embedBatch(['dimension probe']);
  const probeDimensions = probeResult.embeddings[0]?.length ?? probeResult.dimensions;
  if (!probeDimensions || probeDimensions <= 0) {
    throw new HandoverError(
      `Unable to determine embedding dimensions for model '${provider.model}'`,
      'The provider returned an empty embedding payload during preflight probing',
      'Verify the configured embedding model supports vector embeddings and retry reindexing',
      'EMBEDDING_DIMENSIONS_UNKNOWN',
    );
  }

  return probeDimensions;
}

function assertIndexCompatibility(
  storedMetadata: StoredIndexMetadata | null,
  activeModel: string,
  activeDimensions: number,
  dbPath: string,
): void {
  if (!storedMetadata) {
    return;
  }

  if (
    storedMetadata.embeddingModel === activeModel &&
    storedMetadata.embeddingDimensions === activeDimensions
  ) {
    return;
  }

  throw new HandoverError(
    'Embedding index metadata is incompatible with the active embedding route',
    `Index metadata is ${storedMetadata.embeddingModel} (${storedMetadata.embeddingDimensions}D), but active route resolved ${activeModel} (${activeDimensions}D)`,
    `First, rebuild the index with the active model by running 'handover reindex --force'. If the mismatch persists, delete '${dbPath}' and reindex again.`,
    'EMBEDDING_INDEX_MISMATCH',
  );
}

function createRemoteProvider(
  mode: EmbeddingLocalityMode,
  config: HandoverConfig,
): EmbeddingClient {
  try {
    return createEmbeddingProvider(config);
  } catch (err) {
    if (
      mode === 'remote-only' ||
      !(err instanceof HandoverError) ||
      err.code !== 'EMBEDDING_NO_API_KEY'
    ) {
      throw err;
    }

    const model = config.embedding?.model ?? 'text-embedding-3-small';
    return {
      provider: 'remote',
      model,
      getDimensions: () => EMBEDDING_MODELS[model] ?? 1536,
      embedBatch: async () => {
        throw new HandoverError(
          'Remote fallback is unavailable because no OpenAI API key is configured',
          err.reason,
          `${err.fix}\n\nOr rerun with --embedding-mode local-only to disable remote fallback.`,
          'EMBEDDING_REMOTE_FALLBACK_UNAVAILABLE',
        );
      },
    };
  }
}

/**
 * Options for reindexing
 */
export interface ReindexOptions {
  /** Handover configuration */
  config: HandoverConfig;
  /** Directory containing generated documents */
  outputDir: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Force re-embed all documents (skip change detection) */
  force?: boolean;
  /** Progress callback for UI updates */
  onProgress?: (event: ReindexProgressEvent) => void;
}

/**
 * Progress event for reindexing
 */
export interface ReindexProgressEvent {
  /** Current phase of reindexing */
  phase: 'scanning' | 'chunking' | 'embedding' | 'storing' | 'complete';
  /** Total number of documents */
  documentsTotal: number;
  /** Number of documents processed */
  documentsProcessed: number;
  /** Number of documents skipped */
  documentsSkipped: number;
  /** Number of documents that failed processing */
  documentsFailed: number;
  /** Total number of chunks */
  chunksTotal: number;
  /** Number of chunks processed */
  chunksProcessed: number;
}

/**
 * Result from reindexing
 */
export interface ReindexResult {
  /** Number of documents processed */
  documentsProcessed: number;
  /** Number of documents skipped (unchanged) */
  documentsSkipped: number;
  /** Number of documents that failed processing */
  documentsFailed: number;
  /** Total discovered markdown documents */
  documentsTotal: number;
  /** Number of chunks created */
  chunksCreated: number;
  /** Total tokens used for embeddings */
  totalTokens: number;
  /** Embedding model used */
  embeddingModel: string;
  /** Embedding dimensions */
  embeddingDimensions: number;
  /** Resolved embedding route for this run */
  embeddingRoute: EmbeddingRouteMetadata;
  /** Non-fatal warnings encountered during indexing */
  warnings: string[];
}

/**
 * Document metadata for processing
 */
interface DocumentMeta {
  /** Full file path */
  filePath: string;
  /** Source filename */
  sourceFile: string;
  /** Document ID (derived from filename) */
  docId: string;
  /** Document type (derived from filename) */
  docType: string;
  /** File content */
  content: string;
}

/**
 * Discover all markdown files in output directory
 */
function discoverDocuments(outputDir: string): DocumentMeta[] {
  const documents: DocumentMeta[] = [];

  try {
    const files = readdirSync(outputDir);

    for (const file of files) {
      // Skip non-markdown files and the index
      if (!file.endsWith('.md') || file === '00-INDEX.md') {
        continue;
      }

      const filePath = join(outputDir, file);
      const stat = statSync(filePath);

      if (!stat.isFile()) {
        continue;
      }

      // Read content
      const content = readFileSync(filePath, 'utf-8');

      // Derive docId and docType from filename
      // e.g., "03-ARCHITECTURE.md" -> docId: "03-architecture", docType: "architecture"
      const docId = file.replace('.md', '').toLowerCase();
      const docType = file.replace(/^\d+-/, '').replace('.md', '').toLowerCase();

      documents.push({
        filePath,
        sourceFile: file,
        docId,
        docType,
        content,
      });
    }
  } catch (err) {
    throw new HandoverError(
      `Failed to read output directory: ${outputDir}`,
      err instanceof Error ? err.message : String(err),
      'Ensure the directory exists and is readable',
      'REINDEX_READ_ERROR',
    );
  }

  return documents;
}

/**
 * Compute content hash fingerprint for a document
 */
function computeFingerprint(doc: DocumentMeta): string {
  const data = JSON.stringify({
    sourceFile: doc.sourceFile,
    content: doc.content,
  });
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Reindex documents: chunk, embed, and store with change detection
 *
 * Main entry point for the reindex pipeline.
 */
export async function reindexDocuments(options: ReindexOptions): Promise<ReindexResult> {
  const { config, outputDir, verbose, force, onProgress } = options;

  if (verbose) {
    logger.setVerbose(true);
  }

  // Phase 1: Validate output directory
  logger.log('Validating output directory...');

  const documents = discoverDocuments(outputDir);

  if (documents.length === 0) {
    throw new HandoverError(
      `No generated documents found in ${outputDir}`,
      'The output directory exists but contains no .md files',
      `Run 'handover generate' first to create documentation`,
      'REINDEX_NO_DOCS',
    );
  }

  onProgress?.({
    phase: 'scanning',
    documentsTotal: documents.length,
    documentsProcessed: 0,
    documentsSkipped: 0,
    documentsFailed: 0,
    chunksTotal: 0,
    chunksProcessed: 0,
  });

  logger.log(`Found ${documents.length} documents`);

  const embeddingMode = config.embedding?.mode ?? DEFAULT_EMBEDDING_LOCALITY_MODE;
  const dbPath = join(outputDir, '../.handover/search.db');

  // Phase 2: Resolve embedding route and preflight compatibility
  logger.log(`Resolving embedding route for mode '${embeddingMode}'...`);
  const remoteProvider = createRemoteProvider(embeddingMode as EmbeddingLocalityMode, config);
  const localProvider =
    embeddingMode === 'remote-only'
      ? undefined
      : config.embedding?.local?.model
        ? new LocalEmbeddingProvider({
            model: config.embedding.local.model,
            baseUrl: config.embedding.local.baseUrl,
            timeoutMs: config.embedding.local.timeout,
            batchSize: config.embedding?.batchSize,
          })
        : undefined;

  const embeddingRouter = new EmbeddingRouter();
  const healthChecker = new EmbeddingHealthChecker();
  const route = await embeddingRouter.resolve({
    mode: embeddingMode as EmbeddingLocalityMode,
    operation: 'indexing',
    interactive: false,
    remoteProvider,
    localProvider,
  });
  const embeddingRoute = route.metadata;

  logger.log(
    `Embedding route resolved: provider=${route.metadata.provider}, reason=${route.metadata.reason}`,
  );

  const storedMetadata = readStoredIndexMetadata(dbPath);

  const embeddingModel = route.provider.model;
  const embeddingDimensions = await resolveEmbeddingDimensions(route.provider, storedMetadata);
  assertIndexCompatibility(storedMetadata, embeddingModel, embeddingDimensions, dbPath);

  // Phase 3: Open vector store
  logger.log('Opening vector store...');
  const vectorStore = new VectorStore({
    dbPath,
    embeddingModel,
    embeddingDimensions,
  });
  vectorStore.open();

  try {
    const embeddingProvider = route.provider;

    // Phase 4: Change detection (if not forced)
    logger.log('Detecting changed documents...');

    const changedDocs: DocumentMeta[] = [];
    let documentsSkipped = 0;
    let documentsFailed = 0;
    const warnings: string[] = [];

    if (force) {
      logger.log('Force mode enabled - re-embedding all documents');
      changedDocs.push(...documents);
    } else {
      for (const doc of documents) {
        const fingerprint = computeFingerprint(doc);
        const stored = vectorStore.getDocumentFingerprint(doc.docId);

        if (stored && stored.fingerprint === fingerprint) {
          logger.log(`Skipping unchanged: ${doc.sourceFile}`);
          documentsSkipped++;
        } else {
          logger.log(`Changed: ${doc.sourceFile}`);
          changedDocs.push(doc);
        }
      }
    }

    onProgress?.({
      phase: 'chunking',
      documentsTotal: documents.length,
      documentsProcessed: 0,
      documentsSkipped,
      documentsFailed,
      chunksTotal: 0,
      chunksProcessed: 0,
    });

    if (changedDocs.length === 0) {
      logger.log('No documents to process');
      return {
        documentsProcessed: 0,
        documentsSkipped,
        documentsFailed,
        documentsTotal: documents.length,
        chunksCreated: 0,
        totalTokens: 0,
        embeddingModel,
        embeddingDimensions,
        embeddingRoute,
        warnings,
      };
    }

    // Phase 5: Chunk changed documents
    logger.log(`Chunking ${changedDocs.length} documents...`);

    const allChunks: Array<{ doc: DocumentMeta; chunks: DocumentChunk[] }> = [];

    for (const doc of changedDocs) {
      try {
        const chunks = chunkDocument(doc.content, {
          sourceFile: doc.sourceFile,
          docId: doc.docId,
          docType: doc.docType,
        });

        allChunks.push({ doc, chunks });
        logger.log(`  ${doc.sourceFile}: ${chunks.length} chunks`);
      } catch (err) {
        const message = `Failed to chunk ${doc.sourceFile}: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn(message);
        warnings.push(message);
        documentsFailed++;
      }
    }

    const totalChunks = allChunks.reduce((sum, item) => sum + item.chunks.length, 0);

    if (totalChunks === 0) {
      const message =
        'No chunks were produced from changed documents. Check warnings and rerun with --verbose after fixing malformed files.';
      warnings.push(message);

      onProgress?.({
        phase: 'complete',
        documentsTotal: documents.length,
        documentsProcessed: 0,
        documentsSkipped,
        documentsFailed,
        chunksTotal: 0,
        chunksProcessed: 0,
      });

      return {
        documentsProcessed: 0,
        documentsSkipped,
        documentsFailed,
        documentsTotal: documents.length,
        chunksCreated: 0,
        totalTokens: 0,
        embeddingModel,
        embeddingDimensions,
        embeddingRoute,
        warnings,
      };
    }

    onProgress?.({
      phase: 'embedding',
      documentsTotal: documents.length,
      documentsProcessed: 0,
      documentsSkipped,
      documentsFailed,
      chunksTotal: totalChunks,
      chunksProcessed: 0,
    });

    logger.log(`Total chunks: ${totalChunks}`);

    // Phase 6: Embed all chunks
    logger.log('Embedding chunks...');

    if (route.metadata.provider === 'local' && route.diagnostics) {
      healthChecker.assertReady(route.diagnostics);
    }

    const allChunkTexts = allChunks.flatMap((item) => item.chunks.map((chunk) => chunk.content));

    const { embeddings, totalTokens } = await embeddingProvider.embedBatch(allChunkTexts);

    onProgress?.({
      phase: 'storing',
      documentsTotal: documents.length,
      documentsProcessed: 0,
      documentsSkipped,
      documentsFailed,
      chunksTotal: totalChunks,
      chunksProcessed: totalChunks,
    });

    logger.log(`Embedded ${embeddings.length} chunks (${totalTokens} tokens)`);

    // Phase 7: Store in database
    logger.log('Storing chunks in vector database...');

    let embeddingOffset = 0;
    let documentsProcessed = 0;
    let chunksStored = 0;

    for (const { doc, chunks } of allChunks) {
      try {
        // Delete old chunks for this document
        vectorStore.deleteDocumentChunks(doc.docId);

        // Insert new chunks with embeddings
        const docEmbeddings = embeddings.slice(embeddingOffset, embeddingOffset + chunks.length);
        vectorStore.insertChunks(chunks, docEmbeddings);

        // Update fingerprint
        const fingerprint = computeFingerprint(doc);
        vectorStore.upsertDocumentFingerprint({
          docId: doc.docId,
          fingerprint,
          indexedAt: new Date().toISOString(),
          chunkCount: chunks.length,
        });

        embeddingOffset += chunks.length;
        documentsProcessed++;
        chunksStored += chunks.length;

        logger.log(`  Stored ${doc.sourceFile} (${chunks.length} chunks)`);
      } catch (err) {
        const message = `Failed to store ${doc.sourceFile}: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn(message);
        warnings.push(message);
        documentsFailed++;
      }
    }

    onProgress?.({
      phase: 'complete',
      documentsTotal: documents.length,
      documentsProcessed,
      documentsSkipped,
      documentsFailed,
      chunksTotal: totalChunks,
      chunksProcessed: chunksStored,
    });

    logger.log('Reindexing complete');

    return {
      documentsProcessed,
      documentsSkipped,
      documentsFailed,
      documentsTotal: documents.length,
      chunksCreated: chunksStored,
      totalTokens,
      embeddingModel,
      embeddingDimensions,
      embeddingRoute,
      warnings,
    };
  } finally {
    vectorStore.close();
  }
}
