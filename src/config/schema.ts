import { z } from 'zod';

/**
 * Zod schema for .handover.yml configuration.
 * Defaults make zero-config mode work — only ANTHROPIC_API_KEY is needed.
 */
export const HandoverConfigSchema = z.object({
  provider: z
    .enum([
      'anthropic',
      'openai',
      'ollama',
      'groq',
      'together',
      'deepseek',
      'azure-openai',
      'custom',
    ])
    .default('anthropic'),
  model: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  baseUrl: z.string().url().optional(),
  timeout: z.number().int().positive().optional(),
  output: z.string().default('./handover'),
  audience: z.enum(['human', 'ai']).default('human'),
  include: z.array(z.string()).default(['**/*']),
  exclude: z.array(z.string()).default([]),
  context: z.string().optional(),
  analysis: z
    .object({
      concurrency: z.number().int().positive().default(4),
      staticOnly: z.boolean().default(false),
    })
    .default({ concurrency: 4, staticOnly: false }),
  project: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      domain: z.string().optional(),
      teamSize: z.string().optional(),
      deployTarget: z.string().optional(),
    })
    .default({}),
  contextWindow: z
    .object({
      maxTokens: z.number().int().positive().optional(),
      pin: z.array(z.string()).default([]),
      boost: z.array(z.string()).default([]),
    })
    .default({ pin: [], boost: [] }),
  costWarningThreshold: z.number().positive().optional(),
  embedding: z
    .object({
      provider: z.enum(['openai']).default('openai'),
      model: z.string().default('text-embedding-3-small'),
      apiKeyEnv: z.string().optional(),
      batchSize: z.number().int().positive().default(100),
    })
    .optional(),
});

export type HandoverConfig = z.infer<typeof HandoverConfigSchema>;
