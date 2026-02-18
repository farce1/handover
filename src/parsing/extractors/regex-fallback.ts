import type { Tree } from 'web-tree-sitter';

import type { FunctionSymbol, ClassSymbol, ImportInfo } from '../types.js';
import { LanguageExtractor, type ExtractorResult } from './base.js';

// ─── Language family type ──────────────────────────────────────────────────

type LanguageFamily = 'c-like' | 'ruby-like' | 'php';

/**
 * Maps language IDs to their syntax family for regex pattern selection.
 */
const LANGUAGE_FAMILY_MAP: Record<string, LanguageFamily> = {
  java: 'c-like',
  kotlin: 'c-like',
  csharp: 'c-like',
  cpp: 'c-like',
  c: 'c-like',
  swift: 'c-like',
  dart: 'c-like',
  scala: 'c-like',
  lua: 'c-like',
  r: 'c-like',
  ruby: 'ruby-like',
  php: 'php',
};

// ─── Regex patterns per family ─────────────────────────────────────────────

interface FamilyPatterns {
  functionPattern: RegExp;
  classPattern: RegExp;
  importPattern: RegExp;
}

/**
 * C-like family patterns: Java, Kotlin, C#, C, C++, Swift, Dart, Scala
 */
const C_LIKE_PATTERNS: FamilyPatterns = {
  functionPattern:
    /^[ \t]*(?:(?:public|private|protected|internal|static|abstract|final|async|override|virtual|extern|inline|suspend|native|synchronized)\s+)*(?:fun\s+|func\s+)?(?:[\w<>\[\],\s]+?\s+)?([\w$]+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/,
  classPattern:
    /^[ \t]*(?:(?:public|private|protected|internal|abstract|final|sealed|static|open|data|value)\s+)*(?:class|struct|interface|enum|object|trait|protocol)\s+([\w$]+)(?:\s*<[^>]*>)?(?:\s*(?:extends|implements|:|<)\s*([^{]+))?/,
  importPattern: /^[ \t]*(?:import|using|require|include)\s+(.+?)(?:\s*;|\s*$)/,
};

/**
 * Ruby-like family patterns: Ruby
 */
const RUBY_LIKE_PATTERNS: FamilyPatterns = {
  functionPattern: /^[ \t]*def\s+(?:self\.)?([\w?!]+)(?:\(([^)]*)\))?/,
  classPattern: /^[ \t]*(?:class|module)\s+([\w:]+)(?:\s*<\s*([\w:]+))?/,
  importPattern: /^[ \t]*require(?:_relative)?\s+['"]([^'"]+)['"]/,
};

/**
 * PHP patterns
 */
const PHP_PATTERNS: FamilyPatterns = {
  functionPattern:
    /^[ \t]*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+(\w+)\s*\(([^)]*)\)/,
  classPattern:
    /^[ \t]*(?:(?:abstract|final)\s+)*(?:class|interface|trait|enum)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/,
  importPattern: /^[ \t]*(?:use|require_once|include_once|require|include)\s+(.+?)(?:\s*;|\s*$)/,
};

const FAMILY_PATTERNS: Record<LanguageFamily, FamilyPatterns> = {
  'c-like': C_LIKE_PATTERNS,
  'ruby-like': RUBY_LIKE_PATTERNS,
  php: PHP_PATTERNS,
};

// ─── Comment patterns for doc extraction ───────────────────────────────────

const JAVADOC_LINE = /^\s*\*\s?(.*)/;
const LINE_COMMENT = /^\s*(?:\/\/\/?|#)\s?(.*)/;
const XML_DOC_COMMENT = /^\s*\/\/\/\s?(.*)/;
const BLOCK_COMMENT_START = /^\s*\/\*\*?\s*(.*)/;
const _BLOCK_COMMENT_END = /^(.*?)\*\/\s*$/;

// ─── Regex Fallback Extractor ──────────────────────────────────────────────

/**
 * Extracts symbols from source files using regex patterns for languages
 * without tree-sitter grammar support.
 *
 * Groups languages into families (C-like, Ruby-like, PHP) and applies
 * family-specific regex patterns for function, class, and import extraction.
 *
 * All results carry parserUsed: 'regex' provenance via the parserType property.
 */
export class RegexFallbackExtractor extends LanguageExtractor {
  readonly parserType = 'regex' as const;

  private langId: string;

  constructor(langId: string = 'java') {
    super();
    this.langId = langId;
  }

  /**
   * Set the language ID for pattern selection.
   * Called by ParserService before extractFromSource.
   */
  setLanguage(langId: string): void {
    this.langId = langId;
  }

  extract(_tree: Tree, _source: string): ExtractorResult {
    throw new Error(
      'RegexFallbackExtractor only supports regex-based extraction via extractFromSource()',
    );
  }

  extractFromSource(source: string): ExtractorResult {
    const result = this.emptyResult();
    const family = LANGUAGE_FAMILY_MAP[this.langId] || 'c-like';
    const patterns = FAMILY_PATTERNS[family];

    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;

      // Try function match
      const fnMatch = line.match(patterns.functionPattern);
      if (fnMatch) {
        const name = fnMatch[1];
        if (name && !this.isKeyword(name, family)) {
          const params = this.parseBasicParameters(fnMatch[2] || '');
          const docstring = this.extractDocCommentAbove(lines, i);

          const fn: FunctionSymbol = {
            kind: 'function',
            name,
            parameters: params,
            returnType: undefined,
            typeParameters: [],
            isAsync: line.includes('async '),
            isGenerator: false,
            visibility: this.extractVisibilityFromLine(line, family),
            decorators: [],
            docstring,
            line: lineNum,
            endLine: lineNum, // Regex cannot determine end line
          };
          result.functions.push(fn);
          continue;
        }
      }

      // Try class match
      const classMatch = line.match(patterns.classPattern);
      if (classMatch) {
        const name = classMatch[1];
        if (name) {
          const extendsStr = classMatch[2]?.trim();
          const implementsStr = family === 'php' ? classMatch[3]?.trim() : undefined;
          const docstring = this.extractDocCommentAbove(lines, i);

          const extendsArr = extendsStr
            ? extendsStr
                .split(/\s*,\s*/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
          const implementsArr = implementsStr
            ? implementsStr
                .split(/\s*,\s*/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];

          const cls: ClassSymbol = {
            kind: 'class',
            name,
            typeParameters: [],
            extends: extendsArr,
            implements: implementsArr,
            mixins: [],
            fields: [],
            methods: [],
            decorators: [],
            docstring,
            visibility: this.extractVisibilityFromLine(line, family),
            line: lineNum,
            endLine: lineNum,
          };
          result.classes.push(cls);
          continue;
        }
      }

      // Try import match
      const importMatch = line.match(patterns.importPattern);
      if (importMatch) {
        const raw = importMatch[1];
        if (raw) {
          const importInfo = this.parseImport(raw.trim(), lineNum, family);
          if (importInfo) {
            result.imports.push(importInfo);
          }
        }
      }
    }

    // If no symbols extracted and source is non-empty, record a parse note
    if (
      source.trim().length > 0 &&
      result.functions.length === 0 &&
      result.classes.length === 0 &&
      result.imports.length === 0
    ) {
      result.parseErrors.push({
        line: 1,
        message: 'No symbols extracted via regex fallback',
      });
    }

    // Collect exports (for C-like, public items are exported)
    this.collectExports(result);

    return result;
  }

  // ─── Parameter parsing ───────────────────────────────────────────────────

  private parseBasicParameters(
    paramStr: string,
  ): Array<{ name: string; type?: string; isRest: boolean }> {
    if (!paramStr.trim()) return [];

    const params: Array<{ name: string; type?: string; isRest: boolean }> = [];
    const parts = this.splitParameters(paramStr);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const isRest =
        trimmed.startsWith('...') || trimmed.startsWith('*') || trimmed.startsWith('**');
      const cleanPart = trimmed.replace(/^\.{3}|\*{1,2}/, '').trim();

      // Try to split into type and name (C-like: "Type name" or "name: Type")
      const colonSplit = cleanPart.split(':');
      if (colonSplit.length >= 2) {
        params.push({
          name: colonSplit[0]!.trim(),
          type: colonSplit.slice(1).join(':').trim() || undefined,
          isRest,
        });
      } else {
        // Could be "Type name" (Java/C-like) or just "name"
        const spaceParts = cleanPart.split(/\s+/);
        if (spaceParts.length >= 2) {
          const name = spaceParts[spaceParts.length - 1]!;
          const type = spaceParts.slice(0, -1).join(' ');
          params.push({ name, type: type || undefined, isRest });
        } else {
          params.push({ name: cleanPart, isRest });
        }
      }
    }

    return params;
  }

  /**
   * Split parameter string by commas, respecting nested generics/brackets.
   */
  private splitParameters(paramStr: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let current = '';

    for (const ch of paramStr) {
      if (ch === '<' || ch === '(' || ch === '[' || ch === '{') {
        depth++;
        current += ch;
      } else if (ch === '>' || ch === ')' || ch === ']' || ch === '}') {
        depth--;
        current += ch;
      } else if (ch === ',' && depth === 0) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) {
      result.push(current);
    }
    return result;
  }

  // ─── Import parsing ──────────────────────────────────────────────────────

  private parseImport(raw: string, line: number, family: LanguageFamily): ImportInfo | null {
    // Clean up trailing semicolons and quotes
    let source = raw.replace(/;$/, '').trim();

    if (family === 'ruby-like') {
      // Ruby: require 'gem_name' or require_relative './path'
      source = source.replace(/^['"]|['"]$/g, '');
      return {
        source,
        specifiers: [
          { name: source.split('/').pop() || source, isDefault: false, isNamespace: false },
        ],
        isTypeOnly: false,
        line,
      };
    }

    if (family === 'php') {
      // PHP: use Namespace\Class or require_once 'file.php'
      source = source.replace(/^['"]|['"]$/g, '').replace(/;$/, '');
      const parts = source.split('\\');
      const name = parts[parts.length - 1] || source;
      return {
        source,
        specifiers: [{ name, isDefault: false, isNamespace: false }],
        isTypeOnly: false,
        line,
      };
    }

    // C-like (Java, Kotlin, etc.): import package.Class or using Namespace
    // Strip static keyword if present (Java static imports)
    source = source.replace(/^static\s+/, '');
    // Strip quotes if present
    source = source.replace(/^['"]|['"]$/g, '');
    const lastDot = source.lastIndexOf('.');
    const name = lastDot >= 0 ? source.slice(lastDot + 1) : source;

    return {
      source,
      specifiers: [
        {
          name: name === '*' ? '*' : name,
          isDefault: false,
          isNamespace: name === '*',
        },
      ],
      isTypeOnly: false,
      line,
    };
  }

  // ─── Doc comment extraction ──────────────────────────────────────────────

  private extractDocCommentAbove(lines: string[], lineIndex: number): string | undefined {
    if (lineIndex <= 0) return undefined;

    const docLines: string[] = [];
    let inBlockComment = false;
    let i = lineIndex - 1;

    // Scan backwards
    while (i >= 0) {
      const line = lines[i]!;
      const trimmed = line.trim();

      // Check if we're entering a block comment from the end
      if (!inBlockComment) {
        // Check for end of block comment (searching backwards)
        if (trimmed.endsWith('*/')) {
          inBlockComment = true;
          // Check if it's a single-line block comment
          const startIdx = trimmed.indexOf('/*');
          if (startIdx >= 0) {
            // Single-line block comment: /* ... */ or /** ... */
            let content = trimmed.slice(startIdx + 2);
            if (content.startsWith('*') && !content.startsWith('*/')) {
              content = content.slice(1); // Remove extra * from /**
            }
            content = content.replace(/\*\/\s*$/, '').trim();
            if (content) docLines.unshift(content);
            inBlockComment = false;
            i--;
            continue;
          }
          // Multi-line block comment end
          const endContent = trimmed.replace(/\*\/\s*$/, '');
          const javadocMatch = endContent.match(JAVADOC_LINE);
          if (javadocMatch) {
            docLines.unshift(javadocMatch[1] || '');
          } else if (endContent.trim()) {
            docLines.unshift(endContent.trim());
          }
          i--;
          continue;
        }

        // Check for line comments (// or # or ///)
        const xmlMatch = trimmed.match(XML_DOC_COMMENT);
        if (xmlMatch) {
          docLines.unshift(xmlMatch[1] || '');
          i--;
          continue;
        }

        const lineCommentMatch = trimmed.match(LINE_COMMENT);
        if (lineCommentMatch) {
          docLines.unshift(lineCommentMatch[1] || '');
          i--;
          continue;
        }

        // Not a comment line -- stop
        break;
      }

      // Inside block comment
      const blockStartMatch = trimmed.match(BLOCK_COMMENT_START);
      if (blockStartMatch) {
        // Start of block comment found
        const content = blockStartMatch[1] || '';
        if (content.trim()) docLines.unshift(content.trim());
        inBlockComment = false;
        i--;
        continue;
      }

      // Middle of block comment
      const javadocMatch = trimmed.match(JAVADOC_LINE);
      if (javadocMatch) {
        docLines.unshift(javadocMatch[1] || '');
      } else if (trimmed && trimmed !== '*') {
        docLines.unshift(trimmed);
      }

      i--;
    }

    if (docLines.length === 0) return undefined;

    const result = docLines.join('\n').trim();
    return result || undefined;
  }

  // ─── Visibility extraction ───────────────────────────────────────────────

  private extractVisibilityFromLine(
    line: string,
    _family: LanguageFamily,
  ): 'public' | 'private' | 'protected' {
    if (/\bprivate\b/.test(line)) return 'private';
    if (/\bprotected\b/.test(line)) return 'protected';
    return 'public';
  }

  // ─── Keyword filter ──────────────────────────────────────────────────────

  /**
   * Filter out common keywords that regex may misidentify as function names.
   */
  private isKeyword(name: string, _family: LanguageFamily): boolean {
    const keywords = new Set([
      'if',
      'else',
      'while',
      'for',
      'do',
      'switch',
      'case',
      'return',
      'try',
      'catch',
      'finally',
      'throw',
      'throws',
      'new',
      'delete',
      'typeof',
      'instanceof',
      'void',
      'null',
      'true',
      'false',
      'class',
      'interface',
      'enum',
      'struct',
      'trait',
      'object',
      'import',
      'export',
      'package',
      'module',
      'require',
      'include',
      'using',
      'namespace',
      'public',
      'private',
      'protected',
    ]);
    return keywords.has(name);
  }

  // ─── Export collection ───────────────────────────────────────────────────

  private collectExports(result: ExtractorResult): void {
    for (const fn of result.functions) {
      if (fn.visibility === 'public') {
        result.exports.push({
          name: fn.name,
          kind: 'function',
          isReExport: false,
          isTypeOnly: false,
          line: fn.line,
        });
      }
    }

    for (const cls of result.classes) {
      if (cls.visibility === 'public') {
        result.exports.push({
          name: cls.name,
          kind: 'class',
          isReExport: false,
          isTypeOnly: false,
          line: cls.line,
        });
      }
    }
  }
}
