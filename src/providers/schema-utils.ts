import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Convert a Zod schema to a JSON Schema object suitable for LLM tool parameters.
 * Handles both schemas that produce definitions and those that don't.
 */
export function zodToToolSchema<T>(schema: z.ZodType<T>): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, 'response');
  return (jsonSchema as Record<string, unknown>).definitions
    ? ((jsonSchema as Record<string, Record<string, unknown>>).definitions?.response as Record<string, unknown>)
    : (jsonSchema as Record<string, unknown>);
}
