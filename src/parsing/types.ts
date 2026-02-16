import { z } from 'zod';

// ─── Parameter and field schemas ────────────────────────────────────────────

export const ParameterSchema = z.object({
  name: z.string(),
  type: z.string().optional(), // Full type text: "Map<string, User[]>"
  defaultValue: z.string().optional(),
  isRest: z.boolean().default(false), // ...args / *args / **kwargs
});

export const FieldSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  visibility: z.enum(['public', 'private', 'protected']).default('public'),
  isStatic: z.boolean().default(false),
  isReadonly: z.boolean().default(false),
});

// ─── Symbol schemas ─────────────────────────────────────────────────────────

export const FunctionSymbolSchema = z.object({
  kind: z.literal('function'),
  name: z.string(),
  parameters: z.array(ParameterSchema).default([]),
  returnType: z.string().optional(),
  typeParameters: z.array(z.string()).default([]), // ["T", "U extends Foo"]
  isAsync: z.boolean().default(false),
  isGenerator: z.boolean().default(false),
  visibility: z.enum(['public', 'private', 'protected']).default('public'),
  decorators: z.array(z.string()).default([]), // Full decorator text
  docstring: z.string().optional(),
  line: z.number().int().positive(),
  endLine: z.number().int().positive(),
});

export const ClassSymbolSchema = z.object({
  kind: z.literal('class'),
  name: z.string(),
  typeParameters: z.array(z.string()).default([]),
  extends: z.array(z.string()).default([]), // Inheritance chain
  implements: z.array(z.string()).default([]), // Interfaces / trait bounds
  mixins: z.array(z.string()).default([]),
  fields: z.array(FieldSchema).default([]),
  methods: z.array(FunctionSymbolSchema).default([]),
  decorators: z.array(z.string()).default([]),
  docstring: z.string().optional(),
  visibility: z.enum(['public', 'private', 'protected']).default('public'),
  line: z.number().int().positive(),
  endLine: z.number().int().positive(),
});

// ─── Import/export schemas ──────────────────────────────────────────────────

export const ImportSpecifierSchema = z.object({
  name: z.string(), // Imported name
  alias: z.string().optional(), // "as" alias
  isDefault: z.boolean().default(false),
  isNamespace: z.boolean().default(false), // import * as X
});

export const ImportInfoSchema = z.object({
  source: z.string(), // Module path
  specifiers: z.array(ImportSpecifierSchema).default([]),
  isTypeOnly: z.boolean().default(false), // import type { X }
  line: z.number().int().positive(),
});

export const ExportInfoSchema = z.object({
  name: z.string(),
  kind: z.enum([
    'function',
    'class',
    'variable',
    'type',
    'interface',
    'enum',
    're-export',
    'namespace',
    'default',
  ]),
  isReExport: z.boolean().default(false),
  source: z.string().optional(), // Re-export source
  isTypeOnly: z.boolean().default(false),
  line: z.number().int().positive(),
});

// ─── Constant schema ────────────────────────────────────────────────────────

export const ConstantSymbolSchema = z.object({
  kind: z.literal('constant'),
  name: z.string(),
  type: z.string().optional(),
  value: z.string().optional(), // Short representation
  isExported: z.boolean().default(false),
  docstring: z.string().optional(),
  line: z.number().int().positive(),
});

// ─── Parse error schema ─────────────────────────────────────────────────────

export const ParseErrorSchema = z.object({
  line: z.number().int(),
  message: z.string(),
});

// ─── Top-level parsed file schema ───────────────────────────────────────────

export const ParsedFileSchema = z.object({
  path: z.string(),
  language: z.string(),
  parserUsed: z.enum(['tree-sitter', 'regex']), // Provenance marker
  functions: z.array(FunctionSymbolSchema).default([]),
  classes: z.array(ClassSymbolSchema).default([]),
  imports: z.array(ImportInfoSchema).default([]),
  exports: z.array(ExportInfoSchema).default([]),
  constants: z.array(ConstantSymbolSchema).default([]),
  reExports: z.array(ExportInfoSchema).default([]),
  lineCount: z.number().int().positive(),
  parseErrors: z.array(ParseErrorSchema).default([]),
});

// ─── Derived TypeScript types ───────────────────────────────────────────────

export type Parameter = z.infer<typeof ParameterSchema>;
export type Field = z.infer<typeof FieldSchema>;
export type FunctionSymbol = z.infer<typeof FunctionSymbolSchema>;
export type ClassSymbol = z.infer<typeof ClassSymbolSchema>;
export type ImportSpecifier = z.infer<typeof ImportSpecifierSchema>;
export type ImportInfo = z.infer<typeof ImportInfoSchema>;
export type ExportInfo = z.infer<typeof ExportInfoSchema>;
export type ConstantSymbol = z.infer<typeof ConstantSymbolSchema>;
export type ParseError = z.infer<typeof ParseErrorSchema>;
export type ParsedFile = z.infer<typeof ParsedFileSchema>;
