import { describe, it, expect } from 'vitest';
import {
  buildTable,
  codeRef,
  sectionIntro,
  crossRef,
  buildFrontMatter,
  determineDocStatus,
} from './utils.js';

// ─── buildTable ──────────────────────────────────────────────────────────────

describe('buildTable()', () => {
  it('produces correct markdown table with header, separator, and one data row', () => {
    const result = buildTable(['Name', 'Type'], [['foo', 'string']]);
    expect(result).toBe('| Name | Type |\n| --- | --- |\n| foo | string |');
  });

  it('produces correct markdown table with multiple rows', () => {
    const result = buildTable(
      ['K', 'V'],
      [
        ['a', '1'],
        ['b', '2'],
      ],
    );
    expect(result).toBe('| K | V |\n| --- | --- |\n| a | 1 |\n| b | 2 |');
  });

  it('returns only header and separator when rows is empty', () => {
    const result = buildTable(['A', 'B'], []);
    expect(result).toBe('| A | B |\n| --- | --- |');
  });

  it('escapes pipe characters in cell content', () => {
    const result = buildTable(['Cmd'], [['a | b']]);
    expect(result).toContain('a \\| b');
  });

  it('handles single column tables correctly', () => {
    const result = buildTable(['X'], [['val1'], ['val2']]);
    expect(result).toBe('| X |\n| --- |\n| val1 |\n| val2 |');
  });

  it('preserves special characters without HTML escaping (only pipe-escapes)', () => {
    const result = buildTable(['Name'], [['<script>alert("xss")</script>']]);
    expect(result).toContain('<script>alert("xss")</script>');
  });
});

// ─── codeRef ─────────────────────────────────────────────────────────────────

describe('codeRef()', () => {
  it('wraps file path in backticks without line number', () => {
    const result = codeRef('src/foo.ts');
    expect(result).toBe('`src/foo.ts`');
  });

  it('appends :L{line} for line number references', () => {
    const result = codeRef('src/foo.ts', 42);
    expect(result).toBe('`src/foo.ts:L42`');
  });

  it('normalizes leading ./ from file paths', () => {
    const result = codeRef('./src/bar.ts');
    expect(result).toBe('`src/bar.ts`');
  });

  it('normalizes leading / from file paths', () => {
    const result = codeRef('/src/bar.ts');
    expect(result).toBe('`src/bar.ts`');
  });

  it('treats line 0 as valid line number', () => {
    const result = codeRef('file.ts', 0);
    expect(result).toBe('`file.ts:L0`');
  });
});

// ─── sectionIntro ────────────────────────────────────────────────────────────

describe('sectionIntro()', () => {
  it('returns text with trailing newline', () => {
    const result = sectionIntro('Hello world');
    expect(result).toBe('Hello world\n');
  });

  it('preserves special characters in markdown content', () => {
    const result = sectionIntro('Uses `async/await` for I/O');
    expect(result).toBe('Uses `async/await` for I/O\n');
  });

  it('returns just newline for empty string input', () => {
    const result = sectionIntro('');
    expect(result).toBe('\n');
  });

  it('appends another newline when text already ends with newline', () => {
    const result = sectionIntro('text\n');
    expect(result).toBe('text\n\n');
  });
});

// ─── crossRef ────────────────────────────────────────────────────────────────

describe('crossRef()', () => {
  it('builds a markdown link with display text derived from docId', () => {
    // strips leading digits+dash, replaces dashes with spaces, title-cases each word
    // all-caps remaining word stays uppercase (title-case only uppercases first char of word)
    const result = crossRef('03-ARCHITECTURE');
    expect(result).toBe('[ARCHITECTURE](03-ARCHITECTURE.md)');
  });

  it('appends anchor when provided', () => {
    const result = crossRef('03-ARCHITECTURE', 'patterns');
    expect(result).toBe('[ARCHITECTURE](03-ARCHITECTURE.md#patterns)');
  });

  it('uses custom text when provided', () => {
    const result = crossRef('03-ARCHITECTURE', undefined, 'Arch docs');
    expect(result).toBe('[Arch docs](03-ARCHITECTURE.md)');
  });

  it('title-cases hyphenated lowercase docId', () => {
    // lower-case words are properly title-cased
    const result = crossRef('05-getting-started');
    expect(result).toBe('[Getting Started](05-getting-started.md)');
  });
});

// ─── buildFrontMatter ────────────────────────────────────────────────────────

describe('buildFrontMatter()', () => {
  it('wraps YAML fields in --- delimiters', () => {
    const result = buildFrontMatter({
      title: 'Test',
      document_id: 'test-id',
      category: 'core',
      project: 'handover',
      generated_at: '2026-02-20T00:00:00Z',
      handover_version: '3.0.0',
      audience: 'human',
      ai_rounds_used: [],
      status: 'complete',
    });
    expect(result).toContain('title: Test');
    expect(result.startsWith('---\n')).toBe(true);
    expect(result.endsWith('\n---\n')).toBe(true);
  });
});

// ─── determineDocStatus ──────────────────────────────────────────────────────

describe('determineDocStatus()', () => {
  it('returns not-generated when wasGenerated is false', () => {
    const result = determineDocStatus([1], new Map(), false);
    expect(result).toBe('not-generated');
  });

  it('returns complete when there are no required rounds and wasGenerated is true', () => {
    const result = determineDocStatus([], new Map(), true);
    expect(result).toBe('complete');
  });

  it('returns complete when all required rounds are available', () => {
    const result = determineDocStatus(
      [1, 2],
      new Map([
        [1, 'data'],
        [2, 'data'],
      ]),
      true,
    );
    expect(result).toBe('complete');
  });

  it('returns partial when only some required rounds are available', () => {
    const result = determineDocStatus([1, 2], new Map([[1, 'data']]), true);
    expect(result).toBe('partial');
  });

  it('returns static-only when no required rounds are available', () => {
    const result = determineDocStatus([1, 2], new Map(), true);
    expect(result).toBe('static-only');
  });
});
