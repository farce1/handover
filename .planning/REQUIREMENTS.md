# Requirements: Handover MCP Server & Semantic Search

**Defined:** 2026-02-20
**Core Value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

## v4.0 Requirements

Requirements for MCP server and semantic search milestone. Each maps to roadmap phases.

### Vector Storage & Indexing

- [ ] **STORE-01**: User can generate embeddings from handover's 14 output documents using configured LLM provider
- [ ] **STORE-02**: User's embeddings are stored in a SQLite database with sqlite-vec extension at `.handover/search.db`
- [ ] **STORE-03**: User's documents are chunked with markdown-aware splitting that preserves code blocks, tables, and headers
- [ ] **STORE-04**: User can reindex documents with `handover reindex` command
- [ ] **STORE-05**: User's unchanged documents are skipped during reindex via content-hash change detection
- [ ] **STORE-06**: User's embedding model and dimension are stored in schema metadata and validated on startup

### Search

- [x] **SRCH-01**: User can search generated docs with `handover search "query"` CLI command
- [x] **SRCH-02**: User receives top-k most relevant document chunks ranked by cosine similarity
- [x] **SRCH-03**: User can filter search results by document type or metadata
- [x] **SRCH-04**: User sees source file, section, and relevance score for each search result

### MCP Server

- [x] **MCP-01**: User can start an MCP server with `handover serve` using stdio transport
- [x] **MCP-02**: User can access all 14 generated documents as MCP resources
- [x] **MCP-03**: User can access raw analysis data (file tree, dependency graph, git history) as MCP resources
- [x] **MCP-04**: User can search docs via MCP `semantic_search` tool
- [x] **MCP-05**: User is prompted to generate docs when `handover serve` detects missing output
- [x] **MCP-06**: User can use pre-built MCP prompts for common workflows (explain architecture, find security concerns, understand dependencies)
- [x] **MCP-07**: User has documentation for configuring MCP client in Claude Desktop, Cursor, and VS Code

### LLM Q&A

- [x] **QA-01**: User can ask natural language questions and receive LLM-synthesized answers grounded in generated docs
- [x] **QA-02**: User's Q&A reuses configured handover LLM provider (no separate setup)
- [x] **QA-03**: User can choose between fast semantic search (default) and LLM-synthesized answers
- [x] **QA-04**: User receives answers that cite specific source documents and sections

## v5.0 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Remote & Advanced

- **RMT-01**: User can trigger doc regeneration via MCP tool
- **RMT-02**: User can access MCP server via HTTP transport for remote deployment
- **RMT-03**: User can generate embeddings with local models (Ollama) for offline use
- **RMT-04**: User receives streaming MCP responses for long Q&A answers

## Out of Scope

| Feature                                     | Reason                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Real-time file watching with auto-reindex   | Battery drain, race conditions with git; use explicit `handover reindex`    |
| Semantic chunking with embedding boundaries | 3-5x more vectors, minimal accuracy gain per 2026 benchmarks                |
| Custom vector search implementation         | sqlite-vec provides SIMD-accelerated cosine similarity                      |
| GraphQL/REST API                            | Scope creep; handover is CLI tool, not web service                          |
| Multimodal embeddings                       | Handover generates text only; defer until visual artifacts exist            |
| HTTP transport with auth/TLS                | stdio covers all AI coding tools; add HTTP when users request remote access |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase    | Status  |
| ----------- | -------- | ------- |
| STORE-01    | Phase 12 | Pending |
| STORE-02    | Phase 12 | Pending |
| STORE-03    | Phase 12 | Pending |
| STORE-04    | Phase 12 | Pending |
| STORE-05    | Phase 12 | Pending |
| STORE-06    | Phase 12 | Pending |
| SRCH-01     | Phase 13 | Complete |
| SRCH-02     | Phase 13 | Complete |
| SRCH-03     | Phase 13 | Complete |
| SRCH-04     | Phase 13 | Complete |
| MCP-01      | Phase 14 | Complete |
| MCP-02      | Phase 14 | Complete |
| MCP-03      | Phase 14 | Complete |
| MCP-04      | Phase 14 | Complete |
| MCP-05      | Phase 14 | Complete |
| MCP-06      | Phase 15 | Complete |
| MCP-07      | Phase 14 | Complete |
| QA-01       | Phase 15 | Complete |
| QA-02       | Phase 15 | Complete |
| QA-03       | Phase 15 | Complete |
| QA-04       | Phase 15 | Complete |

**Coverage:**

- v4.0 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

100% coverage validated.

---

_Requirements defined: 2026-02-20_
_Last updated: 2026-02-20 after roadmap creation_
