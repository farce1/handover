import type { DocumentSpec, RenderContext } from './types.js';
import { HandoverError } from '../utils/errors.js';

// ─── Placeholder render ─────────────────────────────────────────────────────

/** Placeholder renderer replaced by individual document renderers in plans 02/03. */
const placeholderRender = (_ctx: RenderContext): string => '';

// ─── Document Registry ──────────────────────────────────────────────────────

/**
 * Central registry of all 14 handover documents.
 * Each entry maps the document to its aliases (for --only), required AI rounds,
 * and render function. Render functions are placeholders until plans 02/03.
 */
export const DOCUMENT_REGISTRY: DocumentSpec[] = [
  {
    id: '00-index',
    filename: '00-INDEX.md',
    title: '00 - Index',
    category: 'index',
    aliases: ['index', 'idx'],
    requiredRounds: [],
    render: placeholderRender,
  },
  {
    id: '01-project-overview',
    filename: '01-PROJECT-OVERVIEW.md',
    title: '01 - Project Overview',
    category: 'overview',
    aliases: ['overview'],
    requiredRounds: [1],
    render: placeholderRender,
  },
  {
    id: '02-getting-started',
    filename: '02-GETTING-STARTED.md',
    title: '02 - Getting Started',
    category: 'guide',
    aliases: ['getting-started', 'start'],
    requiredRounds: [1, 6],
    render: placeholderRender,
  },
  {
    id: '03-architecture',
    filename: '03-ARCHITECTURE.md',
    title: '03 - Architecture',
    category: 'architecture',
    aliases: ['arch', 'architecture'],
    requiredRounds: [1, 2, 3, 4],
    render: placeholderRender,
  },
  {
    id: '04-file-structure',
    filename: '04-FILE-STRUCTURE.md',
    title: '04 - File Structure',
    category: 'structure',
    aliases: ['files', 'file-structure'],
    requiredRounds: [1, 2],
    render: placeholderRender,
  },
  {
    id: '05-features',
    filename: '05-FEATURES.md',
    title: '05 - Features',
    category: 'features',
    aliases: ['features'],
    requiredRounds: [1, 2, 3],
    render: placeholderRender,
  },
  {
    id: '06-modules',
    filename: '06-MODULES.md',
    title: '06 - Modules',
    category: 'modules',
    aliases: ['modules', 'mods'],
    requiredRounds: [1, 2],
    render: placeholderRender,
  },
  {
    id: '07-dependencies',
    filename: '07-DEPENDENCIES.md',
    title: '07 - Dependencies',
    category: 'dependencies',
    aliases: ['deps', 'dependencies'],
    requiredRounds: [1],
    render: placeholderRender,
  },
  {
    id: '08-environment',
    filename: '08-ENVIRONMENT.md',
    title: '08 - Environment',
    category: 'environment',
    aliases: ['env', 'environment'],
    requiredRounds: [1, 2, 6],
    render: placeholderRender,
  },
  {
    id: '09-edge-cases',
    filename: '09-EDGE-CASES-AND-GOTCHAS.md',
    title: '09 - Edge Cases and Gotchas',
    category: 'edge-cases',
    aliases: ['edge-cases', 'gotchas'],
    requiredRounds: [1, 2, 5],
    render: placeholderRender,
  },
  {
    id: '10-tech-debt',
    filename: '10-TECH-DEBT-AND-TODOS.md',
    title: '10 - Tech Debt and TODOs',
    category: 'tech-debt',
    aliases: ['tech-debt', 'todos'],
    requiredRounds: [1, 2, 5],
    render: placeholderRender,
  },
  {
    id: '11-conventions',
    filename: '11-CONVENTIONS.md',
    title: '11 - Conventions',
    category: 'conventions',
    aliases: ['conventions'],
    requiredRounds: [1, 2, 5],
    render: placeholderRender,
  },
  {
    id: '12-testing',
    filename: '12-TESTING-STRATEGY.md',
    title: '12 - Testing Strategy',
    category: 'testing',
    aliases: ['testing', 'tests'],
    requiredRounds: [1, 2, 5],
    render: placeholderRender,
  },
  {
    id: '13-deployment',
    filename: '13-DEPLOYMENT.md',
    title: '13 - Deployment',
    category: 'deployment',
    aliases: ['deploy', 'deployment'],
    requiredRounds: [1, 2, 6],
    render: placeholderRender,
  },
];

// ─── Group Aliases ──────────────────────────────────────────────────────────

/**
 * Group aliases expand to sets of document aliases for --only convenience.
 */
export const GROUP_ALIASES: Record<string, string[]> = {
  core: ['arch', 'modules', 'features'],
  ops: ['env', 'deploy', 'deps'],
  onboard: ['overview', 'getting-started', 'arch', 'files'],
  quality: ['edge-cases', 'tech-debt', 'testing', 'conventions'],
  all: [
    'index', 'overview', 'getting-started', 'arch', 'files',
    'features', 'modules', 'deps', 'env', 'edge-cases',
    'tech-debt', 'conventions', 'testing', 'deploy',
  ],
};

// ─── Round Dependency Map ───────────────────────────────────────────────────

/**
 * Transitive dependencies for each AI round.
 * Used by computeRequiredRounds to expand the needed round set.
 */
export const ROUND_DEPS: Record<number, number[]> = {
  1: [],
  2: [1],
  3: [1, 2],
  4: [1, 2, 3],
  5: [1, 2],
  6: [1, 2],
};

// ─── resolveSelectedDocs ────────────────────────────────────────────────────

/**
 * Resolve the --only flag to a list of DocumentSpec entries.
 *
 * - If onlyFlag is undefined, returns all documents (default = generate all).
 * - Splits onlyFlag by comma, trims whitespace.
 * - Checks GROUP_ALIASES first, then individual document aliases.
 * - Always includes INDEX (00-INDEX) in the result.
 * - Throws HandoverError if an alias doesn't match any document or group.
 */
export function resolveSelectedDocs(
  onlyFlag: string | undefined,
  registry: DocumentSpec[],
): DocumentSpec[] {
  if (onlyFlag === undefined) {
    return registry;
  }

  const tokens = onlyFlag.split(',').map((t) => t.trim()).filter(Boolean);
  const selectedIds = new Set<string>();

  for (const token of tokens) {
    // Check group aliases first
    if (GROUP_ALIASES[token]) {
      const groupAliases = GROUP_ALIASES[token];
      for (const alias of groupAliases) {
        const doc = registry.find((d) => d.aliases.includes(alias));
        if (doc) {
          selectedIds.add(doc.id);
        }
      }
      continue;
    }

    // Check individual document aliases
    const doc = registry.find((d) => d.aliases.includes(token));
    if (doc) {
      selectedIds.add(doc.id);
      continue;
    }

    throw new HandoverError(
      `Unknown document alias: "${token}"`,
      `"${token}" does not match any document or group alias`,
      `Valid aliases: ${registry.flatMap((d) => d.aliases).join(', ')}. Groups: ${Object.keys(GROUP_ALIASES).join(', ')}`,
      'REGISTRY_UNKNOWN_ALIAS',
    );
  }

  // Always include INDEX
  const indexDoc = registry.find((d) => d.id === '00-index');
  if (indexDoc) {
    selectedIds.add(indexDoc.id);
  }

  return registry.filter((d) => selectedIds.has(d.id));
}

// ─── computeRequiredRounds ──────────────────────────────────────────────────

/**
 * Compute the minimal set of AI rounds needed for the selected documents.
 * Expands transitive dependencies using ROUND_DEPS.
 */
export function computeRequiredRounds(selectedDocs: DocumentSpec[]): Set<number> {
  const needed = new Set<number>();

  for (const doc of selectedDocs) {
    for (const round of doc.requiredRounds) {
      needed.add(round);
    }
  }

  // Expand transitive dependencies
  const expanded = new Set<number>(needed);
  for (const round of needed) {
    for (const dep of ROUND_DEPS[round] ?? []) {
      expanded.add(dep);
    }
  }

  return expanded;
}
