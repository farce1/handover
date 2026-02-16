import type { z } from 'zod';
import type {
  ImportSchema,
  SourceFileSchema,
  EdgeCaseSchema,
  TechDebtSchema,
  ModuleSchema,
  EntryPointSchema,
  FeatureSchema,
  EvidenceSchema,
  TradeoffsSchema,
  ArchPatternSchema,
  DependencySchema,
  EnvConfigSchema,
  ConventionExampleSchema,
  ConventionSchema,
  ProjectSchema,
  CompletionRequestSchema,
  UsageSchema,
  CompletionResultSchema,
  StepStatusSchema,
  StepResultSchema,
} from './schemas.js';

// ─── Domain entity types (derived from Zod schemas) ─────────────────────────
// ALL types are derived via z.infer — never manually written.

export type Import = z.infer<typeof ImportSchema>;
export type SourceFile = z.infer<typeof SourceFileSchema>;
export type EdgeCase = z.infer<typeof EdgeCaseSchema>;
export type TechDebt = z.infer<typeof TechDebtSchema>;
export type Module = z.infer<typeof ModuleSchema>;
export type EntryPoint = z.infer<typeof EntryPointSchema>;
export type Feature = z.infer<typeof FeatureSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Tradeoffs = z.infer<typeof TradeoffsSchema>;
export type ArchPattern = z.infer<typeof ArchPatternSchema>;
export type Dependency = z.infer<typeof DependencySchema>;
export type EnvConfig = z.infer<typeof EnvConfigSchema>;
export type ConventionExample = z.infer<typeof ConventionExampleSchema>;
export type Convention = z.infer<typeof ConventionSchema>;
export type Project = z.infer<typeof ProjectSchema>;

// ─── Pipeline types ─────────────────────────────────────────────────────────

export type CompletionRequest = z.infer<typeof CompletionRequestSchema>;
export type Usage = z.infer<typeof UsageSchema>;
export type CompletionResult = z.infer<typeof CompletionResultSchema>;

// ─── Orchestrator types ─────────────────────────────────────────────────────

export type StepStatus = z.infer<typeof StepStatusSchema>;
export type StepResult = z.infer<typeof StepResultSchema>;

// Step definition uses a function type that Zod can't fully express,
// so we define it as a TypeScript interface that extends the schema shape.
export interface StepDefinition {
  id: string;
  name: string;
  deps: string[];
  execute: (context: StepContext) => Promise<unknown>;
  onSkip?: () => void;
}

export interface StepContext {
  results: Map<string, StepResult>;
  config: unknown;
}

export interface DAGEvents {
  onStepStart?: (stepId: string, name: string) => void;
  onStepComplete?: (result: StepResult) => void;
  onStepFail?: (result: StepResult) => void;
}
