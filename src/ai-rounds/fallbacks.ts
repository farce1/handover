import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { Round1Output, Round2Output } from './schemas.js';
import type { Round3Output, Round4Output, Round5Output, Round6Output } from './schemas.js';

// ─── Round 1 Fallback: Project Overview ────────────────────────────────────

/**
 * Build a Round 1 fallback from raw static analysis data.
 * Produces typed output so downstream consumers don't crash.
 */
export function buildRound1Fallback(analysis: StaticAnalysisResult): Round1Output {
  // Primary language: most common from AST language breakdown
  const langBreakdown = analysis.ast.summary.languageBreakdown;
  const primaryLanguage =
    Object.entries(langBreakdown).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'unknown';

  // Project name from root directory basename
  const rootDir = analysis.metadata.rootDir;
  const projectName = rootDir.split('/').filter(Boolean).pop() ?? 'unknown';

  // Extension breakdown for technical landscape
  const extBreakdown = Object.entries(analysis.fileTree.filesByExtension)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([ext, count]) => `${ext}: ${count} files`)
    .join(', ');

  const technicalLandscape = [
    `Total files: ${analysis.fileTree.totalFiles}`,
    `Total lines: ${analysis.fileTree.totalLines}`,
    `Extensions: ${extBreakdown}`,
  ].join('. ');

  // Key dependencies from manifests
  const keyDependencies = analysis.dependencies.manifests
    .flatMap((m) =>
      m.dependencies
        .filter((d) => d.type === 'production')
        .map((d) => ({ name: d.name, role: d.type })),
    )
    .slice(0, 20);

  // Project scale by file count thresholds
  const fileCount = analysis.fileTree.totalFiles;
  const estimatedComplexity: 'small' | 'medium' | 'large' =
    fileCount < 50 ? 'small' : fileCount < 200 ? 'medium' : 'large';

  // Tech debt from TODO/FIXME items
  const techDebt = analysis.todos.items
    .slice(0, 20)
    .map((item) => `[${item.marker}] ${item.text} (${item.file}:${item.line})`);

  return {
    projectName,
    primaryLanguage,
    purpose: '(AI analysis unavailable -- showing static data)',
    technicalLandscape,
    keyDependencies,
    entryPoints: [],
    projectScale: {
      fileCount,
      estimatedComplexity,
      mainConcerns: [],
    },
    techDebt,
    findings: ['AI analysis unavailable; showing raw static analysis data'],
    openQuestions: [],
  };
}

// ─── Round 2 Fallback: Module Detection ────────────────────────────────────

/**
 * Build a Round 2 fallback from directory structure.
 * Top-level directories approximate module boundaries.
 */
export function buildRound2Fallback(analysis: StaticAnalysisResult): Round2Output {
  // Top-level directories as module approximations
  const topLevelDirs = analysis.fileTree.directoryTree.filter(
    (entry) =>
      entry.type === 'directory' && !entry.path.includes('/') && !entry.path.startsWith('.'),
  );

  const modules = topLevelDirs.map((dir) => {
    // Find files that belong to this directory
    const files = analysis.fileTree.directoryTree
      .filter((entry) => entry.type === 'file' && entry.path.startsWith(dir.path + '/'))
      .map((entry) => entry.path);

    return {
      name: dir.path,
      path: dir.path,
      purpose: '(AI analysis unavailable)',
      publicApi: [],
      files,
    };
  });

  return {
    modules,
    relationships: [],
    boundaryIssues: [
      'Module boundaries approximated from directory structure -- AI analysis unavailable',
    ],
    findings: [
      'Module detection based on directory structure only; no semantic analysis performed',
    ],
    openQuestions: [],
  };
}

// ─── Round 3 Fallback: Feature Extraction ──────────────────────────────────

/**
 * Build a Round 3 fallback with empty feature data.
 * Features require AI inference and cannot be reliably extracted from static data alone.
 */
export function buildRound3Fallback(_analysis: StaticAnalysisResult): Round3Output {
  return {
    features: [],
    crossModuleFlows: [],
    findings: ['Feature extraction unavailable -- AI analysis required for feature identification'],
  };
}

// ─── Round 4 Fallback: Architecture Detection ──────────────────────────────

/**
 * Build a Round 4 fallback with empty architecture data.
 * Architecture patterns require AI inference beyond what static data provides.
 */
export function buildRound4Fallback(_analysis: StaticAnalysisResult): Round4Output {
  return {
    patterns: [],
    dataFlow: [],
    findings: [
      'Architecture detection unavailable -- AI analysis required for pattern identification',
    ],
  };
}

// ─── Round 5 Fallback: Edge Cases & Conventions ────────────────────────────

/**
 * Build a Round 5 fallback with TODO/FIXME items as edge case approximations.
 */
export function buildRound5Fallback(analysis: StaticAnalysisResult): Round5Output {
  // Group todo items by their file's top-level directory as a rough module proxy
  const todosByDir = new Map<string, typeof analysis.todos.items>();
  for (const item of analysis.todos.items) {
    const topDir = item.file.split('/')[0] ?? 'root';
    const existing = todosByDir.get(topDir) ?? [];
    existing.push(item);
    todosByDir.set(topDir, existing);
  }

  const modules = [...todosByDir.entries()].slice(0, 10).map(([dir, items]) => ({
    moduleName: dir,
    edgeCases: items.slice(0, 5).map((item) => ({
      description: item.text,
      file: item.file,
      line: item.line,
      severity: 'info' as const,
      evidence: `${item.marker}: ${item.text}`,
    })),
    conventions: [],
    errorHandling: {
      strategy: '(AI analysis unavailable)',
      gaps: [],
      patterns: [],
    },
    findings: ['Edge case detection based on TODO/FIXME markers only'],
  }));

  return {
    modules,
    crossCuttingConventions: [],
    findings: ['Edge case and convention analysis unavailable -- showing TODO/FIXME markers only'],
  };
}

// ─── Round 6 Fallback: Deployment Inference ────────────────────────────────

/**
 * Build a Round 6 fallback from env vars, build scripts, and CI file detection.
 */
export function buildRound6Fallback(analysis: StaticAnalysisResult): Round6Output {
  // Env vars from static analysis
  const envVars = analysis.env.envFiles.flatMap((envFile) =>
    envFile.variables.map((name) => ({
      name,
      purpose: '(AI analysis unavailable)',
      required: true,
      source: envFile.path,
    })),
  );

  // Build scripts from dependency manifests (look for npm scripts in package.json)
  const scripts: Record<string, string> = {};
  const commands: string[] = [];
  for (const manifest of analysis.dependencies.manifests) {
    if (
      manifest.packageManager === 'npm' ||
      manifest.packageManager === 'yarn' ||
      manifest.packageManager === 'pnpm'
    ) {
      // We don't have the raw package.json scripts in the manifest type,
      // but we can indicate build-related dependencies
      commands.push(`See ${manifest.file} for build configuration`);
    }
  }

  // CI evidence from file tree
  const ciPatterns = [
    '.github/workflows',
    'Dockerfile',
    'docker-compose',
    '.gitlab-ci.yml',
    'Jenkinsfile',
    '.circleci',
  ];

  const evidence: string[] = [];
  let ciProvider: string | undefined;
  let containerized = false;

  for (const entry of analysis.fileTree.directoryTree) {
    for (const pattern of ciPatterns) {
      if (entry.path.includes(pattern)) {
        evidence.push(`Found: ${entry.path}`);
        if (pattern === '.github/workflows') ciProvider = 'GitHub Actions';
        if (pattern === '.gitlab-ci.yml') ciProvider = 'GitLab CI';
        if (pattern === 'Jenkinsfile') ciProvider = 'Jenkins';
        if (pattern === '.circleci') ciProvider = 'CircleCI';
        if (pattern === 'Dockerfile' || pattern === 'docker-compose') {
          containerized = true;
        }
      }
    }
  }

  return {
    deployment: {
      containerized,
      ciProvider,
      evidence: evidence.length > 0 ? evidence : ['No CI/CD configuration files detected'],
    },
    envVars,
    buildProcess: {
      commands,
      artifacts: [],
      scripts,
    },
    infrastructure: [],
    findings: ['Deployment inference based on file detection only -- AI analysis unavailable'],
  };
}
