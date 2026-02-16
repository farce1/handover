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
import { getText, getTextTrimmed, getDocstringAbove } from '../utils/text-extract.js';

// ─── Go Extractor ────────────────────────────────────────────────────────────

/**
 * Extracts symbols from Go source files using tree-sitter AST.
 *
 * Handles: function_declaration, method_declaration, type_spec (struct/interface),
 * import_declaration, const_declaration, var_declaration, with Go doc comments
 * and uppercase-name export convention.
 */
export class GoExtractor extends LanguageExtractor {
  readonly parserType = 'tree-sitter' as const;

  extract(tree: Tree, source: string): ExtractorResult {
    const result = this.emptyResult();

    // Track structs by name for method attachment
    const classMap = new Map<string, ClassSymbol>();

    // First pass: extract all declarations except methods
    walkChildren(tree.rootNode, (node) => {
      switch (node.type) {
        case 'function_declaration':
          this.extractFunction(node, source, result);
          break;
        case 'type_declaration':
          this.extractTypeDeclaration(node, source, result, classMap);
          break;
        case 'import_declaration':
          this.extractImportDeclaration(node, source, result);
          break;
        case 'const_declaration':
          this.extractConstDeclaration(node, source, result);
          break;
        case 'var_declaration':
          this.extractVarDeclaration(node, source, result);
          break;
      }
    });

    // Second pass: extract methods and attach to structs
    walkChildren(tree.rootNode, (node) => {
      if (node.type === 'method_declaration') {
        this.extractMethod(node, source, result, classMap);
      }
    });

    // Collect exports based on Go naming convention
    this.collectExports(result);

    return result;
  }

  extractFromSource(_source: string): ExtractorResult {
    throw new Error('GoExtractor only supports tree-sitter parsing');
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
    const visibility = isExported(name) ? 'public' : 'private';
    const docstring = this.extractGoDocComment(node, source);

    return {
      kind: 'function',
      name,
      parameters,
      returnType,
      typeParameters,
      isAsync: false, // Go has no async keyword
      isGenerator: false, // Go has no generators
      visibility,
      decorators: [], // Go has no decorators
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
      if (child.type === 'parameter_declaration') {
        const typeNode = getFieldNode(child, 'type');
        const typeText = typeNode ? getTextTrimmed(typeNode, source) : undefined;

        // Go allows multiple names per type: func(a, b int)
        const names: string[] = [];
        for (const nameChild of child.namedChildren) {
          if (nameChild.type === 'identifier') {
            names.push(getText(nameChild, source));
          }
        }

        // Check for variadic parameter (... prefix on type)
        const isVariadic = typeNode?.type === 'variadic_parameter_declaration' ||
          (typeText && typeText.startsWith('...'));

        if (names.length > 0) {
          for (const n of names) {
            params.push({
              name: n,
              type: typeText,
              isRest: isVariadic || false,
            });
          }
        } else {
          // Unnamed parameter (just a type)
          params.push({
            name: '_',
            type: typeText,
            isRest: isVariadic || false,
          });
        }
      } else if (child.type === 'variadic_parameter_declaration') {
        const typeNode = getFieldNode(child, 'type');
        const nameNode = getFieldNode(child, 'name');
        params.push({
          name: nameNode ? getText(nameNode, source) : '_',
          type: typeNode ? `...${getTextTrimmed(typeNode, source)}` : '...any',
          isRest: true,
        });
      }
    }

    return params;
  }

  private extractReturnType(
    node: SyntaxNode,
    source: string,
  ): string | undefined {
    const resultNode = getFieldNode(node, 'result');
    if (!resultNode) return undefined;

    return getTextTrimmed(resultNode, source);
  }

  private extractTypeParameters(
    node: SyntaxNode,
    source: string,
  ): string[] {
    const typeParamsNode = getFieldNode(node, 'type_parameters');
    if (!typeParamsNode) return [];

    const params: string[] = [];
    for (const child of typeParamsNode.namedChildren) {
      if (child.type === 'type_parameter_declaration') {
        params.push(getTextTrimmed(child, source));
      }
    }
    return params;
  }

  // ─── Method extraction ───────────────────────────────────────────────────

  private extractMethod(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
    classMap: Map<string, ClassSymbol>,
  ): void {
    const fn = this.buildFunctionSymbol(node, source);
    if (!fn) return;

    // Extract receiver type
    const receiverNode = getFieldNode(node, 'receiver');
    if (receiverNode) {
      const receiverType = this.extractReceiverType(receiverNode, source);
      if (receiverType) {
        // Strip pointer prefix for matching
        const baseType = receiverType.replace(/^\*/, '');
        const target = classMap.get(baseType);
        if (target) {
          target.methods.push(fn);
          return;
        }
      }
    }

    // If no struct found, record as top-level function
    result.functions.push(fn);
  }

  private extractReceiverType(
    node: SyntaxNode,
    source: string,
  ): string | null {
    // receiver is a parameter_list with a single parameter_declaration
    for (const child of node.namedChildren) {
      if (child.type === 'parameter_declaration') {
        const typeNode = getFieldNode(child, 'type');
        if (typeNode) {
          return getTextTrimmed(typeNode, source);
        }
      }
    }
    return null;
  }

  // ─── Type declaration extraction (struct, interface) ─────────────────────

  private extractTypeDeclaration(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
    classMap: Map<string, ClassSymbol>,
  ): void {
    // type_declaration may contain multiple type_spec children
    for (const child of node.namedChildren) {
      if (child.type === 'type_spec') {
        this.extractTypeSpec(child, node, source, result, classMap);
      }
    }
  }

  private extractTypeSpec(
    node: SyntaxNode,
    parentDecl: SyntaxNode,
    source: string,
    result: ExtractorResult,
    classMap: Map<string, ClassSymbol>,
  ): void {
    const nameNode = getFieldNode(node, 'name');
    const typeNode = getFieldNode(node, 'type');
    if (!nameNode || !typeNode) return;

    const name = getText(nameNode, source);
    const visibility: 'public' | 'private' | 'protected' = isExported(name) ? 'public' : 'private';
    const typeParameters = this.extractTypeParameters(node, source);
    // Doc comments may be above the type_declaration parent, not the type_spec
    const docstring = this.extractGoDocComment(parentDecl, source) || this.extractGoDocComment(node, source);

    if (typeNode.type === 'struct_type') {
      this.extractStruct(node, typeNode, name, visibility, typeParameters, docstring, source, result, classMap);
    } else if (typeNode.type === 'interface_type') {
      this.extractInterface(node, typeNode, name, visibility, typeParameters, docstring, source, result, classMap);
    } else {
      // Type alias — record as ExportInfo
      if (visibility === 'public') {
        result.exports.push({
          name,
          kind: 'type',
          isReExport: false,
          isTypeOnly: true,
          line: node.startPosition.row + 1,
        });
      }
    }
  }

  private extractStruct(
    specNode: SyntaxNode,
    structTypeNode: SyntaxNode,
    name: string,
    visibility: 'public' | 'private' | 'protected',
    typeParameters: string[],
    docstring: string | undefined,
    source: string,
    result: ExtractorResult,
    classMap: Map<string, ClassSymbol>,
  ): void {
    const fields: Field[] = [];
    const extendsArr: string[] = [];

    const fieldListNode = findChildByType(structTypeNode, 'field_declaration_list');
    if (fieldListNode) {
      for (const child of fieldListNode.namedChildren) {
        if (child.type === 'field_declaration') {
          const fieldNames: string[] = [];
          const fieldTypeNode = getFieldNode(child, 'type');
          const fieldType = fieldTypeNode ? getTextTrimmed(fieldTypeNode, source) : undefined;

          // Collect field names
          for (const fc of child.namedChildren) {
            if (fc.type === 'field_identifier') {
              fieldNames.push(getText(fc, source));
            }
          }

          if (fieldNames.length > 0) {
            // Named fields
            for (const fn of fieldNames) {
              const fieldVis: 'public' | 'private' | 'protected' = isExported(fn) ? 'public' : 'private';
              fields.push({
                name: fn,
                type: fieldType,
                visibility: fieldVis,
                isStatic: false,
                isReadonly: false,
              });
            }
          } else if (fieldType) {
            // Embedded field (no name, just type) — acts like inheritance/mixin
            extendsArr.push(fieldType.replace(/^\*/, ''));
          }

          // Capture struct tag if present
          const tagNode = findChildByType(child, 'raw_string_literal');
          if (tagNode && fieldNames.length > 0) {
            // Append tag info to the last field's type
            const tag = getTextTrimmed(tagNode, source);
            const lastField = fields[fields.length - 1];
            if (lastField) {
              lastField.type = lastField.type ? `${lastField.type} ${tag}` : tag;
            }
          }
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
      fields,
      methods: [], // Methods attached in second pass
      decorators: [],
      docstring,
      visibility,
      line: specNode.startPosition.row + 1,
      endLine: specNode.endPosition.row + 1,
    };

    result.classes.push(classSymbol);
    classMap.set(name, classSymbol);
  }

  private extractInterface(
    specNode: SyntaxNode,
    interfaceTypeNode: SyntaxNode,
    name: string,
    visibility: 'public' | 'private' | 'protected',
    typeParameters: string[],
    docstring: string | undefined,
    source: string,
    result: ExtractorResult,
    classMap: Map<string, ClassSymbol>,
  ): void {
    const methods: FunctionSymbol[] = [];
    const extendsArr: string[] = [];

    for (const child of interfaceTypeNode.namedChildren) {
      if (child.type === 'method_spec') {
        const methodName = getFieldNode(child, 'name');
        if (methodName) {
          const params = this.extractParameters(child, source);
          const returnType = this.extractReturnType(child, source);

          methods.push({
            kind: 'function',
            name: getText(methodName, source),
            parameters: params,
            returnType,
            typeParameters: [],
            isAsync: false,
            isGenerator: false,
            visibility: 'public',
            decorators: [],
            docstring: this.extractGoDocComment(child, source),
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
          });
        }
      } else if (child.type === 'type_identifier' || child.type === 'qualified_type') {
        // Embedded interface
        extendsArr.push(getTextTrimmed(child, source));
      } else if (child.type === 'struct_elem') {
        // Also possible embedded constraint
        extendsArr.push(getTextTrimmed(child, source));
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
      decorators: [],
      docstring,
      visibility,
      line: specNode.startPosition.row + 1,
      endLine: specNode.endPosition.row + 1,
    };

    result.classes.push(classSymbol);
    classMap.set(name, classSymbol);
  }

  // ─── Import extraction ───────────────────────────────────────────────────

  private extractImportDeclaration(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    // import_declaration contains import_spec or import_spec_list
    for (const child of node.namedChildren) {
      if (child.type === 'import_spec') {
        this.extractImportSpec(child, source, result, node.startPosition.row + 1);
      } else if (child.type === 'import_spec_list') {
        for (const spec of child.namedChildren) {
          if (spec.type === 'import_spec') {
            this.extractImportSpec(spec, source, result, spec.startPosition.row + 1);
          }
        }
      }
    }
  }

  private extractImportSpec(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
    line: number,
  ): void {
    const pathNode = getFieldNode(node, 'path');
    const nameNode = getFieldNode(node, 'name');

    if (!pathNode) return;

    // Strip quotes from path
    const rawPath = getText(pathNode, source);
    const path = rawPath.replace(/^["']|["']$/g, '');

    // Determine alias
    let alias: string | undefined;
    let isBlankImport = false;
    let isDotImport = false;

    if (nameNode) {
      const nameText = getText(nameNode, source);
      if (nameText === '_') {
        isBlankImport = true;
      } else if (nameText === '.') {
        isDotImport = true;
      } else {
        alias = nameText;
      }
    }

    // Extract the package name from the path (last segment)
    const segments = path.split('/');
    const pkgName = segments[segments.length - 1]!;

    result.imports.push({
      source: path,
      specifiers: [{
        name: isDotImport ? '.' : (isBlankImport ? '_' : pkgName),
        alias,
        isDefault: false,
        isNamespace: isDotImport,
      }],
      isTypeOnly: false,
      line,
    });
  }

  // ─── Const/var extraction ────────────────────────────────────────────────

  private extractConstDeclaration(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    for (const child of node.namedChildren) {
      if (child.type === 'const_spec') {
        this.extractConstSpec(child, source, result);
      }
    }
  }

  private extractConstSpec(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    const names: string[] = [];
    const typeNode = getFieldNode(node, 'type');

    for (const child of node.namedChildren) {
      if (child.type === 'identifier') {
        names.push(getText(child, source));
      }
    }

    // Check for iota or values
    const valueChildren = findChildrenByType(node, 'expression_list');
    let hasIota = false;
    if (valueChildren.length > 0) {
      const valText = getTextTrimmed(valueChildren[0]!, source);
      hasIota = valText.includes('iota');
    }

    const docstring = this.extractGoDocComment(node, source);

    for (const name of names) {
      if (!isExported(name)) continue;

      const constant: ConstantSymbol = {
        kind: 'constant',
        name,
        type: typeNode ? getTextTrimmed(typeNode, source) : undefined,
        value: hasIota ? 'iota' : undefined,
        isExported: true,
        docstring,
        line: node.startPosition.row + 1,
      };
      result.constants.push(constant);
    }
  }

  private extractVarDeclaration(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    for (const child of node.namedChildren) {
      if (child.type === 'var_spec') {
        this.extractVarSpec(child, source, result);
      }
    }
  }

  private extractVarSpec(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    const names: string[] = [];
    const typeNode = getFieldNode(node, 'type');

    for (const child of node.namedChildren) {
      if (child.type === 'identifier') {
        names.push(getText(child, source));
      }
    }

    const docstring = this.extractGoDocComment(node, source);

    for (const name of names) {
      if (!isExported(name)) continue;

      const constant: ConstantSymbol = {
        kind: 'constant',
        name,
        type: typeNode ? getTextTrimmed(typeNode, source) : undefined,
        isExported: true,
        docstring,
        line: node.startPosition.row + 1,
      };
      result.constants.push(constant);
    }
  }

  // ─── Go doc comment extraction ───────────────────────────────────────────

  private extractGoDocComment(
    node: SyntaxNode,
    source: string,
  ): string | undefined {
    // Go doc comments are regular // comments immediately above a declaration
    const comments: string[] = [];
    let sibling = node.previousNamedSibling;

    while (sibling) {
      if (sibling.type === 'comment') {
        const text = getText(sibling, source);
        // Check adjacency: no blank lines between comment and declaration
        const nextSibling = sibling.nextNamedSibling;
        if (nextSibling) {
          const gap = nextSibling.startPosition.row - sibling.endPosition.row;
          if (gap > 1) break; // Blank line between -- not a doc comment
        }
        comments.unshift(text);
        sibling = sibling.previousNamedSibling;
        continue;
      }
      break;
    }

    if (comments.length === 0) {
      return getDocstringAbove(node, source);
    }

    // Clean up // prefixes
    const cleaned = comments.map((c) => {
      if (c.startsWith('//')) {
        const line = c.slice(2);
        return line.startsWith(' ') ? line.slice(1) : line;
      }
      // Block comment
      if (c.startsWith('/*')) {
        let inner = c.slice(2);
        if (inner.endsWith('*/')) inner = inner.slice(0, -2);
        return inner.trim();
      }
      return c;
    });

    return cleaned.join('\n').trim() || undefined;
  }

  // ─── Export collection ───────────────────────────────────────────────────

  private collectExports(result: ExtractorResult): void {
    // In Go, all top-level declarations with uppercase first letter are exported
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

// ─── Go-specific helpers ───────────────────────────────────────────────────

/**
 * Go visibility convention: names starting with uppercase letter are exported.
 */
function isExported(name: string): boolean {
  return /^[A-Z]/.test(name);
}
