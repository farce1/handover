import { stringify } from 'yaml';
import type { FrontMatterFields, RenderContext } from './types.js';

// ─── buildFrontMatter ───────────────────────────────────────────────────────

/**
 * Generate YAML front-matter wrapped in --- delimiters.
 */
export function buildFrontMatter(fields: FrontMatterFields): string {
  const yaml = stringify(fields).trimEnd();
  return `---\n${yaml}\n---\n`;
}

// ─── crossRef ───────────────────────────────────────────────────────────────

/**
 * Build a relative markdown link to another handover document.
 *
 * Per locked decision: always generate cross-references even if the target
 * document was not generated (they resolve when user generates all docs).
 *
 * @param docId - Filename without extension, e.g. '03-ARCHITECTURE'
 * @param anchor - Optional anchor, e.g. 'architecture-patterns'
 * @param text - Optional display text; defaults to title-cased name
 */
export function crossRef(docId: string, anchor?: string, text?: string): string {
  const filename = `${docId}.md`;
  const anchorPart = anchor ? `#${anchor}` : '';

  // Default display text: strip leading digits and dashes, replace remaining
  // dashes with spaces, title-case each word.
  const displayText =
    text ??
    docId
      .replace(/^\d+-/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return `[${displayText}](${filename}${anchorPart})`;
}

// ─── codeRef ────────────────────────────────────────────────────────────────

/**
 * Build a backtick-wrapped code reference with optional line number.
 * Normalizes file paths by removing leading ./ or /.
 * Ensures DOC-18 compliance: consistent code references across all renderers.
 */
export function codeRef(file: string, line?: number): string {
  const normalized = file.replace(/^\.?\//, '');
  return line !== undefined ? `\`${normalized}:L${line}\`` : `\`${normalized}\``;
}

// ─── sectionIntro ───────────────────────────────────────────────────────────

/**
 * Return a narrative intro for a section.
 * Both human and AI modes include the prose (per locked decision:
 * AI mode keeps human prose). Returns text with a trailing newline.
 */
export function sectionIntro(text: string): string {
  return `${text}\n`;
}

// ─── buildTable ─────────────────────────────────────────────────────────────

/**
 * Build a markdown table from headers and rows.
 * Pipe-escapes any | characters in cell content.
 */
export function buildTable(headers: string[], rows: string[][]): string {
  const escape = (cell: string): string => cell.replace(/\|/g, '\\|');

  const headerRow = `| ${headers.map(escape).join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = rows.map((row) => `| ${row.map(escape).join(' | ')} |`);

  return [headerRow, separatorRow, ...dataRows].join('\n');
}

// ─── buildSummaryLine ───────────────────────────────────────────────────────

/**
 * Build a 2-sentence RAG summary (DOC-17) for a given topic.
 * Pulls from ctx.projectName and static analysis metadata.
 */
export function buildSummaryLine(ctx: RenderContext, topic: string): string {
  const { projectName, staticAnalysis } = ctx;
  const meta = staticAnalysis.metadata;

  switch (topic) {
    case 'architecture': {
      const patterns =
        ctx.rounds.r4?.data.patterns
          .map((p) => p.name)
          .slice(0, 3)
          .join(', ') ?? 'undetermined';
      const topModules =
        ctx.rounds.r2?.data.modules
          .slice(0, 3)
          .map((m) => m.name)
          .join(', ') ?? 'undetermined';
      return `${projectName} uses ${patterns} architecture. Key modules include ${topModules}.`;
    }
    case 'overview': {
      const lang =
        Object.entries(staticAnalysis.fileTree.filesByExtension)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 1)
          .map(([ext]) => ext)
          .join('') || 'multiple languages';
      return `${projectName} is a ${lang} project with ${meta.fileCount} files. It was analyzed on ${meta.analyzedAt}.`;
    }
    case 'dependencies': {
      const depCount = staticAnalysis.dependencies.manifests.flatMap((m) => m.dependencies).length;
      return `${projectName} has ${depCount} dependencies across ${staticAnalysis.dependencies.manifests.length} manifest(s). Dependencies are categorized by type and role.`;
    }
    case 'testing': {
      const { totalTestFiles, totalTests } = staticAnalysis.tests.summary;
      return `${projectName} has ${totalTestFiles} test files containing ${totalTests} tests. ${staticAnalysis.tests.frameworks.length > 0 ? `Frameworks: ${staticAnalysis.tests.frameworks.join(', ')}.` : 'No test framework detected.'}`;
    }
    default: {
      return `${projectName} contains ${meta.fileCount} files analyzed at ${meta.analyzedAt}. See sections below for details.`;
    }
  }
}

// ─── determineDocStatus ─────────────────────────────────────────────────────

/**
 * Determine the generation status of a document based on available round data.
 *
 * @param requiredRounds - Which AI rounds this document needs
 * @param roundResults - Map of round number to whether data exists
 * @param wasGenerated - Whether the document was generated at all
 */
export function determineDocStatus(
  requiredRounds: number[],
  roundResults: Map<number, unknown>,
  wasGenerated: boolean,
): 'complete' | 'partial' | 'static-only' | 'not-generated' {
  if (!wasGenerated) {
    return 'not-generated';
  }

  // Documents with no required rounds are always complete when generated
  if (requiredRounds.length === 0) {
    return 'complete';
  }

  const allRoundsAvailable = requiredRounds.every(
    (r) => roundResults.has(r) && roundResults.get(r) != null,
  );
  if (allRoundsAvailable) {
    return 'complete';
  }

  const anyRoundAvailable = requiredRounds.some(
    (r) => roundResults.has(r) && roundResults.get(r) != null,
  );
  if (anyRoundAvailable) {
    return 'partial';
  }

  return 'static-only';
}
