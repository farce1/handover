import { vi } from 'vitest';
import type { LLMProvider } from '../base.js';

/**
 * Creates a fully type-checked mock LLMProvider for use in unit tests.
 *
 * Usage in tests:
 *   import { createMockProvider } from '../providers/__mocks__/index.js';
 *   const provider = createMockProvider();
 *   provider.complete.mockResolvedValue({ data: {...}, usage: {...}, model: 'mock', duration: 0 });
 *
 * Convention: vi.hoisted() pattern
 *   When a test file needs to mock a module before imports resolve,
 *   use vi.hoisted() to create mock variables accessible inside vi.mock():
 *
 *   const mocks = vi.hoisted(() => ({
 *     complete: vi.fn(),
 *     estimateTokens: vi.fn().mockReturnValue(0),
 *     maxContextTokens: vi.fn().mockReturnValue(100_000),
 *   }));
 *
 *   vi.mock('../providers/base.js', () => ({
 *     // Factory has access to mocks because vi.hoisted runs before vi.mock
 *   }));
 */

// Typed mock for the complete() method (generic function — cast required to satisfy interface)
type CompleteFn = LLMProvider['complete'];

export function createMockProvider(
  overrides: {
    name?: string;
    complete?: CompleteFn;
    estimateTokens?: (text: string) => number;
    maxContextTokens?: () => number;
  } = {},
): LLMProvider {
  const defaultComplete = vi.fn().mockResolvedValue({
    data: {},
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
    model: 'mock',
    duration: 0,
  }) as unknown as CompleteFn;

  const defaultEstimateTokens = vi.fn().mockReturnValue(0) as unknown as (text: string) => number;

  const defaultMaxContextTokens = vi.fn().mockReturnValue(100_000) as unknown as () => number;

  return {
    name: overrides.name ?? 'mock',
    complete: overrides.complete ?? defaultComplete,
    estimateTokens: overrides.estimateTokens ?? defaultEstimateTokens,
    maxContextTokens: overrides.maxContextTokens ?? defaultMaxContextTokens,
  };
}
