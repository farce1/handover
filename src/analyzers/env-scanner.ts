import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { isBinaryFile } from './file-discovery.js';
import type { AnalysisContext, AnalyzerResult, EnvResult } from './types.js';

/**
 * STAT-05: EnvScanner Analyzer
 *
 * Detects .env files and environment variable references in source code
 * across TypeScript/JavaScript, Python, Rust, and Go patterns.
 */

// Known .env file patterns
const ENV_FILE_PATTERNS = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.test',
  '.env.example',
  '.env.sample',
]);

// Regex for env var usage in various languages
// - JS/TS:  process.env.VAR_NAME
// - Python: os.environ["VAR_NAME"] or os.getenv("VAR_NAME")
// - Rust:   env::var("VAR_NAME")
// - Go:     os.Getenv("VAR_NAME")
const ENV_REFERENCE_REGEX = new RegExp(
  [
    'process\\.env\\.([A-Z_][A-Z0-9_]*)',
    'os\\.environ\\[[\'"]([A-Z_][A-Z0-9_]*)[\'"]\\]',
    'os\\.getenv\\([\'"]([A-Z_][A-Z0-9_]*)[\'"]\\)',
    'env::var\\([\'"]([A-Z_][A-Z0-9_]*)[\'"]\\)',
    'os\\.Getenv\\([\'"]([A-Z_][A-Z0-9_]*)[\'"]\\)',
  ].join('|'),
  'g',
);

// Regex for variable definitions in .env files
const ENV_VAR_DEFINITION = /^([A-Z_][A-Z0-9_]*)=/;

export async function scanEnvVars(
  ctx: AnalysisContext,
): Promise<AnalyzerResult<EnvResult>> {
  const start = Date.now();

  try {
    const envFiles: EnvResult['envFiles'] = [];
    const envReferences: EnvResult['envReferences'] = [];
    const warnings: string[] = [];

    // Find .env files
    const envFileEntries = ctx.files.filter((f) => {
      const name = basename(f.path);
      return ENV_FILE_PATTERNS.has(name) || name.startsWith('.env');
    });

    // Parse .env files for variable names
    const envFileNames = new Set<string>();
    for (const file of envFileEntries) {
      try {
        const content = await readFile(file.absolutePath, 'utf-8');
        const variables: string[] = [];

        for (const line of content.split('\n')) {
          const match = ENV_VAR_DEFINITION.exec(line.trim());
          if (match) {
            variables.push(match[1]);
          }
        }

        envFiles.push({ path: file.path, variables });
        envFileNames.add(basename(file.path));
      } catch {
        // Skip unreadable .env files
      }
    }

    // Check for .env without .env.example (potential secret exposure)
    if (envFileNames.has('.env') && !envFileNames.has('.env.example') && !envFileNames.has('.env.sample')) {
      warnings.push(
        '.env file found without .env.example -- potential secret exposure risk. Consider adding a .env.example template.',
      );
    }

    // Scan source files for env var references in batches of 50
    const sourceFiles = ctx.files.filter(
      (f) =>
        !isBinaryFile(f.extension) &&
        !basename(f.path).startsWith('.env'),
    );

    for (let i = 0; i < sourceFiles.length; i += 50) {
      const batch = sourceFiles.slice(i, i + 50);
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const content = await readFile(file.absolutePath, 'utf-8');
            return scanFileForEnvRefs(content, file.path);
          } catch {
            return [];
          }
        }),
      );
      for (const refs of batchResults) {
        envReferences.push(...refs);
      }
    }

    const elapsed = Date.now() - start;
    return {
      success: true,
      data: { envFiles, envReferences, warnings },
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

/**
 * Scan a single file's content for environment variable references.
 */
function scanFileForEnvRefs(
  content: string,
  filePath: string,
): EnvResult['envReferences'] {
  const refs: EnvResult['envReferences'] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    ENV_REFERENCE_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = ENV_REFERENCE_REGEX.exec(lines[i])) !== null) {
      // Find which capture group matched (groups 1-5 correspond to the 5 patterns)
      const variable =
        match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
      if (variable) {
        refs.push({
          file: filePath,
          line: i + 1,
          variable,
        });
      }
    }
  }

  return refs;
}
