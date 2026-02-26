import { describe, expect, test } from 'vitest';
import { HandoverConfigSchema } from './schema.js';

describe('HandoverConfigSchema', () => {
  describe('safeParse({}) returns all defaults', () => {
    test('parses empty object successfully with all defaults', () => {
      const result = HandoverConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.provider).toBe('anthropic');
      expect(result.data.output).toBe('./handover');
      expect(result.data.audience).toBe('human');
      expect(result.data.analysis.concurrency).toBe(4);
      expect(result.data.analysis.staticOnly).toBe(false);
      expect(result.data.contextWindow.pin).toEqual([]);
      expect(result.data.contextWindow.boost).toEqual([]);
      expect(result.data.project).toEqual({});
      expect(result.data.include).toEqual(['**/*']);
      expect(result.data.exclude).toEqual([]);
    });
  });

  describe('valid full config', () => {
    test('parses a complete config object with all fields set to non-default values', () => {
      const input = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKeyEnv: 'MY_API_KEY',
        baseUrl: 'https://api.openai.com/v1',
        timeout: 30,
        output: './docs/handover',
        audience: 'ai',
        include: ['src/**/*.ts'],
        exclude: ['**/node_modules/**'],
        context: 'Large monorepo with multiple services',
        analysis: { concurrency: 8, staticOnly: true },
        project: {
          name: 'My Project',
          description: 'A great project',
          domain: 'web',
          teamSize: '10-50',
          deployTarget: 'AWS',
        },
        contextWindow: {
          maxTokens: 100000,
          pin: ['README.md'],
          boost: ['src/index.ts'],
        },
        costWarningThreshold: 5.0,
      };

      const result = HandoverConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.provider).toBe('openai');
      expect(result.data.model).toBe('gpt-4o');
      expect(result.data.apiKeyEnv).toBe('MY_API_KEY');
      expect(result.data.baseUrl).toBe('https://api.openai.com/v1');
      expect(result.data.timeout).toBe(30);
      expect(result.data.output).toBe('./docs/handover');
      expect(result.data.audience).toBe('ai');
      expect(result.data.include).toEqual(['src/**/*.ts']);
      expect(result.data.exclude).toEqual(['**/node_modules/**']);
      expect(result.data.context).toBe('Large monorepo with multiple services');
      expect(result.data.analysis.concurrency).toBe(8);
      expect(result.data.analysis.staticOnly).toBe(true);
      expect(result.data.project.name).toBe('My Project');
      expect(result.data.project.description).toBe('A great project');
      expect(result.data.project.domain).toBe('web');
      expect(result.data.project.teamSize).toBe('10-50');
      expect(result.data.project.deployTarget).toBe('AWS');
      expect(result.data.contextWindow.maxTokens).toBe(100000);
      expect(result.data.contextWindow.pin).toEqual(['README.md']);
      expect(result.data.contextWindow.boost).toEqual(['src/index.ts']);
      expect(result.data.costWarningThreshold).toBe(5.0);
    });
  });

  describe('invalid provider rejects', () => {
    test('rejects unknown provider value', () => {
      const result = HandoverConfigSchema.safeParse({ provider: 'invalid-provider' });
      expect(result.success).toBe(false);
    });
  });

  describe('invalid timeout rejects', () => {
    test.each([
      { timeout: -1, label: 'negative integer' },
      { timeout: 0, label: 'zero' },
      { timeout: 1.5, label: 'non-integer float' },
    ])('rejects timeout=$timeout ($label)', ({ timeout }) => {
      const result = HandoverConfigSchema.safeParse({ timeout });
      expect(result.success).toBe(false);
    });
  });

  describe('invalid baseUrl rejects', () => {
    test('rejects non-URL string for baseUrl', () => {
      const result = HandoverConfigSchema.safeParse({ baseUrl: 'not-a-url' });
      expect(result.success).toBe(false);
    });
  });

  describe('optional fields accept undefined', () => {
    test('model, apiKeyEnv, baseUrl, timeout, context, costWarningThreshold are all optional', () => {
      const result = HandoverConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.model).toBeUndefined();
      expect(result.data.apiKeyEnv).toBeUndefined();
      expect(result.data.baseUrl).toBeUndefined();
      expect(result.data.timeout).toBeUndefined();
      expect(result.data.context).toBeUndefined();
      expect(result.data.costWarningThreshold).toBeUndefined();
    });
  });

  describe('all valid providers', () => {
    test.each([
      'anthropic',
      'openai',
      'ollama',
      'groq',
      'together',
      'deepseek',
      'azure-openai',
      'custom',
    ] as const)('accepts provider=%s', (provider) => {
      const result = HandoverConfigSchema.safeParse({ provider });
      expect(result.success).toBe(true);
    });
  });

  describe('nested object defaults', () => {
    test('safeParse({ analysis: {} }) fills in concurrency and staticOnly defaults', () => {
      const result = HandoverConfigSchema.safeParse({ analysis: {} });
      expect(result.success).toBe(true);
      if (!result.success) return;
      // Zod v4: inner field defaults apply even when parent object is provided empty
      expect(result.data.analysis.concurrency).toBe(4);
      expect(result.data.analysis.staticOnly).toBe(false);
    });
  });

  describe('authMethod field', () => {
    test('defaults to api-key when not specified', () => {
      const result = HandoverConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.authMethod).toBe('api-key');
    });

    test('accepts api-key value', () => {
      const result = HandoverConfigSchema.safeParse({ authMethod: 'api-key' });
      expect(result.success).toBe(true);
    });

    test('accepts subscription value', () => {
      const result = HandoverConfigSchema.safeParse({
        provider: 'openai',
        authMethod: 'subscription',
      });
      expect(result.success).toBe(true);
    });

    test('rejects invalid authMethod values', () => {
      const result = HandoverConfigSchema.safeParse({ authMethod: 'oauth' });
      expect(result.success).toBe(false);
    });

    test('rejects anthropic with subscription auth', () => {
      const result = HandoverConfigSchema.safeParse({
        provider: 'anthropic',
        authMethod: 'subscription',
      });
      expect(result.success).toBe(false);
      if (result.success) return;

      const issue = result.error.issues.find((candidate) =>
        candidate.message.includes('Anthropic does not support subscription auth'),
      );

      expect(issue).toBeDefined();
      expect(issue?.path).toEqual(['authMethod']);
    });

    test('accepts anthropic with api-key auth', () => {
      const result = HandoverConfigSchema.safeParse({
        provider: 'anthropic',
        authMethod: 'api-key',
      });
      expect(result.success).toBe(true);
    });

    test('accepts openai with subscription auth', () => {
      const result = HandoverConfigSchema.safeParse({
        provider: 'openai',
        authMethod: 'subscription',
      });
      expect(result.success).toBe(true);
    });

    test('safeParse({}) keeps backward-compatible defaults', () => {
      const result = HandoverConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.provider).toBe('anthropic');
      expect(result.data.authMethod).toBe('api-key');
      expect(result.data.output).toBe('./handover');
      expect(result.data.audience).toBe('human');
      expect(result.data.analysis.concurrency).toBe(4);
      expect(result.data.analysis.staticOnly).toBe(false);
      expect(result.data.include).toEqual(['**/*']);
      expect(result.data.exclude).toEqual([]);
    });
  });
});
