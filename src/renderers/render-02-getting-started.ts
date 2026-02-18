import type { RenderContext } from './types.js';
import { codeRef, crossRef, sectionIntro } from './utils.js';
import { renderDocument, collectRoundsUsed, pushStructuredBlock } from './render-template.js';

// ─── renderGettingStarted ──────────────────────────────────────────────────

/**
 * Render the Getting Started guide (02-GETTING-STARTED.md).
 *
 * Primary data: R1 (overview/entry points) + R6 (deployment/build).
 * Fallback: static deps + env data.
 */
export function renderGettingStarted(ctx: RenderContext): string {
  const r1 = ctx.rounds.r1?.data;
  const r6 = ctx.rounds.r6?.data;
  const _staticDeps = ctx.staticAnalysis.dependencies;
  const staticEnv = ctx.staticAnalysis.env;

  const roundsUsed = collectRoundsUsed(ctx, 1, 6);
  const status = r1 && r6 ? 'complete' : roundsUsed.length > 0 ? 'partial' : 'static-only';

  return renderDocument(ctx, {
    title: 'Getting Started',
    documentId: '02-getting-started',
    category: 'guide',
    aiRoundsUsed: roundsUsed,
    status,
    relatedDocs: [
      { docId: '08-ENVIRONMENT', label: 'Environment' },
      { docId: '04-FILE-STRUCTURE', label: 'File Structure' },
      { docId: '07-DEPENDENCIES', label: 'Dependencies' },
    ],
    renderBody: (lines) => {
      // ── 2-sentence summary (DOC-17) ─────────────────────────────────
      lines.push(
        `Get ${ctx.projectName} running locally in under 5 minutes. This guide covers prerequisites, installation, and first run.`,
      );
      lines.push('');

      // ── Warning banner ──────────────────────────────────────────────
      if (!r1 && !r6) {
        lines.push(
          '> **Note:** AI analysis was unavailable. Content is based on static analysis only.',
        );
        lines.push('');
      }

      // ── Prerequisites ───────────────────────────────────────────────
      lines.push('## Prerequisites');
      lines.push('');
      lines.push(sectionIntro('Ensure the following tools are installed before proceeding.'));
      lines.push('');

      const language = r1?.primaryLanguage ?? detectLanguage(ctx);
      const packageManager = detectPackageManager(ctx);

      if (language) {
        lines.push(`- **${language}** runtime`);
      }
      if (packageManager) {
        lines.push(`- **${packageManager}** package manager`);
      }
      if (!language && !packageManager) {
        lines.push('- See project configuration for runtime requirements');
      }
      lines.push('');

      // ── Installation ────────────────────────────────────────────────
      lines.push('## Installation');
      lines.push('');
      lines.push(sectionIntro('Clone the repository and install dependencies.'));
      lines.push('');

      const gitInfo = ctx.staticAnalysis.gitHistory;
      if (gitInfo.isGitRepo) {
        lines.push('```bash');
        lines.push(`git clone <repository-url>`);
        lines.push(`cd ${ctx.projectName}`);
        lines.push('```');
        lines.push('');
      }

      const installCmd = deriveInstallCommand(packageManager);
      if (installCmd) {
        lines.push('```bash');
        lines.push(installCmd);
        lines.push('```');
        lines.push('');
      }

      // ── Running the Project ─────────────────────────────────────────
      lines.push('## Running the Project');
      lines.push('');

      if (r6 && r6.buildProcess.commands.length > 0) {
        lines.push(sectionIntro('Build and run the project using the following commands.'));
        lines.push('');
        lines.push('```bash');
        for (const cmd of r6.buildProcess.commands) {
          lines.push(cmd);
        }
        lines.push('```');
        lines.push('');

        const scripts = Object.entries(r6.buildProcess.scripts);
        if (scripts.length > 0) {
          lines.push('**Available scripts:**');
          lines.push('');
          for (const [name, desc] of scripts) {
            lines.push(`- \`${name}\`: ${desc}`);
          }
          lines.push('');
        }
      } else if (r1 && r1.entryPoints.length > 0) {
        lines.push(sectionIntro('Start with one of the following entry points.'));
        lines.push('');
        for (const ep of r1.entryPoints) {
          lines.push(`- ${codeRef(ep.path)} (${ep.type}): ${ep.description}`);
        }
        lines.push('');
      } else {
        lines.push(sectionIntro('Refer to the project README or configuration for run commands.'));
        lines.push('');
      }

      // ── Project Structure Quick Reference ───────────────────────────
      lines.push('## Project Structure Quick Reference');
      lines.push('');
      lines.push(
        sectionIntro(
          `For the full file structure, see ${crossRef('04-FILE-STRUCTURE', undefined, 'File Structure')}.`,
        ),
      );
      lines.push('');

      const topLevelDirs = ctx.staticAnalysis.fileTree.directoryTree
        .filter((entry) => entry.type === 'directory' && !entry.path.includes('/'))
        .slice(0, 10);

      if (topLevelDirs.length > 0) {
        for (const dir of topLevelDirs) {
          lines.push(`- \`${dir.path}/\``);
        }
        lines.push('');
      }

      // ── Environment Setup ───────────────────────────────────────────
      lines.push('## Environment Setup');
      lines.push('');
      lines.push(
        sectionIntro(
          `For full environment configuration, see ${crossRef('08-ENVIRONMENT', undefined, 'Environment')}.`,
        ),
      );
      lines.push('');

      if (r6 && r6.envVars.length > 0) {
        lines.push('**Required environment variables:**');
        lines.push('');
        const requiredVars = r6.envVars.filter((v) => v.required);
        const optionalVars = r6.envVars.filter((v) => !v.required);

        if (requiredVars.length > 0) {
          for (const v of requiredVars) {
            lines.push(`- \`${v.name}\`: ${v.purpose}`);
          }
          lines.push('');
        }

        if (optionalVars.length > 0) {
          lines.push('**Optional environment variables:**');
          lines.push('');
          for (const v of optionalVars) {
            lines.push(`- \`${v.name}\`: ${v.purpose}`);
          }
          lines.push('');
        }
      } else if (staticEnv.envFiles.length > 0) {
        lines.push('**Environment files detected:**');
        lines.push('');
        for (const ef of staticEnv.envFiles) {
          lines.push(
            `- ${codeRef(ef.path)} (${ef.variables.length} variable${ef.variables.length !== 1 ? 's' : ''})`,
          );
        }
        lines.push('');
      } else {
        lines.push('No environment variables detected.');
        lines.push('');
      }

      // ── AI structured block ─────────────────────────────────────────
      pushStructuredBlock(lines, ctx, {
        project_name: ctx.projectName,
        language,
        package_manager: packageManager,
        has_build_commands: !!(r6 && r6.buildProcess.commands.length > 0),
        env_var_count: r6?.envVars.length ?? staticEnv.envFiles.flatMap((f) => f.variables).length,
        top_level_dirs: topLevelDirs.map((d) => d.path),
      });
    },
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function detectLanguage(ctx: RenderContext): string | null {
  const extensions = Object.entries(ctx.staticAnalysis.fileTree.filesByExtension).sort(
    ([, a], [, b]) => b - a,
  );

  if (extensions.length === 0) return null;

  const extToLang: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.py': 'Python',
    '.rb': 'Ruby',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.cs': 'C#',
    '.cpp': 'C++',
    '.c': 'C',
    '.swift': 'Swift',
    '.php': 'PHP',
  };

  for (const [ext] of extensions) {
    if (extToLang[ext]) return extToLang[ext];
  }

  return extensions[0][0];
}

function detectPackageManager(ctx: RenderContext): string | null {
  const manifests = ctx.staticAnalysis.dependencies.manifests;

  for (const manifest of manifests) {
    if (manifest.packageManager) return manifest.packageManager;
  }

  const fileNames = ctx.staticAnalysis.fileTree.directoryTree.map((e) => e.path);

  if (fileNames.some((f) => f === 'pnpm-lock.yaml')) return 'pnpm';
  if (fileNames.some((f) => f === 'yarn.lock')) return 'yarn';
  if (fileNames.some((f) => f === 'package-lock.json')) return 'npm';
  if (fileNames.some((f) => f === 'requirements.txt' || f === 'Pipfile')) return 'pip';
  if (fileNames.some((f) => f === 'Gemfile')) return 'bundler';
  if (fileNames.some((f) => f === 'go.mod')) return 'go';
  if (fileNames.some((f) => f === 'Cargo.toml')) return 'cargo';

  return null;
}

function deriveInstallCommand(pm: string | null): string | null {
  switch (pm) {
    case 'npm':
      return 'npm install';
    case 'yarn':
      return 'yarn install';
    case 'pnpm':
      return 'pnpm install';
    case 'pip':
      return 'pip install -r requirements.txt';
    case 'bundler':
      return 'bundle install';
    case 'go':
      return 'go mod download';
    case 'cargo':
      return 'cargo build';
    default:
      return null;
  }
}
