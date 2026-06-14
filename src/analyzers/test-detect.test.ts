import { describe, it, expect } from 'vitest';
import { detectFrameworkForFile, countTestsInContent } from './test-detect.js';

describe('detectFrameworkForFile', () => {
  it('classifies JS/TS test and spec files', () => {
    expect(detectFrameworkForFile('src/foo.test.ts')).toBe('vitest');
    expect(detectFrameworkForFile('src/foo.spec.tsx')).toBe('vitest');
  });

  it('classifies Python test files in subdirectories (path-aware, not just top level)', () => {
    expect(detectFrameworkForFile('pkg/test_foo.py')).toBe('pytest');
    expect(detectFrameworkForFile('pkg/foo_test.py')).toBe('pytest');
  });

  it('classifies Go test files', () => {
    expect(detectFrameworkForFile('internal/foo_test.go')).toBe('go_test');
  });

  it('classifies Rust integration tests under tests/ (previously missed via basename)', () => {
    expect(detectFrameworkForFile('tests/integration.rs')).toBe('rust_test');
  });

  it('returns null for non-test files', () => {
    expect(detectFrameworkForFile('src/index.ts')).toBeNull();
    expect(detectFrameworkForFile('src/main.rs')).toBeNull();
  });
});

describe('countTestsInContent', () => {
  it('counts it/test/describe calls for vitest', () => {
    const content = "it('a', () => {});\ntest('b', () => {});\ndescribe('c', () => {});";
    expect(countTestsInContent(content, 'vitest')).toBe(3);
  });

  it('counts def test_ functions for pytest', () => {
    expect(countTestsInContent('def test_a():\n    pass\ndef test_b():\n    pass', 'pytest')).toBe(
      2,
    );
  });

  it('returns 0 for an unknown framework', () => {
    expect(countTestsInContent('it("a", () => {})', 'nope')).toBe(0);
  });
});
