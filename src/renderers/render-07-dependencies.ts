import type { RenderContext } from './types.js';
import { buildTable, codeRef, sectionIntro } from './utils.js';
import { buildDependencyDiagram } from './mermaid.js';
import { renderDocument, collectRoundsUsed, pushStructuredBlock } from './render-template.js';

// ─── renderDependencies ────────────────────────────────────────────────────

/**
 * Render the Dependencies document (07-DEPENDENCIES.md).
 *
 * Primary data: R1 keyDependencies + static dependency data.
 * This is one of the 4 documents with mermaid diagrams.
 */
export function renderDependencies(ctx: RenderContext): string {
  const r1 = ctx.rounds.r1?.data;
  const staticDeps = ctx.staticAnalysis.dependencies;

  const roundsUsed = collectRoundsUsed(ctx, 1);
  const status = r1 ? 'complete' : 'static-only';

  const allStaticDeps = staticDeps.manifests.flatMap((m) => m.dependencies);
  const totalDeps = allStaticDeps.length;
  const manifestCount = staticDeps.manifests.length;

  return renderDocument(ctx, {
    title: 'Dependencies',
    documentId: '07-dependencies',
    category: 'dependencies',
    aiRoundsUsed: roundsUsed,
    status,
    relatedDocs: [
      { docId: '03-ARCHITECTURE', label: 'Architecture' },
      { docId: '02-GETTING-STARTED', label: 'Getting Started' },
      { docId: '13-DEPLOYMENT', label: 'Deployment' },
    ],
    renderBody: (lines) => {
      // ── 2-sentence summary (DOC-17) ─────────────────────────────────
      lines.push(
        `${ctx.projectName} depends on ${totalDeps} packages across ${manifestCount} manifest${manifestCount !== 1 ? 's' : ''}. This document explains why each dependency exists and its role.`,
      );
      lines.push('');

      // ── Warning banner ──────────────────────────────────────────────
      if (!r1) {
        lines.push('> **Note:** AI analysis was unavailable. Dependency roles are not enriched.');
        lines.push('');
      }

      // Build merged dependency data
      const r1DepMap = new Map<string, string>();
      if (r1) {
        for (const dep of r1.keyDependencies) {
          r1DepMap.set(dep.name, dep.role);
        }
      }

      const prodDeps = allStaticDeps.filter((d) => d.type === 'production');
      const devDeps = allStaticDeps.filter((d) => d.type === 'development');
      const peerDeps = allStaticDeps.filter((d) => d.type === 'peer' || d.type === 'optional');

      // ── Production Dependencies ─────────────────────────────────────
      lines.push('## Production Dependencies');
      lines.push('');

      if (prodDeps.length > 0) {
        lines.push(sectionIntro('Runtime dependencies required for the application to function.'));
        lines.push('');
        const prodRows = prodDeps.map((d) => [d.name, d.version, r1DepMap.get(d.name) ?? '-']);
        lines.push(buildTable(['Name', 'Version', 'Role'], prodRows));
      } else {
        lines.push('No production dependencies detected.');
      }
      lines.push('');

      pushStructuredBlock(lines, ctx, {
        section: 'production_dependencies',
        count: prodDeps.length,
        dependencies: prodDeps.map((d) => ({
          name: d.name,
          version: d.version,
          role: r1DepMap.get(d.name) ?? 'unknown',
        })),
      });

      // ── Development Dependencies ────────────────────────────────────
      lines.push('## Development Dependencies');
      lines.push('');

      if (devDeps.length > 0) {
        lines.push(
          sectionIntro('Development-time dependencies for building, testing, and tooling.'),
        );
        lines.push('');
        const devRows = devDeps.map((d) => [d.name, d.version, r1DepMap.get(d.name) ?? '-']);
        lines.push(buildTable(['Name', 'Version', 'Role'], devRows));
      } else {
        lines.push('No development dependencies detected.');
      }
      lines.push('');

      pushStructuredBlock(lines, ctx, {
        section: 'development_dependencies',
        count: devDeps.length,
        dependencies: devDeps.map((d) => ({
          name: d.name,
          version: d.version,
          role: r1DepMap.get(d.name) ?? 'unknown',
        })),
      });

      // ── Peer/Optional Dependencies ──────────────────────────────────
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

      // ── Package Manifests ───────────────────────────────────────────
      lines.push('## Package Manifests');
      lines.push('');

      if (staticDeps.manifests.length > 0) {
        lines.push(sectionIntro('Manifest files declaring project dependencies.'));
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

      // ── Warnings ────────────────────────────────────────────────────
      if (staticDeps.warnings.length > 0) {
        lines.push('## Warnings');
        lines.push('');
        for (const warning of staticDeps.warnings) {
          lines.push(`- ${warning}`);
        }
        lines.push('');
      }

      // ── Diagrams ────────────────────────────────────────────────────
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
    },
  });
}
