/**
 * Public API for the handover parsing module.
 *
 * Provides a configured ParserService factory and convenience parseFile() function.
 * This is the entry point for Phase 3 static analyzers.
 */

import { ParserService } from './parser-service.js';
import { EXTENSION_MAP } from './language-map.js';
import { RustExtractor } from './extractors/rust.js';
import { GoExtractor } from './extractors/go.js';
import { RegexFallbackExtractor } from './extractors/regex-fallback.js';

import type { ParsedFile } from './types.js';

// ─── Re-exports ────────────────────────────────────────────────────────────

export type {
  ParsedFile,
  FunctionSymbol,
  ClassSymbol,
  ImportInfo,
  ImportSpecifier,
  ExportInfo,
  ConstantSymbol,
  Parameter,
  Field,
  ParseError,
} from './types.js';

export { ParserService } from './parser-service.js';
export { LanguageExtractor } from './extractors/base.js';
export type { ExtractorResult } from './extractors/base.js';
export { getLanguageInfo, isSupportedFile } from './language-map.js';

// ─── Extractor registry helpers ────────────────────────────────────────────

/**
 * Get all unique regex language IDs from the extension map.
 */
function getRegexLangIds(): string[] {
  const seen = new Set<string>();
  for (const info of Object.values(EXTENSION_MAP)) {
    if (info.parser === 'regex') {
      seen.add(info.langId);
    }
  }
  return [...seen];
}

/**
 * Attempt to load and register TypeScript/Python extractors if available.
 * These are created by plan 02-02. If not yet built, they are skipped.
 */
async function tryRegisterTreeSitterExtractors(service: ParserService): Promise<void> {
  // TypeScript/JavaScript/TSX/JSX extractor
  try {
    const { TypeScriptExtractor } = await import('./extractors/typescript.js');
    const tsExtractor = new TypeScriptExtractor();
    service.registerExtractor('typescript', tsExtractor);
    service.registerExtractor('tsx', tsExtractor);
    service.registerExtractor('javascript', tsExtractor);
    service.registerExtractor('jsx', tsExtractor);
  } catch {
    // TypeScript extractor not yet available (plan 02-02 pending)
  }

  // Python extractor (dynamic path avoids TS2307 when file doesn't exist yet)
  try {
    const pyModulePath = './extractors/python.js';
    const pyModule = await import(/* @vite-ignore */ pyModulePath);
    const pyExtractor = new pyModule.PythonExtractor();
    service.registerExtractor('python', pyExtractor);
  } catch {
    // Python extractor not yet available (plan 02-02 pending)
  }
}

// ─── Factory function ──────────────────────────────────────────────────────

/**
 * Create a fully configured ParserService with all available extractors registered.
 *
 * Registers:
 * - TypeScriptExtractor for: typescript, tsx, javascript, jsx (when available)
 * - PythonExtractor for: python (when available)
 * - RustExtractor for: rust
 * - GoExtractor for: go
 * - RegexFallbackExtractor for all regex-fallback languages
 *
 * The caller must call `await service.init()` before parsing
 * and `service.dispose()` when done.
 */
export async function createParserService(): Promise<ParserService> {
  const service = new ParserService();

  // Register tree-sitter extractors that are always available
  const rustExtractor = new RustExtractor();
  service.registerExtractor('rust', rustExtractor);

  const goExtractor = new GoExtractor();
  service.registerExtractor('go', goExtractor);

  // Attempt to register TS/Python extractors (from plan 02-02)
  await tryRegisterTreeSitterExtractors(service);

  // Register regex fallback for all regex languages.
  // Each language gets its own instance pre-configured with its langId,
  // since extractFromSource() doesn't receive langId from ParserService.
  for (const langId of getRegexLangIds()) {
    service.registerExtractor(langId, new RegexFallbackExtractor(langId));
  }

  return service;
}

// ─── Convenience parseFile function ────────────────────────────────────────

/**
 * Parse a single file and extract symbols.
 *
 * If no service is provided, creates a temporary one (one-shot usage).
 * For batch operations, create a service with `createParserService()`
 * and reuse it across files.
 */
export async function parseFile(
  filePath: string,
  source: string,
  service?: ParserService,
): Promise<ParsedFile> {
  if (service) {
    return service.parseFile(filePath, source);
  }

  // One-shot: create, init, parse, dispose
  const tempService = await createParserService();
  try {
    await tempService.init();
    return await tempService.parseFile(filePath, source);
  } finally {
    tempService.dispose();
  }
}
