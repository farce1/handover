import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { handleCliError } from '../utils/errors.js';
import { searchDocuments } from '../vector/query-engine.js';

export interface SearchCommandOptions {
  topK?: number;
  type?: string[];
}

function createStyler(isTty: boolean): (value: string) => string {
  return isTty ? (value) => pc.bold(value) : (value) => value;
}

function normalizeSnippet(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export async function runSearch(query: string, options: SearchCommandOptions): Promise<void> {
  try {
    const config = loadConfig();
    const isTty = Boolean(process.stdout.isTTY);
    const emphasize = createStyler(isTty);

    const result = await searchDocuments({
      config,
      query,
      topK: options.topK,
      types: options.type,
    });

    if (result.totalMatches === 0) {
      console.log('No results found.');
      console.log();
      console.log('Try refining your query:');
      console.log('- Use more specific keywords (example: "auth middleware")');
      console.log('- Increase result count with --top-k 20');
      console.log('- Remove or broaden --type filters');
      return;
    }

    console.log(`${emphasize('Search query')}: ${result.query}`);
    if (result.filters.types.length > 0) {
      console.log(`${emphasize('Type filters')}: ${result.filters.types.join(', ')}`);
    }
    console.log();

    for (const [index, match] of result.matches.entries()) {
      const rank = index + 1;
      const score = `${match.relevance.toFixed(2)}%`;
      const snippet = normalizeSnippet(match.contentPreview);

      console.log(`${emphasize(`Result ${rank}`)}`);
      console.log(`rank: ${rank}`);
      console.log(`relevance: ${score}`);
      console.log(`source: ${match.sourceFile}`);
      console.log(`section: ${match.sectionPath}`);
      console.log(`snippet: ${snippet}`);
      if (index < result.matches.length - 1) {
        console.log();
      }
    }

    console.log();
    console.log(
      `Showing ${result.matches.length} of ${result.totalMatches} results (top-k requested: ${result.topK}).`,
    );
  } catch (err) {
    handleCliError(err, 'Failed to run search command');
  }
}
