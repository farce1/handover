import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const rootDir = process.cwd();
const changelogPath = join(rootDir, 'CHANGELOG.md');
const outputPath = join(
  rootDir,
  'docs',
  'src',
  'content',
  'docs',
  'reference',
  'changelog-data.json',
);

function cleanHeading(text) {
  return text.replace(/^\[(.*?)\]\(.*?\)$/, '$1').trim();
}

function parseReleaseHeading(text) {
  const withDate = text.match(/^(.*?)\s*\((.*?)\)$/);
  if (!withDate) {
    return {
      version: cleanHeading(text),
      date: '',
    };
  }

  return {
    version: cleanHeading(withDate[1]),
    date: cleanHeading(withDate[2]),
  };
}

function parseNotes(body) {
  const lines = body
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .filter(Boolean);

  const notes = [];
  const candidateSummary = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#{1,6}\s+/.test(trimmed)) {
      continue;
    }

    if (/^[-*+\s]+/.test(trimmed)) {
      const cleaned = trimmed.replace(/^[-*+]\s+/, '').trim();
      if (cleaned) {
        notes.push(cleaned);
      }
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const cleaned = trimmed.replace(/^\d+\.\s+/, '').trim();
      if (cleaned) {
        notes.push(cleaned);
      }
      continue;
    }

    if (trimmed.length > 0 && candidateSummary.length < 2) {
      candidateSummary.push(trimmed);
    }
  }

  const summary =
    candidateSummary.length > 0
      ? candidateSummary.join(' ')
      : 'Release notes are listed in CHANGELOG.md.';

  return {
    notes: [...new Set(notes)],
    summary,
  };
}

function parseChangelog(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const entries = [];

  let currentHeading = null;
  let currentBody = [];

  const flush = () => {
    if (!currentHeading) {
      return;
    }

    const heading = cleanHeading(currentHeading);
    if (!heading || heading.toLowerCase() === 'changelog') {
      return;
    }

    const parsedHeading = parseReleaseHeading(heading);
    const { notes, summary } = parseNotes(currentBody.join('\n'));

    entries.push({
      version: parsedHeading.version,
      date: parsedHeading.date,
      summary,
      notes,
    });
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      currentHeading = line.replace(/^##\s+/, '');
      currentBody = [];
      continue;
    }

    if (currentHeading) {
      currentBody.push(line);
    }
  }

  flush();

  return {
    generatedAt: new Date().toISOString(),
    entries,
  };
}

async function main() {
  const raw = await readFile(changelogPath, 'utf8').catch(() => '');
  const { entries, generatedAt } = parseChangelog(raw);

  const payload = {
    generatedAt,
    entries,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
}

await main();
