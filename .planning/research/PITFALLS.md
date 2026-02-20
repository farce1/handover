# Pitfalls Research

**Domain:** Adding MCP Server, Semantic Search, Embeddings, and SQLite Vector Storage to Existing TypeScript CLI
**Researched:** 2026-02-20
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: stdout Corruption in Stdio-Based MCP Servers

**What goes wrong:**
Using `console.log()` in an MCP server running over stdio transport completely breaks the server. The JSON-RPC messages get corrupted because stdout is the communication channel between client and server, and logging output mixes with protocol messages.

**Why it happens:**
Developers habitually use `console.log()` for debugging without realizing that stdio-based MCP servers use stdout as the protocol transport layer. Standard logging practices that work everywhere else will silently corrupt the message stream.

**How to avoid:**

- Replace all `console.log()` calls with `console.error()` (writes to stderr instead of stdout)
- Use a logging library configured to write to stderr or files, never stdout
- Add a linter rule to ban `console.log()` in MCP server code
- For HTTP-based MCP servers, stdout logging is safe since HTTP responses are separate

**Warning signs:**

- Client complains about "malformed messages" or "unexpected JSON"
- Server that worked suddenly fails after adding logging
- Intermittent connection errors that correlate with log statements
- Client timeout errors when server is actually running

**Phase to address:**
Phase 1 (MCP Server Foundation) - Establish logging conventions before writing any server logic. Document this prominently in development guidelines.

---

### Pitfall 2: Embedding Dimension Mismatch Causing Vector Search Failures

**What goes wrong:**
SQLite vector database is initialized with one embedding dimension (e.g., 1536 for text-embedding-ada-002), but later embeddings are generated with a different dimension (e.g., 768 for different model or 3072 for text-embedding-3-large). All vector operations fail with dimension mismatch errors, requiring complete reindexing.

**Why it happens:**
The existing LLM provider interface (`LLMProvider`) has no `embeddings()` method - only `complete()` for chat completions. When adding embeddings support, developers may:

- Use a different provider's embedding API than the completion API
- Switch embedding models without updating the database schema
- Assume all models from same provider use same dimensions
- Not realize different API versions return different dimensions

**How to avoid:**

- Extend the `LLMProvider` interface with explicit embedding methods that declare dimension size
- Store embedding model name and dimension in SQLite schema metadata table
- On startup, verify current embedding model matches stored metadata or fail fast
- Implement migration path: detect dimension change, warn user, offer to rebuild index
- Add integration tests that verify embedding dimension consistency across restarts

**Warning signs:**

- "Vector dimension does not match" errors from SQLite
- Search returns no results after changing provider configuration
- Database operations succeed but queries fail
- Inconsistent results across different queries

**Phase to address:**
Phase 2 (Embeddings Integration) - Design provider interface extensions before implementing embeddings. Add dimension validation as first step of vector storage implementation.

---

### Pitfall 3: Reusing LLM Completion Interface for Embeddings Without Rate Limiting

**What goes wrong:**
Existing `BaseProvider` class has rate limiting for completion requests (4 concurrent by default), but embeddings require different concurrency patterns. Embedding 1000+ document chunks sequentially takes hours, but naive parallelization hits rate limits and costs spike dramatically.

**Why it happens:**
Completion requests are expensive, long-running, and benefit from aggressive caching. Embeddings are cheap, fast, and typically done in bulk (hundreds of documents at once). The existing rate limiter isn't designed for batch workloads.

**How to avoid:**

- Implement separate rate limiter for embedding operations with higher concurrency (10-50)
- Add batching support: combine multiple embeddings into single API call (many providers support up to 96 texts per request)
- Track embedding-specific costs separately (different pricing than completions)
- Implement exponential backoff specific to embedding rate limits (different from completion limits)
- Add progress tracking for bulk embedding operations (unlike single completions)

**Warning signs:**

- Embedding 1000 documents takes multiple hours
- API rate limit errors during bulk indexing
- Cost unexpectedly high compared to estimations
- Timeout errors on embedding requests that should be fast
- Progress appears stalled but no errors shown

**Phase to address:**
Phase 2 (Embeddings Integration) - Design embedding-specific API wrapper before bulk indexing. Benchmark with 100 documents before rolling out full indexing.

---

### Pitfall 4: Naive Chunk Boundary Splitting Loses Critical Context

**What goes wrong:**
Fixed-size chunking (split every 512 tokens) breaks markdown documents in the middle of code blocks, tables, or bullet lists. Semantic search retrieves half a code example or partial table row, making LLM synthesis impossible and generating hallucinated answers.

**Why it happens:**
The existing codebase has sophisticated AST parsing for TypeScript/Python/Rust/Go, creating the false impression that document chunking is similar. But markdown semantic boundaries (headers, code blocks, lists) aren't in an AST - they're text patterns. Developers default to token-count-based splitting without respecting markdown structure.

**How to avoid:**

- Use markdown-aware chunking: split at header boundaries (`## `, `### `) first
- Keep code blocks (`\`\`\`...\`\`\``) intact within single chunks
- Preserve parent context: include parent headers in chunk metadata
- Implement "overlap" between chunks (last 50 tokens of previous chunk prepended to next)
- Test chunking on actual generated docs (`handover/*.md`) before implementing
- Measure: chunks should "make sense without surrounding context to a human"

**Warning signs:**

- Semantic search returns code snippets missing critical imports/context
- LLM answers reference "the above code" that isn't in retrieved context
- Search results contain half a table or incomplete list
- Users report "answers don't make sense" or "missing important details"
- Chunks shorter than 100 tokens or longer than 2000 tokens (likely boundary failures)

**Phase to address:**
Phase 3 (Document Indexing) - Implement chunking logic with test suite before bulk indexing. Validate on sample of generated docs with manual inspection.

---

### Pitfall 5: SQLite Node.js Version Performance Regression

**What goes wrong:**
On Node.js v22 or v24, SQLite vector operations perform 57% slower than v20. What should take seconds takes minutes. Developers blame the vector extension or database design when it's the Node.js runtime.

**Why it happens:**
Node.js v22 and v24 introduced a performance regression in native module bindings. better-sqlite3 (synchronous SQLite for Node.js) is heavily affected. This is well-documented but developers don't check Node.js version when debugging "slow database" issues.

**How to avoid:**

- **Lock to Node.js v20** in `package.json` engines field
- Add runtime check in CLI startup: warn if running on v22/v24, suggest downgrade
- Document Node.js v20 requirement prominently in README
- CI/CD should test on Node.js v20 specifically
- Monitor Node.js release notes for regression fixes before updating

**Warning signs:**

- Vector searches that should take <100ms taking seconds
- SQLite queries 2-5x slower than benchmarks
- Performance inconsistent across different machines (different Node versions)
- CPU usage unexpectedly high during database operations

**Phase to address:**
Phase 1 (MCP Server Foundation) - Enforce Node.js version requirement before any implementation. Add to project setup checklist.

---

### Pitfall 6: Cosine Similarity Threshold Not Portable Across Queries

**What goes wrong:**
Developer sets global threshold of 0.75 for "relevant" search results. Some queries return zero results (too strict), others return hundreds of irrelevant results (too loose). Users get inconsistent search quality and lose trust in semantic search.

**Why it happens:**
Cosine similarity scores (0.0 to 1.0) are not normalized across different queries. A score of 0.8 might mean "highly relevant" for one query but "tangentially related" for another. This is fundamental to how embeddings work but not obvious to developers used to normalized metrics.

**How to avoid:**

- **Don't use global similarity thresholds** - document this as anti-pattern
- Instead: return top-k results (e.g., top 5) with scores, let LLM filter relevance
- For filtering, use adaptive thresholds: compare to score distribution of current query
- Implement "Cosine Adapter" pattern: transform scores into interpretable confidence levels
- Add "no relevant results" detection: if top result < 0.5, consider query unanswerable
- Surface scores to users: show why results were returned ("87% match")

**Warning signs:**

- User complaints about "search returns nothing" for reasonable queries
- Users say "search returns too much irrelevant stuff"
- Developers keep tweaking global threshold without improvement
- Different users need different thresholds (query distribution varies)

**Phase to address:**
Phase 4 (Semantic Search) - Design search API to return top-k + scores, not threshold-filtered results. Test with diverse query types before exposing to users.

---

### Pitfall 7: In-Memory Cache Not Invalidated on Document Regeneration

**What goes wrong:**
User runs `handover generate` (regenerates docs), then queries MCP server - gets results from old docs. Cache invalidation strategy assumes files change individually (like code edits), but `handover generate` replaces entire output directory atomically. Stale embeddings persist in memory until server restart.

**Why it happens:**
Caching strategy likely mirrors existing `RoundCache` pattern (from `src/cache/round-cache.ts`), which uses content hashes or file mtimes. But regeneration can produce docs with similar content hashes or same mtimes (bulk write), defeating hash-based invalidation.

**How to avoid:**

- Implement "generation ID" metadata: store monotonic counter in `handover/.meta.json`
- On MCP server startup: load generation ID, invalidate cache if changed
- On document regeneration: increment generation ID, optionally notify running MCP servers
- Add TTL-based expiration (e.g., 1 hour) as backup to hash/ID-based invalidation
- Implement `--clear-cache` flag for MCP server
- Watch output directory for file changes and invalidate proactively

**Warning signs:**

- Search results don't reflect recent documentation changes
- Restarting MCP server "fixes" search quality
- Users report needing to "wait a while" before seeing updates
- Cache hit rate suspiciously high (99%+) even after known doc changes

**Phase to address:**
Phase 3 (Document Indexing) - Design invalidation strategy as part of indexing logic. Test with regeneration workflow before declaring indexing complete.

---

### Pitfall 8: MCP Server Exposes Unbounded Resources Without Pagination

**What goes wrong:**
MCP server exposes `handover://documents` resource, client requests it, server attempts to return all 14 documents with all chunks (thousands of objects) in single response. Client times out, server OOMs, or response takes 30+ seconds.

**Why it happens:**
MCP Resources API makes it easy to expose data as URIs, but documentation examples show simple cases (single file, small dataset). Developers implement naive "return everything" approach without considering scale. The existing CLI has no concept of pagination - it processes everything in memory.

**How to avoid:**

- **Always paginate MCP resources** - make this a hard requirement
- Use cursor-based pagination (not page numbers): opaque tokens representing position
- Default page size: 20-50 items (not 100, not 1000)
- Return metadata: `has_more`, `next_cursor`, `total_count` (if cheap to compute)
- For semantic search: paginate results, not chunks (user sees "5 more results" not "500 more chunks")
- Test with 1000+ documents before calling pagination "done"

**Warning signs:**

- MCP client shows loading spinner for 10+ seconds
- Server memory usage spikes to 1GB+ when serving resources
- Timeout errors when querying documentation
- Network payload size in MB range (should be KB)
- Server becomes unresponsive after resource request

**Phase to address:**
Phase 5 (MCP Resources) - Implement pagination as core requirement before exposing any resources. Design pagination into resource schema from the start.

---

### Pitfall 9: LLM Synthesis Hallucinates When Retrieval Returns Irrelevant Context

**What goes wrong:**
Semantic search returns 5 chunks with similarity 0.6-0.75 (none highly relevant), LLM receives them as context, generates confident but incorrect answer citing "documentation" that doesn't support the claim. User trusts answer because it came from "documentation search," creates bug based on hallucinated information.

**Why it happens:**
RAG pattern assumes retrieved context is relevant, but semantic search can return tangentially related chunks when no good answer exists. LLMs are trained to be helpful and will synthesize answers from weak context. The existing completion interface has no "refuse to answer" mechanism.

**How to avoid:**

- Implement relevance filtering: if top result < 0.5 similarity, return "no relevant docs found"
- Add system prompt instruction: "If context doesn't answer question, say 'I don't have information about that in the documentation'"
- Return search scores to user: "Found 3 results (confidence: medium)"
- Implement "verified answer cache" for common questions (human-curated)
- Log questions with low-confidence answers for review
- Add user feedback: "Was this answer helpful?" to detect hallucinations

**Warning signs:**

- Users report "documentation says X" but you can't find X in docs
- Answers cite specific details not present in source chunks
- Different phrasings of same question produce contradictory answers
- Users complain about "made up information"
- Search returns results but answer quality is poor

**Phase to address:**
Phase 6 (Q&A with LLM) - Implement relevance filtering and refusal mechanism before exposing Q&A feature. Test with adversarial questions (unanswerable from docs).

---

### Pitfall 10: MCP Security: Session IDs Exposed in Resource URIs

**What goes wrong:**
Developer implements resource URIs like `handover://documents?session=abc123` to track context across requests. Session IDs leak in logs, get shared in screenshots, or persist in client caches. Attacker uses stolen session ID to access other users' documentation queries or inject malicious context.

**Why it happens:**
Web development habits (session IDs in cookies, not URLs) don't transfer to MCP protocol design. The MCP spec has "sessions" for context tracking, but they're not authentication - developers conflate the two. Resource URIs feel like HTTP URLs, encouraging similar patterns.

**How to avoid:**

- **Never put session IDs in resource URIs** - they're not secret
- Sessions are for context tracking, not authentication (document this clearly)
- If multi-user: tie sessions to user identity, validate on server side
- For CLI context: sessions are per-process, no need for IDs in URIs
- Use MCP's built-in session context, don't reinvent authentication
- Validate all resource requests: check permissions before serving data

**Warning signs:**

- Resource URIs contain `session=`, `user=`, `token=` parameters
- Session identifiers visible in client logs or UI
- No access control on resource requests (anyone can request any URI)
- Session state persists across CLI process restarts

**Phase to address:**
Phase 5 (MCP Resources) - Design resource URI schema with security review. Document authentication vs. session distinction in MCP context.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut                                               | Immediate Benefit                                | Long-term Cost                                                      | When Acceptable                                  |
| ------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------ |
| Using same rate limiter for embeddings and completions | Reuse existing code, ship faster                 | Slow bulk indexing (hours vs minutes), poor UX, wasted API costs    | Never - embeddings need different concurrency    |
| Fixed-size token chunking (ignore markdown structure)  | Simple implementation, no markdown parser needed | Poor search quality, context loss, hallucinations, user trust lost  | Only for MVP testing with <10 documents          |
| Global cosine similarity threshold                     | Easy to implement, single config value           | Inconsistent results, user confusion, constant tweaking             | Never - fundamentally wrong approach             |
| No pagination on MCP resources                         | Simpler API, works with small datasets           | Server OOM, timeouts, poor performance at scale                     | Never - pagination is table stakes               |
| Storing only embeddings, not source chunk text         | Smaller database, faster queries                 | Can't show source context, must re-parse docs, debugging impossible | Never - chunk text is essential                  |
| In-memory cache only (no SQLite persistence)           | Faster than disk, simpler code                   | Slow restarts (re-embed everything), wasted API costs               | Acceptable for development, never for production |
| Synchronous embedding (no batching)                    | Simple linear code, easy to debug                | 10-100x slower than batched, rate limit waste                       | Acceptable for <50 documents in MVP              |
| No embedding model version in schema                   | Simpler schema, no migration logic               | Silent dimension mismatch, broken search after model change         | Never - model version is metadata requirement    |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration                     | Common Mistake                                               | Correct Approach                                                                                |
| ------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Anthropic/OpenAI embedding APIs | Assuming completion and embedding use same API client        | Use separate API clients - embeddings have different rate limits, batching support, pricing     |
| better-sqlite3 with sqlite-vec  | Assuming extension auto-loads like built-in functions        | Explicitly load extension: `sqliteVec.load(db)` at initialization, check platform compatibility |
| MCP stdio transport             | Using `console.log()` for debugging (corrupts protocol)      | Always use `console.error()` or file logging, never stdout                                      |
| SQLite WAL mode                 | Using default rollback mode (slower, single writer)          | Enable WAL mode for vector workloads: `PRAGMA journal_mode=WAL`                                 |
| Embedding model switching       | Changing model in config, restarting server                  | Must rebuild index - embeddings from different models incompatible                              |
| MCP client timeout              | Using default HTTP timeout (30s) for large resource requests | Increase timeout for paginated resources, or reduce page size                                   |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap                                                    | Symptoms                                  | Prevention                                                    | When It Breaks                                       |
| ------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| Loading all embeddings into memory on startup           | Works fine with 100 docs, instant search  | Lazy-load embeddings, use SQLite disk cache, paginate results | >1000 documents (>1.5GB RAM for 1536-dim embeddings) |
| Re-embedding unchanged documents on every index rebuild | Fast with 10 docs, feels thorough         | Hash-based deduplication: skip embedding if content unchanged | >500 documents (10+ minutes rebuild)                 |
| Synchronous vector similarity search                    | <100ms with 100 docs, acceptable          | Index embeddings in SQLite with vec0 virtual table            | >10,000 documents (>1s search time)                  |
| Single-threaded markdown chunking                       | Imperceptible with 14 docs                | Parallelize chunking across documents                         | >100 documents (>10s processing time)                |
| No query result caching                                 | Fresh results, simple code                | Cache search results with TTL (5 min), invalidate on reindex  | >1000 queries/day (repeated work, API cost)          |
| Rebuilding entire index when one doc changes            | Simple logic, works for full regeneration | Incremental indexing: detect changed files, update embeddings | >100 documents (minutes to rebuild vs seconds)       |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake                                           | Risk                                                                               | Prevention                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Exposing internal file paths in MCP resource URIs | Information disclosure: attacker learns codebase structure, finds sensitive files  | Use opaque identifiers (`handover://doc/abc123`), map to paths server-side |
| No rate limiting on MCP endpoints                 | DoS: attacker spams embedding requests, exhausts API quota                         | Implement per-client rate limiting (even for stdio transport)              |
| Embedding user input without sanitization         | Prompt injection: malicious input in embeddings influences semantic search results | Sanitize: remove markdown, limit length, validate UTF-8                    |
| Storing API keys in SQLite database               | Credential theft: if database file leaked, API keys compromised                    | Never store keys in DB - read from env vars, document as requirement       |
| MCP server runs with elevated privileges          | Privilege escalation: vulnerability in server code grants filesystem access        | Run with minimal permissions, chroot if possible, document least privilege |
| No input validation on MCP tool arguments         | Injection attacks: path traversal, SQL injection (if dynamic queries)              | Validate all inputs: whitelist patterns, reject suspicious characters      |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall                                                       | User Impact                                                          | Better Approach                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| No feedback during bulk embedding (silent progress)           | User thinks CLI is frozen, kills process, wastes progress            | Show progress: "Embedding documents: 45/200 (22%)" with ETA                                     |
| Unclear error when embedding model unavailable                | "Vector dimension mismatch" is cryptic, user doesn't know how to fix | "Embedding model changed. Run `handover reindex --clear` to rebuild."                           |
| Search returns chunks without source document context         | User sees code snippet, doesn't know which doc/section it's from     | Include metadata: "From 03-ARCHITECTURE.md, section 'Database Layer'"                           |
| No distinction between "no results" and "low quality results" | User doesn't know if search failed or docs don't cover topic         | "No relevant results found (top match: 23% confidence)" vs "Found 3 results (confidence: high)" |
| MCP server startup delay not communicated                     | User runs query immediately, gets timeout, blames search quality     | Show: "Initializing embeddings... ready" before accepting queries                               |
| Regenerating docs invalidates index silently                  | User gets stale results, doesn't realize reindexing needed           | Detect: "Documentation updated. Run `handover reindex` to refresh search."                      |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **MCP Server**: Demo works over stdio, but HTTP transport untested — verify both transports work, document which to use when
- [ ] **Embeddings**: Works with Anthropic, but other providers untested — verify embedding support for all existing providers (OpenAI, Ollama, etc.)
- [ ] **Vector Search**: Queries work, but no benchmarks — verify <100ms search latency with 1000+ documents, profile slow queries
- [ ] **Document Chunking**: Splits at boundaries, but no overlap — verify chunk overlap implemented (context continuity), test with code examples
- [ ] **Cache Invalidation**: Detects file changes, but not regeneration — verify generation-ID-based invalidation works, test with `handover generate`
- [ ] **Pagination**: Returns next_cursor, but cursor validation missing — verify invalid/expired cursors return proper errors, test pagination edge cases
- [ ] **Error Handling**: Returns errors, but no user-friendly messages — verify error messages explain how to fix issue, not just what went wrong
- [ ] **Resource URIs**: Works with happy path, but no malformed URI handling — verify rejects invalid URIs with clear errors, test with fuzzing
- [ ] **Rate Limiting**: Limits concurrent requests, but no backoff on failures — verify exponential backoff on rate limit errors, test with API limit
- [ ] **Embedding Batching**: Batches 96 texts, but no handling of batch failures — verify partial batch retry (don't re-embed successful items), test with API errors

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall                                | Recovery Cost      | Recovery Steps                                                                                                                                                           |
| -------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Embedding dimension mismatch           | MEDIUM (30-60 min) | 1. Delete SQLite database file<br>2. Update provider config with correct model<br>3. Run `handover reindex`<br>4. Add dimension validation to prevent recurrence         |
| stdout corruption in MCP server        | LOW (5-10 min)     | 1. Search codebase for `console.log(`<br>2. Replace with `console.error(`<br>3. Restart MCP server<br>4. Test with client to verify messages parse                       |
| Global similarity threshold too strict | LOW (1-2 min)      | 1. Remove threshold from search logic<br>2. Return top-k results instead<br>3. Let LLM filter relevance<br>4. Document as anti-pattern                                   |
| Naive chunking breaks context          | HIGH (2-4 hours)   | 1. Implement markdown-aware chunker<br>2. Add unit tests with sample docs<br>3. Rebuild index with new chunks<br>4. Manually verify quality on 10+ docs                  |
| No pagination causes OOM               | MEDIUM (1-2 hours) | 1. Add cursor-based pagination to resource handler<br>2. Set page size to 20-50<br>3. Update resource schema with metadata<br>4. Test with large dataset (>100 pages)    |
| Cache not invalidated on regeneration  | MEDIUM (30-60 min) | 1. Implement generation-ID metadata<br>2. Add invalidation check on startup<br>3. Increment ID in generate command<br>4. Document cache clearing for users               |
| SQLite performance on Node v22/24      | LOW (5-10 min)     | 1. Check Node.js version: `node --version`<br>2. Downgrade to Node.js v20 (via nvm or package manager)<br>3. Add version check to CLI<br>4. Document in README           |
| Hallucinations from weak context       | MEDIUM (1-2 hours) | 1. Add relevance threshold (0.5 minimum)<br>2. Update system prompt with refusal instructions<br>3. Test with unanswerable questions<br>4. Add user feedback mechanism   |
| Session IDs in resource URIs           | MEDIUM (1-2 hours) | 1. Redesign URI schema without session params<br>2. Use MCP session context for state<br>3. Audit for other leaked identifiers<br>4. Security review by second developer |
| Slow bulk embedding (no batching)      | LOW (30 min)       | 1. Implement batch embedding (96 texts per request)<br>2. Add progress tracking<br>3. Benchmark before/after<br>4. Document expected performance                         |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall                          | Prevention Phase                | Verification                                                             |
| -------------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| stdout corruption (console.log)  | Phase 1: MCP Server Foundation  | Run server over stdio, add debug logs, verify client receives valid JSON |
| Embedding dimension mismatch     | Phase 2: Embeddings Integration | Test provider switching, verify error on dimension change                |
| Rate limiter reuse               | Phase 2: Embeddings Integration | Benchmark embedding 100 docs, verify <2 min with batching                |
| Naive chunking                   | Phase 3: Document Indexing      | Manually inspect 10 chunks, verify boundaries respect markdown           |
| Node.js version regression       | Phase 1: MCP Server Foundation  | CI test on v20/v22/v24, verify performance requirements                  |
| Global similarity threshold      | Phase 4: Semantic Search        | Test diverse queries, verify no threshold config exists                  |
| Cache invalidation failure       | Phase 3: Document Indexing      | Run generate + query, verify fresh results without restart               |
| Unbounded resources              | Phase 5: MCP Resources          | Request resource with >100 items, verify pagination works                |
| Hallucinations from weak context | Phase 6: Q&A with LLM           | Test 10 unanswerable questions, verify refusal responses                 |
| Session IDs in URIs              | Phase 5: MCP Resources          | Security review of URI schema, verify no sensitive data                  |

---

## Sources

### MCP Server Implementation

- [Implementing model context protocol (MCP): Tips, tricks and pitfalls | Nearform](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/)
- [Model Context Protocol (MCP): Understanding security risks and controls](https://www.redhat.com/en/blog/model-context-protocol-mcp-understanding-security-risks-and-controls)
- [Security Best Practices - Model Context Protocol](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices)
- [The MCP Security Survival Guide: Best Practices, Pitfalls, and Real-World Lessons | Towards Data Science](https://towardsdatascience.com/the-mcp-security-survival-guide-best-practices-pitfalls-and-real-world-lessons/)
- [MCP Transport Protocols: stdio vs SSE vs StreamableHTTP | MCPcat](https://mcpcat.io/guides/comparing-stdio-sse-streamablehttp/)
- [Build an MCP server - Model Context Protocol](https://modelcontextprotocol.io/docs/develop/build-server)

### Semantic Search and Embeddings

- [Tool search with embeddings](https://platform.claude.com/cookbook/tool-use-tool-search-with-embeddings)
- [Semantic search with embeddings: index anything | by Romain Beaumont | Medium](https://rom1504.medium.com/semantic-search-with-embeddings-index-anything-8fb18556443c)
- [Mixing embedding services? - API - OpenAI Developer Community](https://community.openai.com/t/mixing-embedding-services/707855)
- [/embeddings | liteLLM](https://docs.litellm.ai/docs/embedding/supported_embedding)
- [Choosing the Right Embedding Model: A Guide for LLM Applications | by Ryan Nguyen | Medium](https://medium.com/@ryanntk/choosing-the-right-embedding-model-a-guide-for-llm-applications-7a60180d28e3)

### SQLite Vector Storage

- [SQLite Performance Optimization - Guide 2026](https://forwardemail.net/en/blog/docs/sqlite-performance-optimization-pragma-chacha20-production-guide)
- [How sqlite-vec Works for Storing and Querying Vector Embeddings | by Stephen Collins | Medium](https://medium.com/@stephenc211/how-sqlite-vec-works-for-storing-and-querying-vector-embeddings-165adeeeceea)
- [How to Use SQLite in Node.js Applications](https://oneuptime.com/blog/post/2026-02-02-sqlite-nodejs/view)
- [GitHub - WiseLibs/better-sqlite3: The fastest and simplest library for SQLite3 in Node.js.](https://github.com/WiseLibs/better-sqlite3)
- [GitHub - asg017/sqlite-vec: A vector search SQLite extension that runs anywhere!](https://github.com/asg017/sqlite-vec)
- [Using sqlite-vec in Node.js, Deno, and Bun | sqlite-vec](https://alexgarcia.xyz/sqlite-vec/js.html)

### Document Chunking

- [Chunking Strategies for LLM Applications | Pinecone](https://www.pinecone.io/learn/chunking-strategies/)
- [Chunking for RAG: best practices | Unstructured](https://unstructured.io/blog/chunking-for-rag-best-practices)
- [Chunking Strategies to Improve LLM RAG Pipeline Performance | Weaviate](https://weaviate.io/blog/chunking-strategies-for-rag)
- [Best Chunking Strategies for RAG in 2025](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025)
- [Breaking up is hard to do: Chunking in RAG applications - Stack Overflow](https://stackoverflow.blog/2024/12/27/breaking-up-is-hard-to-do-chunking-in-rag-applications/)

### Semantic Search Quality

- [Better RAG Retrieval — Similarity with Threshold | by Meisin Lee | Medium](https://meisinlee.medium.com/better-rag-retrieval-similarity-with-threshold-a6dbb535ef9e)
- [Rule of thumb cosine similarity thresholds? - API - OpenAI Developer Community](https://community.openai.com/t/rule-of-thumb-cosine-similarity-thresholds/693670)
- [Mastering Semantic Search with Cosine Similarity](https://www.myscale.com/blog/implementing-cosine-similarity-semantic-search-step-by-step-guide/)
- [Relevance Filtering for Embedding-based Retrieval](https://arxiv.org/html/2408.04887v1)

### LLM Hallucinations

- [Detecting hallucinations in large language models using semantic entropy | Nature](https://www.nature.com/articles/s41586-024-07421-0)
- [How do I reduce hallucinations in LLM responses using semantic search?](https://milvus.io/ai-quick-reference/how-do-i-reduce-hallucinations-in-llm-responses-using-semantic-search)
- [Reducing LLM Hallucinations: A Developer's Guide | Zep](https://www.getzep.com/ai-agents/reducing-llm-hallucinations/)
- [Reducing hallucinations in LLM agents with a verified semantic cache using Amazon Bedrock Knowledge Bases | Artificial Intelligence](https://aws.amazon.com/blogs/machine-learning/reducing-hallucinations-in-llm-agents-with-a-verified-semantic-cache-using-amazon-bedrock-knowledge-bases/)

### MCP Resources and Pagination

- [Pagination - Model Context Protocol](https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/pagination)
- [15 Best Practices for Building MCP Servers in Production - The New Stack](https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/)
- [Designing MCP servers for wide schemas and large result sets](https://axiom.co/blog/designing-mcp-servers-for-wide-events)
- [Handling Large Datasets with Pagination | GraphAcademy](https://graphacademy.neo4j.com/courses/genai-mcp-build-custom-tools-python/2-database-features/9-pagination/)

### Cache Invalidation

- [Caching in 2026: Fundamentals, Invalidation, and Why It Matters More Than Ever | by Lukas Niessen | Feb, 2026 | Medium](https://lukasniessen.medium.com/caching-in-2026-fundamentals-invalidation-and-why-it-matters-more-than-ever-867fee46e98b)
- [Master Your System Design Interview: In-Depth Guide to Cache Invalidation Strategies](https://www.designgurus.io/blog/cache-invalidation-strategies)
- [LLMOps Guide 2026: Build Fast, Cost-Effective LLM Apps](https://redis.io/blog/large-language-model-operations-guide/)

### Vector Database Schema

- [How to Fix the Common Gemini & LangChain Embedding Dimension Mismatch (768 vs. 3072) | by Henil Suhagiya | Medium](https://medium.com/@henilsuhagiya0/how-to-fix-the-common-gemini-langchain-embedding-dimension-mismatch-768-vs-3072-6eb1c468729b)
- [Dealing with Vector Dimension Mismatch: My Experience with OpenAI Embeddings and Qdrant Vector Storage | by Evangelos Pappas | Medium](https://medium.com/@epappas/dealing-with-vector-dimension-mismatch-my-experience-with-openai-embeddings-and-qdrant-vector-20a6e13b6d9f)

---

_Pitfalls research for: Adding MCP Server + Semantic Search to handover CLI_
_Researched: 2026-02-20_
