import type { ParsedFile } from '../parsing/types.js';
import type { ASTResult } from '../analyzers/types.js';
import type { FilePriority, PackedContext, PackedFile, TokenBudget } from './types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Files estimated above this token count with score >= 30 get two-pass treatment */
export const OVERSIZED_THRESHOLD_TOKENS = 8000;

/** Batch size for concurrent file reads (memory-bounded, consistent with Phase 3) */
const BATCH_SIZE = 50;

/** Safe utilization percentage calculation (avoids divide-by-zero) */
function calcUtilization(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

// ─── Signature extraction ───────────────────────────────────────────────────

/**
 * Generate a compact markdown-like summary from Phase 3 AST data.
 *
 * Output format:
 * ```
 * // FILE: src/utils/helpers.ts (45 lines)
 * export async function formatDate(date: Date, format?: string): string
 * export class Logger { constructor(name: string); log(msg: string): void }
 * // 3 imports from: ./types, lodash, node:path
 * ```
 */
export function generateSignatureSummary(parsed: ParsedFile): string {
  const lines: string[] = [];

  // Header line
  lines.push(`// FILE: ${parsed.path} (${parsed.lineCount} lines)`);

  // Exported names set for quick lookup
  const exportedNames = new Set(parsed.exports.map((e) => e.name));

  // Exported functions
  for (const fn of parsed.functions) {
    if (!exportedNames.has(fn.name)) continue;

    const asyncPrefix = fn.isAsync ? 'async ' : '';
    const params = fn.parameters.map((p) => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ');
    const returnSuffix = fn.returnType ? `: ${fn.returnType}` : '';
    lines.push(`export ${asyncPrefix}function ${fn.name}(${params})${returnSuffix}`);
  }

  // Exported classes
  for (const cls of parsed.classes) {
    if (!exportedNames.has(cls.name)) continue;

    const publicMethods = cls.methods.filter((m) => m.visibility === 'public');
    const methodSigs = publicMethods
      .map((m) => {
        const params = m.parameters
          .map((p) => (p.type ? `${p.name}: ${p.type}` : p.name))
          .join(', ');
        const returnSuffix = m.returnType ? `: ${m.returnType}` : '';
        return `${m.name}(${params})${returnSuffix}`;
      })
      .join('; ');

    lines.push(`export class ${cls.name} { ${methodSigs ? methodSigs : ''} }`);
  }

  // Exported constants
  for (const c of parsed.constants) {
    if (!c.isExported) continue;
    const typeSuffix = c.type ? `: ${c.type}` : '';
    lines.push(`export const ${c.name}${typeSuffix}`);
  }

  // Import summary
  if (parsed.imports.length > 0) {
    const sources = parsed.imports.map((i) => i.source);
    lines.push(`// ${parsed.imports.length} imports from: ${sources.join(', ')}`);
  }

  return lines.join('\n');
}

// ─── Fallback summary ───────────────────────────────────────────────────────

/**
 * For files without AST data (YAML, JSON, Markdown, shell scripts, etc.).
 * Returns the first 20 lines with a header.
 */
function generateFallbackSummary(path: string, content: string): string {
  const allLines = content.split('\n');
  const totalLines = allLines.length;
  const previewLines = allLines.slice(0, 20);

  const lines: string[] = [];
  lines.push(`// FILE: ${path} (${totalLines} lines)`);

  for (const line of previewLines) {
    lines.push(`// ${line}`);
  }

  if (totalLines > 20) {
    lines.push(`// ... (${totalLines - 20} more lines)`);
  }

  return lines.join('\n');
}

// ─── Oversized file section extraction ──────────────────────────────────────

interface OversizedSections {
  signatures: string;
  sections: Array<{ label: string; content: string; tokens: number }>;
}

const EDGE_CASE_MARKERS = /\b(TODO|FIXME|HACK|XXX)\b/;

/**
 * Extract prioritized deep-dive sections from an oversized file.
 *
 * Returns signatures (first pass) and prioritized sections (second pass)
 * for files that exceed OVERSIZED_THRESHOLD_TOKENS with score >= 30.
 */
function extractOversizedSections(
  parsed: ParsedFile,
  content: string,
  estimateTokens: (text: string) => number,
): OversizedSections {
  const signatures = generateSignatureSummary(parsed);
  const contentLines = content.split('\n');
  const exportedNames = new Set(parsed.exports.map((e) => e.name));

  const sections: OversizedSections['sections'] = [];
  const addedRanges = new Set<string>();

  // Priority 1: Exported function/class bodies
  const exportedFunctions = parsed.functions.filter((f) => exportedNames.has(f.name));
  const exportedClasses = parsed.classes.filter((c) => exportedNames.has(c.name));

  for (const fn of exportedFunctions) {
    const rangeKey = `${fn.line}-${fn.endLine}`;
    if (addedRanges.has(rangeKey)) continue;
    addedRanges.add(rangeKey);

    const sectionContent = contentLines.slice(fn.line - 1, fn.endLine).join('\n');
    sections.push({
      label: `Export: ${fn.name}`,
      content: sectionContent,
      tokens: estimateTokens(sectionContent),
    });
  }

  for (const cls of exportedClasses) {
    const rangeKey = `${cls.line}-${cls.endLine}`;
    if (addedRanges.has(rangeKey)) continue;
    addedRanges.add(rangeKey);

    const sectionContent = contentLines.slice(cls.line - 1, cls.endLine).join('\n');
    sections.push({
      label: `Export: ${cls.name}`,
      content: sectionContent,
      tokens: estimateTokens(sectionContent),
    });
  }

  // Priority 2: Functions with TODO/FIXME markers
  for (const fn of parsed.functions) {
    const rangeKey = `${fn.line}-${fn.endLine}`;
    if (addedRanges.has(rangeKey)) continue;

    const fnLines = contentLines.slice(fn.line - 1, fn.endLine);
    const hasEdgeCase = fnLines.some((line) => EDGE_CASE_MARKERS.test(line));

    if (hasEdgeCase) {
      addedRanges.add(rangeKey);
      const sectionContent = fnLines.join('\n');
      sections.push({
        label: `Edge case: ${fn.name}`,
        content: sectionContent,
        tokens: estimateTokens(sectionContent),
      });
    }
  }

  return { signatures, sections };
}

// ─── Main packing algorithm ─────────────────────────────────────────────────

/**
 * Pack files into a token-budgeted context using greedy top-down tier assignment.
 *
 * Files are assigned to tiers in priority order (by score descending):
 *   - 'full': complete file content
 *   - 'signatures': AST-based signature summary or first-20-lines fallback
 *   - 'skip': not included (budget exhausted)
 *
 * Special handling:
 *   - Small projects: all files get 'full' tier if total fits in budget
 *   - Oversized files (>8000 tokens, score >= 30): two-pass signatures + sections
 *   - Non-AST files: first-20-lines fallback for signatures tier
 *   - Batch-50 file reading for memory-bounded I/O
 *   - Error resilience: unreadable files get 'skip' tier
 */
export async function packFiles(
  scored: FilePriority[],
  astResult: ASTResult,
  budget: TokenBudget,
  estimateTokensFn: (text: string) => number,
  getFileContent: (path: string) => Promise<string>,
): Promise<PackedContext> {
  // ── Empty input guard ──────────────────────────────────────────────────
  if (scored.length === 0) {
    return {
      files: [],
      budget,
      metadata: {
        totalFiles: 0,
        fullFiles: 0,
        signatureFiles: 0,
        skippedFiles: 0,
        usedTokens: 0,
        budgetTokens: budget.fileContentBudget,
        utilizationPercent: 0,
      },
    };
  }

  // Build AST lookup map
  const astMap = new Map<string, ParsedFile>();
  for (const file of astResult.files) {
    astMap.set(file.path, file);
  }

  // ── Batch-read all file contents upfront (batch-50 pattern) ────────────
  const contentMap = new Map<string, string>();
  const paths = scored.map((s) => s.path);

  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (path) => {
        const content = await getFileContent(path);
        return { path, content };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        contentMap.set(result.value.path, result.value.content);
      }
      // Failed reads: contentMap won't have the path -> tier='skip'
    }
  }

  // ── Small project optimization ─────────────────────────────────────────
  let totalEstimatedTokens = 0;
  for (const [, content] of contentMap) {
    totalEstimatedTokens += estimateTokensFn(content);
  }

  if (totalEstimatedTokens <= budget.fileContentBudget) {
    // Everything fits -- include all files as 'full'
    const files: PackedFile[] = scored.map((s) => {
      const content = contentMap.get(s.path) ?? '';
      const tokens = content ? estimateTokensFn(content) : 0;
      return {
        path: s.path,
        tier: 'full' as const,
        content,
        tokens,
        score: s.score,
      };
    });

    const usedTokens = files.reduce((sum, f) => sum + f.tokens, 0);

    return {
      files,
      budget,
      metadata: {
        totalFiles: files.length,
        fullFiles: files.length,
        signatureFiles: 0,
        skippedFiles: 0,
        usedTokens,
        budgetTokens: budget.fileContentBudget,
        utilizationPercent: calcUtilization(usedTokens, budget.fileContentBudget),
      },
    };
  }

  // ── Main greedy packing loop ───────────────────────────────────────────
  let remaining = budget.fileContentBudget;
  const packedFiles: PackedFile[] = [];

  for (const entry of scored) {
    const content = contentMap.get(entry.path);

    // File couldn't be read -- skip
    if (content === undefined) {
      packedFiles.push({
        path: entry.path,
        tier: 'skip',
        content: '',
        tokens: 0,
        score: entry.score,
      });
      continue;
    }

    const fullTokens = estimateTokensFn(content);
    const parsed = astMap.get(entry.path);

    // ── Oversized check (CTX-03) ──────────────────────────────────────
    if (fullTokens > OVERSIZED_THRESHOLD_TOKENS && entry.score >= 30 && parsed) {
      const { signatures, sections } = extractOversizedSections(parsed, content, estimateTokensFn);

      const sigTokens = estimateTokensFn(signatures);
      const totalSectionTokens = sections.reduce((sum, s) => sum + s.tokens, 0);

      // Try signatures + all sections
      if (sigTokens + totalSectionTokens <= remaining) {
        const combinedContent =
          signatures +
          '\n\n' +
          sections.map((s) => `// --- ${s.label} ---\n${s.content}`).join('\n\n');
        const combinedTokens = estimateTokensFn(combinedContent);

        packedFiles.push({
          path: entry.path,
          tier: 'full',
          content: combinedContent,
          tokens: combinedTokens,
          score: entry.score,
        });
        remaining -= combinedTokens;
        continue;
      }

      // Try signatures + greedy subset of sections
      if (sigTokens <= remaining) {
        let sectionBudget = remaining - sigTokens;
        const includedSections: typeof sections = [];

        for (const section of sections) {
          if (section.tokens <= sectionBudget) {
            includedSections.push(section);
            sectionBudget -= section.tokens;
          }
        }

        const combinedContent =
          includedSections.length > 0
            ? signatures +
              '\n\n' +
              includedSections.map((s) => `// --- ${s.label} ---\n${s.content}`).join('\n\n')
            : signatures;
        const combinedTokens = estimateTokensFn(combinedContent);

        packedFiles.push({
          path: entry.path,
          tier: 'signatures',
          content: combinedContent,
          tokens: combinedTokens,
          score: entry.score,
        });
        remaining -= combinedTokens;
        continue;
      }

      // Even signatures don't fit
      packedFiles.push({
        path: entry.path,
        tier: 'skip',
        content: '',
        tokens: 0,
        score: entry.score,
      });
      continue;
    }

    // ── Normal file: try full content ─────────────────────────────────
    if (fullTokens <= remaining) {
      packedFiles.push({
        path: entry.path,
        tier: 'full',
        content,
        tokens: fullTokens,
        score: entry.score,
      });
      remaining -= fullTokens;
      continue;
    }

    // ── Signatures fallback: AST-based ────────────────────────────────
    if (parsed) {
      const sigContent = generateSignatureSummary(parsed);
      const sigTokens = estimateTokensFn(sigContent);

      if (sigTokens <= remaining) {
        packedFiles.push({
          path: entry.path,
          tier: 'signatures',
          content: sigContent,
          tokens: sigTokens,
          score: entry.score,
        });
        remaining -= sigTokens;
        continue;
      }
    }

    // ── Non-AST fallback: first 20 lines ─────────────────────────────
    if (!parsed) {
      const fallbackContent = generateFallbackSummary(entry.path, content);
      const fallbackTokens = estimateTokensFn(fallbackContent);

      if (fallbackTokens <= remaining) {
        packedFiles.push({
          path: entry.path,
          tier: 'signatures',
          content: fallbackContent,
          tokens: fallbackTokens,
          score: entry.score,
        });
        remaining -= fallbackTokens;
        continue;
      }
    }

    // ── Skip: budget exhausted ────────────────────────────────────────
    packedFiles.push({
      path: entry.path,
      tier: 'skip',
      content: '',
      tokens: 0,
      score: entry.score,
    });
  }

  // ── Build PackedContext ─────────────────────────────────────────────────
  const usedTokens = budget.fileContentBudget - remaining;
  const fullFiles = packedFiles.filter((f) => f.tier === 'full').length;
  const signatureFiles = packedFiles.filter((f) => f.tier === 'signatures').length;
  const skippedFiles = packedFiles.filter((f) => f.tier === 'skip').length;

  return {
    files: packedFiles,
    budget,
    metadata: {
      totalFiles: packedFiles.length,
      fullFiles,
      signatureFiles,
      skippedFiles,
      usedTokens,
      budgetTokens: budget.fileContentBudget,
      utilizationPercent: Math.round((usedTokens / budget.fileContentBudget) * 100),
    },
  };
}
