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

// Default action: run generate when no command specified
program
  .option('--provider <provider>', 'LLM provider override')
  .option('--model <model>', 'Model override')
  .option('-v, --verbose', 'Show detailed output')
  .action(runGenerate);

program.parse();
