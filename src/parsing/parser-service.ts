import { Parser, Language, type Tree } from 'web-tree-sitter';
import { createRequire } from 'node:module';

import { getLanguageInfo } from './language-map.js';
import type { LanguageExtractor } from './extractors/base.js';
import type { ParsedFile } from './types.js';

// Use createRequire for WASM path resolution (works in ESM)
const require = createRequire(import.meta.url);

// ─── ParserService ──────────────────────────────────────────────────────────

/**
 * WASM-safe parser service with lazy grammar loading.
 *
 * Manages the web-tree-sitter lifecycle:
 * - Singleton init (Parser.init() called once)
 * - Lazy grammar loading (only loads grammars on first use)
 * - Memory-safe parsing (tree.delete() in finally blocks)
 * - Extractor registry for language-specific symbol extraction
 */
export class ParserService {
  private parser: Parser | null = null;
  private languages = new Map<string, Language>();
  private extractors = new Map<string, LanguageExtractor>();
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize web-tree-sitter WASM runtime.
   * Safe to call multiple times -- only initializes once.
   */
  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit();
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    await Parser.init();
    this.parser = new Parser();
  }

  /**
   * Register a language extractor for a given language ID.
   * Extractors are looked up by langId during parseFile().
   */
  registerExtractor(langId: string, extractor: LanguageExtractor): void {
    this.extractors.set(langId, extractor);
  }

  /**
   * Parse a source string with a specific grammar and return the tree.
   * Caller is responsible for calling tree.delete() when done.
   * Prefer parseFile() for the full extraction pipeline.
   */
  async parse(source: string, grammarName: string): Promise<Tree> {
    await this.init();
    if (!this.parser) throw new Error('ParserService: init failed');

    const language = await this.loadLanguage(grammarName);
    this.parser.setLanguage(language);

    const tree = this.parser.parse(source);
    if (!tree) {
      throw new Error(`ParserService: parse returned null for grammar "${grammarName}"`);
    }
    return tree;
  }

  /**
   * Parse a file and extract symbols using the registered extractor.
   *
   * This is the main entry point for parsing. It:
   * 1. Detects language from file extension
   * 2. For tree-sitter languages: parses source, delegates to extractor, frees tree
   * 3. For regex languages: delegates to extractor's extractFromSource()
   * 4. For unknown languages: returns empty ParsedFile with parse error
   */
  async parseFile(filePath: string, source: string): Promise<ParsedFile> {
    const langInfo = getLanguageInfo(filePath);
    const lineCount = source.split('\n').length;

    // Unknown file type
    if (!langInfo) {
      return {
        path: filePath,
        language: 'unknown',
        parserUsed: 'regex',
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        constants: [],
        reExports: [],
        lineCount,
        parseErrors: [{ line: 0, message: 'Unsupported file type' }],
      };
    }

    const extractor = this.extractors.get(langInfo.langId);

    // No extractor registered for this language
    if (!extractor) {
      return {
        path: filePath,
        language: langInfo.langId,
        parserUsed: langInfo.parser,
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        constants: [],
        reExports: [],
        lineCount,
        parseErrors: [{ line: 0, message: `No extractor registered for language "${langInfo.langId}"` }],
      };
    }

    // Tree-sitter parsing with WASM memory safety
    if (langInfo.parser === 'tree-sitter') {
      const tree = await this.parse(source, langInfo.grammar);
      try {
        const result = extractor.extract(tree, source);
        return {
          path: filePath,
          language: langInfo.langId,
          parserUsed: 'tree-sitter',
          lineCount,
          ...result,
        };
      } finally {
        // CRITICAL: Free WASM memory (LANG-06)
        tree.delete();
      }
    }

    // Regex fallback parsing
    const result = extractor.extractFromSource(source);
    return {
      path: filePath,
      language: langInfo.langId,
      parserUsed: 'regex',
      lineCount,
      ...result,
    };
  }

  /**
   * Dispose of all WASM resources.
   * Call this when the parser service is no longer needed.
   */
  dispose(): void {
    if (this.parser) {
      this.parser.delete();
      this.parser = null;
    }
    this.languages.clear();
    this.extractors.clear();
    this.initPromise = null;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Lazily load a grammar WASM file.
   * Only loads each grammar once, caching the Language object.
   */
  private async loadLanguage(grammarName: string): Promise<Language> {
    const cached = this.languages.get(grammarName);
    if (cached) return cached;

    // Resolve WASM path from tree-sitter-wasms package
    const wasmPath = require.resolve(
      `tree-sitter-wasms/out/tree-sitter-${grammarName}.wasm`,
    );

    const language = await Language.load(wasmPath);
    this.languages.set(grammarName, language);
    return language;
  }
}
