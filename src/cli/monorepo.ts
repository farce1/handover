import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── MonorepoDetection ──────────────────────────────────────────────────────

export interface MonorepoDetection {
  isMonorepo: boolean;
  tool: string | null; // 'npm' | 'pnpm' | 'lerna' | 'cargo' | 'go' | null
  workspaceRoot: string | null;
}

/**
 * Detect whether a directory is a monorepo root by scanning for workspace
 * configuration files. Checks npm/yarn, pnpm, Lerna, Cargo, and Go workspaces.
 *
 * All file reads are wrapped in try-catch -- parse errors are treated as
 * not-monorepo to avoid false positives on malformed config files.
 */
export function detectMonorepo(rootDir: string): MonorepoDetection {
  // 1. npm/yarn workspaces: package.json with "workspaces" field
  try {
    const pkgPath = join(rootDir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.workspaces) {
        return { isMonorepo: true, tool: 'npm', workspaceRoot: rootDir };
      }
    }
  } catch {
    // Parse error -- treat as not-monorepo
  }

  // 2. pnpm workspaces: pnpm-workspace.yaml
  if (existsSync(join(rootDir, 'pnpm-workspace.yaml'))) {
    return { isMonorepo: true, tool: 'pnpm', workspaceRoot: rootDir };
  }

  // 3. Lerna: lerna.json
  if (existsSync(join(rootDir, 'lerna.json'))) {
    return { isMonorepo: true, tool: 'lerna', workspaceRoot: rootDir };
  }

  // 4. Cargo workspace: Cargo.toml with [workspace] section
  try {
    const cargoPath = join(rootDir, 'Cargo.toml');
    if (existsSync(cargoPath)) {
      const content = readFileSync(cargoPath, 'utf-8');
      if (content.includes('[workspace]')) {
        return { isMonorepo: true, tool: 'cargo', workspaceRoot: rootDir };
      }
    }
  } catch {
    // Read error -- treat as not-monorepo
  }

  // 5. Go workspace: go.work
  if (existsSync(join(rootDir, 'go.work'))) {
    return { isMonorepo: true, tool: 'go', workspaceRoot: rootDir };
  }

  return { isMonorepo: false, tool: null, workspaceRoot: null };
}
