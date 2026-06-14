import { describe, it, expect } from 'vitest';
import { formatTokens, formatCost, formatDuration, formatBar } from './formatters.js';

describe('formatTokens', () => {
  it('formats raw counts, thousands, and millions with integer vs decimal', () => {
    expect(formatTokens(342)).toBe('342 tokens');
    expect(formatTokens(48_000)).toBe('48K tokens');
    expect(formatTokens(1_234)).toBe('1.2K tokens');
    expect(formatTokens(1_000_000)).toBe('1M tokens');
    expect(formatTokens(1_500_000)).toBe('1.5M tokens');
  });
});

describe('formatCost', () => {
  it('always shows two decimals with a dollar sign', () => {
    expect(formatCost(0)).toBe('$0.00');
    expect(formatCost(1.239)).toBe('$1.24');
  });
});

describe('formatDuration', () => {
  it('formats seconds and minutes', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(83_000)).toBe('1m 23s');
  });
});

describe('formatBar', () => {
  it('fills proportionally and is always `width` chars wide', () => {
    const half = formatBar(0.5, 4);
    expect(half).toHaveLength(4);
    expect(new Set(half).size).toBe(2); // half filled, half empty
  });

  it('clamps progress into [0, 1]', () => {
    expect(new Set(formatBar(2, 5)).size).toBe(1); // all filled
    expect(formatBar(2, 5)).toHaveLength(5);
    expect(new Set(formatBar(-1, 5)).size).toBe(1); // all empty
  });
});
