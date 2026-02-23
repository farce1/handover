#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from './init.js';
import { runGenerate } from './generate.js';

const program = new Command();

program
  .name('handover')
  .description('Generate comprehensive codebase documentation for handover')
  .version('0.1.0');

program.command('init').description('Create .handover.yml configuration file').action(runInit);

program
  .command('generate')
  .description('Analyze codebase and generate documentation')
  .option('--provider <provider>', 'LLM provider override')
  .option('--model <model>', 'Model override')
  .option('--only <docs>', 'Generate specific documents (comma-separated)')
  .option('--audience <mode>', 'Audience mode: human (default) or ai')
  .option('--static-only', 'Run static analysis only (no AI cost)')
  .option('--no-cache', 'Discard cached results and run all rounds fresh')
  .option('--stream', 'Show streaming token output during AI rounds')
  .option('-v, --verbose', 'Show detailed output')
  .action(runGenerate);

program
  .command('analyze')
  .description('Run static analysis on the codebase')
  .option('--json', 'Output JSON to stdout instead of markdown file')
  .option('--git-depth <depth>', 'Git history depth: "default" (6 months) or "full"', 'default')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (opts) => {
    const { runAnalyze } = await import('./analyze.js');
    await runAnalyze(opts);
  });

program
  .command('estimate')
  .description('Estimate token count and cost before running')
  .option('--provider <provider>', 'Provider to estimate for')
  .option('--model <model>', 'Model to estimate for')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (opts) => {
    const { runEstimate } = await import('./estimate.js');
    await runEstimate(opts);
  });

program
  .command('reindex')
  .description('Build or update vector search index from generated documentation')
  .option('--force', 'Re-embed all documents (ignore change detection)')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (opts) => {
    const { runReindex } = await import('./reindex.js');
    await runReindex(opts);
  });

program
  .command('embedding-health')
  .description('Run embedding provider health checks')
  .action(async () => {
    const { runEmbeddingHealth } = await import('./embedding-health.js');
    await runEmbeddingHealth();
  });

program
  .command('search <query>')
  .description('Search generated documentation using semantic similarity')
  .option('--mode <mode>', 'Search mode: fast (default) or qa', 'fast')
  .option(
    '--top-k <n>',
    'Number of results to return (default: 10)',
    (value) => {
      return Number.parseInt(value, 10);
    },
    10,
  )
  .option(
    '--type <type>',
    'Filter by document type (repeatable)',
    (value, previous: string[]) => {
      return [...previous, value];
    },
    [],
  )
  .addHelpText(
    'after',
    '\nExamples:\n  $ handover search "authentication"\n  $ handover search "How does the DAG orchestrator work?" --mode qa\n  $ handover search "dependency graph" --mode fast --top-k 5\n  $ handover search "system design" --type architecture --type modules',
  )
  .action(async (query, opts) => {
    const { runSearch } = await import('./search.js');
    await runSearch(query, opts);
  });

program
  .command('serve')
  .description('Start MCP server over stdio transport')
  .action(async () => {
    const { runServe } = await import('./serve.js');
    await runServe();
  });

// Default action: run generate when no command specified
program
  .option('--provider <provider>', 'LLM provider override')
  .option('--model <model>', 'Model override')
  .option('--audience <mode>', 'Audience mode: human (default) or ai')
  .option('-v, --verbose', 'Show detailed output')
  .action(runGenerate);

program.parse();
