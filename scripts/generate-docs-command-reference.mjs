import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const outputPath = join(rootDir, 'docs', 'src', 'content', 'docs', 'reference', 'commands.mdx');

const commandDefinitions = [
  {
    label: 'root help',
    command: ['--help'],
  },
  {
    label: 'init',
    command: ['init', '--help'],
  },
  {
    label: 'generate',
    command: ['generate', '--help'],
  },
  {
    label: 'analyze',
    command: ['analyze', '--help'],
  },
  {
    label: 'estimate',
    command: ['estimate', '--help'],
  },
  {
    label: 'reindex',
    command: ['reindex', '--help'],
  },
  {
    label: 'search',
    command: ['search', '--help'],
  },
  {
    label: 'serve',
    command: ['serve', '--help'],
  },
];

function stripAnsi(text) {
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .trim();
}

function safeFence(text) {
  let marker = '```';
  while (text.includes(marker)) {
    marker += '`';
  }
  return marker;
}

function runHelp(args) {
  const command = ['run', 'dev', '--', ...args];
  const result = spawnSync('npm', command, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    cwd: rootDir,
    timeout: 120_000,
  });

  const raw = result.stdout || result.stderr || '';
  const output = stripAnsi(raw.toString());

  if (!output && result.error) {
    return `Command failed: ${result.error.message}`;
  }

  if (!output) {
    return 'No output captured.';
  }

  if (result.status && result.status !== 0) {
    return `Command exited with code ${result.status}.\n${output}`;
  }

  return output;
}

function buildCommandsMarkdown(entries) {
  const now = new Date().toISOString();

  const body = entries
    .map(({ label, output }) => {
      const fence = safeFence(output);
      return `## handover ${label}\n\n${fence}text\n${output}\n${fence}`;
    })
    .join('\n\n');

  return `---\ntitle: CLI command reference\ndescription: Reference generated from the live handover CLI help output\n---\n\nGenerated: ${now}\n\nThis page is produced by \`npm run docs:commands\`.\n\n${body}\n`;
}

async function main() {
  const entries = commandDefinitions.map(({ label, command }) => ({
    label,
    output: runHelp(command),
  }));

  const markdown = buildCommandsMarkdown(entries);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown);
}

await main();
