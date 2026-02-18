import type { RoundContext } from './types.js';

/**
 * Deterministic inter-round context compressor.
 *
 * Extracts structured fields (modules, findings, relationships, open questions)
 * from a prior round's output without any LLM calls. This is a locked decision:
 * summarization is purely mechanical field extraction, not AI-driven.
 *
 * Token budget enforcement progressively truncates fields to fit within maxTokens.
 */
export function compressRoundOutput(
  roundNumber: number,
  output: Record<string, unknown>,
  maxTokens: number,
  estimateTokensFn: (text: string) => number,
): RoundContext {
  // 1. Extract modules
  const modules = extractModules(output);

  // 2. Extract findings
  const findings = extractFindings(output);

  // 3. Extract relationships
  const relationships = extractRelationships(output);

  // 4. Extract open questions
  const openQuestions = extractOpenQuestions(output);

  // 5. Build compact text and enforce token budget
  const truncated = enforceTokenBudget(
    roundNumber,
    modules,
    findings,
    relationships,
    openQuestions,
    maxTokens,
    estimateTokensFn,
  );

  // 6. Build final text and compute token count
  const text = buildCompactText(
    roundNumber,
    truncated.modules,
    truncated.findings,
    truncated.relationships,
    truncated.openQuestions,
  );
  const tokenCount = estimateTokensFn(text);

  return {
    roundNumber,
    modules: truncated.modules,
    findings: truncated.findings,
    relationships: truncated.relationships,
    openQuestions: truncated.openQuestions,
    tokenCount,
  };
}

// ─── Field Extractors ────────────────────────────────────────────────────────

function extractModules(output: Record<string, unknown>): string[] {
  const raw = output.modules;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: unknown) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'name' in item) {
        return String((item as { name: string }).name);
      }
      return null;
    })
    .filter((s): s is string => s !== null);
}

function extractFindings(output: Record<string, unknown>): string[] {
  const raw = output.findings ?? output.keyFindings ?? output.key_findings;
  if (!Array.isArray(raw)) return [];

  return raw.filter((s): s is string => typeof s === 'string');
}

function extractRelationships(output: Record<string, unknown>): string[] {
  const raw = output.relationships;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: unknown) => {
      if (item && typeof item === 'object' && 'from' in item && 'to' in item) {
        const rel = item as { from: string; to: string; type?: string };
        return rel.type ? `${rel.from} -> ${rel.to} (${rel.type})` : `${rel.from} -> ${rel.to}`;
      }
      return null;
    })
    .filter((s): s is string => s !== null);
}

function extractOpenQuestions(output: Record<string, unknown>): string[] {
  const raw = output.openQuestions ?? output.open_questions;
  if (!Array.isArray(raw)) return [];

  return raw.filter((s): s is string => typeof s === 'string');
}

// ─── Text Building ───────────────────────────────────────────────────────────

function buildCompactText(
  roundNumber: number,
  modules: string[],
  findings: string[],
  relationships: string[],
  openQuestions: string[],
): string {
  const lines: string[] = [`## Round ${roundNumber} Context`];

  if (modules.length > 0) {
    lines.push(`Modules: ${modules.join(', ')}`);
  }

  if (findings.length > 0) {
    lines.push('Findings:');
    for (const f of findings) {
      lines.push(`- ${f}`);
    }
  }

  if (relationships.length > 0) {
    lines.push(`Relationships: ${relationships.join('; ')}`);
  }

  if (openQuestions.length > 0) {
    lines.push(`Open questions: ${openQuestions.join('; ')}`);
  }

  return lines.join('\n');
}

// ─── Token Budget Enforcement ────────────────────────────────────────────────

interface TruncatedFields {
  modules: string[];
  findings: string[];
  relationships: string[];
  openQuestions: string[];
}

function enforceTokenBudget(
  roundNumber: number,
  modules: string[],
  findings: string[],
  relationships: string[],
  openQuestions: string[],
  maxTokens: number,
  estimateTokensFn: (text: string) => number,
): TruncatedFields {
  const currentModules = [...modules];
  const currentFindings = [...findings];
  const currentRelationships = [...relationships];
  const currentOpenQuestions = [...openQuestions];

  const fits = (): boolean => {
    const text = buildCompactText(
      roundNumber,
      currentModules,
      currentFindings,
      currentRelationships,
      currentOpenQuestions,
    );
    return estimateTokensFn(text) <= maxTokens;
  };

  if (fits()) {
    return {
      modules: currentModules,
      findings: currentFindings,
      relationships: currentRelationships,
      openQuestions: currentOpenQuestions,
    };
  }

  // Progressive truncation: open questions -> findings -> relationships -> modules
  // Always keep at least one finding if any existed originally

  // Trim open questions first
  while (currentOpenQuestions.length > 0 && !fits()) {
    currentOpenQuestions.pop();
  }
  if (fits()) {
    return {
      modules: currentModules,
      findings: currentFindings,
      relationships: currentRelationships,
      openQuestions: currentOpenQuestions,
    };
  }

  // Trim findings (keep at least one if any existed)
  const minFindings = findings.length > 0 ? 1 : 0;
  while (currentFindings.length > minFindings && !fits()) {
    currentFindings.pop();
  }
  if (fits()) {
    return {
      modules: currentModules,
      findings: currentFindings,
      relationships: currentRelationships,
      openQuestions: currentOpenQuestions,
    };
  }

  // Trim relationships
  while (currentRelationships.length > 0 && !fits()) {
    currentRelationships.pop();
  }
  if (fits()) {
    return {
      modules: currentModules,
      findings: currentFindings,
      relationships: currentRelationships,
      openQuestions: currentOpenQuestions,
    };
  }

  // Trim modules
  while (currentModules.length > 0 && !fits()) {
    currentModules.pop();
  }

  return {
    modules: currentModules,
    findings: currentFindings,
    relationships: currentRelationships,
    openQuestions: currentOpenQuestions,
  };
}
