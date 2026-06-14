import { describe, it, expect } from 'vitest';
import { isBinaryFile, formatBytes } from './file-discovery.js';

describe('isBinaryFile', () => {
  it('is true for a known binary extension', () => {
    expect(isBinaryFile('.png')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isBinaryFile('.PNG')).toBe(true);
  });

  it('is false for a source extension', () => {
    expect(isBinaryFile('.ts')).toBe(false);
  });

  it('is false for an empty extension', () => {
    expect(isBinaryFile('')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats sub-kilobyte sizes in bytes', () => {
    expect(formatBytes(512)).toBe('512B');
  });

  it('uses the byte tier up to the 1024 boundary', () => {
    expect(formatBytes(1023)).toBe('1023B');
  });

  it('formats kilobytes with one decimal at the boundary', () => {
    expect(formatBytes(1024)).toBe('1.0KB');
  });

  it('formats megabytes with one decimal at the boundary', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0MB');
  });

  it('rounds megabytes to one decimal place', () => {
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5MB');
  });
});
