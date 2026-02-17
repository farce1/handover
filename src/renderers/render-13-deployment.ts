import type { RenderContext } from './types.js';
import { buildFrontMatter, crossRef, codeRef, buildTable, sectionIntro } from './utils.js';

// ─── renderDeployment ──────────────────────────────────────────────────────

/**
 * Render 13-DEPLOYMENT.md from Round 6 (Deployment Inference) data.
 *
 * Primary data: R6 (deployment platform, CI, infrastructure, build process).
 * If no R6 data: partial render from static analysis (detect CI files in
 * file tree, build scripts from package.json, Dockerfile presence).
 */
export function renderDeployment(ctx: RenderContext): string {
  const r6 = ctx.rounds.r6?.data;
  const hasR6 = !!r6;

  // Static fallback data
  const staticDeps = ctx.staticAnalysis.dependencies;
  const fileTree = ctx.staticAnalysis.fileTree;

  // If no R6 and no useful static data, skip generation
  if (!hasR6 && staticDeps.manifests.length === 0) return '';

  const lines: string[] = [];

  const roundsUsed: number[] = [];
  if (ctx.rounds.r1) roundsUsed.push(1);
  if (ctx.rounds.r2) roundsUsed.push(2);
  if (ctx.rounds.r6) roundsUsed.push(6);

  // Determine platform description for summary
  const platformDesc = hasR6
    ? (r6.deployment.platform || r6.deployment.ciProvider || 'undetermined platform')
    : detectCIFromFileTree(fileTree) || 'undetermined platform';

  // YAML front-matter
  lines.push(buildFrontMatter({
    title: '13 - Deployment',
    document_id: '13-deployment',
    category: 'deployment',
    project: ctx.projectName,
    generated_at: ctx.generatedAt,
    handover_version: '0.1.0',
    audience: ctx.audience,
    ai_rounds_used: roundsUsed.sort(),
    status: hasR6 ? 'complete' : 'static-only',
  }));

  // Title
  lines.push('# Deployment');
  lines.push('');

  // Warning banner if static-only
  if (!hasR6) {
    lines.push('> **Note:** AI analysis for this section was unavailable. Content is based on static analysis only and may be incomplete.');
    lines.push('');
  }

  // 2-sentence summary (DOC-17)
  lines.push(
    `${ctx.projectName} deploys via ${platformDesc}. This document covers CI/CD pipelines, infrastructure, environments, and build processes.`,
  );
  lines.push('');

  if (hasR6) {
    // ── Deployment Platform ────────────────────────────────────────────────
    lines.push('## Deployment Platform');
    lines.push('');

    if (r6.deployment.platform) {
      lines.push(`**Platform:** ${r6.deployment.platform}`);
      lines.push('');
    }

    lines.push(`**Containerized:** ${r6.deployment.containerized ? 'Yes' : 'No'}`);
    lines.push('');

    if (r6.deployment.ciProvider) {
      lines.push(`**CI Provider:** ${r6.deployment.ciProvider}`);
      lines.push('');
    }

    if (r6.deployment.evidence.length > 0) {
      lines.push('**Evidence:**');
      lines.push('');
      for (const ev of r6.deployment.evidence) {
        lines.push(`- ${codeRef(ev)}`);
      }
      lines.push('');
    }

    // ── Build Process ──────────────────────────────────────────────────────
    lines.push('## Build Process');
    lines.push('');

    if (r6.buildProcess.commands.length > 0) {
      lines.push('**Commands:**');
      lines.push('');
      for (const cmd of r6.buildProcess.commands) {
        lines.push(`- \`${cmd}\``);
      }
      lines.push('');
    }

    if (r6.buildProcess.artifacts.length > 0) {
      lines.push('**Artifacts:**');
      lines.push('');
      for (const artifact of r6.buildProcess.artifacts) {
        lines.push(`- ${artifact}`);
      }
      lines.push('');
    }

    const scriptEntries = Object.entries(r6.buildProcess.scripts);
    if (scriptEntries.length > 0) {
      lines.push('**Scripts:**');
      lines.push('');
      lines.push(buildTable(
        ['Script', 'Command'],
        scriptEntries.map(([name, cmd]) => [name, `\`${cmd}\``]),
      ));
      lines.push('');
    }

    // ── Infrastructure ─────────────────────────────────────────────────────
    if (r6.infrastructure.length > 0) {
      lines.push('## Infrastructure');
      lines.push('');

      lines.push(buildTable(
        ['Service', 'Purpose', 'Evidence'],
        r6.infrastructure.map((infra) => [
          infra.service,
          infra.purpose,
          codeRef(infra.evidence),
        ]),
      ));
      lines.push('');
    }

    // ── Environment Variables (brief, cross-ref to 08) ───────────────────
    if (r6.envVars.length > 0) {
      lines.push('## Environment Variables');
      lines.push('');
      lines.push(sectionIntro(
        `See ${crossRef('08-ENVIRONMENT', undefined, 'Environment')} for full details. Deployment-critical variables listed below.`,
      ));
      lines.push('');

      const deployVars = r6.envVars.filter((v) => v.required);
      if (deployVars.length > 0) {
        lines.push(buildTable(
          ['Name', 'Purpose', 'Source'],
          deployVars.map((v) => [`\`${v.name}\``, v.purpose, v.source]),
        ));
        lines.push('');
      }
    }

    // ── Key Findings ─────────────────────────────────────────────────────
    if (r6.findings.length > 0) {
      lines.push('## Key Findings');
      lines.push('');
      for (const finding of r6.findings) {
        lines.push(`- ${finding}`);
      }
      lines.push('');
    }
  } else {
    // ── Static fallback ──────────────────────────────────────────────────
    lines.push('## Detected Build Configuration');
    lines.push('');

    // Detect CI files
    const ciFiles = detectCIFiles(fileTree);
    if (ciFiles.length > 0) {
      lines.push('**CI/CD Configuration Files:**');
      lines.push('');
      for (const file of ciFiles) {
        lines.push(`- ${codeRef(file)}`);
      }
      lines.push('');
    }

    // Detect Dockerfile
    const dockerFiles = fileTree.directoryTree.filter(
      (e) => e.type === 'file' && /dockerfile/i.test(e.path),
    );
    if (dockerFiles.length > 0) {
      lines.push('**Docker:**');
      lines.push('');
      for (const df of dockerFiles) {
        lines.push(`- ${codeRef(df.path)}`);
      }
      lines.push('');
    }

    // Build scripts from package.json
    for (const manifest of staticDeps.manifests) {
      lines.push(`**Detected from:** ${codeRef(manifest.file)}`);
      lines.push('');
    }
  }

  // ── Cross-references ───────────────────────────────────────────────────
  lines.push('## Related Documents');
  lines.push('');
  lines.push(`- ${crossRef('08-ENVIRONMENT', undefined, 'Environment')}`);
  lines.push(`- ${crossRef('02-GETTING-STARTED', undefined, 'Getting Started')}`);
  lines.push(`- ${crossRef('07-DEPENDENCIES', undefined, 'Dependencies')}`);
  lines.push('');

  return lines.join('\n');
}

// ─── Static fallback helpers ───────────────────────────────────────────────

/**
 * Detect CI provider from common CI config files in the file tree.
 */
function detectCIFromFileTree(
  fileTree: RenderContext['staticAnalysis']['fileTree'],
): string | null {
  const ciPatterns: Array<{ pattern: RegExp; provider: string }> = [
    { pattern: /\.github\/workflows/i, provider: 'GitHub Actions' },
    { pattern: /\.gitlab-ci/i, provider: 'GitLab CI' },
    { pattern: /Jenkinsfile/i, provider: 'Jenkins' },
    { pattern: /\.circleci/i, provider: 'CircleCI' },
    { pattern: /\.travis\.yml/i, provider: 'Travis CI' },
    { pattern: /azure-pipelines/i, provider: 'Azure Pipelines' },
  ];

  for (const entry of fileTree.directoryTree) {
    for (const { pattern, provider } of ciPatterns) {
      if (pattern.test(entry.path)) return provider;
    }
  }

  return null;
}

/**
 * Find CI-related files in the file tree.
 */
function detectCIFiles(
  fileTree: RenderContext['staticAnalysis']['fileTree'],
): string[] {
  const ciPatterns = [
    /\.github\/workflows/i,
    /\.gitlab-ci/i,
    /Jenkinsfile/i,
    /\.circleci/i,
    /\.travis\.yml/i,
    /azure-pipelines/i,
    /dockerfile/i,
    /docker-compose/i,
  ];

  return fileTree.directoryTree
    .filter((e) => e.type === 'file' && ciPatterns.some((p) => p.test(e.path)))
    .map((e) => e.path);
}
