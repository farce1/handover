import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { loadConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { handleCliError } from '../utils/errors.js';
import { buildSite } from '../site/html.js';

export interface BuildSiteOptions {
  verbose?: boolean;
}

/**
 * `handover build-site`: convert the generated markdown docs into a browsable,
 * self-contained HTML site (written alongside the markdown in the output dir).
 */
export async function runBuildSite(options: BuildSiteOptions = {}): Promise<void> {
  try {
    if (options.verbose) logger.setVerbose(true);

    const config = loadConfig({});
    const outputDir = resolve(process.cwd(), config.output);

    let entries: string[];
    try {
      entries = await readdir(outputDir);
    } catch {
      process.stderr.write(`No docs found in ${config.output}. Run \`handover generate\` first.\n`);
      process.exitCode = 1;
      return;
    }

    const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();
    if (mdFiles.length === 0) {
      process.stderr.write(
        `No markdown docs in ${config.output}. Run \`handover generate\` first.\n`,
      );
      process.exitCode = 1;
      return;
    }

    const docs = await Promise.all(
      mdFiles.map(async (filename) => ({
        filename,
        markdown: await readFile(join(outputDir, filename), 'utf-8'),
      })),
    );

    const pages = buildSite(docs);
    await Promise.all(pages.map((p) => writeFile(join(outputDir, p.filename), p.html, 'utf-8')));

    process.stdout.write(
      `Built ${pages.length} HTML page(s) in ${config.output}. Open ${config.output}/${pages[0].filename}\n`,
    );
  } catch (err) {
    handleCliError(err);
  }
}
