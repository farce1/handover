import { z } from 'zod';

// ─── ScoreBreakdown ─────────────────────────────────────────────────────────

export const ScoreBreakdownSchema = z.object({
  entryPoint: z.number(),
  importCount: z.number(),
  exportCount: z.number(),
  gitActivity: z.number(),
  edgeCases: z.number(),
  configFile: z.number(),
});

export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

// ─── FilePriority ───────────────────────────────────────────────────────────

export const FilePrioritySchema = z.object({
  path: z.string(),
  score: z.number().min(0).max(100),
  breakdown: ScoreBreakdownSchema,
});

export type FilePriority = z.infer<typeof FilePrioritySchema>;

// ─── ContentTier ────────────────────────────────────────────────────────────

export const ContentTierSchema = z.enum(['full', 'signatures', 'skip']);

export type ContentTier = z.infer<typeof ContentTierSchema>;

// ─── TokenBudget ────────────────────────────────────────────────────────────

export const TokenBudgetSchema = z.object({
  total: z.number(),
  promptOverhead: z.number(),
  outputReserve: z.number(),
  fileContentBudget: z.number(),
});

export type TokenBudget = z.infer<typeof TokenBudgetSchema>;

// ─── PackedFile ─────────────────────────────────────────────────────────────

export const PackedFileSchema = z.object({
  path: z.string(),
  tier: ContentTierSchema,
  content: z.string(),
  tokens: z.number(),
  score: z.number(),
});

export type PackedFile = z.infer<typeof PackedFileSchema>;

// ─── PackedContext ──────────────────────────────────────────────────────────

export const PackedContextSchema = z.object({
  files: z.array(PackedFileSchema),
  budget: TokenBudgetSchema,
  metadata: z.object({
    totalFiles: z.number(),
    fullFiles: z.number(),
    signatureFiles: z.number(),
    skippedFiles: z.number(),
    usedTokens: z.number(),
    budgetTokens: z.number(),
    utilizationPercent: z.number(),
  }),
});

export type PackedContext = z.infer<typeof PackedContextSchema>;

// ─── RoundContext ───────────────────────────────────────────────────────────

export const RoundContextSchema = z.object({
  roundNumber: z.number(),
  findings: z.array(z.string()),
  modules: z.array(z.string()),
  relationships: z.array(z.string()),
  openQuestions: z.array(z.string()),
  tokenCount: z.number(),
});

export type RoundContext = z.infer<typeof RoundContextSchema>;

// ─── TokenUsage ─────────────────────────────────────────────────────────────

export const TokenUsageSchema = z.object({
  round: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  contextTokens: z.number(),
  fileContentTokens: z.number(),
  budgetTokens: z.number(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;
