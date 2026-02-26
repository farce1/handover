import { z } from 'zod';
import {
  DEFAULT_EMBEDDING_LOCAL_BASE_URL,
  DEFAULT_EMBEDDING_LOCALITY_MODE,
  EMBEDDING_LOCALITY_MODES,
} from '../vector/types.js';

const LocalEmbeddingConfigSchema = z.object({
  baseUrl: z.string().url().default(DEFAULT_EMBEDDING_LOCAL_BASE_URL),
  model: z.string().optional(),
  timeout: z.number().int().positive().optional(),
});

const EmbeddingConfigSchema = z
  .object({
    provider: z.enum(['openai']).default('openai'),
    model: z.string().default('text-embedding-3-small'),
    apiKeyEnv: z.string().optional(),
    batchSize: z.number().int().positive().default(100),
    mode: z.enum(EMBEDDING_LOCALITY_MODES).default(DEFAULT_EMBEDDING_LOCALITY_MODE),
    local: LocalEmbeddingConfigSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode !== 'remote-only' && !value.local?.model) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['local', 'model'],
        message:
          'embedding.local.model is required when embedding.mode is local-only or local-preferred',
      });
    }
  });

const ServeConfigSchema = z
  .object({
    transport: z.enum(['stdio', 'http']).default('stdio'),
    http: z
      .object({
        port: z.number().int().min(1).max(65535).default(3000),
        host: z.string().default('127.0.0.1'),
        path: z.string().regex(/^\//).default('/mcp'),
        allowedOrigins: z.array(z.string().min(1)).optional(),
        auth: z
          .object({
            token: z.string().min(1).optional(),
          })
          .optional(),
      })
      .default({}),
  })
  .default({});

/**
 * Zod schema for .handover.yml configuration.
 * Defaults make zero-config mode work — only ANTHROPIC_API_KEY is needed.
 */
export const HandoverConfigSchema = z
  .object({
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
    authMethod: z.enum(['api-key', 'subscription']).default('api-key'),
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
    embedding: EmbeddingConfigSchema.optional(),
    serve: ServeConfigSchema,
  })
  .superRefine((value, ctx) => {
    if (value.provider === 'anthropic' && value.authMethod === 'subscription') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['authMethod'],
        message: 'Anthropic does not support subscription auth - use authMethod: api-key',
      });
    }
  });

export type HandoverConfig = z.infer<typeof HandoverConfigSchema>;
