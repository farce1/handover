import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parse as parseTOML } from 'smol-toml';
import type { AnalysisContext, AnalyzerResult, DependencyInfo, DependencyResult } from './types.js';

/**
 * STAT-02: DependencyGraph Analyzer
 *
 * Parses package manifests (package.json, Cargo.toml, go.mod,
 * requirements.txt, pyproject.toml) and extracts dependency information
 * with dev vs production separation.
 */

const MANIFEST_PATTERNS: Record<string, string> = {
  'package.json': 'npm',
  'Cargo.toml': 'cargo',
  'go.mod': 'go',
  'requirements.txt': 'pip',
  'pyproject.toml': 'pip',
};

// ─── Internal Parsers ─────────────────────────────────────────────────────

function parsePackageJson(content: string): DependencyInfo[] {
  const pkg = JSON.parse(content) as Record<string, unknown>;
  const deps: DependencyInfo[] = [];

  const extract = (section: unknown, type: DependencyInfo['type']) => {
    if (!section || typeof section !== 'object') return;
    for (const [name, version] of Object.entries(section as Record<string, unknown>)) {
      deps.push({ name, version: String(version), type });
    }
  };

  extract(pkg.dependencies, 'production');
  extract(pkg.devDependencies, 'development');
  extract(pkg.peerDependencies, 'peer');
  extract(pkg.optionalDependencies, 'optional');

  return deps;
}

function parseCargoToml(content: string): DependencyInfo[] {
  const cargo = parseTOML(content) as Record<string, unknown>;
  const deps: DependencyInfo[] = [];

  const extractDeps = (section: unknown, type: DependencyInfo['type']) => {
    if (!section || typeof section !== 'object') return;
    for (const [name, spec] of Object.entries(section as Record<string, unknown>)) {
      // Handle both string values ("1.0") and inline tables ({ version = "1.0" })
      const version =
        typeof spec === 'string'
          ? spec
          : spec !== null &&
              typeof spec === 'object' &&
              'version' in (spec as Record<string, unknown>)
            ? String((spec as Record<string, unknown>).version)
            : '*';
      deps.push({ name, version, type });
    }
  };

  extractDeps(cargo.dependencies, 'production');
  extractDeps((cargo as Record<string, unknown>)['dev-dependencies'], 'development');
  extractDeps((cargo as Record<string, unknown>)['build-dependencies'], 'development');

  return deps;
}

function parseGoMod(content: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];

  // Match require (...) blocks
  const requireBlockRegex = /require\s*\(([\s\S]*?)\)/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = requireBlockRegex.exec(content)) !== null) {
    const block = blockMatch[1];
    const depLineRegex = /^\s*(\S+)\s+(\S+)/gm;
    let lineMatch: RegExpExecArray | null;

    while ((lineMatch = depLineRegex.exec(block)) !== null) {
      if (!lineMatch[1].startsWith('//')) {
        deps.push({
          name: lineMatch[1],
          version: lineMatch[2],
          type: 'production',
        });
      }
    }
  }

  // Match single require lines (not inside blocks)
  const singleRequireRegex = /^require\s+(\S+)\s+(\S+)/gm;
  let singleMatch: RegExpExecArray | null;

  while ((singleMatch = singleRequireRegex.exec(content)) !== null) {
    deps.push({
      name: singleMatch[1],
      version: singleMatch[2],
      type: 'production',
    });
  }

  return deps;
}

function parseRequirementsTxt(content: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  const lines = content.split('\n');

  for (const raw of lines) {
    const line = raw.trim();
    if (
      !line ||
      line.startsWith('#') ||
      line.startsWith('-r') ||
      line.startsWith('-e') ||
      line.startsWith('-i') ||
      line.startsWith('--')
    ) {
      continue;
    }

    const match = line.match(/^([a-zA-Z0-9_.-]+)\s*([><=!~]+.*)?/);
    if (match) {
      deps.push({
        name: match[1],
        version: match[2]?.trim() ?? '*',
        type: 'production',
      });
    }
  }

  return deps;
}

function parsePyprojectToml(content: string): DependencyInfo[] {
  const pyproject = parseTOML(content) as Record<string, unknown>;
  const deps: DependencyInfo[] = [];

  const project = pyproject.project as Record<string, unknown> | undefined;

  // PEP 621: [project].dependencies
  if (project?.dependencies && Array.isArray(project.dependencies)) {
    for (const dep of project.dependencies) {
      const match = String(dep).match(/^([a-zA-Z0-9_.-]+)/);
      if (match) {
        deps.push({
          name: match[1],
          version: String(dep),
          type: 'production',
        });
      }
    }
  }

  // [project].optional-dependencies => development
  if (project?.['optional-dependencies'] && typeof project['optional-dependencies'] === 'object') {
    const optDeps = project['optional-dependencies'] as Record<string, unknown>;
    for (const group of Object.values(optDeps)) {
      if (Array.isArray(group)) {
        for (const dep of group) {
          const match = String(dep).match(/^([a-zA-Z0-9_.-]+)/);
          if (match) {
            deps.push({
              name: match[1],
              version: String(dep),
              type: 'development',
            });
          }
        }
      }
    }
  }

  return deps;
}

// ─── Main Analyzer ────────────────────────────────────────────────────────

export async function analyzeDependencies(
  ctx: AnalysisContext,
): Promise<AnalyzerResult<DependencyResult>> {
  const start = Date.now();

  try {
    const warnings: string[] = [];
    const manifests: DependencyResult['manifests'] = [];

    // Find manifest files (check basename against MANIFEST_PATTERNS keys)
    const manifestFiles = ctx.files.filter((f) => {
      const name = basename(f.path);
      return name in MANIFEST_PATTERNS;
    });

    for (const file of manifestFiles) {
      const name = basename(file.path);
      const packageManager = MANIFEST_PATTERNS[name];

      try {
        const content = await readFile(file.absolutePath, 'utf-8');

        let dependencies: DependencyInfo[];
        switch (name) {
          case 'package.json':
            dependencies = parsePackageJson(content);
            break;
          case 'Cargo.toml':
            dependencies = parseCargoToml(content);
            break;
          case 'go.mod':
            dependencies = parseGoMod(content);
            break;
          case 'requirements.txt':
            dependencies = parseRequirementsTxt(content);
            break;
          case 'pyproject.toml':
            dependencies = parsePyprojectToml(content);
            break;
          default:
            dependencies = [];
        }

        manifests.push({
          file: file.path,
          packageManager,
          dependencies,
        });
      } catch (err) {
        // Per user decision: "warn and skip, continue with what's parseable"
        warnings.push(
          `Failed to parse ${file.path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const elapsed = Date.now() - start;
    return {
      success: true,
      data: { manifests, warnings },
      elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      elapsed,
    };
  }
}
