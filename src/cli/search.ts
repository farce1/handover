import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { answerQuestion, formatCitationFootnotes } from '../qa/answerer.js';
import { ConfigError, HandoverError, ProviderError, handleCliError } from '../utils/errors.js';
import { searchDocuments } from '../vector/query-engine.js';

export interface SearchCommandOptions {
  topK?: number;
  type?: string[];
  mode?: string;
}

type SearchMode = 'fast' | 'qa';

function createStyler(isTty: boolean): (value: string) => string {
  return isTty ? (value) => pc.bold(value) : (value) => value;
}

function normalizeSnippet(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeMode(value: string | undefined): SearchMode {
  const normalized = (value ?? 'fast').trim().toLowerCase();
  if (normalized === 'fast' || normalized === 'qa') {
    return normalized;
  }

  throw new HandoverError(
    `Unknown search mode: ${normalized}`,
    'Search mode must be either fast or qa',
    'Use --mode fast for retrieval-only output or --mode qa for synthesized answers',
    'SEARCH_INVALID_MODE',
  );
}

function printModeBanner(emphasize: (value: string) => string, mode: SearchMode): void {
  const summary =
    mode === 'qa' ? 'qa (retrieval + provider synthesis)' : 'fast (retrieval-only semantic search)';
  console.log(`${emphasize('Mode')}: ${summary}`);
  console.log();
}

function toQaModeError(err: unknown): unknown {
  if (err instanceof ProviderError || err instanceof ConfigError) {
    return new HandoverError(
      'QA mode is unavailable with the current provider setup',
      `Provider/config validation failed for QA synthesis: ${err.message}`,
      `${err.fix}\n\nRetry with --mode qa after fixing this, or run now with --mode fast for retrieval-only results.`,
      'SEARCH_QA_UNAVAILABLE',
    );
  }

  if (
    err instanceof HandoverError &&
    (err.code?.startsWith('PROVIDER_') === true ||
      err.code?.startsWith('CONFIG_') === true ||
      err.code?.startsWith('EMBEDDING_') === true)
  ) {
    return new HandoverError(
      'QA mode is unavailable with the current provider setup',
      err.reason,
      `${err.fix}\n\nRetry with --mode qa after fixing this, or run now with --mode fast for retrieval-only results.`,
      'SEARCH_QA_UNAVAILABLE',
    );
  }

  return err;
}

function renderFootnotes(emphasize: (value: string) => string, citations: string[]): void {
  console.log(emphasize('Sources'));
  for (const citation of citations) {
    console.log(citation);
  }
}

async function runFastMode(
  query: string,
  options: SearchCommandOptions,
  emphasize: (value: string) => string,
): Promise<void> {
  const config = loadConfig();
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
}

async function runQaMode(
  query: string,
  options: SearchCommandOptions,
  emphasize: (value: string) => string,
): Promise<void> {
  const config = loadConfig();

  try {
    const result = await answerQuestion({
      config,
      query,
      topK: options.topK,
      types: options.type,
    });

    console.log(`${emphasize('Question')}: ${result.query}`);
    if (options.type !== undefined && options.type.length > 0) {
      console.log(`${emphasize('Type filters')}: ${options.type.join(', ')}`);
    }
    console.log();

    if (result.kind === 'clarification') {
      console.log(emphasize('Clarification needed'));
      console.log(result.clarification.question);
      if (result.clarification.reason.length > 0) {
        console.log();
        console.log(`${emphasize('Why')}: ${result.clarification.reason}`);
      }
      if (result.citations.length > 0) {
        console.log();
        const footnotes = formatCitationFootnotes(result.citations);
        renderFootnotes(emphasize, footnotes);
      }
      return;
    }

    console.log(emphasize('Answer'));
    console.log(result.answer.answer);
    console.log();

    const footnotes = formatCitationFootnotes(result.answer.citations);

    renderFootnotes(emphasize, footnotes);
  } catch (err) {
    throw toQaModeError(err);
  }
}

export async function runSearch(query: string, options: SearchCommandOptions): Promise<void> {
  try {
    const isTty = Boolean(process.stdout.isTTY);
    const emphasize = createStyler(isTty);
    const mode = normalizeMode(options.mode);

    printModeBanner(emphasize, mode);

    if (mode === 'qa') {
      await runQaMode(query, options, emphasize);
      return;
    }

    await runFastMode(query, options, emphasize);
  } catch (err) {
    handleCliError(err, 'Failed to run search command');
  }
}
