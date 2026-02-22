const DEFAULT_LIMIT = 25;
const DEFAULT_LIMIT_CAP = 50;

interface CursorPayload {
  offset: number;
}

export interface PaginateResourcesOptions<T> {
  items: readonly T[];
  cursor?: string;
  limit?: number;
  defaultLimit?: number;
  maxLimit?: number;
}

export interface PaginateResourcesResult<T> {
  items: T[];
  nextCursor?: string;
}

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset } satisfies CursorPayload), 'utf-8').toString(
    'base64url',
  );
}

export function decodeCursor(cursor?: string): number {
  if (!cursor) {
    return 0;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  } catch {
    throw new Error('Cursor is not a valid base64url JSON payload');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('offset' in parsed) ||
    typeof parsed.offset !== 'number' ||
    !Number.isInteger(parsed.offset) ||
    parsed.offset < 0
  ) {
    throw new Error('Cursor payload is invalid');
  }

  return parsed.offset;
}

function clampLimit(limit: number, maxLimit: number): number {
  if (limit < 1) {
    return 1;
  }

  return Math.min(limit, maxLimit);
}

export function paginateResources<T>(
  options: PaginateResourcesOptions<T>,
): PaginateResourcesResult<T> {
  const maxLimit = options.maxLimit ?? DEFAULT_LIMIT_CAP;
  const requestedLimit = options.limit ?? options.defaultLimit ?? DEFAULT_LIMIT;
  const limit = clampLimit(requestedLimit, maxLimit);
  const startOffset = decodeCursor(options.cursor);
  const pageItems = options.items.slice(startOffset, startOffset + limit);
  const nextOffset = startOffset + pageItems.length;

  return {
    items: [...pageItems],
    nextCursor: nextOffset < options.items.length ? encodeCursor(nextOffset) : undefined,
  };
}
