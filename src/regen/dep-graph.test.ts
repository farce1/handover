import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { vol } from 'memfs';

// Hoisted mock for fast-glob default export (pattern from src/cache/git-fingerprint.test.ts:5-13).
// The mock is a Vitest spy; each test customizes return values via mockImplementation/mockResolvedValue.
const mockFg = vi.hoisted(() => vi.fn());
vi.mock('fast-glob', () => ({ default: mockFg }));

// Memfs for fs isolation (pattern from src/cli/init-detectors.test.ts:1-12).
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});
vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

import {
  GRAPH_VERSION,
  INFRASTRUCTURE_PATHS,
  DepGraphSchema,
  buildDepGraph,
  saveDepGraph,
  loadDepGraph,
  filterRenderersByChangedFiles,
  computeDryRunDecision,
  formatDryRun,
  formatDryRunJson,
} from './dep-graph.js';
import type { DepGraph, DryRunDecision } from './dep-graph.js';
import type { DocumentSpec } from '../renderers/types.js';

beforeEach(() => {
  vol.reset();
  mockFg.mockReset();
});

// ─── Helper factories ────────────────────────────────────────────────────────

function makeGraph(overrides?: Partial<DepGraph>): DepGraph {
  return {
    graphVersion: 1,
    builtAt: '2026-05-13T00:00:00.000Z',
    renderers: {
      '01-project-overview': ['src/ai-rounds/round-1-overview.ts'],
      '03-architecture': ['src/orchestrator/dag.ts', 'src/ai-rounds/round-4-architecture.ts'],
      '06-modules': ['src/ai-rounds/round-2-modules.ts'],
    },
    infrastructurePaths: [...INFRASTRUCTURE_PATHS],
    infrastructureFiles: ['src/utils/logger.ts', 'src/utils/errors.ts'],
    ...overrides,
  };
}

function makeDoc(id: string, filename: string, requiredSources: string[]): DocumentSpec {
  return {
    id,
    filename,
    title: id,
    category: 'test',
    aliases: [id],
    requiredRounds: [],
    requiredSources,
    render: () => '',
  };
}

// ─── 1. GRAPH_VERSION constant ──────────────────────────────────────────────

describe('GRAPH_VERSION constant', () => {
  it('is the literal 1', () => {
    expect(GRAPH_VERSION).toBe(1);
  });
});

// ─── 2. INFRASTRUCTURE_PATHS list ───────────────────────────────────────────

describe('INFRASTRUCTURE_PATHS list', () => {
  it("includes 'src/utils/**' (logger/errors/rate-limiter)", () => {
    expect(INFRASTRUCTURE_PATHS).toContain('src/utils/**');
  });

  it("includes '**/types.ts' (type-only barrels anywhere)", () => {
    expect(INFRASTRUCTURE_PATHS).toContain('**/types.ts');
  });

  it("does NOT include 'src/orchestrator/**' (D-12 final paragraph)", () => {
    expect(INFRASTRUCTURE_PATHS).not.toContain('src/orchestrator/**');
  });
});

// ─── 3. buildDepGraph ───────────────────────────────────────────────────────

describe('buildDepGraph', () => {
  it('returns a DepGraph with graphVersion 1 and ISO-8601 builtAt', async () => {
    mockFg.mockResolvedValue([]);
    const registry: DocumentSpec[] = [makeDoc('00-index', '00-INDEX.md', [])];
    const graph = await buildDepGraph(registry, '/proj');
    expect(graph.graphVersion).toBe(1);
    // ISO-8601: 2026-05-13T12:34:56.789Z or similar
    expect(graph.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("skips the '00-index' registry entry (INDEX has no source deps)", async () => {
    mockFg.mockResolvedValue([]);
    const registry: DocumentSpec[] = [
      makeDoc('00-index', '00-INDEX.md', ['src/renderers/render-00-index.ts']),
      makeDoc('01-project-overview', '01-PROJECT-OVERVIEW.md', ['src/foo.ts']),
    ];
    const graph = await buildDepGraph(registry, '/proj');
    expect(graph.renderers['00-index']).toBeUndefined();
    expect(graph.renderers['01-project-overview']).toBeDefined();
  });

  it('calls fast-glob with cwd:rootDir, onlyFiles, followSymbolicLinks:false, the tighter ignore', async () => {
    mockFg.mockResolvedValue([]);
    const registry: DocumentSpec[] = [
      makeDoc('03-architecture', '03-ARCHITECTURE.md', ['src/orchestrator/**']),
    ];
    await buildDepGraph(registry, '/proj');
    // The first call is for the renderer; the second (or one of them) for INFRASTRUCTURE_PATHS.
    const rendererCall = mockFg.mock.calls.find(
      (c) => Array.isArray(c[0]) && c[0].includes('src/orchestrator/**'),
    );
    expect(rendererCall).toBeDefined();
    const opts = rendererCall![1] as Record<string, unknown>;
    expect(opts.cwd).toBe('/proj');
    expect(opts.onlyFiles).toBe(true);
    expect(opts.followSymbolicLinks).toBe(false);
    expect(opts.dot).toBe(false);
    // Tighter ignore subset (RESEARCH §"Conservative ignore list").
    expect(opts.ignore).toEqual([
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/.handover/**',
    ]);
  });

  it('filters infrastructure files from each renderer resolved list', async () => {
    const registry: DocumentSpec[] = [
      makeDoc('00-index', '00-INDEX.md', []),
      makeDoc('03-architecture', '03-ARCHITECTURE.md', [
        'src/renderers/render-03-architecture.ts',
        'src/orchestrator/dag.ts',
      ]),
    ];
    mockFg.mockImplementation(async (patterns: string[]) => {
      // First call: 03-architecture's requiredSources → returns one infra file + one domain file
      if (Array.isArray(patterns) && patterns.includes('src/orchestrator/dag.ts')) {
        return ['src/orchestrator/dag.ts', 'src/utils/logger.ts'];
      }
      // Other calls: INFRASTRUCTURE_PATHS expansion → returns infra files
      return ['src/utils/logger.ts', 'src/utils/errors.ts'];
    });
    const graph = await buildDepGraph(registry, '/proj');
    expect(graph.renderers['00-index']).toBeUndefined();
    expect(graph.renderers['03-architecture']).toEqual(['src/orchestrator/dag.ts']);
    expect(graph.infrastructureFiles).toContain('src/utils/logger.ts');
  });

  it('populates infrastructureFiles by globbing INFRASTRUCTURE_PATHS', async () => {
    const registry: DocumentSpec[] = [makeDoc('00-index', '00-INDEX.md', [])];
    mockFg.mockImplementation(async (patterns: string[]) => {
      // INFRASTRUCTURE_PATHS expansion
      if (Array.isArray(patterns) && patterns.includes('src/utils/**')) {
        return ['src/utils/logger.ts', 'src/utils/errors.ts', 'src/config/loader.ts'];
      }
      return [];
    });
    const graph = await buildDepGraph(registry, '/proj');
    expect(graph.infrastructureFiles.sort()).toEqual(
      ['src/config/loader.ts', 'src/utils/errors.ts', 'src/utils/logger.ts'],
    );
    expect(graph.infrastructurePaths).toEqual([...INFRASTRUCTURE_PATHS]);
  });
});

// ─── 4. saveDepGraph ────────────────────────────────────────────────────────

describe('saveDepGraph', () => {
  it('writes JSON to <rootDir>/.handover/cache/dep-graph.json', async () => {
    const graph = makeGraph();
    await saveDepGraph('/proj', graph);
    const fs = await import('node:fs/promises');
    const content = await fs.readFile('/proj/.handover/cache/dep-graph.json', 'utf-8');
    const parsed = JSON.parse(content) as DepGraph;
    expect(parsed.graphVersion).toBe(1);
    expect(parsed.renderers['03-architecture']).toEqual([
      'src/orchestrator/dag.ts',
      'src/ai-rounds/round-4-architecture.ts',
    ]);
  });

  it('creates the cache directory recursively if missing', async () => {
    // /proj does not exist in memfs; saveDepGraph must mkdir -p.
    const graph = makeGraph();
    await saveDepGraph('/new-project', graph);
    const fs = await import('node:fs/promises');
    const stat = await fs.stat('/new-project/.handover/cache');
    expect(stat.isDirectory()).toBe(true);
  });

  it('writes pretty-printed JSON (2-space indent)', async () => {
    const graph = makeGraph();
    await saveDepGraph('/proj', graph);
    const fs = await import('node:fs/promises');
    const content = await fs.readFile('/proj/.handover/cache/dep-graph.json', 'utf-8');
    expect(content).toContain('\n  "');
  });
});

// ─── 5. loadDepGraph — SC-3 + SC-5 ──────────────────────────────────────────

describe('loadDepGraph', () => {
  it('returns null when file missing', async () => {
    const out = await loadDepGraph('/no-such-proj');
    expect(out).toBeNull();
  });

  it('returns parsed DepGraph for valid v1 JSON', async () => {
    const graph = makeGraph();
    vol.fromJSON({
      '/proj/.handover/cache/dep-graph.json': JSON.stringify(graph, null, 2),
    });
    const out = await loadDepGraph('/proj');
    expect(out).not.toBeNull();
    expect(out!.graphVersion).toBe(1);
    expect(out!.renderers['01-project-overview']).toEqual([
      'src/ai-rounds/round-1-overview.ts',
    ]);
  });

  it('returns null on graphVersion mismatch (z.literal failure)', async () => {
    const badGraph = { ...makeGraph(), graphVersion: 0 };
    vol.fromJSON({
      '/proj/.handover/cache/dep-graph.json': JSON.stringify(badGraph, null, 2),
    });
    const out = await loadDepGraph('/proj');
    expect(out).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    vol.fromJSON({
      '/proj/.handover/cache/dep-graph.json': '{not json',
    });
    const out = await loadDepGraph('/proj');
    expect(out).toBeNull();
  });

  it('returns null on schema-shape violation', async () => {
    const bad = { graphVersion: 1, builtAt: 't', renderers: 'oops', infrastructurePaths: [], infrastructureFiles: [] };
    vol.fromJSON({
      '/proj/.handover/cache/dep-graph.json': JSON.stringify(bad),
    });
    const out = await loadDepGraph('/proj');
    expect(out).toBeNull();
  });
});

// ─── 6. filterRenderersByChangedFiles — SC-1 + SC-4 ─────────────────────────

describe('filterRenderersByChangedFiles', () => {
  it('SC-1: a single non-infra file change yields fewer than all renderers in affected', () => {
    const graph = makeGraph();
    const decision = filterRenderersByChangedFiles(new Set(['src/orchestrator/dag.ts']), graph);
    expect(decision.affected.size).toBeLessThan(Object.keys(graph.renderers).length);
    expect(decision.affected.has('03-architecture')).toBe(true);
    expect(decision.fullRegen).toBe(false);
    expect(decision.unclaimed).toEqual([]);
    expect(decision.reasons.get('03-architecture')).toEqual(['src/orchestrator/dag.ts']);
  });

  it('SC-4: a single infrastructure file change yields zero affected renderers and zero unclaimed', () => {
    const graph = makeGraph(); // infrastructureFiles includes 'src/utils/logger.ts'
    const decision = filterRenderersByChangedFiles(new Set(['src/utils/logger.ts']), graph);
    expect(decision.affected.size).toBe(0);
    expect(decision.fullRegen).toBe(false);
    expect(decision.unclaimed).toEqual([]);
  });

  it('multiple files matching the SAME renderer → reasons contains BOTH files in input order', () => {
    const graph = makeGraph();
    const changed = new Set(['src/orchestrator/dag.ts', 'src/ai-rounds/round-4-architecture.ts']);
    const decision = filterRenderersByChangedFiles(changed, graph);
    expect(decision.affected.has('03-architecture')).toBe(true);
    const reasons = decision.reasons.get('03-architecture')!;
    expect(reasons.length).toBe(2);
    expect(reasons).toContain('src/orchestrator/dag.ts');
    expect(reasons).toContain('src/ai-rounds/round-4-architecture.ts');
  });

  it('changed file not in any renderer AND not in infra → fullRegen:true and unclaimed contains the file', () => {
    const graph = makeGraph();
    const decision = filterRenderersByChangedFiles(new Set(['src/mystery/unknown.ts']), graph);
    expect(decision.fullRegen).toBe(true);
    expect(decision.unclaimed).toEqual(['src/mystery/unknown.ts']);
    expect(decision.affected.size).toBe(0);
  });

  it('empty changedFiles set → empty affected, fullRegen:false, unclaimed:[]', () => {
    const graph = makeGraph();
    const decision = filterRenderersByChangedFiles(new Set<string>(), graph);
    expect(decision.affected.size).toBe(0);
    expect(decision.fullRegen).toBe(false);
    expect(decision.unclaimed).toEqual([]);
  });

  it('two changed files: one infra (no effect) + one matching a renderer → only the renderer is affected', () => {
    const graph = makeGraph();
    const changed = new Set(['src/utils/logger.ts', 'src/orchestrator/dag.ts']);
    const decision = filterRenderersByChangedFiles(changed, graph);
    expect(decision.affected.size).toBe(1);
    expect(decision.affected.has('03-architecture')).toBe(true);
    expect(decision.fullRegen).toBe(false);
    expect(decision.unclaimed).toEqual([]);
  });
});

// ─── 7. computeDryRunDecision ───────────────────────────────────────────────

describe('computeDryRunDecision', () => {
  it('with graph + changedFiles + since → wouldExecute lists only affected; wouldSkip the rest', () => {
    const graph = makeGraph();
    const selectedDocs = [
      makeDoc('00-index', '00-INDEX.md', []),
      makeDoc('01-project-overview', '01-PROJECT-OVERVIEW.md', []),
      makeDoc('03-architecture', '03-ARCHITECTURE.md', []),
      makeDoc('06-modules', '06-MODULES.md', []),
    ];
    const d = computeDryRunDecision({
      selectedDocs,
      graph,
      changedFiles: new Set(['src/orchestrator/dag.ts']),
      since: 'HEAD~1',
    });
    expect(d.fellBackToFullRegen).toBe(false);
    expect(d.noGraph).toBe(false);
    expect(d.graphVersion).toBe(1);
    // INDEX is always present in wouldExecute (always renders), plus 03-architecture
    const wouldExecuteIds = d.wouldExecute.map((e) => e.rendererId);
    expect(wouldExecuteIds).toContain('00-index');
    expect(wouldExecuteIds).toContain('03-architecture');
    // 01 and 06 land in wouldSkip
    const wouldSkipIds = d.wouldSkip.map((s) => s.rendererId);
    expect(wouldSkipIds).toContain('01-project-overview');
    expect(wouldSkipIds).toContain('06-modules');
  });

  it('with graph + NO changedFiles + NO since → all selectedDocs in wouldExecute; wouldSkip:[]', () => {
    const graph = makeGraph();
    const selectedDocs = [
      makeDoc('00-index', '00-INDEX.md', []),
      makeDoc('01-project-overview', '01-PROJECT-OVERVIEW.md', []),
    ];
    const d = computeDryRunDecision({
      selectedDocs,
      graph,
      changedFiles: undefined,
      since: undefined,
    });
    expect(d.fellBackToFullRegen).toBe(false);
    expect(d.noGraph).toBe(false);
    expect(d.graphVersion).toBe(1);
    expect(d.wouldExecute.map((e) => e.rendererId)).toEqual(['00-index', '01-project-overview']);
    expect(d.wouldSkip).toEqual([]);
  });

  it('with graph + since + filter.fullRegen=true (unclaimed) → fellBackToFullRegen:true; all selectedDocs in wouldExecute', () => {
    const graph = makeGraph();
    const selectedDocs = [
      makeDoc('00-index', '00-INDEX.md', []),
      makeDoc('01-project-overview', '01-PROJECT-OVERVIEW.md', []),
      makeDoc('03-architecture', '03-ARCHITECTURE.md', []),
    ];
    const d = computeDryRunDecision({
      selectedDocs,
      graph,
      changedFiles: new Set(['src/unknown/path.ts']),
      since: 'HEAD~1',
    });
    expect(d.fellBackToFullRegen).toBe(true);
    expect(d.noGraph).toBe(false);
    expect(d.wouldExecute.map((e) => e.rendererId)).toEqual([
      '00-index',
      '01-project-overview',
      '03-architecture',
    ]);
    expect(d.wouldSkip).toEqual([]);
    // Reasons should mention the unclaimed file
    const someReason = d.wouldExecute[1].reasons.join(' ');
    expect(someReason).toContain('src/unknown/path.ts');
  });

  it('with NO graph (graph===null) + since provided → fellBackToFullRegen:true, noGraph:true, graphVersion:null', () => {
    const selectedDocs = [
      makeDoc('00-index', '00-INDEX.md', []),
      makeDoc('01-project-overview', '01-PROJECT-OVERVIEW.md', []),
    ];
    const d = computeDryRunDecision({
      selectedDocs,
      graph: null,
      changedFiles: new Set(['src/foo.ts']),
      since: 'HEAD~1',
    });
    expect(d.noGraph).toBe(true);
    expect(d.fellBackToFullRegen).toBe(true);
    expect(d.graphVersion).toBeNull();
    expect(d.wouldExecute.map((e) => e.rendererId)).toEqual([
      '00-index',
      '01-project-overview',
    ]);
    expect(d.wouldSkip).toEqual([]);
  });

  it('with NO graph + NO since → noGraph:true, graphVersion:null, fellBackToFullRegen:false; all selectedDocs in wouldExecute', () => {
    const selectedDocs = [
      makeDoc('00-index', '00-INDEX.md', []),
      makeDoc('01-project-overview', '01-PROJECT-OVERVIEW.md', []),
    ];
    const d = computeDryRunDecision({
      selectedDocs,
      graph: null,
      changedFiles: undefined,
      since: undefined,
    });
    expect(d.noGraph).toBe(true);
    expect(d.fellBackToFullRegen).toBe(false);
    expect(d.graphVersion).toBeNull();
    expect(d.wouldExecute.map((e) => e.rendererId)).toEqual([
      '00-index',
      '01-project-overview',
    ]);
    expect(d.wouldSkip).toEqual([]);
  });
});

// ─── 8. formatDryRun (text) ─────────────────────────────────────────────────

describe('formatDryRun', () => {
  it('contains the literal "Zero LLM calls made." at the end of output (SC-2 marker)', () => {
    const decision: DryRunDecision = {
      since: 'HEAD~1',
      graphVersion: 1,
      wouldExecute: [
        { rendererId: '03-architecture', filename: '03-ARCHITECTURE.md', reasons: ['src/orchestrator/dag.ts'] },
      ],
      wouldSkip: [
        { rendererId: '01-project-overview', filename: '01-PROJECT-OVERVIEW.md' },
      ],
      fellBackToFullRegen: false,
      noGraph: false,
    };
    const text = formatDryRun(decision);
    expect(text).toContain('Zero LLM calls made.');
    expect(text.trimEnd().endsWith('Zero LLM calls made.')).toBe(true);
  });

  it('contains "Would execute (" and "Would skip (" count headers', () => {
    const decision: DryRunDecision = {
      since: 'HEAD~1',
      graphVersion: 1,
      wouldExecute: [
        { rendererId: '03-architecture', filename: '03-ARCHITECTURE.md', reasons: ['src/orchestrator/dag.ts'] },
      ],
      wouldSkip: [
        { rendererId: '01-project-overview', filename: '01-PROJECT-OVERVIEW.md' },
      ],
      fellBackToFullRegen: false,
      noGraph: false,
    };
    const text = formatDryRun(decision);
    expect(text).toContain('Would execute (1)');
    expect(text).toContain('Would skip (1)');
  });

  it('with since set, header line is "Dry-run preview (since: HEAD~1)"', () => {
    const decision: DryRunDecision = {
      since: 'HEAD~1',
      graphVersion: 1,
      wouldExecute: [],
      wouldSkip: [],
      fellBackToFullRegen: false,
      noGraph: false,
    };
    const text = formatDryRun(decision);
    expect(text.startsWith('Dry-run preview (since: HEAD~1)')).toBe(true);
  });

  it('with no --since, header includes "(no --since: dep-graph not consulted)"', () => {
    const decision: DryRunDecision = {
      since: undefined,
      graphVersion: 1,
      wouldExecute: [],
      wouldSkip: [],
      fellBackToFullRegen: false,
      noGraph: false,
    };
    const text = formatDryRun(decision);
    expect(text).toContain('no --since: dep-graph not consulted');
  });

  it('with fellBackToFullRegen:true (unclaimed), header has a second line listing unclaimed', () => {
    const decision: DryRunDecision = {
      since: 'HEAD~1',
      graphVersion: 1,
      wouldExecute: [
        { rendererId: '00-index', filename: '00-INDEX.md', reasons: ['(full regen — unclaimed: src/mystery/x.ts)'] },
      ],
      wouldSkip: [],
      fellBackToFullRegen: true,
      noGraph: false,
    };
    const text = formatDryRun(decision);
    expect(text).toContain('full regen');
    expect(text).toContain('src/mystery/x.ts');
  });

  it('with noGraph:true and since provided → header notes no dep-graph', () => {
    const decision: DryRunDecision = {
      since: 'HEAD~1',
      graphVersion: null,
      wouldExecute: [
        { rendererId: '00-index', filename: '00-INDEX.md', reasons: ['(no dep-graph)'] },
      ],
      wouldSkip: [],
      fellBackToFullRegen: true,
      noGraph: true,
    };
    const text = formatDryRun(decision);
    expect(text).toContain('no dep-graph');
  });
});

// ─── 9. formatDryRunJson — Phase 36 contract ────────────────────────────────

describe('formatDryRunJson', () => {
  it('output is valid JSON parseable by JSON.parse', () => {
    const decision: DryRunDecision = {
      since: 'HEAD~1',
      graphVersion: 1,
      wouldExecute: [],
      wouldSkip: [],
      fellBackToFullRegen: false,
      noGraph: false,
    };
    const json = formatDryRunJson(decision);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('parsed shape has exactly the 7 Phase 36 keys (no extras, no missing)', () => {
    const decision: DryRunDecision = {
      since: 'HEAD~1',
      graphVersion: 1,
      wouldExecute: [
        { rendererId: '03-architecture', filename: '03-ARCHITECTURE.md', reasons: [] },
      ],
      wouldSkip: [{ rendererId: '01-project-overview', filename: '01-PROJECT-OVERVIEW.md' }],
      fellBackToFullRegen: false,
      noGraph: false,
    };
    const parsed = JSON.parse(formatDryRunJson(decision));
    expect(Object.keys(parsed).sort()).toEqual([
      'fellBackToFullRegen',
      'formatVersion',
      'graphVersion',
      'noGraph',
      'since',
      'wouldExecute',
      'wouldSkip',
    ]);
  });

  test('Phase 36 JSON contract — fixture snapshot', () => {
    const decision: DryRunDecision = {
      since: 'HEAD~1',
      graphVersion: 1,
      wouldExecute: [
        { rendererId: '03-architecture', filename: '03-ARCHITECTURE.md', reasons: ['src/orchestrator/dag.ts'] },
      ],
      wouldSkip: [
        { rendererId: '01-project-overview', filename: '01-PROJECT-OVERVIEW.md' },
      ],
      fellBackToFullRegen: false,
      noGraph: false,
    };
    const json = formatDryRunJson(decision);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({
      formatVersion: 1,
      since: 'HEAD~1',
      graphVersion: 1,
      wouldExecute: [
        { renderer: '03-architecture', filename: '03-ARCHITECTURE.md', reasons: ['src/orchestrator/dag.ts'] },
      ],
      wouldSkip: ['01-project-overview'],
      fellBackToFullRegen: false,
      noGraph: false,
    });
    // Phase 36 contract — keys must match EXACTLY
    expect(Object.keys(parsed).sort()).toEqual([
      'fellBackToFullRegen',
      'formatVersion',
      'graphVersion',
      'noGraph',
      'since',
      'wouldExecute',
      'wouldSkip',
    ]);
  });

  it('since undefined → null (JSON) and graphVersion null → null', () => {
    const decision: DryRunDecision = {
      since: undefined,
      graphVersion: null,
      wouldExecute: [],
      wouldSkip: [],
      fellBackToFullRegen: false,
      noGraph: true,
    };
    const parsed = JSON.parse(formatDryRunJson(decision));
    expect(parsed.since).toBeNull();
    expect(parsed.graphVersion).toBeNull();
  });
});

// ─── 10. DepGraphSchema — direct shape checks ───────────────────────────────

describe('DepGraphSchema', () => {
  it('parses a valid graph', () => {
    const graph = makeGraph();
    const out = DepGraphSchema.safeParse(graph);
    expect(out.success).toBe(true);
  });

  it('rejects a graph with graphVersion: 0 (z.literal mismatch)', () => {
    const bad = { ...makeGraph(), graphVersion: 0 };
    const out = DepGraphSchema.safeParse(bad);
    expect(out.success).toBe(false);
  });
});
