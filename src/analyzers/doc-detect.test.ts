import { describe, it, expect } from 'vitest';
import { isReadmeFile, isInlineDocCandidate, hasInlineDoc } from './doc-detect.js';

describe('isReadmeFile', () => {
  it('matches README with and without a doc extension, case-insensitively', () => {
    expect(isReadmeFile('README.md')).toBe(true);
    expect(isReadmeFile('readme')).toBe(true);
    expect(isReadmeFile('Readme.rst')).toBe(true);
  });

  it('rejects non-README files', () => {
    expect(isReadmeFile('CHANGELOG.md')).toBe(false);
    expect(isReadmeFile('readme.notes.md')).toBe(false);
  });
});

describe('isInlineDocCandidate', () => {
  it('accepts languages with inline-doc conventions', () => {
    expect(isInlineDocCandidate('.ts')).toBe(true);
    expect(isInlineDocCandidate('.py')).toBe(true);
    expect(isInlineDocCandidate('.rs')).toBe(true);
  });

  it('rejects other extensions', () => {
    expect(isInlineDocCandidate('.go')).toBe(false);
    expect(isInlineDocCandidate('.md')).toBe(false);
  });
});

describe('hasInlineDoc', () => {
  it('detects a JSDoc block in TS/JS', () => {
    expect(hasInlineDoc('/** does a thing */\nexport const x = 1;', '.ts')).toBe(true);
    expect(hasInlineDoc('// just a line comment\nconst x = 1;', '.ts')).toBe(false);
  });

  it('detects Python docstrings', () => {
    expect(hasInlineDoc('def f():\n    """doc"""\n    pass', '.py')).toBe(true);
  });

  it('detects rustdoc comments', () => {
    expect(hasInlineDoc('/// a doc comment\nfn f() {}', '.rs')).toBe(true);
  });

  it('does not apply one language pattern to another extension', () => {
    expect(hasInlineDoc('/** jsdoc */', '.py')).toBe(false);
  });
});
