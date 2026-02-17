# Phase 4: Context Window Management - Research

**Researched:** 2026-02-17
**Domain:** File priority scoring, token-budgeted content packing, oversized file sectioning, inter-round context compression
**Confidence:** HIGH

## Summary

Phase 4 builds the infrastructure that sits between Phase 3's static analysis output and Phase 5's AI analysis rounds. The core challenge is: given a finite token budget (determined by the LLM provider), decide which files get full content, which get signatures-only summaries, and which get skipped entirely. Files are scored 0-100 using six factors already available from Phase 3 data (entry point detection, import count, export count, git activity, edge case presence, config file status). The scored files are then packed into a token budget using a greedy top-down strategy with tier boundaries.

The technical domain is straightforward -- there are no external libraries needed beyond what is already installed. Token estimation uses the existing `LLMProvider.estimateTokens()` method (currently `Math.ceil(text.length / 4)` in the Anthropic provider). The token budget comes from `LLMProvider.maxContextTokens()` (currently 200,000). All scoring data comes from the `StaticAnalysisResult` produced by Phase 3's coordinator. The AST data from Phase 2/3 provides imports, exports, and function/class signatures for the "signatures-only" tier. Git history provides change frequency and file ownership for activity scoring.

The three key subsystems are: (1) a `FileScorer` that computes priority scores from Phase 3 data, (2) a `ContextPacker` that allocates token budget across three tiers (full/signatures/skip) using a greedy packing algorithm, and (3) a `ContextCompressor` that deterministically extracts structured fields from prior AI round output for inter-round context flow. Oversized files get two-pass treatment: first pass includes signatures and public API, second pass deep-dives important sections if budget allows. No new npm dependencies are required.

**Primary recommendation:** Build three pure-function modules (scorer, packer, compressor) that consume Phase 3 `StaticAnalysisResult` and produce a `PackedContext` structure ready for Phase 5 prompt assembly. Use the existing `LLMProvider` interface for token estimation and budget limits. No external tokenizer library needed -- the chars/4 heuristic is sufficient for budget planning (actual token counts come from Anthropic's API response `usage` field for billing accuracy).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Cross-round context flow
- Deterministic extraction for context compression -- no extra LLM calls for summarization between rounds
- Extract structured fields from prior round output (module list, key findings, relationships) rather than AI-powered summarization
- Track token usage per round and log warnings when approaching budget limits -- helps debugging and cost awareness

### Claude's Discretion

#### Scoring & weight balance
- Weighting of the six scoring factors (entry point detection, import count, export count, git activity, edge case presence, config file status)
- Whether to support manual file pinning/boosting in .handover.yml
- Whether scoring adapts to detected project type or stays universal
- Tiebreaker strategy for equal-scored files

#### Budget allocation strategy
- Distribution strategy (greedy top-down vs proportional tiers vs hybrid)
- Whether token budget is auto-detected from provider, user-configurable, or both
- Behavior for small projects that fit entirely within budget
- Treatment of test files, config files, and generated files relative to source code

#### Oversized file sectioning
- Threshold for triggering two-pass treatment (fixed token count vs budget percentage)
- Which sections get priority during deep-dive (exports/public API vs complex logic)
- Whether to reuse Phase 3 AST data or re-parse independently
- Handling of oversized but low-priority files (skip vs always two-pass)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (no new deps) | -- | All functionality built on existing project infrastructure | Phase 4 is pure computation over Phase 3 data. Token estimation uses the existing `LLMProvider.estimateTokens()`. File content reading uses `node:fs/promises`. Zod schemas extend the existing patterns |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^3.24.0 | Schema definitions for scoring results, packed context, compression output | All new types follow the project's Zod-first pattern |
| @anthropic-ai/sdk | ^0.39.0 | Token counting via `client.messages.countTokens()` API | Optional precise counting if rough estimate is insufficient (free API, 100+ RPM) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Math.ceil(text.length / 4)` heuristic | `gpt-tokenizer` npm package | gpt-tokenizer gives exact BPE token counts but uses OpenAI's tokenizer (cl100k_base), not Anthropic's. For budget planning, the chars/4 heuristic is within 10-15% accuracy, which is sufficient since we apply safety margins. Adding a 150KB dependency for marginal accuracy improvement is not worth it |
| `Math.ceil(text.length / 4)` heuristic | Anthropic `countTokens` API | Free and accurate, but requires network calls per file. For 500+ files, this adds seconds of latency. Better used for final validation of assembled prompts, not per-file estimation during packing |
| `@anthropic-ai/tokenizer` | Direct Anthropic tokenizer | Package is beta, only accurate for pre-Claude-3 models. Anthropic explicitly recommends against using it for Claude 3+ and suggests the countTokens API instead |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── context/
│   ├── types.ts              # Zod schemas: FilePriority, PackedContext, RoundContext, TokenBudget
│   ├── scorer.ts             # CTX-01/02: File priority scoring (0-100) from StaticAnalysisResult
│   ├── packer.ts             # CTX-01: Token-budgeted tier assignment (full/signatures/skip)
│   ├── compressor.ts         # CTX-04: Deterministic extraction for inter-round context
│   └── token-counter.ts      # Token estimation wrapper around LLMProvider.estimateTokens()
```

### Pattern 1: File Priority Scoring (CTX-01, CTX-02)
**What:** A pure function that takes `StaticAnalysisResult` and returns scored files sorted by priority. Each file gets a 0-100 score computed from six weighted factors. The scorer does NOT read file contents -- it uses only the metadata and AST data already extracted by Phase 3.
**When to use:** At the start of each AI analysis round, before packing.
**Example:**
```typescript
// Source: Requirements CTX-01, CTX-02
import type { StaticAnalysisResult, FileEntry } from '../analyzers/types.js';

export interface FilePriority {
  path: string;
  score: number;              // 0-100
  breakdown: ScoreBreakdown;  // Per-factor scores for debugging/logging
}

export interface ScoreBreakdown {
  entryPoint: number;     // 0 or 30
  importCount: number;    // +3 per importer, capped at 30
  exportCount: number;    // +2 per export, capped at 20
  gitActivity: number;    // +1 per commit, capped at 10
  edgeCases: number;      // 0 or 10
  configFile: number;     // 0 or 15
}

// The six factors from CTX-02, all computable from StaticAnalysisResult:
// 1. Entry point: detected from filename patterns (index.ts, main.ts, app.ts, etc.)
//    Data source: FileEntry.path + ParsedFile.exports (for default exports in index files)
// 2. Import count: how many other files import THIS file
//    Data source: ASTResult.files[].imports[].source (build reverse-import map)
// 3. Export count: how many symbols this file exports
//    Data source: ASTResult.files[].exports.length
// 4. Git activity: commit count touching this file in the analysis window
//    Data source: GitHistoryResult.mostChangedFiles (path -> changes mapping)
// 5. Edge case presence: whether this file contains TODOs/FIXMEs
//    Data source: TodoResult.items (file -> item count mapping)
// 6. Config file status: whether this is a configuration file
//    Data source: FileEntry.path pattern matching (*.config.*, .env*, etc.)
```

### Pattern 2: Token Budget and Tier Assignment (CTX-01)
**What:** A packer function that takes scored files, a token budget, and file contents, then assigns each file to a tier (full content / signatures-only / skipped) using a greedy top-down strategy. Files are sorted by score descending. Full-content files consume their actual token count. Signatures-only files consume a compressed representation. The packer stops adding files when the budget is exhausted.
**When to use:** After scoring, before prompt assembly.
**Example:**
```typescript
// Source: Project architecture
export type ContentTier = 'full' | 'signatures' | 'skip';

export interface PackedFile {
  path: string;
  tier: ContentTier;
  content: string;         // Full content, signature summary, or empty
  tokens: number;          // Estimated token count of the content field
  score: number;           // Original priority score
}

export interface PackedContext {
  files: PackedFile[];
  budget: TokenBudget;
  metadata: {
    totalFiles: number;
    fullFiles: number;
    signatureFiles: number;
    skippedFiles: number;
    usedTokens: number;
    budgetTokens: number;
    utilizationPercent: number;
  };
}

export interface TokenBudget {
  total: number;            // From LLMProvider.maxContextTokens()
  promptOverhead: number;   // System prompt + structural tokens (~2000-4000)
  outputReserve: number;    // Reserved for model output (~4096)
  fileContentBudget: number; // total - promptOverhead - outputReserve
}

// Greedy top-down packing algorithm:
// 1. Sort files by score descending
// 2. For each file:
//    a. Estimate full-content tokens
//    b. If fits in remaining budget -> tier = 'full'
//    c. Else estimate signatures-only tokens
//    d. If signatures fit -> tier = 'signatures'
//    e. Else -> tier = 'skip'
// 3. Return PackedContext with utilization metrics
```

### Pattern 3: Signature Extraction for Signatures-Only Tier
**What:** For medium-priority files, extract a compact summary from Phase 3 AST data: exported function signatures, class definitions with method signatures, type/interface names. This reuses `ParsedFile` data from `ASTResult.files` -- no re-parsing needed.
**When to use:** When a file is assigned to the 'signatures' tier by the packer.
**Example:**
```typescript
// Source: Phase 2/3 ParsedFile schema
import type { ParsedFile } from '../parsing/types.js';

/**
 * Generate a signatures-only summary from ParsedFile AST data.
 * Uses Phase 3 ASTResult -- no re-parsing needed.
 *
 * Output format (Markdown-like for LLM readability):
 * ```
 * // FILE: src/utils/helpers.ts (45 lines)
 * export function formatDate(date: Date, format?: string): string
 * export function parseConfig(raw: string): Config
 * export class Logger { constructor(name: string); log(msg: string): void }
 * // 3 imports from: ./types, lodash, node:path
 * ```
 */
function generateSignatureSummary(parsed: ParsedFile): string {
  const lines: string[] = [];
  lines.push(`// FILE: ${parsed.path} (${parsed.lineCount} lines)`);

  // Exported functions with signatures
  for (const fn of parsed.functions) {
    if (parsed.exports.some(e => e.name === fn.name)) {
      const params = fn.parameters.map(p =>
        p.type ? `${p.name}: ${p.type}` : p.name
      ).join(', ');
      const ret = fn.returnType ? `: ${fn.returnType}` : '';
      const async_ = fn.isAsync ? 'async ' : '';
      lines.push(`export ${async_}function ${fn.name}(${params})${ret}`);
    }
  }

  // Exported classes with method signatures
  for (const cls of parsed.classes) {
    if (parsed.exports.some(e => e.name === cls.name)) {
      const methods = cls.methods
        .filter(m => m.visibility === 'public')
        .map(m => {
          const params = m.parameters.map(p =>
            p.type ? `${p.name}: ${p.type}` : p.name
          ).join(', ');
          return `  ${m.name}(${params})`;
        }).join('; ');
      lines.push(`export class ${cls.name} { ${methods} }`);
    }
  }

  // Import summary (just sources, not specifiers)
  if (parsed.imports.length > 0) {
    const sources = parsed.imports.map(i => i.source);
    lines.push(`// ${parsed.imports.length} imports from: ${sources.join(', ')}`);
  }

  return lines.join('\n');
}
```

### Pattern 4: Oversized File Two-Pass Treatment (CTX-03)
**What:** Files exceeding a threshold (e.g., 8000 estimated tokens, or 10% of file content budget) get two-pass treatment. Pass 1 includes the signature summary (same as signatures-only tier). Pass 2, if budget allows, includes the full content of the most important sections (public API, complex exported functions). Phase 3 AST data identifies which sections matter.
**When to use:** During packing, when a high-priority file exceeds the threshold.
**Example:**
```typescript
// Oversized file detection and sectioning
const OVERSIZED_THRESHOLD_TOKENS = 8000; // ~32KB of source code

interface OversizedFileSection {
  label: string;         // "Public API", "Complex Functions", etc.
  content: string;       // The actual section content
  tokens: number;        // Estimated tokens
  priority: number;      // Section priority for deep-dive ordering
}

// Pass 1: Always include signatures (same as signatures tier)
// Pass 2: If budget remains, include sections in priority order:
//   1. Exported function/class bodies (public API)
//   2. Functions with high cyclomatic complexity (many branches)
//   3. Functions referenced by many other files
// Data source: ParsedFile has line/endLine for every function and class,
// which can be used to extract specific sections from the full file content
```

### Pattern 5: Inter-Round Context Compression (CTX-04)
**What:** Between AI analysis rounds, compress the prior round's output into a structured summary. This is deterministic extraction -- no LLM calls. The compressor pulls specific fields from the prior round's structured JSON output (module list, key findings, relationships) and formats them as a compact context block that fits within a fixed token budget.
**When to use:** Between AI rounds, before assembling the next round's prompt.
**Example:**
```typescript
// Source: Locked decision from CONTEXT.md
export interface RoundContext {
  roundNumber: number;
  findings: string[];           // Key findings from prior round
  modules: string[];            // Detected module names
  relationships: string[];      // Inter-module relationships
  openQuestions: string[];      // Questions for next round
  tokenCount: number;           // How many tokens this context consumes
}

// Deterministic extraction -- no LLM calls
function compressRoundOutput(
  roundNumber: number,
  roundOutput: Record<string, unknown>,
  maxTokens: number,
  estimateTokens: (text: string) => number,
): RoundContext {
  // Extract structured fields from the round's schema-validated output
  // Truncate if necessary to fit within maxTokens
  // Return compact context for next round's prompt
}
```

### Pattern 6: Token Usage Tracking with Warnings
**What:** Track token consumption across rounds and log warnings when approaching budget limits. This provides visibility into budget consumption for debugging and cost awareness.
**When to use:** During every AI round execution.
**Example:**
```typescript
// Source: Locked decision from CONTEXT.md
export interface TokenUsageTracker {
  roundUsage: Map<number, {
    inputTokens: number;
    outputTokens: number;
    contextTokens: number;     // Carried from prior rounds
    fileContentTokens: number; // From packed files
    budgetTokens: number;      // Total budget for this round
    utilizationPercent: number;
  }>;

  totalInputTokens: number;
  totalOutputTokens: number;

  // Warning thresholds
  warnAt: number;  // e.g., 0.85 (85% budget utilization)
}

// Logger integration
// logger.warn(`Round ${n}: ${pct}% of token budget used (${used}/${budget})`)
// logger.warn(`Approaching budget limit: ${remaining} tokens remaining`)
```

### Anti-Patterns to Avoid
- **Reading all file contents upfront for scoring:** Scoring uses only metadata and AST data from Phase 3. File contents should be read lazily, only when a file is assigned to the 'full' or 'signatures' tier and its content is needed for packing.
- **Using an external tokenizer library for per-file estimation:** The chars/4 heuristic is fast and sufficient for budget planning. Exact token counts come from the API response `usage` field after the prompt is sent. Adding a tokenizer dependency (150KB+) for marginal accuracy during planning is not worth the complexity.
- **AI-powered summarization for inter-round context:** The user explicitly locked this as deterministic extraction. Do NOT call the LLM to summarize prior round output. Extract structured fields programmatically.
- **Trying to be perfectly optimal in packing:** The greedy top-down approach is simple and effective. A knapsack-optimal solution would add algorithmic complexity for negligible real-world benefit (the scoring already ensures the most important files are considered first).
- **Hardcoding token budgets:** Always derive the budget from `LLMProvider.maxContextTokens()`. This ensures the system works correctly when new providers are added (OpenAI with different context windows, Ollama with smaller windows).
- **Scoring files during the AI round:** Scoring is a pre-processing step. Run it once per analysis, not per-round. The scores are stable within a single analysis run.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token estimation | Custom tokenizer, BPE implementation | `LLMProvider.estimateTokens()` (already exists) | The provider interface already abstracts token estimation. Each provider implements its own heuristic. The chars/4 estimate is within 10-15% for English source code, which is sufficient for budget planning |
| Context window size detection | Hardcoded per-model lookup table | `LLMProvider.maxContextTokens()` (already exists) | The provider interface already exposes this. Adding providers in Phase 8 will implement their own limits |
| AST data for signatures | Re-parsing files with tree-sitter | `ASTResult.files` from Phase 3 `StaticAnalysisResult` | Phase 3 already parsed every supported file and extracted functions, classes, imports, exports. Re-parsing would be wasteful and introduce WASM lifecycle complexity |
| Import graph (who imports whom) | Custom dependency resolver | Build reverse-index from `ASTResult.files[].imports[].source` | The import information is already extracted. Just build a `Map<string, string[]>` from import sources to importing files |

**Key insight:** Phase 4 is primarily a computation layer over existing data. The `StaticAnalysisResult` from Phase 3 contains all the raw data needed for scoring. The `LLMProvider` interface provides token estimation and budget limits. No new external data sources or libraries are required.

## Common Pitfalls

### Pitfall 1: Import Source Resolution for Scoring
**What goes wrong:** The `ParsedFile.imports[].source` field contains the raw import specifier (e.g., `'./utils/helpers.js'`, `'lodash'`, `'../types'`), not the resolved file path. Building a reverse-import map requires resolving these relative paths to match against `FileEntry.path` values.
**Why it happens:** Import paths use relative notation (`./`, `../`) and may omit extensions. They don't directly correspond to the `FileEntry.path` format.
**How to avoid:** Normalize import sources by resolving them relative to the importing file's directory. Strip leading `./`, handle `../` traversals, and try common extension additions (`.ts`, `.js`, `.tsx`, `/index.ts`). Skip external packages (no `.` or `..` prefix) since they are not project files.
**Warning signs:** All files getting 0 points for importCount because the reverse-import map is empty.

### Pitfall 2: Token Budget Exceeds Actual Context Window
**What goes wrong:** The packed context uses 190K tokens of a 200K budget, but the actual prompt (system prompt + packed content + response schema + tool definitions) exceeds the context window, causing an API error.
**Why it happens:** The file content budget does not account for prompt overhead: system prompts, structural XML/markdown wrapping, Zod-to-JSON tool schemas, and the model's output token reservation.
**How to avoid:** Reserve substantial overhead: ~2000-4000 tokens for system prompt and structural wrapping, and 4096+ tokens for model output. The actual file content budget should be `maxContextTokens - promptOverhead - outputReserve`. Apply a 90% safety margin on top: `fileContentBudget * 0.9`.
**Warning signs:** `overloaded` or `context_length_exceeded` errors from the API.

### Pitfall 3: Signature Generation for Non-AST-Parsed Files
**What goes wrong:** A file is assigned to the 'signatures' tier but has no `ParsedFile` entry in `ASTResult.files` (because it is in an unsupported language, or parsing failed).
**Why it happens:** The AST analyzer only processes files in supported languages (TypeScript, JavaScript, Python, Rust, Go). Other files (YAML, JSON, Markdown, shell scripts) have no parsed AST data.
**How to avoid:** When generating signatures for a file without AST data, fall back to a simpler summary: first N lines of the file (e.g., first 20 lines), file path, and file size. This provides some context without requiring AST parsing.
**Warning signs:** Empty signature summaries for `.yml`, `.json`, `.md`, `.sh` files.

### Pitfall 4: Stale Scores When Files Change Between Rounds
**What goes wrong:** In multi-round analysis, scoring is done once at the start. If the analysis takes long and files change on disk, the scores may not reflect current state.
**Why it happens:** Files could be modified during a long-running analysis session.
**How to avoid:** This is a non-issue for v1. Scoring is based on Phase 3 static analysis results, which are themselves a snapshot. The entire analysis pipeline runs from a single `StaticAnalysisResult` snapshot. No need to re-score between rounds.
**Warning signs:** None in practice. This is a theoretical concern, not a real one for batch analysis.

### Pitfall 5: Greedy Packing Wastes Budget on Many Small Files
**What goes wrong:** The greedy algorithm fills the budget with many small files at the top of the priority list, leaving no room for a large but important file lower in the list.
**Why it happens:** Greedy top-down packing does not look ahead. A 50-token file at score 80 gets full content before a 10,000-token file at score 79.
**How to avoid:** This is acceptable behavior because the scoring already reflects importance. However, if needed, implement a "reservation" for files above a score threshold (e.g., files scoring 70+ always get at least signatures). In practice, the scoring factors ensure the most architecturally important files (entry points, heavily imported files) have high scores and are processed first.
**Warning signs:** High utilization percentage but the most complex file in the project is in the 'skip' tier.

### Pitfall 6: Context Compression Loses Critical Information
**What goes wrong:** The inter-round context compressor extracts only field names and values but misses nuance in the AI's findings (e.g., "Module A depends on Module B but only through a deprecated interface").
**Why it happens:** Deterministic extraction is inherently limited to structured fields. Free-form insights in text fields may be truncated or omitted.
**How to avoid:** Design the AI round output schemas to include dedicated structured fields for key findings, relationships, and open questions. The compressor then extracts these structured fields directly. Avoid relying on free-text fields for critical cross-round information.
**Warning signs:** Later AI rounds producing contradictory findings because they lack context from earlier rounds.

## Code Examples

### File Scoring Implementation
```typescript
// Source: CTX-01, CTX-02 requirements + Phase 3 data structures
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { ParsedFile } from '../parsing/types.js';

interface FilePriority {
  path: string;
  score: number;
  breakdown: ScoreBreakdown;
}

interface ScoreBreakdown {
  entryPoint: number;
  importCount: number;
  exportCount: number;
  gitActivity: number;
  edgeCases: number;
  configFile: number;
}

// Entry point detection patterns
const ENTRY_POINT_PATTERNS = [
  /^(index|main|app|server|cli)\.[^/]+$/,       // Root-level entry points
  /\/(?:index|main|app|server)\.[^/]+$/,          // Directory entry points
  /^src\/(?:index|main|app|server)\.[^/]+$/,      // src/ entry points
];

const CONFIG_FILE_PATTERNS = [
  /\.config\.[^/]+$/,
  /^\.?(babel|eslint|prettier|jest|vitest|webpack|tsconfig|rollup|vite)/,
  /^\.env/,
  /^(package\.json|Cargo\.toml|go\.mod|pyproject\.toml|Makefile|Dockerfile)$/,
];

function scoreFiles(analysis: StaticAnalysisResult): FilePriority[] {
  // 1. Build reverse-import map: filePath -> number of files that import it
  const importerCount = buildReverseImportMap(analysis.ast.files);

  // 2. Build git activity map: filePath -> commit count
  const gitChanges = new Map<string, number>();
  for (const f of analysis.gitHistory.mostChangedFiles) {
    gitChanges.set(f.path, f.changes);
  }

  // 3. Build edge case map: filePath -> TODO/FIXME count
  const edgeCaseMap = new Map<string, number>();
  for (const item of analysis.todos.items) {
    edgeCaseMap.set(item.file, (edgeCaseMap.get(item.file) ?? 0) + 1);
  }

  // 4. Build export count map from AST
  const exportMap = new Map<string, number>();
  for (const file of analysis.ast.files) {
    exportMap.set(file.path, file.exports.length);
  }

  // 5. Score each file
  const scored: FilePriority[] = [];
  for (const file of analysis.fileTree.directoryTree.filter(e => e.type === 'file')) {
    // ... or iterate over the files array from metadata
    // Use the file entries from the analysis context
  }

  // Actually iterate using ast.files for parsed files, union with all discovered files
  const allPaths = new Set<string>();
  // Get all file paths from the file tree
  for (const entry of analysis.fileTree.directoryTree) {
    if (entry.type === 'file') allPaths.add(entry.path);
  }

  for (const path of allPaths) {
    const breakdown: ScoreBreakdown = {
      entryPoint: ENTRY_POINT_PATTERNS.some(p => p.test(path)) ? 30 : 0,
      importCount: Math.min((importerCount.get(path) ?? 0) * 3, 30),
      exportCount: Math.min((exportMap.get(path) ?? 0) * 2, 20),
      gitActivity: Math.min(gitChanges.get(path) ?? 0, 10),
      edgeCases: (edgeCaseMap.get(path) ?? 0) > 0 ? 10 : 0,
      configFile: CONFIG_FILE_PATTERNS.some(p => p.test(path)) ? 15 : 0,
    };

    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

    scored.push({
      path,
      score: Math.min(score, 100), // Cap at 100
      breakdown,
    });
  }

  // Sort by score descending, then by path for tiebreaking
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  return scored;
}

function buildReverseImportMap(files: ParsedFile[]): Map<string, number> {
  const reverseMap = new Map<string, number>();

  for (const file of files) {
    const dir = file.path.replace(/\/[^/]+$/, '');

    for (const imp of file.imports) {
      // Skip external packages (no ./ or ../ prefix)
      if (!imp.source.startsWith('.')) continue;

      // Resolve relative path
      const resolved = resolveImportPath(dir, imp.source);
      if (resolved) {
        reverseMap.set(resolved, (reverseMap.get(resolved) ?? 0) + 1);
      }
    }
  }

  return reverseMap;
}

// Simple import path resolution
function resolveImportPath(fromDir: string, importSource: string): string | null {
  // Normalize: join fromDir + importSource, collapse ../ and ./
  const parts = [...fromDir.split('/'), ...importSource.split('/')];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') { resolved.pop(); continue; }
    resolved.push(part);
  }
  return resolved.join('/');
  // Caller may need to try .ts, .js, /index.ts extensions
}
```

### Greedy Packing Algorithm
```typescript
// Source: Architecture pattern for CTX-01
function packFiles(
  scored: FilePriority[],
  analysis: StaticAnalysisResult,
  budget: TokenBudget,
  estimateTokens: (text: string) => number,
  getFileContent: (path: string) => Promise<string>,
): Promise<PackedContext> {
  let remaining = budget.fileContentBudget;
  const packed: PackedFile[] = [];

  // Build AST lookup for signature generation
  const astMap = new Map<string, ParsedFile>();
  for (const f of analysis.ast.files) {
    astMap.set(f.path, f);
  }

  for (const file of scored) {
    if (remaining <= 0) {
      packed.push({ path: file.path, tier: 'skip', content: '', tokens: 0, score: file.score });
      continue;
    }

    // Try full content
    const content = await getFileContent(file.path);
    const fullTokens = estimateTokens(content);

    if (fullTokens <= remaining) {
      packed.push({ path: file.path, tier: 'full', content, tokens: fullTokens, score: file.score });
      remaining -= fullTokens;
      continue;
    }

    // Try signatures-only
    const parsed = astMap.get(file.path);
    if (parsed) {
      const sigContent = generateSignatureSummary(parsed);
      const sigTokens = estimateTokens(sigContent);

      if (sigTokens <= remaining) {
        packed.push({ path: file.path, tier: 'signatures', content: sigContent, tokens: sigTokens, score: file.score });
        remaining -= sigTokens;
        continue;
      }
    }

    // Skip
    packed.push({ path: file.path, tier: 'skip', content: '', tokens: 0, score: file.score });
  }

  const usedTokens = budget.fileContentBudget - remaining;
  return {
    files: packed,
    budget,
    metadata: {
      totalFiles: packed.length,
      fullFiles: packed.filter(f => f.tier === 'full').length,
      signatureFiles: packed.filter(f => f.tier === 'signatures').length,
      skippedFiles: packed.filter(f => f.tier === 'skip').length,
      usedTokens,
      budgetTokens: budget.fileContentBudget,
      utilizationPercent: Math.round((usedTokens / budget.fileContentBudget) * 100),
    },
  };
}
```

### Inter-Round Context Compression
```typescript
// Source: Locked user decision -- deterministic extraction, no LLM calls
interface RoundOutput {
  modules?: Array<{ name: string; purpose: string }>;
  findings?: string[];
  relationships?: Array<{ from: string; to: string; type: string }>;
  openQuestions?: string[];
  [key: string]: unknown;
}

function compressRoundOutput(
  roundNumber: number,
  output: RoundOutput,
  maxTokens: number,
  estimateTokens: (text: string) => number,
): RoundContext {
  const parts: string[] = [];

  // Extract modules
  const modules = (output.modules ?? []).map(m => m.name);
  if (modules.length > 0) {
    parts.push(`Modules: ${modules.join(', ')}`);
  }

  // Extract key findings (truncate to fit)
  const findings = output.findings ?? [];
  for (const f of findings) {
    const candidate = [...parts, `- ${f}`].join('\n');
    if (estimateTokens(candidate) > maxTokens * 0.8) break;
    parts.push(`- ${f}`);
  }

  // Extract relationships
  const rels = (output.relationships ?? [])
    .map(r => `${r.from} -> ${r.to} (${r.type})`);
  if (rels.length > 0) {
    parts.push(`Relationships: ${rels.join('; ')}`);
  }

  // Extract open questions
  const questions = output.openQuestions ?? [];
  if (questions.length > 0) {
    parts.push(`Open questions: ${questions.join('; ')}`);
  }

  const text = parts.join('\n');
  return {
    roundNumber,
    findings: output.findings ?? [],
    modules,
    relationships: rels,
    openQuestions: questions,
    tokenCount: estimateTokens(text),
  };
}
```

### Token Usage Tracking
```typescript
// Source: Locked user decision -- token tracking with warnings
import { logger } from '../utils/logger.js';

interface RoundUsage {
  round: number;
  inputTokens: number;
  outputTokens: number;
  contextTokens: number;
  fileContentTokens: number;
  budgetTokens: number;
}

class TokenUsageTracker {
  private rounds: RoundUsage[] = [];
  private readonly warnThreshold = 0.85; // 85%

  recordRound(usage: RoundUsage): void {
    this.rounds.push(usage);

    const utilization = usage.inputTokens / usage.budgetTokens;
    if (utilization >= this.warnThreshold) {
      logger.warn(
        `Round ${usage.round}: ${Math.round(utilization * 100)}% of token budget used ` +
        `(${usage.inputTokens.toLocaleString()}/${usage.budgetTokens.toLocaleString()} tokens)`,
      );
    }

    logger.log(
      `Round ${usage.round} token usage: ` +
      `input=${usage.inputTokens}, output=${usage.outputTokens}, ` +
      `context=${usage.contextTokens}, files=${usage.fileContentTokens}`,
    );
  }

  getTotalUsage(): { input: number; output: number } {
    return {
      input: this.rounds.reduce((sum, r) => sum + r.inputTokens, 0),
      output: this.rounds.reduce((sum, r) => sum + r.outputTokens, 0),
    };
  }
}
```

## Discretion Recommendations

### Scoring Weights (CTX-02)
**Recommendation:** Use the following weights, matching the CTX-02 requirement specification exactly:
- Entry point detection: **+30** (binary: 0 or 30)
- Import count (how many files import this one): **+3 per importer**, capped at **30**
- Export count: **+2 per export**, capped at **20**
- Git activity (commits touching this file): **+1 per commit**, capped at **10**
- Edge case presence (has TODOs/FIXMEs): **+10** (binary: 0 or 10)
- Config file status: **+15** (binary: 0 or 15)

Maximum possible score: 30 + 30 + 20 + 10 + 10 + 15 = **115**, capped at **100**. This means files must be exceptional in multiple dimensions to reach the cap, which is the intended behavior.

**Confidence:** HIGH -- These weights directly implement CTX-02's requirements. Entry points (+30) dominate because they are the most architecturally critical. Import count (+3/importer) rewards hub files. Config files (+15) ensure project configuration is always included.

### Manual File Pinning/Boosting
**Recommendation:** YES -- support optional `context.pin` and `context.boost` fields in `.handover.yml`. Pinned files always get full content regardless of score. Boosted files get +20 to their score. This is low implementation cost (a few lines in the scorer) and provides an escape hatch for unusual project structures where the automatic scoring misses important files.

```yaml
# .handover.yml
context:
  pin:
    - src/legacy/critical-module.ts    # Always full content
  boost:
    - docs/ARCHITECTURE.md             # +20 score boost
```

**Confidence:** HIGH -- Simple to implement, high user value for edge cases.

### Universal vs Adaptive Scoring
**Recommendation:** Universal scoring. The six scoring factors are language-agnostic and project-type-agnostic. Entry points, import counts, export counts, git activity, edge cases, and config files are meaningful regardless of whether the project is a React app, a CLI tool, or a Rust library. Adaptive scoring adds complexity (project type detection heuristics, per-type weight tables) for marginal benefit in v1.

**Confidence:** HIGH -- Universal scoring is simpler, more predictable, and debuggable. Adaptive scoring could be added later if users report scoring issues for specific project types.

### Tiebreaker Strategy
**Recommendation:** Alphabetical by path. When two files have the same score, sort by file path ascending. This gives deterministic, reproducible output. Alternatives considered: file size (smaller first to pack more files), directory depth (shallower first for broader coverage). Alphabetical is simplest and most predictable.

**Confidence:** HIGH -- Deterministic tiebreaking is essential for reproducible analysis.

### Budget Allocation Strategy
**Recommendation:** Greedy top-down. Sort files by score descending and pack greedily. This is simpler than proportional tiers (which would pre-allocate budget percentages to full/signatures/skip tiers) and produces near-optimal results because the scoring already reflects importance. The greedy approach naturally creates tiers: high-scoring files get full content until the budget runs low, then medium files get signatures, then low files get skipped.

**Confidence:** HIGH -- Greedy packing is the standard approach in similar tools (aider, repomix). The scoring function handles the "what's important" question; the packer just fills greedily.

### Token Budget: Auto-Detected and User-Configurable
**Recommendation:** Both. Auto-detect from `LLMProvider.maxContextTokens()` as the default. Allow user override via `.handover.yml`:

```yaml
# .handover.yml
context:
  maxTokens: 100000  # Override provider auto-detection
```

This handles two real scenarios: (1) users on the 1M beta who want to use more than 200K, and (2) users who want to limit budget for cost control even when the provider allows more.

**Confidence:** HIGH -- Auto-detection is the right default; user override is a standard pattern.

### Small Projects That Fit Entirely
**Recommendation:** If all files' full content fits within the budget, include everything with tier 'full'. Skip scoring and packing entirely. Log a note: "Project fits within token budget -- all files included with full content." This avoids unnecessary computation and the confusing UX of some files being signatures-only when there is plenty of budget.

**Confidence:** HIGH -- Simple optimization. Most small projects (< 50 files) will fit entirely within a 200K budget.

### Treatment of Test/Config/Generated Files
**Recommendation:** Apply a tier penalty rather than a hard exclusion:
- **Test files** (`*.test.*`, `*.spec.*`, `__tests__/`): **-15 score penalty**. Tests are important for understanding behavior but less critical than production code for handover.
- **Config files** (`.config.*`, `tsconfig.json`, etc.): No penalty -- they already get +15 from the config factor. They are important for understanding the project setup.
- **Generated files** (`*.gen.*`, `*.generated.*`, `dist/`, `build/`): These should already be excluded by `.gitignore` filtering in Phase 3 file discovery. If any slip through, they score low naturally (no imports, no exports, no git activity).
- **Lock files** (`package-lock.json`, `yarn.lock`, `Cargo.lock`): **Always skip** -- these are machine-generated, massive, and provide no handover value.

**Confidence:** HIGH -- Graduated scoring (penalty vs exclusion) is more flexible than hard rules and works across project types.

### Oversized File Threshold
**Recommendation:** Fixed token count: **8000 estimated tokens** (roughly 32KB of source code). This is simpler than a budget-percentage threshold (which would change based on provider). 8000 tokens represents approximately 4% of a 200K budget, which is a reasonable single-file allocation.

**Confidence:** MEDIUM -- The exact threshold is somewhat arbitrary. 8000 is chosen because: (1) it is large enough to be unusual for a single source file, (2) it still leaves 96% of budget for other files, (3) it roughly corresponds to files >800 lines, which are commonly the "god objects" that benefit from two-pass treatment.

### Oversized File Deep-Dive Priority
**Recommendation:** Exports/public API first, then complex logic. Phase 3 AST data includes `line` and `endLine` for every function and class. Use this to extract:
1. All exported functions and classes (body included, not just signatures)
2. The class/function with the most methods/parameters (likely the most complex)
3. Any section containing TODO/FIXME markers (edge case areas)

**Confidence:** HIGH -- Public API is what consumers of the file need to understand. Complex sections are where bugs and edge cases live.

### Reuse Phase 3 AST Data vs Re-parse
**Recommendation:** Reuse Phase 3 AST data. `ASTResult.files` contains `ParsedFile` entries with function/class/import/export data and line numbers. This is sufficient for signature generation and section identification. Re-parsing would require reinitializing the WASM-based ParserService, which adds latency and memory overhead. The only thing Phase 3 AST data does NOT have is the actual source code of each function body -- that requires reading the file and using `line`/`endLine` to extract sections.

**Confidence:** HIGH -- AST metadata (line numbers, names, types) comes from Phase 3. Only the raw file content read needs to happen in Phase 4.

### Oversized but Low-Priority Files
**Recommendation:** Skip. If a file is both oversized (>8000 tokens) and low-priority (score < 30), it is not worth the budget to include even signatures. These are typically large generated files, data files, or legacy code with few imports/exports. The scoring system already ensures these files have low scores.

**Confidence:** HIGH -- Budget is precious. Spending tokens on large, unimportant files hurts the overall analysis quality.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dump entire repo into LLM context | Selective file inclusion with scoring | 2024+ | Tools like aider, repomix, and Cursor all use selective inclusion. Full-repo dumps waste budget on irrelevant files and cause "context rot" |
| AI-powered summarization between rounds | Structured extraction from typed outputs | 2025+ | Deterministic extraction is faster, cheaper, and more predictable. AI summarization adds latency, cost, and non-determinism |
| Fixed file lists per round | Dynamic scoring and packing | 2024+ | Scoring adapts to each project's structure. A React app's important files differ from a CLI tool's |
| Character-based budget estimation | Token-aware budget management | 2023+ | All modern LLM tools estimate tokens, not characters. The chars/4 heuristic is the minimum viable approach |

**Deprecated/outdated:**
- **`@anthropic-ai/tokenizer`**: Beta package, only accurate for pre-Claude-3 models. Anthropic recommends the `countTokens` API instead. Do not use for Claude 3+ models.
- **Full-repo-in-context approach**: Only viable for very small projects (<50 files). For anything larger, selective inclusion with scoring is required.

## Open Questions

1. **Exact entry point detection heuristics**
   - What we know: Common patterns like `index.ts`, `main.ts`, `app.ts`, `server.ts` in root or src/ directories. Framework-specific entry points (Next.js `page.tsx`, Remix `root.tsx`).
   - What's unclear: The complete set of patterns across all supported languages and frameworks.
   - Recommendation: Start with common patterns, iterate based on user feedback. The universal scoring approach means a missed entry point still gets scored by other factors (imports, exports, git activity).

2. **Token estimation accuracy for non-English comments**
   - What we know: The chars/4 heuristic assumes English-like text. CJK characters, Cyrillic, and Arabic can have different token-to-character ratios (often 1 token per 1-2 characters).
   - What's unclear: How significant this is for source code files, which are predominantly ASCII keywords and identifiers.
   - Recommendation: Accept the heuristic for v1. Source code is >90% ASCII regardless of comment language. The 90% safety margin on the budget absorbs most estimation errors.

3. **Multi-round scoring adjustments**
   - What we know: Scoring is done once per analysis, before the first AI round.
   - What's unclear: Whether later AI rounds should be able to re-prioritize files based on findings from earlier rounds (e.g., "this module is critical, include its test files too").
   - Recommendation: Defer to Phase 5 design. Phase 4 provides the scoring and packing infrastructure. Phase 5 can call the packer with modified scores if needed. Keep the API flexible: `packFiles(scores, budget)` accepts any scored list, regardless of source.

## Sources

### Primary (HIGH confidence)
- Anthropic Token Counting API (https://platform.claude.com/docs/en/build-with-claude/token-counting) -- Free API for exact token counts, TypeScript SDK `client.messages.countTokens()`, 100+ RPM
- Anthropic Context Windows (https://platform.claude.com/docs/en/build-with-claude/context-windows) -- 200K standard, 1M beta for Claude Opus 4.6/Sonnet 4.5/Sonnet 4 (tier 4+, beta header required)
- Existing codebase: `LLMProvider` interface in `src/providers/base.ts` -- `estimateTokens()` and `maxContextTokens()` already implemented
- Existing codebase: `StaticAnalysisResult` in `src/analyzers/types.ts` -- All 8 analyzer result schemas providing the raw data for scoring
- Existing codebase: `ParsedFile` schema in `src/parsing/types.ts` -- AST data with line numbers, function/class signatures, imports, exports

### Secondary (MEDIUM confidence)
- gpt-tokenizer npm package (Context7 /niieani/gpt-tokenizer) -- `isWithinTokenLimit()`, `countTokens()`, model-specific encodings. Useful reference but not needed as a dependency
- Aider repository map (https://aider.chat/docs/repomap.html) -- Graph-based file ranking using tree-sitter AST data, token-budgeted map generation
- `@anthropic-ai/tokenizer` npm package (https://github.com/anthropics/anthropic-tokenizer-typescript) -- Beta, NOT accurate for Claude 3+. Do not use.

### Tertiary (LOW confidence)
- Exact token-to-character ratio for Anthropic's tokenizer -- Training data suggests roughly 3.5-4.5 chars per token for English source code. The chars/4 heuristic is within this range.
- Optimal scoring weights -- The CTX-02 specification provides specific numbers (+30, +3/importer, etc.) but the real-world effectiveness depends on codebase characteristics. Tuning may be needed based on user feedback.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies. All functionality built on existing infrastructure (`LLMProvider`, `StaticAnalysisResult`, `ParsedFile`).
- Architecture: HIGH -- Three clean modules (scorer, packer, compressor) with clear inputs and outputs. Pure functions consuming Phase 3 data.
- Scoring algorithm: HIGH -- Directly implements CTX-02 requirements. All six factors are computable from existing Phase 3 data.
- Packing algorithm: HIGH -- Greedy top-down is well-understood and used by similar tools. Token budget derived from existing `LLMProvider` interface.
- Inter-round compression: HIGH -- User decision locked as deterministic extraction. Implementation is straightforward structured field extraction.
- Pitfalls: HIGH -- Based on concrete analysis of the existing data structures and their limitations (import path resolution, AST coverage gaps, budget overhead).

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (no fast-moving external dependencies; architecture is internal to the project)
