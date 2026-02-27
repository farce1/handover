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
  /** Live token count from streaming callback (undefined when not streaming). */
  streamingTokens?: number;
  /** Timestamp when round began executing, for live elapsed time computation. */
  roundStartMs?: number;
  /** Cache read tokens from Anthropic prompt caching (undefined for non-Anthropic). */
  cacheReadTokens?: number;
  /** Cache creation tokens from Anthropic prompt caching (undefined for non-Anthropic). */
  cacheCreationTokens?: number;
  /** Dollar savings from caching for this round. */
  cacheSavingsDollars?: number;
  /** Token savings from caching for this round. */
  cacheSavingsTokens?: number;
  /** Percentage of tokens saved from caching for this round. */
  cacheSavingsPercent?: number;
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
  /** File coverage breakdown from context packing, shown before AI rounds. */
  fileCoverage?: { analyzing: number; ignored: number; total: number };
  /** Whether streaming token output indicator is visible (opt-in via --stream flag). */
  streamVisible?: boolean;
  /** Auth method in use for this run. */
  authMethod?: 'api-key' | 'subscription';
  /** Whether this run uses subscription auth (suppresses dollar cost rendering). */
  isSubscription?: boolean;
  /** Whether this is an incremental run (some files changed, some unchanged). */
  isIncremental?: boolean;
  /** Number of files that changed since last run (only set on incremental runs). */
  changedFileCount?: number;
  /** Number of files skipped as unchanged (only set on incremental runs). */
  unchangedFileCount?: number;
  /** Milliseconds saved by parallel execution of rounds 5 and 6. */
  parallelSavedMs?: number;
  /** Milliseconds taken by parallel document rendering. */
  renderTimingMs?: number;
  /** Estimated sequential render time for savings comparison. */
  renderSequentialEstimateMs?: number;
  /** Per-round token and cost data for the completion summary. Populated after all rounds complete. */
  roundSummaries?: Array<{
    round: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    savings?: { tokens: number; percent: number; dollars: number };
  }>;
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
  onFileCoverage(state: DisplayState): void;
  onRoundUpdate(state: DisplayState): void;
  onRoundsDone(state: DisplayState): void;
  onDocRendered(state: DisplayState): void;
  onComplete(state: DisplayState): void;
  onError(state: DisplayState): void;
  destroy(): void;
  onRenderStart?(state: DisplayState): void;
  onRenderDone?(state: DisplayState): void;
}
