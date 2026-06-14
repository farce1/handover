import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSite } from './html.js';

/**
 * Read the markdown docs in `dir`, build the browsable HTML site, and write the
 * pages alongside them. Returns the written HTML filenames (empty if no docs).
 * Throws if `dir` cannot be read (e.g. it does not exist).
 */
export async function writeSite(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();
  if (mdFiles.length === 0) return [];

  const docs = await Promise.all(
    mdFiles.map(async (filename) => ({
      filename,
      markdown: await readFile(join(dir, filename), 'utf-8'),
    })),
  );

  const pages = buildSite(docs);
  await Promise.all(pages.map((p) => writeFile(join(dir, p.filename), p.html, 'utf-8')));
  return pages.map((p) => p.filename);
}
