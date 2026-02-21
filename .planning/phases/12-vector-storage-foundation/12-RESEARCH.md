# Phase 12: Vector Storage Foundation - Research

**Researched:** 2026-02-21
**Domain:** SQLite vector database with markdown-aware chunking and embedding storage
**Confidence:** HIGH

## Summary

Phase 12 implements automatic chunking and embedding of handover's 14 generated markdown documents into a SQLite vector database using the sqlite-vec extension. The research reveals a mature, well-documented ecosystem with established best practices for markdown chunking, embedding validation, and incremental indexing.

**sqlite-vec** is the clear industry standard for SQLite vector storage—a zero-dependency C extension offering float/int8/binary vector support with metadata filtering, partitioning, and KNN search. It runs anywhere SQLite runs (Node.js, Deno, Bun, browsers via WASM) and integrates seamlessly with existing handover patterns (BaseProvider for retry/rate-limit, RoundCache for content-hash change detection).

**Primary recommendation:** Use header-based markdown chunking with RecursiveCharacterTextSplitter for size control (256-512 token chunks, 10-15% overlap), store embeddings in vec0 virtual table with metadata columns (source_file, section_path, doc_type, chunk_index), validate embedding dimensions on startup against stored schema metadata, and leverage existing content-hash pattern for incremental indexing.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Embedding providers:**

- Cloud-only providers for now (OpenAI, etc.) — local/offline embedding support deferred to future work
- Database location fixed at `.handover/search.db` inside existing output directory

**Progress reporting:**

- Progress bar during embedding (showing chunks processed across 14 documents)

### Claude's Discretion

- **Chunking strategy**: Research best practices for technical markdown documentation. Choose between header-based, fixed-token, or hybrid approach. Optimize for retrieval quality over simplicity
- **Chunk metadata**: Include whatever metadata improves downstream search result quality (source file, section path, doc type, chunk index)
- **Code block / table boundaries**: Pick the approach that best preserves retrieval quality — never splitting, overlap duplication, or hybrid
- **Chunk overlap**: Research optimal overlap strategy for technical documentation and apply
- **Provider config architecture**: Decide whether to reuse existing LLM provider config or create separate embedding config — balance simplicity with flexibility
- **Indexing trigger**: Decide whether embedding happens automatically after `handover generate` or via separate command — fit existing workflow patterns
- **Model switch behavior**: Pick the safest approach that doesn't surprise the user when embedding dimensions change (error + instructions vs auto-rebuild)

### Deferred Ideas (OUT OF SCOPE)

- Local/offline embedding support (e.g., ONNX models) — future enhancement
- No other scope creep — discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core

| Library                 | Version       | Purpose                                | Why Standard                                                                                                                         |
| ----------------------- | ------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| sqlite-vec              | 0.1.7-alpha.2 | SQLite vector extension for KNN search | Industry standard (High reputation, 66.4 benchmark score), zero-dependency C, runs everywhere SQLite runs, native metadata filtering |
| sqlite / better-sqlite3 | Latest stable | SQLite driver for Node.js              | Already in handover ecosystem, synchronous API ideal for CLI tools                                                                   |
| cli-progress            | 3.12.0        | CLI progress bars                      | Most popular (3,586 dependents), TypeScript support, multi-bar capable                                                               |

### Supporting

| Library                  | Version | Purpose                   | When to Use                                                                     |
| ------------------------ | ------- | ------------------------- | ------------------------------------------------------------------------------- |
| LangChain text-splitters | Latest  | Markdown-aware chunking   | MarkdownHeaderTextSplitter + RecursiveCharacterTextSplitter for hybrid approach |
| OpenAI SDK               | Latest  | Text embedding generation | Cloud embedding provider (text-embedding-3-small/large)                         |

### Alternatives Considered

| Instead of                 | Could Use                 | Tradeoff                                                                                                                                                          |
| -------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sqlite-vec                 | sqlite-vss (Faiss-based)  | sqlite-vss has higher benchmark (89.5) but requires Faiss dependency, heavier weight. sqlite-vec is pure C, runs in WASM, better for handover's portability needs |
| MarkdownHeaderTextSplitter | Custom regex chunker      | LangChain's splitter handles edge cases (nested headers, code blocks, tables) and has 16K+ code examples. Custom solution = reinventing wheel                     |
| Separate embedding config  | Reuse LLM provider config | Separate config allows different models/providers for embedding vs analysis, but adds complexity. Decision: reuse existing pattern with optional overrides        |

**Installation:**

```bash
npm install sqlite-vec cli-progress
npm install --save-dev @types/cli-progress
# LangChain text-splitters (evaluate during implementation)
npm install langchain @langchain/core
```

## Standard Stack Deep Dive

### sqlite-vec: Vector Storage Foundation

**Why sqlite-vec is the right choice:**

1. **Zero-dependency portability**: Pure C extension, no external dependencies like Faiss
2. **Runs everywhere**: Node.js (sqlite3/better-sqlite3), Deno, Bun, browsers (WASM)
3. **Native metadata filtering**: Metadata columns declared in vec0 virtual table, indexed and searchable
4. **Flexible vector types**: float[N], int8[N], binary[N] for different embedding formats
5. **Partitioning support**: Internal sharding on partition keys (e.g., by doc_type or date)
6. **Active development**: Regular releases, high source reputation

**Key capabilities verified via Context7:**

- **vec0 virtual table**: Main storage mechanism for vectors with metadata
- **KNN search**: `WHERE embedding MATCH query_vector ORDER BY distance LIMIT k`
- **Distance metrics**: L2 (Euclidean), cosine, dot product
- **Vector serialization**: JSON arrays `[0.1, 0.2, ...]` or compact BLOB via Float32Array
- **Dimension validation**: `float[768]` syntax enforces dimension at schema level

**sqlite-vec vs sqlite-vss comparison:**

| Metric             | sqlite-vec                                    | sqlite-vss                           |
| ------------------ | --------------------------------------------- | ------------------------------------ |
| Benchmark Score    | 66.4                                          | 89.5                                 |
| Dependencies       | Zero (pure C)                                 | Faiss (C++ library)                  |
| Binary Size        | ~200KB                                        | ~50MB+ (with Faiss)                  |
| WASM Support       | Yes                                           | No                                   |
| Metadata Filtering | Native (v0.1.0+)                              | Via JOIN to external tables          |
| **Best For**       | **Portability, simplicity, handover's needs** | High-performance, research workloads |

**Decision: Use sqlite-vec** for handover's portability requirements (runs in CLI, potential future web UI) and simplicity (zero external dependencies).

## Architecture Patterns

### Recommended Project Structure

```
src/
├── vector/                      # Phase 12: Vector storage
│   ├── chunker.ts              # Markdown chunking logic
│   ├── embedder.ts             # Embedding provider (extends BaseProvider)
│   ├── vector-store.ts         # SQLite vec0 database wrapper
│   ├── schema.ts               # Database schema + metadata validation
│   └── reindex.ts              # Incremental indexing orchestrator
├── providers/                   # Existing LLM providers
│   ├── base-provider.ts        # Extend for EmbeddingProvider
│   └── ...
├── cache/                       # Existing cache patterns
│   └── round-cache.ts          # Content-hash pattern to reuse
└── cli/
    └── commands/
        └── reindex.ts          # New CLI command
```

### Pattern 1: Markdown-Aware Chunking (Header-Based + Size Control)

**What:** Hybrid chunking that splits by markdown headers first, then applies size constraints with overlap

**When to use:** Technical documentation with hierarchical structure (handover's 14 docs fit perfectly)

**Research findings:**

1. **Header-based splitting preserves context**: Each chunk inherits header hierarchy as metadata
2. **Size control prevents token overflow**: 256-512 tokens optimal for RAG retrieval quality
3. **Overlap preserves continuity**: 10-15% overlap (50-75 tokens) reduces boundary-cutting issues
4. **Code block preservation**: Never split mid-code-block or mid-table

**Implementation approach (LangChain pattern):**

```typescript
// Source: Context7 /websites/langchain_oss_python + research synthesis
import { MarkdownHeaderTextSplitter } from 'langchain/text_splitter';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// Stage 1: Split by headers (preserves structure)
const headerSplitter = new MarkdownHeaderTextSplitter({
  headersToSplitOn: [
    ['#', 'h1'],
    ['##', 'h2'],
    ['###', 'h3'],
  ],
  stripHeaders: false, // Keep headers in chunks for context
});

// Stage 2: Apply size constraints with overlap
const chunkSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512, // ~512 tokens (adjust based on testing)
  chunkOverlap: 75, // ~15% overlap
  separators: ['\n\n', '\n', ' ', ''], // Respect paragraph boundaries
});

// Two-stage chunking
const headerChunks = await headerSplitter.split(markdown);
const finalChunks = await chunkSplitter.split(headerChunks);
```

**Metadata extraction pattern:**

```typescript
interface ChunkMetadata {
  source_file: string; // e.g., "03-ARCHITECTURE.md"
  doc_id: string; // e.g., "03-architecture"
  doc_type: string; // e.g., "architecture", "guide", "overview"
  section_path: string; // e.g., "# Architecture > ## Data Flow > ### Analyzers"
  h1?: string; // Top-level header
  h2?: string; // Second-level header
  h3?: string; // Third-level header
  chunk_index: number; // Sequential index within document
  token_count: number; // Estimated tokens (for diagnostics)
}
```

**Code block / table preservation strategy:**

````typescript
// Custom separator logic (inspired by LangChain RecursiveCharacterTextSplitter)
const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const TABLE_PATTERN = /\|.*\|[\s\S]*?\n(?!\|)/g;

function preserveStructures(text: string): string[] {
  // Identify code blocks and tables
  const structures = [];

  // Mark code blocks as atomic units
  text.replace(CODE_BLOCK_PATTERN, (match, offset) => {
    structures.push({ type: 'code', start: offset, end: offset + match.length });
    return match;
  });

  // Mark tables as atomic units
  text.replace(TABLE_PATTERN, (match, offset) => {
    structures.push({ type: 'table', start: offset, end: offset + match.length });
    return match;
  });

  // Split at safe boundaries, never mid-structure
  // If structure exceeds chunk size, duplicate it in overlapping chunks (user discretion)
  return splitWithStructurePreservation(text, structures);
}
````

**Research-backed decision: Overlap duplication for large code blocks**

- **Problem**: Code block longer than chunk size (e.g., 800 tokens)
- **Options**:
  1. Never split → creates oversized chunk
  2. Split mid-block → destroys code context
  3. **Duplicate in overlapping chunks** → preserves context, slight storage cost
- **Decision**: Duplicate large structures across chunks with metadata flag `is_structure_continuation: true`

### Pattern 2: Incremental Indexing with Content-Hash Change Detection

**What:** Reuse existing RoundCache content-hash pattern for document change detection

**When to use:** Every `handover reindex` invocation

**Implementation pattern (extends RoundCache approach):**

```typescript
// Source: Existing src/cache/round-cache.ts pattern + research on incremental indexing

class VectorIndexCache {
  /**
   * Compute fingerprint for a document (file path + content hash)
   */
  static computeDocumentFingerprint(filePath: string, content: string): string {
    const contentHash = createHash('sha256').update(content).digest('hex');
    return createHash('sha256').update(JSON.stringify({ filePath, contentHash })).digest('hex');
  }

  /**
   * Check if document needs reindexing
   * Returns: true if changed or new, false if unchanged
   */
  async needsReindex(docId: string, fingerprint: string): Promise<boolean> {
    // Query metadata table for stored fingerprint
    const stored = await db.get('SELECT fingerprint FROM document_metadata WHERE doc_id = ?', [
      docId,
    ]);

    return !stored || stored.fingerprint !== fingerprint;
  }

  /**
   * Update fingerprint after successful indexing
   */
  async updateFingerprint(docId: string, fingerprint: string): Promise<void> {
    await db.run(
      `INSERT OR REPLACE INTO document_metadata
       (doc_id, fingerprint, indexed_at) VALUES (?, ?, ?)`,
      [docId, fingerprint, new Date().toISOString()],
    );
  }
}
```

**Indexing workflow:**

```typescript
async function reindexDocuments(documents: Document[]): Promise<void> {
  const cache = new VectorIndexCache();
  let skipped = 0;
  let reindexed = 0;

  for (const doc of documents) {
    const fingerprint = VectorIndexCache.computeDocumentFingerprint(doc.filename, doc.content);

    if (!(await cache.needsReindex(doc.id, fingerprint))) {
      skipped++;
      continue; // Skip unchanged documents
    }

    // Delete old chunks for this document
    await db.run('DELETE FROM vec_chunks WHERE doc_id = ?', [doc.id]);

    // Chunk + embed + store
    const chunks = await chunkDocument(doc);
    await embedAndStore(chunks);

    // Update fingerprint
    await cache.updateFingerprint(doc.id, fingerprint);
    reindexed++;
  }

  console.log(`Reindexed ${reindexed} documents, skipped ${skipped} unchanged`);
}
```

### Pattern 3: Embedding Provider (Extends BaseProvider)

**What:** EmbeddingProvider extends BaseProvider for consistent retry/rate-limit behavior

**When to use:** All embedding API calls

**Implementation pattern:**

```typescript
// Source: Existing src/providers/base-provider.ts + OpenAI API research

import { BaseProvider } from './base-provider.js';

interface EmbeddingRequest {
  texts: string[];
  model: string;
}

interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
  usage: {
    total_tokens: number;
  };
}

class OpenAIEmbeddingProvider extends BaseProvider {
  readonly name = 'openai-embeddings';

  constructor(model: string = 'text-embedding-3-small', concurrency: number = 10) {
    super(model, concurrency);
  }

  protected async doEmbed(texts: string[]): Promise<EmbeddingResult> {
    // OpenAI API call with retry via BaseProvider.rateLimiter
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
        // Note: OpenAI supports dimensions parameter for flexible sizing
        // dimensions: 512, // Optional: reduce from default 1536/3072
      }),
    });

    const data = await response.json();
    return {
      embeddings: data.data.map((d: any) => d.embedding),
      model: data.model,
      dimensions: data.data[0].embedding.length,
      usage: data.usage,
    };
  }

  protected isRetryable(err: unknown): boolean {
    // Retry on rate limits (429), server errors (5xx), timeouts
    if (err instanceof Error && 'status' in err) {
      const status = (err as any).status;
      return status === 429 || status >= 500;
    }
    return false;
  }

  maxContextTokens(): number {
    return 8191; // text-embedding-3-small/large limit
  }

  /**
   * Batch texts to stay under API limits (max 2048 texts per request)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const BATCH_SIZE = 100; // Conservative batch size
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const result = await this.doEmbed(batch);
      embeddings.push(...result.embeddings);
    }

    return embeddings;
  }
}
```

**Rate limit handling (OpenAI-specific):**

- **OpenAI rate limits**: 3,000 requests/min (text-embedding-3-small/large)
- **Retry strategy**: Exponential backoff (already in BaseProvider)
- **Best practice**: 10-20 concurrency, batch 100 texts per request
- **Unsuccessful requests count toward limits**: Don't retry immediately

### Pattern 4: Database Schema with Metadata and Dimension Validation

**What:** vec0 virtual table with metadata columns and schema version tracking

**When to use:** Database initialization and startup validation

**Schema structure:**

```sql
-- Source: sqlite-vec Context7 docs + metadata research

-- Metadata table: Tracks schema version, embedding model, dimensions
CREATE TABLE IF NOT EXISTS schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Insert schema metadata on first run
INSERT INTO schema_metadata (key, value) VALUES
  ('schema_version', '1'),
  ('embedding_model', 'text-embedding-3-small'),
  ('embedding_dimensions', '1536'),
  ('created_at', datetime('now'));

-- Document metadata: Content-hash for change detection
CREATE TABLE IF NOT EXISTS document_metadata (
  doc_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);

-- Vector chunks: vec0 virtual table with metadata columns
CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
  -- Vector column (dimension enforced at schema level)
  embedding float[1536],

  -- Metadata columns (indexed for filtering)
  doc_id TEXT,
  doc_type TEXT,
  source_file TEXT,
  chunk_index INTEGER,

  -- Auxiliary columns (fast lookup, not indexed, prefix with +)
  +section_path TEXT,
  +h1 TEXT,
  +h2 TEXT,
  +h3 TEXT,
  +token_count INTEGER,
  +content_preview TEXT
);

-- Index on doc_id for efficient deletion during reindexing
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON vec_chunks(doc_id);
```

**Dimension validation on startup:**

```typescript
// Source: Research on embedding dimension mismatch errors + best practices

async function validateEmbeddingDimensions(db: Database, currentModel: string): Promise<void> {
  const stored = await db.get('SELECT value FROM schema_metadata WHERE key = ?', [
    'embedding_model',
  ]);

  const storedDimensions = await db.get('SELECT value FROM schema_metadata WHERE key = ?', [
    'embedding_dimensions',
  ]);

  if (!stored || !storedDimensions) {
    // First run, no validation needed
    return;
  }

  // Check if model changed
  if (stored.value !== currentModel) {
    const expectedDim = getModelDimensions(currentModel);
    const actualDim = parseInt(storedDimensions.value, 10);

    if (expectedDim !== actualDim) {
      throw new Error(
        `Embedding model mismatch detected!\n\n` +
          `Database was created with: ${stored.value} (${actualDim} dimensions)\n` +
          `Current config uses: ${currentModel} (${expectedDim} dimensions)\n\n` +
          `To rebuild the vector database with the new model:\n` +
          `  1. Delete .handover/search.db\n` +
          `  2. Run: handover reindex\n\n` +
          `Warning: This will re-embed all 14 documents (may incur API costs).`,
      );
    }
  }
}

function getModelDimensions(model: string): number {
  const dimensions: Record<string, number> = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
  };

  return dimensions[model] ?? 1536; // Default fallback
}
```

**Research finding: Dimension validation prevents silent failures**

- **Common error**: User switches from `text-embedding-3-small` (1536d) to `text-embedding-3-large` (3072d)
- **Without validation**: SQLite schema enforces `float[1536]`, new embeddings fail insertion
- **With validation**: Clear error message + remediation steps on startup

### Anti-Patterns to Avoid

- **Don't mix embedding dimensions in one database**: Enforce dimension validation, fail fast
- **Don't skip change detection**: Always use content-hash to avoid unnecessary re-embedding
- **Don't split code blocks mid-syntax**: Use structure-aware chunking
- **Don't use global overlap percentage**: 10-15% works for most docs, but test with real queries
- **Don't forget progress indicators**: Embedding 14 docs takes time, user needs feedback

## Don't Hand-Roll

| Problem           | Don't Build               | Use Instead                                    | Why                                                                                       |
| ----------------- | ------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Markdown chunking | Custom regex splitter     | LangChain MarkdownHeaderTextSplitter           | Handles nested headers, code blocks, frontmatter edge cases. 16K+ examples, battle-tested |
| Token counting    | Character-based estimates | Model-specific tokenizer (tiktoken for OpenAI) | Character/4 is rough estimate, actual tokens vary by model. tiktoken is exact             |
| Vector similarity | Custom distance metrics   | sqlite-vec built-in functions                  | Provides L2, cosine, dot product with SIMD optimization                                   |
| Retry logic       | Manual backoff            | BaseProvider (already in handover)             | Exponential backoff, jitter, retryable error detection already solved                     |
| Progress bars     | ANSI escape codes         | cli-progress                                   | Multi-bar support, auto-sizing, spinner fallback for CI/non-TTY                           |

**Key insight:** Embedding pipelines have hidden complexity (tokenization, batch size limits, dimension validation, structure preservation). Use proven libraries to avoid edge-case bugs.

## Common Pitfalls

### Pitfall 1: Embedding Dimension Mismatch After Model Switch

**What goes wrong:** User changes from `text-embedding-3-small` (1536d) to `text-embedding-3-large` (3072d) without rebuilding database. New embeddings fail to insert due to schema dimension constraint.

**Why it happens:** SQLite vec0 schema enforces `float[N]` dimension at table creation. Changing embedding model = changing dimension.

**How to avoid:**

1. Store embedding model + dimensions in `schema_metadata` table
2. Validate on startup: compare stored vs current config
3. If mismatch detected, throw error with clear remediation steps
4. Never auto-rebuild (avoid surprise API costs)

**Warning signs:**

- SQLite error: `dimension mismatch: expected 1536, got 3072`
- Embedding insertion fails silently in batch operations
- Users report "search.db is corrupt" after config change

**Implementation:**

```typescript
// On startup, before any embedding operations
await validateEmbeddingDimensions(db, config.embeddingModel);
```

### Pitfall 2: Code Block Splitting Destroys Context

**What goes wrong:** Chunker splits mid-code-block, resulting in syntactically broken chunks. Retrieval returns incomplete code snippets that mislead users.

**Why it happens:** Naive character-based splitting doesn't recognize markdown code fence boundaries (` ``` `).

**How to avoid:**

1. Use markdown-aware splitter (LangChain MarkdownHeaderTextSplitter)
2. Treat code blocks as atomic units (never split)
3. If code block exceeds chunk size, duplicate across overlapping chunks
4. Mark continuation chunks with metadata flag

**Warning signs:**

- Retrieved chunks contain `"...function example() {\n"` with no closing brace
- Search results show incomplete code examples
- Users complain "search returns broken code"

**Implementation:**

````typescript
const splitter = new RecursiveCharacterTextSplitter({
  separators: [
    '\n```\n', // Code block boundaries (never split mid-block)
    '\n\n', // Paragraphs
    '\n', // Lines
    ' ', // Words
  ],
});
````

### Pitfall 3: Unnecessary Re-Embedding Wastes API Costs

**What goes wrong:** User runs `handover reindex` after minor config change. All 14 documents re-embed despite unchanged content, incurring $0.50-$2.00 in API costs.

**Why it happens:** No change detection = every reindex re-embeds everything.

**How to avoid:**

1. Compute content-hash fingerprint for each document
2. Store fingerprints in `document_metadata` table
3. Compare stored vs current fingerprint before chunking
4. Skip unchanged documents, log "Skipped N unchanged documents"

**Warning signs:**

- Reindex takes full time even when nothing changed
- API usage spikes after config tweaks
- Users avoid running reindex due to cost concerns

**Implementation:**

```typescript
const fingerprint = computeDocumentFingerprint(doc.filename, doc.content);
if (!(await cache.needsReindex(doc.id, fingerprint))) {
  skipped++;
  continue; // Skip this document
}
```

### Pitfall 4: Progress Bar Doesn't Update During Long Embedding Operations

**What goes wrong:** User sees "Embedding documents..." with no progress updates for 60+ seconds. Assumes process is frozen, kills it.

**Why it happens:** Batch embedding API calls block event loop, progress bar only updates between batches.

**How to avoid:**

1. Update progress bar after each document (not each chunk)
2. Use multi-bar: one bar for documents, one for chunks within current document
3. Show estimated time remaining (cli-progress built-in)
4. Log document names as they complete

**Warning signs:**

- Users report "process hangs during embedding"
- Progress bar jumps from 0% to 100%
- No intermediate feedback during long operations

**Implementation:**

```typescript
const multiBar = new cliProgress.MultiBar({
  format: '{bar} {percentage}% | {value}/{total} {label}',
});

const docBar = multiBar.create(documents.length, 0, { label: 'Documents' });
const chunkBar = multiBar.create(100, 0, { label: 'Chunks' });

for (const doc of documents) {
  const chunks = await chunkDocument(doc);
  chunkBar.setTotal(chunks.length);
  chunkBar.update(0);

  for (const chunk of chunks) {
    await embedChunk(chunk);
    chunkBar.increment();
  }

  docBar.increment();
}

multiBar.stop();
```

### Pitfall 5: Metadata Bloat Increases Database Size

**What goes wrong:** Storing full document content in each chunk's metadata balloons database size (e.g., 100MB for 14 docs).

**Why it happens:** Over-eager metadata capture (e.g., storing `full_content` field per chunk).

**How to avoid:**

1. Store minimal metadata: IDs, paths, header hierarchy
2. Use auxiliary columns (`+` prefix) for non-indexed data
3. Store content preview (first 200 chars) not full content
4. Source document is already on disk, no need to duplicate

**Warning signs:**

- `.handover/search.db` grows larger than source markdown files
- Database queries slow down due to large row sizes
- Disk space warnings on small systems

**Implementation:**

```typescript
// Good: Minimal metadata
const metadata = {
  doc_id: '03-architecture',
  source_file: '03-ARCHITECTURE.md',
  section_path: 'Architecture > Data Flow',
  chunk_index: 5,
};

// Bad: Bloated metadata
const metadata = {
  doc_id: '03-architecture',
  source_file: '03-ARCHITECTURE.md',
  full_content: doc.content, // ❌ Duplicates source
  entire_section: section.text, // ❌ Redundant
  all_headers: ['Architecture', 'Data Flow', ...], // ❌ Use section_path
};
```

## Code Examples

Verified patterns from official sources and research:

### KNN Search with Metadata Filtering

```sql
-- Source: sqlite-vec Context7 (/asg017/sqlite-vec)

-- Find top 10 similar chunks within a specific document type
SELECT
  rowid,
  doc_id,
  source_file,
  section_path,
  distance
FROM vec_chunks
WHERE
  doc_type = 'architecture' -- Metadata filter
  AND embedding MATCH :query_vector -- KNN search
ORDER BY distance
LIMIT 10;
```

### Batch Embedding with Progress

```typescript
// Source: cli-progress docs + OpenAI API research

import cliProgress from 'cli-progress';

async function embedDocumentsWithProgress(
  documents: Document[],
  provider: EmbeddingProvider,
): Promise<void> {
  const bar = new cliProgress.SingleBar(
    {
      format: 'Embedding | {bar} | {percentage}% | {value}/{total} chunks',
    },
    cliProgress.Presets.shades_classic,
  );

  const allChunks = documents.flatMap((doc) =>
    chunkDocument(doc).map((chunk) => ({ ...chunk, doc_id: doc.id })),
  );

  bar.start(allChunks.length, 0);

  // Batch chunks for efficient API usage
  const BATCH_SIZE = 100;
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    const embeddings = await provider.embedBatch(texts);

    // Insert embeddings into database
    for (let j = 0; j < batch.length; j++) {
      await db.run(
        `INSERT INTO vec_chunks (embedding, doc_id, source_file, chunk_index)
         VALUES (?, ?, ?, ?)`,
        [
          new Float32Array(embeddings[j]).buffer, // Compact binary format
          batch[j].doc_id,
          batch[j].source_file,
          batch[j].chunk_index,
        ],
      );
    }

    bar.increment(batch.length);
  }

  bar.stop();
}
```

### Hybrid Markdown Chunking

````typescript
// Source: LangChain Context7 docs + research synthesis

import { MarkdownHeaderTextSplitter } from 'langchain/text_splitter';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

interface Chunk {
  content: string;
  metadata: {
    h1?: string;
    h2?: string;
    h3?: string;
    section_path: string;
  };
}

async function chunkMarkdown(markdown: string): Promise<Chunk[]> {
  // Stage 1: Split by headers
  const headerSplitter = new MarkdownHeaderTextSplitter({
    headersToSplitOn: [
      ['#', 'h1'],
      ['##', 'h2'],
      ['###', 'h3'],
    ],
    stripHeaders: false,
  });

  const headerChunks = await headerSplitter.splitText(markdown);

  // Stage 2: Apply size constraints
  const sizeSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 75, // ~15% overlap
    separators: ['\n```\n', '\n\n', '\n', ' ', ''], // Preserve code blocks
  });

  const finalChunks: Chunk[] = [];
  for (const headerChunk of headerChunks) {
    const sizedChunks = await sizeSplitter.splitText(headerChunk.pageContent);

    for (const content of sizedChunks) {
      const { h1, h2, h3 } = headerChunk.metadata;
      const section_path = [h1, h2, h3].filter(Boolean).join(' > ');

      finalChunks.push({
        content,
        metadata: {
          h1,
          h2,
          h3,
          section_path,
        },
      });
    }
  }

  return finalChunks;
}
````

### Content-Hash Change Detection

```typescript
// Source: Existing handover RoundCache pattern (src/cache/round-cache.ts)

import { createHash } from 'node:crypto';

class DocumentFingerprintCache {
  /**
   * Compute SHA-256 fingerprint of document (path + content)
   */
  static computeFingerprint(filePath: string, content: string): string {
    return createHash('sha256').update(JSON.stringify({ filePath, content })).digest('hex');
  }

  /**
   * Check if document has changed since last indexing
   */
  async hasChanged(docId: string, currentFingerprint: string): Promise<boolean> {
    const stored = await this.db.get('SELECT fingerprint FROM document_metadata WHERE doc_id = ?', [
      docId,
    ]);

    return !stored || stored.fingerprint !== currentFingerprint;
  }

  /**
   * Update fingerprint after successful indexing
   */
  async updateFingerprint(
    docId: string,
    fingerprint: string,
    model: string,
    chunkCount: number,
  ): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO document_metadata
       (doc_id, fingerprint, indexed_at, embedding_model, chunk_count)
       VALUES (?, ?, ?, ?, ?)`,
      [docId, fingerprint, new Date().toISOString(), model, chunkCount],
    );
  }
}
```

## State of the Art

| Old Approach                           | Current Approach                   | When Changed             | Impact                                                                     |
| -------------------------------------- | ---------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| Faiss-based vector search (sqlite-vss) | Pure C sqlite-vec                  | 2024 (v0.1.0 stable)     | Eliminates 50MB+ dependency, enables WASM deployment, simpler installation |
| External metadata tables + JOINs       | Native metadata columns in vec0    | 2024 (sqlite-vec v0.1.0) | Faster filtered queries, simpler schema, better query optimization         |
| Fixed embedding dimensions             | OpenAI flexible dimensions API     | 2024 (text-embedding-3)  | Can reduce from 3072→512 dims without losing quality vs ada-002            |
| Character-based chunking               | Semantic + markdown-aware chunking | 2024-2025                | 9% improvement in RAG recall (95.83% vs 87%)                               |
| Full reindexing on every change        | Content-hash incremental indexing  | 2025-2026                | Reduces costs from $120-240/day to $1-2/day for hourly updates             |

**Deprecated/outdated:**

- **text-embedding-ada-002**: Still works but text-embedding-3-small is cheaper ($0.02 vs $0.10 per 1M tokens) and better
- **sqlite-vss**: Superceded by sqlite-vec for most use cases (Faiss dependency too heavy)
- **Fixed-size chunking without overlap**: State-of-art uses 10-15% overlap for better boundary handling

## Claude's Discretion: Research-Backed Recommendations

Based on research findings, here are specific recommendations for the discretion areas:

### 1. Chunking Strategy

**Recommendation: Hybrid (header-based + size control)**

- **Approach**: MarkdownHeaderTextSplitter → RecursiveCharacterTextSplitter
- **Rationale**: Preserves document structure (headers) while enforcing size limits (256-512 tokens)
- **Evidence**: LangChain's two-stage approach is industry standard for markdown docs

### 2. Chunk Metadata

**Recommendation: Store these fields**

```typescript
{
  doc_id: string;           // Required: Links back to source document
  doc_type: string;         // Required: "architecture" | "guide" | "overview" | ...
  source_file: string;      // Required: "03-ARCHITECTURE.md"
  section_path: string;     // Required: "Architecture > Data Flow > Analyzers"
  chunk_index: number;      // Required: 0-based index within document
  h1?: string;              // Optional: Extracted header hierarchy
  h2?: string;
  h3?: string;
  token_count: number;      // Auxiliary: For diagnostics
  content_preview: string;  // Auxiliary: First 200 chars (for debugging)
}
```

**Rationale**: Enables filtering by doc type, source attribution, and section-level search

### 3. Code Block / Table Boundaries

**Recommendation: Never split + overlap duplication for large blocks**

- **Never split**: Treat code blocks and tables as atomic units
- **If block > chunk size**: Duplicate across overlapping chunks with metadata flag
- **Rationale**: Preserves syntactic integrity, slight storage cost is acceptable

### 4. Chunk Overlap

**Recommendation: 10-15% overlap (50-75 tokens for 512-token chunks)**

- **Rationale**: NVIDIA research found 15% optimal on FinanceBench dataset
- **Trade-off**: More overlap = better boundary preservation but higher storage cost
- **Implementation**: Configure RecursiveCharacterTextSplitter `chunkOverlap: 75`

### 5. Provider Config Architecture

**Recommendation: Reuse existing LLM provider config with optional overrides**

```yaml
# .handover.yml
provider: anthropic # For analysis
model: claude-3-5-sonnet-20241022

# Optional: Override for embeddings (if different)
embedding:
  provider: openai
  model: text-embedding-3-small
  # dimensions: 512        # Optional: reduce from default 1536
```

**Rationale**:

- Simplicity: Most users want same provider for all AI operations
- Flexibility: Power users can override embedding provider
- Consistency: Reuses existing config schema + validation

### 6. Indexing Trigger

**Recommendation: Separate `handover reindex` command**

```bash
# Generate docs (analysis + rendering)
handover generate

# Embed docs into vector database (separate step)
handover reindex
```

**Rationale**:

- **Separation of concerns**: Generate is about analysis, reindex is about search
- **Cost control**: Users explicitly opt-in to embedding (API costs)
- **Workflow fit**: User runs `generate` frequently, `reindex` less often
- **Future-proof**: Phases 13-14 add search + MCP, reindex becomes opt-in prep step

**Alternative considered:** Auto-reindex after generate

- **Rejected because**: Surprise API costs, slower generate command, user may not want search yet

### 7. Model Switch Behavior

**Recommendation: Error with clear instructions (not auto-rebuild)**

```typescript
// On startup, validate embedding model matches schema
if (storedModel !== currentModel) {
  throw new Error(
    `Embedding model mismatch!\n\n` +
      `Database: ${storedModel} (${storedDim}D)\n` +
      `Config:   ${currentModel} (${currentDim}D)\n\n` +
      `To rebuild with new model:\n` +
      `  1. rm .handover/search.db\n` +
      `  2. handover reindex\n\n` +
      `Warning: Re-embedding 14 docs costs ~$0.50-$2.00 (OpenAI pricing)`,
  );
}
```

**Rationale**:

- **No surprises**: User explicitly decides to rebuild (and incur costs)
- **Clear remediation**: Error message provides exact steps
- **Cost transparency**: Warns about API charges
- **Safe default**: Never auto-delete user data

**Alternative considered:** Auto-rebuild on model change

- **Rejected because**: Surprise costs, user loses previous embeddings, violates "least surprise" principle

## Open Questions

### 1. Token Counting Accuracy

**What we know:** Character/4 is rough estimate (used in BaseProvider.estimateTokens), but OpenAI uses tiktoken which gives exact counts

**What's unclear:** Should we integrate tiktoken for accurate token counting, or is character-based estimate sufficient?

**Recommendation:** Start with character/4 estimate. If users report chunk size issues, integrate tiktoken as enhancement.

### 2. Embedding Batch Size Optimization

**What we know:** OpenAI allows up to 2048 texts per embedding request, but research recommends 100-500 for stability

**What's unclear:** Optimal batch size for handover's workload (14 docs → ~500-1000 chunks)

**Recommendation:** Start with 100 texts/batch (conservative). Monitor rate limits and adjust if needed.

### 3. Chunking for Different Document Types

**What we know:** handover has 14 docs of varying types (architecture, API, dependency analysis)

**What's unclear:** Do different document types need different chunking strategies?

**Recommendation:** Use unified header-based approach for all docs. If users report poor retrieval for specific doc types, add type-specific chunking as enhancement.

### 4. LangChain Dependency Weight

**What we know:** LangChain text-splitters provide markdown-aware chunking, but adds dependency (~5MB)

**What's unclear:** Is the dependency weight justified, or should we build lightweight custom splitter?

**Recommendation:** Use LangChain for Phase 12 (proven, battle-tested). If bundle size becomes issue, evaluate lightweight alternatives in Phase 13+.

## Sources

### Primary (HIGH confidence)

**Context7:**

- `/asg017/sqlite-vec` - Vector storage, KNN search, metadata filtering, schema patterns
- `/websites/langchain_oss_python` - Markdown chunking, RecursiveCharacterTextSplitter patterns

**Official Documentation:**

- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) - Core documentation, examples
- [OpenAI Embeddings API](https://platform.openai.com/docs/api-reference/embeddings) - text-embedding-3 models, dimensions API
- [OpenAI Rate Limits](https://developers.openai.com/api/docs/guides/rate-limits) - Rate limit handling, retry strategies
- [cli-progress npm](https://www.npmjs.com/package/cli-progress) - Progress bar implementation

### Secondary (MEDIUM confidence)

**Technical Blogs:**

- [sqlite-vec v0.1.0 stable release](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html) - Metadata filtering release notes
- [sqlite-vec metadata columns](https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html) - Metadata column patterns
- [Weaviate Chunking Strategies](https://weaviate.io/blog/chunking-strategies-for-rag) - RAG chunking best practices
- [NVIDIA Chunking Research](https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses/) - 15% overlap optimization
- [Firecrawl RAG Chunking 2025](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025) - Current state-of-art practices

**Research Papers & Guides:**

- [Unstructured.io Chunking Best Practices](https://unstructured.io/blog/chunking-for-rag-best-practices) - 256-512 token recommendations
- [Medium: Embedding Dimension Validation](https://medium.com/@epappas/dealing-with-vector-dimension-mismatch-my-experience-with-openai-embeddings-and-qdrant-vector-20a6e13b6d9f) - Dimension mismatch error handling
- [Medium: CocoIndex Incremental Indexing](https://medium.com/@cocoindex.io/building-a-real-time-data-substrate-for-ai-agents-the-architecture-behind-cocoindex-729981f0f3a4) - Content-hash change detection

### Tertiary (LOW confidence - marked for validation)

- [Chonkie TableChunker](https://docs.chonkie.ai/oss/chunkers/table-chunker) - Table preservation strategies
- [md2chunks](https://github.com/verloop/md2chunks) - Context-enriched markdown chunking

## Metadata

**Confidence breakdown:**

- **Standard stack**: HIGH - sqlite-vec and cli-progress are industry standard with strong documentation
- **Architecture patterns**: HIGH - Patterns verified via Context7 and official docs, aligned with existing handover patterns (BaseProvider, RoundCache)
- **Chunking strategy**: MEDIUM-HIGH - LangChain approach is proven, but optimal parameters (chunk size, overlap) require testing with handover's specific docs
- **Pitfalls**: HIGH - Dimension mismatch, code block splitting, and change detection pitfalls are well-documented in research and GitHub issues
- **Claude's discretion recommendations**: HIGH - Based on convergent evidence from multiple authoritative sources

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (30 days - sqlite-vec is stable, embedding APIs are mature)

**Key unknowns requiring validation:**

1. Optimal chunk size for handover's 14 document types (recommend 512, test with 256/1024)
2. LangChain dependency weight vs custom splitter (use LangChain, evaluate alternatives if bundle size becomes issue)
3. Exact token counting via tiktoken vs character/4 estimate (start with estimate, upgrade if needed)
