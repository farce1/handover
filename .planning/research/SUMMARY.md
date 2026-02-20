# Project Research Summary

**Project:** MCP Server with Semantic Search & Embeddings for handover CLI
**Domain:** TypeScript CLI with MCP server, semantic search, vector embeddings, and SQLite vector storage
**Researched:** 2026-02-20
**Confidence:** HIGH

## Executive Summary

This milestone extends the existing handover CLI with four new capabilities: (1) MCP server exposing documentation via Model Context Protocol, (2) semantic search over generated docs using embeddings, (3) vector similarity search with SQLite-based storage, and (4) LLM-powered Q&A using RAG patterns. The recommended approach treats these as additive layers that consume handover's existing outputs rather than modifying core analysis logic.

The architecture is well-proven: Use @modelcontextprotocol/sdk for MCP server implementation (26,405+ npm dependents, production-ready), better-sqlite3 with sqlite-vec extension for vector storage (zero-config, portable), and OpenAI text-embedding-3-small for embeddings ($0.02/1M tokens, industry standard). The integration pattern is clean - new components read from `.handover/` output directory and cache, expose via MCP protocol, and store vectors in separate `.handover/search.db` database. This keeps the MCP server as a stateless consumer of handover's output with no coupling to core DAG orchestration.

The primary risks are (1) stdout corruption from console.log() breaking stdio transport, (2) embedding dimension mismatches causing search failures after model changes, and (3) naive chunk splitting losing critical context. All are preventable with proper architecture: enforce stderr-only logging, store embedding metadata in schema with startup validation, and implement markdown-aware chunking that respects code blocks and headers. Following the recommended phased approach (storage foundation, then search engine, then MCP layer, then advanced features) mitigates integration complexity and allows quality validation at each step.

## Key Findings

### Recommended Stack

The stack builds on handover's existing infrastructure with three core additions: @modelcontextprotocol/sdk (official TypeScript SDK with full MCP spec support), better-sqlite3 + sqlite-vec (fastest synchronous SQLite with pure C vector extension), and OpenAI embeddings API (already integrated via existing openai dependency). These choices align with handover's single-binary, zero-config ethos - everything runs in-process with no separate services required.

**Core technologies:**

- **@modelcontextprotocol/sdk ^1.26.0**: MCP server implementation — Official SDK from Anthropic with built-in stdio/HTTP transports and tool/resource/prompt primitives. Industry standard with production-ready v1.x.
- **better-sqlite3 ^12.6.2**: SQLite database driver — Fastest synchronous SQLite library for Node.js with 10,000+ ops/sec performance. Single-file DB perfect for CLI tools. Compatible with Node 20/22.
- **sqlite-vec ^0.1.7-alpha.2**: Vector search extension — Pure C vector search that runs anywhere SQLite runs. Brute-force search competitive with FAISS/DuckDB for <100K vectors. Declared stable/production-ready despite alpha tag.
- **OpenAI text-embedding-3-small**: Embeddings generation — Already integrated via existing openai@6.22.0 dependency. Best cost/performance at $0.02/1M tokens with 1536 dimensions. Supports batch API for 50% cost savings.

**Critical version compatibility:**

- MCP SDK v2 breaking changes expected Q1 2026 (6 months support for v1.x after ship)
- better-sqlite3 requires Node.js v20 or v22 (v22/v24 have 57% performance regression - recommend locking to v20)
- sqlite-vec auto-loads platform-specific prebuilt extensions (darwin-x64, linux-x64, windows-x64)

**Reuse existing infrastructure:**

- Zod schemas for embeddings/vector validation
- Content-hash caching to avoid redundant embedding generation
- BaseProvider pattern extended for embedding API with retry/rate-limit logic
- RateLimiter from existing providers for OpenAI API calls
- vitest test suite extended for vector search tests

### Expected Features

Research shows clear feature tiers for MCP servers with semantic search. Table stakes are MCP stdio transport, resources for generated docs, semantic search via embeddings, sqlite-vec storage, document chunking, and K-nearest neighbor search. Users expect these as baseline functionality - missing any makes the product feel incomplete.

**Must have (table stakes):**

- MCP server stdio transport — All AI coding tools (Claude Desktop, Cursor, VSCode) expect this standard pattern
- MCP resources for generated docs — Core MCP primitive; users expect to access 14 existing markdown documents as resources
- Semantic search via embeddings — Primary use case; "search my docs" is why users want this feature
- Basic vector database with sqlite-vec — Lightweight, portable vector storage that fits handover's single-binary ethos
- Document chunking for embeddings — Required due to token limits; fixed-size (500-1000 tokens) with 10-20% overlap outperforms complex semantic chunking
- K-nearest neighbor search — Standard vector search pattern returning top-k most similar chunks
- Auto-detect missing docs on startup — Don't fail silently; guide users to run `handover` first if docs missing
- MCP client configuration docs — Users need to know how to add server to Claude Desktop/Cursor/VSCode config files

**Should have (competitive advantages):**

- Dual-mode query: fast search + LLM synthesis — Users choose speed (semantic search) vs quality (RAG with LLM synthesis)
- LLM-powered Q&A with RAG — Conversational answers synthesized from multiple doc chunks; better UX than raw search results
- Reuse existing LLM provider abstraction — Leverage handover's 8 existing providers for Q&A; no vendor lock-in
- Incremental reindexing — Only re-embed changed documents; track doc hashes using existing SHA-256 cache system
- MCP prompts for common workflows — Pre-built prompts guide users: "Explain architecture", "Find security concerns"
- Raw analysis data as MCP resources — Expose file tree, dependency graph, git history as structured data for advanced users
- Hybrid search: semantic + metadata filters — Combine vector similarity with filters (file type, domain, recency) for precision

**Defer (v2+):**

- Remote regeneration via MCP tool — Complex async execution model; unclear if users want this vs CLI workflow
- Streaming MCP responses — Marginal UX gain; optimize query latency first with better chunking/caching
- Multimodal embeddings — Handover generates markdown text only; defer until visual artifacts exist
- GraphQL/REST API alongside MCP — Scope creep; handover is CLI tool, not web service

**Critical anti-features to avoid:**

- Real-time document watching with auto-reindex — Drains battery, race conditions with git operations; use explicit `handover reindex` instead
- Full semantic chunking with embedding-based boundaries — 3-5x more vectors, minimal accuracy gain per 2026 FloTorch benchmark
- Custom vector search implementation — Poor performance; use sqlite-vec's SIMD-accelerated cosine similarity

### Architecture Approach

The architecture integrates cleanly with handover's existing DAG orchestrator, parallel analyzers, and document rendering pipeline by treating MCP/search as new data flows that consume existing outputs. New components read from `.handover/` output directory and cache, expose via MCP protocol, and store in separate `.handover/search.db` vector database. This additive integration (not invasive modification) keeps the MCP server as a stateless consumer with no coupling to core analysis logic.

**Major components:**

1. **MCP Server** (`src/mcp/server.ts`) — Standalone entry point exposing handover docs via stdio/HTTP transport. Registers tools (semantic_search), resources (document access), and prompts (workflow templates). Separated from CLI so crashes don't affect analysis pipeline.
2. **Document Indexer** (`src/search/indexer.ts`) — Parses `.handover/*.md`, chunks text (512 tokens with recursive character split), detects changes via content hash. Triggered in render step's onComplete hook. Implements incremental indexing using existing AnalysisCache hash pattern.
3. **Embedding Provider** (`src/search/embeddings.ts`) — Extends handover's BaseProvider pattern for OpenAI embeddings API. Reuses retry logic, rate limiting, and token estimation. Implements batching (up to 2048 texts per request) to avoid slow sequential embedding.
4. **Vector Store** (`src/search/vector-store.ts`) — SQLite with sqlite-vec extension. CRUD operations on chunks/embeddings. Uses vec0 virtual table for cosine similarity queries. Stores document metadata including content hash and embedding model version.
5. **Query Engine** (`src/search/query-engine.ts`) — Search orchestration combining vector similarity with optional metadata filters. Returns top-k results with scores, supports hybrid text + vector search.

**Key architectural patterns:**

- **MCP as separate entry point**: Server runs independently via `handover serve`, reads from shared `.handover/` directory. Clean separation prevents IPC complexity and supports both local (stdio) and remote (HTTP) deployment.
- **Incremental indexing with content hash**: Reuse existing AnalysisCache pattern. Only reindex chunks from modified `.md` files. Hash each document's content (SHA-256), compare to stored hash, skip unchanged files.
- **Embedding provider extends BaseProvider**: Consistent error handling, retry backoff, and rate limiting across all LLM calls. Minimal new code by reusing existing provider infrastructure.
- **SQLite vector storage with sqlite-vec**: No external dependencies, runs in-process. ACID transactions, WAL mode for write concurrency. Suitable for <100K vectors (handover docs are <10K chunks maximum).

**Integration points:**

- Modified existing components: CLI entry for `handover serve` command, generate command for post-render indexing hook, config schema for mcp/search objects
- External dependencies: @modelcontextprotocol/server (MCP SDK), sqlite-vec (vector extension), OpenAI API (embeddings)
- Reuse patterns: content-hash caching, BaseProvider retry/rate-limit, Zod validation, vitest testing

### Critical Pitfalls

Research identified 10 critical pitfalls with specific prevention strategies. The top five that will break the implementation if not addressed:

1. **stdout corruption in stdio-based MCP servers** — Using console.log() completely breaks JSON-RPC message stream over stdio transport. Replace all console.log() with console.error() (stderr), add linter rule to ban console.log() in MCP server code. Address in Phase 1 before writing any server logic.

2. **Embedding dimension mismatch causing search failures** — Database initialized with one dimension (1536) but later embeddings use different dimension (3072). All vector operations fail. Store embedding model name and dimension in schema metadata, verify on startup, fail fast if mismatch detected. Address in Phase 2 with dimension validation before bulk indexing.

3. **Reusing LLM completion rate limiter for embeddings** — Existing BaseProvider has 4 concurrent limit for completions, but embeddings need higher concurrency (10-50) and batching (96+ texts per request). Implement separate rate limiter for embeddings with batch support. Address in Phase 2 before bulk indexing.

4. **Naive chunk boundary splitting loses context** — Fixed 512-token splitting breaks markdown in middle of code blocks, tables, lists. Semantic search retrieves half a code example. Use markdown-aware chunking: split at headers, keep code blocks intact, preserve parent context. Address in Phase 3 with test suite before bulk indexing.

5. **SQLite Node.js version performance regression** — Node.js v22/v24 have 57% slower SQLite performance than v20. Lock to Node.js v20 in package.json engines field, add runtime check on startup. Address in Phase 1 before implementation starts.

**Additional high-risk pitfalls:**

- Cosine similarity threshold not portable across queries (use top-k instead of global threshold)
- In-memory cache not invalidated on document regeneration (implement generation ID metadata)
- MCP server exposes unbounded resources without pagination (always paginate with cursor-based approach)
- LLM synthesis hallucinates from weak context (implement relevance filtering, add refusal mechanism)
- Session IDs exposed in resource URIs (never put session IDs in URIs; use MCP session context)

## Implications for Roadmap

Based on research, a 4-phase approach is recommended. This ordering respects dependency chains (storage before search, search before MCP), validates quality at each step (CLI search before MCP exposure), and defers nice-to-haves until core is stable (prompts/advanced features in Phase 4).

### Phase 1: Vector Storage Foundation

**Rationale:** Establish data layer before building query/MCP layers. Allows testing chunking and embedding quality independently without protocol overhead. Addresses critical pitfalls (stdout logging conventions, Node.js version lock, dimension validation) before they become embedded in codebase.

**Delivers:** Running `handover generate` automatically indexes changed docs into `search.db`. Document chunking, embedding generation, and vector storage work end-to-end.

**Addresses features:**

- Basic vector database with sqlite-vec (table stakes)
- Document chunking for embeddings (table stakes)
- Incremental reindexing (competitive advantage)

**Implements architecture:**

- VectorStore (SQLite + sqlite-vec schema)
- DocumentIndexer (chunking + change detection)
- EmbeddingProvider (OpenAI API wrapper extending BaseProvider)
- Post-render indexing hook in generate.ts
- Config schema extensions (mcp/search objects)

**Avoids pitfalls:**

- Embedding dimension mismatch (store metadata in schema, validate on startup)
- Naive chunking (markdown-aware splitting with test suite)
- Rate limiter reuse (separate batched embedding rate limiter)
- Node.js version regression (lock to v20, add runtime check)

**Research needs:** STANDARD — sqlite-vec and OpenAI embeddings are well-documented with established patterns. Skip research-phase.

### Phase 2: Query Engine + CLI Search

**Rationale:** Validates search quality before exposing via MCP. Easier to debug/iterate without protocol overhead. Establishes relevance scoring and filtering patterns that MCP layer will reuse. Proves the value proposition ("search my docs") before investing in MCP infrastructure.

**Delivers:** `handover search "query"` CLI command returns relevant chunks from docs. Search quality validated, chunking boundaries verified, embedding model working correctly.

**Addresses features:**

- Semantic search via embeddings (table stakes)
- K-nearest neighbor search (table stakes)

**Implements architecture:**

- QueryEngine (search orchestration)
- CLI search command in src/cli/index.ts
- Result formatting/display

**Avoids pitfalls:**

- Global similarity threshold (use top-k + scores, not threshold filtering)
- Hallucinations from weak context (implement relevance filtering before LLM integration)

**Research needs:** STANDARD — Cosine similarity search with SQLite is well-documented. Skip research-phase.

### Phase 3: MCP Server (Tools + Resources)

**Rationale:** Builds on proven search engine from Phase 2. MCP layer is thin adapter over existing functionality. stdio transport is well-specified in MCP spec. Resources map directly to existing `.handover/*.md` files. Tools wrap existing QueryEngine.search() method.

**Delivers:** Claude Desktop can connect to handover MCP server via stdio transport, search docs with semantic_search tool, and read full documents via handover://docs/{id} resources.

**Addresses features:**

- MCP server stdio transport (table stakes)
- MCP resources for generated docs (table stakes)
- Auto-detect missing docs on startup (table stakes)
- MCP client configuration docs (table stakes)

**Implements architecture:**

- src/mcp/server.ts (stdio/HTTP transport)
- src/mcp/tools.ts (semantic_search tool)
- src/mcp/resources.ts (document access)
- CLI serve command

**Avoids pitfalls:**

- stdout corruption (enforce stderr logging, add linter rule)
- Unbounded resources (implement pagination from start)
- Session IDs in URIs (use MCP session context, not URI params)
- Cache invalidation failure (implement generation-ID metadata)

**Research needs:** MEDIUM — MCP protocol is new (2025 spec) but well-documented. May need research-phase for advanced MCP features (prompts, sampling) if implementing beyond basic tools/resources. Core stdio transport + tools/resources is standard.

### Phase 4: Prompts + Advanced Features

**Rationale:** Deferred nice-to-haves until core functionality is stable. Prompt templates require understanding actual user workflows (discovered via Phase 3 usage). Hybrid search and metadata filters are valuable but not essential for launch. LLM-powered Q&A builds on proven search from Phase 2 with RAG synthesis layer.

**Delivers:** Full-featured MCP server with prompt templates for common workflows ("Explain architecture"), hybrid search combining semantic + metadata filters, LLM-powered Q&A with RAG pattern, and explicit reindexing command.

**Addresses features:**

- MCP prompts for common workflows (competitive advantage)
- Dual-mode query: fast search + LLM synthesis (competitive advantage)
- LLM-powered Q&A with RAG (competitive advantage)
- Hybrid search: semantic + metadata filters (competitive advantage)
- Raw analysis data as MCP resources (competitive advantage)

**Implements architecture:**

- src/mcp/prompts.ts (prompt templates)
- Hybrid search (text + vector with WHERE clauses)
- Metadata filters (by document type, section)
- Reindexing CLI command (handover reindex)
- RAG orchestration (retrieve chunks, augment query, synthesize with LLM)

**Avoids pitfalls:**

- LLM hallucinations (relevance threshold, refusal instructions in system prompt)

**Research needs:** LOW for prompts/hybrid search (standard patterns). MEDIUM for RAG Q&A (multiple approaches exist, need to choose pattern). May benefit from research-phase for RAG implementation specifically.

### Phase Ordering Rationale

- **Storage before search**: Can't query vectors without storage layer. Testing chunking/embedding quality requires persisted data.
- **Search before MCP**: Validates core value proposition (semantic search) before protocol complexity. MCP is just an interface over working search engine.
- **CLI before MCP**: Easier to debug search quality with CLI output than JSON-RPC protocol messages. Faster iteration cycle.
- **Core before advanced**: Prompts/hybrid search/RAG build on proven search foundation. Deferring allows user feedback to inform feature design.

**Dependency chain:**

```
Phase 1 (Storage) → Phase 2 (Search) → Phase 3 (MCP) → Phase 4 (Advanced)
     ↓                   ↓                  ↓                ↓
  embeddings         top-k search      stdio transport   RAG synthesis
  chunking           cosine sim        tools/resources   hybrid search
  sqlite-vec         relevance         pagination        prompts
```

### Research Flags

**Phases needing deeper research during planning:**

- **Phase 4 (RAG Q&A)**: Multiple RAG patterns exist (simple context injection, agentic retrieval, iterative refinement). Need research-phase to choose pattern based on handover's specific use case (documentation Q&A with 8 LLM providers).

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Storage)**: sqlite-vec integration and OpenAI embeddings are well-documented with official guides. Chunking strategies have established benchmarks (fixed-size with overlap outperforms semantic).
- **Phase 2 (Search)**: Cosine similarity with top-k retrieval is standard pattern. No novel approaches needed.
- **Phase 3 (MCP Server)**: stdio transport and basic tools/resources are specified in MCP docs with TypeScript SDK examples. Pagination is utility pattern in MCP spec.

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                                                                       |
| ------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | All recommendations verified against official sources (npm packages, GitHub repos, API docs). Version compatibility confirmed via package metadata and CI configs.                                                          |
| Features     | HIGH       | Feature tiers derived from MCP spec (official), multiple MCP server implementations (reference), and RAG/semantic search research (Weaviate, Pinecone, AWS 2026 guides).                                                    |
| Architecture | MEDIUM     | Integration patterns verified via MCP SDK docs and sqlite-vec guides. Handover-specific integration based on existing codebase analysis. Incremental indexing pattern inferred from existing cache system.                  |
| Pitfalls     | HIGH       | All critical pitfalls sourced from official docs (MCP security best practices, SQLite performance guides), community postdocs (NearForm MCP tips, Medium technical guides), or verified via multiple corroborating sources. |

**Overall confidence:** HIGH

The core technology choices (MCP SDK, sqlite-vec, OpenAI embeddings) are production-ready with extensive documentation. The architecture patterns (separate MCP entry point, incremental indexing, BaseProvider extension) align with existing handover patterns and are verifiable. The primary uncertainty is RAG pattern selection for Phase 4, which is deferrable and can be addressed with research-phase when needed.

### Gaps to Address

**Embedding model selection for offline use:**

- Research shows Ollama support for local embeddings (nomic-embed-text, all-minilm) but 10-20x slower with lower quality
- Handover already has Ollama provider for completions; extending to embeddings is architecturally straightforward
- Gap: Cost/benefit tradeoff for offline embeddings unclear. Defer to user feedback during Phase 1-2 rollout.
- **Handle by:** Document OpenAI requirement in Phase 1. If users request offline support, add Ollama embeddings in Phase 4.

**MCP HTTP transport deployment:**

- Research covers stdio (local) and HTTP (remote) transports. HTTP requires authentication, TLS, rate limiting not needed for CLI use case.
- Gap: Unclear if users want remote MCP server deployment. stdio covers all AI coding tools (Claude Desktop, Cursor, VSCode).
- **Handle by:** Implement stdio only in Phase 3. If users request remote access, add HTTP transport in future phase with proper security (JWT auth, TLS, rate limits).

**Hybrid search metadata schema:**

- Research shows partition-based indexes outperform pure HNSW for filtered queries, but specific metadata columns depend on handover's document types
- Gap: Which metadata fields are most valuable for filtering (file path, doc type, section, recency)?
- **Handle by:** Implement basic metadata (filename, doc_type, indexed_at) in Phase 1 schema. Add filters in Phase 4 based on Phase 2-3 user feedback about common queries.

**Chunking quality validation:**

- Research shows fixed-size (500-1000 tokens) with 10-20% overlap outperforms semantic chunking, but optimal size/overlap depends on document structure
- Gap: Handover generates diverse doc types (architecture, API reference, file tree, dependencies). One chunk size may not fit all.
- **Handle by:** Test with sample of all 14 doc types in Phase 1. Implement per-doc-type chunking strategy if quality issues found. Start with 512 tokens / 10% overlap as baseline.

## Sources

### Primary (HIGH confidence)

- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — MCP SDK version, v2 roadmap
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) — Official implementation
- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-03-26) — Transport specs, security best practices
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) — Version 12.6.2, Node 20/22 compatibility
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — v0.1.0 stable release, JavaScript integration guide
- [OpenAI Embeddings API](https://platform.openai.com/docs/api-reference/embeddings) — Pricing, models, batch API
- [OpenAI Batch API](https://developers.openai.com/api/docs/guides/batch/) — 50K limit, 50% discount

### Secondary (MEDIUM confidence)

- [MCP Implementation Tips & Pitfalls | Nearform](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/) — stdout corruption, session handling
- [MCP Security Guide](https://www.redhat.com/en/blog/model-context-protocol-mcp-understanding-security-risks-and-controls) — Resource URI security, authentication
- [The 2026 RAG Performance Paradox](https://ragaboutit.com/the-2026-rag-performance-paradox-why-simpler-chunking-strategies-are-outperforming-complex-ai-driven-methods/) — Fixed-size chunking benchmark
- [Chunking Strategies for RAG | Weaviate](https://weaviate.io/blog/chunking-strategies-for-rag) — Markdown-aware splitting patterns
- [Embedding Models Comparison 2026](https://research.aimultiple.com/embedding-models/) — OpenAI vs Voyage vs Cohere benchmarks
- [SQLite Performance Optimization 2026](https://forwardemail.net/en/blog/docs/sqlite-performance-optimization-pragma-chacha20-production-guide) — WAL mode, Node.js version issues
- [Better RAG Retrieval — Similarity with Threshold](https://meisinlee.medium.com/better-rag-retrieval-similarity-with-threshold-a6dbb535ef9e) — Top-k vs threshold filtering
- [MCP Pagination Utility](https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/pagination) — Cursor-based pagination pattern

### Tertiary (LOW confidence - needs validation)

- [Best Embedding Models 2026](https://elephas.app/blog/best-embedding-models) — Voyage AI performance claims (not verified with official Voyage docs)
- [MCP Streaming Performance Benchmark](https://www.tmdevlab.com/mcp-server-performance-benchmark.html) — Single-source benchmark, not corroborated

---

_Research completed: 2026-02-20_
_Ready for roadmap: yes_
