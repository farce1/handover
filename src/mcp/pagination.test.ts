import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, paginateResources } from './pagination.js';

describe('cursor encoding', () => {
  it('round-trips an offset', () => {
    expect(decodeCursor(encodeCursor(7))).toBe(7);
  });

  it('treats a missing cursor as offset 0', () => {
    expect(decodeCursor(undefined)).toBe(0);
  });

  it('rejects a malformed cursor', () => {
    expect(() => decodeCursor('not-base64-json!!')).toThrow();
  });

  it('rejects a negative offset payload', () => {
    expect(() => decodeCursor(encodeCursor(-1))).toThrow();
  });
});

describe('paginateResources', () => {
  const items = Array.from({ length: 10 }, (_, i) => i + 1);

  it('returns the first page and a cursor to the next', () => {
    const page = paginateResources({ items, limit: 3 });
    expect(page.items).toEqual([1, 2, 3]);
    expect(decodeCursor(page.nextCursor)).toBe(3);
  });

  it('resumes from a cursor', () => {
    const page = paginateResources({ items, cursor: encodeCursor(3), limit: 3 });
    expect(page.items).toEqual([4, 5, 6]);
  });

  it('omits nextCursor on the final page', () => {
    const page = paginateResources({ items, cursor: encodeCursor(9), limit: 3 });
    expect(page.items).toEqual([10]);
    expect(page.nextCursor).toBeUndefined();
  });

  it('returns nothing past the end', () => {
    const page = paginateResources({ items, cursor: encodeCursor(100), limit: 3 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeUndefined();
  });

  it('clamps the limit to maxLimit', () => {
    const page = paginateResources({ items, limit: 999, maxLimit: 5 });
    expect(page.items).toHaveLength(5);
  });

  it('clamps a non-positive limit up to 1', () => {
    const page = paginateResources({ items, limit: 0 });
    expect(page.items).toEqual([1]);
  });
});
