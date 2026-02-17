#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from './init.js';
import { runGenerate } from './generate.js';

const program = new Command();

program
  .name('handover')
  .description('Generate comprehensive codebase documentation for handover')
  .version('0.1.0');

program
  .command('init')
  .description('Create .handover.yml configuration file')
  .action(runInit);

program
  .command('generate')
  .description('Analyze codebase and generate documentation')
  .option('--provider <provider>', 'LLM provider override')
  .option('--model <model>', 'Model override')
  .option('--only <docs>', 'Generate specific documents (comma-separated)')
  .option('--audience <mode>', 'Audience mode: human (default) or ai')
  .option('--static-only', 'Run static analysis only (no AI cost)')
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

// Default action: run generate when no command specified
program
  .option('--provider <provider>', 'LLM provider override')
  .option('--model <model>', 'Model override')
  .option('--audience <mode>', 'Audience mode: human (default) or ai')
  .option('-v, --verbose', 'Show detailed output')
  .action(runGenerate);

program.parse();
