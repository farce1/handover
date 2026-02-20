# Feature Research

**Domain:** MCP Server with Semantic Search and LLM-Powered Q&A
**Researched:** 2026-02-20
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature                                   | Why Expected                                                                                          | Complexity | Notes                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| **MCP server stdio transport**            | Standard MCP server pattern; all AI coding tools (Claude Desktop, Cursor, VSCode) expect stdio config | MEDIUM     | TypeScript SDK provides `StdioServerTransport`; must avoid console.log() (corrupts JSON-RPC), use console.error() instead |
| **MCP resources for generated docs**      | Core MCP primitive for exposing data; users expect to access docs as resources                        | LOW        | Map 14 existing markdown documents to MCP resources; static content already generated                                     |
| **Semantic search via embeddings**        | Expected pattern for doc retrieval; "search my docs" is the primary use case                          | HIGH       | Requires embedding model integration, vector storage (sqlite-vec), chunking strategy, similarity ranking                  |
| **Basic vector database with sqlite-vec** | Lightweight, portable vector storage; fits handover's single-binary ethos                             | MEDIUM     | sqlite-vec is pre-v1 (breaking changes expected), written in pure C with no dependencies, runs anywhere SQLite runs       |
| **Document chunking for embeddings**      | Cannot embed full docs (token limits); chunking is required for semantic search                       | MEDIUM     | Fixed-size (500-1000 tokens) with 10-20% overlap outperforms complex semantic chunking (2026 FloTorch benchmark)          |
| **MCP client configuration docs**         | Users need to know how to add server to Claude Desktop/Cursor/VSCode                                  | LOW        | Standard JSON config pattern: `~/.claude/claude_desktop_config.json`, `~/.cursor/mcp.json`, `.vscode/mcp.json`            |
| **K-nearest neighbor search**             | Standard vector search pattern; returns top-k most similar chunks                                     | MEDIUM     | sqlite-vec uses `match` operator with `order by distance limit k`; supports multiple distance metrics                     |
| **Auto-detect missing docs on startup**   | Don't fail silently; inform user if docs don't exist                                                  | LOW        | Check for output directory on `handover serve`; prompt to run `handover` first if missing                                 |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature                                          | Value Proposition                                                                                              | Complexity | Notes                                                                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dual-mode query: fast search + LLM synthesis** | Users choose speed (semantic search) vs quality (LLM-synthesized answers); flexibility beats one-size-fits-all | MEDIUM     | MCP tools for both modes: `search_docs` (embedding similarity only) and `ask_question` (RAG with LLM synthesis)                                                                           |
| **LLM-powered Q&A with RAG**                     | Conversational answers synthesized from multiple doc chunks; better UX than raw search results                 | HIGH       | Retrieve top-k chunks via embeddings, augment query with context, pass to configured LLM provider (reuse existing 8-provider support)                                                     |
| **Reuse existing LLM provider abstraction**      | Leverage handover's 8 existing providers for Q&A; no vendor lock-in                                            | LOW        | Existing unified provider interface supports Anthropic, OpenAI, Gemini, etc.; just add Q&A orchestration layer                                                                            |
| **Multi-provider embedding support**             | Users configure embedding model (OpenAI text-embedding-3-small, Cohere, Voyage); not locked to single vendor   | MEDIUM     | OpenAI text-embedding-3-small for cost/speed, Cohere embed-v4 for customization, Voyage-4 for technical docs (68.6% accuracy)                                                             |
| **Incremental reindexing**                       | Only re-embed changed documents; full reindex is wasteful                                                      | MEDIUM     | Track doc hashes (reuse existing SHA-256 cache system); upsert only modified chunks; sqlite-vec supports upsert operations                                                                |
| **MCP prompts for common workflows**             | Pre-built prompts guide users: "Explain architecture", "Find security concerns", "Compare with X"              | LOW        | MCP prompts are templated messages; expose as slash commands in AI tools; user-driven discovery                                                                                           |
| **Raw analysis data as MCP resources**           | Expose file tree, dependency graph, git history as structured data; enables custom queries beyond docs         | MEDIUM     | Analyzers already generate this data; serialize to JSON and expose as MCP resources; valuable for advanced users                                                                          |
| **Remote regeneration via MCP tool**             | Trigger `handover` from within AI coding tool; keep docs fresh without CLI context switch                      | MEDIUM     | MCP tool that spawns `handover` subprocess; must handle async execution (could take minutes); progress updates via MCP notifications                                                      |
| **Hybrid search: semantic + metadata filters**   | Combine vector similarity with filters (file type, domain, recency); improves precision                        | HIGH       | Augment sqlite-vec queries with WHERE clauses on metadata columns (file path, doc type, timestamp); 2026 research shows partition-based indexes outperform pure HNSW for filtered queries |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature                                                            | Why Requested                                     | Why Problematic                                                                                                                                     | Alternative                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Real-time document watching with auto-reindex**                  | "Keep embeddings always fresh" sounds convenient  | Constant reindexing drains battery, race conditions with git operations, IPC complexity, stale daemon state                                         | Manual `handover reindex` + git hook for post-commit; explicit is better than implicit; disk cache already makes re-runs fast                          |
| **Full semantic chunking (embedding-based boundaries)**            | "Split by meaning, not characters" sounds smarter | 3-5x more vectors than fixed-size chunking, slower indexing, minimal accuracy gain (2026 FloTorch benchmark showed fixed-size won)                  | Fixed-size chunking (500-1000 tokens) with 10-20% overlap; simpler, faster, and equally effective                                                      |
| **Multimodal embeddings (diagrams, screenshots)**                  | "Index visual content too" seems comprehensive    | Handover generates markdown text only (no diagrams yet); multimodal embeddings (Voyage-multimodal-3) add complexity without current value           | Defer until handover generates visual artifacts; focus on text embeddings first (core use case)                                                        |
| **GraphQL/REST API alongside MCP**                                 | "Make it accessible to non-MCP clients"           | Adds HTTP server, auth, rate limiting, API versioning; handover is a CLI tool, not a web service; scope creep                                       | MCP is the only interface; lightweight, standardized, AI-tool native; users can wrap if needed                                                         |
| **Streaming MCP responses for long answers**                       | "Stream LLM output for faster TTFB"               | MCP streaming is for progress updates, not content; LLM synthesis is already fast (<5s for most queries); added complexity for marginal UX gain     | Non-streaming responses with progress notifications; optimize query latency instead (better chunking, caching)                                         |
| **Vector database migration from sqlite-vec to Pinecone/Weaviate** | "Production-grade vector DB"                      | Handover is a local CLI tool, not a cloud service; sqlite-vec is portable, zero-config, fits single-file ethos; cloud DBs add deployment complexity | Stick with sqlite-vec; pre-v1 but stable enough, aligns with handover's portability goals; can migrate later if cloud deployment becomes a requirement |

## Feature Dependencies

```
[MCP Server Basics]
    └──requires──> [stdio transport setup]
                       └──requires──> [TypeScript SDK integration]

[Semantic Search]
    └──requires──> [Document Chunking]
                       └──requires──> [Generated Docs Exist]
    └──requires──> [Embeddings]
                       └──requires──> [Provider Integration (OpenAI/Cohere/Voyage)]
    └──requires──> [Vector Storage (sqlite-vec)]

[LLM-Powered Q&A (RAG)]
    └──requires──> [Semantic Search]
    └──requires──> [LLM Provider]
                       └──enhances──> [Reuse Existing 8-Provider Abstraction]

[Incremental Reindexing]
    └──requires──> [Document Hash Tracking]
                       └──enhances──> [Reuse Existing SHA-256 Cache System]

[Remote Regeneration]
    └──requires──> [MCP Server Running]
    └──conflicts──> [Async Execution Model] (MCP tools are request/response, regeneration takes minutes)

[Hybrid Search (Semantic + Metadata)]
    └──requires──> [Semantic Search]
    └──requires──> [Metadata Columns in Vector DB]
```

### Dependency Notes

- **Semantic Search requires Document Chunking:** Embedding models have token limits (8191 for text-embedding-3-small); full docs exceed this; chunking is mandatory.
- **LLM-Powered Q&A requires Semantic Search:** RAG pattern = retrieval (semantic search) + augmentation (context injection) + generation (LLM synthesis); cannot skip retrieval step.
- **Incremental Reindexing enhances SHA-256 Cache System:** Handover already tracks content hashes for caching; reuse for embedding cache invalidation.
- **Remote Regeneration conflicts with Async Execution:** MCP tools expect fast responses; `handover` can take minutes; must return progress handle, not final result.
- **Reuse Existing 8-Provider Abstraction:** Handover supports Anthropic, OpenAI, Gemini, Azure, AWS Bedrock, Cohere, Groq, DeepSeek; Q&A feature should reuse this, not hardcode a single provider.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] **MCP server with stdio transport** — Core infrastructure; enables AI tool integration
- [ ] **MCP resources for 14 generated docs** — Low-hanging fruit; exposes existing content
- [ ] **Semantic search with embeddings** — Primary use case; "search my docs"
- [ ] **sqlite-vec for vector storage** — Portable, zero-config, fits CLI ethos
- [ ] **Fixed-size chunking (500-1000 tokens, 10-20% overlap)** — Simple, fast, effective (2026 benchmarks)
- [ ] **OpenAI text-embedding-3-small as default** — Cheap ($0.02/1M tokens), fast, good accuracy (64.6 MTEB)
- [ ] **K-nearest neighbor search (top-5 default)** — Standard pattern; returns most relevant chunks
- [ ] **Auto-detect missing docs on startup** — UX: guide user to generate docs first
- [ ] **`handover serve` command** — Start MCP server; logs to stderr (stdio transport requirement)
- [ ] **`handover reindex` command** — Manual reindexing; explicit control beats auto-magic

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **LLM-powered Q&A with RAG** — Trigger: users request "synthesized answers" vs raw search results
- [ ] **Dual-mode query tools** — Trigger: validate semantic search works first; then add LLM synthesis layer
- [ ] **MCP prompts for common workflows** — Trigger: identify top 3-5 user queries from feedback
- [ ] **Raw analysis data as MCP resources** — Trigger: advanced users request dependency graph, file tree access
- [ ] **Incremental reindexing** — Trigger: users complain about full reindex slowness
- [ ] **Multi-provider embedding support** — Trigger: users request Cohere/Voyage for better accuracy or cost control
- [ ] **Hybrid search with metadata filters** — Trigger: users need "find in API docs only" or "exclude tests" precision

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Remote regeneration via MCP tool** — Why defer: Complex async execution model; unclear if users want this vs CLI workflow
- [ ] **Streaming MCP responses** — Why defer: Marginal UX gain; optimize latency first (better chunking, caching)
- [ ] **Multimodal embeddings** — Why defer: Handover doesn't generate visual content yet; text-only is current scope
- [ ] **Cloud vector database migration** — Why defer: sqlite-vec fits CLI use case; cloud needed only if handover becomes a service

## Feature Prioritization Matrix

| Feature                     | User Value | Implementation Cost | Priority |
| --------------------------- | ---------- | ------------------- | -------- |
| MCP server stdio transport  | HIGH       | MEDIUM              | P1       |
| MCP resources for docs      | HIGH       | LOW                 | P1       |
| Semantic search             | HIGH       | HIGH                | P1       |
| sqlite-vec integration      | HIGH       | MEDIUM              | P1       |
| Document chunking           | HIGH       | MEDIUM              | P1       |
| OpenAI embeddings (default) | HIGH       | MEDIUM              | P1       |
| Auto-detect missing docs    | MEDIUM     | LOW                 | P1       |
| `handover serve` command    | HIGH       | LOW                 | P1       |
| `handover reindex` command  | MEDIUM     | LOW                 | P1       |
| LLM-powered Q&A (RAG)       | HIGH       | HIGH                | P2       |
| Dual-mode query tools       | HIGH       | MEDIUM              | P2       |
| Incremental reindexing      | MEDIUM     | MEDIUM              | P2       |
| MCP prompts                 | MEDIUM     | LOW                 | P2       |
| Raw analysis data resources | MEDIUM     | MEDIUM              | P2       |
| Multi-provider embeddings   | MEDIUM     | MEDIUM              | P2       |
| Hybrid search with filters  | HIGH       | HIGH                | P2       |
| Remote regeneration         | LOW        | MEDIUM              | P3       |
| Streaming responses         | LOW        | HIGH                | P3       |
| Multimodal embeddings       | LOW        | HIGH                | P3       |
| Cloud vector DB             | LOW        | HIGH                | P3       |

**Priority key:**

- P1: Must have for launch (MVP)
- P2: Should have, add when possible (post-validation)
- P3: Nice to have, future consideration (v2+)

## Competitor Feature Analysis

| Feature               | MCP Memory Server                         | MCP Filesystem Server                    | Our Approach                                                             |
| --------------------- | ----------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| **MCP Resources**     | Knowledge graph nodes                     | File content                             | Generated markdown docs (14 types) + raw analysis data (file tree, deps) |
| **Search Capability** | Graph queries (entities/relations)        | File path matching                       | Semantic search (embeddings) + optional LLM synthesis (RAG)              |
| **Data Model**        | Entities, relations, observations         | Hierarchical file tree                   | Documentation artifacts (architecture, API reference, etc.)              |
| **Storage**           | Knowledge graph (in-memory or persistent) | OS filesystem                            | SQLite vector DB (sqlite-vec) for embeddings + markdown files            |
| **Update Pattern**    | Incremental observations                  | File watch (real-time)                   | Manual reindex (explicit control)                                        |
| **Query Interface**   | MCP tools (create/read entities, search)  | MCP resources (read file), tools (write) | MCP tools (search, ask), resources (docs, analysis data)                 |
| **LLM Integration**   | No built-in LLM synthesis                 | No LLM features                          | Optional RAG for Q&A (reuse 8 existing providers)                        |

**Key Differentiators:**

- **Documentation-First:** Unlike filesystem (raw files) or memory (knowledge graph), handover exposes AI-generated, human-readable docs
- **Dual-Mode Query:** Fast semantic search for quick lookups, LLM synthesis for conversational answers; competitors pick one
- **Provider Flexibility:** Reuse existing 8-provider abstraction (Anthropic, OpenAI, Gemini, etc.); not locked to single vendor
- **Explicit Reindexing:** Manual control beats auto-magic watching (battery drain, race conditions); aligns with CLI ethos

## Sources

### MCP Server Implementation

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-11-25) (OFFICIAL SPEC)
- [Understanding MCP features: Tools, Resources, Prompts, Sampling, Roots, and Elicitation — WorkOS](https://workos.com/blog/mcp-features-guide)
- [MCP Resources explained (and how they differ from MCP Tools) | by Laurent Kubaski | Medium](https://medium.com/@laurentkubaski/mcp-resources-explained-and-how-they-differ-from-mcp-tools-096f9d15f767)
- [MCP Tools, Resources, and Client-Server Interaction Explained | by James Aspinwall | Medium](https://medium.com/@jamesaspinwall/mcp-tools-resources-and-client-server-interaction-explained-0b6be41287c5)
- [GitHub - modelcontextprotocol/servers: Model Context Protocol Servers](https://github.com/modelcontextprotocol/servers) (OFFICIAL REFERENCE IMPLEMENTATIONS)
- [GitHub - modelcontextprotocol/typescript-sdk: The official TypeScript SDK for Model Context Protocol servers and clients](https://github.com/modelcontextprotocol/typescript-sdk) (OFFICIAL SDK)
- [Build Your First MCP Server with TypeScript: Tools, Resources, and Prompts](https://noqta.tn/en/tutorials/build-mcp-server-typescript-2026)
- [How to Build an MCP Server with TypeScript | Thomas Wiegold Blog](https://thomas-wiegold.com/blog/how-to-build-mcp-server/)

### MCP Client Configuration

- [Configure MCP Servers on VSCode, Cursor & Claude Desktop | Knowledge Share](https://spknowledge.com/2025/06/06/configure-mcp-servers-on-vscode-cursor-claude-desktop/)
- [MCP Integrations - VSCode, Cursor, Claude Desktop, Zed & More](https://mcpez.com/integrations)
- [add-mcp: Install MCP Servers Across Coding Agents and Editors - Neon](https://neon.com/blog/add-mcp)

### MCP Security Best Practices

- [Security Best Practices - Model Context Protocol](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) (OFFICIAL DOCS)
- [A Practical Guide for Secure MCP Server Development - OWASP Gen AI Security Project](https://genai.owasp.org/resource/a-practical-guide-for-secure-mcp-server-development/)
- [The complete guide to MCP security: How to secure MCP servers & clients — WorkOS](https://workos.com/blog/mcp-security-risks-best-practices)
- [MCP Authentication: Step by Step Guide and Security Best Practices | Obot AI](https://obot.ai/resources/learning-center/mcp-authentication/)

### Semantic Search & Embeddings

- [What are vector embeddings? A complete guide [2026]](https://www.meilisearch.com/blog/what-are-vector-embeddings)
- [Exploring Semantic Search Using Embeddings and Vector Databases with some popular Use Cases | by Pankaj | Medium](https://medium.com/@pankaj_pandey/exploring-semantic-search-using-embeddings-and-vector-databases-with-some-popular-use-cases-2543a79d3ba6)
- [Complete Guide to Embeddings in 2026](https://encord.com/blog/complete-guide-to-embeddings-in-2026/)
- [Semantic Search with Vector Databases - KDnuggets](https://www.kdnuggets.com/semantic-search-with-vector-databases)

### Embedding Models (2026 Comparison)

- [Embedding Models: OpenAI vs Gemini vs Cohere in 2026](https://research.aimultiple.com/embedding-models/)
- [13 Best Embedding Models in 2026: OpenAI vs Voyage AI vs Ollama | Complete Guide + Pricing & Performance](https://elephas.app/blog/best-embedding-models)
- [Text Embedding Models Compared: OpenAI, Voyage, Cohere & More](https://document360.com/blog/text-embedding-model-analysis/)
- [Best Embedding Models 2025: MTEB Scores & Leaderboard (Cohere, OpenAI, BGE) | Ailog RAG](https://app.ailog.fr/en/blog/guides/choosing-embedding-models)

### Document Chunking Strategies

- [Chunking Strategies to Improve LLM RAG Pipeline Performance | Weaviate](https://weaviate.io/blog/chunking-strategies-for-rag)
- [Chunking Strategies for LLM Applications | Pinecone](https://www.pinecone.io/learn/chunking-strategies/)
- [The 2026 RAG Performance Paradox: Why Simpler Chunking Strategies Are Outperforming Complex AI-Driven Methods](https://ragaboutit.com/the-2026-rag-performance-paradox-why-simpler-chunking-strategies-are-outperforming-complex-ai-driven-methods/)
- [How to Implement Document Chunking](https://oneuptime.com/blog/post/2026-01-30-document-chunking/view)

### RAG & LLM-Powered Q&A

- [Retrieval Augmented Generation (RAG) for LLMs | Prompt Engineering Guide](https://www.promptingguide.ai/research/rag)
- [Build a RAG agent with LangChain - Docs by LangChain](https://docs.langchain.com/oss/python/langchain/rag)
- [What is RAG? - Retrieval-Augmented Generation AI Explained - AWS](https://aws.amazon.com/what-is/retrieval-augmented-generation/)
- [RAG vs Semantic Search: Key Differences Explained](https://customgpt.ai/rag-vs-semantic-search/)
- [Semantic search vs. RAG: A side-by-side comparison](https://www.meilisearch.com/blog/semantic-search-vs-rag)
- [10 Types of RAG Architectures and their use cases in 2026](https://newsletter.rakeshgohel.com/p/10-types-of-rag-architectures-and-their-use-cases-in-2026)

### SQLite Vector Extensions

- [GitHub - asg017/sqlite-vec: A vector search SQLite extension that runs anywhere!](https://github.com/asg017/sqlite-vec) (PRIMARY LIBRARY)
- [GitHub - asg017/sqlite-vss: A SQLite extension for efficient vector search, based on Faiss!](https://github.com/asg017/sqlite-vss) (DEPRECATED, SQLITE-VEC IS SUCCESSOR)
- [How sqlite-vec Works for Storing and Querying Vector Embeddings | by Stephen Collins | Medium](https://medium.com/@stephenc211/how-sqlite-vec-works-for-storing-and-querying-vector-embeddings-165adeeeceea)

### Vector Database Performance & Optimization

- [Why is Vector Search so fast? | Weaviate](https://weaviate.io/blog/why-is-vector-search-so-fast)
- [Vector Search Explained | Weaviate](https://weaviate.io/blog/vector-search-explained)
- [Filtered Approximate Nearest Neighbor Search in Vector Databases (arXiv 2026)](https://arxiv.org/abs/2602.11443)
- [Vector Databases: Understanding KNN and HNSW](https://learncodecamp.net/vector-databases-knn-hnsw/)

### Incremental Reindexing

- [Why Reindexing Embeddings is a Lie | SimpleVector](https://www.simplevector.io/blog/why-reindexing-embeddings-is-a-lie/)
- [How to Update RAG Knowledge Base Without Rebuilding Everything](https://particula.tech/blog/update-rag-knowledge-without-rebuilding)
- [Retrieving Latest Information from RAG — Reindexing | by mawatwalmanish | Medium](https://medium.com/@mawatwalmanish1997/retrieving-latest-information-from-rag-reindexing-e069da2f6c63)

### MCP Server Performance & Streaming

- [Streaming Responses in MCP Servers - Grizzly Peak Software](https://grizzlypeaksoftware.com/library/streaming-responses-in-mcp-servers-9eyk2gx2)
- [MCP Streaming Messages: Performance, Transport, Trade-Offs - Stainless MCP Portal](https://www.stainless.com/mcp/mcp-streaming-messages-performance-transport)
- [Multi-Language MCP Server Performance Benchmark | TM Dev Lab](https://www.tmdevlab.com/mcp-server-performance-benchmark.html)

---

_Feature research for: MCP Server with Semantic Search and LLM-Powered Q&A_
_Researched: 2026-02-20_
