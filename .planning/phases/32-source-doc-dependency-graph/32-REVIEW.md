---
phase: 32-source-doc-dependency-graph
reviewed: 2026-05-13T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/cli/generate.ts
  - src/cli/index.ts
  - src/regen/dep-graph.test.ts
  - src/regen/dep-graph.ts
  - src/renderers/registry.test.ts
  - src/renderers/registry.ts
  - src/renderers/render-00-index.ts
  - src/renderers/types.ts
  - tests/integration/dry-run.test.ts
  - vitest.config.ts
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-05-13
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 32 introduces a source-to-renderer dependency graph (`src/regen/dep-graph.ts`),
wires `--dry-run` and surgical `--since` regeneration into `src/cli/generate.ts`, and
extends the registry/INDEX rendering surface. The module boundaries are clean, the
schema-based load with `graphVersion` literal is a sound safe-degradation strategy, and
tests cover the happy paths plus several branch-by-branch contracts.

Two correctness defects rise to BLOCKER:

1. The `--since` surgical-skip path can mark a renderer as `'reused'` even when the
   prior on-disk output is missing, producing a broken INDEX link and lying about
   what is on disk.
2. `getGitChangedFiles()` can THROW on an invalid ref (e.g. `--since foo` against a
   real git repo). The `--dry-run` early-exit path does not catch this, so an invalid
   `--since` value combined with `--dry-run` produces an uncaught rejection that
   exits non-zero — directly contradicting SC-2's "zero LLM calls, exit 0" contract.

Both are concrete user-visible regressions, not theoretical. The remaining issues are
quality/robustness items (dead-code branches, fragile non-exhaustive switch,
unrelated-changedFiles row numbering, silent fallback in `--dry-run`).

---

## Critical Issues

### CR-01: `--dry-run --since <bad-ref>` throws + exits non-zero (SC-2 contract violation)

**File:** `src/cli/generate.ts:131-150`
**Issue:**
The dry-run early-exit branch awaits `getGitChangedFiles(rootDir, options.since)` and
only handles the `'ok'` discriminant:

```ts
if (options.since) {
  const gitResult = await getGitChangedFiles(rootDir, options.since);
  if (gitResult.kind === 'ok') {
    changedFiles = gitResult.changedFiles;
  }
}
```

`src/cache/git-fingerprint.ts:32-42` shows `getGitChangedFiles` THROWS (not returns
`'fallback'`) when the ref cannot be revparsed:

```ts
} catch (error) {
  if (error instanceof GitError) {
    throw new Error(`Invalid git ref "${sinceRef}": ${error.message}`);
  }
  throw error;
}
```

The thrown error is caught by the outer `catch` (line 1175) and routed through
`handleCliError`, which exits with a non-zero code. This contradicts SC-2, which the
dry-run path explicitly cites in its comment ("Runs BEFORE auth/provider/config/
onboarding to guarantee ZERO LLM calls"). A user typing `handover generate --dry-run
--since typo` gets a hard CLI failure instead of a "no graph / safe full regen"
preview — which is exactly the friendly preview that --dry-run promises.

This is silent at unit-test time because `dep-graph.test.ts` tests
`computeDryRunDecision` with synthetic inputs, never wiring through the real
`getGitChangedFiles`. `tests/integration/dry-run.test.ts:120-135` exercises only the
**valid** `HEAD~1` ref against a 2-commit fixture; it does not cover the bad-ref case.

**Fix:**
Wrap the call in try/catch and treat any throw as a fallback (same semantics as
the `'fallback'` branch):

```ts
if (options.since) {
  try {
    const gitResult = await getGitChangedFiles(rootDir, options.since);
    if (gitResult.kind === 'ok') {
      changedFiles = gitResult.changedFiles;
    }
    // 'fallback' (not a repo / shallow / detached): leave changedFiles undefined,
    // so computeDryRunDecision degrades to full-preview branch 3 or 4.
  } catch (err) {
    // Invalid ref or other git error: surface to stderr but keep dry-run
    // contract (exit 0, zero LLM calls).
    process.stderr.write(
      `warning: --since "${options.since}" could not be resolved: ${(err as Error).message}\n`,
    );
  }
}
```

Add an integration test asserting `--dry-run --since not-a-real-ref` exits 0 with
the standard preview body.

---

### CR-02: `'reused'` status written for renderers with missing on-disk output (broken INDEX links)

**File:** `src/cli/generate.ts:957-977` and `src/renderers/render-00-index.ts:73-76`
**Issue:**
When the dep-graph filter declares a renderer unaffected, the render step skips
producing content and reports `status: 'reused'`:

```ts
if (filterDecision && !filterDecision.fullRegen && !filterDecision.affected.has(doc.id)) {
  let lastRenderedAt: string | undefined;
  try {
    const s = await stat(join(outputDir, doc.filename));
    lastRenderedAt = s.mtime.toISOString();
  } catch {
    lastRenderedAt = undefined; // prior output missing — render label without timestamp
  }
  return {
    doc,
    content: '',
    skipped: false,
    reused: true,         // ← unconditional, even if stat() failed
    lastRenderedAt,
    ...
  };
}
```

If `stat()` throws (file missing — e.g. someone manually deleted `handover/` and
then ran `--since`), we silently report `status: 'reused'` upstream. Downstream:

`src/renderers/render-00-index.ts:75`:
```ts
const docLink = s.status !== 'not-generated' ? `[${s.title}](${s.filename})` : s.title;
```

A `'reused'` row still links to `s.filename` — which now points at a file that does
not exist on disk. The user opens 00-INDEX.md, clicks the link, and gets a missing
file. The INDEX is lying. This violates the implicit contract that `reused` means
"prior content remains valid on disk."

The comment `prior output missing — render label without timestamp` acknowledges
the case but draws the wrong conclusion: rendering the doc is mandatory when the
prior output is gone, not just dropping the timestamp.

**Fix:**
When the stat fails, do not return `reused: true`. Either (a) fall through and
re-render the doc, or (b) demote to `'not-generated'`. Option (a) is safest:

```ts
if (filterDecision && !filterDecision.fullRegen && !filterDecision.affected.has(doc.id)) {
  let lastRenderedAt: string | undefined;
  let priorExists = true;
  try {
    const s = await stat(join(outputDir, doc.filename));
    lastRenderedAt = s.mtime.toISOString();
  } catch {
    priorExists = false;
  }
  if (priorExists) {
    return { doc, content: '', skipped: false, reused: true, lastRenderedAt, durationMs: Date.now() - docStart };
  }
  // Prior output missing — fall through and render normally so the link in
  // INDEX resolves. (This contradicts dep-graph's "unaffected" verdict, but
  // correctness beats efficiency for a 1-off case.)
}

// Continue to: const content = doc.render(ctx); ...
```

Add a regression test in `dry-run.test.ts` (or a new `surgical-since.test.ts`) that
deletes one doc from a prior `handover/` directory, runs `--since HEAD~1`, and
asserts the missing doc is regenerated (not marked `reused`).

---

## Warnings

### WR-01: `formatDryRun` silently degrades to "full preview" on git fallback

**File:** `src/cli/generate.ts:135-141`
**Issue:**
When `getGitChangedFiles` returns `{ kind: 'fallback', reason: '...' }` (not a repo,
shallow clone, detached HEAD), the dry-run path silently sets `changedFiles =
undefined` and falls into `computeDryRunDecision` Branch 3 (graph + no changedFiles
→ all docs in wouldExecute). The user sees a preview indistinguishable from one
where they forgot `--since` entirely — yet they did pass `--since`. The fallback
reason is discarded.

Compare with the non-dry-run path at `generate.ts:555-557`, which DOES surface the
reason: `process.stdout.write(`${gitResult.reason} — falling back to content-hash mode\n`)`.

**Fix:**
Mirror the non-dry-run behavior — write the reason to stderr so users understand
why the preview shows every doc instead of a scoped subset:

```ts
if (options.since) {
  try {
    const gitResult = await getGitChangedFiles(rootDir, options.since);
    if (gitResult.kind === 'ok') {
      changedFiles = gitResult.changedFiles;
    } else {
      process.stderr.write(`--since ignored: ${gitResult.reason}\n`);
    }
  } catch (err) { /* see CR-01 */ }
}
```

---

### WR-02: `statusLabel` switch is non-exhaustive and returns `undefined` for unknown statuses

**File:** `src/renderers/render-00-index.ts:56-71`
**Issue:**
```ts
const statusLabel = (s: DocumentStatus): string => {
  switch (s.status) {
    case 'complete': return 'Complete';
    case 'partial':  return 'Partial (static analysis only)';
    case 'static-only': return 'Static Only';
    case 'not-generated': return 'Not Generated';
    case 'reused':
      return s.lastRenderedAt ? `Reused (last: ${s.lastRenderedAt})` : 'Reused';
  }
};
```

The return-type annotation claims `: string`, but if a future status value is added
to the union in `types.ts:63` without updating this switch, TS's exhaustiveness
warning is suppressed (no `default:` branch + no `never` assertion). The function
silently returns `undefined`, which is then interpolated into a markdown table cell
as the literal string `'undefined'`.

This is exactly the situation Phase 32 just *did* with the `'reused'` addition —
the precedent shows the file IS regularly extended.

**Fix:**
Add an exhaustiveness guard so the next time someone adds a status, the build
breaks loudly:

```ts
const statusLabel = (s: DocumentStatus): string => {
  switch (s.status) {
    case 'complete': return 'Complete';
    case 'partial':  return 'Partial (static analysis only)';
    case 'static-only': return 'Static Only';
    case 'not-generated': return 'Not Generated';
    case 'reused':
      return s.lastRenderedAt ? `Reused (last: ${s.lastRenderedAt})` : 'Reused';
    default: {
      const _exhaustive: never = s.status;
      return _exhaustive;
    }
  }
};
```

---

### WR-03: INDEX row number `i` is array index, not document number (display inconsistency)

**File:** `src/renderers/render-00-index.ts:73-77`
**Issue:**
```ts
const rows = statuses.map((s, i) => {
  const num = String(i).padStart(2, '0');
  ...
});
```

The `#` column displays the array index, padded to 2 digits. The document IDs in
`DOCUMENT_REGISTRY` (e.g., `00-index`, `01-project-overview`, `03-architecture`)
encode their own numeric prefix. Rendering `'00'` for the first row, `'01'` for
the second etc. means the displayed number diverges from the canonical doc number
whenever:

- The status list isn't in strict registry order
- A doc is filtered out (e.g., `--only arch` would still display row `00`, `01`,
  `02` for index + arch + 04 placeholder)

A user reading the INDEX would reasonably assume `#03` matches `03-ARCHITECTURE.md`.
Right now that's coincidentally true only in the all-docs case.

**Fix:**
Use the document filename's numeric prefix, not the array index:

```ts
const rows = statuses.map((s) => {
  const match = s.filename.match(/^(\d+)-/);
  const num = match ? match[1] : '??';
  const docLink = s.status !== 'not-generated' ? `[${s.title}](${s.filename})` : s.title;
  return [num, docLink, statusLabel(s)];
});
```

---

### WR-04: `'00-index'` skipped from required-rounds calculation may underspecify rounds when index is the only selected doc

**File:** `src/renderers/registry.ts:371-389` (and `dep-graph.ts:114`)
**Issue:**
`computeRequiredRounds` correctly iterates every selected doc's `requiredRounds`,
including `00-index` (whose `requiredRounds: []`). Combined with `resolveSelectedDocs`
always including `00-index`, a call like `resolveSelectedDocs('index', ...)` returns
`[00-index]`, whose `computeRequiredRounds` returns the empty set.

Downstream in `generate.ts:740-840`, every `requiredRounds.has(N)` check is false,
so zero AI round steps are registered. The render step's `terminalRounds` is then
empty → `renderDeps = ['static-analysis']` → render runs immediately.

BUT: the empty-repo short-circuit at `generate.ts:867-912` uses
`config.project.name ?? 'Unknown Project'` for the project name and a synthesized
overview. For a **non-empty** repo with only index selected, the render path falls
through to line 914 with `ctx.rounds = {r1: undefined, ...}` and `projectName` falls
back to `config.project.name`. This produces an INDEX with mostly `not-generated`
rows (correct) BUT requires `staticAnalysisResult` which is set at static-analysis
step (also correct).

Result: probably works but is fragile. The fragility comes from `'00-index'` being
treated specially in the dep-graph build (skipped from `renderers` map), but NOT
specially in `resolveSelectedDocs` or `computeRequiredRounds`. The dep-graph
documents this with `// INDEX always renders; value informational (D-09)` but
the registry doesn't.

**Fix:**
Add a defensive doc comment and one assertion test:

```ts
// registry.ts — add to computeRequiredRounds JSDoc:
/**
 * NOTE: '00-index' contributes no rounds (requiredRounds: []) — INDEX is
 * generated locally from per-doc statuses and does not require AI output.
 * If --only resolves to only INDEX, this returns an empty Set and zero AI
 * steps are registered; the render step still produces 00-INDEX.md with
 * 'not-generated' rows for all other docs.
 */
```

And add a test:
```ts
test('--only index selects zero AI rounds and produces an INDEX-only render plan', () => {
  const docs = resolveSelectedDocs('index', DOCUMENT_REGISTRY);
  expect(docs.map(d => d.id)).toEqual(['00-index']);
  expect(computeRequiredRounds(docs).size).toBe(0);
});
```

---

### WR-05: `formatDryRun` branch 4 has dead `?? '?'` fallback

**File:** `src/regen/dep-graph.ts:338-345`
**Issue:**
```ts
} else {
  lines.push(`Dry-run preview (since: ${d.since ?? '?'})`);
  ...
}
```

Branch 4 is reachable only when `since !== undefined && !noGraph` (the earlier
`d.since === undefined && !d.noGraph` and `d.noGraph` branches already returned).
The `?? '?'` therefore never fires — but it suggests to a reader that `since` can
be undefined here, which is wrong. It also hides a misclassified branch: if logic
ever changes upstream and `since` becomes undefined in this branch, output of
`'(since: ?)'` is silently misleading rather than crashing or being routed through
a clearer "no --since" branch.

**Fix:**
Drop the fallback; assert the precondition for the reader:

```ts
} else {
  // since !== undefined && !noGraph (branches 1-3 already returned)
  lines.push(`Dry-run preview (since: ${d.since})`);
  ...
}
```

If desired, add a TypeScript assertion `if (d.since === undefined) throw new Error('unreachable')` or narrow earlier.

---

## Info

### IN-01: `formatDryRun` text format is asserted by a single magic string `'Zero LLM calls made.'`

**File:** `src/regen/dep-graph.ts:367` and `dep-graph.test.ts:442-458`, `dry-run.test.ts:45`
**Issue:**
The SC-2 textual contract is enforced by greping for the literal string
`'Zero LLM calls made.'` in three places. There is no shared constant — if anyone
changes the casing or wording in `dep-graph.ts:367`, two unit tests and one
integration test all fail with cryptic substring messages. Cheap fix; medium
readability win.
**Fix:**
Export a constant:
```ts
// dep-graph.ts
export const DRY_RUN_TRAILER = 'Zero LLM calls made.';
// then: lines.push(DRY_RUN_TRAILER);
```
Tests reference `DRY_RUN_TRAILER` instead of the literal.

---

### IN-02: `parseInt` without radix-safe parsing in `render-00-index.ts`

**File:** `src/renderers/render-00-index.ts:22`
**Issue:**
```ts
const roundNum = parseInt(key.replace('r', ''), 10);
```
Safe for known keys `r1`..`r6` (typed via `RenderContext.rounds`), but the loop
iterates `Object.entries(ctx.rounds)` which is `any` at runtime. If extra keys
ever leak in (e.g., from JSON deserialization), `parseInt` may return `NaN`, which
is then added to a `Set<number>`. Subsequent `.sort()` on a list containing `NaN`
produces stable but undefined ordering, and the YAML front-matter `ai_rounds_used`
field becomes `[NaN, 1, 2, ...]` which YAML cannot serialize cleanly.
**Fix:**
Filter NaN explicitly, or use a tighter match:
```ts
for (const [key, val] of Object.entries(ctx.rounds)) {
  if (val == null) continue;
  const m = key.match(/^r(\d+)$/);
  if (!m) continue;
  roundsUsed.add(parseInt(m[1], 10));
}
```

---

### IN-03: `stripUnclaimedPrefix` regex anchored loosely

**File:** `src/regen/dep-graph.ts:373-376`
**Issue:**
```ts
function stripUnclaimedPrefix(reason: string): string {
  const m = reason.match(/unclaimed:\s*([^)]+)\)?\s*$/);
  return m ? m[1].trim() : reason;
}
```
Captures everything between `unclaimed: ` and an optional `)` at end. If a file
path ever contains `)` (legal on POSIX), the capture would be truncated. Unlikely
in this repo but worth noting; the input is always file paths that come from
fast-glob globbing `src/**` and a user's filesystem — well-behaved in practice.
**Fix (optional):**
Pass `unclaimed: string[]` directly rather than re-parsing the formatted reason
string. The `DryRunDecision.wouldExecute[*].reasons` is already shaped data; the
re-parse is purely cosmetic plumbing.

---

### IN-04: Comment on line 956 contradicts comment on line 866 about `filterDecision === null`

**File:** `src/cli/generate.ts:956-960` vs `:570-575`
**Issue:**
The render-loop comment claims `filterDecision is null when no --since OR no graph
existed (full regen path)`. But upstream (line 570-575), `filterDecision` is set
ONLY when `--since` succeeded AND a graph was loaded. The two together mean a
full-regen path can leave `filterDecision === null` (correct), but the OR in the
comment glosses over the `--since` failure modes (fallback, no graph) — which all
collapse to "null" downstream. Comment is true but imprecise.
**Fix (optional):**
```ts
// filterDecision is null in three cases:
//   1. --since was not provided
//   2. --since git lookup returned 'fallback' (not a repo, shallow, detached)
//   3. No dep-graph existed on disk (loadDepGraph returned null)
// All three collapse to "render every selected doc" — safe full regen.
```

---

_Reviewed: 2026-05-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
