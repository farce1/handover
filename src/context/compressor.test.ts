import { describe, expect, test } from 'vitest';
import { compressRoundOutput } from './compressor.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic 1-char = 1-token estimator (same pattern as packer.test.ts) */
const charTokens = (text: string): number => text.length;

// ─── compressRoundOutput() field extraction tests ─────────────────────────────

describe('compressRoundOutput - field extraction', () => {
  test('extracts modules from array of name-object items', () => {
    const output = {
      modules: [{ name: 'auth' }, { name: 'api' }, { name: 'db' }],
    };

    const ctx = compressRoundOutput(1, output, 10_000, charTokens);

    expect(ctx.modules).toContain('auth');
    expect(ctx.modules).toContain('api');
    expect(ctx.modules).toContain('db');
  });

  test('extracts modules from array of plain strings', () => {
    const output = {
      modules: ['core', 'utils', 'types'],
    };

    const ctx = compressRoundOutput(1, output, 10_000, charTokens);

    expect(ctx.modules).toContain('core');
    expect(ctx.modules).toContain('utils');
    expect(ctx.modules).toContain('types');
  });

  test('extracts findings from output.findings array', () => {
    const output = {
      findings: ['Finding A', 'Finding B'],
    };

    const ctx = compressRoundOutput(1, output, 10_000, charTokens);

    expect(ctx.findings).toContain('Finding A');
    expect(ctx.findings).toContain('Finding B');
  });

  test('extracts findings from output.keyFindings alias key', () => {
    const output = {
      keyFindings: ['Key finding 1', 'Key finding 2'],
    };

    const ctx = compressRoundOutput(1, output, 10_000, charTokens);

    expect(ctx.findings).toContain('Key finding 1');
    expect(ctx.findings).toContain('Key finding 2');
  });

  test('extracts relationships from { from, to, type } objects → formatted strings', () => {
    const output = {
      relationships: [
        { from: 'a.ts', to: 'b.ts', type: 'import' },
        { from: 'c.ts', to: 'd.ts', type: 'export' },
      ],
    };

    const ctx = compressRoundOutput(1, output, 10_000, charTokens);

    expect(ctx.relationships).toContain('a.ts -> b.ts (import)');
    expect(ctx.relationships).toContain('c.ts -> d.ts (export)');
  });

  test('extracts openQuestions from output.openQuestions array', () => {
    const output = {
      openQuestions: ['What is the auth flow?', 'How is caching handled?'],
    };

    const ctx = compressRoundOutput(2, output, 10_000, charTokens);

    expect(ctx.openQuestions).toContain('What is the auth flow?');
    expect(ctx.openQuestions).toContain('How is caching handled?');
  });

  test('roundNumber in returned context matches input', () => {
    const output = { modules: ['a'] };

    const ctx = compressRoundOutput(3, output, 10_000, charTokens);

    expect(ctx.roundNumber).toBe(3);
  });

  test('tokenCount is greater than 0 for non-empty output', () => {
    const output = { findings: ['A finding'] };

    const ctx = compressRoundOutput(1, output, 10_000, charTokens);

    expect(ctx.tokenCount).toBeGreaterThan(0);
  });

  test('empty output: all arrays empty and tokenCount reflects just the header line', () => {
    const output = {};

    const ctx = compressRoundOutput(1, output, 10_000, charTokens);

    expect(ctx.modules).toEqual([]);
    expect(ctx.findings).toEqual([]);
    expect(ctx.relationships).toEqual([]);
    expect(ctx.openQuestions).toEqual([]);
    // header line "## Round 1 Context" is 19 chars
    expect(ctx.tokenCount).toBe('## Round 1 Context'.length);
  });
});

// ─── compressRoundOutput() token budget enforcement tests ─────────────────────

describe('compressRoundOutput - token budget enforcement', () => {
  test('all fields fit within budget: no truncation (openQuestions preserved)', () => {
    const output = {
      modules: ['auth'],
      findings: ['Finding 1'],
      openQuestions: ['Question?'],
    };

    const ctx = compressRoundOutput(1, output, 10_000, charTokens);

    // Everything should be preserved
    expect(ctx.modules).toEqual(['auth']);
    expect(ctx.findings).toEqual(['Finding 1']);
    expect(ctx.openQuestions).toEqual(['Question?']);
  });

  test('tight budget: openQuestions trimmed first', () => {
    // Use many openQuestions to push over a tight budget
    const manyQuestions = Array.from({ length: 20 }, (_, i) => `Question ${i}?`);
    const output = {
      modules: ['auth', 'api'],
      findings: ['Finding 1'],
      openQuestions: manyQuestions,
    };

    // Budget just large enough for base but not all questions
    // Header "## Round 1 Context" = 19 chars
    // "Modules: auth, api" = 18 chars
    // "Findings:" = 9 chars + "- Finding 1" = 11 chars → 20
    // Questions take up ~20*12 = 240 chars
    // Set budget = 100 to force question trimming
    const ctx = compressRoundOutput(1, output, 100, charTokens);

    // openQuestions should be trimmed
    expect(ctx.openQuestions.length).toBeLessThan(manyQuestions.length);
    // findings should still be present (trimmed after questions)
    expect(ctx.findings.length).toBeGreaterThan(0);
  });

  test('very tight budget: findings trimmed to 1 when findings existed originally', () => {
    const manyFindings = Array.from({ length: 20 }, (_, i) => `Finding number ${i} with detail`);
    const output = {
      findings: manyFindings,
      openQuestions: Array.from({ length: 10 }, (_, i) => `Question ${i}?`),
    };

    // Budget tight enough to force trimming of findings but not all
    const ctx = compressRoundOutput(1, output, 80, charTokens);

    // Findings should be kept at minimum 1 (min-1 rule)
    expect(ctx.findings.length).toBeGreaterThanOrEqual(1);
    // Should not have all original findings
    expect(ctx.findings.length).toBeLessThan(manyFindings.length);
  });

  test('extremely tight budget: relationships and modules also trimmed', () => {
    const manyModules = Array.from({ length: 30 }, (_, i) => `module-${i}-with-long-name`);
    const manyRelationships = Array.from({ length: 20 }, (_, i) => ({
      from: `file-${i}.ts`,
      to: `dep-${i}.ts`,
      type: 'import',
    }));
    const manyFindings = Array.from({ length: 20 }, (_, i) => `Finding number ${i}`);
    const manyQuestions = Array.from({ length: 10 }, (_, i) => `Question ${i}?`);

    const output = {
      modules: manyModules,
      findings: manyFindings,
      relationships: manyRelationships,
      openQuestions: manyQuestions,
    };

    // Budget large enough for header but small enough to force heavy truncation
    // "## Round 2 Context" = 18 chars → use 80 to force trimming of most content
    const ctx = compressRoundOutput(2, output, 80, charTokens);

    // Everything should be heavily trimmed compared to original
    expect(ctx.modules.length).toBeLessThan(manyModules.length);
    expect(ctx.findings.length).toBeLessThan(manyFindings.length);
    expect(ctx.openQuestions.length).toBe(0); // trimmed first, all gone
    // Token count should be within the budget
    expect(ctx.tokenCount).toBeLessThanOrEqual(80);
  });
});
