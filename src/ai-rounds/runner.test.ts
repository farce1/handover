import { describe, expect, test, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { executeRound } from './runner.js';
import { createMockProvider } from '../providers/__mocks__/index.js';
import { TokenUsageTracker } from '../context/tracker.js';
import { logger } from '../utils/logger.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a default ExecuteRoundOptions for a given provider */
function mkOptions<T>(
  provider: ReturnType<typeof createMockProvider>,
  overrides: Partial<Parameters<typeof executeRound<T>>[0]> = {},
): Parameters<typeof executeRound<T>>[0] {
  return {
    roundNumber: 1,
    provider,
    schema: z.any() as z.ZodType<T>,
    buildPrompt: () => ({
      systemPrompt: 'sys',
      userPrompt: 'user',
      model: 'mock',
      maxTokens: 1000,
    }),
    validate: () => ({ validated: 1, corrected: 0, total: 1, dropRate: 0 }),
    buildFallback: () => ({}) as T,
    tracker: new TokenUsageTracker(),
    estimateTokensFn: (t: string) => t.length,
    ...overrides,
  };
}

/**
 * Mock response data that matches CompletionResult shape AND passes quality check.
 * Round 1 quality thresholds: minTextLength=500, minCodeReferences=3, hasAnyFilePaths.
 * This data is intentionally rich to pass quality checks without triggering retry.
 */
const mockSuccessResponse = {
  data: {
    sections: [{ title: 'Overview', content: 'Project desc. '.repeat(40) }],
    signatures: ['function main(): void'],
    filePaths: ['src/index.ts', 'src/utils/logger.ts', 'src/providers/base.ts'],
    functions: ['function init(): void', 'function cleanup(): void', 'class MyClass'],
  },
  usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
  model: 'mock',
  duration: 0,
};

// ─── executeRound() tests ─────────────────────────────────────────────────────

describe('executeRound', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('happy path: returns status success with tool_use mock response data', async () => {
    const provider = createMockProvider();
    (provider.complete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSuccessResponse);

    const result = await executeRound(mkOptions(provider));

    expect(result.status).toBe('success');
    expect(result.data).toEqual(mockSuccessResponse.data);
    expect(result.validation.dropRate).toBe(0);
    expect(result.quality).toBeDefined();
    expect(result.context.roundNumber).toBe(1);
  });

  test('degraded path: provider throw returns status degraded with fallback data and validation zeros', async () => {
    const provider = createMockProvider();
    (provider.complete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('API unavailable'),
    );

    const fallbackData = { fallback: true };
    const result = await executeRound(
      mkOptions(provider, {
        buildFallback: () => fallbackData,
      }),
    );

    expect(result.status).toBe('degraded');
    expect(result.validation).toEqual({ validated: 0, corrected: 0, total: 0, dropRate: 0 });
    expect(result.quality.isAcceptable).toBe(false);
    expect(result.data).toEqual(fallbackData);
  });

  test('degraded result is idempotent: same input always produces same fallback structure', async () => {
    const fallbackData = { fallback: true, id: 42 };

    const runDegraded = async () => {
      const provider = createMockProvider();
      (provider.complete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('API unavailable'),
      );
      return executeRound(mkOptions(provider, { buildFallback: () => fallbackData }));
    };

    const result1 = await runDegraded();
    const result2 = await runDegraded();

    expect(result1.status).toBe('degraded');
    expect(result2.status).toBe('degraded');
    expect(result1.validation).toEqual(result2.validation);
    expect(result1.quality.isAcceptable).toBe(result2.quality.isAcceptable);
    expect(result1.data).toEqual(result2.data);
  });

  test('retry on high drop rate: triggers single retry then returns status retried', async () => {
    const provider = createMockProvider();
    (provider.complete as ReturnType<typeof vi.fn>).mockResolvedValue(mockSuccessResponse);

    let callCount = 0;
    const validate = () => {
      callCount++;
      if (callCount === 1) {
        return { validated: 0, corrected: 3, total: 6, dropRate: 0.5 };
      }
      return { validated: 1, corrected: 0, total: 1, dropRate: 0 };
    };

    const result = await executeRound(mkOptions(provider, { validate }));

    expect(result.status).toBe('retried');
    expect((provider.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  test('retry on quality failure: triggers single retry then returns status retried', async () => {
    const provider = createMockProvider();

    // First response: minimal data that fails quality check (no file paths, short text)
    const poorResponse = {
      data: { note: 'short' },
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
      model: 'mock',
      duration: 0,
    };

    // Second response: richer data that passes quality check
    // Round 1 requires: textLength >= 500, codeReferences >= 3, hasAnyFilePaths
    const richText = 'a'.repeat(600);
    const richResponse = {
      data: {
        description: richText,
        filePaths: ['src/index.ts', 'src/utils/logger.ts', 'src/providers/base.ts'],
        classes: ['class MyClass', 'class AnotherClass'],
        functions: ['function main(): void', 'function helper(): string', 'function init(): void'],
      },
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
      model: 'mock',
      duration: 0,
    };

    (provider.complete as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(poorResponse)
      .mockResolvedValueOnce(richResponse);

    // validate always passes (dropRate = 0) to isolate quality failure
    const validate = () => ({ validated: 1, corrected: 0, total: 1, dropRate: 0 });

    const result = await executeRound(mkOptions(provider, { validate }));

    expect(result.status).toBe('retried');
  });

  test('degraded path: warning message contains round number and error text', async () => {
    const provider = createMockProvider();
    (provider.complete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('API unavailable'),
    );

    const warnSpy = vi.spyOn(logger, 'warn');

    await executeRound(mkOptions(provider, { roundNumber: 3 }));

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('API unavailable'));
  });
});
