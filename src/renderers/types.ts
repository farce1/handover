import type { RoundExecutionResult } from '../ai-rounds/types.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { HandoverConfig } from '../config/schema.js';
import type {
  Round1Output,
  Round2Output,
  Round3Output,
  Round4Output,
  Round5Output,
  Round6Output,
} from '../ai-rounds/schemas.js';

// ─── RenderContext ──────────────────────────────────────────────────────────

/**
 * Unified data bag passed to every document renderer.
 * Contains all available AI round results, static analysis, and config.
 * Renderers pick the data they need; unused fields are simply ignored.
 */
export interface RenderContext {
  rounds: {
    r1?: RoundExecutionResult<Round1Output>;
    r2?: RoundExecutionResult<Round2Output>;
    r3?: RoundExecutionResult<Round3Output>;
    r4?: RoundExecutionResult<Round4Output>;
    r5?: RoundExecutionResult<Round5Output>;
    r6?: RoundExecutionResult<Round6Output>;
  };
  staticAnalysis: StaticAnalysisResult;
  config: HandoverConfig;
  audience: 'human' | 'ai';
  generatedAt: string;
  projectName: string;
}

// ─── DocumentSpec ───────────────────────────────────────────────────────────

/**
 * Registry entry for a single handover document.
 * Maps document metadata, short aliases for --only, required AI rounds,
 * and the render function that produces markdown content.
 */
export interface DocumentSpec {
  id: string;
  filename: string;
  title: string;
  category: string;
  aliases: string[];
  requiredRounds: number[];
  render: (ctx: RenderContext) => string;
}

// ─── DocumentStatus ─────────────────────────────────────────────────────────

/**
 * Tracks the generation status of each document for the INDEX.
 */
export interface DocumentStatus {
  id: string;
  filename: string;
  title: string;
  status: 'complete' | 'partial' | 'static-only' | 'not-generated';
  reason?: string;
}

// ─── FrontMatterFields ──────────────────────────────────────────────────────

/**
 * Fields included in every document's YAML front-matter block.
 */
export interface FrontMatterFields {
  title: string;
  document_id: string;
  category: string;
  project: string;
  generated_at: string;
  handover_version: string;
  audience: 'human' | 'ai';
  ai_rounds_used: number[];
  status: 'complete' | 'partial' | 'static-only';
}
