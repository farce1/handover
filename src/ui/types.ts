/**
 * Display state types and interfaces for the terminal UI rendering layer.
 *
 * These types define the data model that drives all display components
 * and renderers. The DisplayState is the single source of truth for
 * what the terminal shows at any given moment.
 */

/** Status of an individual static analyzer. */
export type AnalyzerStatus = 'pending' | 'running' | 'done' | 'failed';

/** Display state for a single AI round. */
export interface RoundDisplayState {
  roundNumber: number;
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cached';
  elapsedMs: number;
  tokens?: number;
  cost?: number;
  retrying?: boolean;
  retryDelayMs?: number;
  retryStartMs?: number;
  retryReason?: string;
  affectedDocs?: string[];
}

/** High-level phase of the pipeline display. */
export type DisplayPhase =
  | 'startup'
  | 'static-analysis'
  | 'ai-rounds'
  | 'rendering'
  | 'complete'
  | 'error';

/** Error details for display. */
export interface ErrorInfo {
  source: string;
  message: string;
  affectedDocs?: string[];
}

/** Complete display state driving the terminal UI. */
export interface DisplayState {
  phase: DisplayPhase;
  projectName: string;
  provider: string;
  model: string;
  fileCount: number;
  language: string;
  isLocal: boolean;
  analyzers: Map<string, AnalyzerStatus>;
  analyzerElapsedMs: number;
  rounds: Map<number, RoundDisplayState>;
  totalTokens: number;
  totalCost: number;
  costWarningThreshold: number;
  elapsedMs: number;
  renderedDocs: string[];
  completionDocs: number;
  errors: ErrorInfo[];
}

/**
 * Renderer interface for terminal output.
 *
 * Each method corresponds to a display event. Implementations
 * decide how to present the information (TTY vs CI).
 */
export interface Renderer {
  onBanner(state: DisplayState): void;
  onAnalyzerUpdate(state: DisplayState): void;
  onAnalyzersDone(state: DisplayState): void;
  onRoundUpdate(state: DisplayState): void;
  onRoundsDone(state: DisplayState): void;
  onDocRendered(state: DisplayState): void;
  onComplete(state: DisplayState): void;
  onError(state: DisplayState): void;
  destroy(): void;
}
