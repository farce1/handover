import { describe, it, expect } from 'vitest';
import { scanContentForTodos } from './todo-parse.js';

describe('scanContentForTodos', () => {
  it('detects a TODO with a colon and records its line', () => {
    const items = scanContentForTodos('const x = 1;\n// TODO: refactor this\n', 'a.ts');

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      marker: 'TODO',
      category: 'tasks',
      text: 'refactor this',
      file: 'a.ts',
      line: 2,
    });
  });

  it('is case-insensitive and normalizes the marker to upper case', () => {
    const items = scanContentForTodos('# fixme: broken', 'a.py');

    expect(items[0]).toMatchObject({ marker: 'FIXME', category: 'bugs' });
  });

  it('matches a marker separated by whitespace', () => {
    const items = scanContentForTodos('// HACK temporary shim', 'a.ts');

    expect(items[0]).toMatchObject({ marker: 'HACK', category: 'bugs', text: 'temporary shim' });
  });

  it('maps markers to their categories', () => {
    const items = scanContentForTodos(
      '// DEPRECATED: old\n// OPTIMIZE: slow\n// NOTE: fyi\n',
      'a.ts',
    );

    expect(items.map((i) => i.category)).toEqual(['debt', 'optimization', 'notes']);
  });

  it('extracts issue references (#n and PROJECT-n)', () => {
    const items = scanContentForTodos('// TODO: fix #123 see PROJ-45', 'a.ts');

    expect(items[0].issueRefs).toEqual(['#123', 'PROJ-45']);
  });

  it('does not match a marker embedded in a larger word', () => {
    expect(scanContentForTodos('const TODONT = 1;', 'a.ts')).toEqual([]);
  });

  it('returns nothing for content without markers', () => {
    expect(scanContentForTodos('just code\n', 'a.ts')).toEqual([]);
  });
});
