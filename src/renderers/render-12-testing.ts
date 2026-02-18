import type { RenderContext } from './types.js';
import { buildTable, codeRef, sectionIntro } from './utils.js';
import { renderDocument, collectRoundsUsed, pushStructuredBlock } from './render-template.js';

// ─── renderTesting ─────────────────────────────────────────────────────────

/**
 * Render the Testing Strategy document (12-TESTING-STRATEGY.md).
 *
 * Primary data: R5 (testing conventions) + static test data.
 * Renders well with static-only data.
 */
export function renderTesting(ctx: RenderContext): string {
  const r5 = ctx.rounds.r5?.data;
  const tests = ctx.staticAnalysis.tests;

  const roundsUsed = collectRoundsUsed(ctx, 5);
  const status = r5 ? 'complete' : 'static-only';

  const { totalTestFiles, totalTests, frameworksDetected } = tests.summary;
  const frameworks =
    frameworksDetected.length > 0
      ? frameworksDetected.join(', ')
      : tests.frameworks.length > 0
        ? tests.frameworks.join(', ')
        : 'no framework detected';

  return renderDocument(ctx, {
    title: 'Testing Strategy',
    documentId: '12-testing',
    category: 'testing',
    aiRoundsUsed: roundsUsed,
    status,
    relatedDocs: [
      { docId: '11-CONVENTIONS', label: 'Conventions' },
      { docId: '09-EDGE-CASES-AND-GOTCHAS', label: 'Edge Cases and Gotchas' },
    ],
    renderBody: (lines) => {
      // ── 2-sentence summary (DOC-17) ─────────────────────────────────
      lines.push(
        `${ctx.projectName} uses ${frameworks} for testing with ${totalTests} tests across ${totalTestFiles} files. This document covers test organization, coverage, and identified gaps.`,
      );
      lines.push('');

      // ── Frameworks ──────────────────────────────────────────────────
      lines.push('## Frameworks');
      lines.push('');

      if (tests.frameworks.length > 0) {
        lines.push(sectionIntro('Detected test frameworks and their configuration.'));
        lines.push('');
        for (const fw of tests.frameworks) {
          lines.push(`- **${fw}**`);
        }
        lines.push('');

        if (tests.configFiles.length > 0) {
          lines.push('**Configuration files:**');
          lines.push('');
          for (const cf of tests.configFiles) {
            lines.push(`- ${codeRef(cf)}`);
          }
          lines.push('');
        }
      } else {
        lines.push('No test framework detected.');
        lines.push('');
      }

      // ── Test Files ──────────────────────────────────────────────────
      lines.push('## Test Files');
      lines.push('');

      if (tests.testFiles.length > 0) {
        lines.push(sectionIntro(`${totalTestFiles} test files detected containing ${totalTests} total tests.`));
        lines.push('');

        const CAP = 50;
        const displayFiles = tests.testFiles.slice(0, CAP);
        const fileRows = displayFiles.map((f) => [
          codeRef(f.path),
          f.framework,
          String(f.testCount),
        ]);
        lines.push(buildTable(['Path', 'Framework', 'Tests'], fileRows));

        if (tests.testFiles.length > CAP) {
          lines.push('');
          lines.push(`*...and ${tests.testFiles.length - CAP} more test files.*`);
        }
      } else {
        lines.push('No test files detected.');
      }
      lines.push('');

      // ── Coverage ────────────────────────────────────────────────────
      lines.push('## Coverage');
      lines.push('');

      if (tests.coverageDataPath) {
        lines.push(sectionIntro(`Coverage data found at ${codeRef(tests.coverageDataPath)}.`));
      } else {
        lines.push(sectionIntro('No coverage data found. Consider configuring a coverage reporter for your test framework.'));
      }
      lines.push('');

      // ── Test Organization ───────────────────────────────────────────
      lines.push('## Test Organization');
      lines.push('');
      lines.push(sectionIntro('Test files categorized by conventional directory patterns.'));
      lines.push('');

      const unitTests = tests.testFiles.filter(
        (f) =>
          f.path.includes('/unit/') ||
          f.path.includes('__tests__') ||
          f.path.match(/\.test\.[jt]sx?$/) ||
          f.path.match(/\.spec\.[jt]sx?$/),
      );
      const integrationTests = tests.testFiles.filter(
        (f) => f.path.includes('/integration/') || f.path.includes('/int/'),
      );
      const e2eTests = tests.testFiles.filter(
        (f) =>
          f.path.includes('/e2e/') ||
          f.path.includes('/cypress/') ||
          f.path.includes('/playwright/'),
      );
      const otherTests = tests.testFiles.filter(
        (f) =>
          !unitTests.includes(f) &&
          !integrationTests.includes(f) &&
          !e2eTests.includes(f),
      );

      const orgRows: string[][] = [];
      if (unitTests.length > 0) {
        orgRows.push(['Unit', String(unitTests.length), String(unitTests.reduce((sum, f) => sum + f.testCount, 0))]);
      }
      if (integrationTests.length > 0) {
        orgRows.push(['Integration', String(integrationTests.length), String(integrationTests.reduce((sum, f) => sum + f.testCount, 0))]);
      }
      if (e2eTests.length > 0) {
        orgRows.push(['E2E', String(e2eTests.length), String(e2eTests.reduce((sum, f) => sum + f.testCount, 0))]);
      }
      if (otherTests.length > 0) {
        orgRows.push(['Other', String(otherTests.length), String(otherTests.reduce((sum, f) => sum + f.testCount, 0))]);
      }

      if (orgRows.length > 0) {
        lines.push(buildTable(['Category', 'Files', 'Tests'], orgRows));
      } else {
        lines.push('No test files to categorize.');
      }
      lines.push('');

      // ── AI Insights (if R5 available) ───────────────────────────────
      if (r5) {
        const testInsights: string[] = [];

        for (const mod of r5.modules) {
          for (const conv of mod.conventions) {
            if (
              conv.pattern.toLowerCase().includes('test') ||
              conv.description.toLowerCase().includes('test')
            ) {
              testInsights.push(`**${mod.moduleName}**: ${conv.pattern} -- ${conv.description}`);
            }
          }
          for (const pattern of mod.errorHandling.patterns) {
            if (
              pattern.toLowerCase().includes('test') ||
              pattern.toLowerCase().includes('assert') ||
              pattern.toLowerCase().includes('mock')
            ) {
              testInsights.push(`**${mod.moduleName}** (error handling): ${pattern}`);
            }
          }
        }

        for (const conv of r5.crossCuttingConventions) {
          if (
            conv.pattern.toLowerCase().includes('test') ||
            conv.description.toLowerCase().includes('test')
          ) {
            testInsights.push(`**Cross-cutting**: ${conv.pattern} (${conv.frequency}) -- ${conv.description}`);
          }
        }

        if (testInsights.length > 0) {
          lines.push('## AI Insights');
          lines.push('');
          lines.push(sectionIntro('Testing patterns and conventions identified by AI analysis.'));
          lines.push('');
          for (const insight of testInsights) {
            lines.push(`- ${insight}`);
          }
          lines.push('');

          pushStructuredBlock(lines, ctx, {
            section: 'testing_ai_insights',
            insight_count: testInsights.length,
            modules_analyzed: r5.modules.length,
          });
        }
      }
    },
  });
}
