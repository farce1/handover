import type { SearchDocumentMatch } from '../vector/query-engine.js';

const MIN_TOP_RELEVANCE = 58;
const MIN_SECOND_RELEVANCE = 45;
const MIN_SOURCE_COUNT = 2;
const CONFLICT_GAP_THRESHOLD = 18;

export interface EvidenceAssessment {
  topRelevance: number;
  secondRelevance: number;
  uniqueSources: number;
  hasConflictingSignals: boolean;
  isWeak: boolean;
  reasons: string[];
}

export function assessEvidence(matches: SearchDocumentMatch[]): EvidenceAssessment {
  if (matches.length === 0) {
    return {
      topRelevance: 0,
      secondRelevance: 0,
      uniqueSources: 0,
      hasConflictingSignals: false,
      isWeak: true,
      reasons: ['No matching documentation chunks were found.'],
    };
  }

  const sorted = [...matches].sort((a, b) => b.relevance - a.relevance);
  const topRelevance = sorted[0]?.relevance ?? 0;
  const secondRelevance = sorted[1]?.relevance ?? 0;
  const uniqueSources = new Set(sorted.map((match) => match.sourceFile)).size;
  const gap = Math.max(0, topRelevance - secondRelevance);
  const hasConflictingSignals = gap >= CONFLICT_GAP_THRESHOLD && secondRelevance > 0;

  const reasons: string[] = [];
  if (topRelevance < MIN_TOP_RELEVANCE) {
    reasons.push(
      `Top result relevance is ${topRelevance.toFixed(2)}%, below ${MIN_TOP_RELEVANCE.toFixed(2)}%.`,
    );
  }
  if (secondRelevance < MIN_SECOND_RELEVANCE) {
    reasons.push(
      `Second result relevance is ${secondRelevance.toFixed(2)}%, below ${MIN_SECOND_RELEVANCE.toFixed(2)}%.`,
    );
  }
  if (uniqueSources < MIN_SOURCE_COUNT) {
    reasons.push('Evidence comes from a single source file, reducing cross-document confidence.');
  }
  if (hasConflictingSignals) {
    reasons.push(
      `Evidence is inconsistent (top-two relevance gap ${gap.toFixed(2)}% suggests conflicting support).`,
    );
  }

  return {
    topRelevance,
    secondRelevance,
    uniqueSources,
    hasConflictingSignals,
    isWeak: reasons.length > 0,
    reasons,
  };
}

export function needsClarification(assessment: EvidenceAssessment): boolean {
  return assessment.isWeak || assessment.hasConflictingSignals;
}
