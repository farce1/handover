# Phase 32: Source→Doc Dependency Graph - Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8 (100% — all files have strong analogs in tree)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/regen/dep-graph.ts` (NEW) | cache module + pure filter + formatter | file I/O (read JSON / write JSON) + transform | `src/cache/round-cache.ts` | role-match (versioned JSON cache) |
| `src/regen/dep-graph.test.ts` (NEW) | unit tests, vi.mock + memfs | request-response (assertions) | `src/cli/init-detectors.test.ts` + `src/cache/git-fingerprint.test.ts` | exact (vi.hoisted mock + memfs reset pattern) |
| `tests/integration/dry-run.test.ts` (NEW) | integration test, CLI subprocess | request-response | `tests/integration/edge-cases.test.ts` | exact (same `createFixtureScope` + `runCLI` harness) |
| `src/renderers/types.ts` (MOD) | interface extension | n/a (type-only) | self (existing `DocumentSpec`, `DocumentStatus`) | exact (extend in place) |
| `src/renderers/registry.ts` (MOD) | renderer registry — add `requiredSources` to 14 entries + helper | data declaration | self (existing 14 `DocumentSpec` entries with `requiredRounds`) | exact |
| `src/renderers/render-00-index.ts` (MOD) | renderer — handle new `'reused'` status | transform | self (existing `statusLabel` switch lines 56–67) | exact (1 new switch case) |
| `src/cli/index.ts` (MOD) | Commander.js flag wiring | config | self (existing `--since` flag at line 35-37) | exact (same `.option()` chain on the `generate` subcommand) |
| `src/cli/generate.ts` (MOD) | wire-in points — `--dry-run` early-exit, `--since` filter call, full-run save, `'reused'` status in render loop | request-response (CLI pipeline) | self (existing `if (options.since)` branch line 514–530; render loop 905–959; status assembly 940–959) | exact (5 small edits to known sites) |

---

## Pattern Assignments

### `src/regen/dep-graph.ts` (NEW — cache module + pure filter + formatter)

**Primary analog:** `src/cache/round-cache.ts:1-215` — the versioned-JSON-on-disk + version-mismatch-silent-reset pattern. This is the canonical reference per CONTEXT D-07.
**Secondary analog:** `src/analyzers/file-discovery.ts:95-147` — the `fast-glob` invocation shape with `cwd: rootDir`, `onlyFiles: true`, ignore list.

**Imports pattern** (mirror `round-cache.ts:10-13` + `file-discovery.ts:1-6`):

```typescript
// from src/cache/round-cache.ts:10-13 — file IO + path utilities
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// from src/analyzers/file-discovery.ts:1 — glob expansion
import fg from 'fast-glob';

// project pattern — boundary validation
import { z } from 'zod';

// types — DocumentSpec is THE renderer contract
import type { DocumentSpec } from '../renderers/types.js';
```

**Version constant pattern** (copy from `round-cache.ts:15-16`, rename + bump policy is manual):

```typescript
// SOURCE: src/cache/round-cache.ts:15-16
/** Cache format version — bump when the entry shape changes. */
const CACHE_VERSION = 2;

// ADAPT TO (Phase 32):
/** Graph format version — bump when the dep-graph.json shape changes. */
export const GRAPH_VERSION = 1 as const;
```

**JSON-per-file persistence pattern** (mirror `round-cache.ts:125-145` minus the `ensureGitignored` call — D-22 says skip it because `.handover/cache` is already gitignored from Phase 31 D-10):

```typescript
// SOURCE: src/cache/round-cache.ts:125-145 — RoundCache.set()
async set(roundNumber: number, hash: string, result: unknown, model: string): Promise<void> {
  await mkdir(this.cacheDir, { recursive: true });

  const filePath = join(this.cacheDir, `round-${roundNumber}.json`);
  const entry: RoundCacheEntry = {
    version: CACHE_VERSION,
    hash,
    roundNumber,
    model,
    result,
    createdAt: new Date().toISOString(),
  };

  await writeFile(filePath, JSON.stringify(entry, null, 2));
  await this.ensureGitignored();              // <-- OMIT in dep-graph (D-22)
}
```

**Version-mismatch silent reset pattern** (mirror `round-cache.ts:93-122` — but use Zod `safeParse` to handle version + corrupt + shape failures in one branch):

```typescript
// SOURCE: src/cache/round-cache.ts:93-122 — RoundCache.get()
async get(roundNumber: number, expectedHash: string): Promise<unknown | null> {
  const filePath = join(this.cacheDir, `round-${roundNumber}.json`);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = await readFile(filePath, 'utf-8');
    const entry = JSON.parse(raw) as RoundCacheEntry;

    // Version migration: clear cache once on first mismatch detected
    if (entry.version !== CACHE_VERSION) {
      if (!this.migrationHandled) {
        this.migrationHandled = true;
        await this.clear();
      }
      return null;
    }

    // Stale cache — content changed since this was stored
    if (entry.hash !== expectedHash) {
      return null;
    }

    return entry.result;
  } catch {
    // Corrupted file — treat as cache miss
    return null;
  }
}
```

**ADAPT FOR PHASE 32 (`loadDepGraph`):** Replace the explicit `entry.version !== CACHE_VERSION` branch with `z.literal(GRAPH_VERSION)` inside the Zod schema. `safeParse` returns `{success: false}` for both version mismatch AND shape corruption — one catch-all branch. Dep-graph does NOT need `.clear()` because there is only ever one `dep-graph.json` (not many `round-N.json` files); a stale read returns `null` and the next full-run write overwrites the stale file in place.

**Glob expansion pattern** (mirror `file-discovery.ts:104-111` — identical option set, same ignore list, same `cwd: rootDir`):

```typescript
// SOURCE: src/analyzers/file-discovery.ts:104-111
const entries = await fg('**/*', {
  cwd: rootDir,
  onlyFiles: true,
  stats: true,            // <-- OMIT in dep-graph (we don't need size/mtime)
  dot: false,
  followSymbolicLinks: false,
  ignore: ALWAYS_IGNORE,  // <-- adapt: subset of ALWAYS_IGNORE (no need for build/coverage)
});
```

**Ignore list reference** (`file-discovery.ts:12-23`):

```typescript
const ALWAYS_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/__pycache__/**',
  '**/target/**',
  '**/vendor/**',
  '**/.handover/**',
];
```

**ADAPT FOR PHASE 32:** Per RESEARCH §"Glob materialization at build time", use a tighter subset: `['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.handover/**']`. Don't need `build/`, `coverage/`, `.next/`, `__pycache__/`, `target/`, `vendor/` because renderer `requiredSources` globs are positive selectors aimed at `src/**` — they won't accidentally match those dirs.

**CRITICAL invariant — CWD alignment** (RESEARCH "Pitfall 1"): `fg` with `cwd: rootDir` returns **repo-relative forward-slash paths** (e.g. `src/orchestrator/dag.ts`). `getGitChangedFiles` returns the same form (verified at `src/cache/git-fingerprint.test.ts:86-91`: `expect([...result.changedFiles].sort()).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);`). Plain `Set.has()` matches directly — do NOT pass `absolute: true` to `fg`, do NOT `path.join` the keys before lookup.

**Pure-filter pattern** (no prior analog — net-new pure function, but follow project's typical "structured decision object" return shape used by e.g. `getGitChangedFiles` which returns `{ kind: 'ok'|'fallback', changedFiles, reason? }`):

```typescript
// PATTERN (new): structured decision object, parallels git-fingerprint.ts return shape
export interface FilterDecision {
  affected: Set<string>;
  fullRegen: boolean;
  reasons: Map<string, string[]>;
  unclaimed: string[];
}

export function filterRenderersByChangedFiles(
  changedFiles: ReadonlySet<string>,
  graph: DepGraph,
): FilterDecision { /* pure — no I/O */ }
```

**What to copy from `round-cache.ts`:**
- `CACHE_VERSION` const placement + comment style → `GRAPH_VERSION`
- `existsSync(filePath)` early-return → identical
- `readFile` + `try/catch` + return-null-on-error → identical
- `mkdir(dir, { recursive: true })` before write → identical
- `JSON.stringify(entry, null, 2)` formatting → identical

**What to change:**
- DO NOT call `ensureGitignored()` (D-22 — `.handover/cache` already gitignored from Phase 31 D-10)
- DO NOT add an `instanceof class RoundCache`-style stateful wrapper — dep-graph is a module of free functions (planner picks; recommendation in RESEARCH §"Module Placement Decision")
- DO use Zod `safeParse` (project pattern) instead of an explicit `entry.version !== CACHE_VERSION` check — one boundary, covers version + shape + corruption
- DO NOT introduce a `migrationHandled` / `.clear()` mechanism — single JSON file overwrites cleanly on the next full run
- Schema field name: store as `graphVersion` (not `version`) to align with D-05 sketch and avoid collision with `RoundCacheEntry.version`

---

### `src/regen/dep-graph.test.ts` (NEW — unit tests)

**Primary analog:** `src/cache/git-fingerprint.test.ts:1-120` — `vi.hoisted` mock for the externalized I/O dep (there: `simple-git`; here: `fast-glob`), `beforeEach` with `vi.clearAllMocks()`, structured `describe` blocks per public function.
**Secondary analog:** `src/cli/init-detectors.test.ts:1-30` — `memfs` setup for fs isolation; `vol.reset()` in `beforeEach`.

**Vi.hoisted mock pattern** (mirror `git-fingerprint.test.ts:5-13`):

```typescript
// SOURCE: src/cache/git-fingerprint.test.ts:5-13
const mockSimpleGit = vi.hoisted(() => vi.fn());

vi.mock('simple-git', async () => {
  const actual = await vi.importActual<typeof import('simple-git')>('simple-git');
  return {
    ...actual,
    simpleGit: mockSimpleGit,
  };
});
```

**ADAPT FOR PHASE 32:**

```typescript
// dep-graph.test.ts
const mockFg = vi.hoisted(() => vi.fn());

vi.mock('fast-glob', async () => {
  const actual = await vi.importActual<typeof import('fast-glob')>('fast-glob');
  return {
    ...actual,
    default: mockFg,
  };
});
```

**Memfs reset pattern** (mirror `init-detectors.test.ts:1-37`):

```typescript
// SOURCE: src/cli/init-detectors.test.ts:1-12, 36
import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

// ...
beforeEach(() => {
  vol.reset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
```

**Describe block pattern** (mirror `git-fingerprint.test.ts:69-92`):

```typescript
// SOURCE: src/cache/git-fingerprint.test.ts:69-92
describe('getGitChangedFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns committed + uncommitted + untracked changes', async () => {
    const git = makeGitMock({
      status: vi.fn(async () =>
        makeStatus({
          modified: ['c.ts'],
          not_added: ['d.ts'],
        }),
      ),
      diffSummary: vi.fn(async () => makeDiff(['a.ts', 'b.ts'])),
    });
    mockSimpleGit.mockReturnValue(git);

    const result = await getGitChangedFiles('/repo', 'HEAD~1');

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect([...result.changedFiles].sort()).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
    expect(git.status).toHaveBeenCalledTimes(1);
  });
});
```

**ADAPT FOR PHASE 32:** Each describe targets one public function: `describe('buildDepGraph')`, `describe('saveDepGraph')`, `describe('loadDepGraph')`, `describe('filterRenderersByChangedFiles')`, `describe('formatDryRun')`, `describe('formatDryRunJson')`. Per SC-1..SC-5 in RESEARCH §"Test Plan Per Success Criterion".

**What to copy:**
- `vi.hoisted` + factory mock for `fast-glob` (literally the `simple-git` pattern, swap the module name)
- `beforeEach(() => { vi.clearAllMocks(); })` at the top of each describe
- The `makeXxx()` helper functions (e.g. `makeFixtureGraph(...)` returning a deterministic `DepGraph`) — pattern matches `makeStatus`, `makeDiff`, `makeGitMock` in `git-fingerprint.test.ts:23-67`
- Tight assertion style: `expect([...set].sort()).toEqual([...])` — copy verbatim

**What to change:**
- Mock target is `fast-glob` default export (not `simple-git` named export); see RESEARCH §"Common Pitfalls" Pitfall 6 for path normalization caveats
- Add memfs `vol.fromJSON({ '/proj/.handover/cache/dep-graph.json': '...' })` fixtures for `loadDepGraph` cases
- Snapshot tests for `formatDryRun` text + `formatDryRunJson` (D-15, D-16 — Phase 36 contract)

---

### `tests/integration/dry-run.test.ts` (NEW — integration test)

**Primary analog:** `tests/integration/edge-cases.test.ts:1-90` — uses `createFixtureScope` + `runCLI` helpers from `tests/integration/setup.ts` to spawn the built CLI against a synthetic fixture.

**Test scaffold pattern** (mirror `edge-cases.test.ts:13-54`):

```typescript
// SOURCE: tests/integration/edge-cases.test.ts:13-54
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFixtureScope, runCLI } from './setup.js';

const scope = createFixtureScope();

afterAll(() => {
  scope.cleanup();
});

describe('empty repository', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = scope.createFixture(`empty-repo-${Date.now()}`, {
      'README.md': '# Empty Project\n\nThis repo has no source code.',
    });
  });

  it('does not crash', () => {
    const result = runCLI(fixtureDir, ['generate', '--static-only']);
    expect(result.exitCode).toBe(0);
  });
});
```

**`runCLI` helper** (`tests/integration/setup.ts:111-142`): spawns the built CLI as a subprocess via `execFileSync(process.execPath, [CLI_PATH, ...args], { cwd, env: { NO_COLOR: '1', ... } })`. Returns `{ stdout, stderr, exitCode }`. Already supports custom env / timeout.

**ADAPT FOR PHASE 32 — SC-2 dry-run zero-LLM assertion:**

```typescript
describe('--dry-run zero LLM calls', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = scope.createFixture(`dry-run-${Date.now()}`, {
      'src/main.ts': 'export function main() { return 42; }',
      // ... minimal fixture sufficient to load config
    });
  });

  it('exits 0 with zero LLM calls and zero docs written', () => {
    // No provider env vars set → if --dry-run reaches auth/provider init, CLI errors.
    // Reaching exit 0 IS the zero-LLM-calls assertion.
    const result = runCLI(fixtureDir, ['generate', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Would execute');
    expect(result.stdout).toContain('Would skip');
    expect(result.stdout).toContain('Zero LLM calls made');

    // No markdown output written
    expect(existsSync(join(fixtureDir, 'handover', '00-INDEX.md'))).toBe(false);

    // No cache files written for rounds
    expect(existsSync(join(fixtureDir, '.handover', 'cache', 'rounds'))).toBe(false);
  });

  it('--dry-run --json emits formatVersion + wouldExecute', () => {
    const result = runCLI(fixtureDir, ['generate', '--dry-run', '--json']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.formatVersion).toBe(1);
    expect(parsed).toHaveProperty('wouldExecute');
    expect(parsed).toHaveProperty('wouldSkip');
    expect(parsed).toHaveProperty('fellBackToFullRegen');
  });
});
```

**What to copy:**
- Module-level `scope = createFixtureScope()` + `afterAll(() => scope.cleanup())` — verbatim
- `beforeEach` creating a tiny fixture with `Date.now()` suffix for uniqueness — verbatim
- `runCLI(fixtureDir, [args]).exitCode === 0` assertion shape — verbatim
- `NO_COLOR: '1'` env (from `setup.ts:117`) — comes for free via `runCLI`

**What to change:**
- Do NOT pass `--static-only` (that's edge-cases.test.ts's way to avoid LLM cost). `--dry-run` IS the new mechanism — assert it has the SAME effect without that flag.
- Add the SC-2 assertion that **no `.handover/cache/rounds/*.json` files were created** (proves no rounds executed → no LLM calls).

**Note:** Tests under `tests/integration/` require `npm run build` first — they run the built `dist/index.js` per `setup.ts:19`.

---

### `src/renderers/types.ts` (MOD — interface extension)

**Analog:** Self. The existing `DocumentSpec` (lines 43-51) and `DocumentStatus` (lines 58-64) are the templates.

**Current shape** (lines 43-64):

```typescript
// CURRENT: src/renderers/types.ts:43-51
export interface DocumentSpec {
  id: string;
  filename: string;
  title: string;
  category: string;
  aliases: string[];
  requiredRounds: number[];
  render: (ctx: RenderContext) => string;
}

// CURRENT: src/renderers/types.ts:58-64
export interface DocumentStatus {
  id: string;
  filename: string;
  title: string;
  status: 'complete' | 'partial' | 'static-only' | 'not-generated';
  reason?: string;
}
```

**Changes (D-02, D-09 + RESEARCH §"Last-run timestamp for `'reused'`"):**

```typescript
// ADD `requiredSources` field to DocumentSpec — paired with requiredRounds:
export interface DocumentSpec {
  id: string;
  filename: string;
  title: string;
  category: string;
  aliases: string[];
  requiredRounds: number[];
  requiredSources: string[];          // NEW — curated fast-glob patterns (D-02)
  render: (ctx: RenderContext) => string;
}

// EXTEND DocumentStatus.status union + add optional lastRenderedAt:
export interface DocumentStatus {
  id: string;
  filename: string;
  title: string;
  status: 'complete' | 'partial' | 'static-only' | 'not-generated' | 'reused';  // ADD 'reused'
  reason?: string;
  lastRenderedAt?: string;            // NEW — ISO 8601, only set for 'reused' (RESEARCH note)
}
```

**Correction note (from RESEARCH):** CONTEXT D-09 referred to `'full'` and `'partial'` in the existing union. The actual current union is `'complete' | 'partial' | 'static-only' | 'not-generated'` — there is no `'full'`. Plan must extend the actual union, adding only `'reused'`.

**Coverage note (RESEARCH §"Wire-In Points"):** `src/renderers/types.ts` is excluded from coverage — no test pressure on this edit. Correctness is enforced by callers' compilation (TypeScript).

---

### `src/renderers/registry.ts` (MOD — populate `requiredSources` for 14 entries + helper)

**Analog:** Self. Existing 14 `DocumentSpec` entries (lines 28-158) — each already has `requiredRounds`. Add `requiredSources` adjacent.

**Current entry shape** (lines 60-67 — the `03-architecture` entry is a representative example):

```typescript
// CURRENT: src/renderers/registry.ts:60-67
{
  id: '03-architecture',
  filename: '03-ARCHITECTURE.md',
  title: '03 - Architecture',
  category: 'architecture',
  aliases: ['arch', 'architecture'],
  requiredRounds: [1, 2, 3, 4],
  render: renderArchitecture,
},
```

**Changes — new helper at top of file (D-10 self-reference):**

```typescript
// NEW: place near top of src/renderers/registry.ts, above DOCUMENT_REGISTRY
/**
 * Prepend a renderer's own source path to its source globs.
 * Per D-10: changes to renderer source itself must re-trigger that renderer.
 */
const withSelfRef = (rendererPath: string, otherSources: string[]): string[] =>
  [rendererPath, ...otherSources];
```

**Changes — add `requiredSources` to each of the 14 entries:**

```typescript
// EXAMPLE (apply pattern to all 14):
{
  id: '03-architecture',
  filename: '03-ARCHITECTURE.md',
  title: '03 - Architecture',
  category: 'architecture',
  aliases: ['arch', 'architecture'],
  requiredRounds: [1, 2, 3, 4],
  requiredSources: withSelfRef('src/renderers/render-03-architecture.ts', [
    'src/orchestrator/**',
    'src/ai-rounds/runner.ts',
    'src/ai-rounds/round-4-architecture.ts',
  ]),
  render: renderArchitecture,
},
```

**Renderer file mapping (verified — `ls src/renderers/`):**

| Registry `id` | Renderer source file path (use in `withSelfRef`) |
|---------------|--------------------------------------------------|
| `00-index` | `src/renderers/render-00-index.ts` |
| `01-project-overview` | `src/renderers/render-01-overview.ts` |
| `02-getting-started` | `src/renderers/render-02-getting-started.ts` |
| `03-architecture` | `src/renderers/render-03-architecture.ts` |
| `04-file-structure` | `src/renderers/render-04-file-structure.ts` |
| `05-features` | `src/renderers/render-05-features.ts` |
| `06-modules` | `src/renderers/render-06-modules.ts` |
| `07-dependencies` | `src/renderers/render-07-dependencies.ts` |
| `08-environment` | `src/renderers/render-08-environment.ts` |
| `09-edge-cases` | `src/renderers/render-09-edge-cases.ts` |
| `10-tech-debt` | `src/renderers/render-10-tech-debt.ts` |
| `11-conventions` | `src/renderers/render-11-conventions.ts` |
| `12-testing` | `src/renderers/render-12-testing.ts` |
| `13-deployment` | `src/renderers/render-13-deployment.ts` |

Note: `id` does NOT equal `filename minus "render-"-prefix` (e.g. `01-project-overview` → `render-01-overview.ts` — not `render-01-project-overview.ts`). RESEARCH §"Pattern 3" explicitly rejects auto-derivation for this reason. Each registry entry must pass its own renderer path string to `withSelfRef`.

**What to copy:**
- Adjacency of `requiredSources` after `requiredRounds` (visual pairing — D-02)
- Conservative glob lists (RESEARCH §"INFRASTRUCTURE_PATHS application" — better to under-exclude than over-exclude)
- INDEX entry (`00-index`): `requiredSources: []` (INDEX always renders, value is informational — RESEARCH "Wire-In Points" line 578)

**What to change:**
- Each entry's source globs must be curated by hand against the renderer's actual read sites (`grep` the renderer source for `ctx.rounds.rN` and `ctx.staticAnalysis.xxx`, then map to the round-source and analyzer-source files)

**Coverage:** `src/renderers/registry.ts` IS measured (per RESEARCH §"Coverage exclusions"). The existing `src/renderers/registry.test.ts` covers `resolveSelectedDocs` + `computeRequiredRounds`. Add: `withSelfRef` pure-function unit test there (RESEARCH §"Additional unit tests needed").

---

### `src/renderers/render-00-index.ts` (MOD — handle `'reused'` status)

**Analog:** Self. The existing `statusLabel` switch (lines 56-67).

**Current pattern** (lines 56-67):

```typescript
// SOURCE: src/renderers/render-00-index.ts:56-67
const statusLabel = (s: DocumentStatus['status']): string => {
  switch (s) {
    case 'complete':
      return 'Complete';
    case 'partial':
      return 'Partial (static analysis only)';
    case 'static-only':
      return 'Static Only';
    case 'not-generated':
      return 'Not Generated';
  }
};
```

**Changes — add the `'reused'` case (D-09):**

```typescript
// ADD a 5th case. Per RESEARCH §"Last-run timestamp" the label may include
// the file mtime (passed via DocumentStatus.lastRenderedAt).
const statusLabel = (s: DocumentStatus): string => {                          // CHANGED: take full status, not just .status
  switch (s.status) {
    case 'complete':
      return 'Complete';
    case 'partial':
      return 'Partial (static analysis only)';
    case 'static-only':
      return 'Static Only';
    case 'not-generated':
      return 'Not Generated';
    case 'reused':                                                            // NEW
      return s.lastRenderedAt
        ? `Reused (last: ${s.lastRenderedAt})`
        : 'Reused';
  }
};
```

**Adjust call site at line 69-73** (the row builder must now pass the whole status object, not just `s.status`):

```typescript
// CURRENT: src/renderers/render-00-index.ts:69-73
const rows = statuses.map((s, i) => {
  const num = String(i).padStart(2, '0');
  const docLink = s.status !== 'not-generated' ? `[${s.title}](${s.filename})` : s.title;
  return [num, docLink, statusLabel(s.status)];                               // CHANGE to: statusLabel(s)
});
```

**What to copy:**
- `switch` exhaustiveness style — TS will flag missing cases at build time
- The `Documents` table layout (lines 53-75) — unchanged; just one new label

**What to change:**
- `statusLabel` signature: take the full `DocumentStatus` (not just `.status`) so the function can read `.lastRenderedAt` for `'reused'`
- Update the call site one line below to pass `s` instead of `s.status`

**Coverage:** `src/renderers/render-*.ts` excluded from coverage. No test pressure on this edit; correctness via TS exhaustiveness check and the integration tests for `--since` runs.

---

### `src/cli/index.ts` (MOD — register `--dry-run` and `--json`)

**Analog:** Self. The existing `generate` subcommand options block (lines 25-40), specifically the `--since` registration at lines 34-37.

**Current `--since` registration** (lines 25-40):

```typescript
// SOURCE: src/cli/index.ts:25-40
program
  .command('generate')
  .description('Analyze codebase and generate documentation')
  .option('--provider <provider>', 'LLM provider override')
  .option('--model <model>', 'Model override')
  .option('--only <docs>', 'Generate specific documents (comma-separated)')
  .option('--audience <mode>', 'Audience mode: human (default) or ai')
  .option('--static-only', 'Run static analysis only (no AI cost)')
  .option('--no-cache', 'Discard cached results and run all rounds fresh')
  .option(
    '--since <ref>',
    'Only re-analyze files changed since this git ref (e.g. HEAD~3, main, v1.0)',
  )
  .option('--stream', 'Show streaming token output during AI rounds')
  .option('-v, --verbose', 'Show detailed output')
  .action(runGenerate);
```

**Changes — add two new options between `--since` and `--stream` (D-21 + RESEARCH "Wire-In Points" line 568):**

```typescript
// ADD inside the same .option() chain:
.option('--dry-run', 'Preview which renderers would execute; no LLM calls')
.option('--json', 'Emit JSON output (used with --dry-run)')
```

**What to copy:**
- `.option()` chain syntax — verbatim
- Boolean-flag form (no `<arg>`) — same as `--static-only`, `--stream`
- Order of declarations (alphabetic-ish under their visual group) — no Commander semantics depend on order

**What to change:**
- Nothing else in `src/cli/index.ts`. The Commander pattern handles parsing automatically; the new options surface as `options.dryRun` and `options.json` in `runGenerate`.

**Conflict note:** The `analyze` subcommand (line 45) already has `--json`. Commander allows the same option name on different subcommands — no collision. The default `program.action(runGenerate)` at lines 143-148 does NOT include `--dry-run`; only `handover generate --dry-run` activates the new flow. Per CONTEXT, this is intended (the default action is a thin shim).

**Coverage:** `src/cli/index.ts` excluded from coverage — no unit-test pressure. Behavior verified by `tests/integration/dry-run.test.ts`.

---

### `src/cli/generate.ts` (MOD — 5 wire-in edits)

**Analog:** Self. Five distinct wire-in sites identified by RESEARCH "Wire-In Points" table. Each is a small, localized insertion next to existing code.

#### Edit 1 — `GenerateOptions` interface extension (line 55-65)

**Current:**

```typescript
// SOURCE: src/cli/generate.ts:55-65
export interface GenerateOptions {
  provider?: string;
  model?: string;
  only?: string;
  audience?: string;
  staticOnly?: boolean;
  verbose?: boolean;
  cache?: boolean;
  stream?: boolean;
  since?: string;
}
```

**Change — add two fields:**

```typescript
export interface GenerateOptions {
  // ... existing ...
  since?: string;
  dryRun?: boolean;                  // NEW (Commander auto-camelCase from --dry-run)
  json?: boolean;                    // NEW
}
```

#### Edit 2 — Dry-run early exit (near line 108-122, top of `runGenerate`)

**Current pattern** — the function opens with verbose-flag handling and first-run onboarding:

```typescript
// SOURCE: src/cli/generate.ts:108-122
export async function runGenerate(options: GenerateOptions): Promise<void> {
  const renderer = createRenderer();

  try {
    // Set verbosity
    if (options.verbose) {
      logger.setVerbose(true);
    }

    // First-run onboarding: run before loading config so newly created
    // .handover.yml is picked up in the same generate invocation.
    if (!isCI() && isTTY(process.stdout) && isFirstRun()) {
      const shouldContinue = await runOnboarding();
      if (!shouldContinue) return;
    }

    // Load config with CLI overrides
```

**Change — insert dry-run branch BEFORE onboarding/config load** (to guarantee zero LLM calls — RESEARCH SC-2):

```typescript
if (options.verbose) {
  logger.setVerbose(true);
}

// --dry-run: preview which renderers would execute, then exit. No LLM calls.
if (options.dryRun) {
  await runDryRun(process.cwd(), options);                       // helper from src/regen/dep-graph.ts
  return;
}

// First-run onboarding: ...
```

**Note:** `runDryRun` is a new public function in `src/regen/dep-graph.ts` that composes `loadDepGraph` + (optional) `getGitChangedFiles` + `computeDryRunDecision` + `formatDryRun`/`formatDryRunJson`, writes to `process.stdout`, and returns. The early-return here is what makes SC-2 hold.

#### Edit 3 — `--since` dep-graph filter wire-in (line 514-530)

**Current:**

```typescript
// SOURCE: src/cli/generate.ts:514-530
if (options.since) {
  const gitResult = await getGitChangedFiles(rootDir, options.since);

  if (gitResult.kind === 'fallback') {
    process.stdout.write(`${gitResult.reason} — falling back to content-hash mode\n`);
  } else {
    if (gitResult.changedFiles.size === 0) {
      process.stdout.write(
        `No files changed since ${options.since} — nothing to regenerate\n`,
      );
      throw new EarlyExitNoChangesError();
    }

    gitChangedFiles = gitResult.changedFiles;
    isGitIncremental = true;
  }
}
```

**Change — after the gitResult `else` branch, load + filter the graph:**

```typescript
if (options.since) {
  const gitResult = await getGitChangedFiles(rootDir, options.since);

  if (gitResult.kind === 'fallback') {
    process.stdout.write(`${gitResult.reason} — falling back to content-hash mode\n`);
  } else {
    if (gitResult.changedFiles.size === 0) {
      process.stdout.write(
        `No files changed since ${options.since} — nothing to regenerate\n`,
      );
      throw new EarlyExitNoChangesError();
    }

    gitChangedFiles = gitResult.changedFiles;
    isGitIncremental = true;

    // NEW: consult dep-graph for surgical renderer filtering
    const graph = await loadDepGraph(rootDir);
    if (graph) {
      filterDecision = filterRenderersByChangedFiles(gitResult.changedFiles, graph);
    } else {
      // No graph (first run / stale / corrupt) → safe full regen (SC-5, D-04)
      filterDecision = null;
    }
  }
}
```

`filterDecision` is a new local declared near `gitChangedFiles` (around line 511) of type `FilterDecision | null`.

#### Edit 4 — Render-loop skip (lines 905-959)

**Current render loop:**

```typescript
// SOURCE: src/cli/generate.ts:905-917
const renderResults = await Promise.allSettled(
  docsToRender.map(async (doc) => {
    const docStart = Date.now();
    const content = doc.render(ctx);

    if (content === '') {
      return { doc, content: '', skipped: true, durationMs: Date.now() - docStart };
    }

    await writeFile(join(outputDir, doc.filename), content, 'utf-8');
    return { doc, content, skipped: false, durationMs: Date.now() - docStart };
  }),
);
```

**Change — short-circuit if dep-graph decision says skip:**

```typescript
const renderResults = await Promise.allSettled(
  docsToRender.map(async (doc) => {
    const docStart = Date.now();

    // NEW: dep-graph skip (D-09 — leave existing output in place)
    if (filterDecision && !filterDecision.fullRegen && !filterDecision.affected.has(doc.id)) {
      const stat = await fsStatSafe(join(outputDir, doc.filename));            // helper, mtime → ISO string
      return { doc, content: '', reused: true, lastRenderedAt: stat?.mtime.toISOString(), durationMs: 0 };
    }

    const content = doc.render(ctx);
    // ... existing rest unchanged ...
  }),
);
```

**Status assembly extension (lines 940-959)** — current handles `skipped` (AI-unavailable) and success; add a `reused` branch:

```typescript
// SOURCE: src/cli/generate.ts:940-959 (the if/else if/else chain)
} else if (result.value.skipped) {
  statuses.push({
    id: doc.id,
    filename: doc.filename,
    title: doc.title,
    status: 'not-generated',
    reason: 'Required AI analysis unavailable',
  });
  sequentialEstimateMs += result.value.durationMs;
} else {
  // success case ...
}
```

**Change — add a new `else if (result.value.reused)` branch BEFORE the success case:**

```typescript
} else if (result.value.reused) {                                              // NEW
  statuses.push({
    id: doc.id,
    filename: doc.filename,
    title: doc.title,
    status: 'reused',
    lastRenderedAt: result.value.lastRenderedAt,
  });
  sequentialEstimateMs += result.value.durationMs;
} else if (result.value.skipped) {
  // ... existing ...
} else {
  // ... existing ...
}
```

#### Edit 5 — Graph rebuild after full run (~line 1001, end of render step)

**Current return point:**

```typescript
// SOURCE: src/cli/generate.ts:998-1001
displayState.renderedDocs.push('00-INDEX.md');
renderer.onDocRendered(displayState);

return { generatedDocs: statuses, outputDir };
```

**Change — wrap a non-fatal save when this was NOT a `--since` run (D-06):**

```typescript
// NEW: rebuild and persist the graph after a successful full run (D-06)
if (!options.since) {
  try {
    const graph = await buildDepGraph(DOCUMENT_REGISTRY, rootDir);
    await saveDepGraph(rootDir, graph);
  } catch (err) {
    // Non-fatal — mirror RoundCache.ensureGitignored graceful-degradation
    // (src/cache/round-cache.ts:211-213). A failed graph write doesn't
    // break the generate run; next attempt will retry.
    if (options.verbose) {
      logger.warn(`Failed to persist dep-graph: ${(err as Error).message}`);
    }
  }
}

return { generatedDocs: statuses, outputDir };
```

**Pattern reference for the non-fatal-write convention** (mirror `round-cache.ts:211-213`):

```typescript
// SOURCE: src/cache/round-cache.ts:211-213
} catch {
  // Non-fatal — gitignore update failure should not block cache writes
}
```

**Coverage:** `src/cli/generate.ts` is excluded from coverage per RESEARCH §"Coverage exclusions". All five wire-in edits are validated by the integration test (`tests/integration/dry-run.test.ts`) and by indirect coverage of the helpers they call (`src/regen/dep-graph.ts`).

---

## Shared Patterns

### Graceful degradation — return `null`, never throw

**Source pattern:** `src/cache/round-cache.ts:96-122` — returns `null` on missing file, version mismatch, parse error, or corruption. Never throws to the caller.

```typescript
// SOURCE: src/cache/round-cache.ts:96-122 (consolidated)
if (!existsSync(filePath)) {
  return null;
}

try {
  const raw = await readFile(filePath, 'utf-8');
  // ... validate ...
  return validData;
} catch {
  return null;                       // corrupted file — treat as cache miss
}
```

**Apply to:** `loadDepGraph` in `src/regen/dep-graph.ts`. Also: the graph-save in `runGenerate` wraps in try/catch and logs only when `--verbose`. SC-3 and SC-5 both require this behavior — they assert "missing / stale graph → safe full regen, no error".

### Boundary validation with Zod `safeParse`

**Source pattern:** Project-wide convention (config loader, analyzer outputs, AI rounds). RESEARCH §"Established Patterns" — "Zod validation at boundaries".

```typescript
// PATTERN (project-wide):
const parsed = SomeSchema.safeParse(JSON.parse(raw));
if (!parsed.success) return null;       // covers version mismatch + shape + corruption in one branch
return parsed.data;
```

**Apply to:** `loadDepGraph`. Use `z.literal(GRAPH_VERSION)` on the `graphVersion` field so version mismatch surfaces via `safeParse.success === false` — no separate version check needed.

### Conservative ignore list for `fast-glob`

**Source pattern:** `src/analyzers/file-discovery.ts:12-23` — `ALWAYS_IGNORE` constant.

```typescript
// SOURCE: src/analyzers/file-discovery.ts:12-23
const ALWAYS_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/__pycache__/**',
  '**/target/**',
  '**/vendor/**',
  '**/.handover/**',
];
```

**Apply to:** `buildDepGraph` glob expansion call. Use a tighter subset per RESEARCH (only `**/node_modules/**`, `**/.git/**`, `**/dist/**`, `**/.handover/**`) — because renderer `requiredSources` globs are positive selectors aimed at `src/**`, they cannot accidentally match the wider directories.

### CWD/path-form alignment

**Source pattern:** `src/cache/git-fingerprint.test.ts:86-91` — canonical reference that `getGitChangedFiles` returns repo-relative forward-slash paths (`['a.ts', 'b.ts', 'c.ts', 'd.ts']`).

```typescript
// SOURCE: src/cache/git-fingerprint.test.ts:86-91
const result = await getGitChangedFiles('/repo', 'HEAD~1');
expect(result.kind).toBe('ok');
if (result.kind !== 'ok') return;
expect([...result.changedFiles].sort()).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
```

**Apply to:** `buildDepGraph` MUST pass `cwd: rootDir` to `fg` so both inputs to `Set.has()` (graph values + `changedFiles`) use the same repo-relative form. Documented as Pitfall 1 in RESEARCH §"Common Pitfalls".

### `vi.hoisted` mock factory for externalized deps

**Source pattern:** `src/cache/git-fingerprint.test.ts:5-13` — mocks `simple-git` with a hoisted factory so the mock is set up before the system-under-test imports the real module.

```typescript
// SOURCE: src/cache/git-fingerprint.test.ts:5-13
const mockSimpleGit = vi.hoisted(() => vi.fn());

vi.mock('simple-git', async () => {
  const actual = await vi.importActual<typeof import('simple-git')>('simple-git');
  return {
    ...actual,
    simpleGit: mockSimpleGit,
  };
});
```

**Apply to:** `src/regen/dep-graph.test.ts` for mocking `fast-glob` (default export). Tests can then inject canned match results per fixture.

### memfs for filesystem-isolated unit tests

**Source pattern:** `src/cli/init-detectors.test.ts:1-12, 36` — mock `node:fs/promises` and `node:fs` with memfs's `fs.promises` and `fs`; `vol.reset()` in `beforeEach`.

```typescript
// SOURCE: src/cli/init-detectors.test.ts:1-12
import { vol } from 'memfs';
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});
vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

// in beforeEach: vol.reset();
```

**Apply to:** `src/regen/dep-graph.test.ts` for `loadDepGraph` / `saveDepGraph` roundtrip tests. memfs `vol.fromJSON({...})` seeds fixture states (missing file, valid v1, version-0 stale, corrupted-JSON).

### Integration test harness — `createFixtureScope` + `runCLI`

**Source pattern:** `tests/integration/setup.ts:30-66` (the scope) + `setup.ts:111-142` (the runner). Already used by `edge-cases.test.ts`, `generate.test.ts`, `monorepo.test.ts`.

**Apply to:** `tests/integration/dry-run.test.ts`. The harness gives a temp fixture dir + subprocess CLI invocation with `NO_COLOR=1` env. No new harness work needed.

---

## No Analog Found

None. Every file in this phase has a strong analog (mostly self-analogs for in-place modifications, plus `round-cache.ts` / `file-discovery.ts` / `git-fingerprint.test.ts` / `init-detectors.test.ts` / `edge-cases.test.ts` for the new files). The planner can rely on direct pattern copy with the noted adaptations.

---

## Metadata

**Analog search scope:** `src/cache/`, `src/analyzers/`, `src/renderers/`, `src/cli/`, `tests/integration/`
**Files scanned (read):** `src/cache/round-cache.ts`, `src/analyzers/file-discovery.ts`, `src/renderers/types.ts`, `src/renderers/registry.ts`, `src/renderers/render-00-index.ts`, `src/cli/index.ts`, `src/cli/generate.ts` (3 ranges: 1-130, 490-619, 800-1019), `src/cache/git-fingerprint.test.ts` (1-120), `src/cli/init-detectors.test.ts` (1-180), `tests/integration/setup.ts`, `tests/integration/edge-cases.test.ts` (1-90)
**Files scanned (ls only — confirmation):** `src/renderers/render-*.ts` (14 entries), `src/cache/` (3 entries — no `round-cache.test.ts`)
**Pattern extraction date:** 2026-05-13
**Coverage policy referenced:** `vitest.config.ts` exclusions confirmed via RESEARCH §"Coverage exclusions" — `src/regen/dep-graph.ts` IS measured (90/90/85/90 thresholds apply); all CLI/render/types wire-in edits are excluded

## PATTERN MAPPING COMPLETE
