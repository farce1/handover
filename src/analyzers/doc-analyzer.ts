import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { isBinaryFile } from './file-discovery.js';
import type { AnalysisContext, AnalyzerResult, DocResult } from './types.js';
import { logger } from '../utils/logger.js';
import { isReadmeFile, isInlineDocCandidate, hasInlineDoc } from './doc-detect.js';

// ─── Documentation detection patterns ────────────────────────────────────────

const DOC_FOLDER_PATTERNS = ['docs', 'doc', 'documentation', 'wiki', '.github'];

/** Documentation file extensions */
const DOC_EXTENSIONS = new Set(['.md', '.txt', '.rst', '.adoc']);

// ─── Main analyzer ──────────────────────────────────────────────────────────

/**
 * Documentation analyzer (STAT-08).
 *
 * Detects README files, docs folders, documentation files, and measures
 * inline documentation coverage (JSDoc, docstrings, rustdoc) across
 * a sample of source files.
 */
export async function analyzeDocs(ctx: AnalysisContext): Promise<AnalyzerResult<DocResult>> {
  const start = performance.now();

  try {
    // ── Find READMEs ─────────────────────────────────────────────────────

    const readmes: string[] = ctx.files
      .filter((f) => isReadmeFile(basename(f.path)))
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
        !isReadmeFile(basename(f.path)) &&
        isInlineDocCandidate(f.extension),
    );

    const sampleFiles = sourceFiles.slice(0, 100);
    let filesWithDocs = 0;

    for (const file of sampleFiles) {
      try {
        const content = await readFile(file.absolutePath, 'utf-8');
        if (hasInlineDoc(content, file.extension)) {
          filesWithDocs++;
        }
      } catch (err) {
        logger.debug(
          `Skipped unreadable doc file ${file.path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const totalSampled = sampleFiles.length;
    const percentage = totalSampled > 0 ? Math.round((filesWithDocs / totalSampled) * 100) : 0;

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
