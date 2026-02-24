import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  answerQuestionResultSchema,
  qaSessionStateSchema,
  qaStreamEventSchema,
} from '../qa/streaming-schema.js';
import { createQaStreamingSessionManager } from '../qa/streaming-session.js';
import {
  regenerationFailureSchema,
  regenerationJobStateSchema,
  regenerationTargetRefSchema,
  type RegenerationFailure,
} from '../regeneration/schema.js';
import {
  createRegenerationJobManager,
  type RegenerationJobManager,
} from '../regeneration/job-manager.js';
import { searchDocuments } from '../vector/query-engine.js';
import { HandoverError } from '../utils/errors.js';
import { createMcpStructuredError, type McpStructuredError } from './errors.js';
import { QaSessionStoreError } from '../qa/session-store.js';
import type { SearchDocumentsInput, SearchDocumentsResult } from '../vector/query-engine.js';
import type { HandoverConfig } from '../config/schema.js';

const DEFAULT_LIMIT = 10;
const DEFAULT_LAST_ACK_SEQUENCE = 0;

type ToolRequestExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

const semanticSearchInputSchema = z.object({
  query: z.string().trim().min(1, { message: 'query must be a non-empty string' }),
  limit: z
    .number()
    .int({ message: 'limit must be an integer' })
    .positive({ message: 'limit must be greater than 0' })
    .max(50, { message: 'limit must be <= 50' })
    .optional(),
  types: z.array(z.string().trim().min(1, { message: 'types entries cannot be empty' })).optional(),
});

const qaStreamStartInputSchema = z
  .object({
    query: z.string().trim().min(1, { message: 'query must be a non-empty string' }),
    sessionId: z.string().trim().min(1).optional(),
    topK: z
      .number()
      .int({ message: 'topK must be an integer' })
      .positive({ message: 'topK must be greater than 0' })
      .max(50, { message: 'topK must be <= 50' })
      .optional(),
    types: z
      .array(z.string().trim().min(1, { message: 'types entries cannot be empty' }))
      .optional(),
  })
  .strict();

const qaStreamStatusInputSchema = z
  .object({
    sessionId: z.string().trim().min(1, { message: 'sessionId must be a non-empty string' }),
    lastAckSequence: z
      .number()
      .int({ message: 'lastAckSequence must be an integer' })
      .nonnegative({ message: 'lastAckSequence must be >= 0' })
      .optional(),
  })
  .strict();

const qaStreamResumeInputSchema = z
  .object({
    sessionId: z.string().trim().min(1, { message: 'sessionId must be a non-empty string' }),
    lastAckSequence: z
      .number()
      .int({ message: 'lastAckSequence must be an integer' })
      .nonnegative({ message: 'lastAckSequence must be >= 0' }),
  })
  .strict();

const qaStreamCancelInputSchema = z
  .object({
    sessionId: z.string().trim().min(1, { message: 'sessionId must be a non-empty string' }),
    reason: z.string().trim().min(1, { message: 'reason cannot be empty' }).optional(),
  })
  .strict();

const qaLifecycleResponseSchema = z
  .object({
    ok: z.literal(true),
    sessionId: z.string().trim().min(1),
    state: z.enum(['running', 'completed', 'cancelled', 'failed']),
    lastSequence: z.number().int().nonnegative(),
    events: z.array(qaStreamEventSchema),
  })
  .strict();

const qaStartResponseSchema = qaLifecycleResponseSchema
  .extend({
    result: answerQuestionResultSchema.optional(),
  })
  .strict();

const qaCancelResponseSchema = z
  .object({
    ok: z.literal(true),
    sessionId: z.string().trim().min(1),
    state: z.enum(['completed', 'cancelled', 'failed']),
    cancelledAt: z.string().datetime({ offset: true }).optional(),
    lastSequence: z.number().int().nonnegative(),
  })
  .strict();

const regenerationTriggerInputSchema = z
  .object({
    target: z.string().trim().min(1, { message: 'target must be a non-empty string' }).optional(),
  })
  .strict();

const regenerationStatusInputSchema = z
  .object({
    jobId: z.string().trim().min(1, { message: 'jobId must be a non-empty string' }),
  })
  .strict();

const regenerationTriggerToolResponseSchema = z
  .object({
    ok: z.literal(true),
    jobId: z.string().trim().min(1),
    state: regenerationJobStateSchema,
    target: regenerationTargetRefSchema,
    createdAt: z.string().datetime({ offset: true }),
    dedupe: z
      .object({
        joined: z.boolean(),
        key: z.string().trim().min(1),
        reason: z.enum(['none', 'in_flight_target']),
      })
      .strict(),
    next: z
      .object({
        tool: z.literal('regenerate_docs_status'),
        message: z.string().trim().min(1),
        pollAfterMs: z.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict();

const regenerationStatusToolResponseSchema = z
  .object({
    ok: z.literal(true),
    jobId: z.string().trim().min(1),
    state: regenerationJobStateSchema,
    target: regenerationTargetRefSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    startedAt: z.string().datetime({ offset: true }).optional(),
    terminalAt: z.string().datetime({ offset: true }).optional(),
    failure: regenerationFailureSchema.optional(),
    lifecycle: z
      .object({
        stage: regenerationJobStateSchema,
        progressPercent: z.number().int().min(0).max(100),
        summary: z.string().trim().min(1),
      })
      .strict(),
    next: z
      .object({
        tool: z.enum(['regenerate_docs', 'regenerate_docs_status']),
        message: z.string().trim().min(1),
        pollAfterMs: z.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict();

type SemanticSearchFn = (input: SearchDocumentsInput) => Promise<SearchDocumentsResult>;

export interface RegisterMcpToolsOptions {
  config: HandoverConfig;
  outputDir?: string;
  searchFn?: SemanticSearchFn;
  regenerationManager?: RegenerationJobManager;
}

function createInvalidInputError(details: string): McpStructuredError {
  return createMcpStructuredError(
    new HandoverError(
      'Invalid semantic_search input',
      details,
      'Provide query as a non-empty string, optional numeric limit (1-50), and optional string[] types.',
      'SEARCH_INVALID_INPUT',
    ),
  );
}

function createQaInvalidInputError(toolName: string, details: string): McpStructuredError {
  return createMcpStructuredError(
    new HandoverError(
      `Invalid ${toolName} input`,
      details,
      `Review ${toolName} schema and provide required fields with valid values.`,
      'QA_STREAM_INVALID_INPUT',
    ),
  );
}

function createRegenerationInvalidInputError(
  toolName: string,
  details: string,
): McpStructuredError {
  return createMcpStructuredError(
    new HandoverError(
      `Invalid ${toolName} input`,
      details,
      `Provide required ${toolName} fields with valid values and retry the MCP tool call.`,
      'REGENERATION_INVALID_INPUT',
    ),
  );
}

function createInvalidResumeCursorError(
  lastAckSequence: number,
  maxAllowed: number,
): McpStructuredError {
  return createMcpStructuredError(
    new HandoverError(
      'Invalid QA resume cursor',
      `lastAckSequence ${lastAckSequence} exceeds session lastSequence ${maxAllowed}.`,
      `Retry with lastAckSequence between 0 and ${maxAllowed}.`,
      'QA_STREAM_INVALID_CURSOR',
    ),
  );
}

function mapQaSessionStoreError(error: QaSessionStoreError): McpStructuredError {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
      return createMcpStructuredError(
        new HandoverError(
          'QA streaming session not found',
          error.message,
          'Start a session with qa_stream_start and retry with that sessionId.',
          'QA_STREAM_SESSION_NOT_FOUND',
        ),
      );
    case 'SESSION_SEQUENCE_MISMATCH':
      return createMcpStructuredError(
        new HandoverError(
          'QA streaming sequence mismatch',
          error.message,
          'Request qa_stream_status and retry with a cursor at or below the current lastSequence.',
          'QA_STREAM_SEQUENCE_MISMATCH',
        ),
      );
    default:
      return createMcpStructuredError(error);
  }
}

function createToolErrorPayload(error: McpStructuredError) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          ok: false,
          error,
        }),
      },
    ],
    structuredContent: {
      ok: false,
      error,
    },
  };
}

function createToolSuccessPayload<T>(payload: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function mapRegenerationFailureToToolError(
  failure: RegenerationFailure,
  fallbackAction: string,
): McpStructuredError {
  return {
    code: failure.code,
    message: failure.reason,
    action: failure.remediation || fallbackAction,
  };
}

function getLifecycleSummary(state: z.infer<typeof regenerationJobStateSchema>): {
  stage: z.infer<typeof regenerationJobStateSchema>;
  progressPercent: number;
  summary: string;
} {
  switch (state) {
    case 'queued':
      return {
        stage: 'queued',
        progressPercent: 5,
        summary: 'Job accepted and queued for regeneration execution.',
      };
    case 'running':
      return {
        stage: 'running',
        progressPercent: 50,
        summary: 'Regeneration is actively running for the requested target.',
      };
    case 'completed':
      return {
        stage: 'completed',
        progressPercent: 100,
        summary: 'Regeneration completed and no longer requires polling.',
      };
    case 'failed':
      return {
        stage: 'failed',
        progressPercent: 100,
        summary: 'Regeneration reached terminal failure; inspect remediation and retry.',
      };
  }
}

interface CreateRegenerationToolHandlersOptions {
  manager: RegenerationJobManager;
}

export function createRegenerationToolHandlers(options: CreateRegenerationToolHandlersOptions) {
  const handleRegenerateDocs = async (input: unknown) => {
    const parsed = regenerationTriggerInputSchema.safeParse(input);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
        .join('; ');
      return createToolErrorPayload(
        createRegenerationInvalidInputError('regenerate_docs', details),
      );
    }

    const response = options.manager.trigger({
      target: parsed.data.target,
    });

    if (!response.ok) {
      return createToolErrorPayload(
        mapRegenerationFailureToToolError(response.error, response.guidance.message),
      );
    }

    return createToolSuccessPayload(
      regenerationTriggerToolResponseSchema.parse({
        ok: true,
        jobId: response.job.id,
        state: response.job.state,
        target: response.job.target,
        createdAt: response.job.createdAt,
        dedupe: response.dedupe,
        next: {
          tool: 'regenerate_docs_status',
          message: response.guidance.message,
          pollAfterMs: response.guidance.pollAfterMs,
        },
      }),
    );
  };

  const handleRegenerateDocsStatus = async (input: unknown) => {
    const parsed = regenerationStatusInputSchema.safeParse(input);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
        .join('; ');
      return createToolErrorPayload(
        createRegenerationInvalidInputError('regenerate_docs_status', details),
      );
    }

    const response = options.manager.getStatus({
      jobId: parsed.data.jobId,
    });

    if (!response.ok) {
      return createToolErrorPayload(
        mapRegenerationFailureToToolError(response.error, response.guidance.message),
      );
    }

    return createToolSuccessPayload(
      regenerationStatusToolResponseSchema.parse({
        ok: true,
        jobId: response.job.id,
        state: response.job.state,
        target: response.job.target,
        createdAt: response.job.createdAt,
        updatedAt: response.job.updatedAt,
        startedAt: response.job.startedAt,
        terminalAt: response.job.terminalAt,
        failure: response.job.state === 'failed' ? response.job.failure : undefined,
        lifecycle: getLifecycleSummary(response.job.state),
        next: {
          tool: response.guidance.nextTool,
          message: response.guidance.message,
          pollAfterMs: response.guidance.pollAfterMs,
        },
      }),
    );
  };

  return {
    handleRegenerateDocs,
    handleRegenerateDocsStatus,
  };
}

function getProgressToken(extra: ToolRequestExtra): string | number | undefined {
  const token = (extra._meta as { progressToken?: unknown } | undefined)?.progressToken;
  if (typeof token === 'string' || typeof token === 'number') {
    return token;
  }

  return undefined;
}

async function sendProgressNotification(
  extra: ToolRequestExtra,
  event: z.infer<typeof qaStreamEventSchema>,
): Promise<void> {
  const progressToken = getProgressToken(extra);
  if (progressToken === undefined || event.kind === 'token') {
    return;
  }

  let progress = 0;
  let total = 1;
  let message = 'QA stream update';

  if (event.kind === 'progress') {
    progress = event.data.progress;
    total = event.data.total ?? 1;
    message = event.data.message ?? message;
  } else if (event.kind === 'stage') {
    progress = event.data.stage === 'starting' ? 0.1 : 0.6;
    message = event.data.message ?? `QA stage: ${event.data.stage}`;
  } else if (event.kind === 'final') {
    progress = 1;
    message = 'QA stream completed';
  } else if (event.kind === 'cancelled') {
    progress = 1;
    message = event.data.reason ?? 'QA stream cancelled';
  } else if (event.kind === 'error') {
    progress = 1;
    message = `QA stream failed: ${event.data.message}`;
  }

  await extra.sendNotification({
    method: 'notifications/progress',
    params: {
      progressToken,
      progress,
      total,
      message,
    },
  });
}

function hasTerminalEvent(events: z.infer<typeof qaStreamEventSchema>[]): boolean {
  return events.some(
    (event) => event.kind === 'final' || event.kind === 'cancelled' || event.kind === 'error',
  );
}

export function registerMcpTools(server: McpServer, options: RegisterMcpToolsOptions): void {
  const executeSearch = options.searchFn ?? searchDocuments;
  const sessionManager = createQaStreamingSessionManager({
    config: options.config,
  });
  const regenerationManager =
    options.regenerationManager ??
    createRegenerationJobManager({
      runner: async () => ({
        outcome: 'completed',
        summary: 'No-op regeneration manager for MCP tool registration.',
        steps: ['no-op'],
      }),
    });
  const regenerationHandlers = createRegenerationToolHandlers({
    manager: regenerationManager,
  });

  server.registerTool(
    'semantic_search',
    {
      description: 'Semantic search over generated handover documentation.',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().max(50).optional(),
        types: z.array(z.string()).optional(),
      },
    },
    async (input) => {
      const parsed = semanticSearchInputSchema.safeParse(input);
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
          .join('; ');
        return createToolErrorPayload(createInvalidInputError(details));
      }

      const limit = parsed.data.limit ?? DEFAULT_LIMIT;

      try {
        const result = await executeSearch({
          config: options.config,
          query: parsed.data.query,
          topK: limit,
          types: parsed.data.types,
          outputDir: options.outputDir,
        });

        const toolResult = {
          ok: true,
          query: result.query,
          limit: result.topK,
          total: result.totalMatches,
          results: result.matches.map((match) => ({
            relevance: match.relevance,
            source: match.sourceFile,
            section: match.sectionPath,
            snippet: match.contentPreview,
          })),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(toolResult) }],
          structuredContent: toolResult,
        };
      } catch (error) {
        return createToolErrorPayload(createMcpStructuredError(error));
      }
    },
  );

  server.registerTool(
    'regenerate_docs',
    {
      description:
        'Trigger deterministic documentation regeneration and receive an opaque job reference for status polling.',
      inputSchema: {
        target: z.string().optional(),
      },
      outputSchema: regenerationTriggerToolResponseSchema,
    },
    regenerationHandlers.handleRegenerateDocs,
  );

  server.registerTool(
    'regenerate_docs_status',
    {
      description:
        'Get deterministic regeneration lifecycle status by job ID, including polling guidance.',
      inputSchema: {
        jobId: z.string(),
      },
      outputSchema: regenerationStatusToolResponseSchema,
    },
    regenerationHandlers.handleRegenerateDocsStatus,
  );

  server.registerTool(
    'qa_stream_start',
    {
      description:
        'Start a streaming QA session with deterministic lifecycle events and session metadata.',
      inputSchema: {
        query: z.string(),
        sessionId: z.string().optional(),
        topK: z.number().int().positive().max(50).optional(),
        types: z.array(z.string()).optional(),
      },
      outputSchema: qaStartResponseSchema,
    },
    async (input, extra) => {
      const parsed = qaStreamStartInputSchema.safeParse(input);
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
          .join('; ');
        return createToolErrorPayload(createQaInvalidInputError('qa_stream_start', details));
      }

      try {
        const events: z.infer<typeof qaStreamEventSchema>[] = [];
        const handle = await sessionManager.startSession({
          query: parsed.data.query,
          sessionId: parsed.data.sessionId,
          topK: parsed.data.topK,
          types: parsed.data.types,
          signal: extra.signal,
          onEvent: (event) => {
            events.push(event);
            void sendProgressNotification(extra, event);
          },
        });

        return createToolSuccessPayload(
          qaStartResponseSchema.parse({
            ok: true,
            sessionId: handle.sessionId,
            state: handle.state.status,
            lastSequence: handle.state.lastSequence,
            events,
            result: handle.result,
          }),
        );
      } catch (error) {
        if (error instanceof QaSessionStoreError) {
          return createToolErrorPayload(mapQaSessionStoreError(error));
        }

        return createToolErrorPayload(createMcpStructuredError(error));
      }
    },
  );

  server.registerTool(
    'qa_stream_status',
    {
      description:
        'Get deterministic status and replayable event payloads for a QA stream session.',
      inputSchema: {
        sessionId: z.string(),
        lastAckSequence: z.number().int().nonnegative().optional(),
      },
      outputSchema: qaLifecycleResponseSchema,
    },
    async (input) => {
      const parsed = qaStreamStatusInputSchema.safeParse(input);
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
          .join('; ');
        return createToolErrorPayload(createQaInvalidInputError('qa_stream_status', details));
      }

      const lastAckSequence = parsed.data.lastAckSequence ?? DEFAULT_LAST_ACK_SEQUENCE;

      try {
        const state = qaSessionStateSchema.parse(
          sessionManager.getSessionState(parsed.data.sessionId, lastAckSequence),
        );
        const events = sessionManager.resumeSession({
          sessionId: parsed.data.sessionId,
          lastAckSequence,
        }).events;

        return createToolSuccessPayload(
          qaLifecycleResponseSchema.parse({
            ok: true,
            sessionId: parsed.data.sessionId,
            state: state.status,
            lastSequence: state.lastSequence,
            events,
          }),
        );
      } catch (error) {
        if (error instanceof QaSessionStoreError) {
          return createToolErrorPayload(mapQaSessionStoreError(error));
        }

        return createToolErrorPayload(createMcpStructuredError(error));
      }
    },
  );

  server.registerTool(
    'qa_stream_resume',
    {
      description:
        'Replay missed QA stream events from lastAckSequence + 1 with deterministic cursor semantics.',
      inputSchema: {
        sessionId: z.string(),
        lastAckSequence: z.number().int().nonnegative(),
      },
      outputSchema: qaLifecycleResponseSchema,
    },
    async (input, extra) => {
      const parsed = qaStreamResumeInputSchema.safeParse(input);
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
          .join('; ');
        return createToolErrorPayload(createQaInvalidInputError('qa_stream_resume', details));
      }

      try {
        const state = sessionManager.getSessionState(
          parsed.data.sessionId,
          parsed.data.lastAckSequence,
        );
        if (parsed.data.lastAckSequence > state.lastSequence) {
          return createToolErrorPayload(
            createInvalidResumeCursorError(parsed.data.lastAckSequence, state.lastSequence),
          );
        }

        const streamedEvents: z.infer<typeof qaStreamEventSchema>[] = [];
        const resumed = sessionManager.resumeSession({
          sessionId: parsed.data.sessionId,
          lastAckSequence: parsed.data.lastAckSequence,
          onEvent: (event) => {
            streamedEvents.push(event);
            void sendProgressNotification(extra, event);
          },
        });

        if (resumed.state.status === 'running' && resumed.unsubscribe) {
          await new Promise<void>((resolve) => {
            const checkTerminal = () => {
              if (hasTerminalEvent(streamedEvents)) {
                resolve();
              }
            };

            const abortHandler = () => {
              sessionManager.cancelSession({
                sessionId: parsed.data.sessionId,
                reason: 'Cancelled by MCP request signal during resume',
              });
              resolve();
            };

            extra.signal.addEventListener('abort', abortHandler, { once: true });

            const interval = setInterval(() => {
              checkTerminal();
              if (hasTerminalEvent(streamedEvents)) {
                clearInterval(interval);
                extra.signal.removeEventListener('abort', abortHandler);
                resolve();
              }
            }, 50);
          });

          resumed.unsubscribe();
        }

        const finalState = sessionManager.getSessionState(
          parsed.data.sessionId,
          parsed.data.lastAckSequence,
        );

        return createToolSuccessPayload(
          qaLifecycleResponseSchema.parse({
            ok: true,
            sessionId: resumed.sessionId,
            state: finalState.status,
            lastSequence: finalState.lastSequence,
            events: streamedEvents,
          }),
        );
      } catch (error) {
        if (error instanceof QaSessionStoreError) {
          return createToolErrorPayload(mapQaSessionStoreError(error));
        }

        return createToolErrorPayload(createMcpStructuredError(error));
      }
    },
  );

  server.registerTool(
    'qa_stream_cancel',
    {
      description:
        'Cancel an in-flight QA stream and return explicit cancellation confirmation payload.',
      inputSchema: {
        sessionId: z.string(),
        reason: z.string().optional(),
      },
      outputSchema: qaCancelResponseSchema,
    },
    async (input) => {
      const parsed = qaStreamCancelInputSchema.safeParse(input);
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
          .join('; ');
        return createToolErrorPayload(createQaInvalidInputError('qa_stream_cancel', details));
      }

      try {
        const state = sessionManager.cancelSession({
          sessionId: parsed.data.sessionId,
          reason: parsed.data.reason,
        });

        return createToolSuccessPayload(
          qaCancelResponseSchema.parse({
            ok: true,
            sessionId: state.sessionId,
            state: state.status,
            cancelledAt: state.status === 'cancelled' ? state.terminalAt : undefined,
            lastSequence: state.lastSequence,
          }),
        );
      } catch (error) {
        if (error instanceof QaSessionStoreError) {
          return createToolErrorPayload(mapQaSessionStoreError(error));
        }

        return createToolErrorPayload(createMcpStructuredError(error));
      }
    },
  );
}
