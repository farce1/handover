import { describe, it, expect } from 'vitest';
import { scanContentForEnvRefs, parseEnvFileVars } from './env-parse.js';

describe('scanContentForEnvRefs', () => {
  it('detects process.env references with their line', () => {
    const refs = scanContentForEnvRefs('const a = 1;\nconst k = process.env.API_KEY;\n', 'a.ts');

    expect(refs).toEqual([{ file: 'a.ts', line: 2, variable: 'API_KEY' }]);
  });

  it('detects Python os.environ and os.getenv', () => {
    expect(scanContentForEnvRefs('os.environ["DB_URL"]', 'a.py')[0].variable).toBe('DB_URL');
    expect(scanContentForEnvRefs("os.getenv('PORT')", 'a.py')[0].variable).toBe('PORT');
  });

  it('detects Rust env::var and Go os.Getenv', () => {
    expect(scanContentForEnvRefs('env::var("SECRET")', 'a.rs')[0].variable).toBe('SECRET');
    expect(scanContentForEnvRefs('os.Getenv("HOST")', 'a.go')[0].variable).toBe('HOST');
  });

  it('finds multiple references on one line', () => {
    const refs = scanContentForEnvRefs('process.env.A || process.env.B', 'a.ts');

    expect(refs.map((r) => r.variable)).toEqual(['A', 'B']);
  });

  it('ignores lowercase identifiers (env vars are upper-snake)', () => {
    expect(scanContentForEnvRefs('process.env.notAVar', 'a.ts')).toEqual([]);
  });

  it('returns nothing for content without references', () => {
    expect(scanContentForEnvRefs('const x = 1;\n', 'a.ts')).toEqual([]);
  });
});

describe('parseEnvFileVars', () => {
  it('extracts variable names from assignments', () => {
    expect(parseEnvFileVars('API_KEY=abc\nDB_URL=postgres://x\n')).toEqual(['API_KEY', 'DB_URL']);
  });

  it('ignores comments and blank lines', () => {
    expect(parseEnvFileVars('# a comment\n\nFOO=1\n')).toEqual(['FOO']);
  });

  it('ignores lowercase keys and trims leading whitespace', () => {
    expect(parseEnvFileVars('  BAR=1\nlower=2\n')).toEqual(['BAR']);
  });
});
