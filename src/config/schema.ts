import { z } from 'zod';

/**
 * Zod schema for .handover.yml configuration.
 * Defaults make zero-config mode work — only ANTHROPIC_API_KEY is needed.
 */
export const HandoverConfigSchema = z.object({
  provider: z
    .enum(['anthropic', 'openai', 'ollama', 'custom'])
    .default('anthropic'),
  model: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  output: z.string().default('./handover'),
  include: z.array(z.string()).default(['**/*']),
  exclude: z.array(z.string()).default([]),
  context: z.string().optional(),
  analysis: z
    .object({
      concurrency: z.number().int().positive().default(4),
      staticOnly: z.boolean().default(false),
    })
    .default({}),
  project: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      domain: z.string().optional(),
      teamSize: z.string().optional(),
      deployTarget: z.string().optional(),
    })
    .default({}),
});

export type HandoverConfig = z.infer<typeof HandoverConfigSchema>;
