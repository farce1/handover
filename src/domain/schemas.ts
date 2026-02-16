import { z } from 'zod';

// ─── Source-level entities ───────────────────────────────────────────────────

export const ImportSchema = z.object({
  source: z.string(),
  specifiers: z.array(z.string()),
});

export const SourceFileSchema = z.object({
  path: z.string(),
  language: z.enum(['typescript', 'javascript', 'python', 'rust', 'go', 'generic']),
  exports: z.array(z.string()).default([]),
  imports: z.array(ImportSchema).default([]),
  lineCount: z.number().int().positive(),
  complexity: z.number().int().min(0).default(0),
  purpose: z.string().optional(),
});

// ─── Issue-tracking entities ─────────────────────────────────────────────────

export const EdgeCaseSchema = z.object({
  description: z.string(),
  module: z.string(),
  severity: z.enum(['critical', 'warning', 'info']),
  file: z.string(),
  line: z.number().int().positive().optional(),
  context: z.string(),
});

export const TechDebtSchema = z.object({
  type: z.enum(['todo', 'fixme', 'hack', 'deprecated', 'xxx']),
  message: z.string(),
  file: z.string(),
  line: z.number().int().positive(),
  severity: z.enum(['high', 'medium', 'low']),
  module: z.string().optional(),
});

// ─── Module-level entities ───────────────────────────────────────────────────

export const ModuleSchema = z.object({
  name: z.string(),
  path: z.string(),
  purpose: z.string(),
  files: z.array(SourceFileSchema).default([]),
  edgeCases: z.array(EdgeCaseSchema).default([]),
  techDebt: z.array(TechDebtSchema).default([]),
  publicAPI: z.array(z.string()).default([]),
});

// ─── Cross-cutting entities ──────────────────────────────────────────────────

export const EntryPointSchema = z.object({
  path: z.string(),
  type: z.enum(['route', 'handler', 'component', 'command']),
});

export const FeatureSchema = z.object({
  name: z.string(),
  description: z.string(),
  entryPoints: z.array(EntryPointSchema).default([]),
  modules: z.array(z.string()).default([]),
  crossCutting: z.boolean().default(false),
});

export const EvidenceSchema = z.object({
  file: z.string(),
  pattern: z.string(),
});

export const TradeoffsSchema = z.object({
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});

export const ArchPatternSchema = z.object({
  name: z.string(),
  type: z.enum([
    'mvc',
    'event-driven',
    'cqrs',
    'layered',
    'microservice',
    'monolith',
    'other',
  ]),
  description: z.string(),
  tradeoffs: TradeoffsSchema,
  evidence: z.array(EvidenceSchema).default([]),
});

// ─── Dependency and configuration entities ───────────────────────────────────

export const DependencySchema = z.object({
  name: z.string(),
  version: z.string(),
  type: z.enum(['production', 'development', 'peer', 'optional']),
  purpose: z.string(),
  alternatives: z.array(z.string()).optional(),
  criticality: z.enum(['critical', 'important', 'convenience']),
});

export const EnvConfigSchema = z.object({
  name: z.string(),
  required: z.boolean(),
  secret: z.boolean(),
  defaultValue: z.string().optional(),
  description: z.string(),
  usedBy: z.array(z.string()).default([]),
});

export const ConventionExampleSchema = z.object({
  good: z.string(),
  bad: z.string(),
});

export const ConventionSchema = z.object({
  name: z.string(),
  category: z.enum(['naming', 'structure', 'patterns', 'testing', 'documentation']),
  description: z.string(),
  examples: z.array(ConventionExampleSchema).default([]),
  source: z.enum(['detected', 'inferred', 'documented']),
});

// ─── Top-level project entity ────────────────────────────────────────────────

export const ProjectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  language: z.string(),
  framework: z.string().optional(),
  modules: z.array(ModuleSchema).default([]),
  features: z.array(FeatureSchema).default([]),
  patterns: z.array(ArchPatternSchema).default([]),
  dependencies: z.array(DependencySchema).default([]),
  envConfig: z.array(EnvConfigSchema).default([]),
  conventions: z.array(ConventionSchema).default([]),
});

// ─── Pipeline types (used by downstream phases) ─────────────────────────────

export const CompletionRequestSchema = z.object({
  systemPrompt: z.string(),
  userPrompt: z.string(),
  responseSchema: z.any(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});

export const UsageSchema = z.object({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
});

export const CompletionResultSchema = z.object({
  data: z.any(),
  usage: UsageSchema,
  model: z.string(),
  duration: z.number().min(0),
});

// ─── Orchestrator types ──────────────────────────────────────────────────────

export const StepStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);

export const StepResultSchema = z.object({
  stepId: z.string(),
  status: StepStatusSchema,
  duration: z.number().min(0),
  error: z.any().optional(),
  data: z.any().optional(),
});
