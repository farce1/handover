/**
 * Source→Renderer dependency graph (Phase 32).
 *
 * Powers two behaviors on `handover generate`:
 *   1. `--since <ref>` becomes surgical — only renderers whose declared
 *      `requiredSources` matched a changed file re-run.
 *   2. `--dry-run` previews which renderers would execute, zero LLM calls.
 *
 * Persisted to `.handover/cache/dep-graph.json` with a `graphVersion`
 * integer; mismatched/corrupt graphs degrade to safe full regen.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { z } from 'zod';
import type { DocumentSpec } from '../renderers/types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Graph format version — bump manually when the on-disk JSON shape changes (D-07). */
export const GRAPH_VERSION = 1 as const;

/**
 * Curated infrastructure file patterns (D-12). Files matching any pattern
 * here are excluded from every renderer's effective dependency set
 * AND ignored at filter-lookup time. Each line justified inline.
 *
 * Important: do NOT add `src/orchestrator/`, `src/renderers/registry.ts`,
 * `src/analyzers/coordinator.ts` to this list — those ARE high fan-in but
 * encode WHAT the project does (D-12 final paragraph).
 */
export const INFRASTRUCTURE_PATHS: readonly string[] = [
  'src/utils/**',          // logger, errors, rate-limiter — pure infra, zero domain content
  'src/config/loader.ts',  // pure config plumbing
  'src/config/defaults.ts',// config defaults — values, not behavior
  'src/config/schema.ts',  // Zod schemas — type-shape only
  'src/domain/types.ts',   // domain type barrel — type-only
  'src/domain/entities.ts',// entity factories — type-shape construction
  '**/types.ts',           // type-only barrel files anywhere in the tree
] as const;

/**
 * Tighter ignore list than file-discovery.ts — renderer requiredSources globs
 * target `src/**` specifically, so non-src tree directories never matter.
 */
const BUILD_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.handover/**',
];

// ─── Schema + Types ─────────────────────────────────────────────────────────

export const DepGraphSchema = z.object({
  graphVersion: z.literal(GRAPH_VERSION),       // mismatch → safeParse fails → loadDepGraph returns null
  builtAt: z.string(),                           // ISO 8601; informational
  renderers: z.record(z.string(), z.array(z.string())),
  infrastructurePaths: z.array(z.string()),     // curated globs (audit trail)
  infrastructureFiles: z.array(z.string()),     // expanded file list for fast lookup
});

export type DepGraph = z.infer<typeof DepGraphSchema>;

export interface FilterDecision {
  /** Renderer IDs whose dependencies were touched. */
  affected: Set<string>;
  /** True when an unclaimed file forced a full regen (D-04). */
  fullRegen: boolean;
  /** For each affected renderer, which changed files triggered it (for --dry-run reasons). */
  reasons: Map<string, string[]>;
  /** Files in changedFiles that didn't match any renderer (and weren't infra). */
  unclaimed: string[];
}

export interface DryRunDecision {
  since: string | undefined;
  graphVersion: number | null;
  wouldExecute: Array<{ rendererId: string; filename: string; reasons: string[] }>;
  wouldSkip: Array<{ rendererId: string; filename: string }>;
  fellBackToFullRegen: boolean;
  noGraph: boolean;
}

// ─── buildDepGraph ──────────────────────────────────────────────────────────

/**
 * Materialize every non-INDEX renderer's `requiredSources` into a sorted
 * file list via fast-glob. Filters out infrastructure files at build time
 * (defense-in-depth: filter is also applied at lookup time).
 *
 * Invariants:
 * - The `00-index` registry entry is skipped (INDEX always renders; D-09).
 * - Returned paths are repo-relative forward-slash strings (matches git's form).
 * - `infrastructureFiles` is computed once by globbing INFRASTRUCTURE_PATHS.
 */
export async function buildDepGraph(
  registry: readonly DocumentSpec[],
  rootDir: string,
): Promise<DepGraph> {
  // Compute infrastructure file set ONCE so filtering and the JSON sidecar share it.
  const infraFiles = await fg([...INFRASTRUCTURE_PATHS], {
    cwd: rootDir,
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    ignore: BUILD_IGNORE,
  });
  const infraSet = new Set(infraFiles);

  const renderers: Record<string, string[]> = {};
  for (const spec of registry) {
    if (spec.id === '00-index') continue;       // INDEX has no source deps (D-09)
    const matches = await fg(spec.requiredSources, {
      cwd: rootDir,
      onlyFiles: true,
      dot: false,
      followSymbolicLinks: false,
      ignore: BUILD_IGNORE,
    });
    renderers[spec.id] = matches.filter((p) => !infraSet.has(p)).sort();
  }

  return {
    graphVersion: GRAPH_VERSION,
    builtAt: new Date().toISOString(),
    renderers,
    infrastructurePaths: [...INFRASTRUCTURE_PATHS],
    infrastructureFiles: infraFiles.slice().sort(),
  };
}

// ─── saveDepGraph / loadDepGraph ────────────────────────────────────────────

/**
 * Persist the graph to `.handover/cache/dep-graph.json` (pretty-printed).
 *
 * NOTE: NO `ensureGitignored()` call — Phase 31 D-10 already added
 * `.handover/cache` to .gitignore. Duplicating that work here would
 * violate D-22.
 */
export async function saveDepGraph(rootDir: string, graph: DepGraph): Promise<void> {
  const dir = join(rootDir, '.handover', 'cache');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'dep-graph.json'), JSON.stringify(graph, null, 2), 'utf-8');
}

/**
 * Read the graph. Never throws — returns `null` on:
 * - missing file
 * - graphVersion mismatch (via `z.literal(GRAPH_VERSION)` in DepGraphSchema)
 * - malformed JSON
 * - shape violation
 *
 * Callers interpret `null` as "fall back to full regen" (D-04, SC-5).
 */
export async function loadDepGraph(rootDir: string): Promise<DepGraph | null> {
  const filePath = join(rootDir, '.handover', 'cache', 'dep-graph.json');
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = DepGraphSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ─── filterRenderersByChangedFiles (pure) ───────────────────────────────────

/**
 * Pure lookup helper called at `--since`-time. No globbing, no I/O.
 *
 * Behavior:
 * - Infrastructure files are skipped (SC-4) — they don't count as unclaimed.
 * - Non-infra files unclaimed by every renderer set `fullRegen: true` (D-04).
 * - Affected renderers are recorded with their triggering files in `reasons`.
 */
export function filterRenderersByChangedFiles(
  changedFiles: ReadonlySet<string>,
  graph: DepGraph,
): FilterDecision {
  const affected = new Set<string>();
  const reasons = new Map<string, string[]>();
  const unclaimed: string[] = [];

  const infraSet = new Set(graph.infrastructureFiles);

  // Pre-build renderer → Set<file> for O(1) membership lookups.
  const rendererSets = new Map<string, Set<string>>();
  for (const [id, files] of Object.entries(graph.renderers)) {
    rendererSets.set(id, new Set(files));
  }

  for (const changed of changedFiles) {
    if (infraSet.has(changed)) continue;        // SC-4: infra file → no-op
    let claimed = false;
    for (const [id, files] of rendererSets) {
      if (files.has(changed)) {
        claimed = true;
        affected.add(id);
        const r = reasons.get(id) ?? [];
        r.push(changed);
        reasons.set(id, r);
      }
    }
    if (!claimed) unclaimed.push(changed);
  }

  return {
    affected,
    fullRegen: unclaimed.length > 0,           // D-04: any unclaimed → full regen
    reasons,
    unclaimed,
  };
}

// ─── computeDryRunDecision (pure) ───────────────────────────────────────────

/**
 * Compose the filter with the selected-docs set for `--dry-run` output.
 *
 * Branches:
 *   1. graph === null + since        → noGraph:true,  fellBack:true, all in wouldExecute
 *   2. graph === null + no since     → noGraph:true,  fellBack:false, all in wouldExecute
 *   3. graph + no changedFiles       → noGraph:false, fellBack:false, all in wouldExecute
 *   4. graph + changedFiles + full   → noGraph:false, fellBack:true,  all in wouldExecute
 *   5. graph + changedFiles + scoped → noGraph:false, fellBack:false, partition by filter
 *
 * INDEX (`00-index`) is ALWAYS in `wouldExecute` (bias toward inclusion per
 * RESEARCH Open Question 4 — users see all entries for transparency).
 */
export function computeDryRunDecision(args: {
  selectedDocs: readonly DocumentSpec[];
  graph: DepGraph | null;
  changedFiles: ReadonlySet<string> | undefined;
  since: string | undefined;
}): DryRunDecision {
  const { selectedDocs, graph, changedFiles, since } = args;

  // Branches 1+2: no graph available.
  if (graph === null) {
    const noGraphReason = since ? '(no dep-graph)' : '(no --since filter)';
    return {
      since,
      graphVersion: null,
      wouldExecute: selectedDocs.map((d) => ({
        rendererId: d.id,
        filename: d.filename,
        reasons: d.id === '00-index' ? ['(always renders)'] : [noGraphReason],
      })),
      wouldSkip: [],
      fellBackToFullRegen: since !== undefined,
      noGraph: true,
    };
  }

  // Branch 3: graph but no changedFiles (no --since provided).
  if (changedFiles === undefined) {
    return {
      since,
      graphVersion: graph.graphVersion,
      wouldExecute: selectedDocs.map((d) => ({
        rendererId: d.id,
        filename: d.filename,
        reasons: d.id === '00-index' ? ['(always renders)'] : ['(no --since filter)'],
      })),
      wouldSkip: [],
      fellBackToFullRegen: false,
      noGraph: false,
    };
  }

  // Graph + changedFiles → apply filter.
  const filter = filterRenderersByChangedFiles(changedFiles, graph);

  // Branch 4: unclaimed file(s) → full regen, all selected in wouldExecute.
  if (filter.fullRegen) {
    const unclaimedReason = `(full regen — unclaimed: ${filter.unclaimed.join(', ')})`;
    return {
      since,
      graphVersion: graph.graphVersion,
      wouldExecute: selectedDocs.map((d) => ({
        rendererId: d.id,
        filename: d.filename,
        reasons: d.id === '00-index' ? ['(always renders)'] : [unclaimedReason],
      })),
      wouldSkip: [],
      fellBackToFullRegen: true,
      noGraph: false,
    };
  }

  // Branch 5: surgical partition. INDEX always executes.
  const wouldExecute: DryRunDecision['wouldExecute'] = [];
  const wouldSkip: DryRunDecision['wouldSkip'] = [];
  for (const d of selectedDocs) {
    if (d.id === '00-index' || filter.affected.has(d.id)) {
      wouldExecute.push({
        rendererId: d.id,
        filename: d.filename,
        reasons: d.id === '00-index' ? ['(always renders)'] : filter.reasons.get(d.id) ?? [],
      });
    } else {
      wouldSkip.push({ rendererId: d.id, filename: d.filename });
    }
  }
  return {
    since,
    graphVersion: graph.graphVersion,
    wouldExecute,
    wouldSkip,
    fellBackToFullRegen: false,
    noGraph: false,
  };
}

// ─── Formatters ─────────────────────────────────────────────────────────────

/**
 * Human-scannable text format (D-15). Three blocks, no box-drawing, no color.
 * Trailing line `Zero LLM calls made.` is the SC-2 textual contract;
 * integration tests in Plan 03 assert on it literally.
 */
export function formatDryRun(d: DryRunDecision): string {
  const lines: string[] = [];

  // Header
  if (d.since === undefined && !d.noGraph) {
    lines.push('Dry-run preview (no --since: dep-graph not consulted)');
  } else if (d.noGraph && d.since !== undefined) {
    lines.push(`Dry-run preview (since: ${d.since})`);
    lines.push('(no dep-graph: would regen all selected docs)');
  } else if (d.noGraph) {
    lines.push('Dry-run preview (no --since: dep-graph not consulted)');
    lines.push('(no dep-graph: would regen all selected docs)');
  } else {
    lines.push(`Dry-run preview (since: ${d.since ?? '?'})`);
    if (d.fellBackToFullRegen) {
      // Pull unclaimed files from any execute entry's reasons (they all share the same hint).
      const firstReason = d.wouldExecute.find((e) => e.reasons.length > 0)?.reasons[0] ?? '';
      lines.push(`(unclaimed files forced full regen: ${stripUnclaimedPrefix(firstReason)})`);
    }
  }
  lines.push('');

  // Would execute block
  lines.push(`Would execute (${d.wouldExecute.length}):`);
  for (const e of d.wouldExecute) {
    if (e.reasons.length === 0) {
      lines.push(`  ${e.filename}`);
    } else {
      lines.push(`  ${e.filename}   ← ${e.reasons.join(', ')}`);
    }
  }
  lines.push('');

  // Would skip block
  lines.push(
    `Would skip (${d.wouldSkip.length})` +
      (d.wouldSkip.length > 0 ? `: ${d.wouldSkip.map((s) => s.rendererId.toUpperCase()).join(', ')}` : ''),
  );
  lines.push('');

  // Trailing literal (SC-2 textual contract)
  lines.push('Zero LLM calls made.');

  return lines.join('\n') + '\n';
}

/** Extract the unclaimed-files suffix from a "(full regen — unclaimed: ...)" reason hint. */
function stripUnclaimedPrefix(reason: string): string {
  const m = reason.match(/unclaimed:\s*([^)]+)\)?\s*$/);
  return m ? m[1].trim() : reason;
}

/**
 * Machine-readable JSON for Phase 36 GitHub Action (D-16).
 *
 * Contract (must remain stable; breaking changes require a `formatVersion` bump):
 *   { formatVersion, since, graphVersion, wouldExecute, wouldSkip, fellBackToFullRegen, noGraph }
 *
 * - `since` is `null` when not provided.
 * - `graphVersion` is `null` when no graph existed at run time.
 * - `wouldSkip` is a FLAT string array of renderer ids (saves bytes in 65k-char PR comments).
 * - Inner `wouldExecute` entries rename `rendererId` → `renderer` per Phase 36 contract.
 */
export function formatDryRunJson(d: DryRunDecision): string {
  const payload = {
    formatVersion: 1,
    since: d.since ?? null,
    graphVersion: d.graphVersion,
    wouldExecute: d.wouldExecute.map((e) => ({
      renderer: e.rendererId,
      filename: e.filename,
      reasons: e.reasons,
    })),
    wouldSkip: d.wouldSkip.map((s) => s.rendererId),
    fellBackToFullRegen: d.fellBackToFullRegen,
    noGraph: d.noGraph,
  };
  return JSON.stringify(payload, null, 2) + '\n';
}
