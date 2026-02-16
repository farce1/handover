import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { isBinaryFile } from './file-discovery.js';
import type { AnalysisContext, AnalyzerResult, DocResult } from './types.js';

// ─── Documentation detection patterns ────────────────────────────────────────

const README_PATTERN = /^readme(\.(md|txt|rst|adoc))?$/i;

const DOC_FOLDER_PATTERNS = ['docs', 'doc', 'documentation', 'wiki', '.github'];

/** Documentation file extensions */
const DOC_EXTENSIONS = new Set(['.md', '.txt', '.rst', '.adoc']);

/** Inline documentation patterns by language family */
const INLINE_DOC_PATTERNS: Array<{
  extensions: string[];
  pattern: RegExp;
}> = [
  // JS/TS: JSDoc blocks
  {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'],
    pattern: /\/\*\*[\s\S]*?\*\//,
  },
  // Python: docstrings
  {
    extensions: ['.py', '.pyi'],
    pattern: /(?:"""[\s\S]*?"""|'''[\s\S]*?''')/,
  },
  // Rust: rustdoc comments
  {
    extensions: ['.rs'],
    pattern: /(?:\/\/\/|\/\/!)/,
  },
];

// ─── Main analyzer ──────────────────────────────────────────────────────────

/**
 * Documentation analyzer (STAT-08).
 *
 * Detects README files, docs folders, documentation files, and measures
 * inline documentation coverage (JSDoc, docstrings, rustdoc) across
 * a sample of source files.
 */
export async function analyzeDocs(
  ctx: AnalysisContext,
): Promise<AnalyzerResult<DocResult>> {
  const start = performance.now();

  try {
    // ── Find READMEs ─────────────────────────────────────────────────────

    const readmes: string[] = ctx.files
      .filter((f) => README_PATTERN.test(basename(f.path)))
      .map((f) => f.path);

    // ── Find docs folder ─────────────────────────────────────────────────

    let docsFolder: string | null = null;
    for (const file of ctx.files) {
      const dir = dirname(file.path);
      const topDir = dir.split('/')[0];
      if (topDir && DOC_FOLDER_PATTERNS.includes(topDir)) {
        docsFolder = topDir;
        break;
      }
    }

    // ── Find doc files ───────────────────────────────────────────────────

    const docFiles: string[] = ctx.files
      .filter((f) => {
        // Files in docs folder
        if (docsFolder && f.path.startsWith(docsFolder + '/')) {
          return true;
        }
        // Files matching doc extensions outside docs folder (but not READMEs already captured)
        if (DOC_EXTENSIONS.has(f.extension)) {
          return true;
        }
        return false;
      })
      .map((f) => f.path);

    // ── Inline doc coverage ──────────────────────────────────────────────

    // Sample non-binary source files (up to 100)
    const sourceFiles = ctx.files.filter(
      (f) =>
        !isBinaryFile(f.extension) &&
        !DOC_EXTENSIONS.has(f.extension) &&
        !README_PATTERN.test(basename(f.path)) &&
        INLINE_DOC_PATTERNS.some((p) =>
          p.extensions.includes(f.extension),
        ),
    );

    const sampleFiles = sourceFiles.slice(0, 100);
    let filesWithDocs = 0;

    for (const file of sampleFiles) {
      try {
        const content = await readFile(file.absolutePath, 'utf-8');

        // Find the matching inline doc pattern for this file's extension
        const hasInlineDoc = INLINE_DOC_PATTERNS.some((p) => {
          if (!p.extensions.includes(file.extension)) return false;
          return p.pattern.test(content);
        });

        if (hasInlineDoc) {
          filesWithDocs++;
        }
      } catch {
        // File read failure -- skip this file
      }
    }

    const totalSampled = sampleFiles.length;
    const percentage =
      totalSampled > 0
        ? Math.round((filesWithDocs / totalSampled) * 100)
        : 0;

    // ── Build result ─────────────────────────────────────────────────────

    return {
      success: true,
      data: {
        readmes,
        docsFolder,
        docFiles,
        inlineDocCoverage: {
          filesWithDocs,
          totalFiles: totalSampled,
          percentage,
        },
        summary: {
          hasReadme: readmes.length > 0,
          hasDocsFolder: docsFolder !== null,
          docFileCount: docFiles.length,
          inlineDocPercentage: percentage,
        },
      },
      elapsed: performance.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      elapsed: performance.now() - start,
    };
  }
}
