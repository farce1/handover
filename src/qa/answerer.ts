import { resolveAuth } from '../auth/index.js';
import { createProvider } from '../providers/factory.js';
import { searchDocuments, type SearchDocumentMatch } from '../vector/query-engine.js';
import type { HandoverConfig } from '../config/schema.js';
import {
  qaAnswerSchema,
  qaClarificationSchema,
  qaSynthesisSchema,
  type QaAnswer,
  type QaCitation,
  type QaClarification,
} from './schema.js';
import { assessEvidence, needsClarification } from './evidence.js';

const DEFAULT_QA_TOP_K = 8;

export interface AnswerQuestionInput {
  config: HandoverConfig;
  query: string;
  topK?: number;
  types?: string[];
}

export type AnswerQuestionResult =
  | {
      mode: 'qa';
      kind: 'answer';
      query: string;
      answer: QaAnswer;
    }
  | {
      mode: 'qa';
      kind: 'clarification';
      query: string;
      clarification: QaClarification;
      citations: QaCitation[];
    };

export function formatCitationFootnotes(citations: QaCitation[]): string[] {
  return citations.map((citation, index) => {
    return `[${index + 1}] ${citation.sourceFile} :: ${citation.sectionPath} (chunk ${citation.chunkIndex})`;
  });
}

export function buildQaPromptContext(matches: SearchDocumentMatch[]): string {
  const lines: string[] = [];

  for (const [index, match] of matches.entries()) {
    lines.push(
      `[${index + 1}]`,
      `source_file: ${match.sourceFile}`,
      `section_path: ${match.sectionPath}`,
      `chunk_index: ${match.chunkIndex}`,
      `relevance: ${match.relevance.toFixed(2)}%`,
      'content:',
      match.content.trim(),
      '',
    );
  }

  return lines.join('\n').trim();
}

function buildCitations(matches: SearchDocumentMatch[]): QaCitation[] {
  const unique = new Map<string, QaCitation>();

  for (const match of matches) {
    const key = `${match.sourceFile}::${match.sectionPath}::${match.chunkIndex}`;
    if (unique.has(key)) {
      continue;
    }

    unique.set(key, {
      sourceFile: match.sourceFile,
      sectionPath: match.sectionPath,
      chunkIndex: match.chunkIndex,
    });
  }

  return [...unique.values()].sort((left, right) => {
    const sourceCompare = left.sourceFile.localeCompare(right.sourceFile);
    if (sourceCompare !== 0) {
      return sourceCompare;
    }

    const sectionCompare = left.sectionPath.localeCompare(right.sectionPath);
    if (sectionCompare !== 0) {
      return sectionCompare;
    }

    return left.chunkIndex - right.chunkIndex;
  });
}

function buildClarificationQuestion(query: string, reasons: string[]): string {
  const prompt =
    reasons.length > 0
      ? `${reasons.join(' ')} Please narrow your request to a specific subsystem, command, or file path.`
      : 'Please narrow your request to a specific subsystem, command, or file path.';

  return `I need clarification before answering "${query}". ${prompt}`;
}

export async function answerQuestion(input: AnswerQuestionInput): Promise<AnswerQuestionResult> {
  const searchResult = await searchDocuments({
    config: input.config,
    query: input.query,
    topK: input.topK ?? DEFAULT_QA_TOP_K,
    types: input.types,
  });

  const citations = buildCitations(searchResult.matches);
  const evidence = assessEvidence(searchResult.matches);

  if (needsClarification(evidence)) {
    const clarification = qaClarificationSchema.parse({
      question: buildClarificationQuestion(searchResult.query, evidence.reasons),
      reason: evidence.reasons.join(' '),
    });

    return {
      mode: 'qa',
      kind: 'clarification',
      query: searchResult.query,
      clarification,
      citations,
    };
  }

  const authResult = await resolveAuth(input.config);
  const provider = createProvider(input.config, authResult);
  const context = buildQaPromptContext(searchResult.matches);
  const synthesis = await provider.complete(
    {
      systemPrompt:
        'You answer questions about a codebase using only provided documentation evidence. Do not invent missing details. Write a deep answer in plain text.',
      userPrompt: [
        `Question: ${searchResult.query}`,
        '',
        'Use only the following retrieved evidence:',
        context,
      ].join('\n'),
      temperature: 0.2,
      maxTokens: 1_200,
    },
    qaSynthesisSchema,
  );

  const answer = qaAnswerSchema.parse({
    answer: synthesis.data.answer,
    citations,
  });

  return {
    mode: 'qa',
    kind: 'answer',
    query: searchResult.query,
    answer,
  };
}
