# Phase 12: Vector Storage Foundation - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Automatically chunk and embed handover's 14 generated markdown documents into a SQLite vector database (`.handover/search.db`) with content-hash change detection and embedding dimension validation. This phase delivers the storage foundation — search, CLI, and MCP server are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Embedding providers

- Cloud-only providers for now (OpenAI, etc.) — local/offline embedding support deferred to future work
- Database location fixed at `.handover/search.db` inside existing output directory

### Progress reporting

- Progress bar during embedding (showing chunks processed across 14 documents)

### Claude's Discretion

- **Chunking strategy**: Research best practices for technical markdown documentation. Choose between header-based, fixed-token, or hybrid approach. Optimize for retrieval quality over simplicity
- **Chunk metadata**: Include whatever metadata improves downstream search result quality (source file, section path, doc type, chunk index)
- **Code block / table boundaries**: Pick the approach that best preserves retrieval quality — never splitting, overlap duplication, or hybrid
- **Chunk overlap**: Research optimal overlap strategy for technical documentation and apply
- **Provider config architecture**: Decide whether to reuse existing LLM provider config or create separate embedding config — balance simplicity with flexibility
- **Indexing trigger**: Decide whether embedding happens automatically after `handover generate` or via separate command — fit existing workflow patterns
- **Model switch behavior**: Pick the safest approach that doesn't surprise the user when embedding dimensions change (error + instructions vs auto-rebuild)

</decisions>

<specifics>
## Specific Ideas

- User wants best-in-class, future-proof solutions — research industry best practices and apply
- Handover already has LLM provider config, AnalysisCache with content-hash pattern, and BaseProvider with retry/rate-limit — leverage existing patterns
- 14 output documents of varying types (architecture, API, dependency analysis, etc.) — chunking should handle different document structures well

</specifics>

<deferred>
## Deferred Ideas

- Local/offline embedding support (e.g., ONNX models) — future enhancement
- No other scope creep — discussion stayed within phase scope

</deferred>

---

_Phase: 12-vector-storage-foundation_
_Context gathered: 2026-02-21_
