import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AnalysisContext, AnalyzerResult, DependencyResult } from './types.js';
import { MANIFEST_PATTERNS, parseManifest } from './manifest-parse.js';

/**
 * STAT-02: DependencyGraph Analyzer
 *
 * Walks files to find package manifests (package.json, Cargo.toml, go.mod,
 * requirements.txt, pyproject.toml) and applies the pure parsers in
 * manifest-parse.ts, separating dev vs production dependencies.
 */

// ─── Main Analyzer ────────────────────────────────────────────────────────

export async function analyzeDependencies(
  ctx: AnalysisContext,
): Promise<AnalyzerResult<DependencyResult>> {
  const start = Date.now();

  try {
    const warnings: string[] = [];
    const manifests: DependencyResult['manifests'] = [];

    // Find manifest files (check basename against MANIFEST_PATTERNS keys)
    const manifestFiles = ctx.files.filter((f) => {
      const name = basename(f.path);
      return name in MANIFEST_PATTERNS;
    });

    for (const file of manifestFiles) {
      const name = basename(file.path);
      const packageManager = MANIFEST_PATTERNS[name];

      try {
        const content = await readFile(file.absolutePath, 'utf-8');
        manifests.push({
          file: file.path,
          packageManager,
          dependencies: parseManifest(name, content),
        });
      } catch (err) {
        // Per user decision: "warn and skip, continue with what's parseable"
        warnings.push(
          `Failed to parse ${file.path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const elapsed = Date.now() - start;
    return {
      success: true,
      data: { manifests, warnings },
      elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      elapsed,
    };
  }
}
