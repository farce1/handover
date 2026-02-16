import type { Tree } from 'web-tree-sitter';

import type {
  FunctionSymbol,
  ClassSymbol,
  ImportInfo,
  ExportInfo,
  ConstantSymbol,
  ParseError,
} from '../types.js';

// ─── Extractor result type ──────────────────────────────────────────────────

/**
 * The result of symbol extraction from a single file.
 * ParserService adds path, language, parserUsed, and lineCount.
 */
export interface ExtractorResult {
  functions: FunctionSymbol[];
  classes: ClassSymbol[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  constants: ConstantSymbol[];
  reExports: ExportInfo[];
  parseErrors: ParseError[];
}

// ─── Base extractor abstract class ──────────────────────────────────────────

/**
 * Abstract base class for language-specific extractors.
 *
 * Each language implements either tree-sitter extraction (via extract())
 * or regex-based extraction (via extractFromSource()), or both.
 */
export abstract class LanguageExtractor {
  /** Whether this extractor uses tree-sitter or regex. */
  abstract readonly parserType: 'tree-sitter' | 'regex';

  /**
   * Extract symbols from a tree-sitter parse tree.
   * Called by ParserService for tree-sitter languages.
   */
  abstract extract(tree: Tree, source: string): ExtractorResult;

  /**
   * Extract symbols from raw source text using regex patterns.
   * Called by ParserService for regex fallback languages.
   */
  abstract extractFromSource(source: string): ExtractorResult;

  /**
   * Create an empty ExtractorResult with all arrays initialized.
   */
  protected emptyResult(): ExtractorResult {
    return {
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      constants: [],
      reExports: [],
      parseErrors: [],
    };
  }
}
