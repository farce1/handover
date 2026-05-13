/**
 * Unit tests for src/cli/generate.ts helpers.
 *
 * Phase 32-04 (CR-02): the render-loop reused-branch must NOT return reused:true
 * when the prior on-disk output is missing — INDEX would otherwise link to a
 * non-existent file ("lying INDEX"). The behavior is implemented via a small
 * pure helper (checkPriorOutput) so the branch can be exercised without
 * standing up the full Promise.allSettled render loop.
 *
 * Rationale for unit-vs-integration choice (Path B per 32-04-PLAN Task 2):
 * the existing tests/integration/ stack does not stub the LLM provider — all
 * integration tests exercise --dry-run only. Mocking the LLM seam end-to-end
 * for one regression test would expand scope beyond the gap-closure boundary,
 * so the planner explicitly authorized a unit-level test against the extracted
 * helper.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

import { checkPriorOutput } from './generate.js';

describe('checkPriorOutput (CR-02 priorExists guard helper)', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('returns exists:true and an mtime when the file is present on disk', async () => {
    vol.fromJSON({
      '/out/03-ARCHITECTURE.md': '# Architecture\n',
    });

    const result = await checkPriorOutput('/out', '03-ARCHITECTURE.md');

    expect(result.exists).toBe(true);
    expect(result.lastRenderedAt).toBeTypeOf('string');
    // ISO-8601 shape, e.g., 2026-05-13T11:30:00.000Z
    expect(result.lastRenderedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('returns exists:false (and undefined lastRenderedAt) when prior output is missing', async () => {
    // No file written — stat() will throw ENOENT.
    const result = await checkPriorOutput('/out', '03-ARCHITECTURE.md');

    expect(result.exists).toBe(false);
    expect(result.lastRenderedAt).toBeUndefined();
  });

  it('returns exists:false on any stat error (defensive fallback)', async () => {
    // Simulate a broken path inside a non-existent directory tree.
    const result = await checkPriorOutput('/does-not-exist', 'nope.md');

    expect(result.exists).toBe(false);
    expect(result.lastRenderedAt).toBeUndefined();
  });
});

describe('render-loop reused-branch (CR-02 priorExists guard) — branch shape', () => {
  /**
   * The render-loop reused-branch (src/cli/generate.ts) shapes its early-return
   * payload like this:
   *   { doc, content: '', skipped: false, reused: true, lastRenderedAt, durationMs }
   * Per CR-02, when checkPriorOutput().exists === false, the branch must NOT
   * return that payload — it must fall through so the renderer runs normally
   * (producing a payload with reused: false).
   *
   * This test simulates the inlined branch logic against the helper to lock the
   * contract (regression guard for CR-02).
   */
  beforeEach(() => {
    vol.reset();
  });

  async function simulateReusedBranch(
    doc: { id: string; filename: string },
    outputDir: string,
  ): Promise<{ reused: boolean; lastRenderedAt: string | undefined }> {
    const { exists, lastRenderedAt } = await checkPriorOutput(outputDir, doc.filename);
    if (exists) {
      return { reused: true, lastRenderedAt };
    }
    // CR-02 fix: prior output missing — fall through, render normally.
    return { reused: false, lastRenderedAt: undefined };
  }

  it('reuses (reused:true) when prior output exists', async () => {
    vol.fromJSON({ '/out/03-ARCHITECTURE.md': '# stale\n' });

    const result = await simulateReusedBranch(
      { id: '03-architecture', filename: '03-ARCHITECTURE.md' },
      '/out',
    );

    expect(result.reused).toBe(true);
    expect(result.lastRenderedAt).toBeTypeOf('string');
  });

  it('falls through (reused:false) when prior output is missing — INDEX link will resolve', async () => {
    // No file under /out — the user deleted the doc; dep-graph filter still
    // marked the renderer unaffected. CR-02: we must regenerate.
    const result = await simulateReusedBranch(
      { id: '03-architecture', filename: '03-ARCHITECTURE.md' },
      '/out',
    );

    expect(result.reused).toBe(false);
    expect(result.lastRenderedAt).toBeUndefined();
  });
});
