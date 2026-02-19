import { describe, expect, test } from 'vitest';
import type { LLMProvider } from '../providers/base.js';
import { computeTokenBudget, estimateTokens } from './token-counter.js';

// ─── computeTokenBudget() tests ──────────────────────────────────────────────

describe('computeTokenBudget()', () => {
  test('default values for standard 100k window', () => {
    const result = computeTokenBudget(100_000);
    expect(result.total).toBe(100_000);
    expect(result.promptOverhead).toBe(3000);
    expect(result.outputReserve).toBe(4096);
    expect(result.fileContentBudget).toBe(Math.floor((100_000 - 3000 - 4096) * 0.9));
  });

  test.each([
    { maxTokens: 8_000, promptOverhead: 3000, outputReserve: 4096, safetyMargin: 0.9 },
    { maxTokens: 200_000, promptOverhead: 3000, outputReserve: 4096, safetyMargin: 0.9 },
    { maxTokens: 16_000, promptOverhead: 5000, outputReserve: 2048, safetyMargin: 0.8 },
  ])(
    'custom options: maxTokens=$maxTokens, overhead=$promptOverhead, reserve=$outputReserve, margin=$safetyMargin',
    ({ maxTokens, promptOverhead, outputReserve, safetyMargin }) => {
      const isDefault = promptOverhead === 3000 && outputReserve === 4096 && safetyMargin === 0.9;
      const result = isDefault
        ? computeTokenBudget(maxTokens)
        : computeTokenBudget(maxTokens, { promptOverhead, outputReserve, safetyMargin });
      // Compute expected using the same formula as the implementation
      const expected = Math.floor((maxTokens - promptOverhead - outputReserve) * safetyMargin);
      expect(result.fileContentBudget).toBe(expected);
      expect(result.total).toBe(maxTokens);
      expect(result.promptOverhead).toBe(promptOverhead);
      expect(result.outputReserve).toBe(outputReserve);
    },
  );

  test('zero maxTokens: does not throw, budget goes negative', () => {
    // Documents actual behavior: no guard against negative budgets
    expect(() => computeTokenBudget(0)).not.toThrow();
    const result = computeTokenBudget(0);
    expect(result.total).toBe(0);
    // (0 - 3000 - 4096) * 0.9 = -6386.4 -> Math.floor = -6387
    expect(result.fileContentBudget).toBe(Math.floor((0 - 3000 - 4096) * 0.9));
  });

  test('overhead exceeds window: intermediate is negative, no guard applied', () => {
    // maxTokens=1000, overhead=500, reserve=600 => (1000-500-600)*0.9 = -90
    // The function does not guard against negative values — test documents actual behavior
    const result = computeTokenBudget(1000, {
      promptOverhead: 500,
      outputReserve: 600,
      safetyMargin: 0.9,
    });
    expect(result.fileContentBudget).toBe(Math.floor((1000 - 500 - 600) * 0.9));
    // Verify this is negative (documenting the behavior, not endorsing it)
    expect(result.fileContentBudget).toBeLessThan(0);
  });

  test('all-zero options: fileContentBudget equals maxTokens', () => {
    const result = computeTokenBudget(100_000, {
      promptOverhead: 0,
      outputReserve: 0,
      safetyMargin: 1.0,
    });
    expect(result.fileContentBudget).toBe(100_000);
  });
});

// ─── estimateTokens() tests ──────────────────────────────────────────────────

describe('estimateTokens()', () => {
  test('chars/4 heuristic without provider: 400 chars = 100 tokens', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  test('empty string returns 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  test('rounds up fractional: 3 chars returns 1 (ceil(3/4))', () => {
    expect(estimateTokens('abc')).toBe(1);
  });

  test('single character returns 1', () => {
    expect(estimateTokens('x')).toBe(1);
  });

  test('delegates to provider: ignores text content, returns provider result', () => {
    const mockProvider = { estimateTokens: () => 42 } as unknown as LLMProvider;
    // Provider result is returned regardless of text length
    expect(estimateTokens('hello world', mockProvider)).toBe(42);
    expect(estimateTokens('a'.repeat(10_000), mockProvider)).toBe(42);
  });

  test('long string: 1 million chars = 250,000 tokens (linear heuristic)', () => {
    expect(estimateTokens('a'.repeat(1_000_000))).toBe(250_000);
  });
});
