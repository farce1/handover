import { describe, it, expect } from 'vitest';
import { getLanguageInfo, isSupportedFile } from './language-map.js';

describe('getLanguageInfo', () => {
  it('resolves .d.ts declaration files to TypeScript', () => {
    expect(getLanguageInfo('src/types.d.ts')).toEqual({
      langId: 'typescript',
      grammar: 'typescript',
      parser: 'tree-sitter',
    });
  });

  it('maps a tree-sitter extension to its language info', () => {
    expect(getLanguageInfo('src/app.ts')).toEqual({
      langId: 'typescript',
      grammar: 'typescript',
      parser: 'tree-sitter',
    });
  });

  it('maps .jsx to the jsx langId via the tsx grammar', () => {
    expect(getLanguageInfo('src/widget.jsx')).toEqual({
      langId: 'jsx',
      grammar: 'tsx',
      parser: 'tree-sitter',
    });
  });

  it('maps a regex-fallback extension to a regex parser', () => {
    expect(getLanguageInfo('lib/thing.rb')).toEqual({
      langId: 'ruby',
      grammar: 'ruby',
      parser: 'regex',
    });
  });

  it('returns null for a path with no extension', () => {
    expect(getLanguageInfo('Makefile')).toBeNull();
  });

  it('returns null for an unknown extension', () => {
    expect(getLanguageInfo('notes.xyz')).toBeNull();
  });

  it('matches extensions case-sensitively (uppercase variant unmapped)', () => {
    expect(getLanguageInfo('script.PY')).toBeNull();
  });

  it('honors an explicitly mapped uppercase extension', () => {
    expect(getLanguageInfo('analysis.R')).toEqual({
      langId: 'r',
      grammar: 'r',
      parser: 'regex',
    });
  });
});

describe('isSupportedFile', () => {
  it('is true for a supported extension', () => {
    expect(isSupportedFile('src/app.ts')).toBe(true);
  });

  it('is true for a .d.ts declaration file', () => {
    expect(isSupportedFile('src/types.d.ts')).toBe(true);
  });

  it('is false for an unsupported extension', () => {
    expect(isSupportedFile('notes.xyz')).toBe(false);
  });
});
