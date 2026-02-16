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

// Default action: run generate when no command specified
program
  .option('--provider <provider>', 'LLM provider override')
  .option('--model <model>', 'Model override')
  .option('-v, --verbose', 'Show detailed output')
  .action(runGenerate);

program.parse();
