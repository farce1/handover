import { describe, it, expect } from 'vitest';
import { chunkMarkdown, chunkDocument } from './chunker';

describe('chunkMarkdown', () => {
  it('should split by headers creating separate chunks', () => {
    const markdown = `# Title

Paragraph 1

## Section A

Paragraph 2

## Section B

Paragraph 3`;

    const chunks = chunkMarkdown(markdown);

    expect(chunks.length).toBeGreaterThanOrEqual(3);

    // First chunk should have h1="Title"
    const firstChunk = chunks.find((c) => c.content.includes('Paragraph 1'));
    expect(firstChunk).toBeDefined();
    expect(firstChunk?.metadata.h1).toBe('Title');
    expect(firstChunk?.metadata.h2).toBeUndefined();

    // Second chunk should have h1="Title", h2="Section A"
    const secondChunk = chunks.find((c) => c.content.includes('Paragraph 2'));
    expect(secondChunk).toBeDefined();
    expect(secondChunk?.metadata.h1).toBe('Title');
    expect(secondChunk?.metadata.h2).toBe('Section A');

    // Third chunk should have h1="Title", h2="Section B"
    const thirdChunk = chunks.find((c) => c.content.includes('Paragraph 3'));
    expect(thirdChunk).toBeDefined();
    expect(thirdChunk?.metadata.h1).toBe('Title');
    expect(thirdChunk?.metadata.h2).toBe('Section B');
  });

  it('should preserve nested header hierarchy', () => {
    const markdown = `# H1

## H2

### H3

Content here`;

    const chunks = chunkMarkdown(markdown);

    const chunk = chunks.find((c) => c.content.includes('Content here'));
    expect(chunk).toBeDefined();
    expect(chunk?.metadata.h1).toBe('H1');
    expect(chunk?.metadata.h2).toBe('H2');
    expect(chunk?.metadata.h3).toBe('H3');
    expect(chunk?.metadata.sectionPath).toBe('H1 > H2 > H3');
  });

  it('should never split code blocks mid-block', () => {
    const codeBlock = '```typescript\nfunction test() {\n  return "hello";\n}\n```';
    const markdown = `# Code Example

Here is some text before.

${codeBlock}

Here is some text after.`;

    const chunks = chunkMarkdown(markdown);

    // Find the chunk containing the code block
    const codeChunk = chunks.find((c) => c.content.includes('function test()'));
    expect(codeChunk).toBeDefined();

    // Verify the entire code block is in one chunk
    expect(codeChunk?.content).toContain('```typescript');
    expect(codeChunk?.content).toContain('function test()');
    expect(codeChunk?.content).toContain('return "hello"');
    expect(codeChunk?.content).toContain('```');
  });

  it('should never split tables mid-table', () => {
    const table = `| Col1 | Col2 |
|------|------|
| A    | B    |
| C    | D    |
| E    | F    |`;

    const markdown = `# Table Example

${table}

Text after table.`;

    const chunks = chunkMarkdown(markdown);

    // Find chunk with table
    const tableChunk = chunks.find((c) => c.content.includes('| Col1'));
    expect(tableChunk).toBeDefined();

    // Verify entire table is in one chunk
    expect(tableChunk?.content).toContain('| Col1 | Col2 |');
    expect(tableChunk?.content).toContain('| A    | B    |');
    expect(tableChunk?.content).toContain('| E    | F    |');
  });

  it('should split large sections with overlap', () => {
    // Create a large section (>2048 chars, well over 512 tokens)
    const largeParagraph = 'This is a sentence. '.repeat(150); // ~3000 chars
    const markdown = `# Large Section

${largeParagraph}`;

    const chunks = chunkMarkdown(markdown, { chunkSize: 512, chunkOverlap: 75 });

    // Should produce multiple chunks
    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk should be roughly within size limit
    for (const chunk of chunks) {
      const estimatedTokens = Math.ceil(chunk.content.length / 4);
      // Allow some flexibility (20%) for edge cases
      expect(estimatedTokens).toBeLessThan(512 * 1.2);
    }

    // Check for overlap between consecutive chunks
    if (chunks.length >= 2) {
      const firstContent = chunks[0].content;
      const secondContent = chunks[1].content;

      // Extract last ~100 chars from first chunk
      const firstEnd = firstContent.slice(-100);

      // Verify some overlap exists
      const hasOverlap = secondContent.includes(firstEnd.slice(0, 50));
      expect(hasOverlap).toBe(true);
    }
  });

  it('should handle empty and minimal input', () => {
    expect(chunkMarkdown('')).toEqual([]);

    const singleLine = chunkMarkdown('Just a single line');
    expect(singleLine.length).toBe(1);
    expect(singleLine[0].content).toBe('Just a single line');

    const noHeaders = chunkMarkdown('Paragraph 1\n\nParagraph 2');
    expect(noHeaders.length).toBeGreaterThan(0);
  });

  it('should strip or handle YAML frontmatter', () => {
    const markdown = `---
title: Test
author: Someone
---

# Content

This is the actual content.`;

    const chunks = chunkMarkdown(markdown);

    // Frontmatter should not be treated as a header
    const firstChunk = chunks[0];
    expect(firstChunk.metadata.h1).toBe('Content');

    // Frontmatter should either be stripped or included in first chunk
    // but not parsed as markdown headers
    // This is acceptable either way, just verify it doesn't break
    expect(chunks.length).toBeGreaterThan(0);
  });
});

describe('chunkDocument', () => {
  it('should produce DocumentChunk with complete metadata', () => {
    const markdown = `# Architecture

## Overview

This document describes the architecture.`;

    const chunks = chunkDocument(markdown, {
      sourceFile: '03-ARCHITECTURE.md',
      docId: '03-architecture',
      docType: 'architecture',
    });

    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      // Verify all metadata fields are populated
      expect(chunk.metadata.sourceFile).toBe('03-ARCHITECTURE.md');
      expect(chunk.metadata.docId).toBe('03-architecture');
      expect(chunk.metadata.docType).toBe('architecture');
      expect(chunk.metadata.chunkIndex).toBeGreaterThanOrEqual(0);
      expect(chunk.metadata.tokenCount).toBeGreaterThan(0);
      expect(chunk.metadata.contentPreview).toBeDefined();
      expect(chunk.metadata.contentPreview.length).toBeLessThanOrEqual(200);
      expect(chunk.metadata.sectionPath).toBeDefined();
    }

    // Verify chunk indices are sequential
    const indices = chunks.map((c) => c.metadata.chunkIndex);
    expect(indices).toEqual([...Array(chunks.length).keys()]); // [0, 1, 2, ...]
  });

  it('should use first 200 chars for content preview', () => {
    const longContent = 'A'.repeat(500);
    const markdown = `# Test\n\n${longContent}`;

    const chunks = chunkDocument(markdown, {
      sourceFile: 'test.md',
      docId: 'test',
      docType: 'test',
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].metadata.contentPreview.length).toBeLessThanOrEqual(200);
  });
});
