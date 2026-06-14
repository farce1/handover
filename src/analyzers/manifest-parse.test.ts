import { describe, it, expect } from 'vitest';
import { parseManifest, MANIFEST_PATTERNS } from './manifest-parse.js';

describe('parseManifest — package.json', () => {
  it('classifies dependencies by section', () => {
    const deps = parseManifest(
      'package.json',
      JSON.stringify({
        dependencies: { react: '^18.0.0' },
        devDependencies: { vitest: '^1.0.0' },
        peerDependencies: { 'react-dom': '^18' },
        optionalDependencies: { fsevents: '^2' },
      }),
    );

    expect(deps).toEqual([
      { name: 'react', version: '^18.0.0', type: 'production' },
      { name: 'vitest', version: '^1.0.0', type: 'development' },
      { name: 'react-dom', version: '^18', type: 'peer' },
      { name: 'fsevents', version: '^2', type: 'optional' },
    ]);
  });
});

describe('parseManifest — Cargo.toml', () => {
  it('handles string versions and inline-table versions, plus dev-dependencies', () => {
    const deps = parseManifest(
      'Cargo.toml',
      [
        '[dependencies]',
        'serde = "1.0"',
        'tokio = { version = "1.0", features = ["full"] }',
        '',
        '[dev-dependencies]',
        'criterion = "0.5"',
      ].join('\n'),
    );

    expect(deps).toContainEqual({ name: 'serde', version: '1.0', type: 'production' });
    expect(deps).toContainEqual({ name: 'tokio', version: '1.0', type: 'production' });
    expect(deps).toContainEqual({ name: 'criterion', version: '0.5', type: 'development' });
  });
});

describe('parseManifest — go.mod', () => {
  it('parses require blocks and single require lines', () => {
    const deps = parseManifest(
      'go.mod',
      [
        'module example.com/m',
        'go 1.21',
        'require (',
        '\tgithub.com/foo/bar v1.2.3',
        '\tgithub.com/baz/qux v0.1.0',
        ')',
        'require golang.org/x/sync v0.1.0',
      ].join('\n'),
    );

    expect(deps.map((d) => d.name)).toEqual([
      'github.com/foo/bar',
      'github.com/baz/qux',
      'golang.org/x/sync',
    ]);
  });
});

describe('parseManifest — requirements.txt', () => {
  it('parses names and version specs, skipping comments and flags', () => {
    const deps = parseManifest(
      'requirements.txt',
      ['# comment', 'flask==2.0.0', 'requests>=2.25.0', '-r other.txt', '-e .', 'pytest'].join(
        '\n',
      ),
    );

    expect(deps).toEqual([
      { name: 'flask', version: '==2.0.0', type: 'production' },
      { name: 'requests', version: '>=2.25.0', type: 'production' },
      { name: 'pytest', version: '*', type: 'production' },
    ]);
  });
});

describe('parseManifest — pyproject.toml', () => {
  it('parses PEP 621 dependencies and optional-dependencies as development', () => {
    const deps = parseManifest(
      'pyproject.toml',
      [
        '[project]',
        'dependencies = ["flask>=2.0", "requests"]',
        '[project.optional-dependencies]',
        'dev = ["pytest>=7", "black"]',
      ].join('\n'),
    );

    expect(deps).toContainEqual({ name: 'flask', version: 'flask>=2.0', type: 'production' });
    expect(deps).toContainEqual({ name: 'requests', version: 'requests', type: 'production' });
    expect(deps).toContainEqual({ name: 'pytest', version: 'pytest>=7', type: 'development' });
    expect(deps).toContainEqual({ name: 'black', version: 'black', type: 'development' });
  });
});

describe('parseManifest — unknown', () => {
  it('returns nothing for an unrecognized manifest', () => {
    expect(parseManifest('whatever.lock', 'x')).toEqual([]);
  });

  it('exposes the manifest → package-manager map', () => {
    expect(MANIFEST_PATTERNS['package.json']).toBe('npm');
    expect(MANIFEST_PATTERNS['Cargo.toml']).toBe('cargo');
  });
});
