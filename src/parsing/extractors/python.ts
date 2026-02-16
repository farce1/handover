import type { Tree, Node as SyntaxNode } from 'web-tree-sitter';

import { LanguageExtractor, type ExtractorResult } from './base.js';
import { findChildByType, findChildrenByType, getFieldNode, getNamedChildren } from '../utils/node-helpers.js';
import { getText, getTextTrimmed, getDocstringAbove, getDecoratorTexts } from '../utils/text-extract.js';
import type {
  FunctionSymbol,
  ClassSymbol,
  ImportInfo,
  ImportSpecifier,
  ExportInfo,
  ConstantSymbol,
  Parameter,
  Field,
} from '../types.js';

// ─── Python extractor ───────────────────────────────────────────────────────

/**
 * Extracts symbols from Python source files using tree-sitter AST walking.
 *
 * Handles: function_definition, decorated_definition, class_definition,
 * import_statement, import_from_statement, __all__ assignment,
 * module-level constants (UPPER_CASE), decorators, type annotations,
 * and Python docstrings (triple-quoted strings).
 */
export class PythonExtractor extends LanguageExtractor {
  readonly parserType = 'tree-sitter' as const;

  extract(tree: Tree, source: string): ExtractorResult {
    const result = this.emptyResult();
    this.walkModule(tree.rootNode, source, result);
    return result;
  }

  extractFromSource(_source: string): ExtractorResult {
    // Tree-sitter extractor does not support regex fallback
    return this.emptyResult();
  }

  // ─── Top-level module walking ──────────────────────────────────────────

  private walkModule(
    root: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    // Track __all__ for explicit re-exports
    let allExports: string[] | null = null;

    for (const child of getNamedChildren(root)) {
      switch (child.type) {
        case 'function_definition': {
          const fn = this.extractFunction(child, source, false);
          if (fn) {
            result.functions.push(fn);
            // All top-level functions are implicitly exported
            result.exports.push({
              name: fn.name,
              kind: 'function',
              isReExport: false,
              isTypeOnly: false,
              line: fn.line,
            });
          }
          break;
        }

        case 'decorated_definition': {
          this.handleDecoratedDefinition(child, source, result);
          break;
        }

        case 'class_definition': {
          const cls = this.extractClass(child, source);
          if (cls) {
            result.classes.push(cls);
            result.exports.push({
              name: cls.name,
              kind: 'class',
              isReExport: false,
              isTypeOnly: false,
              line: cls.line,
            });
          }
          break;
        }

        case 'import_statement': {
          this.extractImportStatement(child, source, result);
          break;
        }

        case 'import_from_statement': {
          this.extractImportFromStatement(child, source, result);
          break;
        }

        case 'expression_statement': {
          // Check for __all__ assignment or UPPER_CASE constants
          this.handleExpressionStatement(child, source, result);
          break;
        }

        default:
          break;
      }
    }

    // Process __all__ for re-exports after full module walk
    allExports = this.findAllExports(root, source);
    if (allExports) {
      for (const name of allExports) {
        result.reExports.push({
          name,
          kind: 're-export',
          isReExport: true,
          isTypeOnly: false,
          line: 1, // __all__ line found during extraction
        });
      }
    }
  }

  // ─── Decorated definition handling ─────────────────────────────────────

  private handleDecoratedDefinition(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    // A decorated_definition contains decorator children and an inner definition
    const innerDef = this.findInnerDefinition(node);
    if (!innerDef) return;

    if (innerDef.type === 'function_definition') {
      const fn = this.extractFunction(innerDef, source, false);
      if (fn) {
        result.functions.push(fn);
        result.exports.push({
          name: fn.name,
          kind: 'function',
          isReExport: false,
          isTypeOnly: false,
          line: fn.line,
        });
      }
    } else if (innerDef.type === 'class_definition') {
      const cls = this.extractClass(innerDef, source);
      if (cls) {
        result.classes.push(cls);
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

  private findInnerDefinition(node: SyntaxNode): SyntaxNode | null {
    for (const child of getNamedChildren(node)) {
      if (
        child.type === 'function_definition' ||
        child.type === 'class_definition'
      ) {
        return child;
      }
      // Nested decorated_definition (multiple decorators)
      if (child.type === 'decorated_definition') {
        return this.findInnerDefinition(child);
      }
    }
    return null;
  }

  // ─── Function extraction ───────────────────────────────────────────────

  private extractFunction(
    node: SyntaxNode,
    source: string,
    isMethod: boolean,
  ): FunctionSymbol | null {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return null;

    const name = getText(nameNode, source);
    const paramsNode = getFieldNode(node, 'parameters');
    const returnTypeNode = getFieldNode(node, 'return_type');
    const bodyNode = getFieldNode(node, 'body');

    // Async detection: check parent or current node for 'async' keyword
    const isAsync = this.hasKeywordChild(node, 'async');

    // Visibility based on Python naming conventions
    const visibility = this.getPythonVisibility(name);

    // Decorators from parent decorated_definition
    const decorators = getDecoratorTexts(node, source);

    // Docstring from first statement in body
    const docstring = bodyNode
      ? this.extractPythonDocstring(bodyNode, source)
      : undefined;

    return {
      kind: 'function',
      name,
      parameters: paramsNode
        ? this.extractParameters(paramsNode, source, isMethod)
        : [],
      returnType: returnTypeNode
        ? this.extractReturnType(returnTypeNode, source)
        : undefined,
      typeParameters: [], // Python doesn't have type parameters on functions (TypeVar is different)
      isAsync,
      isGenerator: false, // Python generators use 'yield' in body; not easily detectable from signature
      visibility,
      decorators,
      docstring,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  // ─── Parameter extraction ──────────────────────────────────────────────

  private extractParameters(
    paramsNode: SyntaxNode,
    source: string,
    isMethod: boolean,
  ): Parameter[] {
    const params: Parameter[] = [];
    let skipSelf = isMethod;

    for (const child of getNamedChildren(paramsNode)) {
      switch (child.type) {
        case 'identifier': {
          const name = getText(child, source);
          // Skip 'self' and 'cls' for methods
          if (skipSelf && (name === 'self' || name === 'cls')) {
            skipSelf = false;
            continue;
          }
          params.push({ name, isRest: false });
          break;
        }

        case 'typed_parameter': {
          const param = this.extractTypedParameter(child, source, skipSelf);
          if (param === 'skip') {
            skipSelf = false;
            continue;
          }
          if (param) params.push(param);
          break;
        }

        case 'default_parameter': {
          const param = this.extractDefaultParameter(child, source, skipSelf);
          if (param === 'skip') {
            skipSelf = false;
            continue;
          }
          if (param) params.push(param);
          break;
        }

        case 'typed_default_parameter': {
          const param = this.extractTypedDefaultParameter(child, source, skipSelf);
          if (param === 'skip') {
            skipSelf = false;
            continue;
          }
          if (param) params.push(param);
          break;
        }

        case 'list_splat_pattern': {
          // *args
          const nameNode = getNamedChildren(child)[0];
          if (nameNode) {
            params.push({
              name: getText(nameNode, source),
              isRest: true,
            });
          }
          break;
        }

        case 'dictionary_splat_pattern': {
          // **kwargs
          const nameNode = getNamedChildren(child)[0];
          if (nameNode) {
            params.push({
              name: getText(nameNode, source),
              type: 'dict',
              isRest: true,
            });
          }
          break;
        }

        default:
          break;
      }
    }

    return params;
  }

  private extractTypedParameter(
    node: SyntaxNode,
    source: string,
    skipSelf: boolean,
  ): Parameter | 'skip' | null {
    // typed_parameter: name : type
    const children = getNamedChildren(node);
    const nameNode = children[0];
    if (!nameNode) return null;

    const name = getText(nameNode, source);
    if (skipSelf && (name === 'self' || name === 'cls')) return 'skip';

    // Find the type node
    const typeNode = getFieldNode(node, 'type');
    const type = typeNode ? getTextTrimmed(typeNode, source) : undefined;

    return { name, type, isRest: false };
  }

  private extractDefaultParameter(
    node: SyntaxNode,
    source: string,
    skipSelf: boolean,
  ): Parameter | 'skip' | null {
    // default_parameter: name = value
    const nameNode = getFieldNode(node, 'name');
    const valueNode = getFieldNode(node, 'value');

    if (!nameNode) return null;

    const name = getText(nameNode, source);
    if (skipSelf && (name === 'self' || name === 'cls')) return 'skip';

    return {
      name,
      defaultValue: valueNode ? getTextTrimmed(valueNode, source) : undefined,
      isRest: false,
    };
  }

  private extractTypedDefaultParameter(
    node: SyntaxNode,
    source: string,
    skipSelf: boolean,
  ): Parameter | 'skip' | null {
    // typed_default_parameter: name : type = value
    const nameNode = getFieldNode(node, 'name');
    const typeNode = getFieldNode(node, 'type');
    const valueNode = getFieldNode(node, 'value');

    if (!nameNode) return null;

    const name = getText(nameNode, source);
    if (skipSelf && (name === 'self' || name === 'cls')) return 'skip';

    return {
      name,
      type: typeNode ? getTextTrimmed(typeNode, source) : undefined,
      defaultValue: valueNode ? getTextTrimmed(valueNode, source) : undefined,
      isRest: false,
    };
  }

  // ─── Return type extraction ────────────────────────────────────────────

  private extractReturnType(
    node: SyntaxNode,
    source: string,
  ): string {
    // return_type has -> type_annotation; strip the arrow
    const text = getTextTrimmed(node, source);
    return text.replace(/^->\s*/, '');
  }

  // ─── Class extraction ─────────────────────────────────────────────────

  private extractClass(
    node: SyntaxNode,
    source: string,
  ): ClassSymbol | null {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return null;

    const name = getText(nameNode, source);
    const bodyNode = getFieldNode(node, 'body');

    // Superclasses from argument_list
    const superclassesNode = getFieldNode(node, 'superclasses');
    const extendsArr: string[] = [];
    if (superclassesNode) {
      for (const ch of getNamedChildren(superclassesNode)) {
        const text = getTextTrimmed(ch, source);
        // Skip metaclass= and other keyword arguments
        if (ch.type === 'keyword_argument') continue;
        if (text) extendsArr.push(text);
      }
    }

    // Extract methods, fields, and class docstring
    const methods: FunctionSymbol[] = [];
    const fields: Field[] = [];
    let docstring: string | undefined;

    if (bodyNode) {
      // Docstring: first statement if it's a string expression
      docstring = this.extractPythonDocstring(bodyNode, source);

      // Walk body for methods and class attributes
      this.extractClassBody(bodyNode, source, methods, fields, name);
    }

    // Decorators
    const decorators = getDecoratorTexts(node, source);

    return {
      kind: 'class',
      name,
      typeParameters: [],
      extends: extendsArr,
      implements: [],
      mixins: [],
      fields,
      methods,
      decorators,
      docstring,
      visibility: this.getPythonVisibility(name),
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private extractClassBody(
    bodyNode: SyntaxNode,
    source: string,
    methods: FunctionSymbol[],
    fields: Field[],
    className: string,
  ): void {
    for (const child of getNamedChildren(bodyNode)) {
      switch (child.type) {
        case 'function_definition': {
          const fn = this.extractFunction(child, source, true);
          if (fn) {
            // Extract instance fields from __init__ method
            if (fn.name === '__init__') {
              this.extractInitFields(child, source, fields);
            }
            methods.push(fn);
          }
          break;
        }

        case 'decorated_definition': {
          const innerDef = this.findInnerDefinition(child);
          if (innerDef && innerDef.type === 'function_definition') {
            const fn = this.extractFunction(innerDef, source, true);
            if (fn) {
              if (fn.name === '__init__') {
                this.extractInitFields(innerDef, source, fields);
              }
              methods.push(fn);
            }
          }
          break;
        }

        case 'expression_statement': {
          // Class-level attribute assignments
          this.extractClassAttribute(child, source, fields);
          break;
        }

        default:
          break;
      }
    }
  }

  private extractInitFields(
    initNode: SyntaxNode,
    source: string,
    fields: Field[],
  ): void {
    const bodyNode = getFieldNode(initNode, 'body');
    if (!bodyNode) return;

    for (const stmt of getNamedChildren(bodyNode)) {
      if (stmt.type === 'expression_statement') {
        const expr = getNamedChildren(stmt)[0];
        if (expr && expr.type === 'assignment') {
          const left = getFieldNode(expr, 'left');
          if (left && left.type === 'attribute') {
            // self.name = value
            const objNode = getFieldNode(left, 'object');
            const attrNode = getFieldNode(left, 'attribute');
            if (objNode && attrNode) {
              const objText = getText(objNode, source);
              if (objText === 'self') {
                const fieldName = getText(attrNode, source);
                // Check if field already exists (from class body)
                const existing = fields.find((f) => f.name === fieldName);
                if (!existing) {
                  fields.push({
                    name: fieldName,
                    visibility: this.getPythonVisibility(fieldName),
                    isStatic: false,
                    isReadonly: false,
                  });
                }
              }
            }
          }
        }
      }
      // Also handle type-annotated assignments: self.name: type = value
      if (stmt.type === 'expression_statement') {
        const expr = getNamedChildren(stmt)[0];
        if (expr && expr.type === 'type') {
          // This pattern: self.name: Type = value
          // In tree-sitter-python, this appears as an `assignment` with a `type` annotation
          // Let's check for annotated assignment patterns
        }
      }
    }
  }

  private extractClassAttribute(
    stmtNode: SyntaxNode,
    source: string,
    fields: Field[],
  ): void {
    const expr = getNamedChildren(stmtNode)[0];
    if (!expr) return;

    if (expr.type === 'assignment') {
      const left = getFieldNode(expr, 'left');
      if (left && left.type === 'identifier') {
        const name = getText(left, source);
        const typeNode = getFieldNode(expr, 'type');
        fields.push({
          name,
          type: typeNode ? getTextTrimmed(typeNode, source) : undefined,
          visibility: this.getPythonVisibility(name),
          isStatic: true, // Class-level attributes are class variables
          isReadonly: false,
        });
      }
    }
  }

  // ─── Import extraction ─────────────────────────────────────────────────

  private extractImportStatement(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    // import X, Y, Z
    const specifiers: ImportSpecifier[] = [];

    for (const child of getNamedChildren(node)) {
      if (child.type === 'dotted_name') {
        const name = getText(child, source);
        specifiers.push({
          name,
          isDefault: false,
          isNamespace: true, // import X makes X a namespace
        });
      } else if (child.type === 'aliased_import') {
        const nameNode = getFieldNode(child, 'name');
        const aliasNode = getFieldNode(child, 'alias');
        if (nameNode) {
          specifiers.push({
            name: getText(nameNode, source),
            alias: aliasNode ? getText(aliasNode, source) : undefined,
            isDefault: false,
            isNamespace: true,
          });
        }
      }
    }

    if (specifiers.length > 0) {
      // For `import X`, the source is the module name itself
      result.imports.push({
        source: specifiers[0]!.name,
        specifiers,
        isTypeOnly: false,
        line: node.startPosition.row + 1,
      });
    }
  }

  private extractImportFromStatement(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    // from X import Y, Z  or  from X import *
    const moduleNode = getFieldNode(node, 'module_name');
    if (!moduleNode) return;

    const moduleName = getText(moduleNode, source);
    const specifiers: ImportSpecifier[] = [];

    // Track the module_name node's position to skip it
    const moduleStart = moduleNode.startIndex;
    const moduleEnd = moduleNode.endIndex;

    for (const child of getNamedChildren(node)) {
      // Skip the module_name node (it's the source, not a specifier)
      if (child.startIndex === moduleStart && child.endIndex === moduleEnd) continue;

      switch (child.type) {
        case 'dotted_name':
        case 'identifier': {
          // Named import
          specifiers.push({
            name: getText(child, source),
            isDefault: false,
            isNamespace: false,
          });
          break;
        }

        case 'aliased_import': {
          const nameNode = getFieldNode(child, 'name');
          const aliasNode = getFieldNode(child, 'alias');
          if (nameNode) {
            specifiers.push({
              name: getText(nameNode, source),
              alias: aliasNode ? getText(aliasNode, source) : undefined,
              isDefault: false,
              isNamespace: false,
            });
          }
          break;
        }

        case 'wildcard_import': {
          specifiers.push({
            name: '*',
            isDefault: false,
            isNamespace: true,
          });
          break;
        }

        default:
          break;
      }
    }

    result.imports.push({
      source: moduleName,
      specifiers,
      isTypeOnly: false,
      line: node.startPosition.row + 1,
    });
  }

  // ─── __all__ and constant extraction ───────────────────────────────────

  private handleExpressionStatement(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    const expr = getNamedChildren(node)[0];
    if (!expr) return;

    if (expr.type === 'assignment') {
      const left = getFieldNode(expr, 'left');
      const right = getFieldNode(expr, 'right');

      if (left && left.type === 'identifier') {
        const name = getText(left, source);

        // UPPER_CASE module-level constants
        if (this.isUpperCaseConstant(name)) {
          const typeNode = getFieldNode(expr, 'type');
          result.constants.push({
            kind: 'constant',
            name,
            type: typeNode ? getTextTrimmed(typeNode, source) : undefined,
            value: right ? this.getShortValue(right, source) : undefined,
            isExported: true,
            docstring: getDocstringAbove(node, source),
            line: node.startPosition.row + 1,
          });
          result.exports.push({
            name,
            kind: 'variable',
            isReExport: false,
            isTypeOnly: false,
            line: node.startPosition.row + 1,
          });
        }
      }
    }
  }

  /**
   * Find and parse __all__ assignment in the module.
   * Returns the list of exported names, or null if __all__ is not found.
   */
  private findAllExports(
    root: SyntaxNode,
    source: string,
  ): string[] | null {
    for (const child of getNamedChildren(root)) {
      if (child.type === 'expression_statement') {
        const expr = getNamedChildren(child)[0];
        if (expr && expr.type === 'assignment') {
          const left = getFieldNode(expr, 'left');
          const right = getFieldNode(expr, 'right');

          if (left && getText(left, source) === '__all__' && right) {
            return this.parseListLiteral(right, source);
          }
        }
      }
    }
    return null;
  }

  private parseListLiteral(
    node: SyntaxNode,
    source: string,
  ): string[] {
    const names: string[] = [];

    if (node.type === 'list' || node.type === 'tuple') {
      for (const child of getNamedChildren(node)) {
        if (child.type === 'string') {
          const text = this.stripPythonQuotes(getText(child, source));
          if (text) names.push(text);
        }
      }
    }

    return names;
  }

  // ─── Python docstring extraction ───────────────────────────────────────

  /**
   * Extract Python docstring from the first statement in a body block.
   * Python docstrings are the first expression_statement containing a string literal.
   */
  private extractPythonDocstring(
    bodyNode: SyntaxNode,
    source: string,
  ): string | undefined {
    const children = getNamedChildren(bodyNode);
    if (children.length === 0) return undefined;

    const firstStmt = children[0]!;
    if (firstStmt.type !== 'expression_statement') return undefined;

    const expr = getNamedChildren(firstStmt)[0];
    if (!expr) return undefined;

    // The expression should be a string node (triple-quoted docstring)
    if (expr.type === 'string' || expr.type === 'concatenated_string') {
      const raw = getText(expr, source);
      return this.stripPythonDocstring(raw);
    }

    return undefined;
  }

  /**
   * Strip Python triple-quote markers and normalize indentation.
   */
  private stripPythonDocstring(raw: string): string {
    let text = raw;

    // Remove triple quotes (""" or ''')
    if (text.startsWith('"""') && text.endsWith('"""')) {
      text = text.slice(3, -3);
    } else if (text.startsWith("'''") && text.endsWith("'''")) {
      text = text.slice(3, -3);
    } else if (text.startsWith('"') && text.endsWith('"')) {
      text = text.slice(1, -1);
    } else if (text.startsWith("'") && text.endsWith("'")) {
      text = text.slice(1, -1);
    }

    // Normalize indentation: find minimum indentation and strip it
    const lines = text.split('\n');
    if (lines.length <= 1) return text.trim();

    // Find minimum indentation (skip first and empty lines)
    let minIndent = Infinity;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim().length === 0) continue;
      const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      if (indent < minIndent) minIndent = indent;
    }

    if (minIndent === Infinity) minIndent = 0;

    // Strip common indentation
    const stripped = lines.map((line, i) => {
      if (i === 0) return line.trim();
      return line.slice(minIndent);
    });

    return stripped.join('\n').trim();
  }

  // ─── Helper methods ────────────────────────────────────────────────────

  private hasKeywordChild(node: SyntaxNode, keyword: string): boolean {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && !child.isNamed && child.type === keyword) {
        return true;
      }
    }
    return false;
  }

  private getPythonVisibility(name: string): 'public' | 'private' | 'protected' {
    // Dunder methods (__init__, __str__, etc.) are public
    if (name.startsWith('__') && name.endsWith('__')) return 'public';
    // Double underscore prefix = name mangling = private
    if (name.startsWith('__')) return 'private';
    // Single underscore prefix = protected by convention
    if (name.startsWith('_')) return 'protected';
    return 'public';
  }

  private isUpperCaseConstant(name: string): boolean {
    // Match ALL_CAPS_WITH_UNDERSCORES pattern
    return /^[A-Z][A-Z0-9_]*$/.test(name);
  }

  private stripPythonQuotes(str: string): string {
    if (
      (str.startsWith("'") && str.endsWith("'")) ||
      (str.startsWith('"') && str.endsWith('"'))
    ) {
      return str.slice(1, -1);
    }
    // Triple quotes
    if (str.startsWith('"""') && str.endsWith('"""')) {
      return str.slice(3, -3);
    }
    if (str.startsWith("'''") && str.endsWith("'''")) {
      return str.slice(3, -3);
    }
    return str;
  }

  private getShortValue(node: SyntaxNode, source: string): string | undefined {
    const text = getTextTrimmed(node, source);
    if (text.length > 100) return text.slice(0, 97) + '...';
    return text;
  }
}
