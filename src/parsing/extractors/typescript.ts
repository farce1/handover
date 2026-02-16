import type { Tree, Node as SyntaxNode } from 'web-tree-sitter';

import { LanguageExtractor, type ExtractorResult } from './base.js';
import { findChildByType, findChildrenByType, getFieldNode, hasChildOfType, getNamedChildren } from '../utils/node-helpers.js';
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

// ─── TypeScript / JavaScript / TSX / JSX extractor ──────────────────────────

/**
 * Extracts symbols from TypeScript, JavaScript, TSX, and JSX files
 * using tree-sitter AST walking.
 *
 * Handles: function declarations, arrow functions, class declarations,
 * interface declarations, import/export statements, type aliases,
 * enums, constants, decorators, generics, JSDoc, and JSX components.
 */
export class TypeScriptExtractor extends LanguageExtractor {
  readonly parserType = 'tree-sitter' as const;

  extract(tree: Tree, source: string): ExtractorResult {
    const result = this.emptyResult();
    this.walkProgram(tree.rootNode, source, result);
    return result;
  }

  extractFromSource(_source: string): ExtractorResult {
    // Tree-sitter extractor does not support regex fallback
    return this.emptyResult();
  }

  // ─── Top-level AST walking ───────────────────────────────────────────────

  private walkProgram(
    root: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    for (const child of getNamedChildren(root)) {
      switch (child.type) {
        case 'function_declaration':
        case 'generator_function_declaration': {
          const fn = this.extractFunction(child, source);
          if (fn) result.functions.push(fn);
          break;
        }

        case 'lexical_declaration':
        case 'variable_declaration': {
          this.handleLexicalDeclaration(child, source, result, false);
          break;
        }

        case 'class_declaration': {
          const cls = this.extractClass(child, source);
          if (cls) result.classes.push(cls);
          break;
        }

        case 'abstract_class_declaration': {
          const cls = this.extractClass(child, source);
          if (cls) result.classes.push(cls);
          break;
        }

        case 'interface_declaration': {
          const iface = this.extractInterface(child, source);
          if (iface) result.classes.push(iface);
          break;
        }

        case 'import_statement': {
          const imp = this.extractImport(child, source);
          if (imp) result.imports.push(imp);
          break;
        }

        case 'export_statement': {
          this.handleExportStatement(child, source, result);
          break;
        }

        case 'enum_declaration': {
          this.handleEnumDeclaration(child, source, result, false);
          break;
        }

        case 'type_alias_declaration': {
          this.handleTypeAlias(child, source, result, false);
          break;
        }

        // Skip non-symbol nodes
        case 'expression_statement':
        case 'comment':
        case 'empty_statement':
          break;

        default:
          // Other top-level statements are not extracted
          break;
      }
    }
  }

  // ─── Function extraction ─────────────────────────────────────────────────

  private extractFunction(
    node: SyntaxNode,
    source: string,
    contextVisibility?: 'public' | 'private' | 'protected',
  ): FunctionSymbol | null {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return null;

    const name = getText(nameNode, source);
    const paramsNode = getFieldNode(node, 'parameters');
    const returnTypeNode = getFieldNode(node, 'return_type');
    const typeParamsNode = getFieldNode(node, 'type_parameters');

    // Check for async keyword
    const isAsync = this.hasKeywordChild(node, 'async');

    // Generator detection
    const isGenerator =
      node.type === 'generator_function_declaration' ||
      node.type === 'generator_function';

    const docstring = this.getDocstring(node, source);
    const decorators = getDecoratorTexts(node, source);

    return {
      kind: 'function',
      name,
      parameters: paramsNode ? this.extractParameters(paramsNode, source) : [],
      returnType: returnTypeNode
        ? this.extractTypeAnnotation(returnTypeNode, source)
        : undefined,
      typeParameters: typeParamsNode
        ? this.extractTypeParameters(typeParamsNode, source)
        : [],
      isAsync,
      isGenerator,
      visibility: contextVisibility ?? 'public',
      decorators,
      docstring,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private extractArrowOrFunctionExpr(
    nameNode: SyntaxNode,
    valueNode: SyntaxNode,
    outerNode: SyntaxNode,
    source: string,
  ): FunctionSymbol | null {
    const name = getText(nameNode, source);

    // The value could be arrow_function or function_expression or generator_function
    const funcNode = valueNode;
    const paramsNode = getFieldNode(funcNode, 'parameters');
    const returnTypeNode = getFieldNode(funcNode, 'return_type');
    const typeParamsNode = getFieldNode(funcNode, 'type_parameters');

    const isAsync = this.hasKeywordChild(funcNode, 'async');
    const isGenerator =
      funcNode.type === 'generator_function' ||
      funcNode.type === 'generator_function_expression';

    const docstring = getDocstringAbove(outerNode, source);
    const decorators = getDecoratorTexts(outerNode, source);

    // Check for JSX return (component detection)
    const bodyNode = getFieldNode(funcNode, 'body');
    const hasJsx = bodyNode ? this.containsJsx(bodyNode) : false;
    const allDecorators = hasJsx
      ? [...decorators, '@component']
      : decorators;

    return {
      kind: 'function',
      name,
      parameters: paramsNode ? this.extractParameters(paramsNode, source) : [],
      returnType: returnTypeNode
        ? this.extractTypeAnnotation(returnTypeNode, source)
        : undefined,
      typeParameters: typeParamsNode
        ? this.extractTypeParameters(typeParamsNode, source)
        : [],
      isAsync,
      isGenerator,
      visibility: 'public',
      decorators: allDecorators,
      docstring,
      line: outerNode.startPosition.row + 1,
      endLine: outerNode.endPosition.row + 1,
    };
  }

  // ─── Parameter extraction ────────────────────────────────────────────────

  private extractParameters(
    paramsNode: SyntaxNode,
    source: string,
  ): Parameter[] {
    const params: Parameter[] = [];

    for (const child of getNamedChildren(paramsNode)) {
      switch (child.type) {
        case 'required_parameter':
        case 'optional_parameter': {
          const param = this.extractSingleParameter(child, source);
          if (param) params.push(param);
          break;
        }
        case 'rest_pattern': {
          // ...args pattern
          const nameNode = getNamedChildren(child)[0];
          if (nameNode) {
            params.push({
              name: getText(nameNode, source),
              isRest: true,
            });
          }
          break;
        }
        default:
          // Identifiers can appear in some contexts
          if (child.type === 'identifier') {
            params.push({ name: getText(child, source), isRest: false });
          }
          break;
      }
    }

    return params;
  }

  private extractSingleParameter(
    node: SyntaxNode,
    source: string,
  ): Parameter | null {
    // Look for pattern/name
    const patternNode = getFieldNode(node, 'pattern');
    const nameIdentifier = patternNode ?? findChildByType(node, 'identifier');

    let name: string;
    if (nameIdentifier) {
      name = getText(nameIdentifier, source);
    } else {
      // Could be a destructuring pattern
      const objPattern = findChildByType(node, 'object_pattern');
      const arrPattern = findChildByType(node, 'array_pattern');
      if (objPattern) {
        name = getText(objPattern, source);
      } else if (arrPattern) {
        name = getText(arrPattern, source);
      } else {
        return null;
      }
    }

    // Check for rest parameter
    const isRest =
      node.type === 'rest_pattern' ||
      (patternNode?.type === 'rest_pattern') ||
      this.hasChildType(node, 'rest_pattern');

    // Type annotation
    const typeAnnotation = getFieldNode(node, 'type');
    let type: string | undefined;
    if (typeAnnotation) {
      type = this.extractTypeAnnotation(typeAnnotation, source);
    }

    // Default value
    const valueNode = getFieldNode(node, 'value');
    const defaultValue = valueNode ? getTextTrimmed(valueNode, source) : undefined;

    return {
      name,
      type,
      defaultValue,
      isRest,
    };
  }

  // ─── Class extraction ────────────────────────────────────────────────────

  private extractClass(
    node: SyntaxNode,
    source: string,
  ): ClassSymbol | null {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return null;

    const name = getText(nameNode, source);
    const typeParamsNode = getFieldNode(node, 'type_parameters');
    const bodyNode = getFieldNode(node, 'body');

    // Inheritance: extends_clause and implements_clause are children of class_declaration
    const extendsArr: string[] = [];
    const implementsArr: string[] = [];

    // Look for heritage clauses
    const classHeritage = findChildByType(node, 'class_heritage');
    if (classHeritage) {
      const extendsClause = findChildByType(classHeritage, 'extends_clause');
      if (extendsClause) {
        // The extends value is the named child after the `extends` keyword
        for (const ch of getNamedChildren(extendsClause)) {
          if (ch.type !== 'type_arguments') {
            extendsArr.push(getTextTrimmed(ch, source));
          }
        }
      }
      const implementsClause = findChildByType(classHeritage, 'implements_clause');
      if (implementsClause) {
        for (const ch of getNamedChildren(implementsClause)) {
          implementsArr.push(getTextTrimmed(ch, source));
        }
      }
    } else {
      // Some grammars put extends_clause / implements_clause directly as children
      const extendsClause = findChildByType(node, 'extends_clause');
      if (extendsClause) {
        for (const ch of getNamedChildren(extendsClause)) {
          if (ch.type !== 'type_arguments') {
            extendsArr.push(getTextTrimmed(ch, source));
          }
        }
      }
      const implementsClause = findChildByType(node, 'implements_clause');
      if (implementsClause) {
        for (const ch of getNamedChildren(implementsClause)) {
          implementsArr.push(getTextTrimmed(ch, source));
        }
      }
    }

    // Extract methods and fields from body
    const methods: FunctionSymbol[] = [];
    const fields: Field[] = [];

    if (bodyNode) {
      this.extractClassMembers(bodyNode, source, methods, fields);
    }

    const docstring = this.getDocstring(node, source);
    const decorators = getDecoratorTexts(node, source);

    return {
      kind: 'class',
      name,
      typeParameters: typeParamsNode
        ? this.extractTypeParameters(typeParamsNode, source)
        : [],
      extends: extendsArr,
      implements: implementsArr,
      mixins: [],
      fields,
      methods,
      decorators,
      docstring,
      visibility: 'public',
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private extractClassMembers(
    bodyNode: SyntaxNode,
    source: string,
    methods: FunctionSymbol[],
    fields: Field[],
  ): void {
    for (const member of getNamedChildren(bodyNode)) {
      switch (member.type) {
        case 'method_definition': {
          const method = this.extractMethodDefinition(member, source);
          if (method) methods.push(method);
          break;
        }
        case 'public_field_definition':
        case 'property_definition': {
          const field = this.extractFieldDefinition(member, source);
          if (field) fields.push(field);
          break;
        }
        default:
          break;
      }
    }
  }

  private extractMethodDefinition(
    node: SyntaxNode,
    source: string,
  ): FunctionSymbol | null {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return null;

    const name = getText(nameNode, source);
    const paramsNode = getFieldNode(node, 'parameters');
    const returnTypeNode = getFieldNode(node, 'return_type');
    const typeParamsNode = getFieldNode(node, 'type_parameters');

    // Visibility
    const visibility = this.getAccessibilityModifier(node);

    // Static, async, abstract, get/set, override
    const isStatic = this.hasKeywordChild(node, 'static');
    const isAsync = this.hasKeywordChild(node, 'async');
    const isAbstract = this.hasKeywordChild(node, 'abstract');
    const isOverride = this.hasKeywordChild(node, 'override');
    const isGenerator = node.type === 'generator_function_declaration' ||
      this.hasChildType(node, 'generator_function');

    // Get/set accessor
    let methodName = name;
    const getToken = this.findKeywordChild(node, 'get');
    const setToken = this.findKeywordChild(node, 'set');
    if (getToken && getToken.startIndex < nameNode.startIndex) {
      methodName = `get ${name}`;
    } else if (setToken && setToken.startIndex < nameNode.startIndex) {
      methodName = `set ${name}`;
    }

    const decorators = this.getMethodDecorators(node, source);
    const docstring = getDocstringAbove(node, source);

    // Build decorator list with modifiers
    const fullDecorators = [...decorators];
    if (isStatic) fullDecorators.push('@static');
    if (isAbstract) fullDecorators.push('@abstract');
    if (isOverride) fullDecorators.push('@override');

    return {
      kind: 'function',
      name: methodName,
      parameters: paramsNode ? this.extractParameters(paramsNode, source) : [],
      returnType: returnTypeNode
        ? this.extractTypeAnnotation(returnTypeNode, source)
        : undefined,
      typeParameters: typeParamsNode
        ? this.extractTypeParameters(typeParamsNode, source)
        : [],
      isAsync,
      isGenerator,
      visibility,
      decorators: fullDecorators,
      docstring,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private extractFieldDefinition(
    node: SyntaxNode,
    source: string,
  ): Field | null {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) {
      // Some grammars use 'property_name' or first identifier
      const propName = findChildByType(node, 'property_identifier');
      if (!propName) return null;
      const typeAnnotation = getFieldNode(node, 'type');
      return {
        name: getText(propName, source),
        type: typeAnnotation ? this.extractTypeAnnotation(typeAnnotation, source) : undefined,
        visibility: this.getAccessibilityModifier(node),
        isStatic: this.hasKeywordChild(node, 'static'),
        isReadonly: this.hasKeywordChild(node, 'readonly'),
      };
    }

    const typeAnnotation = getFieldNode(node, 'type');

    return {
      name: getText(nameNode, source),
      type: typeAnnotation ? this.extractTypeAnnotation(typeAnnotation, source) : undefined,
      visibility: this.getAccessibilityModifier(node),
      isStatic: this.hasKeywordChild(node, 'static'),
      isReadonly: this.hasKeywordChild(node, 'readonly'),
    };
  }

  // ─── Interface extraction ────────────────────────────────────────────────

  private extractInterface(
    node: SyntaxNode,
    source: string,
  ): ClassSymbol | null {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return null;

    const name = getText(nameNode, source);
    const typeParamsNode = getFieldNode(node, 'type_parameters');
    const bodyNode = getFieldNode(node, 'body');

    // Extends for interfaces
    const extendsArr: string[] = [];
    const extendsClause = findChildByType(node, 'extends_type_clause');
    if (extendsClause) {
      for (const ch of getNamedChildren(extendsClause)) {
        extendsArr.push(getTextTrimmed(ch, source));
      }
    }

    // Extract method signatures and property signatures from interface body
    const methods: FunctionSymbol[] = [];
    const fields: Field[] = [];

    if (bodyNode) {
      for (const member of getNamedChildren(bodyNode)) {
        switch (member.type) {
          case 'method_signature': {
            const method = this.extractMethodSignature(member, source);
            if (method) methods.push(method);
            break;
          }
          case 'property_signature': {
            const field = this.extractPropertySignature(member, source);
            if (field) fields.push(field);
            break;
          }
          case 'call_signature': {
            // Index signature or call signature -- skip for now
            break;
          }
          default:
            break;
        }
      }
    }

    const docstring = this.getDocstring(node, source);

    return {
      kind: 'class',
      name,
      typeParameters: typeParamsNode
        ? this.extractTypeParameters(typeParamsNode, source)
        : [],
      extends: extendsArr,
      implements: [],
      mixins: [],
      fields,
      methods,
      decorators: [],
      docstring,
      visibility: 'public',
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private extractMethodSignature(
    node: SyntaxNode,
    source: string,
  ): FunctionSymbol | null {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return null;

    const paramsNode = getFieldNode(node, 'parameters');
    const returnTypeNode = getFieldNode(node, 'return_type');
    const typeParamsNode = getFieldNode(node, 'type_parameters');

    return {
      kind: 'function',
      name: getText(nameNode, source),
      parameters: paramsNode ? this.extractParameters(paramsNode, source) : [],
      returnType: returnTypeNode
        ? this.extractTypeAnnotation(returnTypeNode, source)
        : undefined,
      typeParameters: typeParamsNode
        ? this.extractTypeParameters(typeParamsNode, source)
        : [],
      isAsync: false,
      isGenerator: false,
      visibility: 'public',
      decorators: [],
      docstring: undefined,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  private extractPropertySignature(
    node: SyntaxNode,
    source: string,
  ): Field | null {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return null;

    const typeAnnotation = getFieldNode(node, 'type');

    return {
      name: getText(nameNode, source),
      type: typeAnnotation ? this.extractTypeAnnotation(typeAnnotation, source) : undefined,
      visibility: 'public',
      isStatic: false,
      isReadonly: this.hasKeywordChild(node, 'readonly'),
    };
  }

  // ─── Import extraction ───────────────────────────────────────────────────

  private extractImport(
    node: SyntaxNode,
    source: string,
  ): ImportInfo | null {
    // Find source string (module path)
    const sourceNode = getFieldNode(node, 'source')
      ?? findChildByType(node, 'string');
    if (!sourceNode) return null;

    const importSource = this.stripQuotes(getText(sourceNode, source));

    // Check for type-only import
    const isTypeOnly = this.hasKeywordChild(node, 'type');

    const specifiers: ImportSpecifier[] = [];

    // Find import_clause
    const importClause = findChildByType(node, 'import_clause');
    if (importClause) {
      this.extractImportSpecifiers(importClause, source, specifiers);
    }

    return {
      source: importSource,
      specifiers,
      isTypeOnly,
      line: node.startPosition.row + 1,
    };
  }

  private extractImportSpecifiers(
    clause: SyntaxNode,
    source: string,
    specifiers: ImportSpecifier[],
  ): void {
    for (const child of getNamedChildren(clause)) {
      switch (child.type) {
        case 'identifier': {
          // Default import: import Foo from './module'
          specifiers.push({
            name: getText(child, source),
            isDefault: true,
            isNamespace: false,
          });
          break;
        }
        case 'namespace_import': {
          // import * as X from './module'
          const nameNode = findChildByType(child, 'identifier');
          specifiers.push({
            name: nameNode ? getText(nameNode, source) : '*',
            isDefault: false,
            isNamespace: true,
          });
          break;
        }
        case 'named_imports': {
          // import { a, b as c } from './module'
          for (const spec of getNamedChildren(child)) {
            if (spec.type === 'import_specifier') {
              const nameNode = getFieldNode(spec, 'name');
              const aliasNode = getFieldNode(spec, 'alias');
              if (nameNode) {
                specifiers.push({
                  name: getText(nameNode, source),
                  alias: aliasNode ? getText(aliasNode, source) : undefined,
                  isDefault: false,
                  isNamespace: false,
                });
              }
            }
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // ─── Export extraction ───────────────────────────────────────────────────

  private handleExportStatement(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
  ): void {
    const line = node.startPosition.row + 1;

    // Check for type-only export
    const isTypeOnly = this.hasKeywordChild(node, 'type');

    // Check for re-export source: export { X } from './module'
    const sourceNode = getFieldNode(node, 'source')
      ?? findChildByType(node, 'string');
    const reExportSource = sourceNode
      ? this.stripQuotes(getText(sourceNode, source))
      : undefined;

    // Check for wildcard/barrel re-export: export * from './module'
    if (this.hasChildText(node, '*') && reExportSource) {
      const namespaceExport = findChildByType(node, 'namespace_export');
      const exportName = namespaceExport
        ? getText(findChildByType(namespaceExport, 'identifier') ?? namespaceExport, source)
        : '*';

      const reExport: ExportInfo = {
        name: exportName,
        kind: 'namespace',
        isReExport: true,
        source: reExportSource,
        isTypeOnly,
        line,
      };
      result.reExports.push(reExport);
      result.exports.push(reExport);
      return;
    }

    // Named export clause: export { a, b as c } or export { a } from './mod'
    const exportClause = findChildByType(node, 'export_clause');
    if (exportClause) {
      for (const spec of getNamedChildren(exportClause)) {
        if (spec.type === 'export_specifier') {
          const nameNode = getFieldNode(spec, 'name');
          const aliasNode = getFieldNode(spec, 'alias');
          const exportName = aliasNode
            ? getText(aliasNode, source)
            : (nameNode ? getText(nameNode, source) : '');

          const exportInfo: ExportInfo = {
            name: exportName,
            kind: reExportSource ? 're-export' : 'variable',
            isReExport: !!reExportSource,
            source: reExportSource,
            isTypeOnly,
            line,
          };

          if (reExportSource) {
            result.reExports.push(exportInfo);
          }
          result.exports.push(exportInfo);
        }
      }
      return;
    }

    // Default export: export default ...
    const valueNode = getFieldNode(node, 'value');
    if (valueNode || this.hasKeywordChild(node, 'default')) {
      // Check what is being exported
      const declNode = getFieldNode(node, 'declaration');
      if (declNode) {
        // export default class Foo / export default function foo
        this.handleExportedDeclaration(declNode, source, result, true, isTypeOnly);
      } else {
        result.exports.push({
          name: 'default',
          kind: 'default',
          isReExport: false,
          isTypeOnly,
          line,
        });
      }
      return;
    }

    // Direct export: export function, export class, export const, etc.
    const declaration = getFieldNode(node, 'declaration');
    if (declaration) {
      this.handleExportedDeclaration(declaration, source, result, false, isTypeOnly);
      return;
    }

    // Fallback: walk named children for declarations
    for (const child of getNamedChildren(node)) {
      if (this.isDeclarationNode(child)) {
        this.handleExportedDeclaration(child, source, result, false, isTypeOnly);
      }
    }
  }

  private handleExportedDeclaration(
    declNode: SyntaxNode,
    source: string,
    result: ExtractorResult,
    isDefault: boolean,
    isTypeOnly: boolean,
  ): void {
    const line = declNode.startPosition.row + 1;

    switch (declNode.type) {
      case 'function_declaration':
      case 'generator_function_declaration': {
        const fn = this.extractFunction(declNode, source);
        if (fn) {
          result.functions.push(fn);

          // Check for JSX in function body for component detection
          const bodyNode = getFieldNode(declNode, 'body');
          const hasJsx = bodyNode ? this.containsJsx(bodyNode) : false;
          if (hasJsx && !fn.decorators.includes('@component')) {
            fn.decorators.push('@component');
          }

          result.exports.push({
            name: isDefault ? 'default' : fn.name,
            kind: isDefault ? 'default' : 'function',
            isReExport: false,
            isTypeOnly,
            line,
          });
        }
        break;
      }

      case 'class_declaration':
      case 'abstract_class_declaration': {
        const cls = this.extractClass(declNode, source);
        if (cls) {
          result.classes.push(cls);
          result.exports.push({
            name: isDefault ? 'default' : cls.name,
            kind: isDefault ? 'default' : 'class',
            isReExport: false,
            isTypeOnly,
            line,
          });
        }
        break;
      }

      case 'interface_declaration': {
        const iface = this.extractInterface(declNode, source);
        if (iface) {
          result.classes.push(iface);
          result.exports.push({
            name: iface.name,
            kind: 'interface',
            isReExport: false,
            isTypeOnly: true,
            line,
          });
        }
        break;
      }

      case 'type_alias_declaration': {
        this.handleTypeAlias(declNode, source, result, true, isTypeOnly);
        break;
      }

      case 'enum_declaration': {
        this.handleEnumDeclaration(declNode, source, result, true);
        break;
      }

      case 'lexical_declaration':
      case 'variable_declaration': {
        this.handleLexicalDeclaration(declNode, source, result, true);
        break;
      }

      default:
        break;
    }
  }

  // ─── Lexical declaration (const, let, var) ───────────────────────────────

  private handleLexicalDeclaration(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
    isExported: boolean,
  ): void {
    // Only capture exported module-level const declarations
    // Check if this is a 'const' declaration
    const isConst = this.hasKeywordChild(node, 'const');

    for (const declarator of getNamedChildren(node)) {
      if (declarator.type !== 'variable_declarator') continue;

      const nameNode = getFieldNode(declarator, 'name');
      const valueNode = getFieldNode(declarator, 'value');
      const typeAnnotation = getFieldNode(declarator, 'type');

      if (!nameNode) continue;
      const name = getText(nameNode, source);

      // Check if the value is a function (arrow or expression)
      if (valueNode && this.isFunctionExpression(valueNode)) {
        const fn = this.extractArrowOrFunctionExpr(nameNode, valueNode, node, source);
        if (fn) {
          result.functions.push(fn);
          if (isExported) {
            result.exports.push({
              name: fn.name,
              kind: 'function',
              isReExport: false,
              isTypeOnly: false,
              line: node.startPosition.row + 1,
            });
          }
        }
        continue;
      }

      // Only exported constants are tracked (per locked decision)
      if (isExported && isConst) {
        const constant: ConstantSymbol = {
          kind: 'constant',
          name,
          type: typeAnnotation
            ? this.extractTypeAnnotation(typeAnnotation, source)
            : undefined,
          value: valueNode ? this.getShortValue(valueNode, source) : undefined,
          isExported: true,
          docstring: getDocstringAbove(node, source),
          line: node.startPosition.row + 1,
        };
        result.constants.push(constant);
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

  // ─── Enum declaration ────────────────────────────────────────────────────

  private handleEnumDeclaration(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
    isExported: boolean,
  ): void {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return;

    const name = getText(nameNode, source);
    const line = node.startPosition.row + 1;

    if (isExported) {
      result.exports.push({
        name,
        kind: 'enum',
        isReExport: false,
        isTypeOnly: false,
        line,
      });
    }
  }

  // ─── Type alias declaration ──────────────────────────────────────────────

  private handleTypeAlias(
    node: SyntaxNode,
    source: string,
    result: ExtractorResult,
    isExported: boolean,
    isTypeOnly?: boolean,
  ): void {
    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return;

    const name = getText(nameNode, source);
    const line = node.startPosition.row + 1;

    if (isExported) {
      result.exports.push({
        name,
        kind: 'type',
        isReExport: false,
        isTypeOnly: isTypeOnly ?? true,
        line,
      });
    }
  }

  // ─── Type parameter extraction ───────────────────────────────────────────

  private extractTypeParameters(
    node: SyntaxNode,
    source: string,
  ): string[] {
    const params: string[] = [];

    for (const child of getNamedChildren(node)) {
      if (child.type === 'type_parameter') {
        params.push(getTextTrimmed(child, source));
      }
    }

    return params;
  }

  // ─── Type annotation extraction ──────────────────────────────────────────

  private extractTypeAnnotation(
    node: SyntaxNode,
    source: string,
  ): string {
    // type_annotation nodes have ': Type' -- strip the colon prefix
    const text = getTextTrimmed(node, source);
    return text.replace(/^:\s*/, '');
  }

  // ─── JSX component detection ─────────────────────────────────────────────

  private containsJsx(node: SyntaxNode): boolean {
    if (
      node.type === 'jsx_element' ||
      node.type === 'jsx_self_closing_element' ||
      node.type === 'jsx_fragment'
    ) {
      return true;
    }

    for (const child of getNamedChildren(node)) {
      if (this.containsJsx(child)) return true;
    }

    return false;
  }

  // ─── Docstring helpers ────────────────────────────────────────────────────

  /**
   * Get the docstring for a node, checking both the node itself and its
   * parent export_statement for preceding JSDoc comments.
   */
  private getDocstring(node: SyntaxNode, source: string): string | undefined {
    // Check node directly first
    const direct = getDocstringAbove(node, source);
    if (direct) return direct;

    // If the node is inside an export_statement, check the export_statement's previous sibling
    const parent = node.parent;
    if (parent && parent.type === 'export_statement') {
      return getDocstringAbove(parent, source);
    }

    return undefined;
  }

  // ─── Helper methods ──────────────────────────────────────────────────────

  private hasKeywordChild(node: SyntaxNode, keyword: string): boolean {
    // Check all children (including unnamed) for keyword tokens
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && !child.isNamed && child.type === keyword) {
        return true;
      }
    }
    return false;
  }

  private findKeywordChild(node: SyntaxNode, keyword: string): SyntaxNode | null {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && !child.isNamed && child.type === keyword) {
        return child;
      }
    }
    return null;
  }

  private hasChildType(node: SyntaxNode, type: string): boolean {
    return hasChildOfType(node, type);
  }

  private hasChildText(node: SyntaxNode, text: string): boolean {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === text) {
        return true;
      }
    }
    return false;
  }

  private getAccessibilityModifier(
    node: SyntaxNode,
  ): 'public' | 'private' | 'protected' {
    const accessMod = findChildByType(node, 'accessibility_modifier');
    if (accessMod) {
      const text = accessMod.text;
      if (text === 'private') return 'private';
      if (text === 'protected') return 'protected';
    }
    // Check for # private field prefix
    const nameNode = getFieldNode(node, 'name');
    if (nameNode) {
      const nameText = nameNode.text;
      if (nameText.startsWith('#')) return 'private';
    }
    return 'public';
  }

  private getMethodDecorators(
    node: SyntaxNode,
    source: string,
  ): string[] {
    // Method decorators appear as preceding sibling decorator nodes
    const decorators: string[] = [];
    let sibling = node.previousNamedSibling;
    while (sibling && sibling.type === 'decorator') {
      decorators.push(getText(sibling, source));
      sibling = sibling.previousNamedSibling;
    }
    return decorators.reverse();
  }

  private isFunctionExpression(node: SyntaxNode): boolean {
    return (
      node.type === 'arrow_function' ||
      node.type === 'function_expression' ||
      node.type === 'function' ||
      node.type === 'generator_function' ||
      node.type === 'generator_function_expression'
    );
  }

  private isDeclarationNode(node: SyntaxNode): boolean {
    return (
      node.type === 'function_declaration' ||
      node.type === 'generator_function_declaration' ||
      node.type === 'class_declaration' ||
      node.type === 'abstract_class_declaration' ||
      node.type === 'interface_declaration' ||
      node.type === 'type_alias_declaration' ||
      node.type === 'enum_declaration' ||
      node.type === 'lexical_declaration' ||
      node.type === 'variable_declaration'
    );
  }

  private stripQuotes(str: string): string {
    if (
      (str.startsWith("'") && str.endsWith("'")) ||
      (str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith('`') && str.endsWith('`'))
    ) {
      return str.slice(1, -1);
    }
    return str;
  }

  private getShortValue(node: SyntaxNode, source: string): string | undefined {
    const text = getTextTrimmed(node, source);
    // Only return short values (no large objects/arrays)
    if (text.length > 100) return text.slice(0, 97) + '...';
    return text;
  }
}
