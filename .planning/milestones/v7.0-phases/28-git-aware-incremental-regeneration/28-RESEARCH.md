# Phase 28: Git-Aware Incremental Regeneration - Research

**Researched:** 2026-03-02
**Domain:** simple-git API + CLI flag wiring + content-hash cache integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Run-time feedback
- Incremental mode must be visually distinct from a full run — clear banner or badge showing incremental mode and the ref being compared against (e.g., "Incremental mode (since abc123)")
- When `--since` detects 0 changed files, exit early with a message ("No files changed since <ref> — nothing to regenerate") and exit code 0
- `--since` is combinable with `--only` (document selection) — both filters apply together

#### Fallback experience
- When git context is unavailable, show a one-liner warning then fall back to full content-hash analysis
- Warning messages are specific per scenario: "Not a git repo", "Shallow clone detected", "Detached HEAD" — helps users diagnose the situation
- Fallback exits with code 0 (success) — the work still gets done, just not incrementally
- No strict mode — keep it simple with one flag and graceful behavior

#### Ref flexibility
- Accept any valid git ref: branch names, tags, SHAs, relative refs (HEAD~N), time-based (@{yesterday}) — whatever `git rev-parse` accepts
- No convenience shortcuts (no `--since last-run`) — user always specifies the ref explicitly
- Invalid or non-existent ref is an error: print error message and exit non-zero (this is user input error, not a fallback scenario)

#### Uncommitted changes
- Include uncommitted changes (staged + unstaged) in the changed file set — practical for local dev workflow
- Include untracked (brand new) files as "changed" — they're part of the work in progress
- No special CI auto-detection (no GITHUB_BASE_REF sniffing) — CI users provide their own ref

### Claude's Discretion
- Detail level of changed/unchanged file output (counts vs file list)
- Whether to show time/cost savings estimates
- Warning messaging style for uncommitted files (info note vs silent)
- Exact banner/badge format for incremental mode indicator

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 28 adds `handover generate --since <ref>` which builds a changed-file set from git (via `git.diffSummary([ref, 'HEAD'])` for committed changes plus `git.status()` for uncommitted/untracked files) and passes that set to the existing `analysisFingerprint` construction site in `generate.ts`. The new module `src/cache/git-fingerprint.ts` encapsulates all simple-git calls behind a clean async function. The generate command gets a `--since` CLI flag and a corresponding `since?: string` field in `GenerateOptions`.

The codebase already has `simple-git` v3.32.2 as a production dependency, an existing `src/analyzers/git-history.ts` that demonstrates the exact pattern for defensive `simpleGit()` usage, and a `DisplayState` with `isIncremental`/`changedFileCount`/`unchangedFileCount` fields already wired for display. The two plans are: (1) write `git-fingerprint.ts` with its tests, (2) wire the flag into `generate.ts`.

**Primary recommendation:** Implement `getGitChangedFiles(rootDir, sinceRef)` in `src/cache/git-fingerprint.ts` returning `{ changedFiles: Set<string>; fallbackReason?: string }`. Call it in `generate.ts`'s static-analysis step before `computeAnalysisFingerprint`, overriding the content-hash `changedFiles` set only when `--since` is provided and git is available.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| simple-git | 3.32.2 (installed) | Git operations via Node.js | Already a prod dependency; used in `src/analyzers/git-history.ts` |
| vitest | 4.0.18 (installed) | Unit testing | Project-standard test runner |
| picocolors | 1.1.0 (installed) | Terminal color output | Project-standard color library for UI components |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| commander | 14.0.3 (installed) | CLI option parsing | Adding `--since` option to the `generate` command |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| simple-git | child_process + git CLI | simple-git already in prod deps; has typed responses; handles escaping; no reason to spawn raw git |
| simple-git diffSummary | git.raw(['diff', '--name-only', ref]) | `diffSummary` returns typed `DiffResult.files[].file`; raw is fine but requires manual parsing |

**Installation:** No new packages needed — `simple-git` is already a production dependency.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── cache/
│   ├── round-cache.ts          # Existing — content-hash cache
│   └── git-fingerprint.ts      # NEW — git-based changed file detection
├── cli/
│   ├── index.ts                # Add --since option to generate command
│   └── generate.ts             # Wire since option into static-analysis step
└── cache/
    └── git-fingerprint.test.ts # NEW — unit tests (co-located)
```

### Pattern 1: Git Fingerprint Module Interface

**What:** A standalone async function that takes `rootDir` and `sinceRef`, runs `diffSummary` + `status`, and returns a discriminated result.
**When to use:** Called once per generate run, inside the static-analysis DAG step, when `options.since` is set.

```typescript
// src/cache/git-fingerprint.ts

export type GitFingerprintResult =
  | { kind: 'ok'; changedFiles: Set<string> }
  | { kind: 'fallback'; reason: string };

export async function getGitChangedFiles(
  rootDir: string,
  sinceRef: string,
): Promise<GitFingerprintResult> {
  // ...
}
```

**The `kind: 'fallback'` path covers:** not-a-git-repo, shallow clone, detached HEAD.
**The `kind: 'ok'` path:** returns union of `diffSummary` files and `status` files (untracked = `not_added`).

### Pattern 2: simple-git diffSummary + status Pairing

**What:** Call `git.diffSummary([sinceRef, 'HEAD'])` for committed changes, then `git.status()` for uncommitted + untracked files. Union both sets.
**When to use:** Always when `--since` is provided. This is the decision-locked approach.

```typescript
// Source: simple-git typings + existing git-history.ts pattern
const git = simpleGit(rootDir);

// Step 1: validate ref (throws on bad ref — user error)
await git.revparse([sinceRef]);  // throws GitError if ref doesn't exist

// Step 2: committed changes between sinceRef and HEAD
const diff = await git.diffSummary([sinceRef, 'HEAD']);
const committedFiles = new Set(diff.files.map((f) => f.file));

// Step 3: uncommitted (staged + unstaged + untracked)
const status = await git.status();
const uncommittedFiles = new Set([
  ...status.modified,
  ...status.created,
  ...status.deleted,
  ...status.renamed.map((r) => r.to),
  ...status.not_added,  // untracked new files
  ...status.staged,
]);

const changedFiles = new Set([...committedFiles, ...uncommittedFiles]);
```

### Pattern 3: Fallback Detection Sequence

**What:** Check in order: (1) is git repo, (2) is shallow, (3) is detached HEAD. Each produces a specific warning message.
**When to use:** Before attempting `diffSummary`/`status`.

```typescript
// Source: simple-git typings, git-history.ts pattern

// Check 1: is it a git repo?
const isRepo = await git.checkIsRepo();
if (!isRepo) {
  return { kind: 'fallback', reason: 'Not a git repo' };
}

// Check 2: shallow clone detection
// `git rev-parse --is-shallow-repository` outputs "true\n" or "false\n"
try {
  const shallowResult = await git.raw(['rev-parse', '--is-shallow-repository']);
  if (shallowResult.trim() === 'true') {
    return { kind: 'fallback', reason: 'Shallow clone detected' };
  }
} catch {
  // older git versions don't support --is-shallow-repository; treat as non-shallow
}

// Check 3: detached HEAD (from StatusResult.detached)
const status = await git.status();
if (status.detached) {
  return { kind: 'fallback', reason: 'Detached HEAD' };
}
```

**Note on `--is-shallow-repository`:** This flag was introduced in git 2.15 (released 2017). It is safe to assume modern environments have this. The codebase requires Node >= 18 which pairs with modern git. However the try/catch is still good defensive practice.

### Pattern 4: ref Validation — Error vs Fallback Distinction

**What:** Invalid/non-existent ref is a user error (exit non-zero), not a git-context issue (graceful fallback). Catch `GitError` from `revparse` separately.
**When to use:** Before all other checks.

```typescript
// Source: simple-git error pattern (GitError in errors.d.ts)
import { GitError } from 'simple-git';

try {
  await git.revparse([sinceRef]);
} catch (err) {
  if (err instanceof GitError) {
    // User provided a bad ref — this is NOT a fallback scenario
    throw new Error(`Invalid git ref "${sinceRef}": ${err.message}`);
  }
  throw err;
}
```

### Pattern 5: Wiring into generate.ts

**What:** In the static-analysis step, after computing `fileEntries`, if `options.since` is set, call `getGitChangedFiles` to replace the content-hash `changedFiles` set. Also update `analysisFingerprint` construction to use git-derived fingerprint.
**When to use:** Only when `options.since !== undefined`.

```typescript
// In generate.ts static-analysis step execute() callback:
if (options.since) {
  const gitResult = await getGitChangedFiles(rootDir, options.since);
  if (gitResult.kind === 'fallback') {
    // Show specific warning, fall back to content-hash mode
    logger.warn(gitResult.reason + ' — falling back to content-hash mode');
    // isGitIncremental stays false; proceed normally
  } else {
    // Override changedFiles with git-derived set
    // Override analysisFingerprint with git-based hash
    // Set display state fields for incremental banner
    // Check for 0 changed files → early exit
  }
}
```

### Pattern 6: Zero-Change Early Exit

**What:** When `--since` yields 0 changed files (empty set), print message and exit with code 0 before the DAG runs.
**When to use:** Only in git-aware mode, after `getGitChangedFiles` returns `kind: 'ok'` with empty set.

```typescript
if (options.since && gitResult.kind === 'ok' && gitResult.changedFiles.size === 0) {
  // Must be done before pipeline starts — use process.stdout.write, then return
  process.stdout.write(`No files changed since ${options.since} — nothing to regenerate\n`);
  return; // runGenerate returns void; exit code 0
}
```

### Pattern 7: Display State for Incremental Banner

**What:** `DisplayState` already has `isIncremental`, `changedFileCount`, `unchangedFileCount`. The `renderFileCoverage` component already renders the incremental run label. The banner needs an additional field for the git ref label.
**When to use:** Set these in generate.ts when git-aware mode is active.

The CONTEXT.md requires showing "Incremental mode (since abc123)" as a banner, which is distinct from the existing `renderRunLabel("Incremental run (3 files changed)")`. A new `sinceRef?: string` field on `DisplayState` enables this.

### Pattern 8: CLI Flag Registration

**What:** Add `--since <ref>` option to the generate command in `src/cli/index.ts` and add `since?: string` to `GenerateOptions` in `generate.ts`.
**When to use:** Commander `.option()` call.

```typescript
// src/cli/index.ts
program
  .command('generate')
  // ... existing options ...
  .option('--since <ref>', 'Only re-analyze files changed since this git ref');
```

### Anti-Patterns to Avoid

- **Checking detached HEAD before `checkIsRepo()`:** `git.status()` throws if not a git repo, not gracefully returns. Always check `checkIsRepo()` first.
- **Using `git.diff()` instead of `git.diffSummary()`:** `diff()` returns raw string output; `diffSummary()` returns typed `DiffResult` with `files[].file` array.
- **Treating `sinceRef` as always valid:** Always `revparse` the ref before calling `diffSummary`. A misspelled branch name silently returns an empty diff in some git versions.
- **Not including `status.not_added`:** This is the critical array for untracked new files. Missing it violates the locked decision to include brand-new files.
- **Not including `status.staged`:** These are files that are staged (index) but may not be in the diff if they haven't been committed.
- **Mutating `DisplayState.isIncremental` from git-aware mode without checking `--since`:** The existing `isIncremental` field is set by content-hash analysis. Git-aware mode should set a separate or the same field consistently — use the same `isIncremental` flag since both modes use the same display path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git operations | Custom `child_process.exec('git diff ...')` | `simple-git` (already installed) | Handles escaping, cross-platform paths, typed results, promise API |
| Shallow clone detection | Parse `.git/shallow` file | `git.raw(['rev-parse', '--is-shallow-repository'])` | The file exists but format is undocumented; git CLI is authoritative |
| Ref validation | Regex matching on branch names | `git.revparse([ref])` then catch `GitError` | Only git knows if a ref resolves to a commit |
| Untracked file detection | Parse raw `git status --porcelain` | `git.status()` → `status.not_added` | Typed API; handles edge cases (spaces in filenames, etc.) |

**Key insight:** simple-git is already in the project and used in git-history.ts. There is no reason to shell out manually.

---

## Common Pitfalls

### Pitfall 1: `git.revparse()` Does Not Throw on Nonexistent Ref in All Versions
**What goes wrong:** In some simple-git versions, `revparse` on a nonexistent ref throws `GitError`; in others it may return empty string or swallow the error.
**Why it happens:** simple-git wraps git exit codes, but behavior can differ based on git version.
**How to avoid:** After `revparse`, also check that the result is a non-empty string (a valid SHA). Wrap in try/catch AND validate the returned string.
**Warning signs:** Empty `changedFiles` set when ref should have files.

### Pitfall 2: DiffResult.files[].file May Contain Rename Notation
**What goes wrong:** When a file is renamed, `file` in `DiffResultNameStatusFile` may be a string like `old.ts => new.ts`. The actual `file` field for a rename is the destination.
**Why it happens:** Git diff output format for renames includes both names.
**How to avoid:** Use `f.file` directly from `DiffResult`; simple-git normalizes renames to the destination path in the `file` field. Verify with `typeof f.file === 'string'`.
**Warning signs:** Paths with ` => ` appearing in the changed file set.

### Pitfall 3: StatusResult.not_added vs StatusResult.created
**What goes wrong:** Confusing `not_added` (untracked files) with `created` (files staged for addition). Both should be included.
**Why it happens:** `created` = new files staged in the index. `not_added` = new files not staged (truly untracked). The decision requires both.
**How to avoid:** Include both `status.created` AND `status.not_added` in the changed set.
**Warning signs:** Untracked files not appearing as "changed" in incremental mode.

### Pitfall 4: `--is-shallow-repository` Not Available in Old Git
**What goes wrong:** `git rev-parse --is-shallow-repository` fails with an error on git < 2.15.
**Why it happens:** Flag was added in git 2.15.
**How to avoid:** Wrap in try/catch; if the raw command throws, treat as non-shallow (safe default). Can also check for existence of `.git/shallow` file as a fallback signal.
**Warning signs:** Uncaught error on CI runners with older git.

### Pitfall 5: Coverage Config Excludes `src/cache/**`
**What goes wrong:** `vitest.config.ts` currently excludes `src/cache/**` from coverage. The success criterion requires unit tests with coverage for the untracked-file detection path.
**Why it happens:** The exclusion was added in an earlier phase because `round-cache.ts` requires filesystem I/O.
**How to avoid:** The `git-fingerprint.ts` tests will use `vi.mock('simple-git', ...)` to mock the git instance — no real filesystem needed. Remove `src/cache/**` from the exclusion list and add a targeted exclusion for `src/cache/round-cache.ts` only, OR add a targeted include for `src/cache/git-fingerprint.ts`.
**Warning signs:** Tests exist but don't show in coverage report; coverage thresholds fail if the new module is counted but untested paths exist.

### Pitfall 6: `analysisFingerprint` Must Still Be Computed
**What goes wrong:** When using git-aware mode, skipping the `computeAnalysisFingerprint` call causes `wrapWithCache` to receive an empty fingerprint string, invalidating all round caches.
**Why it happens:** The fingerprint is used in `roundCache.computeHash()`. If it's `''`, every hash is the same across all projects.
**How to avoid:** Always compute `analysisFingerprint` from `fileEntries` (content hashes) regardless of `--since`. The git-derived `changedFiles` set affects which files get packed into context; the fingerprint still needs to be computed for round cache validity. Alternatively, compute a git-aware fingerprint from the changed-file set + their content hashes.
**Warning signs:** Rounds hitting cache unexpectedly or always missing.

### Pitfall 7: `--since` Combined with `--only` — Order of Filtering
**What goes wrong:** Git-aware file filtering and `--only` document filtering are orthogonal. Git filtering affects which source files feed into analysis; `--only` affects which documents are generated from rounds. They should not interfere.
**Why it happens:** Misunderstanding the two filter layers.
**How to avoid:** The `--only` filter operates at the document/round level (handled by `resolveSelectedDocs`/`computeRequiredRounds`). The `--since` filter operates at the file/context level (handled in the static-analysis step). They compose naturally — no special handling needed.
**Warning signs:** `--since main --only architecture` either generates extra docs or fails with an error.

---

## Code Examples

Verified patterns from official sources and codebase inspection:

### simple-git diffSummary for Changed Files
```typescript
// Source: simple-git typings (node_modules/simple-git/dist/typings/simple-git.d.ts)
// Source: existing pattern in src/analyzers/git-history.ts
import { simpleGit } from 'simple-git';

const git = simpleGit(rootDir);
const diff = await git.diffSummary([sinceRef, 'HEAD']);
// diff.files: Array<DiffResultTextFile | DiffResultBinaryFile>
// Each file has: { file: string, ... }
const files = diff.files.map((f) => f.file);
```

### simple-git status for Uncommitted + Untracked Files
```typescript
// Source: simple-git typings (StatusResult interface)
const status = await git.status();
// status.not_added:  string[] — untracked files (REGEN-requirement: include new files)
// status.created:    string[] — new files staged for commit
// status.modified:   string[] — modified tracked files (staged or unstaged)
// status.staged:     string[] — files staged in the index
// status.deleted:    string[] — deleted files
// status.detached:   boolean  — detached HEAD indicator
const uncommitted = [
  ...status.modified,
  ...status.created,
  ...status.deleted,
  ...status.renamed.map((r) => r.to),
  ...status.not_added,
  ...status.staged,
];
```

### checkIsRepo + Fallback Pattern
```typescript
// Source: pattern from src/analyzers/git-history.ts (lines 53-58)
const git = simpleGit(rootDir);
const isRepo = await git.checkIsRepo();
if (!isRepo) {
  // return fallback result — same pattern as git-history.ts emptyGitResult()
}
```

### Shallow Clone Detection via git raw
```typescript
// Source: simple-git typings (raw method) + git documentation
const shallowResult = await git.raw(['rev-parse', '--is-shallow-repository']);
// Returns "true\n" for shallow clone, "false\n" for full clone
if (shallowResult.trim() === 'true') {
  // shallow clone detected
}
```

### vi.mock Pattern for simple-git in Tests
```typescript
// Source: vitest docs + pattern from src/auth/token-store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGit = {
  checkIsRepo: vi.fn(),
  raw: vi.fn(),
  status: vi.fn(),
  diffSummary: vi.fn(),
  revparse: vi.fn(),
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGit.checkIsRepo.mockResolvedValue(true);
  mockGit.raw.mockResolvedValue('false\n'); // not shallow
  mockGit.status.mockResolvedValue({ detached: false, not_added: [], ... });
  mockGit.diffSummary.mockResolvedValue({ files: [] });
  mockGit.revparse.mockResolvedValue('abc123def456');
});
```

### Commander --since Option Registration
```typescript
// Source: src/cli/index.ts pattern (generate command)
program
  .command('generate')
  // ... existing options ...
  .option('--since <ref>', 'Only re-analyze files changed since this git ref (e.g. HEAD~3, main, v1.0)');
```

### Zero-Change Early Exit Pattern
```typescript
// Source: generate.ts pattern for static-only early return
if (gitResult.kind === 'ok' && gitResult.changedFiles.size === 0) {
  process.stdout.write(`No files changed since ${options.since} — nothing to regenerate\n`);
  renderer.destroy();
  return;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Content-hash analysis (always full) | Content-hash remains default; git-aware is opt-in via `--since` | Phase 28 | No breaking change to existing `.handover.yml` |
| No git integration in cache logic | git-fingerprint.ts provides git-based changed-file set | Phase 28 | Faster local dev cycles |
| `isIncremental` set only by AnalysisCache | `isIncremental` also set by git-aware mode | Phase 28 | Same display path reused |

**Deprecated/outdated:**
- Nothing deprecated — this is additive. The `AnalysisCache`-based incremental detection continues to work as the default.

---

## Open Questions

1. **Coverage exclusion scope for `src/cache/git-fingerprint.ts`**
   - What we know: `vitest.config.ts` has `'src/cache/**'` in the coverage exclusion list with justification "Cache layer — requires real filesystem I/O". The new `git-fingerprint.ts` is mock-testable (no filesystem I/O, all git via injected `simpleGit` instance).
   - What's unclear: Should the planner change `src/cache/**` to `src/cache/round-cache.ts` only (expanding coverage surface), or add an override include? The vitest config header says the exclusion list is "FROZEN" and requires a written justification to change.
   - Recommendation: The plan should update the exclusion list, replacing `src/cache/**` with `src/cache/round-cache.ts` and adding a justification comment for `git-fingerprint.ts` being mock-testable. This satisfies the success criterion that requires unit tests covering the untracked-file detection path.

2. **`analysisFingerprint` in git-aware mode**
   - What we know: `analysisFingerprint` is computed from `fileEntries` (path + contentHash) and passed to `wrapWithCache`. It ensures round cache invalidation when file content changes.
   - What's unclear: In git-aware mode, should `analysisFingerprint` be computed from (a) all files (same as full mode), (b) only changed files, or (c) a git-ref-based hash?
   - Recommendation: Compute `analysisFingerprint` from the full `fileEntries` set (same as content-hash mode). This is simpler and correct — the round cache will still be valid for unchanged content. The git `changedFiles` set only affects context packing, not the cache key.

3. **`sinceRef` display in the banner**
   - What we know: `DisplayState` has `isIncremental` but no field for the git ref string. The CONTEXT.md decision says show "Incremental mode (since abc123)".
   - What's unclear: Should a new `sinceRef?: string` field be added to `DisplayState`, or should the ref be embedded in a new display string?
   - Recommendation: Add `sinceRef?: string` to `DisplayState`. This lets both `TerminalRenderer` and `CIRenderer` display the ref without string formatting in generate.ts.

---

## Sources

### Primary (HIGH confidence)
- `node_modules/simple-git/dist/typings/response.d.ts` — `StatusResult`, `DiffResult` interface definitions read directly from installed package
- `node_modules/simple-git/dist/typings/simple-git.d.ts` — `diffSummary`, `status`, `revparse`, `checkIsRepo`, `raw` method signatures
- `src/analyzers/git-history.ts` — existing `simpleGit(ctx.rootDir)` usage pattern, `checkIsRepo`, fallback to empty result
- `src/cache/round-cache.ts` — `computeAnalysisFingerprint`, `computeHash` signatures
- `src/cli/generate.ts` — `analysisFingerprint` construction site (line 481), `changedFiles` usage (lines 502–546), `GenerateOptions` interface
- `src/cli/index.ts` — Commander option registration pattern for generate command
- `src/ui/types.ts` — `DisplayState` interface with existing incremental fields
- `src/ui/components.ts` — `renderFileCoverage`, `renderRunLabel` implementations
- `src/ui/ci-renderer.ts` — `onFileCoverage` incremental display path
- `vitest.config.ts` — coverage exclusion list and thresholds

### Secondary (MEDIUM confidence)
- git documentation for `rev-parse --is-shallow-repository` — added in git 2.15.0 (2017); widely available on modern systems
- simple-git GitHub README (v3.x) — confirms `diffSummary`, `status`, `revparse` are stable API surface

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `simple-git` v3.32.2 installed and in use; method signatures verified from installed typings
- Architecture: HIGH — patterns verified against existing `git-history.ts` usage and `generate.ts` fingerprint construction site
- Pitfalls: HIGH — coverage exclusion pitfall verified from `vitest.config.ts`; `StatusResult.not_added` verified from installed typings; fingerprint pitfall verified from `generate.ts` source
- Test patterns: HIGH — mock patterns verified from `token-store.test.ts` (memfs/vi.mock), consistent with vitest 4.x

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (simple-git is stable; 30-day window)
