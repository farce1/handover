# Roadmap: Handover

## Milestones

- ✅ **v1.0 OSS Excellence** — Phases 1-3 (shipped 2026-02-18)
- ✅ **v2.0 Performance** — Phases 4-7 (shipped 2026-02-19)
- ✅ **v3.0 Robustness** — Phases 8-11 (shipped 2026-02-20)
- 🚧 **v4.0 MCP Server & Semantic Search** — Phases 12-15 (in progress)

## Phases

<details>
<summary>✅ v1.0 OSS Excellence (Phases 1-3) — SHIPPED 2026-02-18</summary>

- [x] Phase 1: Community Health (2/2 plans) — completed 2026-02-18
- [x] Phase 2: CI/CD Automation (4/4 plans) — completed 2026-02-18
- [x] Phase 3: Docs and LLM Accessibility (3/3 plans) — completed 2026-02-18

</details>

<details>
<summary>✅ v2.0 Performance (Phases 4-7) — SHIPPED 2026-02-19</summary>

- [x] Phase 4: Cache Correctness (2/2 plans) — completed 2026-02-18
- [x] Phase 5: UX Responsiveness (2/2 plans) — completed 2026-02-19
- [x] Phase 6: Context Efficiency (3/3 plans) — completed 2026-02-19
- [x] Phase 7: Cache Savings Pipeline Fix (1/1 plan) — completed 2026-02-19

</details>

<details>
<summary>✅ v3.0 Robustness (Phases 8-11) — SHIPPED 2026-02-20</summary>

- [x] Phase 8: CI Fix, Scorecard Hardening, and Test Infrastructure (3/3 plans) — completed 2026-02-19
- [x] Phase 9: Code Hardening and Pure Function Tests (3/3 plans) — completed 2026-02-19
- [x] Phase 10: Algorithm and Validation Tests (2/2 plans) — completed 2026-02-19
- [x] Phase 11: AI Round Tests and Coverage Enforcement (2/2 plans) — completed 2026-02-20

</details>

### 🚧 v4.0 MCP Server & Semantic Search (In Progress)

**Milestone Goal:** Make handover's generated documentation queryable by AI coding tools via an MCP server with semantic search, LLM-powered Q&A, raw analysis data access, and remote regeneration.

This roadmap transforms handover from a documentation generator into a queryable knowledge base accessible via Model Context Protocol. Four phases deliver: (1) vector storage foundation with embeddings and SQLite, (2) CLI-based semantic search for quality validation, (3) MCP server exposing docs and search via stdio transport, and (4) LLM-powered Q&A with RAG synthesis plus workflow prompts.

- [ ] **Phase 12: Vector Storage Foundation** - Embeddings, chunking, SQLite vector storage, incremental indexing
- [ ] **Phase 13: Query Engine + CLI Search** - Semantic search engine, CLI search command, relevance ranking
- [ ] **Phase 14: MCP Server (Tools + Resources)** - MCP stdio server, semantic_search tool, document resources, client config docs
- [ ] **Phase 15: LLM Q&A + Advanced Features** - RAG-powered Q&A, workflow prompts, hybrid search, reindex command

#### Phase 12: Vector Storage Foundation

**Goal**: User's generated documentation is automatically chunked and embedded into a SQLite vector database with change-detection and validation
**Depends on**: Nothing (extends existing handover architecture)
**Requirements**: STORE-01, STORE-02, STORE-03, STORE-04, STORE-05, STORE-06
**Success Criteria** (what must be TRUE):

1. User runs `handover generate` and sees embeddings created from 14 output documents with progress indicator
2. User finds `.handover/search.db` SQLite database with vec0 virtual table containing document chunks and embeddings
3. User regenerates docs with unchanged files and sees "Skipped N unchanged documents" via content-hash detection
4. User's code blocks, tables, and markdown headers remain intact in chunked text (no mid-block splits)
5. User switches embedding models and receives validation error on startup with clear remediation steps

**Plans:** 3 plans

Plans:

- [ ] 12-01-PLAN.md — Config schema, vector types, SQLite schema, VectorStore class
- [ ] 12-02-PLAN.md — Markdown-aware document chunker (TDD)
- [ ] 12-03-PLAN.md — Embedding provider, reindex orchestrator, CLI command, progress bar

#### Phase 13: Query Engine + CLI Search

**Goal**: User can search their generated documentation from the command line and receive ranked, relevant results
**Depends on**: Phase 12 (vector storage must exist)
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04
**Success Criteria** (what must be TRUE):

1. User runs `handover search "authentication flow"` and receives top-k most relevant chunks with scores
2. User sees source filename, section header, and relevance score for each search result
3. User filters results with `--type architecture` or `--type api` to narrow search scope
4. User searches with generic query and sees results from multiple document types ranked by relevance
   **Plans**: TBD

Plans:

- [ ] 13-01: TBD
- [ ] 13-02: TBD

#### Phase 14: MCP Server (Tools + Resources)

**Goal**: AI coding tools can connect to handover via MCP protocol to search docs and access generated content
**Depends on**: Phase 13 (search engine must work)
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-07
**Success Criteria** (what must be TRUE):

1. User runs `handover serve` and sees "MCP server listening on stdio" with no stdout corruption
2. User's Claude Desktop connects via stdio transport and lists handover://docs/\* resources (14 markdown documents)
3. User's Claude Desktop uses semantic_search tool and receives relevant chunks from documentation
4. User's Claude Desktop accesses raw analysis data resources (file tree, dependency graph, git history)
5. User runs `handover serve` with missing docs and sees prompt to run `handover generate` first
6. User follows docs/user/mcp-setup.md and successfully configures Claude Desktop, Cursor, or VS Code
   **Plans**: TBD

Plans:

- [ ] 14-01: TBD
- [ ] 14-02: TBD

#### Phase 15: LLM Q&A + Advanced Features

**Goal**: User receives natural language answers synthesized from documentation with citation, plus workflow prompts and reindexing control
**Depends on**: Phase 14 (MCP server must work)
**Requirements**: QA-01, QA-02, QA-03, QA-04, MCP-06
**Success Criteria** (what must be TRUE):

1. User asks "How does the DAG orchestrator work?" and receives LLM-synthesized answer citing specific document sections
2. User's Q&A reuses their configured handover LLM provider (no separate API key setup required)
3. User runs `handover search --mode=fast` for quick semantic search or `--mode=qa` for LLM synthesis
4. User triggers MCP prompt "Explain architecture" and receives multi-turn workflow with structured questions
5. User runs `handover reindex` to manually regenerate embeddings after config changes
   **Plans**: TBD

Plans:

- [ ] 15-01: TBD
- [ ] 15-02: TBD

## Progress

| Phase                              | Milestone | Plans Complete | Status      | Completed  |
| ---------------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Community Health                | v1.0      | 2/2            | Complete    | 2026-02-18 |
| 2. CI/CD Automation                | v1.0      | 4/4            | Complete    | 2026-02-18 |
| 3. Docs and LLM Accessibility      | v1.0      | 3/3            | Complete    | 2026-02-18 |
| 4. Cache Correctness               | v2.0      | 2/2            | Complete    | 2026-02-18 |
| 5. UX Responsiveness               | v2.0      | 2/2            | Complete    | 2026-02-19 |
| 6. Context Efficiency              | v2.0      | 3/3            | Complete    | 2026-02-19 |
| 7. Cache Savings Pipeline Fix      | v2.0      | 1/1            | Complete    | 2026-02-19 |
| 8. CI Fix, Scorecard, Test Infra   | v3.0      | 3/3            | Complete    | 2026-02-19 |
| 9. Code Hardening and Pure Tests   | v3.0      | 3/3            | Complete    | 2026-02-19 |
| 10. Algorithm and Validation Tests | v3.0      | 2/2            | Complete    | 2026-02-19 |
| 11. AI Round Tests and Coverage    | v3.0      | 2/2            | Complete    | 2026-02-20 |
| 12. Vector Storage Foundation      | v4.0      | 0/3            | Planned     | -          |
| 13. Query Engine + CLI Search      | v4.0      | 0/TBD          | Not started | -          |
| 14. MCP Server (Tools + Resources) | v4.0      | 0/TBD          | Not started | -          |
| 15. LLM Q&A + Advanced Features    | v4.0      | 0/TBD          | Not started | -          |
