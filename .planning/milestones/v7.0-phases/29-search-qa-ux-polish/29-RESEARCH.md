# Phase 29: Search & QA UX Polish - Research

**Researched:** 2026-03-02
**Domain:** CLI terminal output formatting, OSC8 hyperlinks, vector store queries, MCP tool response shaping
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Quality Warning Signals
- Inline text warning displayed above results when best-match cosine distance exceeds threshold
- Show numeric distance value: `⚠ Low relevance (distance: 0.82). Try a more specific query or different --type`
- Warning includes actionable suggestion (not just a flag)

#### Zero-Results Experience
- Show both available doc types AND query tips together
- Doc types sourced live from the vector store at runtime (not hardcoded)
- Include total indexed document count: `No results found (42 documents indexed). Available types: ...`
- When index is completely empty (0 documents), specifically suggest running `handover generate` first

#### QA Stats Presentation
- Stats appear as a footer after the answer, not before
- Dimmed/muted visual styling (chalk.dim or similar) — present but not distracting
- Include full stats: time + tokens + sources count
- List the actual source files used after the stats line

#### Search Result Layout
- Keep current result display behavior — only add the new signals (warnings, links, OSC8)
- Do not add content snippets/previews to search results

### Claude's Discretion
- Distance threshold for quality warning (tune based on testing the search implementation)
- OSC8 link target format (file path vs file path + line number — whatever the spec supports well)
- `--type` values format in `handover search --help` (match existing CLI help style)
- MCP `content` field format (raw text vs markdown — based on what the vector store already stores)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 29 is a pure polish phase — no new search capabilities, only output improvements. The work touches three distinct surfaces: (1) the `handover search` CLI command output in `src/cli/search.ts`, (2) the vector store query layer in `src/vector/query-engine.ts` and `src/vector/vector-store.ts`, and (3) the MCP `semantic_search` tool response in `src/mcp/tools.ts`.

The codebase already has `picocolors` installed and consistently used for terminal styling (`pc.dim`, `pc.bold`, `pc.yellow` etc). The `formatTokens` and `formatDuration` helpers in `src/ui/formatters.ts` already exist and are ready to use for QA stats. The `CompletionResult` type from providers includes both `usage` (inputTokens + outputTokens) and `duration` — these need to be threaded through `answerQuestion()` to the CLI layer.

OSC8 hyperlinks require no new npm package. The escape sequence can be hand-rolled in a small utility function (approximately 3 lines) since the project already avoids heavy dependencies. The format is: `\x1B]8;;{url}\x1B\\{text}\x1B]8;;\x1B\\` where the URL for a local file is `file://{absolutePath}`. TTY gating is already established in `search.ts` via `process.stdout.isTTY`.

**Primary recommendation:** All changes are localised to 4–5 files. The main coordination challenge is extending `AnswerQuestionResult` to carry timing/token stats without breaking the streaming QA path, and adding `getDistinctDocTypes()` to `VectorStore` for runtime zero-results guidance.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| picocolors | ^1.1.0 (installed) | Terminal colour/dim styling | Already the project standard; used in `search.ts`, `init.ts`, `components.ts` |
| commander | ^14.0.3 (installed) | CLI option definition including `--type` help text | Already used for all CLI commands |
| better-sqlite3 | ^12.6.2 (installed) | Querying distinct doc types from vector DB | Already the DB driver used throughout vector layer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | OSC8 links are hand-rolled (3-line utility) | No new deps needed — escape sequence is trivial |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled OSC8 | `terminal-link` npm package | terminal-link + supports-hyperlinks adds 2 deps; hand-rolled is ~3 lines and sufficient for file:// paths. Project avoids unnecessary deps. |
| Hand-rolled OSC8 | `ansi-escapes` package | Same dep-weight concern; the full escape sequence is well-documented and stable. |

**Installation:**
```bash
# No new dependencies required
```

---

## Architecture Patterns

### Recommended Project Structure

No new files needed. All changes are modifications to existing files:

```
src/
├── cli/search.ts          # Add warning signal, OSC8 links, zero-results guidance
├── cli/index.ts           # Add --type values to help text
├── vector/
│   ├── query-engine.ts    # Extend result shape (availableDocTypes), thread distance
│   └── vector-store.ts    # Add getDistinctDocTypes() method
├── qa/answerer.ts         # Extend AnswerQuestionResult to include usage + duration
└── mcp/tools.ts           # Extend semantic_search response with content + docType fields
```

### Pattern 1: picocolors `dim` for Muted Footer Text

**What:** Use `pc.dim(text)` for QA stats footer to keep it visible-but-quiet.
**When to use:** Any secondary metadata that should not distract from the primary content.
**Example:**
```typescript
// Source: existing usage in src/ui/components.ts and src/cli/estimate.ts
import pc from 'picocolors';

// QA footer pattern
const sep = pc.dim(' · ');
const footer = pc.dim(`${time}${sep}${tokens}${sep}${sourcesCount} sources`);
console.log(footer);
```

### Pattern 2: picocolors `yellow` for Warnings

**What:** Use `pc.yellow(text)` for the distance warning, matching the existing retry warning pattern.
**When to use:** Warnings that should be visible but not alarming.
**Example:**
```typescript
// Source: existing usage in src/ui/components.ts line 430
import pc from 'picocolors';
import { SYMBOLS } from '../ui/formatters.js';

// Warning pattern (SYMBOLS.warning = '⚠' or '[!]' under NO_COLOR)
const warn = `${pc.yellow(SYMBOLS.warning)} Low relevance (distance: ${distance.toFixed(2)}). Try a more specific query or different --type`;
console.log(warn);
console.log();
```

### Pattern 3: OSC8 Clickable File Links (Hand-Rolled)

**What:** Emit OSC8 escape sequences for clickable file paths in TTY environments.
**When to use:** Only when `process.stdout.isTTY === true` (already gated in `search.ts`).
**Example:**
```typescript
// Source: OSC8 spec https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
// Format: ESC ] 8 ; ; URI ST text ESC ] 8 ; ; ST
function osc8Link(text: string, url: string): string {
  return `\x1B]8;;${url}\x1B\\${text}\x1B]8;;\x1B\\`;
}

// Usage for file paths (file:// scheme required for local files)
function formatSourceLink(filePath: string, isTty: boolean): string {
  if (!isTty) return filePath;
  const url = `file://${filePath}`;  // absolute path required
  return osc8Link(filePath, url);
}
```

**Important:** The file path in the `source:` field of search results is currently a relative path (e.g., `03-ARCHITECTURE.md`). To produce a valid `file://` URL, the absolute path must be resolved using the output directory. The `match.sourceFile` value comes from the DB as a relative path stored at index time.

### Pattern 4: Commander `addHelpText` for --type Values

**What:** Use commander's `.addHelpText('after', ...)` or the option description itself to list valid `--type` values.
**When to use:** Static list of valid values that belongs in the option description.
**Example:**
```typescript
// Source: src/cli/index.ts — existing addHelpText pattern at line 101-104
// Match the existing style: enumerate in the option description string
.option(
  '--type <type>',
  `Filter by document type (repeatable). Valid types: project-overview, getting-started, architecture, file-structure, features, modules, dependencies, environment, edge-cases-and-gotchas, tech-debt-and-todos, conventions, testing-strategy, deployment`,
  (value, previous: string[]) => [...previous, value],
  [],
)
```

### Pattern 5: VectorStore `getDistinctDocTypes()` Method

**What:** Query `DISTINCT doc_type` from the vector store for live zero-results guidance.
**When to use:** Only when `totalMatches === 0` after a query.
**Example:**
```typescript
// Source: pattern consistent with existing getChunkCount() in vector-store.ts
getDistinctDocTypes(): string[] {
  if (!this.db) throw new Error('Database not open. Call open() first.');
  const rows = this.db
    .prepare('SELECT DISTINCT doc_type FROM vec_chunks ORDER BY doc_type ASC')
    .all() as Array<{ doc_type: string }>;
  return rows.map((row) => row.doc_type);
}
```

**Note on sqlite-vec virtual table:** `vec_chunks` is a `vec0` virtual table. `DISTINCT` on auxiliary columns (prefixed with `+`) may have limitations. `doc_type` is a non-auxiliary indexed column (no `+` prefix in schema), so `DISTINCT doc_type` is safe. Verified from `src/vector/schema.ts` line 44: `doc_type TEXT NOT NULL`.

### Pattern 6: `AnswerQuestionResult` Extended with Stats

**What:** Thread `usage` and `duration` from `CompletionResult` into the QA result.
**When to use:** QA mode only. Stats are not applicable to fast/retrieval mode.
**Example:**
```typescript
// Extend AnswerQuestionResult in src/qa/answerer.ts
export type AnswerQuestionResult =
  | {
      mode: 'qa';
      kind: 'answer';
      query: string;
      answer: QaAnswer;
      stats: {
        durationMs: number;
        inputTokens: number;
        outputTokens: number;
        sourcesCount: number;
      };
    }
  | { /* clarification shape unchanged */ };

// In answerQuestion(), after provider.complete():
const answer = qaAnswerSchema.parse({ answer: synthesis.data.answer, citations });
return {
  mode: 'qa',
  kind: 'answer',
  query: searchResult.query,
  answer,
  stats: {
    durationMs: synthesis.duration,
    inputTokens: synthesis.usage.inputTokens,
    outputTokens: synthesis.usage.outputTokens,
    sourcesCount: citations.length,
  },
};
```

**The `CompletionResult` already has `duration` (ms) and `usage.inputTokens` / `usage.outputTokens` — this is just plumbing.**

### Pattern 7: MCP Response `content` and `docType` Fields

**What:** Add `content` (top 3 match text) and `docType` (per-result) to MCP `semantic_search` response.
**When to use:** Always in `semantic_search` — but limit `content` to top 3 results only.
**Example:**
```typescript
// In src/mcp/tools.ts, extend the toolResult object
const toolResult = {
  ok: true,
  query: result.query,
  limit: result.topK,
  total: result.totalMatches,
  results: result.matches.map((match, index) => ({
    relevance: match.relevance,
    source: match.sourceFile,
    section: match.sectionPath,
    docType: match.docType,                          // NEW: always included
    snippet: match.contentPreview,
    content: index < 3 ? match.content : undefined, // NEW: top 3 only
  })),
};
```

**The `match.content` field already exists in `SearchDocumentMatch` — no query changes needed.**

### Anti-Patterns to Avoid

- **Hardcoded doc types for zero-results:** The decision is live-queried from the vector store. Do not fall back to the hardcoded `KNOWN_DOC_TYPES` constant from `query-engine.ts` for the zero-results display — query the DB.
- **Warning before fetching results:** The distance warning requires seeing the actual best-match distance. Check after the search completes, not before.
- **Absolute path in sourceFile:** `match.sourceFile` is stored as a relative path (e.g., `03-ARCHITECTURE.md`). Resolve against the output directory for OSC8 `file://` URL construction.
- **Non-TTY OSC8 emission:** The existing `isTty` boolean in `runSearch()` already gates styling. OSC8 links MUST follow the same gate.
- **Stats on clarification response:** The clarification path in QA does not call `provider.complete()`, so there is no `usage` or `duration`. Do not add stats to clarification responses.
- **Content in all MCP results:** Cap `content` to top 3 only. Full content for all results risks 25KB+ payloads that overwhelm MCP clients.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token count formatting | Custom formatter | `formatTokens()` from `src/ui/formatters.ts` | Already exists: handles K/M suffixes |
| Duration formatting | Custom formatter | `formatDuration()` from `src/ui/formatters.ts` | Already exists: handles minutes+seconds |
| Dim styling | Custom ANSI codes | `pc.dim()` from picocolors | Project standard; handles NO_COLOR gracefully |
| Warning symbol | Unicode directly | `SYMBOLS.warning` from `src/ui/formatters.ts` | Degrades to `[!]` under NO_COLOR automatically |
| TTY detection | Custom env check | `Boolean(process.stdout.isTTY)` | Already the pattern in `search.ts` line 226 |

**Key insight:** The formatting infrastructure is complete. This phase wires existing utilities into new output positions — not build new infrastructure.

---

## Common Pitfalls

### Pitfall 1: sqlite-vec Virtual Table DISTINCT Query
**What goes wrong:** `SELECT DISTINCT` on a sqlite-vec `vec0` virtual table may not work on vector columns, but works fine on auxiliary text columns.
**Why it happens:** sqlite-vec virtual tables have constraints on what SQL operations work on them.
**How to avoid:** `doc_type` is a non-auxiliary indexed column (no `+` prefix), not a vector column — DISTINCT is supported. Verified from schema in `src/vector/schema.ts`. The `content` and `section_path` columns ARE prefixed with `+` (auxiliary) — avoid DISTINCT on those.
**Warning signs:** SQL error "no such column" or "unsupported operation" on the virtual table.

### Pitfall 2: Relative vs Absolute Source File Paths for OSC8
**What goes wrong:** `file://03-ARCHITECTURE.md` is not a valid file URL — terminals silently ignore invalid URLs.
**Why it happens:** `match.sourceFile` in search results is stored as a relative filename (e.g. `03-ARCHITECTURE.md`), not an absolute path.
**How to avoid:** Resolve the absolute path using the output directory at display time: `path.resolve(outputDir, match.sourceFile)`. The `outputDir` is available in `searchDocuments()` input and flows through the result.
**Warning signs:** Link appears underlined in terminal but clicking does nothing.

### Pitfall 3: QA Stats Not Available for Clarification Path
**What goes wrong:** Adding stats to `AnswerQuestionResult` and trying to access them on the clarification branch causes a type error or undefined access.
**Why it happens:** The clarification path returns early before calling `provider.complete()`, so no `CompletionResult` is produced.
**How to avoid:** Add `stats` only to the `kind: 'answer'` branch of the union type. The CLI renderer already branches on `result.kind` — add stats rendering only in the `answer` branch.
**Warning signs:** TypeScript error "Property 'stats' does not exist on type with kind='clarification'".

### Pitfall 4: Distance Threshold Needs Empirical Tuning
**What goes wrong:** A threshold chosen without testing produces either too many false warnings (threshold too low) or never fires (threshold too high).
**Why it happens:** Cosine distance semantics depend on the embedding model and corpus. OpenAI `text-embedding-3-small` typically has good distances in the 0.0–0.4 range for semantic matches; poor matches appear at 0.6+.
**How to avoid:** Start with a threshold around 0.65–0.75 and test against real search queries. The `match.distance` field in `SearchDocumentMatch` gives the raw cosine distance. The `toRelevance()` function in `query-engine.ts` converts: `relevance = (1 - distance/2) * 100`. A distance of 0.65 = relevance of ~67.5%. A distance of 0.80 = relevance of 60%.
**Warning signs:** Warning fires on clearly relevant results, or never fires even on garbage queries.

### Pitfall 5: MCP Schema Validation After Adding Fields
**What goes wrong:** `tools.test.ts` has snapshot/shape assertions on the `semantic_search` result that will fail when new fields (`content`, `docType`) are added.
**Why it happens:** The existing test at line 491 uses `expect.objectContaining` but the nested `results` array items may have stricter assertions.
**How to avoid:** Update the test to expect the new fields. Check `tools.test.ts` around line 460–499 and update result shape expectations.
**Warning signs:** `vitest` test failure on `semantic_search returns structured success payload`.

---

## Code Examples

Verified patterns from official sources and codebase:

### OSC8 Escape Sequence (Self-Contained)
```typescript
// Source: OSC8 spec https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
// ESC ] 8 ; params ; URI ST  display-text  ESC ] 8 ; ; ST
// ESC = \x1B, ST = \x1B\\ (ESC + backslash)
function osc8Link(text: string, url: string): string {
  return `\x1B]8;;${url}\x1B\\${text}\x1B]8;;\x1B\\`;
}
```

### Using Existing formatters.ts Utilities
```typescript
// Source: src/ui/formatters.ts (existing)
import { formatDuration, formatTokens, SYMBOLS } from '../ui/formatters.js';
import pc from 'picocolors';

// QA stats footer
const sep = pc.dim(' · ');
const statsLine = pc.dim(
  `${formatDuration(stats.durationMs)}${sep}${formatTokens(stats.inputTokens + stats.outputTokens)}${sep}${stats.sourcesCount} sources`
);
console.log(statsLine);
```

### Quality Warning with SYMBOLS
```typescript
// Source: pattern from src/ui/components.ts line 430 (existing retry warning)
import pc from 'picocolors';
import { SYMBOLS } from '../ui/formatters.js';

function printDistanceWarning(distance: number, isTty: boolean): void {
  const warn = `${pc.yellow(SYMBOLS.warning)} Low relevance (distance: ${distance.toFixed(2)}). Try a more specific query or different --type`;
  console.log(warn);
  console.log();
}
```

### Zero-Results with Live Doc Types
```typescript
// Pattern for runFastMode in src/cli/search.ts
// vectorStore.getDistinctDocTypes() returns live types from DB
if (result.totalMatches === 0) {
  const totalIndexed = vectorStore.getChunkCount(); // or pass through result
  if (totalIndexed === 0) {
    console.log('No results found. The search index is empty.');
    console.log('Run `handover generate` to create documentation, then `handover reindex`.');
  } else {
    const availableTypes = result.availableDocTypes.join(', ');
    console.log(`No results found (${result.totalIndexed} documents indexed). Available types: ${availableTypes}`);
    console.log();
    console.log('Try refining your query:');
    console.log('- Use more specific keywords');
    console.log('- Use --type to filter by a listed type');
  }
  return;
}
```

### Extended SearchDocumentsResult Shape
```typescript
// Extend SearchDocumentsResult in src/vector/query-engine.ts
export interface SearchDocumentsResult {
  query: string;
  topK: number;
  totalMatches: number;
  totalIndexed: number;         // NEW: total chunk count for zero-results message
  availableDocTypes: string[];  // NEW: live from DB, only when totalMatches === 0 (empty array otherwise)
  matches: SearchDocumentMatch[];
  filters: { types: string[] };
}
```

### Commander --type Help Text Pattern
```typescript
// Source: pattern from src/cli/index.ts addHelpText usage (line 101-104)
// Update the existing --type option description in index.ts
.option(
  '--type <type>',
  'Filter by document type (repeatable). Valid: project-overview, getting-started, architecture, file-structure, features, modules, dependencies, environment, edge-cases-and-gotchas, tech-debt-and-todos, conventions, testing-strategy, deployment',
  (value, previous: string[]) => [...previous, value],
  [],
)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hard-coded `file://` URLs with relative paths | Resolve to absolute before OSC8 link | Phase 29 | Terminals can actually navigate to the file |
| "No results found." bare message | Live doc types + indexed count in zero-results | Phase 29 | Users understand what is indexed and can refine |
| No quality signal on low-relevance results | Distance warning when best match > threshold | Phase 29 | Users know when to reformulate their query |
| QA answer with no timing/token info | Stats footer after answer | Phase 29 | Power users can evaluate cost and quality |
| MCP search result with snippet only | MCP result includes full `content` (top 3) + `docType` | Phase 29 | MCP clients get enough context to ground responses |

**No deprecated approaches** — this phase adds to existing patterns, not replaces them.

---

## Open Questions

1. **Distance threshold default value**
   - What we know: Cosine distance range is 0.0–2.0; OpenAI embeddings for semantic matches typically fall 0.0–0.45; poor matches appear at 0.6+
   - What's unclear: The exact distribution for this codebase's handover documents
   - Recommendation: Start at 0.65 as default threshold. Make it a named constant `QUALITY_WARNING_DISTANCE_THRESHOLD = 0.65` in `query-engine.ts` for easy tuning. Do NOT expose as CLI flag (out of scope per phase boundary).

2. **Source file path resolution for OSC8**
   - What we know: `match.sourceFile` is a relative filename like `03-ARCHITECTURE.md`; the output directory is available in the search input
   - What's unclear: Whether `outputDir` is always available when `runFastMode` is called
   - Recommendation: Thread the resolved `outputDir` through the search result OR resolve it in the CLI layer using `config.output` (already accessible in `runSearch()`).

3. **`availableDocTypes` performance when index is large**
   - What we know: `SELECT DISTINCT doc_type FROM vec_chunks` on a sqlite-vec virtual table for a typical handover output (~13 doc types) will be fast
   - What's unclear: Whether this query is efficient on large corpora (1000s of chunks)
   - Recommendation: Only execute this query when `totalMatches === 0`. Do not add it to the happy path. The result set is at most 13 rows.

4. **Streaming QA (`answerQuestion` vs `qa_stream_start`)**
   - What we know: There are two QA paths: `answerQuestion()` used by the CLI, and `qa_stream_start` MCP tool which uses `createQaStreamingSessionManager()`. The streaming path has its own result schema (`streaming-schema.ts`).
   - What's unclear: Whether the streaming QA session already surfaces `usage` + `duration` stats
   - Recommendation: Phase 29 stats requirement (`SRCH-05`) scopes to `handover search --mode qa` (CLI path only). The MCP streaming path is out of scope — verify this against the success criteria. Success criterion 5 says "handover search --mode qa output" — confirmed CLI only.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct reads: `src/cli/search.ts`, `src/vector/query-engine.ts`, `src/vector/vector-store.ts`, `src/vector/schema.ts`, `src/mcp/tools.ts`, `src/qa/answerer.ts`, `src/qa/schema.ts`, `src/domain/schemas.ts`, `src/ui/formatters.ts`, `src/providers/anthropic.ts`
- OSC8 specification: https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda — defines the exact escape sequence format
- picocolors API verified at runtime: `dim`, `yellow`, `bold`, `cyan` all present

### Secondary (MEDIUM confidence)
- `terminal-link` npm package (sindresorhus) — confirms OSC8 is the standard; delegates to `ansi-escapes.link()` + `supports-hyperlinks`. Outcome: hand-rolling is preferable for this project.
- WebSearch results confirming OSC8 terminal support in 2025 (VS Code, Windows Terminal, iTerm2, tmux 3.43+)

### Tertiary (LOW confidence)
- Distance threshold of 0.65 — derived from general knowledge of OpenAI embedding distance distributions; needs empirical validation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — picocolors, commander, better-sqlite3 are all installed; no new deps required
- Architecture: HIGH — all touch points identified by direct code inspection; change surfaces are small and localised
- OSC8 implementation: HIGH — escape sequence spec is stable and verified from authoritative source
- Distance threshold: LOW — requires empirical testing; flagged as Claude's Discretion in CONTEXT.md
- sqlite-vec DISTINCT query: HIGH — `doc_type` is a non-auxiliary column confirmed from schema source

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (stable domain — all deps are established and locked in package.json)
