import { resolve, join } from 'node:path';
import { loadConfig } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { handleCliError } from '../utils/errors.js';
import { writeSite } from '../site/write.js';

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

    let written: string[];
    try {
      written = await writeSite(outputDir);
    } catch {
      process.stderr.write(`No docs found in ${config.output}. Run \`handover generate\` first.\n`);
      process.exitCode = 1;
      return;
    }

    if (written.length === 0) {
      process.stderr.write(
        `No markdown docs in ${config.output}. Run \`handover generate\` first.\n`,
      );
      process.exitCode = 1;
      return;
    }

    process.stdout.write(
      `Built ${written.length} HTML page(s) in ${config.output}. Open ${join(config.output, written[0])}\n`,
    );
  } catch (err) {
    handleCliError(err);
  }
}
