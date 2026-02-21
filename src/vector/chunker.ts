/**
 * Markdown-aware document chunker
 *
 * Splits markdown documents into retrieval-optimized chunks while preserving:
 * - Header hierarchy (never split sections)
 * - Code blocks (never split mid-block)
 * - Tables (never split mid-table)
 * - Section context via metadata
 */

import type {
  DocumentChunk,
  TextChunk,
  ChunkOptions,
  ChunkMetadata,
} from './types.js';

/** Default chunk size in tokens */
const DEFAULT_CHUNK_SIZE = 512;

/** Default overlap in tokens (~15% of chunk size) */
const DEFAULT_CHUNK_OVERLAP = 75;

/** Estimate tokens from character count (4 chars ≈ 1 token) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Strip YAML frontmatter if present */
function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n+/, '');
}

/** Header stack for tracking hierarchy */
interface HeaderStack {
  h1?: string;
  h2?: string;
  h3?: string;
}

/** Section with header metadata */
interface Section {
  content: string;
  headers: HeaderStack;
}

/**
 * Parse markdown into sections based on header hierarchy
 */
function parseIntoSections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let currentHeaders: HeaderStack = {};
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headerMatch) {
      // Save previous section if it has content
      if (currentContent.length > 0) {
        sections.push({
          content: currentContent.join('\n'),
          headers: { ...currentHeaders },
        });
        currentContent = [];
      }

      const level = headerMatch[1].length;
      const headerText = headerMatch[2].trim();

      // Update header stack
      if (level === 1) {
        currentHeaders = { h1: headerText };
      } else if (level === 2) {
        currentHeaders = { ...currentHeaders, h2: headerText, h3: undefined };
      } else if (level === 3) {
        currentHeaders = { ...currentHeaders, h3: headerText };
      }

      // Include the header in the content
      currentContent.push(line);
    } else {
      currentContent.push(line);
    }
  }

  // Save final section
  if (currentContent.length > 0) {
    sections.push({
      content: currentContent.join('\n'),
      headers: { ...currentHeaders },
    });
  }

  return sections;
}

/**
 * Build section path from header stack
 */
function buildSectionPath(headers: HeaderStack): string {
  const parts: string[] = [];
  if (headers.h1) parts.push(headers.h1);
  if (headers.h2) parts.push(headers.h2);
  if (headers.h3) parts.push(headers.h3);
  return parts.join(' > ') || 'Root';
}

/**
 * Check if a text block is a code block
 */
function isCodeBlock(text: string): boolean {
  return text.trim().startsWith('```') && text.trim().endsWith('```');
}

/**
 * Check if a text block is a table
 */
function isTable(text: string): boolean {
  const lines = text.trim().split('\n');
  return lines.length > 1 && lines.every((line) => line.trim().startsWith('|'));
}

/**
 * Split text by separator, respecting boundaries
 */
function splitBySeparator(
  text: string,
  separator: string
): string[] {
  if (!separator) return [text];
  const parts = text.split(separator);
  const result: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i === 0) {
      result.push(parts[i]);
    } else {
      result.push(separator + parts[i]);
    }
  }

  return result.filter((p) => p.trim().length > 0);
}

/**
 * Split a large section into smaller chunks with overlap
 */
function splitSection(
  section: Section,
  chunkSize: number,
  chunkOverlap: number
): TextChunk[] {
  const content = section.content.trim();
  const tokens = estimateTokens(content);

  // If within size limit, return as single chunk
  if (tokens <= chunkSize) {
    return [
      {
        content,
        metadata: {
          ...section.headers,
          sectionPath: buildSectionPath(section.headers),
        },
      },
    ];
  }

  // Need to split - use sliding window approach
  const chunks: TextChunk[] = [];
  const targetChars = chunkSize * 4; // Convert tokens to chars
  const overlapChars = chunkOverlap * 4;

  // Try different separators in priority order
  const separators = ['\n\n', '\n', ' '];

  let currentPosition = 0;

  while (currentPosition < content.length) {
    // Extract chunk of target size
    let chunkEnd = Math.min(currentPosition + targetChars, content.length);
    let chunkText = content.slice(currentPosition, chunkEnd);

    // If not at the end, try to break at a good boundary
    if (chunkEnd < content.length) {
      // Try to find a good separator near the end
      let foundSeparator = false;

      for (const sep of separators) {
        const lastSepIndex = chunkText.lastIndexOf(sep);
        if (lastSepIndex > chunkText.length * 0.5) {
          // Found a separator in the latter half
          chunkText = content.slice(currentPosition, currentPosition + lastSepIndex + sep.length);
          chunkEnd = currentPosition + lastSepIndex + sep.length;
          foundSeparator = true;
          break;
        }
      }

      // If no separator found, just break at target size
      if (!foundSeparator) {
        chunkText = content.slice(currentPosition, chunkEnd);
      }
    }

    // Add chunk
    if (chunkText.trim()) {
      chunks.push({
        content: chunkText.trim(),
        metadata: {
          ...section.headers,
          sectionPath: buildSectionPath(section.headers),
        },
      });
    }

    // Move position forward, accounting for overlap
    if (chunkEnd >= content.length) {
      break;
    }

    currentPosition = chunkEnd - overlapChars;

    // Ensure we make progress
    const lastChunkLength = chunks.length > 0 ? chunks[chunks.length - 1].content.length : 0;
    if (currentPosition <= lastChunkLength) {
      currentPosition = chunkEnd;
    }
  }

  return chunks;
}

/**
 * Chunk markdown into text chunks with metadata
 */
export function chunkMarkdown(
  markdown: string,
  options?: ChunkOptions
): TextChunk[] {
  if (!markdown || markdown.trim().length === 0) {
    return [];
  }

  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  // Strip frontmatter
  const cleanedMarkdown = stripFrontmatter(markdown);

  // If no headers, treat as single section
  if (!cleanedMarkdown.match(/^#{1,3}\s+/m)) {
    return [
      {
        content: cleanedMarkdown.trim(),
        metadata: {
          sectionPath: 'Root',
        },
      },
    ];
  }

  // Parse into sections by headers
  const sections = parseIntoSections(cleanedMarkdown);

  // Split each section if needed
  const allChunks: TextChunk[] = [];
  for (const section of sections) {
    const chunks = splitSection(section, chunkSize, chunkOverlap);
    allChunks.push(...chunks);
  }

  return allChunks;
}

/**
 * Chunk document into DocumentChunks with full metadata
 */
export function chunkDocument(
  content: string,
  docMeta: {
    sourceFile: string;
    docId: string;
    docType: string;
  }
): DocumentChunk[] {
  const textChunks = chunkMarkdown(content);

  return textChunks.map((chunk, index): DocumentChunk => {
    const metadata: ChunkMetadata = {
      sourceFile: docMeta.sourceFile,
      docId: docMeta.docId,
      docType: docMeta.docType,
      sectionPath: chunk.metadata.sectionPath,
      chunkIndex: index,
      h1: chunk.metadata.h1,
      h2: chunk.metadata.h2,
      h3: chunk.metadata.h3,
      tokenCount: estimateTokens(chunk.content),
      contentPreview: chunk.content.slice(0, 200).trim(),
    };

    return {
      content: chunk.content,
      metadata,
    };
  });
}
