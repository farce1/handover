import {
  regenerationErrorResponseSchema,
  type RegenerationErrorResponse,
  type RegenerationTargetRef,
} from './schema.js';

interface SupportedRegenerationTarget {
  key: string;
  label: string;
  aliases: string[];
}

const SUPPORTED_TARGETS: SupportedRegenerationTarget[] = [
  {
    key: 'full-project',
    label: 'Full project documentation and index',
    aliases: ['all', 'full', 'project', 'default'],
  },
  {
    key: 'docs',
    label: 'Generated markdown documentation only',
    aliases: ['documentation', 'markdown-docs'],
  },
  {
    key: 'search-index',
    label: 'Semantic search index only',
    aliases: ['index', 'vector-index', 'embeddings'],
  },
];

export class RegenerationTargetError extends Error {
  readonly response: RegenerationErrorResponse;

  constructor(requestedTarget: string) {
    const validTargets = listSupportedRegenerationTargets().map((target) => target.key);
    const response = regenerationErrorResponseSchema.parse({
      ok: false,
      error: {
        code: 'REGENERATION_TARGET_UNKNOWN',
        reason: `Unknown regeneration target: ${requestedTarget}`,
        remediation: `Use one of: ${validTargets.join(', ')}.`,
      },
      validTargets,
      guidance: {
        nextTool: 'regenerate_docs',
        message: 'Retry regenerate_docs with a valid target from validTargets.',
      },
    });

    super(response.error.reason);
    this.name = 'RegenerationTargetError';
    this.response = response;
  }
}

function canonicalizeTarget(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

function resolveSupportedTarget(normalized: string): SupportedRegenerationTarget | undefined {
  return SUPPORTED_TARGETS.find(
    (target) => target.key === normalized || target.aliases.includes(normalized),
  );
}

export function listSupportedRegenerationTargets(): Array<{
  key: string;
  label: string;
  aliases: string[];
}> {
  return SUPPORTED_TARGETS.map((target) => ({
    key: target.key,
    label: target.label,
    aliases: [...target.aliases],
  }));
}

export function normalizeRegenerationTarget(target?: string): RegenerationTargetRef {
  if (!target || target.trim().length === 0) {
    return {
      key: 'full-project',
      requested: 'full-project',
      canonical: 'full-project',
    };
  }

  const normalized = canonicalizeTarget(target);
  const resolved = resolveSupportedTarget(normalized);
  if (!resolved) {
    throw new RegenerationTargetError(target.trim());
  }

  return {
    key: resolved.key,
    requested: target.trim(),
    canonical: resolved.key,
  };
}

export type { SupportedRegenerationTarget };
