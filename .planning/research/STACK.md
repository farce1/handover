# Stack Research

**Domain:** MCP Server with Semantic Search & Embeddings
**Researched:** 2026-02-20
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology                | Version            | Purpose                   | Why Recommended                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @modelcontextprotocol/sdk | ^1.26.0            | MCP server implementation | Official TypeScript SDK from Anthropic with full MCP spec support. v1.x is production-ready with v2 coming Q1 2026. Industry standard with 26,405 npm dependents. Provides built-in stdio/HTTP transports and tool/resource/prompt primitives.                         |
| better-sqlite3            | ^12.6.2            | SQLite database driver    | Fastest synchronous SQLite library for Node.js with full TypeScript support. Native performance (10,000+ ops/sec), zero config, single-file DB perfect for CLI tools. Compatible with Node 20/22 (tested in CI).                                                       |
| sqlite-vec                | ^0.1.7-alpha.2     | Vector search extension   | Pure C vector search extension that runs anywhere SQLite runs. Brute-force search competitive with FAISS/DuckDB. Zero dependencies, cross-platform (Linux/macOS/Windows), works with better-sqlite3. Declared stable/production-ready by maintainer despite alpha tag. |
| openai                    | ^6.22.0 (existing) | Embeddings generation     | Already integrated. Provides text-embedding-3-small ($0.02/1M tokens) and text-embedding-3-large ($0.13/1M tokens). Best cost/performance for embeddings. Supports batch API (50% cheaper, 50K embeddings/batch).                                                      |

### Supporting Libraries

| Library               | Version           | Purpose                                   | When to Use                                                                                                                                                                                     |
| --------------------- | ----------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @types/better-sqlite3 | ^7.6.13           | TypeScript types for better-sqlite3       | If types not bundled with better-sqlite3. Provides Database, Statement, and Transaction interfaces.                                                                                             |
| zod                   | ^4.3.6 (existing) | Runtime validation for embeddings/vectors | Validate embedding dimensions, vector metadata, search params. Already used throughout handover for domain validation.                                                                          |
| voyageai              | ^1.x (optional)   | Alternative embeddings provider           | Only if need domain-specific models (voyage-law-2, voyage-code-3). voyage-4-large outperforms OpenAI by 14% but costs $0.06/1M (3x OpenAI). Use for specialized use cases, not general-purpose. |

### Development Tools

| Tool                            | Purpose              | Notes                                                                                      |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| @modelcontextprotocol/inspector | MCP server debugging | Optional. Visual inspector for testing MCP tools/resources without building a full client. |
| vitest                          | Testing (existing)   | Extend existing test suite for vector search, embeddings, MCP handlers.                    |

## Installation

```bash
# Core additions (MCP + Vector Search)
npm install @modelcontextprotocol/sdk better-sqlite3 sqlite-vec

# TypeScript types
npm install -D @types/better-sqlite3

# Optional: Alternative embeddings (only if needed)
npm install voyageai
```

## Alternatives Considered

| Recommended               | Alternative                    | When to Use Alternative                                                                                                                                                    |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @modelcontextprotocol/sdk | Custom JSON-RPC implementation | Never. MCP SDK provides protocol compliance, type safety, transport handling, and future-proofing for v2.                                                                  |
| better-sqlite3            | node-sqlite3 (async)           | If need async/await API or multiple concurrent writers. better-sqlite3 is synchronous and 2-5x faster for CLI use cases with single writer.                                |
| sqlite-vec                | FAISS (via faiss-node)         | If need ANN algorithms (HNSW, IVF) for 1M+ vectors. sqlite-vec uses brute-force (perfect for <100K vectors). FAISS adds 50MB+ dependencies and platform-specific binaries. |
| sqlite-vec                | Pinecone/Weaviate/Qdrant       | If need distributed search, multi-tenancy, or cloud-hosted vector DB. Overkill for CLI tool. sqlite-vec keeps everything local and zero-config.                            |
| OpenAI embeddings         | Voyage AI embeddings           | If need domain-specific models (legal, code, finance) or 14% better accuracy justifies 3x cost. OpenAI sufficient for general documentation search.                        |
| OpenAI embeddings         | Local models (via Ollama)      | If privacy/offline required. 10-20x slower, lower quality. Not recommended unless hard requirement.                                                                        |

## What NOT to Use

| Avoid                              | Why                                                                                                                           | Use Instead                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| sqlite-vss (Faiss-based)           | Deprecated predecessor to sqlite-vec. Last updated 2023.                                                                      | sqlite-vec (active development, pure C, smaller footprint) |
| text-embedding-ada-002             | 5x more expensive ($0.0001 vs $0.00002 per 1K tokens) than text-embedding-3-small. Older model.                               | text-embedding-3-small or text-embedding-3-large           |
| MCP HTTP transport for CLI         | Adds network overhead, auth complexity, TLS requirements. stdio is 100x faster (10K vs 100-1K ops/sec) for single-client CLI. | stdio transport (default for local MCP servers)            |
| Custom vector similarity functions | Reinventing wheel. sqlite-vec provides optimized vec_distance_cosine, vec_distance_l2.                                        | sqlite-vec built-in distance functions                     |
| JSON columns for vectors           | Slow, no indexing, manual parsing.                                                                                            | BLOB columns with Float32Array + sqlite-vec functions      |

## Stack Patterns by Variant

**If using MCP server for remote/team access (not typical for CLI):**

- Use Streamable HTTP transport instead of stdio
- Add authentication layer (JWT or API keys)
- Bind to localhost only (127.0.0.1) to prevent DNS rebinding attacks
- Validate Origin header on all requests
- Deploy behind TLS in production

**If vector dataset grows beyond 100K embeddings:**

- Consider migrating from sqlite-vec (brute-force) to FAISS-based solution with ANN indexes
- Implement pagination in search results
- Add batch reindexing with progress tracking
- Monitor query latency (sqlite-vec optimal for <100K vectors, degrades linearly beyond)

**If need offline/air-gapped embeddings:**

- Add Ollama provider (already in handover)
- Use local models (nomic-embed-text, all-minilm)
- Expect 10-20x slower generation and lower quality
- Document tradeoffs for users

## Version Compatibility

| Package A                        | Compatible With                             | Notes                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @modelcontextprotocol/sdk@1.26.0 | Node.js 18+                                 | v2 SDK expected Q1 2026 will reorganize imports to @modelcontextprotocol/server and @modelcontextprotocol/node. Breaking changes expected but concepts identical.       |
| better-sqlite3@12.6.2            | Node.js 20.x, 22.x, 23.x, 24.x              | Prebuilt binaries for LTS versions. Requires node-gyp for custom builds.                                                                                                |
| sqlite-vec@0.1.7-alpha.2         | better-sqlite3 >=12                         | Auto-loads prebuilt extension when available. Platform-specific packages (sqlite-vec-darwin-x64, sqlite-vec-linux-x64, sqlite-vec-windows-x64) installed automatically. |
| sqlite-vec@0.1.7-alpha.2         | OpenAI embeddings (1536 or 3072 dimensions) | Use Float32Array, store as BLOB, query with vec_distance_cosine(). text-embedding-3-small defaults to 1536 dims, text-embedding-3-large to 3072 dims.                   |
| openai@6.22.0                    | Batch API                                   | Max 50K embeddings per batch, 2000 batches/hour, 200MB file limit, 24hr turnaround. 50% cost savings.                                                                   |

## Integration Points with Existing Stack

### Reuse Existing Infrastructure

| Existing Component   | Integration Point        | How to Leverage                                                                                                    |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Zod domain model     | Embedding/vector schemas | Define EmbeddingSchema, VectorSearchSchema, MCPToolSchema with Zod. Validate at runtime.                           |
| Content-hash caching | Embedding cache          | Key: contentHash(documentContent), Value: embedding vector. Avoid regenerating embeddings for unchanged documents. |
| 8 LLM providers      | Embeddings abstraction   | Extend providers/base.ts with getEmbedding() method. Only OpenAI/Azure OpenAI initially. Ollama for offline.       |
| Rate limiter         | OpenAI API calls         | Reuse existing rate-limiter.ts for embeddings API. Batch embeddings to minimize calls (up to 2048 inputs/request). |
| vitest test suite    | Vector search tests      | Test cosine similarity, vector serialization, MCP tool handlers. Add to existing 254 tests.                        |
| CLI architecture     | MCP server command       | Add `handover serve` command alongside `handover generate`. Use Commander.js (existing).                           |

### New Abstractions Needed

1. **Embeddings Service** (`src/embeddings/service.ts`)
   - Abstract embedding generation behind interface
   - Support OpenAI (primary), Voyage AI (optional), Ollama (offline)
   - Implement batch processing for bulk operations
   - Integrate with content-hash cache

2. **Vector Store** (`src/vector-store/sqlite-vec.ts`)
   - Initialize better-sqlite3 + sqlite-vec extension
   - Create/migrate vector tables with Float32Array columns
   - Implement insert/search/delete operations
   - Handle vector serialization/deserialization

3. **MCP Server** (`src/mcp/server.ts`)
   - Initialize MCP SDK with stdio transport
   - Register tools: searchDocumentation, askQuestion, reindexDocuments
   - Register resources: documentChunks, embeddingMetadata
   - Error handling with retry strategies

4. **Reindexing Strategy** (`src/embeddings/reindex.ts`)
   - Detect changed documents via content-hash comparison
   - Incremental reindexing (only changed docs)
   - Progress tracking for large codebases
   - Version metadata (embedding model, dimension, date)

## Migration Strategy from Existing handover

**Phase 1: Vector Storage Foundation**

- Add better-sqlite3 + sqlite-vec
- Create embeddings database schema
- Implement vector serialization utils
- Test with sample embeddings

**Phase 2: Embeddings Generation**

- Extend LLM provider interface with embeddings support
- Implement OpenAI embeddings via existing openai SDK
- Add content-hash-based caching
- Batch processing for bulk operations

**Phase 3: Semantic Search**

- Implement vector similarity search
- Add relevance scoring (cosine similarity)
- Integrate with existing document renderers
- Return context-aware results

**Phase 4: MCP Server**

- Initialize @modelcontextprotocol/sdk
- Expose tools: search, Q&A, reindex
- stdio transport for local CLI
- Error handling and retries

**Phase 5: Reindexing & Maintenance**

- Detect document changes via content-hash
- Incremental reindexing workflow
- CLI command: `handover reindex`
- Version tracking for model changes

## Performance Characteristics

| Operation                     | Expected Performance                         | Notes                                                                        |
| ----------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| Embedding generation (OpenAI) | 2-5 sec / 100 documents                      | Batch API: 50% cheaper, 24hr latency. Use for bulk. Real-time: Standard API. |
| Vector insert (sqlite-vec)    | 10,000+ inserts/sec                          | better-sqlite3 synchronous performance. Use transactions for bulk inserts.   |
| Vector search (sqlite-vec)    | <100ms for 10K vectors, <1s for 100K vectors | Linear scan (brute-force). Degrades linearly with dataset size.              |
| MCP tool call (stdio)         | <10ms overhead                               | stdio transport: 10K+ ops/sec. Negligible compared to LLM/embedding latency. |
| Content-hash cache lookup     | <1ms                                         | In-memory or SQLite cache. Prevents redundant embedding generation.          |

## Cost Projections

**Scenario: 1000-file codebase, 50K tokens of documentation**

| Operation                         | Model                    | Cost         | Notes                                            |
| --------------------------------- | ------------------------ | ------------ | ------------------------------------------------ |
| Initial indexing                  | text-embedding-3-small   | $0.001       | 50K tokens × $0.02/1M = $0.001                   |
| Initial indexing                  | text-embedding-3-large   | $0.0065      | 50K tokens × $0.13/1M = $0.0065                  |
| Incremental reindex (10% changed) | text-embedding-3-small   | $0.0001      | 5K tokens × $0.02/1M = $0.0001                   |
| 100 Q&A queries                   | gpt-4o-mini + embeddings | $0.002       | Embeddings negligible vs LLM inference cost      |
| Batch reindex (monthly)           | text-embedding-3-small   | $0.001/month | If using Batch API: 50% discount → $0.0005/month |

**Recommendation:** Use text-embedding-3-small for cost efficiency. Upgrade to text-embedding-3-large only if search quality insufficient (unlikely for code documentation).

## Known Limitations & Gotchas

1. **sqlite-vec is alpha-tagged but stable**
   - Maintainer declared v0.1.0 production-ready
   - Alpha tag reflects pre-1.0 semantic versioning
   - Used by Docker MCP Gateway (production)
   - Monitor for v1.0 release in 2026

2. **better-sqlite3 requires native compilation**
   - Prebuilt binaries for common platforms
   - May need node-gyp for exotic platforms
   - CI already tests Node 20/22 (covered)

3. **MCP SDK v2 breaking changes coming Q1 2026**
   - v1.x will receive 6 months support after v2 ships
   - Import paths change: `@modelcontextprotocol/sdk` → `@modelcontextprotocol/server`
   - Concepts remain identical (easy migration)
   - Pin to ^1.26.0, plan migration in Q2 2026

4. **Embedding model changes require full reindex**
   - Vector spaces incompatible across models
   - Store embedding metadata (model, version, dimensions) in DB
   - Detect mismatches on startup
   - Voyage AI's shared embedding space (v4) solves this but costs 3x

5. **OpenAI rate limits for embeddings**
   - Tier-dependent: Free tier extremely limited
   - Use Batch API for bulk operations (50K/batch, 24hr turnaround)
   - Implement exponential backoff (existing rate-limiter.ts)
   - Consider caching aggressively

6. **Float32Array precision tradeoffs**
   - sqlite-vec supports float32, int8, bit vectors
   - float32: 4 bytes/dimension, high precision
   - int8: 1 byte/dimension, 4x smaller, minimal quality loss for large dimensions
   - Use float32 for <2048 dims, consider int8 for 3072+ dims if storage critical

## Sources

### HIGH Confidence (Official Docs & Releases)

- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — Version 1.26.0, v2 roadmap
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) — Official implementation
- [Model Context Protocol Docs](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — Transport specifications
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) — Version 12.6.2, Node 20/22 compatibility
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — v0.1.0 stable release announcement
- [sqlite-vec JavaScript docs](https://alexgarcia.xyz/sqlite-vec/js.html) — Node.js integration guide
- [OpenAI Embeddings API](https://platform.openai.com/docs/api-reference/embeddings) — Pricing, models, batch API
- [OpenAI Batch API](https://developers.openai.com/api/docs/guides/batch/) — 50K limit, 50% discount

### MEDIUM Confidence (Community Sources + Multiple Corroborations)

- [MCP Transport Comparison](https://medium.com/@kumaran.isk/dual-transport-mcp-servers-stdio-vs-http-explained-bd8865671e1f) — stdio vs HTTP performance
- [sqlite-vec Tutorial](https://stephencollins.tech/posts/how-to-use-sqlite-vec-to-store-and-query-vector-embeddings) — TypeScript implementation patterns
- [Voyage AI vs OpenAI Comparison](https://elephas.app/blog/best-embedding-models) — Performance benchmarks, cost analysis
- [MCP Error Handling Guide](https://mcpcat.io/guides/error-handling-custom-mcp-servers/) — Retry strategies, circuit breakers
- [Document Reindexing Strategies](https://blog.gdeltproject.org/append-based-keyword-search-versus-rebuild-from-scratch-embedding-databases-technical-methodological-challenges/) — Incremental vs full reindex tradeoffs

### LOW Confidence (Training Data)

- None. All recommendations verified against official sources or multiple corroborating sources from 2026.

---

_Stack research for: MCP Server with Semantic Search & Embeddings_
_Researched: 2026-02-20_
