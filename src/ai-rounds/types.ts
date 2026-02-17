import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext, RoundContext } from '../context/types.js';
import type { HandoverConfig } from '../config/schema.js';

// ─── Round names constant ───────────────────────────────────────────────────

export const ROUND_NAMES: Record<number, string> = {
  1: 'Project Overview',
  2: 'Module Detection',
  3: 'Feature Extraction',
  4: 'Architecture Detection',
  5: 'Edge Cases & Conventions',
  6: 'Deployment Inference',
};

// ─── RoundInput ─────────────────────────────────────────────────────────────

export interface RoundInput {
  roundNumber: number;
  staticAnalysis: StaticAnalysisResult;
  packedContext: PackedContext;
  priorRounds: RoundContext[];
  config: HandoverConfig;
  isRetry: boolean;
}

// ─── RoundExecutionResult<T> ────────────────────────────────────────────────

export interface RoundExecutionResult<T> {
  data: T;
  validation: ValidationResult;
  quality: QualityMetrics;
  context: RoundContext;
  status: 'success' | 'degraded' | 'retried';
  /** Total tokens (input + output) for this round. */
  tokens?: number;
  /** Estimated dollar cost for this round. */
  cost?: number;
}

// ─── ValidationResult ───────────────────────────────────────────────────────

export interface ValidationResult {
  validated: number;
  corrected: number;
  total: number;
  dropRate: number;
}

// ─── QualityMetrics ─────────────────────────────────────────────────────────

export interface QualityMetrics {
  textLength: number;
  codeReferences: number;
  specificity: number;
  isAcceptable: boolean;
}

// ─── RoundFallback ──────────────────────────────────────────────────────────

export interface RoundFallback {
  roundNumber: number;
  status: 'degraded' | 'failed';
  reason: string;
  staticFallback: Record<string, unknown>;
}

// ─── PipelineValidationSummary ──────────────────────────────────────────────

export interface PipelineValidationSummary {
  totalClaims: number;
  validatedClaims: number;
  correctedClaims: number;
  roundSummaries: Array<{
    round: number;
    name: string;
    status: 'success' | 'degraded' | 'retried' | 'skipped' | 'failed';
    validated: number;
    corrected: number;
    reason?: string;
  }>;
}
