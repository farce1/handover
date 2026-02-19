import { describe, expect, test } from 'vitest';
import {
  resolveSelectedDocs,
  computeRequiredRounds,
  DOCUMENT_REGISTRY,
  GROUP_ALIASES,
  ROUND_DEPS,
} from './registry.js';
import { HandoverError } from '../utils/errors.js';

describe('resolveSelectedDocs()', () => {
  describe('undefined onlyFlag returns all documents', () => {
    test('returns the full registry when onlyFlag is undefined', () => {
      const result = resolveSelectedDocs(undefined, DOCUMENT_REGISTRY);
      expect(result).toHaveLength(DOCUMENT_REGISTRY.length);
    });
  });

  describe('resolves single known alias', () => {
    test('resolves "overview" to the 01-project-overview doc', () => {
      const result = resolveSelectedDocs('overview', DOCUMENT_REGISTRY);
      const ids = result.map((d) => d.id);
      expect(ids).toContain('01-project-overview');
    });
  });

  describe('always includes INDEX', () => {
    test('single-alias call always includes 00-index', () => {
      const result = resolveSelectedDocs('overview', DOCUMENT_REGISTRY);
      const ids = result.map((d) => d.id);
      expect(ids).toContain('00-index');
    });
  });

  describe('resolves group alias "core"', () => {
    test('resolves "core" to arch, modules, and features docs', () => {
      const result = resolveSelectedDocs('core', DOCUMENT_REGISTRY);
      const ids = result.map((d) => d.id);
      // core = ['arch', 'modules', 'features']
      expect(ids).toContain('03-architecture');
      expect(ids).toContain('06-modules');
      expect(ids).toContain('05-features');
    });
  });

  describe('test.each for all group aliases', () => {
    test.each(Object.keys(GROUP_ALIASES))('group alias "%s" resolves to expected docs', (group) => {
      const result = resolveSelectedDocs(group, DOCUMENT_REGISTRY);
      const resultIds = result.map((d) => d.id);
      const groupAliases = GROUP_ALIASES[group];

      for (const alias of groupAliases) {
        const expectedDoc = DOCUMENT_REGISTRY.find((d) => d.aliases.includes(alias));
        if (expectedDoc) {
          expect(resultIds).toContain(expectedDoc.id);
        }
      }
    });
  });

  describe('handles comma-separated aliases', () => {
    test('resolves "overview,arch" to both docs plus INDEX', () => {
      const result = resolveSelectedDocs('overview,arch', DOCUMENT_REGISTRY);
      const ids = result.map((d) => d.id);
      expect(ids).toContain('01-project-overview');
      expect(ids).toContain('03-architecture');
      expect(ids).toContain('00-index');
    });
  });

  describe('throws HandoverError for unknown alias', () => {
    test('throws HandoverError when alias does not match any doc or group', () => {
      expect(() => resolveSelectedDocs('badAlias', DOCUMENT_REGISTRY)).toThrow(HandoverError);
    });
  });

  describe('error message names the invalid alias', () => {
    test('error message includes the unknown alias name', () => {
      expect(() => resolveSelectedDocs('unknown-doc', DOCUMENT_REGISTRY)).toThrow('unknown-doc');
    });
  });

  describe('error message lists valid aliases', () => {
    test('error message includes "Valid aliases" suggestion text', () => {
      let caughtError: unknown;
      try {
        resolveSelectedDocs('not-a-real-alias', DOCUMENT_REGISTRY);
      } catch (err) {
        caughtError = err;
      }
      expect(caughtError).toBeInstanceOf(HandoverError);
      const handoverErr = caughtError as HandoverError;
      // The suggestion text is in the HandoverError fix field or message
      const fullText = `${handoverErr.message} ${handoverErr.fix}`;
      expect(fullText).toContain('Valid aliases');
    });
  });

  describe('whitespace handling', () => {
    test('handles spaces around commas in comma-separated aliases', () => {
      const result = resolveSelectedDocs('overview , arch', DOCUMENT_REGISTRY);
      const ids = result.map((d) => d.id);
      expect(ids).toContain('01-project-overview');
      expect(ids).toContain('03-architecture');
    });
  });
});

describe('computeRequiredRounds()', () => {
  describe('returns empty set for index-only selection', () => {
    test('index doc (requiredRounds: []) produces empty set', () => {
      const indexDoc = DOCUMENT_REGISTRY.find((d) => d.id === '00-index');
      expect(indexDoc).toBeDefined();
      const result = computeRequiredRounds([indexDoc!]);
      expect(result.size).toBe(0);
    });
  });

  describe('single doc with one round', () => {
    test('07-dependencies (requiredRounds: [1]) produces set {1}', () => {
      const depsDoc = DOCUMENT_REGISTRY.find((d) => d.id === '07-dependencies');
      expect(depsDoc).toBeDefined();
      const result = computeRequiredRounds([depsDoc!]);
      expect(result.has(1)).toBe(true);
      expect(result.size).toBe(1);
    });
  });

  describe('expands transitive dependencies for architecture', () => {
    test('03-architecture (requiredRounds: [1,2,3,4]) expands to all of 1,2,3,4', () => {
      const archDoc = DOCUMENT_REGISTRY.find((d) => d.id === '03-architecture');
      expect(archDoc).toBeDefined();
      const result = computeRequiredRounds([archDoc!]);
      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.has(3)).toBe(true);
      expect(result.has(4)).toBe(true);
    });
  });

  describe('test.each for documents with known round requirements', () => {
    test.each([
      { docId: '07-dependencies', expectedRounds: [1] },
      { docId: '04-file-structure', expectedRounds: [1, 2] },
      { docId: '05-features', expectedRounds: [1, 2, 3] },
      { docId: '03-architecture', expectedRounds: [1, 2, 3, 4] },
      { docId: '02-getting-started', expectedRounds: [1, 2, 6] },
    ])('$docId produces rounds $expectedRounds', ({ docId, expectedRounds }) => {
      const doc = DOCUMENT_REGISTRY.find((d) => d.id === docId);
      expect(doc).toBeDefined();
      const result = computeRequiredRounds([doc!]);
      for (const round of expectedRounds) {
        expect(result.has(round)).toBe(true);
      }
    });
  });

  describe('multiple docs union their round requirements', () => {
    test('overview + getting-started produces rounds {1, 2, 6}', () => {
      const overviewDoc = DOCUMENT_REGISTRY.find((d) => d.id === '01-project-overview');
      const gettingStartedDoc = DOCUMENT_REGISTRY.find((d) => d.id === '02-getting-started');
      expect(overviewDoc).toBeDefined();
      expect(gettingStartedDoc).toBeDefined();
      // overview: [1], getting-started: [1, 6], round 6 deps: [1, 2]
      const result = computeRequiredRounds([overviewDoc!, gettingStartedDoc!]);
      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.has(6)).toBe(true);
    });
  });

  describe('ROUND_DEPS structure', () => {
    test('ROUND_DEPS[1] is empty (round 1 has no dependencies)', () => {
      expect(ROUND_DEPS[1]).toEqual([]);
    });

    test('ROUND_DEPS[4] contains [1, 2, 3]', () => {
      expect(ROUND_DEPS[4]).toContain(1);
      expect(ROUND_DEPS[4]).toContain(2);
      expect(ROUND_DEPS[4]).toContain(3);
    });
  });
});
