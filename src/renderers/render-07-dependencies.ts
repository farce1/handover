import type { RenderContext } from './types.js';
import {
  buildFrontMatter,
  buildTable,
  codeRef,
  crossRef,
  sectionIntro,
} from './utils.js';
import { structuredBlock } from './audience.js';
import { buildDependencyDiagram } from './mermaid.js';

// ─── renderDependencies ────────────────────────────────────────────────────

/**
 * Render the Dependencies document (07-DEPENDENCIES.md).
 *
 * Primary data: R1 keyDependencies + static dependency data.
 * This is one of the 4 documents with mermaid diagrams.
 */
export function renderDependencies(ctx: RenderContext): string {
  const lines: string[] = [];
  const r1 = ctx.rounds.r1?.data;
  const staticDeps = ctx.staticAnalysis.dependencies;

  // Determine which rounds contributed
  const roundsUsed: number[] = [];
  if (r1) roundsUsed.push(1);

  const status = r1 ? 'complete' : 'static-only';

  // Collect all dependencies from static analysis
  const allStaticDeps = staticDeps.manifests.flatMap((m) => m.dependencies);
  const totalDeps = allStaticDeps.length;
  const manifestCount = staticDeps.manifests.length;

  // ── YAML front-matter ──────────────────────────────────────────────────
  lines.push(
    buildFrontMatter({
      title: 'Dependencies',
      document_id: '07-dependencies',
      category: 'dependencies',
      project: ctx.projectName,
      generated_at: ctx.generatedAt,
      handover_version: '0.1.0',
      audience: ctx.audience,
      ai_rounds_used: roundsUsed,
      status,
    }),
  );

  // ── Title ──────────────────────────────────────────────────────────────
  lines.push('# Dependencies');
  lines.push('');

  // ── 2-sentence summary (DOC-17) ───────────────────────────────────────
  lines.push(
    `${ctx.projectName} depends on ${totalDeps} packages across ${manifestCount} manifest${manifestCount !== 1 ? 's' : ''}. This document explains why each dependency exists and its role.`,
  );
  lines.push('');

  // ── Warning banner ────────────────────────────────────────────────────
  if (!r1) {
    lines.push(
      '> **Note:** AI analysis was unavailable. Dependency roles are not enriched.',
    );
    lines.push('');
  }

  // ── Build merged dependency data ──────────────────────────────────────
  // Merge R1 keyDependencies (with role info) into static deps
  const r1DepMap = new Map<string, string>();
  if (r1) {
    for (const dep of r1.keyDependencies) {
      r1DepMap.set(dep.name, dep.role);
    }
  }

  const prodDeps = allStaticDeps.filter((d) => d.type === 'production');
  const devDeps = allStaticDeps.filter((d) => d.type === 'development');
  const peerDeps = allStaticDeps.filter(
    (d) => d.type === 'peer' || d.type === 'optional',
  );

  // ── Production Dependencies ───────────────────────────────────────────
  lines.push('## Production Dependencies');
  lines.push('');

  if (prodDeps.length > 0) {
    lines.push(
      sectionIntro(
        'Runtime dependencies required for the application to function.',
      ),
    );
    lines.push('');

    const prodRows = prodDeps.map((d) => {
      const role = r1DepMap.get(d.name) ?? '-';
      return [d.name, d.version, role];
    });
    lines.push(buildTable(['Name', 'Version', 'Role'], prodRows));
  } else {
    lines.push('No production dependencies detected.');
  }
  lines.push('');

  // ── AI structured block for production deps ───────────────────────────
  const prodBlock = structuredBlock(ctx.audience, {
    section: 'production_dependencies',
    count: prodDeps.length,
    dependencies: prodDeps.map((d) => ({
      name: d.name,
      version: d.version,
      role: r1DepMap.get(d.name) ?? 'unknown',
    })),
  });
  if (prodBlock) {
    lines.push(prodBlock);
  }

  // ── Development Dependencies ──────────────────────────────────────────
  lines.push('## Development Dependencies');
  lines.push('');

  if (devDeps.length > 0) {
    lines.push(
      sectionIntro(
        'Development-time dependencies for building, testing, and tooling.',
      ),
    );
    lines.push('');

    const devRows = devDeps.map((d) => {
      const role = r1DepMap.get(d.name) ?? '-';
      return [d.name, d.version, role];
    });
    lines.push(buildTable(['Name', 'Version', 'Role'], devRows));
  } else {
    lines.push('No development dependencies detected.');
  }
  lines.push('');

  // ── AI structured block for dev deps ──────────────────────────────────
  const devBlock = structuredBlock(ctx.audience, {
    section: 'development_dependencies',
    count: devDeps.length,
    dependencies: devDeps.map((d) => ({
      name: d.name,
      version: d.version,
      role: r1DepMap.get(d.name) ?? 'unknown',
    })),
  });
  if (devBlock) {
    lines.push(devBlock);
  }

  // ── Peer/Optional Dependencies ────────────────────────────────────────
  if (peerDeps.length > 0) {
    lines.push('## Peer/Optional Dependencies');
    lines.push('');
    lines.push(
      sectionIntro(
        'Dependencies expected to be provided by the consuming project or optional enhancements.',
      ),
    );
    lines.push('');

    const peerRows = peerDeps.map((d) => [d.name, d.version, d.type]);
    lines.push(buildTable(['Name', 'Version', 'Type'], peerRows));
    lines.push('');
  }

  // ── Package Manifests ─────────────────────────────────────────────────
  lines.push('## Package Manifests');
  lines.push('');

  if (staticDeps.manifests.length > 0) {
    lines.push(
      sectionIntro('Manifest files declaring project dependencies.'),
    );
    lines.push('');
    for (const manifest of staticDeps.manifests) {
      lines.push(
        `- ${codeRef(manifest.file)} (${manifest.packageManager}, ${manifest.dependencies.length} dependencies)`,
      );
    }
  } else {
    lines.push('No manifest files detected.');
  }
  lines.push('');

  // ── Warnings ──────────────────────────────────────────────────────────
  if (staticDeps.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const warning of staticDeps.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  // ── Diagrams ──────────────────────────────────────────────────────────
  const diagram = buildDependencyDiagram(ctx);
  if (diagram) {
    lines.push('## Diagrams');
    lines.push('');
    lines.push(
      sectionIntro(
        'Visual representation of the dependency graph showing production and development relationships.',
      ),
    );
    lines.push('');
    lines.push(diagram);
    lines.push('');
  }

  // ── Cross-references ──────────────────────────────────────────────────
  lines.push('## Related Documents');
  lines.push('');
  lines.push(`- ${crossRef('03-ARCHITECTURE', undefined, 'Architecture')}`);
  lines.push(
    `- ${crossRef('02-GETTING-STARTED', undefined, 'Getting Started')}`,
  );
  lines.push(`- ${crossRef('13-DEPLOYMENT', undefined, 'Deployment')}`);
  lines.push('');

  return lines.join('\n');
}
