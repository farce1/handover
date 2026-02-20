# Architecture Research: MCP Server + Semantic Search Integration

**Domain:** TypeScript CLI with MCP server, semantic search, embeddings, and vector storage
**Researched:** 2026-02-20
**Confidence:** MEDIUM (Official MCP docs + WebSearch verified sources)

## Executive Summary

This milestone adds four new capabilities to the existing handover CLI: (1) MCP server exposing documentation via tools/resources, (2) semantic search over generated docs, (3) embedding generation for vector similarity, and (4) SQLite-based vector storage. The architecture integrates cleanly with handover's existing DAG orchestrator, parallel analyzers, and document rendering pipeline by treating these as NEW data flows that consume existing outputs rather than modifying core analysis logic.

**Integration pattern:** Additive, not invasive. New components read from `.handover/` output directory and cache, expose via MCP protocol, and store in separate `.handover/search.db` vector database.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXISTING HANDOVER CLI                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │ Static  │  │ AI      │  │ Render  │  │ Cache   │                         │
│  │Analyzers│→ │ Rounds  │→ │Pipeline │→ │ (.md)   │                         │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘                         │
│       ↓            ↓            ↓            ↓                                │
│  .handover/cache/  .handover/cache/rounds/  .handover/*.md                   │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓ (reads)
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEW COMPONENTS (THIS MILESTONE)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      MCP Server Layer                                 │   │
│  │  ┌───────────┐  ┌────────────┐  ┌─────────────┐                     │   │
│  │  │ Tools     │  │ Resources  │  │ Prompts     │                     │   │
│  │  │ (search)  │  │ (docs)     │  │ (templates) │                     │   │
│  │  └─────┬─────┘  └──────┬─────┘  └──────┬──────┘                     │   │
│  └────────┼────────────────┼────────────────┼────────────────────────────┘   │
│           │                │                │                                │
│           ↓                ↓                ↓                                │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │              Search & Indexing Layer                           │          │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐     │          │
│  │  │ Document     │  │ Embedding     │  │ Vector Query   │     │          │
│  │  │ Indexer      │→ │ Generator     │→ │ Engine         │     │          │
│  │  │ (chunking)   │  │ (OpenAI API)  │  │ (cosine sim)   │     │          │
│  │  └──────────────┘  └───────────────┘  └────────────────┘     │          │
│  └───────────────────────────────────────────────────────────────┘          │
│           ↓                                         ↓                        │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │                  Storage Layer (SQLite)                      │            │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │            │
│  │  │ documents    │  │ chunks       │  │ embeddings   │      │            │
│  │  │ (metadata)   │  │ (text+meta)  │  │ (float32[])  │      │            │
│  │  └──────────────┘  └──────────────┘  └──────────────┘      │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                          .handover/search.db                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component               | Responsibility                                                                             | Integration Point                                            |
| ----------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| **MCP Server**          | Expose handover docs via stdio/HTTP transport, register tools/resources/prompts            | NEW: standalone entry point (`src/mcp/server.ts`)            |
| **Document Indexer**    | Parse `.handover/*.md`, chunk text (512 tokens, recursive character split), detect changes | Reads from existing render output directory                  |
| **Embedding Generator** | Call OpenAI `text-embedding-3-small` API, batch requests, handle rate limits               | NEW: wraps existing `BaseProvider` retry/rate-limit patterns |
| **Vector Storage**      | SQLite with `sqlite-vec` extension, CRUD operations on chunks/embeddings                   | NEW: `src/search/vector-store.ts`                            |
| **Query Engine**        | Cosine similarity search, rerank with metadata filters, hybrid text + vector               | NEW: `src/search/query-engine.ts`                            |
| **Reindex Manager**     | Incremental indexing based on file content hash, trigger on `handover generate` completion | Hooks into existing `AnalysisCache` hash pattern             |

## Recommended Project Structure

```
src/
├── mcp/                    # MCP server implementation
│   ├── server.ts           # Server entry point, transport setup
│   ├── tools.ts            # Tool registrations (semantic_search, etc.)
│   ├── resources.ts        # Resource registrations (document access)
│   ├── prompts.ts          # Prompt templates for handover workflows
│   └── types.ts            # MCP-specific TypeScript types
├── search/                 # Semantic search engine
│   ├── indexer.ts          # Document chunking and indexing
│   ├── embeddings.ts       # OpenAI embedding generation
│   ├── vector-store.ts     # SQLite vector database operations
│   ├── query-engine.ts     # Search orchestration and ranking
│   └── types.ts            # Search-specific types
├── cli/                    # Existing CLI (MODIFIED)
│   ├── index.ts            # Add `handover serve` command
│   └── generate.ts         # Add post-render indexing hook
├── providers/              # Existing (MINOR MODIFICATION)
│   └── base-provider.ts    # Extend for embedding API pattern
├── cache/                  # Existing (REUSE)
│   └── round-cache.ts      # Pattern for incremental indexing hash
└── config/                 # Existing (MODIFIED)
    └── schema.ts           # Add MCP + search config fields
```

### Structure Rationale

- **`src/mcp/`**: Isolated from core CLI logic — MCP server can run independently via `handover serve` or stdio transport.
- **`src/search/`**: Clean separation of search concerns — indexer, embeddings, storage, and query are independent modules that compose at the engine level.
- **Minimal existing code changes**: Only CLI entry point, config schema, and optional post-render hook touched.

## Architectural Patterns

### Pattern 1: MCP Server as Separate Entry Point

**What:** MCP server runs as a standalone process (stdio or HTTP transport), separate from the `handover generate` CLI pipeline. The server reads from the `.handover/` output directory and vector database — it does NOT trigger analysis.

**When to use:** When exposing handover docs to LLM clients (Claude Desktop, VS Code, custom agents). The server is a read-only consumer of handover's output.

**Trade-offs:**

- **PRO**: Clean separation — MCP server crashes don't affect CLI, and CLI doesn't need MCP dependencies loaded.
- **PRO**: Supports both local (stdio) and remote (HTTP) deployment without architectural changes.
- **CON**: Requires IPC or shared filesystem to access handover output (acceptable — `.handover/` is already shared state).

**Example:**

```typescript
// src/mcp/server.ts
import { Server } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

const server = new Server(
  {
    name: 'handover-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  },
);

// Register semantic search tool
server.tool(
  'semantic_search',
  {
    description: 'Search handover documentation using semantic similarity',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
  },
  async ({ query, limit }) => {
    const engine = new QueryEngine(vectorStore);
    const results = await engine.search(query, limit);
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  },
);

// Register document resource
server.resource('handover://docs/{docId}', async ({ docId }) => {
  const doc = await readDocFromDisk(docId); // .handover/*.md
  return { contents: [{ uri: `handover://docs/${docId}`, text: doc }] };
});

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Pattern 2: Incremental Indexing with Content Hash

**What:** Reuse handover's existing `AnalysisCache` pattern to detect changed documents. Only reindex chunks from modified `.md` files. Hash each document's content (SHA-256), compare to stored hash, skip unchanged files.

**When to use:** After every `handover generate` completion. Triggered automatically in render step's `onComplete` hook.

**Trade-offs:**

- **PRO**: Avoids expensive embedding API calls for unchanged docs (embeddings cost $0.02/1M tokens — full reindex of 14 docs with 50 chunks each = ~$0.001, but 100 runs = $0.10).
- **PRO**: Aligns with existing handover incremental patterns (analyzer cache, round cache).
- **CON**: Requires tracking document hashes in `search.db` (adds `documents` table with `content_hash` column).

**Example:**

```typescript
// src/search/indexer.ts
export class DocumentIndexer {
  async indexDocuments(docsDir: string): Promise<IndexResult> {
    const files = await glob('*.md', { cwd: docsDir });
    const changedFiles: string[] = [];

    for (const file of files) {
      const content = await readFile(join(docsDir, file), 'utf-8');
      const hash = createHash('sha256').update(content).digest('hex');
      const stored = await this.store.getDocHash(file);

      if (hash !== stored) {
        changedFiles.push(file);
        await this.reindexDocument(file, content, hash);
      }
    }

    return { total: files.length, changed: changedFiles.length };
  }

  private async reindexDocument(file: string, content: string, hash: string) {
    // Delete old chunks for this doc
    await this.store.deleteChunks(file);

    // Chunk with recursive character split (512 tokens, 10% overlap)
    const chunks = this.chunker.chunk(content, { maxTokens: 512, overlap: 0.1 });

    // Generate embeddings (batched)
    const embeddings = await this.embedder.embed(chunks.map((c) => c.text));

    // Store chunks + embeddings
    await this.store.insertChunks(file, chunks, embeddings);
    await this.store.updateDocHash(file, hash);
  }
}
```

### Pattern 3: Embedding Provider Extending BaseProvider Pattern

**What:** Create `EmbeddingProvider` class that extends handover's existing `BaseProvider` abstract class. Reuses retry logic, rate limiting, and token estimation. Implements `doComplete` for OpenAI embeddings API instead of chat completions.

**When to use:** For all embedding generation (initial indexing and query-time embedding).

**Trade-offs:**

- **PRO**: Consistent error handling, retry backoff, and rate limiting across all LLM calls.
- **PRO**: Minimal new code — reuse existing provider infrastructure.
- **CON**: Slight API mismatch (embeddings don't have "completion" semantics), but acceptable because the retry/rate-limit patterns are the same.

**Example:**

```typescript
// src/search/embeddings.ts
import { BaseProvider } from '../providers/base-provider.js';
import OpenAI from 'openai';

export class EmbeddingProvider extends BaseProvider {
  readonly name = 'openai-embeddings';
  private client: OpenAI;

  constructor(apiKey: string, concurrency = 4) {
    super('text-embedding-3-small', concurrency);
    this.client = new OpenAI({ apiKey });
  }

  protected async doComplete<T>(
    request: { text: string | string[] },
    schema: unknown, // Unused for embeddings
    onToken?: (count: number) => void,
  ): Promise<{ data: T }> {
    const texts = Array.isArray(request.text) ? request.text : [request.text];

    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });

    // Report token usage
    onToken?.(response.usage.total_tokens);

    const embeddings = response.data.map((d) => d.embedding);
    return { data: embeddings as T };
  }

  protected isRetryable(err: unknown): boolean {
    // Rate limit or server errors
    return err instanceof OpenAI.APIError && (err.status === 429 || err.status >= 500);
  }

  maxContextTokens(): number {
    return 8191; // text-embedding-3-small context window
  }
}
```

### Pattern 4: SQLite Vector Storage with sqlite-vec

**What:** Use `better-sqlite3` with `sqlite-vec` extension for vector storage. Store documents, chunks, and embeddings in normalized tables. Use `vec0` virtual table for cosine similarity queries.

**When to use:** For all vector operations (insert, search, delete).

**Trade-offs:**

- **PRO**: No external dependencies — SQLite runs in-process, no separate vector DB service.
- **PRO**: `sqlite-vec` is pure C with no dependencies, runs anywhere Node runs.
- **PRO**: ACID transactions, WAL mode for write concurrency.
- **CON**: Not suitable for >1M vectors (HNSW indexes degrade), but handover docs are <10K chunks maximum.

**Example:**

```typescript
// src/search/vector-store.ts
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

export class VectorStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    sqliteVec.load(this.db);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        content_hash TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY,
        doc_id INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        metadata TEXT, -- JSON
        FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding FLOAT[1536]
      );
    `);
  }

  async search(queryEmbedding: Float32Array, limit = 5): Promise<SearchResult[]> {
    const stmt = this.db.prepare(`
      SELECT
        c.id, c.text, c.metadata, d.filename,
        vec_distance_cosine(v.embedding, ?) as distance
      FROM vec_chunks v
      JOIN chunks c ON c.id = v.chunk_id
      JOIN documents d ON d.id = c.doc_id
      ORDER BY distance ASC
      LIMIT ?
    `);

    return stmt.all(queryEmbedding.buffer, limit) as SearchResult[];
  }
}
```

## Data Flow

### Indexing Flow (Post-Render)

```
[handover generate completes]
    ↓
[Render step onComplete hook]
    ↓
[DocumentIndexer.indexDocuments()]
    ↓ (for each changed .md file)
[ChunkDocument (512 tokens, recursive split)]
    ↓
[EmbeddingProvider.embed(chunks)]
    ↓ (batched OpenAI API calls)
[VectorStore.insertChunks(embeddings)]
    ↓
[Update document content hash]
    ↓
[search.db updated]
```

### Query Flow (MCP Tool Call)

```
[LLM client calls semantic_search tool]
    ↓
[MCP server receives tool call]
    ↓
[QueryEngine.search(query)]
    ↓
[EmbeddingProvider.embed(query)] → [1536-dim vector]
    ↓
[VectorStore.search(queryEmbedding)]
    ↓ (SQLite cosine similarity)
[Top-k chunks retrieved]
    ↓
[Rerank with metadata filters] (optional)
    ↓
[Return chunks + document names to LLM]
```

### Resource Access Flow (MCP Resource)

```
[LLM client requests handover://docs/{docId}]
    ↓
[MCP server resource handler]
    ↓
[Read .handover/{docId}.md from disk]
    ↓
[Return full document content]
```

## Integration Points

### New Components

| Component          | Location                     | Purpose                                              |
| ------------------ | ---------------------------- | ---------------------------------------------------- |
| MCP Server         | `src/mcp/server.ts`          | Stdio/HTTP server exposing handover via MCP protocol |
| MCP Tools          | `src/mcp/tools.ts`           | `semantic_search`, `list_documents`, etc.            |
| MCP Resources      | `src/mcp/resources.ts`       | `handover://docs/{id}` resource URIs                 |
| MCP Prompts        | `src/mcp/prompts.ts`         | Prompt templates for common workflows                |
| Document Indexer   | `src/search/indexer.ts`      | Chunking, change detection, orchestration            |
| Embedding Provider | `src/search/embeddings.ts`   | OpenAI text-embedding-3-small wrapper                |
| Vector Store       | `src/search/vector-store.ts` | SQLite + sqlite-vec CRUD operations                  |
| Query Engine       | `src/search/query-engine.ts` | Search orchestration, ranking, filters               |
| Chunker            | `src/search/chunker.ts`      | Recursive character split with overlap               |

### Modified Existing Components

| Component        | File                             | Modification                                     |
| ---------------- | -------------------------------- | ------------------------------------------------ |
| CLI Entry        | `src/cli/index.ts`               | Add `handover serve` command for MCP server      |
| Generate Command | `src/cli/generate.ts`            | Add post-render indexing hook (lines ~950-960)   |
| Config Schema    | `src/config/schema.ts`           | Add `mcp` and `search` config objects            |
| BaseProvider     | `src/providers/base-provider.ts` | NONE (EmbeddingProvider extends without changes) |

### External Dependencies

| Dependency                     | Purpose                 | Integration                                            |
| ------------------------------ | ----------------------- | ------------------------------------------------------ |
| `@modelcontextprotocol/server` | MCP server SDK          | TypeScript SDK for stdio/HTTP transport                |
| `sqlite-vec`                   | Vector search extension | Load into better-sqlite3 via `sqliteVec.load(db)`      |
| OpenAI API                     | Embedding generation    | Call `embeddings.create()` with text-embedding-3-small |

## Configuration Schema Extensions

```typescript
// src/config/schema.ts (additions)
export const HandoverConfigSchema = z.object({
  // ... existing fields ...
  mcp: z
    .object({
      enabled: z.boolean().default(false),
      transport: z.enum(['stdio', 'http']).default('stdio'),
      httpPort: z.number().int().positive().default(3000),
    })
    .default({ enabled: false, transport: 'stdio', httpPort: 3000 }),

  search: z
    .object({
      enabled: z.boolean().default(true),
      embeddingModel: z.string().default('text-embedding-3-small'),
      chunkSize: z.number().int().positive().default(512),
      chunkOverlap: z.number().min(0).max(0.5).default(0.1),
      maxResults: z.number().int().positive().default(5),
    })
    .default({
      enabled: true,
      embeddingModel: 'text-embedding-3-small',
      chunkSize: 512,
      chunkOverlap: 0.1,
      maxResults: 5,
    }),
});
```

## Anti-Patterns

### Anti-Pattern 1: Modifying Core DAG Steps for Indexing

**What people might do:** Add vector indexing as a DAG step that depends on the render step.

**Why it's wrong:** DAG orchestrator is designed for analysis pipeline, not post-processing side effects. Adding indexing to the DAG creates coupling and makes the MCP server dependent on running `handover generate`.

**Do this instead:** Trigger indexing in the render step's completion callback or as a separate post-generate hook. Keep indexing as an optional, decoupled operation.

### Anti-Pattern 2: Embedding All Documents on Every Generate

**What people might do:** Regenerate embeddings for all documents on every `handover generate` run.

**Why it's wrong:** Wastes API quota and money. Embeddings API costs $0.02 per 1M tokens. Full reindex of 14 docs (~50K tokens) costs ~$0.001, but 100 runs = $0.10. With incremental indexing, only changed docs are reindexed (typically 1-2 docs per run).

**Do this instead:** Use content-hash-based change detection (SHA-256 of document content). Only reindex chunks from modified files. Store document hashes in `search.db`.

### Anti-Pattern 3: Tight Coupling Between MCP Server and CLI

**What people might do:** Embed MCP server logic directly in `src/cli/generate.ts` or share mutable state between CLI and server.

**Why it's wrong:** MCP server should run independently (stdio transport via Claude Desktop or HTTP for remote access). Coupling to CLI makes deployment complex and prevents running the server without triggering analysis.

**Do this instead:** MCP server reads from `.handover/` directory and `search.db` (shared filesystem). Server is a stateless consumer of handover's output. Use separate entry point (`src/mcp/server.ts`).

### Anti-Pattern 4: Custom Vector Search Implementation

**What people might do:** Implement cosine similarity search in TypeScript with in-memory vectors.

**Why it's wrong:** Poor performance for >1K vectors, high memory usage, no persistence. Reinvents the wheel when SQLite extensions exist.

**Do this instead:** Use `sqlite-vec` extension with `better-sqlite3`. Provides SIMD-accelerated cosine similarity, on-disk persistence, and ACID transactions. Runs anywhere SQLite runs (Linux/macOS/Windows, WASM).

## Scaling Considerations

| Scale                      | Architecture Adjustments                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 0-100 docs, <5K chunks     | Current architecture sufficient. SQLite handles 10K vectors easily. Indexing takes <5s.                                  |
| 100-1K docs, 5K-50K chunks | Add HNSW indexing (sqlite-vec supports). Query latency stays <100ms. Consider batch embedding (2048 texts per API call). |
| 1K+ docs, 50K+ chunks      | Migrate to dedicated vector DB (Pinecone, Weaviate). SQLite vec0 virtual table degrades with >100K vectors.              |

### Scaling Priorities

1. **First bottleneck:** Embedding API rate limits. Solution: Batch requests (max 2048 texts per call), use `RateLimiter` from `BaseProvider`, add retry backoff.
2. **Second bottleneck:** SQLite write throughput during indexing. Solution: Use transactions (batch 100 inserts per transaction), enable WAL mode (`pragma journal_mode = WAL`).
3. **Third bottleneck:** Query latency for >10K chunks. Solution: Add HNSW indexing via `sqlite-vec`'s `vss0` table (approximate nearest neighbor), or migrate to Pinecone/Weaviate.

## Build Order (Suggested Phase Structure)

### Phase 1: Vector Storage + Indexing (Foundation)

**Goal:** Get chunks stored in SQLite with embeddings, no MCP server yet.

**Components:**

1. `VectorStore` (SQLite + sqlite-vec schema)
2. `DocumentIndexer` (chunking + change detection)
3. `EmbeddingProvider` (OpenAI API wrapper)
4. Post-render indexing hook in `generate.ts`
5. Config schema extensions

**Deliverable:** Running `handover generate` automatically indexes changed docs into `search.db`.

**Rationale:** Establishes data layer before building query/MCP layers. Allows testing chunking and embedding quality independently.

### Phase 2: Query Engine + CLI Search

**Goal:** Semantic search works via CLI command (`handover search "query"`).

**Components:**

1. `QueryEngine` (search orchestration)
2. CLI `search` command in `src/cli/index.ts`
3. Result formatting/display

**Deliverable:** `handover search "authentication flow"` returns relevant chunks from docs.

**Rationale:** Validates search quality before exposing via MCP. Easier to debug/iterate without MCP protocol overhead.

### Phase 3: MCP Server (Tools + Resources)

**Goal:** MCP server exposes handover docs to LLM clients.

**Components:**

1. `src/mcp/server.ts` (stdio/HTTP transport)
2. `src/mcp/tools.ts` (`semantic_search` tool)
3. `src/mcp/resources.ts` (document access)
4. CLI `serve` command

**Deliverable:** Claude Desktop can connect to handover MCP server, search docs, and read full documents.

**Rationale:** Builds on proven search engine from Phase 2. MCP layer is thin adapter over existing functionality.

### Phase 4: Prompts + Advanced Features

**Goal:** Prompt templates for common workflows, hybrid search, metadata filters.

**Components:**

1. `src/mcp/prompts.ts` (prompt templates)
2. Hybrid search (text + vector)
3. Metadata filters (by document type, section)
4. Reindexing CLI command (`handover reindex`)

**Deliverable:** Full-featured MCP server with rich query capabilities.

**Rationale:** Deferred nice-to-haves until core functionality is stable.

## Sources

### HIGH Confidence (Official Documentation)

- [MCP Architecture Overview](https://modelcontextprotocol.io/docs/learn/architecture) - Official MCP specification
- [TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) - Official SDK repository
- [OpenAI Embeddings API](https://platform.openai.com/docs/api-reference/embeddings) - Official API reference
- [sqlite-vec Extension](https://github.com/asg017/sqlite-vec) - Official vector search extension

### MEDIUM Confidence (WebSearch Verified)

- [MCP Best Practices](https://modelcontextprotocol.info/docs/best-practices/) - Community-maintained guide
- [Chunking Strategies for RAG](https://weaviate.io/blog/chunking-strategies-for-rag) - Weaviate research
- [2026 RAG Performance Paradox](https://ragaboutit.com/the-2026-rag-performance-paradox-why-simpler-chunking-strategies-are-outperforming-complex-ai-driven-methods/) - 2026 performance findings
- [Vector Embeddings Guide](https://www.meilisearch.com/blog/what-are-vector-embeddings) - Comprehensive 2026 overview
- [Incremental Indexing Patterns](https://milvus.io/ai-quick-reference/how-do-you-handle-incremental-updates-in-a-vector-database) - Milvus documentation
- [SQLite Vector Search Integration](https://stephencollins.tech/posts/how-to-use-sqLite-to-store-and-query-vector-embeddings) - Practical TypeScript guide

### LOW Confidence (Single Source)

- [Best Embedding Models 2026](https://elephas.app/blog/best-embedding-models) - Model comparison guide (not verified with OpenAI official docs)

---

_Architecture research for: MCP server and semantic search integration_
_Researched: 2026-02-20_
