import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { logger } from '../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Directory where downloaded WASM grammars are cached.
 * Defaults to ~/.handover/grammars/ unless HANDOVER_GRAMMAR_DIR is set.
 * Corporate/offline users can pre-populate this directory with WASM files.
 */
export const GRAMMAR_CACHE_DIR =
  process.env.HANDOVER_GRAMMAR_DIR ?? join(homedir(), '.handover', 'grammars');

/** CDN base URL for tree-sitter WASM grammar downloads. */
const GRAMMAR_CDN_BASE = 'https://unpkg.com/tree-sitter-wasms@0.1.13/out';

/**
 * Only download the 6 grammars we actually use.
 * Full tree-sitter-wasms package is ~50MB for 36 grammars;
 * our subset is ~6MB total.
 */
const SUPPORTED_GRAMMARS = new Set(['typescript', 'tsx', 'javascript', 'python', 'rust', 'go']);

/**
 * Expected file sizes (bytes) for basic integrity check.
 * Ranges are generous to accommodate version differences.
 * Out-of-range files are kept (warning only, not rejected).
 */
const EXPECTED_SIZES: Record<string, { min: number; max: number }> = {
  typescript: { min: 500_000, max: 2_000_000 },
  tsx: { min: 500_000, max: 2_000_000 },
  javascript: { min: 200_000, max: 1_500_000 },
  python: { min: 100_000, max: 1_000_000 },
  rust: { min: 500_000, max: 3_000_000 },
  go: { min: 200_000, max: 1_500_000 },
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Download a tree-sitter WASM grammar from the CDN if not already cached.
 *
 * Resolution order:
 * 1. Check GRAMMAR_CACHE_DIR for existing file -- return immediately if found
 * 2. Download from unpkg CDN to GRAMMAR_CACHE_DIR
 * 3. Basic integrity check on file size (warning only)
 * 4. Return absolute path to cached WASM file
 *
 * @param grammarName - One of: typescript, tsx, javascript, python, rust, go
 * @returns Absolute path to the cached WASM file
 * @throws If grammarName is unsupported or download fails
 */
export async function downloadGrammarIfNeeded(grammarName: string): Promise<string> {
  if (!SUPPORTED_GRAMMARS.has(grammarName)) {
    throw new Error(`Unsupported grammar: ${grammarName}`);
  }

  const filename = `tree-sitter-${grammarName}.wasm`;
  const localPath = join(GRAMMAR_CACHE_DIR, filename);

  // Already cached -- return immediately
  if (existsSync(localPath)) {
    return localPath;
  }

  // Ensure cache directory exists
  mkdirSync(GRAMMAR_CACHE_DIR, { recursive: true });

  // Download from CDN
  const url = `${GRAMMAR_CDN_BASE}/${filename}`;
  logger.log(`Downloading grammar: ${grammarName} (first-time setup)...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download grammar ${grammarName} from ${url}: HTTP ${response.status}\n` +
        `If behind a proxy, set HANDOVER_GRAMMAR_DIR to a directory containing pre-downloaded WASM files.`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Basic integrity check -- warn if size is unexpected, but still save
  const expected = EXPECTED_SIZES[grammarName];
  if (expected && (buffer.length < expected.min || buffer.length > expected.max)) {
    logger.warn(
      `Grammar ${grammarName} size ${buffer.length} bytes is outside expected range ` +
        `(${expected.min}-${expected.max}). File may be corrupt or from a different version.`,
    );
  }

  writeFileSync(localPath, buffer);
  logger.log(`Grammar ${grammarName} cached to ${localPath}`);

  return localPath;
}
