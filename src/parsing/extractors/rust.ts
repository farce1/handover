import type { Tree, Node as SyntaxNode } from 'web-tree-sitter';

import type {
  FunctionSymbol,
  ClassSymbol,
  ImportInfo,
  ExportInfo,
  ConstantSymbol,
  Field,
  Parameter,
} from '../types.js';
import { LanguageExtractor, type ExtractorResult } from './base.js';
import { walkChildren, findChildByType, findChildrenByType, getFieldNode } from '../utils/node-helpers.js';
import { getText, getTextTrimmed, getDocstringAbove, getDecoratorTexts } from '../utils/text-extract.js';

// ─── Rust Extractor ──────────────────────────────────────────────────────────

/**
 * Extracts symbols from Rust source files using tree-sitter AST.
 *
 * Handles: function_item, struct_item, enum_item, trait_item, impl_item,
 * use_declaration, const_item, static_item, with attributes and rustdoc.
 */
export class RustExtractor extends LanguageExtractor {
  readonly parserType = 'tree-sitter' as const;

  extract(tree: Tree, source: string): ExtractorResult {
    const result = this.emptyResult();

    // Track structs/enums by name for impl block method attachment
    const classMap = new Map<string, ClassSymbol>();

    // First pass: extract all top-level items except impl blocks
    walkChildren(tree.rootNode, (node) => {
      switch (node.type) {
        case 'function_item':
          this.extractFunction(node, source, result);
          break;
        case 'struct_item':
          this.extractStruct(node, source, result, classMap);
          break;
        case 'enum_item':
          this.extractEnum(node, source, result, classMap);
          break;
        case 'trait_item':
          this.extractTrait(node, source, result, classMap);
          break;
        case 'use_declaration':
          this.extractUseDeclaration(node, source, result);
          break;
        case 'const_item':
        case 'static_item':
          this.extractConstant(node, source, result);
          break;
        case 'attribute_item':
          // Handled as preceding siblings of items
          break;
      }
    });

    // Second pass: extract impl blocks and attach methods to structs
    walkChildren(tree.rootNode, (node) => {
      if (node.type === 'impl_item') {
        this.extractImplBlock(node, source, result, classMap);
      }
    });

    // Add exports for all public items
    this.collectExports(result);

    return result;
  }

  extractFromSource(_source: string): ExtractorResult {
    throw new Error('RustExtractor only supports tree-sitter parsing');
  }

  // ─── Function extraction ─────────────────────────────────────────────────

  private extractFunction(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    const fn = this.buildFunctionSymbol(node, source);
    if (fn) {
      result.functions.push(fn);
    }
  }

  private buildFunctionSymbol(
    node: SyntaxNode,
    source: string,
  ): FunctionSymbol | null {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return null;

    const name = getText(nameNode, source);
    const parameters = this.extractParameters(node, source);
    const returnType = this.extractReturnType(node, source);
    const typeParameters = this.extractTypeParameters(node, source);
    const visibility = this.extractVisibility(node);
    const isAsync = this.hasKeyword(node, 'async');
    const decorators = this.extractRustAttributes(node, source);
    const docstring = this.extractRustdoc(node, source);

    // Check for unsafe keyword
    if (this.hasKeyword(node, 'unsafe')) {
      decorators.push('unsafe');
    }

    return {
      kind: 'function',
      name,
      parameters,
      returnType,
      typeParameters,
      isAsync,
      isGenerator: false, // Rust has no generators
      visibility,
      decorators,
      docstring,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private extractParameters(
    node: SyntaxNode,
    source: string,
  ): Parameter[] {
    const paramsNode = getFieldNode(node, 'parameters');
    if (!paramsNode) return [];

    const params: Parameter[] = [];

    for (const child of paramsNode.namedChildren) {
      if (child.type === 'self_parameter') {
        // Skip self parameter from parameter list (it's implicit)
        continue;
      }

      if (child.type === 'parameter') {
        const pattern = getFieldNode(child, 'pattern');
        const type = getFieldNode(child, 'type');
        params.push({
          name: pattern ? getTextTrimmed(pattern, source) : '_',
          type: type ? getTextTrimmed(type, source) : undefined,
          isRest: false,
        });
      }
    }

    return params;
  }

  private extractReturnType(
    node: SyntaxNode,
    source: string,
  ): string | undefined {
    const returnTypeNode = getFieldNode(node, 'return_type');
    if (!returnTypeNode) return undefined;

    // Strip the `-> ` prefix
    const text = getTextTrimmed(returnTypeNode, source);
    return text.replace(/^->\s*/, '');
  }

  private extractTypeParameters(
    node: SyntaxNode,
    source: string,
  ): string[] {
    const typeParamsNode = getFieldNode(node, 'type_parameters');
    if (!typeParamsNode) return [];

    const params: string[] = [];
    for (const child of typeParamsNode.namedChildren) {
      if (
        child.type === 'type_identifier' ||
        child.type === 'constrained_type_parameter' ||
        child.type === 'lifetime'
      ) {
        params.push(getTextTrimmed(child, source));
      }
    }
    return params;
  }

  private extractVisibility(node: SyntaxNode): 'public' | 'private' | 'protected' {
    const visNode = findChildByType(node, 'visibility_modifier');
    if (visNode) return 'public';
    return 'private';
  }

  private hasKeyword(node: SyntaxNode, keyword: string): boolean {
    for (const child of node.children) {
      if (!child.isNamed && child.type === keyword) return true;
    }
    return false;
  }

  // ─── Struct extraction ───────────────────────────────────────────────────

  private extractStruct(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
    classMap: Map<string, ClassSymbol>,
  ): void {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return;

    const name = getText(nameNode, source);
    const typeParameters = this.extractTypeParameters(node, source);
    const visibility = this.extractVisibility(node);
    const decorators = this.extractRustAttributes(node, source);
    const docstring = this.extractRustdoc(node, source);
    const fields = this.extractStructFields(node, source);

    const classSymbol: ClassSymbol = {
      kind: 'class',
      name,
      typeParameters,
      extends: [],
      implements: [],
      mixins: [],
      fields,
      methods: [],
      decorators,
      docstring,
      visibility,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };

    result.classes.push(classSymbol);
    classMap.set(name, classSymbol);
  }

  private extractStructFields(
    node: SyntaxNode,
    source: string,
  ): Field[] {
    const fields: Field[] = [];
    const bodyNode = findChildByType(node, 'field_declaration_list');
    if (!bodyNode) return fields;

    for (const child of bodyNode.namedChildren) {
      if (child.type === 'field_declaration') {
        const nameNode = getFieldNode(child, 'name');
        const typeNode = getFieldNode(child, 'type');
        const vis = this.extractVisibility(child);

        if (nameNode) {
          fields.push({
            name: getText(nameNode, source),
            type: typeNode ? getTextTrimmed(typeNode, source) : undefined,
            visibility: vis,
            isStatic: false,
            isReadonly: false,
          });
        }
      }
    }

    return fields;
  }

  // ─── Enum extraction ─────────────────────────────────────────────────────

  private extractEnum(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
    classMap: Map<string, ClassSymbol>,
  ): void {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return;

    const name = getText(nameNode, source);
    const typeParameters = this.extractTypeParameters(node, source);
    const visibility = this.extractVisibility(node);
    const decorators = this.extractRustAttributes(node, source);
    const docstring = this.extractRustdoc(node, source);
    const fields = this.extractEnumVariants(node, source);

    const classSymbol: ClassSymbol = {
      kind: 'class',
      name,
      typeParameters,
      extends: [],
      implements: [],
      mixins: [],
      fields,
      methods: [],
      decorators,
      docstring,
      visibility,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };

    result.classes.push(classSymbol);
    classMap.set(name, classSymbol);

    // Also record as ExportInfo with kind 'enum'
    if (visibility === 'public') {
      result.exports.push({
        name,
        kind: 'enum',
        isReExport: false,
        isTypeOnly: false,
        line: node.startPosition.row + 1,
      });
    }
  }

  private extractEnumVariants(
    node: SyntaxNode,
    source: string,
  ): Field[] {
    const fields: Field[] = [];
    const bodyNode = findChildByType(node, 'enum_variant_list');
    if (!bodyNode) return fields;

    for (const child of bodyNode.namedChildren) {
      if (child.type === 'enum_variant') {
        const nameNode = getFieldNode(child, 'name');
        if (nameNode) {
          // Capture the full variant text for type info (tuple variants, struct variants)
          const bodyChild = findChildByType(child, 'field_declaration_list') ||
            findChildByType(child, 'ordered_field_declaration_list');
          fields.push({
            name: getText(nameNode, source),
            type: bodyChild ? getTextTrimmed(bodyChild, source) : undefined,
            visibility: 'public',
            isStatic: false,
            isReadonly: false,
          });
        }
      }
    }

    return fields;
  }

  // ─── Trait extraction ────────────────────────────────────────────────────

  private extractTrait(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
    classMap: Map<string, ClassSymbol>,
  ): void {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return;

    const name = getText(nameNode, source);
    const typeParameters = this.extractTypeParameters(node, source);
    const visibility = this.extractVisibility(node);
    const decorators = this.extractRustAttributes(node, source);
    const docstring = this.extractRustdoc(node, source);

    // Extract supertrait bounds
    const boundsNode = getFieldNode(node, 'bounds');
    const extendsArr: string[] = [];
    if (boundsNode) {
      // bounds is a trait_bounds node containing type identifiers
      for (const child of boundsNode.namedChildren) {
        extendsArr.push(getTextTrimmed(child, source));
      }
    }

    // Extract method signatures from trait body
    const methods: FunctionSymbol[] = [];
    const bodyNode = findChildByType(node, 'declaration_list');
    if (bodyNode) {
      for (const child of bodyNode.namedChildren) {
        if (child.type === 'function_item' || child.type === 'function_signature_item') {
          const fn = this.buildFunctionSymbol(child, source);
          if (fn) methods.push(fn);
        }
      }
    }

    const classSymbol: ClassSymbol = {
      kind: 'class',
      name,
      typeParameters,
      extends: extendsArr,
      implements: [],
      mixins: [],
      fields: [],
      methods,
      decorators,
      docstring,
      visibility,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };

    result.classes.push(classSymbol);
    classMap.set(name, classSymbol);
  }

  // ─── Impl block extraction ──────────────────────────────────────────────

  private extractImplBlock(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
    classMap: Map<string, ClassSymbol>,
  ): void {
    const typeNode = getFieldNode(node, 'type');
    const traitNode = getFieldNode(node, 'trait');
    if (!typeNode) return;

    const typeName = getTextTrimmed(typeNode, source);
    const traitName = traitNode ? getTextTrimmed(traitNode, source) : null;

    // Extract methods from impl body
    const methods: FunctionSymbol[] = [];
    const bodyNode = findChildByType(node, 'declaration_list');
    if (bodyNode) {
      for (const child of bodyNode.namedChildren) {
        if (child.type === 'function_item') {
          const fn = this.buildFunctionSymbol(child, source);
          if (fn) methods.push(fn);
        }
      }
    }

    // Attach methods to corresponding struct/enum ClassSymbol
    const target = classMap.get(typeName);
    if (target) {
      target.methods.push(...methods);
      if (traitName) {
        if (!target.implements.includes(traitName)) {
          target.implements.push(traitName);
        }
      }
    } else {
      // No struct found -- still record methods as top-level functions
      // (this can happen with impl for primitive types or external types)
      for (const fn of methods) {
        result.functions.push(fn);
      }
    }
  }

  // ─── Use declaration extraction ─────────────────────────────────────────

  private extractUseDeclaration(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    const visibility = this.extractVisibility(node);
    const isReExport = visibility === 'public';

    // The argument child holds the use path
    const argNode = getFieldNode(node, 'argument');
    if (!argNode) return;

    const imports = this.parseUseArgument(argNode, source, '');
    for (const imp of imports) {
      const importInfo: ImportInfo = {
        source: imp.path,
        specifiers: imp.names.map((n) => ({
          name: n.name,
          alias: n.alias,
          isDefault: false,
          isNamespace: n.isWildcard || false,
        })),
        isTypeOnly: false,
        line: node.startPosition.row + 1,
      };
      result.imports.push(importInfo);

      if (isReExport) {
        for (const n of imp.names) {
          result.reExports.push({
            name: n.alias || n.name,
            kind: 're-export',
            isReExport: true,
            source: imp.path,
            isTypeOnly: false,
            line: node.startPosition.row + 1,
          });
        }
      }
    }
  }

  private parseUseArgument(
    node: SyntaxNode,
    source: string,
    prefix: string,
  ): Array<{ path: string; names: Array<{ name: string; alias?: string; isWildcard?: boolean }> }> {
    const results: Array<{ path: string; names: Array<{ name: string; alias?: string; isWildcard?: boolean }> }> = [];

    switch (node.type) {
      case 'scoped_identifier':
      case 'identifier': {
        const fullPath = getTextTrimmed(node, source);
        const parts = fullPath.split('::');
        const name = parts[parts.length - 1]!;
        const path = prefix ? `${prefix}::${parts.slice(0, -1).join('::')}` : parts.slice(0, -1).join('::');
        results.push({
          path: path || fullPath,
          names: [{ name }],
        });
        break;
      }

      case 'use_wildcard': {
        const fullText = getTextTrimmed(node, source);
        const pathPart = fullText.replace(/::?\*$/, '');
        results.push({
          path: prefix ? `${prefix}::${pathPart}` : pathPart,
          names: [{ name: '*', isWildcard: true }],
        });
        break;
      }

      case 'use_list': {
        for (const child of node.namedChildren) {
          const sub = this.parseUseArgument(child, source, prefix);
          results.push(...sub);
        }
        break;
      }

      case 'scoped_use_list': {
        // Has a path prefix and a use_list child
        const pathNode = getFieldNode(node, 'path');
        const listNode = getFieldNode(node, 'list');
        const scopePath = pathNode ? getTextTrimmed(pathNode, source) : '';
        const fullPrefix = prefix ? `${prefix}::${scopePath}` : scopePath;

        if (listNode) {
          for (const child of listNode.namedChildren) {
            const sub = this.parseUseArgument(child, source, fullPrefix);
            results.push(...sub);
          }
        }
        break;
      }

      case 'use_as_clause': {
        const pathChild = node.namedChildren[0];
        const aliasChild = node.namedChildren[1];
        if (pathChild) {
          const fullPath = getTextTrimmed(pathChild, source);
          const parts = fullPath.split('::');
          const name = parts[parts.length - 1]!;
          const path = prefix ? `${prefix}::${parts.slice(0, -1).join('::')}` : parts.slice(0, -1).join('::');
          results.push({
            path: path || fullPath,
            names: [{
              name,
              alias: aliasChild ? getTextTrimmed(aliasChild, source) : undefined,
            }],
          });
        }
        break;
      }

      default: {
        // Fallback: treat as simple identifier
        const text = getTextTrimmed(node, source);
        if (text) {
          results.push({
            path: prefix || text,
            names: [{ name: text }],
          });
        }
        break;
      }
    }

    return results;
  }

  // ─── Constant extraction ─────────────────────────────────────────────────

  private extractConstant(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return;

    const visibility = this.extractVisibility(node);
    const isExported = visibility === 'public';

    const name = getText(nameNode, source);
    const typeNode = getFieldNode(node, 'type');
    const valueNode = getFieldNode(node, 'value');

    const constant: ConstantSymbol = {
      kind: 'constant',
      name,
      type: typeNode ? getTextTrimmed(typeNode, source) : undefined,
      value: valueNode ? getTextTrimmed(valueNode, source).slice(0, 100) : undefined,
      isExported,
      docstring: this.extractRustdoc(node, source),
      line: node.startPosition.row + 1,
    };

    result.constants.push(constant);
  }

  // ─── Rust attributes (decorators) ────────────────────────────────────────

  private extractRustAttributes(
    node: SyntaxNode,
    source: string,
  ): string[] {
    return getDecoratorTexts(node, source);
  }

  // ─── Rustdoc extraction ──────────────────────────────────────────────────

  private extractRustdoc(
    node: SyntaxNode,
    source: string,
  ): string | undefined {
    // Collect consecutive /// or //! comments above the node
    const comments: string[] = [];
    let sibling = node.previousNamedSibling;

    // Walk backwards collecting comment nodes
    while (sibling) {
      if (sibling.type === 'line_comment' || sibling.type === 'block_comment') {
        const text = getText(sibling, source);
        // Only include doc comments (/// or /** or //!)
        if (text.startsWith('///') || text.startsWith('/**') || text.startsWith('//!')) {
          comments.unshift(text);
          sibling = sibling.previousNamedSibling;
          continue;
        }
      }
      // Also skip over attribute_item nodes (they appear between comments and the item)
      if (sibling.type === 'attribute_item') {
        sibling = sibling.previousNamedSibling;
        continue;
      }
      break;
    }

    if (comments.length === 0) {
      // Fall back to the generic docstring extractor
      return getDocstringAbove(node, source);
    }

    // Clean up the collected comments
    const cleaned = comments.map((c) => {
      if (c.startsWith('///')) {
        const line = c.slice(3);
        return line.startsWith(' ') ? line.slice(1) : line;
      }
      if (c.startsWith('//!')) {
        const line = c.slice(3);
        return line.startsWith(' ') ? line.slice(1) : line;
      }
      if (c.startsWith('/**')) {
        // Block doc comment
        let inner = c.slice(3);
        if (inner.endsWith('*/')) inner = inner.slice(0, -2);
        return inner
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('* ')) return trimmed.slice(2);
            if (trimmed === '*') return '';
            return trimmed;
          })
          .join('\n')
          .trim();
      }
      return c;
    });

    return cleaned.join('\n').trim() || undefined;
  }

  // ─── Export collection ───────────────────────────────────────────────────

  private collectExports(result: ExtractorResult): void {
    // Collect all public functions as exports
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

    // Collect all public classes (structs/enums/traits) as exports
    // (enums already added in extractEnum with kind 'enum')
    for (const cls of result.classes) {
      if (cls.visibility === 'public') {
        // Check if already added (e.g., enums)
        const existing = result.exports.find(
          (e) => e.name === cls.name && e.line === cls.line,
        );
        if (!existing) {
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

    // Collect exported constants
    for (const c of result.constants) {
      if (c.isExported) {
        result.exports.push({
          name: c.name,
          kind: 'variable',
          isReExport: false,
          isTypeOnly: false,
          line: c.line,
        });
      }
    }
  }
}
