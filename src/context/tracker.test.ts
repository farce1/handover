import { describe, it, expect } from 'vitest';
import { TokenUsageTracker } from './tracker.js';
import type { TokenUsage } from './types.js';

// ─── Helper ─────────────────────────────────────────────────────────────────

function mkUsage(
  round: number,
  input: number,
  output: number,
  budget = 10_000,
  extras?: Partial<TokenUsage>,
): TokenUsage {
  return {
    round,
    inputTokens: input,
    outputTokens: output,
    contextTokens: 0,
    fileContentTokens: 0,
    budgetTokens: budget,
    ...extras,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TokenUsageTracker', () => {
  // ─── State management ───────────────────────────────────────────────────

  describe('state management', () => {
    it('fresh tracker: zero state', () => {
      const tracker = new TokenUsageTracker();

      expect(tracker.getRoundCount()).toBe(0);
      expect(tracker.getLastRound()).toBeUndefined();
      expect(tracker.getTotalUsage()).toEqual({ input: 0, output: 0 });
    });

    it('single round: getRoundCount, getLastRound, getTotalUsage match recorded round', () => {
      const tracker = new TokenUsageTracker();
      const usage = mkUsage(1, 500, 200);
      tracker.recordRound(usage);

      expect(tracker.getRoundCount()).toBe(1);
      expect(tracker.getLastRound()).toEqual(usage);
      expect(tracker.getTotalUsage()).toEqual({ input: 500, output: 200 });
    });

    it('three rounds accumulate correctly', () => {
      const tracker = new TokenUsageTracker();
      // input: 100+200+300=600, output: 50+100+150=300
      tracker.recordRound(mkUsage(1, 100, 50));
      tracker.recordRound(mkUsage(2, 200, 100));
      tracker.recordRound(mkUsage(3, 300, 150));

      expect(tracker.getTotalUsage()).toEqual({ input: 600, output: 300 });
    });

    it('getRoundUsage returns correct round by number', () => {
      const tracker = new TokenUsageTracker();
      tracker.recordRound(mkUsage(1, 100, 50));
      tracker.recordRound(mkUsage(2, 200, 100));

      expect(tracker.getRoundUsage(1)?.inputTokens).toBe(100);
      expect(tracker.getRoundUsage(2)?.inputTokens).toBe(200);
    });

    it('getRoundUsage for nonexistent round returns undefined', () => {
      const tracker = new TokenUsageTracker();

      expect(tracker.getRoundUsage(99)).toBeUndefined();
    });

    it('getLastRound after multiple rounds returns final round', () => {
      const tracker = new TokenUsageTracker();
      tracker.recordRound(mkUsage(1, 100, 50));
      tracker.recordRound(mkUsage(2, 200, 100));
      tracker.recordRound(mkUsage(3, 300, 150));

      expect(tracker.getLastRound()?.round).toBe(3);
    });
  });

  // ─── Cost estimation ─────────────────────────────────────────────────────

  describe('estimateCost', () => {
    it('known model (claude-sonnet-4-5): correct formula — input=3, output=15 per million', () => {
      // 1M input * $3/M + 1M output * $15/M = 3 + 15 = 18
      const tracker = new TokenUsageTracker(0.85, 'claude-sonnet-4-5');

      expect(tracker.estimateCost(1_000_000, 1_000_000)).toBe(18);
    });

    it('unknown model falls back to default pricing — input=15, output=75 per million', () => {
      // default: $15 input + $75 output = $90
      const tracker = new TokenUsageTracker(0.85, 'nonexistent-model');

      expect(tracker.estimateCost(1_000_000, 1_000_000)).toBe(90);
    });

    it('zero tokens: cost is 0', () => {
      const tracker = new TokenUsageTracker();

      expect(tracker.estimateCost(0, 0)).toBe(0);
    });

    it('cache read tokens contribute at 0.1x input rate (default model)', () => {
      // default inputPerMillion=15, cacheRead=1M, rate=0.1
      // 1_000_000 / 1_000_000 * 15 * 0.1 = 1.5
      const tracker = new TokenUsageTracker(0.85, 'default');

      expect(tracker.estimateCost(0, 0, 1_000_000)).toBe(1.5);
    });

    it('cache creation tokens contribute at 1.25x input rate (default model)', () => {
      // default inputPerMillion=15, cacheCreate=1M, rate=1.25
      // 1_000_000 / 1_000_000 * 15 * 1.25 = 18.75
      const tracker = new TokenUsageTracker(0.85, 'default');

      expect(tracker.estimateCost(0, 0, 0, 1_000_000)).toBe(18.75);
    });

    it('combined: input + output + cacheRead + cacheCreation (claude-sonnet-4-5)', () => {
      // inputPerMillion=3, outputPerMillion=15
      // 1M input: 3, 1M output: 15
      // 1M cacheRead: 3 * 0.1 = 0.3
      // 1M cacheCreate: 3 * 1.25 = 3.75
      // total: 3 + 15 + 0.3 + 3.75 = 22.05
      const tracker = new TokenUsageTracker(0.85, 'claude-sonnet-4-5');

      expect(tracker.estimateCost(1_000_000, 1_000_000, 1_000_000, 1_000_000)).toBe(22.05);
    });
  });

  // ─── Cost aggregation ────────────────────────────────────────────────────

  describe('cost aggregation', () => {
    it('getRoundCost for existing round matches estimateCost of round values', () => {
      const tracker = new TokenUsageTracker(0.85, 'claude-sonnet-4-5');
      tracker.recordRound(mkUsage(1, 500_000, 100_000));

      const expected = tracker.estimateCost(500_000, 100_000);
      expect(tracker.getRoundCost(1)).toBe(expected);
    });

    it('getRoundCost for nonexistent round returns 0', () => {
      const tracker = new TokenUsageTracker();

      expect(tracker.getRoundCost(99)).toBe(0);
    });

    it('getTotalCost across multiple rounds equals sum of individual round costs', () => {
      const tracker = new TokenUsageTracker(0.85, 'claude-sonnet-4-5');
      tracker.recordRound(mkUsage(1, 500_000, 100_000));
      tracker.recordRound(mkUsage(2, 300_000, 50_000));

      const cost1 = tracker.getRoundCost(1);
      const cost2 = tracker.getRoundCost(2);
      expect(tracker.getTotalCost()).toBeCloseTo(cost1 + cost2);
    });
  });

  // ─── Cache savings ───────────────────────────────────────────────────────

  describe('getRoundCacheSavings', () => {
    it('no cache data: returns null', () => {
      const tracker = new TokenUsageTracker();
      tracker.recordRound(mkUsage(1, 1000, 500));

      expect(tracker.getRoundCacheSavings(1)).toBeNull();
    });

    it('with cacheReadTokens: returns savings with positive dollarsSaved and percentSaved', () => {
      const tracker = new TokenUsageTracker(0.85, 'default');
      // default inputPerMillion=15
      // tokensSaved = 5000, fullCostPerToken = 15/1e6, cacheReadCostPerToken = 15/1e6 * 0.1
      // dollarsSaved = 5000 * (15/1e6 - 1.5/1e6) = 5000 * 13.5/1e6 = 0.0000675
      tracker.recordRound(mkUsage(1, 1000, 500, 10_000, { cacheReadTokens: 5000 }));

      const savings = tracker.getRoundCacheSavings(1);
      expect(savings).not.toBeNull();
      expect(savings?.tokensSaved).toBe(5000);
      expect(savings?.dollarsSaved).toBeGreaterThan(0);
      expect(savings?.percentSaved).toBeGreaterThan(0);

      // Verify formula: dollarsSaved = cacheRead * (fullRate - cacheReadRate) / 1M
      const fullCostPerToken = 15 / 1_000_000;
      const cacheReadCostPerToken = fullCostPerToken * 0.1;
      const expectedDollarsSaved = 5000 * (fullCostPerToken - cacheReadCostPerToken);
      expect(savings?.dollarsSaved).toBeCloseTo(expectedDollarsSaved);
    });

    it('nonexistent round: returns null', () => {
      const tracker = new TokenUsageTracker();

      expect(tracker.getRoundCacheSavings(99)).toBeNull();
    });
  });

  // ─── Summary formatting ──────────────────────────────────────────────────

  describe('toSummary', () => {
    it('no rounds: returns sentinel string', () => {
      const tracker = new TokenUsageTracker();

      expect(tracker.toSummary()).toBe('No rounds recorded.');
    });

    it('single round: contains Round 1 line and Total line', () => {
      const tracker = new TokenUsageTracker();
      tracker.recordRound(mkUsage(1, 1000, 500));

      const summary = tracker.toSummary();
      expect(summary).toContain('Round 1:');
      expect(summary).toContain('Total:');
    });

    it('multiple rounds: contains per-round lines and total', () => {
      const tracker = new TokenUsageTracker();
      tracker.recordRound(mkUsage(1, 1000, 500));
      tracker.recordRound(mkUsage(2, 2000, 1000));
      tracker.recordRound(mkUsage(3, 3000, 1500));

      const summary = tracker.toSummary();
      expect(summary).toContain('Round 1:');
      expect(summary).toContain('Round 2:');
      expect(summary).toContain('Round 3:');
      expect(summary).toContain('Total:');
    });

    it('contains budget utilization percentage', () => {
      const tracker = new TokenUsageTracker();
      // 800/1000 = 80%
      tracker.recordRound(mkUsage(1, 800, 400, 1000));

      const summary = tracker.toSummary();
      expect(summary).toContain('80%');
    });
  });

  // ─── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('custom warn threshold: tracker accepts it without throwing', () => {
      // Threshold of 0.5 — record at 60% utilization (600/1000)
      // Should not throw; logger.warn may be triggered but we test no crash
      expect(() => {
        const tracker = new TokenUsageTracker(0.5);
        tracker.recordRound(mkUsage(1, 600, 300, 1000));
      }).not.toThrow();
    });

    it('default model is "default": estimateCost(1M, 1M) = 15 + 75 = 90', () => {
      // No model arg passed — falls through to 'default' pricing
      const tracker = new TokenUsageTracker();

      expect(tracker.estimateCost(1_000_000, 1_000_000)).toBe(90);
    });
  });
});
