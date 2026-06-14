import type { DepGraph } from './dep-graph.js';
import { filterRenderersByChangedFiles } from './dep-graph.js';

export interface StaleDoc {
  rendererId: string;
  filename: string;
  /** Changed source files that make this doc stale. */
  reasons: string[];
}

export interface StalenessResult {
  /** Docs whose source changed but which were not regenerated, sorted by id. */
  stale: StaleDoc[];
  /** An unclaimed (un-scopable) source change forced whole-corpus staleness. */
  fullRegen: boolean;
}

/**
 * Determine which docs are out of date with the source. A doc is stale when a
 * source it depends on changed AND the doc's own output was not regenerated in
 * the same change set. Changes to the output dir are separated from source
 * changes so a regenerated doc is never mistaken for an unclaimed source change.
 */
export function detectStaleDocs(args: {
  changedFiles: ReadonlySet<string>;
  graph: DepGraph;
  docs: ReadonlyArray<{ id: string; filename: string }>;
  outputDir: string;
}): StalenessResult {
  const { changedFiles, graph, docs, outputDir } = args;
  const prefix = `${outputDir}/`;

  const sourceChanges = new Set<string>();
  const regenerated = new Set<string>();
  for (const file of changedFiles) {
    if (file.startsWith(prefix)) regenerated.add(file);
    else sourceChanges.add(file);
  }

  const filter = filterRenderersByChangedFiles(sourceChanges, graph);
  const isRegenerated = (filename: string): boolean => regenerated.has(prefix + filename);
  const byId = new Map(docs.map((d) => [d.id, d]));

  const stale: StaleDoc[] = [];
  if (filter.fullRegen) {
    for (const d of docs) {
      if (!isRegenerated(d.filename)) {
        stale.push({ rendererId: d.id, filename: d.filename, reasons: filter.unclaimed });
      }
    }
  } else {
    for (const id of filter.affected) {
      const d = byId.get(id);
      if (d && !isRegenerated(d.filename)) {
        stale.push({ rendererId: id, filename: d.filename, reasons: filter.reasons.get(id) ?? [] });
      }
    }
  }

  stale.sort((a, b) => a.rendererId.localeCompare(b.rendererId));
  return { stale, fullRegen: filter.fullRegen };
}

/** Human-readable staleness report for the `handover check` command. */
export function formatStaleness(result: StalenessResult): string {
  if (result.stale.length === 0) {
    return 'All documentation is up to date with the source.\n';
  }

  const lines = [`${result.stale.length} document(s) out of date with the source:`, ''];
  for (const doc of result.stale) {
    lines.push(`  ${doc.filename}`);
    if (doc.reasons.length > 0) {
      lines.push(`    changed: ${doc.reasons.join(', ')}`);
    }
  }
  lines.push('', 'Run `handover generate --since <ref>` to refresh them.', '');
  return lines.join('\n');
}

function jsonLine(payload: object): string {
  return JSON.stringify({ formatVersion: 1, ...payload }, null, 2) + '\n';
}

/** Machine-readable staleness report for `handover check --json` (CI consumption). */
export function formatStalenessJson(result: StalenessResult): string {
  return jsonLine({
    status: 'checked',
    upToDate: result.stale.length === 0,
    fullRegen: result.fullRegen,
    stale: result.stale.map((d) => ({
      renderer: d.rendererId,
      filename: d.filename,
      reasons: d.reasons,
    })),
  });
}

/**
 * Machine-readable payload for `handover check --json` paths that produce no
 * staleness result (skipped fallback, missing graph, unresolvable ref), so a
 * --json consumer always receives parseable JSON on stdout.
 */
export function formatCheckStatusJson(
  status: 'skipped' | 'no-graph' | 'unresolved-ref',
  reason: string,
): string {
  return jsonLine({ status, reason });
}
