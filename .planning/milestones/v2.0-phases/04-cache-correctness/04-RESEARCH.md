# Phase 4: Cache Correctness - Research

**Researched:** 2026-02-18
**Domain:** Cache invalidation, content hashing, cascade invalidation, CLI UX
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- `--no-cache` flag: skips reading cache but does NOT delete it; cache files are preserved on disk; next normal run reads them
- Warn and clear on version mismatch: show "Cache format updated, rebuilding..." then clear old cache
- No cache version metadata — this is a one-time migration, handle future changes when they come
- Auto-add cache directory to .gitignore if not already present
- Per-round cache status shown inline: "Round 1: cached" or "Round 3: re-running..."
- Cached rounds visually distinct — dimmed or abbreviated compared to active rounds
- When ALL rounds are cached (unchanged repo), skip round-by-round display entirely — show instant summary like "All 6 rounds cached" and go straight to output
- Verbose mode (-v) shows detailed cache info: which files changed, which rounds they invalidated

### Claude's Discretion

- Fingerprint algorithm choice (SHA-256 vs mtime+size vs hybrid)
- File scope for fingerprinting
- Speed vs correctness tradeoff on large repos
- Whether to bundle config-hash invalidation (CACHE-03) into this phase
- Cascade invalidation approach (clear-downstream vs hash-chain)
- Cascade granularity
- Cache storage location

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Summary

Phase 4 fixes two distinct correctness holes in the existing `RoundCache` class and the `wrapWithCache` function in `generate.ts`. The first hole is in `computeAnalysisFingerprint`: it hashes only `path:size` pairs, so a file edit that does not change file size (e.g., changing `true` to `false`) produces an identical fingerprint, and the cached round is incorrectly served. The fix is to hash actual file content (SHA-256) for the files included in the analysis pass.

The second hole is the absence of cascade invalidation. Each round's cache key currently includes `roundNumber + model + analysisFingerprint`. If Round 1 re-runs and produces different output, Rounds 2-6 still serve their stale cached results that were built from the old Round 1 context. The fix is to include the prior round's output hash in each round's cache key, forming a hash chain: Round N invalidates automatically when Round N-1 output changes.

Both fixes are fully contained within two files (`src/cache/round-cache.ts` and `src/cli/generate.ts`) with supporting changes to UI display logic. No new dependencies are required — `node:crypto` is already imported and the SHA-256 primitive is already in use.

**Primary recommendation:** Use SHA-256 content hashing for CACHE-01 (correctness beats speed for this tool's usage pattern), and include the prior-round output hash in each round's key for CACHE-02 (hash-chain-per-round, not clear-all-downstream). Wire both changes through the existing `wrapWithCache` function in `generate.ts`.

---

## Standard Stack

### Core

| Library            | Version       | Purpose         | Why Standard                                                   |
| ------------------ | ------------- | --------------- | -------------------------------------------------------------- |
| `node:crypto`      | Node built-in | SHA-256 hashing | Already imported in both cache files; no additional dependency |
| `node:fs/promises` | Node built-in | Async file I/O  | Already used throughout codebase for cache read/write          |
| `node:path`        | Node built-in | Path joining    | Already used in `RoundCache`                                   |

### Supporting

| Library          | Version       | Purpose                 | When to Use                                                                   |
| ---------------- | ------------- | ----------------------- | ----------------------------------------------------------------------------- |
| `node:fs` (sync) | Node built-in | `existsSync` guard      | Used in `RoundCache.get()` and `RoundCache.clear()` — keep pattern consistent |
| `ignore`         | 7.0.5         | .gitignore manipulation | Already in dependencies; needed for auto-gitignore feature                    |

### Alternatives Considered

| Instead of           | Could Use            | Tradeoff                                                                                                                                                                                                               |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SHA-256 content hash | mtime+size           | mtime is unreliable: git checkouts reset mtime; NFS/network filesystems may have coarse mtime resolution. Size-only is the current broken approach. SHA-256 is the only reliable option.                               |
| SHA-256 content hash | xxhash / blake3      | Faster hashing but require new npm dependencies not already in project. SHA-256 via `node:crypto` is free, fast enough (sub-second for typical repos), and already used.                                               |
| Hash chain per round | Clear-all-downstream | Clear-all-downstream is simpler but over-invalidates: changing one file clears all cached rounds even if upstream rounds happen to produce the same output. Hash-chain is more precise and enables partial cache hits. |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes needed. All modifications target existing files:

```
src/
├── cache/
│   └── round-cache.ts      # CHANGE: computeAnalysisFingerprint + computeHash
├── cli/
│   └── generate.ts         # CHANGE: wrapWithCache, --no-cache behavior, UI display
└── ui/
    ├── types.ts             # CHANGE: add allCached field to DisplayState (optional)
    └── components.ts        # CHANGE: renderRoundBlock for instant-summary path
```

### Pattern 1: Content-Hash Fingerprint (CACHE-01)

**What:** Replace `path:size` pairs with `path:sha256(content)` pairs in `computeAnalysisFingerprint`.

**When to use:** Always — this is the only correct approach for detecting edits that don't change file size.

**Current broken implementation:**

```typescript
// src/cache/round-cache.ts — CURRENT (broken)
static computeAnalysisFingerprint(files: Array<{ path: string; size: number }>): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const data = sorted.map((f) => `${f.path}:${f.size}`).join('\n');
  return createHash('sha256').update(data).digest('hex');
}
```

**Fixed implementation (signature change required):**

```typescript
// src/cache/round-cache.ts — FIXED
static computeAnalysisFingerprint(
  files: Array<{ path: string; contentHash: string }>
): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const data = sorted.map((f) => `${f.path}:${f.contentHash}`).join('\n');
  return createHash('sha256').update(data).digest('hex');
}

// Helper: hash file content (can be reused from analyzers/cache.ts)
export async function hashFileContent(absolutePath: string): Promise<string> {
  const content = await readFile(absolutePath);
  return createHash('sha256').update(content).digest('hex');
}
```

**Call site change in `generate.ts`** (inside the `static-analysis` step `execute`):

```typescript
// BEFORE (broken — size only)
const fileEntries = result.fileTree.directoryTree
  .filter((e) => e.type === 'file')
  .map((f) => ({ path: f.path, size: f.size ?? 0 }));
analysisFingerprint = RoundCache.computeAnalysisFingerprint(fileEntries);

// AFTER (correct — content hash)
// Read and hash each file concurrently (bounded concurrency to avoid fd exhaustion)
const discovered = result.fileTree.directoryTree.filter((e) => e.type === 'file');
const fileEntries = await Promise.all(
  discovered.map(async (f) => ({
    path: f.path,
    contentHash: await hashFileContent(join(rootDir, f.path)),
  })),
);
analysisFingerprint = RoundCache.computeAnalysisFingerprint(fileEntries);
```

**File scope decision:** Hash only the files already in `result.fileTree.directoryTree` (the same set the analysis uses). Do NOT hash all files in the repo — this would include build artifacts, node_modules entries that slipped through, etc. The analysis fingerprint should reflect exactly the files that feed into the AI rounds.

**Performance note:** For a 200-file TypeScript repo, reading and hashing all files takes ~50-200ms total. This is acceptable. For very large repos (>5,000 files), consider batching with `p-limit` — but `p-limit` is not in the dependency set, so a manual semaphore or chunked `Promise.all` would be needed. However, typical repos analyzed by this tool are small-to-medium, and `Promise.all` parallelism is bounded by Node.js's internal I/O scheduling. Do NOT add `p-limit` as a dependency just for this.

### Pattern 2: Cascade Invalidation via Hash Chain (CACHE-02)

**What:** Include the output hash of the prior round in each round's cache key.

**When to use:** For rounds 2-6. Round 1 only depends on `analysisFingerprint`. Rounds 2-6 depend on the round(s) they consume as context.

**Current broken hash computation:**

```typescript
// src/cache/round-cache.ts — CURRENT (no cascade)
computeHash(roundNumber: number, model: string, analysisFingerprint: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ roundNumber, model, analysisFingerprint }))
    .digest('hex');
}
```

**Fixed hash computation:**

```typescript
// src/cache/round-cache.ts — FIXED (with cascade)
computeHash(
  roundNumber: number,
  model: string,
  analysisFingerprint: string,
  priorRoundHashes: string[] = []  // empty for Round 1
): string {
  return createHash('sha256')
    .update(JSON.stringify({ roundNumber, model, analysisFingerprint, priorRoundHashes }))
    .digest('hex');
}

// Helper: compute hash of a stored round's output for cascade
static computeResultHash(result: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(result))
    .digest('hex');
}
```

**Call site change in `generate.ts`** (inside `wrapWithCache`):

```typescript
const wrapWithCache = (
  roundNum: number,
  step: StepDefinition,
  priorRoundNums: number[], // e.g., [1] for Round 2, [1,2] for Round 3
): StepDefinition => {
  const originalExecute = step.execute;
  return createStep({
    id: step.id,
    name: step.name,
    deps: [...step.deps],
    execute: async (context) => {
      if (isEmptyRepo) return null;

      const modelName = config.model ?? preset?.defaultModel ?? 'default';

      // Build prior round hashes for cascade invalidation
      const priorHashes = priorRoundNums.map((n) => {
        const prior = roundResults.get(n);
        if (!prior) return '';
        return RoundCache.computeResultHash(prior);
      });

      const hash = roundCache.computeHash(roundNum, modelName, analysisFingerprint, priorHashes);
      const cached = await roundCache.get(roundNum, hash);
      if (cached) {
        // ... display cached status ...
        roundResults.set(roundNum, cached as RoundExecutionResult<unknown>);
        return cached;
      }

      const result = await originalExecute(context);
      if (result) {
        await roundCache.set(roundNum, hash, result, modelName);
      }
      return result;
    },
  });
};
```

**Cascade dependencies per round:**

- Round 1: no prior rounds → `priorRoundNums = []`
- Round 2: uses Round 1 output → `priorRoundNums = [1]`
- Round 3: uses Rounds 1+2 output → `priorRoundNums = [1, 2]`
- Round 4: uses Rounds 1+2+3 output → `priorRoundNums = [1, 2, 3]`
- Round 5: uses Rounds 1+2 output (per `generate.ts` round-5 setup) → `priorRoundNums = [1, 2]`
- Round 6: uses Rounds 1+2 output (per `generate.ts` round-6 setup) → `priorRoundNums = [1, 2]`

These dependencies come directly from how the rounds are currently wired in `generate.ts` (the `getRound()` calls inside each `createRoundNStep()` invocation).

### Pattern 3: `--no-cache` Behavioral Change

**What:** The current `--no-cache` behavior calls `roundCache.clear()` which DELETES cache files. The locked decision requires preserving cache files — `--no-cache` should only skip READING the cache.

**Current broken behavior:**

```typescript
// generate.ts — CURRENT (deletes cache)
if (options.cache === false) {
  await roundCache.clear();
}
```

**Fixed behavior:**

```typescript
// generate.ts — FIXED (preserves cache, skips reads)
// Pass skipRead flag to RoundCache; cache files remain on disk
const roundCache = new RoundCache(undefined, { skipRead: options.cache === false });
```

OR (simpler, no constructor change needed):

```typescript
// Alternatively: thread a boolean through wrapWithCache
const noCacheMode = options.cache === false;
// In wrapWithCache: skip the cache.get() call but still call cache.set() so
// the cache is updated after this clean run
if (!noCacheMode) {
  const cached = await roundCache.get(roundNum, hash);
  if (cached) { ... return cached; }
}
const result = await originalExecute(context);
if (result) {
  await roundCache.set(roundNum, hash, result, modelName);
}
```

The second approach (threading `noCacheMode` boolean) is simpler and avoids a constructor API change.

### Pattern 4: All-Rounds-Cached Fast Path

**What:** When ALL required rounds are served from cache, skip the round-by-round display and show a single summary line.

**Current behavior:** Each cached round appears in the rounds block as `✓ R1 Project Overview · cached`.

**Required behavior (locked decision):** When all rounds are cached, skip the round-by-round block entirely and show "All 6 rounds cached" then proceed to document rendering.

**Implementation approach:**

```typescript
// In generate.ts, after all rounds complete via wrapWithCache:
// Check if all rounds came from cache
const allCached = [...requiredRounds].every((n) => displayState.rounds.get(n)?.status === 'cached');

if (allCached) {
  // Emit a single summary line instead of the round block
  renderer.onAllRoundsCached(displayState);
} else {
  // Normal round-by-round display (existing behavior)
  renderer.onRoundsDone(displayState);
}
```

This requires adding `onAllRoundsCached` to the `Renderer` interface and implementing it in both `TerminalRenderer` and `CIRenderer`. Alternatively, detect the all-cached condition inside `onRoundsDone` using existing state — simpler, no interface change:

```typescript
// In TerminalRenderer.onRoundsDone():
const allCached = [...state.rounds.values()].every((r) => r.status === 'cached');
if (allCached) {
  const count = state.rounds.size;
  this.write([`  ${pc.dim(`All ${count} rounds cached`)}`]);
} else {
  this.write(this.buildRoundLines(state));
}
```

### Pattern 5: Version Mismatch Warning and Migration

**What:** On first run after this phase is deployed, existing cache entries have hashes computed using the old `path:size` fingerprint. The new code will compute different hashes (content-based) and simply miss the cache on every round — this is correct behavior (no false cache hits from old entries).

**Locked decision:** Warn and clear on version mismatch. One-time migration only.

**Implementation:** Add a `cacheVersion` field to the `RoundCacheEntry` interface. On `get()`, if the entry has no version or a different version, treat as stale and optionally log a warning on first mismatch detected.

```typescript
// Updated RoundCacheEntry
interface RoundCacheEntry {
  version: number; // Add: 2 for content-hash era
  hash: string;
  roundNumber: number;
  model: string;
  result: unknown;
  createdAt: string;
}

const CACHE_VERSION = 2;

// In get():
if (entry.version !== CACHE_VERSION) {
  // Version mismatch: old cache format — treat as miss (will be overwritten)
  return null;
}
```

For the "warn and clear" requirement: detect version mismatch on first round read, emit a single warning message ("Cache format updated, rebuilding..."), and clear the cache directory before continuing. This avoids multiple warnings per run.

```typescript
// In RoundCache: track whether we've already warned + cleared
private migrationHandled = false;

async get(roundNumber: number, expectedHash: string): Promise<unknown | null> {
  const filePath = join(this.cacheDir, `round-${roundNumber}.json`);
  if (!existsSync(filePath)) return null;

  try {
    const raw = await readFile(filePath, 'utf-8');
    const entry = JSON.parse(raw) as RoundCacheEntry;

    if (entry.version !== CACHE_VERSION) {
      if (!this.migrationHandled) {
        this.migrationHandled = true;
        // Clear stale cache (no await — fire and forget, or await if needed)
        await this.clear();
        // Caller should emit the warning message
        return { _migrationNeeded: true } as never;
      }
      return null;
    }

    if (entry.hash !== expectedHash) return null;
    return entry.result;
  } catch {
    return null;
  }
}
```

Simpler alternative: just return `null` for version mismatches and let the caller check `getCachedRounds()` before the first round — if there are cached rounds but they all miss, log the migration message once. The planner should decide which approach is cleaner.

### Pattern 6: Auto-.gitignore

**What:** Auto-add `.handover/cache` to `.gitignore` if not already present.

**When:** On first successful `roundCache.set()` call — this is the moment we know the cache directory is being used.

**Implementation:**

```typescript
// In RoundCache.set(), after writing the round file:
await this.ensureGitignored();

private async ensureGitignored(): Promise<void> {
  if (this._gitignoreChecked) return;
  this._gitignoreChecked = true;

  const gitignorePath = join(process.cwd(), '.gitignore');
  const cacheEntry = '.handover/cache';

  try {
    let content = '';
    if (existsSync(gitignorePath)) {
      content = await readFile(gitignorePath, 'utf-8');
    }

    const lines = content.split('\n');
    const alreadyIgnored = lines.some(
      (l) => l.trim() === cacheEntry || l.trim() === '.handover/'
    );

    if (!alreadyIgnored) {
      const addition = content.endsWith('\n') ? cacheEntry + '\n' : '\n' + cacheEntry + '\n';
      await writeFile(gitignorePath, content + addition);
    }
  } catch {
    // Non-fatal: if we can't write .gitignore, proceed silently
  }
}
```

Note: The `.handover/` directory is already excluded from `ALWAYS_IGNORE` in `file-discovery.ts`, so the cache directory does not recursively feed into fingerprint computation.

### Pattern 7: Verbose Mode Cache Debug Output

**What:** `-v` / `--verbose` flag should log which files changed and which rounds they invalidated.

**Implementation:** The fingerprint computation step already has access to both the old and new file hashes (old = currently cached entries, new = just computed). Verbose output can be emitted from `generate.ts` during the static-analysis step after fingerprint computation:

```typescript
if (options.verbose) {
  logger.info(`Analysis fingerprint: ${analysisFingerprint.substring(0, 12)}...`);
  // If we have a way to compare to the previous fingerprint stored on disk...
  // Store last fingerprint in a separate file: .handover/cache/.fingerprint
  // Read it, compare, log changed files
}
```

Alternatively, store the previous fingerprint alongside the cache and diff on each run. This is optional detail for planning — the core behavior is that verbose logs the fingerprint hash and each round's cache key.

### Anti-Patterns to Avoid

- **Hashing node_modules or dist/:** `file-discovery.ts` already excludes these via `ALWAYS_IGNORE`. The fingerprint should only cover `result.fileTree.directoryTree` entries (which are already filtered).
- **Deleting cache on `--no-cache`:** The locked decision is to PRESERVE cache files. The current implementation deletes them — this must be changed.
- **Per-file content reading in the fingerprint before file discovery completes:** The fingerprint must be computed AFTER static analysis finishes and `result.fileTree.directoryTree` is populated. The current placement in `generate.ts` is correct — the change is only in what we hash per file.
- **Hashing config fields in CACHE-01:** The context decisions defer config-hash invalidation (CACHE-03) as "Claude's discretion whether to bundle." The planner should keep this minimal: bundle only if the config hash implementation is trivial. The risk is over-invalidating when unrelated config fields (like `output`) change.
- **Not sorting files before hashing:** The fingerprint depends on deterministic ordering. The current `sort by path` is correct — preserve it.
- **Using `JSON.stringify` on result for cascade without a stable sort:** JavaScript object property order is stable for string keys in V8, but for objects parsed from JSON it reflects insertion order. `JSON.stringify(result)` on a round's output is deterministic enough for this use case — the result was itself parsed from a JSON API response.

---

## Don't Hand-Roll

| Problem                  | Don't Build             | Use Instead                               | Why                                                                                                                                        |
| ------------------------ | ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Content hashing          | Custom hash loop        | `createHash('sha256')` from `node:crypto` | Already imported; battle-tested; constant-time for a given input size                                                                      |
| .gitignore writing       | Custom file editor      | Simple string append (pattern 6 above)    | The `ignore` library only reads patterns, not writes them. Simple append is correct and safe.                                              |
| File reading for hashing | Streaming/chunked reads | `readFile` (buffer)                       | Files are already size-filtered to <2MB. Buffer reads are fine. No streaming needed.                                                       |
| Concurrency limiting     | Manual semaphore        | Unbounded `Promise.all` for now           | Typical repos have 100-500 files. Node.js I/O is well-behaved at this scale. Add `p-limit` only if performance profiling shows it matters. |

**Key insight:** The entire fingerprint and cascade implementation uses primitives already in the project. No new dependencies.

---

## Common Pitfalls

### Pitfall 1: Size-Only Fingerprint Still Present at Call Site

**What goes wrong:** The `computeAnalysisFingerprint` signature change requires updating the call site in `generate.ts`. If only the `round-cache.ts` function body is updated but the call site still passes `{ path, size }` objects, TypeScript will catch the type mismatch — but only if the type signature is tightened. If the old signature accepted `{ path: string; size: number }` and the new one accepts `{ path: string; contentHash: string }`, TypeScript will produce a compile error.

**Why it happens:** Two-file change with a shared interface boundary. Easy to update one side and forget the other.

**How to avoid:** Update the `Array<{ path: string; size: number }>` parameter type first, let TypeScript flag the call site.

**Warning signs:** `tsc --noEmit` passes but tests show cache hits on changed-content files.

### Pitfall 2: Cascade Hashes Computed Before Prior Rounds Complete

**What goes wrong:** In `wrapWithCache`, the `priorHashes` are built from `roundResults.get(n)`. If the DAG runs a downstream round before an upstream round has stored its result, `roundResults.get(n)` returns `undefined` and `priorHashes` contains empty strings. The cache key is wrong.

**Why it happens:** The DAG enforces ordering via `deps`, so this should be safe. But it's worth verifying that `roundResults.set(n, ...)` happens in `wrapWithCache` (cache hit path) AND in `orchestratorEvents.onStepComplete` (live execution path).

**How to avoid:** Verify both paths set `roundResults` before the downstream round's `wrapWithCache` execute function runs. The existing code already does this for the live path. For the cache hit path, `wrapWithCache` already calls `roundResults.set(roundNum, cached ...)` — this is correct.

**Warning signs:** Round 2 never gets a cache hit even when Round 1 output is identical.

### Pitfall 3: `--no-cache` Still Deleting Files

**What goes wrong:** The current implementation calls `roundCache.clear()` which calls `rm(cacheDir, { recursive: true })`. The locked decision is to preserve cache files.

**Why it happens:** The current implementation predates the context decisions.

**How to avoid:** Replace the `clear()` call for `--no-cache` with a `skipRead` flag or inline condition. The `clear()` method should still exist (and be available for the migration path), but should not be triggered by `--no-cache`.

**Warning signs:** After running with `--no-cache`, the `.handover/cache/rounds/` directory is absent instead of present.

### Pitfall 4: All-Rounds-Cached Detection Timing

**What goes wrong:** The "all rounds cached" check in `generate.ts` or the renderer needs to fire at the right moment — after all rounds have their status set in `displayState.rounds`, but before `onRoundsDone` triggers the display transition. If `onRoundsDone` is called before all cached rounds update their status, the check sees an incomplete picture.

**Why it happens:** The DAG runs steps concurrently where possible. Cached rounds update `displayState.rounds` inside `wrapWithCache.execute()` synchronously before returning. Since the DAG awaits each step, the status should be set before `onRoundsDone` is called (which is in the `render` step, which depends on all round steps). This is safe.

**How to avoid:** Place the all-cached check inside `onRoundsDone` or in the render step's execute, after the `renderer.onRoundsDone(displayState)` call. The renderer can inspect `displayState.rounds` at that point.

**Warning signs:** "All 6 rounds cached" message shown even when some rounds ran live, or not shown when all are truly cached.

### Pitfall 5: Fingerprint Covers Files Not Read During Hashing

**What goes wrong:** `result.fileTree.directoryTree` may include files that `readFile` cannot open (permissions issues, race conditions, symlinks). An unhandled rejection from `hashFileContent` would crash the fingerprint computation.

**Why it happens:** File discovery runs earlier than the fingerprint hash pass; file system state could change between the two.

**How to avoid:** Wrap each `hashFileContent` call in a try/catch and use the file size or empty string as a fallback hash for unreadable files. Log a warning in verbose mode.

### Pitfall 6: .gitignore Auto-Add Writes to Wrong Directory

**What goes wrong:** `process.cwd()` in `ensureGitignored()` returns the directory where `handover` was invoked, which should be the project root — but if the user invoked from a subdirectory, the `.gitignore` is in the project root, not the cwd.

**Why it happens:** The tool currently uses `resolve(process.cwd())` as `rootDir` throughout. The `.gitignore` auto-add should use the same `rootDir`.

**How to avoid:** Pass `rootDir` to the `RoundCache` constructor (or to a dedicated method). Do not rely on `process.cwd()` inside `RoundCache`.

---

## Code Examples

Verified patterns from the existing codebase:

### Existing SHA-256 Hash Pattern (from `src/analyzers/cache.ts`)

```typescript
// Source: src/analyzers/cache.ts — already established pattern
export function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
```

This function already exists in `analyzers/cache.ts`. The `RoundCache` in `cache/round-cache.ts` should either import and reuse it, or define a nearly identical helper. Reusing `hashContent` from `analyzers/cache.ts` is the preferred approach (DRY).

### Existing computeHash Pattern (from `src/cache/round-cache.ts`)

```typescript
// Source: src/cache/round-cache.ts lines 48-52
computeHash(roundNumber: number, model: string, analysisFingerprint: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ roundNumber, model, analysisFingerprint }))
    .digest('hex');
}
```

The cascade extension adds `priorRoundHashes: string[]` to the JSON object. Adding a new field to the serialized object changes the hash for all existing cache entries (which is intentional — it's the version migration).

### Existing Cache Hit Path (from `src/cli/generate.ts` lines 463-485)

```typescript
// Source: src/cli/generate.ts — wrapWithCache (current)
const hash = roundCache.computeHash(roundNum, modelName, analysisFingerprint);
const cached = await roundCache.get(roundNum, hash);
if (cached) {
  displayState.rounds.set(roundNum, {
    roundNumber: roundNum,
    name: roundName,
    status: 'cached',
    elapsedMs: 0,
  });
  renderer.onRoundUpdate(displayState);
  roundResults.set(roundNum, cached as RoundExecutionResult<unknown>);
  return cached;
}
```

This is the exact code that needs to receive the `priorHashes` argument.

### Existing RoundCacheEntry Shape (from `src/cache/round-cache.ts` lines 16-22)

```typescript
// Source: src/cache/round-cache.ts
interface RoundCacheEntry {
  hash: string;
  roundNumber: number;
  model: string;
  result: unknown;
  createdAt: string;
}
```

The migration path adds `version: number` to this interface.

---

## State of the Art

| Old Approach               | Current Approach                               | When Changed   | Impact                                                               |
| -------------------------- | ---------------------------------------------- | -------------- | -------------------------------------------------------------------- |
| No cache                   | `RoundCache` with `path:size` fingerprint      | Before Phase 4 | Crash recovery works; but correctness broken for same-size edits     |
| No cascade                 | Each round isolated                            | Before Phase 4 | Stale downstream rounds not invalidated when upstream output changes |
| `--no-cache` deletes cache | `--no-cache` preserves cache (locked decision) | Phase 4        | After this phase, `--no-cache` is non-destructive                    |

**Already implemented (no change needed):**

- `cached` status in `RoundDisplayState` — already exists in `src/ui/types.ts`
- Cached round display in `renderRoundBlock` — already renders `"R1 Overview · cached"` with dimmed text
- `RoundCache.computeHash` — existing method, just needs extension
- `RoundCache.get/set/clear` — all exist, only behavioral changes needed
- CIRenderer cached-round logging — already logs `[round-N] name cached`

**NOT yet implemented (requires this phase):**

- Content hash for fingerprint (CACHE-01)
- Prior-round hash in computeHash (CACHE-02)
- `--no-cache` preserve-not-delete behavior
- `version` field in `RoundCacheEntry`
- All-cached fast path ("All 6 rounds cached" summary)
- Verbose cache debug output
- Auto-.gitignore

---

## Open Questions

1. **Should `priorRoundHashes` cover all logically-prior rounds or only directly-consumed rounds?**
   - What we know: Rounds 5 and 6 consume only Rounds 1+2 context (not 3 or 4), per the `generate.ts` source. Including only the consumed rounds in `priorRoundHashes` means a Round 3 change does NOT invalidate Round 5's cache — which is technically correct given the current pipeline structure.
   - What's unclear: Is this the intended behavior? If Round 3 output changes, should Round 5 re-run?
   - Recommendation: Match the actual dependency graph (use only the rounds each step actually consumes). If the pipeline is later changed to add Round 3/4 context to Round 5/6, the `priorRoundNums` list will need updating. Document this assumption clearly in code comments.

2. **Does the fingerprint need to include config fields (CACHE-03 scope)?**
   - What we know: The context decisions mark config-hash invalidation as "Claude's discretion whether to bundle." The model name is already in the hash. Other fields like `audience` or `include/exclude` patterns affect the analysis but are not currently in the hash.
   - What's unclear: If the user changes `audience: human` to `audience: ai`, should the cache invalidate? Yes — but this is CACHE-03 scope.
   - Recommendation: Defer. Bundle only if it can be added with 5-10 lines to `computeHash`. Do not let CACHE-03 scope creep block CACHE-01 and CACHE-02 delivery.

3. **What is the correct `rootDir` to use in `ensureGitignored()`?**
   - What we know: `generate.ts` uses `resolve(process.cwd())` as `rootDir`. The `RoundCache` constructor currently takes only `cacheDir`.
   - Recommendation: Add an optional `projectRoot` parameter to `RoundCache` constructor, defaulting to `process.cwd()`. Pass `rootDir` from `generate.ts`.

---

## Sources

### Primary (HIGH confidence)

- Direct source reading of `src/cache/round-cache.ts` — current fingerprint algorithm, hash computation, clear behavior
- Direct source reading of `src/cli/generate.ts` — `wrapWithCache`, `--no-cache` handling, `analysisFingerprint` computation
- Direct source reading of `src/analyzers/cache.ts` — `hashContent` function, `AnalysisCache` pattern
- Direct source reading of `src/ui/types.ts`, `src/ui/components.ts`, `src/ui/renderer.ts` — cached status rendering
- Direct source reading of `src/analyzers/file-discovery.ts` — file filtering and `ALWAYS_IGNORE`
- Direct source reading of `.planning/codebase/TESTING.md` — test patterns and conventions

### Secondary (MEDIUM confidence)

- Node.js `crypto` module SHA-256 behavior is a stable Node.js built-in API; no version concerns
- `JSON.stringify` determinism for round output: JavaScript spec guarantees insertion-order key enumeration for string keys in V8; this is stable for objects produced by JSON parsing

### Tertiary (LOW confidence)

- Performance estimate for content hashing (50-200ms for 200 files): based on general Node.js I/O benchmarks, not profiled against this specific codebase

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all changes use built-in Node.js APIs already imported in the project
- Architecture: HIGH — based on direct source reading; no external dependencies involved
- Pitfalls: HIGH — identified from direct code analysis of the two-file change surface

**Research date:** 2026-02-18
**Valid until:** Stable (no external dependencies; valid until codebase structure changes)
