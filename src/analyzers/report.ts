import type { StaticAnalysisResult } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function anchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-');
}

/** Pad or truncate a string to fit a table cell */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

// ─── Markdown Report ─────────────────────────────────────────────────────────

const SECTIONS = [
  'Project Overview',
  'File Tree',
  'Dependencies',
  'Git History',
  'TODOs & Issues',
  'Environment',
  'Code Structure (AST)',
  'Tests',
  'Documentation',
] as const;

/**
 * Format the full static analysis result as a single combined Markdown report
 * with YAML frontmatter, table of contents, and per-section output.
 */
export function formatMarkdownReport(result: StaticAnalysisResult): string {
  const lines: string[] = [];

  // ── YAML frontmatter
  lines.push('---');
  lines.push(`analyzedAt: "${result.metadata.analyzedAt}"`);
  lines.push(`rootDir: "${result.metadata.rootDir}"`);
  lines.push(`fileCount: ${result.metadata.fileCount}`);
  lines.push(`elapsed: ${result.metadata.elapsed}`);
  lines.push('---');
  lines.push('');

  // ── Title
  lines.push('# Static Analysis Report');
  lines.push('');

  // ── Table of Contents
  lines.push('## Table of Contents');
  lines.push('');
  for (let i = 0; i < SECTIONS.length; i++) {
    lines.push(`${i + 1}. [${SECTIONS[i]}](#${anchor(SECTIONS[i])})`);
  }
  lines.push('');

  // ── Section 1: Project Overview
  lines.push('## Project Overview');
  lines.push('');
  const ft = result.fileTree;
  lines.push(`- **Files:** ${ft.totalFiles}`);
  lines.push(`- **Directories:** ${ft.totalDirs}`);
  lines.push(`- **Total Lines:** ${ft.totalLines.toLocaleString()}`);
  lines.push(`- **Total Size:** ${humanSize(ft.totalSize)}`);
  lines.push('');

  // Top 5 extensions by count
  const extEntries = Object.entries(ft.filesByExtension)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (extEntries.length > 0) {
    lines.push('**Top File Extensions:**');
    lines.push('');
    lines.push('| Extension | Count |');
    lines.push('|-----------|-------|');
    for (const [ext, count] of extEntries) {
      lines.push(`| ${ext || '(none)'} | ${count} |`);
    }
    lines.push('');
  }

  // ── Section 2: File Tree
  lines.push('## File Tree');
  lines.push('');

  // Top 20 largest files
  if (ft.largestFiles.length > 0) {
    lines.push('### Largest Files');
    lines.push('');
    lines.push('| Path | Size | Lines |');
    lines.push('|------|------|-------|');
    for (const file of ft.largestFiles.slice(0, 20)) {
      lines.push(`| ${truncate(file.path, 60)} | ${humanSize(file.size)} | ${file.lines} |`);
    }
    lines.push('');
  }

  // Extension breakdown
  if (Object.keys(ft.filesByExtension).length > 0) {
    lines.push('### Extension Breakdown');
    lines.push('');
    lines.push('| Extension | Count |');
    lines.push('|-----------|-------|');
    const sorted = Object.entries(ft.filesByExtension).sort((a, b) => b[1] - a[1]);
    for (const [ext, count] of sorted) {
      lines.push(`| ${ext || '(none)'} | ${count} |`);
    }
    lines.push('');
  }

  // ── Section 3: Dependencies
  lines.push('## Dependencies');
  lines.push('');
  const deps = result.dependencies;
  if (deps.manifests.length === 0) {
    lines.push('No package manifests found.');
    lines.push('');
  } else {
    for (const manifest of deps.manifests) {
      const prod = manifest.dependencies.filter((d) => d.type === 'production').length;
      const dev = manifest.dependencies.filter((d) => d.type === 'development').length;
      const other = manifest.dependencies.length - prod - dev;

      lines.push(`### ${manifest.file}`);
      lines.push('');
      lines.push(`- **Package Manager:** ${manifest.packageManager}`);
      lines.push(`- **Total Dependencies:** ${manifest.dependencies.length}`);
      lines.push(
        `- **Production:** ${prod} | **Development:** ${dev}${other > 0 ? ` | **Other:** ${other}` : ''}`,
      );
      lines.push('');

      if (manifest.dependencies.length > 0) {
        lines.push('| Name | Version | Type |');
        lines.push('|------|---------|------|');
        for (const dep of manifest.dependencies) {
          lines.push(`| ${dep.name} | ${dep.version} | ${dep.type} |`);
        }
        lines.push('');
      }
    }

    if (deps.warnings.length > 0) {
      lines.push('**Warnings:**');
      for (const w of deps.warnings) {
        lines.push(`- ${w}`);
      }
      lines.push('');
    }
  }

  // ── Section 4: Git History
  lines.push('## Git History');
  lines.push('');
  const git = result.gitHistory;
  if (!git.isGitRepo) {
    lines.push('> **Note:** Not a git repository.');
    lines.push('');
  } else {
    const bp = git.branchPattern;
    lines.push(`- **Branch Strategy:** ${bp.strategy}`);
    if (bp.evidence.length > 0) {
      lines.push(`- **Evidence:** ${bp.evidence.join(', ')}`);
    }
    lines.push(
      `- **Branches:** ${bp.branchCount} (${bp.activeBranches.length} active, ${bp.staleBranches.length} stale)`,
    );
    lines.push(`- **Default Branch:** ${bp.defaultBranch}`);
    lines.push(`- **Contributors:** ${git.contributors.length}`);
    lines.push('');

    // Recent commits (last 10)
    if (git.recentCommits.length > 0) {
      lines.push('### Recent Commits');
      lines.push('');
      lines.push('| Hash | Author | Date | Message |');
      lines.push('|------|--------|------|---------|');
      for (const c of git.recentCommits.slice(0, 10)) {
        lines.push(
          `| ${c.hash.slice(0, 7)} | ${truncate(c.author, 20)} | ${c.date.slice(0, 10)} | ${truncate(c.message, 50)} |`,
        );
      }
      lines.push('');
    }

    // Most changed files (top 15)
    if (git.mostChangedFiles.length > 0) {
      lines.push('### Most Changed Files');
      lines.push('');
      lines.push('| Path | Changes |');
      lines.push('|------|---------|');
      for (const f of git.mostChangedFiles.slice(0, 15)) {
        lines.push(`| ${truncate(f.path, 60)} | ${f.changes} |`);
      }
      lines.push('');
    }

    // Activity by month
    const months = Object.entries(git.activityByMonth);
    if (months.length > 0) {
      lines.push('### Activity by Month');
      lines.push('');
      lines.push('| Month | Commits |');
      lines.push('|-------|---------|');
      for (const [month, count] of months.sort((a, b) => b[0].localeCompare(a[0]))) {
        lines.push(`| ${month} | ${count} |`);
      }
      lines.push('');
    }

    // Top contributors
    if (git.contributors.length > 0) {
      lines.push('### Top Contributors');
      lines.push('');
      lines.push('| Name | Email | Commits |');
      lines.push('|------|-------|---------|');
      for (const c of git.contributors.slice(0, 10)) {
        lines.push(`| ${c.name} | ${c.email} | ${c.commitCount} |`);
      }
      lines.push('');
    }
  }

  if (git.warnings.length > 0) {
    lines.push('**Warnings:**');
    for (const w of git.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  // ── Section 5: TODOs & Issues
  lines.push('## TODOs & Issues');
  lines.push('');
  const todos = result.todos;
  lines.push(`- **Total:** ${todos.summary.total}`);
  if (Object.keys(todos.summary.byCategory).length > 0) {
    const cats = Object.entries(todos.summary.byCategory).sort((a, b) => b[1] - a[1]);
    lines.push(`- **By Category:** ${cats.map(([cat, n]) => `${cat}: ${n}`).join(', ')}`);
  }
  lines.push('');

  if (todos.items.length > 0) {
    // Group by category
    const grouped = new Map<string, typeof todos.items>();
    for (const item of todos.items) {
      const list = grouped.get(item.category) ?? [];
      list.push(item);
      grouped.set(item.category, list);
    }

    for (const [category, items] of grouped) {
      lines.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}`);
      lines.push('');
      lines.push('| File | Line | Marker | Text | Issues |');
      lines.push('|------|------|--------|------|--------|');
      for (const item of items) {
        const refs = item.issueRefs.length > 0 ? item.issueRefs.join(', ') : '-';
        lines.push(
          `| ${truncate(item.file, 40)} | ${item.line} | ${item.marker} | ${truncate(item.text, 40)} | ${refs} |`,
        );
      }
      lines.push('');
    }
  }

  // ── Section 6: Environment
  lines.push('## Environment');
  lines.push('');
  const env = result.env;
  if (env.envFiles.length === 0 && env.envReferences.length === 0) {
    lines.push('No environment files or references found.');
    lines.push('');
  } else {
    if (env.envFiles.length > 0) {
      lines.push('### Environment Files');
      lines.push('');
      for (const ef of env.envFiles) {
        lines.push(`- **${ef.path}** (${ef.variables.length} variables)`);
      }
      lines.push('');
    }

    if (env.envReferences.length > 0) {
      lines.push('### Environment Variable References');
      lines.push('');
      lines.push('| File | Line | Variable |');
      lines.push('|------|------|----------|');
      for (const ref of env.envReferences.slice(0, 50)) {
        lines.push(`| ${truncate(ref.file, 40)} | ${ref.line} | ${ref.variable} |`);
      }
      if (env.envReferences.length > 50) {
        lines.push(`| ... | ... | *(${env.envReferences.length - 50} more)* |`);
      }
      lines.push('');
    }

    if (env.warnings.length > 0) {
      lines.push('**Warnings:**');
      for (const w of env.warnings) {
        lines.push(`- ${w}`);
      }
      lines.push('');
    }
  }

  // ── Section 7: Code Structure (AST)
  lines.push('## Code Structure (AST)');
  lines.push('');
  const ast = result.ast;
  const s = ast.summary;
  lines.push(`- **Total Functions:** ${s.totalFunctions}`);
  lines.push(`- **Total Classes:** ${s.totalClasses}`);
  lines.push(`- **Total Exports:** ${s.totalExports}`);
  lines.push(`- **Total Imports:** ${s.totalImports}`);
  lines.push('');

  // Language breakdown
  const langEntries = Object.entries(s.languageBreakdown).sort((a, b) => b[1] - a[1]);
  if (langEntries.length > 0) {
    lines.push('### Language Breakdown');
    lines.push('');
    lines.push('| Language | Files |');
    lines.push('|----------|-------|');
    for (const [lang, count] of langEntries) {
      lines.push(`| ${lang} | ${count} |`);
    }
    lines.push('');
  }

  // Top 10 files by export count
  const filesWithExports = ast.files
    .filter((f) => f.exports.length > 0)
    .sort((a, b) => b.exports.length - a.exports.length)
    .slice(0, 10);
  if (filesWithExports.length > 0) {
    lines.push('### Top Files by Export Count');
    lines.push('');
    lines.push('| File | Exports |');
    lines.push('|------|---------|');
    for (const f of filesWithExports) {
      lines.push(`| ${truncate(f.path, 60)} | ${f.exports.length} |`);
    }
    lines.push('');
  }

  // ── Section 8: Tests
  lines.push('## Tests');
  lines.push('');
  const tests = result.tests;
  lines.push(
    `- **Frameworks Detected:** ${tests.frameworks.length > 0 ? tests.frameworks.join(', ') : 'None'}`,
  );
  lines.push(`- **Test Files:** ${tests.summary.totalTestFiles}`);
  lines.push(`- **Approximate Test Count:** ${tests.summary.totalTests}`);
  if (tests.coverageDataPath) {
    lines.push(`- **Coverage Data:** ${tests.coverageDataPath}`);
  }
  lines.push('');

  if (tests.testFiles.length > 0) {
    lines.push('### Test Files');
    lines.push('');
    lines.push('| Path | Framework | Tests |');
    lines.push('|------|-----------|-------|');
    for (const tf of tests.testFiles) {
      lines.push(`| ${truncate(tf.path, 50)} | ${tf.framework} | ${tf.testCount} |`);
    }
    lines.push('');
  }

  // ── Section 9: Documentation
  lines.push('## Documentation');
  lines.push('');
  const docs = result.docs;
  lines.push(`- **READMEs Found:** ${docs.readmes.length > 0 ? docs.readmes.join(', ') : 'None'}`);
  lines.push(`- **Docs Folder:** ${docs.docsFolder ?? 'None'}`);
  lines.push(`- **Documentation Files:** ${docs.summary.docFileCount}`);
  lines.push(`- **Inline Doc Coverage:** ${docs.summary.inlineDocPercentage.toFixed(1)}%`);
  lines.push('');

  if (docs.docFiles.length > 0) {
    lines.push('### Documentation Files');
    lines.push('');
    for (const df of docs.docFiles) {
      lines.push(`- ${df}`);
    }
    lines.push('');
  }

  // ── Footer
  lines.push('---');
  lines.push('');
  lines.push(
    `*Generated by [handover](https://github.com/nicholasgriffintn/handover) at ${result.metadata.analyzedAt}*`,
  );
  lines.push(`*Analysis completed in ${result.metadata.elapsed}ms*`);
  lines.push('');

  return lines.join('\n');
}

// ─── JSON Report ─────────────────────────────────────────────────────────────

/**
 * Format the full static analysis result as JSON.
 * The typed StaticAnalysisResult IS the JSON report.
 */
export function formatJsonReport(result: StaticAnalysisResult): string {
  return JSON.stringify(result, null, 2);
}

// ─── Terminal Summary ────────────────────────────────────────────────────────

/**
 * Compact 4-5 line summary for terminal output after analysis completes.
 */
export function formatTerminalSummary(result: StaticAnalysisResult): string {
  const ft = result.fileTree;
  const deps = result.dependencies;
  const todos = result.todos;
  const git = result.gitHistory;
  const meta = result.metadata;

  const totalDeps = deps.manifests.reduce((sum, m) => sum + m.dependencies.length, 0);
  const manifestCount = deps.manifests.length;

  const bugCount = todos.summary.byCategory['bugs'] ?? 0;
  const taskCount = todos.summary.byCategory['tasks'] ?? 0;
  const debtCount = todos.summary.byCategory['debt'] ?? 0;

  const lines: string[] = [
    `  Files: ${ft.totalFiles} files (${ft.totalDirs} dirs, ${ft.totalLines.toLocaleString()} lines)`,
    `  Dependencies: ${totalDeps} packages across ${manifestCount} manifest${manifestCount !== 1 ? 's' : ''}`,
    `  TODOs: ${todos.summary.total} items (${bugCount} bugs, ${taskCount} tasks, ${debtCount} debt)`,
    `  Git: ${git.branchPattern.strategy} strategy, ${git.branchPattern.branchCount} branches, ${git.contributors.length} contributors`,
    `  Duration: ${meta.elapsed}ms`,
  ];

  return lines.join('\n');
}
