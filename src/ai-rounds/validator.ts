import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { ValidationResult } from './types.js';
import { moduleDependencyGraph, knownFilePaths } from '../analyzers/module-graph.js';

// ─── File path claim validation ─────────────────────────────────────────────

/**
 * Validate file path claims against known files from static analysis.
 * Drops claims that reference non-existent files (trust code over model).
 */
export function validateFileClaims(
  claimedPaths: string[],
  analysis: StaticAnalysisResult,
): { valid: string[]; dropped: string[] } {
  const knownPaths = knownFilePaths(analysis);

  const valid: string[] = [];
  const dropped: string[] = [];

  for (const path of claimedPaths) {
    if (knownPaths.has(path)) {
      valid.push(path);
    } else {
      dropped.push(path);
    }
  }

  return { valid, dropped };
}

// ─── Import claim validation ────────────────────────────────────────────────

/**
 * Validate import claims against AST-derived import data.
 * Checks that the 'from' file exists AND imports from the 'to' source.
 */
export function validateImportClaims(
  claims: Array<{ from: string; to: string }>,
  analysis: StaticAnalysisResult,
): { valid: Array<{ from: string; to: string }>; dropped: Array<{ from: string; to: string }> } {
  // Build actual import map from AST data
  const actualImports = new Map<string, Set<string>>();
  for (const file of analysis.ast.files) {
    const sources = new Set(file.imports.map((i) => i.source));
    actualImports.set(file.path, sources);
  }

  const valid: Array<{ from: string; to: string }> = [];
  const dropped: Array<{ from: string; to: string }> = [];

  for (const claim of claims) {
    const fileImports = actualImports.get(claim.from);
    if (fileImports && fileImports.has(claim.to)) {
      valid.push(claim);
    } else {
      dropped.push(claim);
    }
  }

  return { valid, dropped };
}

// ─── File path extraction from round output ─────────────────────────────────

/**
 * Extract file-path-like strings from a round output object.
 * Matches strings containing path separators with common source extensions.
 */
function extractFilePathClaims(output: Record<string, unknown>): string[] {
  const paths = new Set<string>();
  const pathPattern =
    /(?:^|[\s"',\[\(])([a-zA-Z0-9_./-]+\.(?:ts|js|tsx|jsx|py|rs|go|json|yml|yaml|toml|md|css|html|sh|Dockerfile))\b/g;

  const text = JSON.stringify(output);
  let match: RegExpExecArray | null;
  while ((match = pathPattern.exec(text)) !== null) {
    const candidate = match[1];
    // Filter out obvious non-paths (single segment without /)
    if (candidate.includes('/') || candidate.startsWith('src/')) {
      paths.add(candidate);
    }
  }

  return [...paths];
}

/**
 * Extract import relationship claims from round output.
 * Applies to Round 2 (relationships) and Round 3 (crossModuleFlows).
 */
function extractImportClaims(
  roundNumber: number,
  output: Record<string, unknown>,
): Array<{ from: string; to: string }> {
  const claims: Array<{ from: string; to: string }> = [];

  if (roundNumber === 2) {
    // Round 2: relationships array with { from, to, type, evidence }
    const relationships = output['relationships'] as
      | Array<{ from: string; to: string }>
      | undefined;
    if (Array.isArray(relationships)) {
      for (const rel of relationships) {
        if (
          typeof rel.from === 'string' &&
          typeof rel.to === 'string' &&
          rel.from.includes('/') &&
          rel.to.includes('/')
        ) {
          claims.push({ from: rel.from, to: rel.to });
        }
      }
    }
  }

  if (roundNumber === 3) {
    // Round 3: crossModuleFlows with path arrays
    const flows = output['crossModuleFlows'] as Array<{ path: string[] }> | undefined;
    if (Array.isArray(flows)) {
      for (const flow of flows) {
        if (Array.isArray(flow.path)) {
          for (let i = 0; i < flow.path.length - 1; i++) {
            const from = flow.path[i];
            const to = flow.path[i + 1];
            if (from.includes('/') && to.includes('/')) {
              claims.push({ from, to });
            }
          }
        }
      }
    }
  }

  return claims;
}

// ─── Module relationship validation ──────────────────────────────────────────

/**
 * Validate Round 2 module relationships against the real module-level import
 * graph: kept when a real import connects the two modules in either direction,
 * dropped when none does, skipped when an endpoint is not a known module.
 */
export function validateModuleRelationships(
  modules: Array<{ name: string; files: string[] }>,
  relationships: Array<{ from: string; to: string }>,
  analysis: StaticAnalysisResult,
): { valid: Array<{ from: string; to: string }>; dropped: Array<{ from: string; to: string }> } {
  const moduleDeps = moduleDependencyGraph(analysis, modules);
  const moduleNames = new Set(modules.map((m) => m.name));

  const valid: Array<{ from: string; to: string }> = [];
  const dropped: Array<{ from: string; to: string }> = [];

  for (const rel of relationships) {
    if (!moduleNames.has(rel.from) || !moduleNames.has(rel.to)) continue;
    const connected =
      Boolean(moduleDeps.get(rel.from)?.has(rel.to)) ||
      Boolean(moduleDeps.get(rel.to)?.has(rel.from));
    if (connected) {
      valid.push(rel);
    } else {
      dropped.push(rel);
    }
  }

  return { valid, dropped };
}

/** Validate Round 2 module relationships, or return empty for other rounds / malformed output. */
function validateRound2Relationships(
  roundNumber: number,
  output: Record<string, unknown>,
  analysis: StaticAnalysisResult,
): { valid: Array<{ from: string; to: string }>; dropped: Array<{ from: string; to: string }> } {
  const modules = output['modules'];
  const relationships = output['relationships'];
  if (roundNumber !== 2 || !Array.isArray(modules) || !Array.isArray(relationships)) {
    return { valid: [], dropped: [] };
  }
  return validateModuleRelationships(
    modules as Array<{ name: string; files: string[] }>,
    relationships as Array<{ from: string; to: string }>,
    analysis,
  );
}

// ─── Combined round claim validation ────────────────────────────────────────

/**
 * Validate critical claims in a round's output against static analysis facts.
 * Scope: file references and import/dependency claims only (locked decision).
 * High-level observations are not validated.
 */
export function validateRoundClaims(
  roundNumber: number,
  output: Record<string, unknown>,
  analysis: StaticAnalysisResult,
): ValidationResult {
  // Extract and validate file path claims
  const filePathClaims = extractFilePathClaims(output);
  const fileResult = validateFileClaims(filePathClaims, analysis);

  // Extract and validate import claims (Rounds 2 and 3)
  const importClaims = extractImportClaims(roundNumber, output);
  const importResult = validateImportClaims(importClaims, analysis);

  // Round 2: validate module-name relationships against the real module graph.
  const moduleRel = validateRound2Relationships(roundNumber, output, analysis);

  const total =
    filePathClaims.length + importClaims.length + moduleRel.valid.length + moduleRel.dropped.length;
  const corrected =
    fileResult.dropped.length + importResult.dropped.length + moduleRel.dropped.length;
  const validated = total - corrected;

  return {
    validated,
    corrected,
    total,
    dropRate: total > 0 ? corrected / total : 0,
  };
}
