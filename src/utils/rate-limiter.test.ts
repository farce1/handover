import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff, RateLimiter } from './rate-limiter.js';
import { ProviderError } from './errors.js';

// ─── retryWithBackoff() tests ─────────────────────────────────────────────────

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('succeeds on first try: returns result, fn called once', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 30_000 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('fails with 429 status, succeeds on retry: fn called twice, returns ok', async () => {
    const rateLimitedError = { status: 429, message: 'Rate limited' };
    const fn = vi.fn().mockRejectedValueOnce(rateLimitedError).mockResolvedValueOnce('ok');

    const promise = retryWithBackoff(fn, { maxRetries: 1, baseDelayMs: 30_000 });
    // Advance past max jitter window (baseDelayMs * 1.5 = 45000ms) for attempt 0
    await vi.advanceTimersByTimeAsync(45_000);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('fails with non-retryable error: throws immediately, fn called once', async () => {
    // Non-retryable error (no .status field) — breaks out of loop on first failure,
    // then throws ProviderError.rateLimited() (the source wraps all non-ProviderError exits)
    const nonRetryableError = new Error('Not a rate limit error');
    const fn = vi.fn().mockRejectedValue(nonRetryableError);

    // The function breaks on first non-retryable failure and re-throws as ProviderError
    await expect(
      retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 30_000 }),
    ).rejects.toBeInstanceOf(ProviderError);
    // fn is only called once — no retries for non-retryable errors
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('all retries exhausted: throws ProviderError', async () => {
    const rateLimitedError = { status: 429, message: 'Rate limited' };
    const fn = vi.fn().mockRejectedValue(rateLimitedError);

    let caughtError: unknown;
    const promise = retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 30_000 }).catch(
      (err: unknown) => {
        caughtError = err;
      },
    );

    // Attempt 0 delay: max 45_000ms (30_000 * 1 * 1.5)
    await vi.advanceTimersByTimeAsync(45_000);
    // Attempt 1 delay: max 90_000ms (30_000 * 2 * 1.5)
    await vi.advanceTimersByTimeAsync(90_000);

    await promise;

    expect(caughtError).toBeInstanceOf(ProviderError);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  test('maxRetries 0: throws on first failure without retrying', async () => {
    const rateLimitedError = { status: 429, message: 'Rate limited' };
    const fn = vi.fn().mockRejectedValue(rateLimitedError);

    await expect(
      retryWithBackoff(fn, { maxRetries: 0, baseDelayMs: 30_000 }),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('onRetry callback is called with correct attempt number and delay', async () => {
    const rateLimitedError = { status: 429, message: 'Rate limited' };
    const fn = vi.fn().mockRejectedValueOnce(rateLimitedError).mockResolvedValueOnce('ok');

    const onRetry = vi.fn();

    const promise = retryWithBackoff(fn, { maxRetries: 1, baseDelayMs: 30_000, onRetry });
    await vi.advanceTimersByTimeAsync(45_000);
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      1, // attempt number
      expect.any(Number), // delay in ms
      expect.any(String), // reason
    );
  });

  test('custom isRetryable controls which errors are retried', async () => {
    const customError = new Error('Custom retryable');
    const fn = vi.fn().mockRejectedValueOnce(customError).mockResolvedValueOnce('ok');

    const isRetryable = (err: unknown) =>
      err instanceof Error && err.message === 'Custom retryable';

    const promise = retryWithBackoff(fn, {
      maxRetries: 1,
      baseDelayMs: 30_000,
      isRetryable,
    });
    await vi.advanceTimersByTimeAsync(45_000);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ─── RateLimiter tests ────────────────────────────────────────────────────────

describe('RateLimiter', () => {
  test('acquire() resolves immediately when under limit', async () => {
    const limiter = new RateLimiter(3);

    // Should resolve immediately without blocking
    await expect(limiter.acquire()).resolves.toBeUndefined();
    limiter.release();
  });

  test('withLimit() executes function and returns result', async () => {
    const limiter = new RateLimiter(2);

    const result = await limiter.withLimit(async () => 'hello');

    expect(result).toBe('hello');
  });

  test('acquire() queues when at capacity, resolves after release()', async () => {
    const limiter = new RateLimiter(1);

    // Acquire the only slot
    await limiter.acquire();

    let resolved = false;

    // Second acquire should wait
    const secondAcquire = limiter.acquire().then(() => {
      resolved = true;
    });

    // Not yet resolved (at capacity)
    expect(resolved).toBe(false);

    // Release the slot — should allow next to proceed
    limiter.release();
    await secondAcquire;

    expect(resolved).toBe(true);

    // Clean up
    limiter.release();
  });

  test('withLimit() releases slot even if function throws', async () => {
    const limiter = new RateLimiter(1);

    await expect(
      limiter.withLimit(async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');

    // Slot should be released — next acquire should work
    await expect(limiter.withLimit(async () => 'ok')).resolves.toBe('ok');
  });
});
