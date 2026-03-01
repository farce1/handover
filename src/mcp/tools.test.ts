import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { HandoverConfig } from '../config/schema.js';
import type { RegenerationJobManager } from '../regeneration/job-manager.js';
import { QaSessionStoreError } from '../qa/session-store.js';
import type { QaSessionState, QaStreamEvent } from '../qa/streaming-schema.js';
import { createRegenerationToolHandlers, registerMcpTools } from './tools.js';

const mockCreateQaStreamingSessionManager = vi.hoisted(() => vi.fn());
const mockSearchDocuments = vi.hoisted(() => vi.fn());

vi.mock('../qa/streaming-session.js', () => ({
  createQaStreamingSessionManager: mockCreateQaStreamingSessionManager,
}));

vi.mock('../vector/query-engine.js', () => ({
  searchDocuments: mockSearchDocuments,
}));

const ISO_TIME = '2026-03-01T00:00:00Z';
const TARGET = {
  key: 'my-project',
  requested: 'my-project',
  canonical: '.',
};
const CONFIG = {} as HandoverConfig;

const QA_ANSWER_RESULT = {
  mode: 'qa' as const,
  kind: 'answer' as const,
  query: 'What does handover do?',
  answer: {
    answer: 'It creates and maintains project handover docs.',
    citations: [
      {
        sourceFile: '01-PROJECT-OVERVIEW.md',
        sectionPath: 'Overview',
        chunkIndex: 0,
      },
    ],
  },
};

type ToolHandlerResult = {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  structuredContent: unknown;
};

type MockToolExtra = {
  _meta?: { progressToken?: unknown };
  signal: AbortSignal;
  sendNotification: ReturnType<typeof vi.fn>;
};

type ToolHandler = (input: unknown, extra?: MockToolExtra) => Promise<ToolHandlerResult>;

type MockSessionManager = {
  startSession: ReturnType<typeof vi.fn>;
  resumeSession: ReturnType<typeof vi.fn>;
  cancelSession: ReturnType<typeof vi.fn>;
  getSessionState: ReturnType<typeof vi.fn>;
};

function mkJob(
  state: 'queued' | 'running' | 'completed' | 'failed',
  id = 'job-1',
): {
  id: string;
  state: 'queued' | 'running' | 'completed' | 'failed';
  target: typeof TARGET;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  terminalAt?: string;
  failure?: {
    code: string;
    reason: string;
    remediation: string;
  };
} {
  if (state === 'queued') {
    return {
      id,
      state,
      target: TARGET,
      createdAt: ISO_TIME,
      updatedAt: ISO_TIME,
    };
  }

  if (state === 'running') {
    return {
      id,
      state,
      target: TARGET,
      createdAt: ISO_TIME,
      updatedAt: ISO_TIME,
      startedAt: ISO_TIME,
    };
  }

  if (state === 'completed') {
    return {
      id,
      state,
      target: TARGET,
      createdAt: ISO_TIME,
      updatedAt: ISO_TIME,
      startedAt: ISO_TIME,
      terminalAt: ISO_TIME,
    };
  }

  return {
    id,
    state,
    target: TARGET,
    createdAt: ISO_TIME,
    updatedAt: ISO_TIME,
    startedAt: ISO_TIME,
    terminalAt: ISO_TIME,
    failure: {
      code: 'REGEN_FAILED',
      reason: 'Regeneration failed',
      remediation: 'Fix input and retry',
    },
  };
}

function mkRunningState(sessionId: string, lastSequence: number): QaSessionState {
  return {
    sessionId,
    status: 'running',
    lastSequence,
    updatedAt: ISO_TIME,
    cursor: {
      lastAckSequence: 0,
    },
  };
}

function mkTerminalState(
  status: 'completed' | 'cancelled' | 'failed',
  sessionId: string,
  lastSequence: number,
): QaSessionState {
  return {
    sessionId,
    status,
    terminalAt: ISO_TIME,
    lastSequence,
    updatedAt: ISO_TIME,
    cursor: {
      lastAckSequence: 0,
    },
  };
}

function mkEvent<K extends QaStreamEvent['kind']>(
  kind: K,
  data: Extract<QaStreamEvent, { kind: K }>['data'],
  sequence: number,
  sessionId = 'session-1',
): QaStreamEvent {
  return {
    sessionId,
    sequence,
    at: ISO_TIME,
    kind,
    data,
  } as QaStreamEvent;
}

function createMockServer(): {
  registerTool: ReturnType<typeof vi.fn>;
  getHandler: (name: string) => ToolHandler;
} {
  const tools = new Map<string, ToolHandler>();
  return {
    registerTool: vi.fn((name: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    }),
    getHandler: (name: string) => {
      const handler = tools.get(name);
      if (!handler) {
        throw new Error(`Missing tool handler for ${name}`);
      }
      return handler;
    },
  };
}

function createToolExtra(progressToken?: unknown): {
  extra: MockToolExtra;
  sendNotification: ReturnType<typeof vi.fn>;
} {
  const sendNotification = vi.fn(async () => undefined);
  return {
    extra: {
      _meta: progressToken === undefined ? {} : { progressToken },
      signal: new AbortController().signal,
      sendNotification,
    },
    sendNotification,
  };
}

function createSessionManagerMock(): MockSessionManager {
  return {
    startSession: vi.fn(async () => ({
      sessionId: 'session-1',
      state: mkRunningState('session-1', 0),
      events: [],
    })),
    resumeSession: vi.fn(() => ({
      sessionId: 'session-1',
      state: mkRunningState('session-1', 0),
      events: [],
      unsubscribe: undefined,
    })),
    cancelSession: vi.fn(() => mkTerminalState('cancelled', 'session-1', 1)),
    getSessionState: vi.fn(() => mkRunningState('session-1', 0)),
  };
}

describe('createRegenerationToolHandlers', () => {
  const mockManager = {
    trigger: vi.fn(),
    getStatus: vi.fn(),
  };
  const handlers = createRegenerationToolHandlers({
    manager: mockManager as unknown as RegenerationJobManager,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('handleRegenerateDocs returns success payload for valid trigger input', async () => {
    mockManager.trigger.mockReturnValue({
      ok: true,
      job: mkJob('queued'),
      dedupe: {
        joined: false,
        key: 'my-project',
        reason: 'none',
      },
      guidance: {
        nextTool: 'regenerate_docs_status',
        message: 'Poll status',
        pollAfterMs: 2000,
      },
    });

    const result = await handlers.handleRegenerateDocs({ target: 'my-project' });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        jobId: 'job-1',
        state: 'queued',
        next: expect.objectContaining({
          tool: 'regenerate_docs_status',
        }),
      }),
    );
  });

  test('handleRegenerateDocs returns structured validation error for invalid input', async () => {
    const result = await handlers.handleRegenerateDocs({ target: '', extraField: true });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'REGENERATION_INVALID_INPUT',
        }),
      }),
    );
  });

  test('handleRegenerateDocs maps manager trigger failure to tool error payload', async () => {
    mockManager.trigger.mockReturnValue({
      ok: false,
      error: {
        code: 'REGEN_IN_FLIGHT',
        reason: 'Already running',
        remediation: 'Wait for completion',
      },
      guidance: {
        nextTool: 'regenerate_docs_status',
        message: 'Wait and retry',
      },
    });

    const result = await handlers.handleRegenerateDocs({ target: 'my-project' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'REGEN_IN_FLIGHT',
          message: 'Already running',
          action: 'Wait for completion',
        }),
      }),
    );
  });

  test('handleRegenerateDocsStatus returns completed lifecycle payload for valid status input', async () => {
    mockManager.getStatus.mockReturnValue({
      ok: true,
      job: mkJob('completed'),
      guidance: {
        nextTool: 'regenerate_docs',
        message: 'Completed',
      },
    });

    const result = await handlers.handleRegenerateDocsStatus({ jobId: 'job-1' });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        jobId: 'job-1',
        state: 'completed',
        lifecycle: expect.objectContaining({
          stage: 'completed',
          progressPercent: 100,
        }),
      }),
    );
  });

  test('handleRegenerateDocsStatus returns validation error for empty jobId', async () => {
    const result = await handlers.handleRegenerateDocsStatus({ jobId: '' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'REGENERATION_INVALID_INPUT',
        }),
      }),
    );
  });

  test('handleRegenerateDocsStatus returns structured error when manager reports missing job', async () => {
    mockManager.getStatus.mockReturnValue({
      ok: false,
      error: {
        code: 'REGEN_JOB_NOT_FOUND',
        reason: 'Unknown job id',
        remediation: 'Trigger regenerate_docs to start a new job',
      },
      guidance: {
        nextTool: 'regenerate_docs',
        message: 'Start a new job',
      },
    });

    const result = await handlers.handleRegenerateDocsStatus({ jobId: 'job-missing' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'REGEN_JOB_NOT_FOUND',
          message: 'Unknown job id',
        }),
      }),
    );
  });

  test.each([
    { state: 'queued', progressPercent: 5, nextTool: 'regenerate_docs_status' as const },
    { state: 'running', progressPercent: 50, nextTool: 'regenerate_docs_status' as const },
    { state: 'completed', progressPercent: 100, nextTool: 'regenerate_docs' as const },
    { state: 'failed', progressPercent: 100, nextTool: 'regenerate_docs' as const },
  ])(
    'handleRegenerateDocsStatus maps lifecycle for $state jobs',
    async ({ state, progressPercent, nextTool }) => {
      mockManager.getStatus.mockReturnValue({
        ok: true,
        job: mkJob(state),
        guidance: {
          nextTool,
          message: `Status for ${state}`,
          pollAfterMs: nextTool === 'regenerate_docs_status' ? 750 : undefined,
        },
      });

      const result = await handlers.handleRegenerateDocsStatus({ jobId: 'job-1' });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          ok: true,
          state,
          lifecycle: expect.objectContaining({
            stage: state,
            progressPercent,
          }),
        }),
      );
    },
  );
});

describe('registerMcpTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchDocuments.mockResolvedValue({
      query: 'overview',
      topK: 10,
      totalMatches: 0,
      matches: [],
      filters: { types: [] },
    });
    mockCreateQaStreamingSessionManager.mockReturnValue(createSessionManagerMock());
  });

  test('registers all MCP tools including search and streaming handlers', () => {
    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });

    expect(server.registerTool).toHaveBeenCalledWith(
      'semantic_search',
      expect.any(Object),
      expect.any(Function),
    );
    expect(server.registerTool).toHaveBeenCalledWith(
      'qa_stream_start',
      expect.any(Object),
      expect.any(Function),
    );
    expect(server.registerTool).toHaveBeenCalledWith(
      'qa_stream_status',
      expect.any(Object),
      expect.any(Function),
    );
    expect(server.registerTool).toHaveBeenCalledWith(
      'qa_stream_resume',
      expect.any(Object),
      expect.any(Function),
    );
    expect(server.registerTool).toHaveBeenCalledWith(
      'qa_stream_cancel',
      expect.any(Object),
      expect.any(Function),
    );
  });

  test('semantic_search returns structured success payload and applies default limit', async () => {
    const searchFn = vi.fn(async () => ({
      query: 'docs',
      topK: 10,
      totalMatches: 1,
      matches: [
        {
          relevance: 87.4,
          sourceFile: '03-ARCHITECTURE.md',
          sectionPath: 'Architecture > Components',
          contentPreview: 'The architecture is organized by phases.',
        },
      ],
      filters: {
        types: [],
      },
    }));
    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG, outputDir: '/tmp/out', searchFn });
    const handler = server.getHandler('semantic_search');

    const result = await handler({ query: 'docs' });

    expect(searchFn).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'docs',
        topK: 10,
        outputDir: '/tmp/out',
      }),
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        query: 'docs',
        limit: 10,
        total: 1,
      }),
    );
  });

  test('semantic_search returns SEARCH_INVALID_INPUT for empty query', async () => {
    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG, searchFn: vi.fn() });
    const handler = server.getHandler('semantic_search');

    const result = await handler({ query: '   ' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'SEARCH_INVALID_INPUT',
        }),
      }),
    );
  });

  test('semantic_search wraps thrown errors with MCP_SERVE_ERROR', async () => {
    const server = createMockServer();
    registerMcpTools(server as never, {
      config: CONFIG,
      searchFn: vi.fn(async () => {
        throw new Error('search exploded');
      }),
    });
    const handler = server.getHandler('semantic_search');

    const result = await handler({ query: 'docs', limit: 5 });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'MCP_SERVE_ERROR',
          message: 'search exploded',
        }),
      }),
    );
  });

  test('semantic_search uses module-level searchDocuments when searchFn is omitted', async () => {
    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('semantic_search');

    await handler({ query: 'overview', limit: 3 });

    expect(mockSearchDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'overview',
        topK: 3,
      }),
    );
  });

  test('qa_stream_start returns success payload and sends progress notifications for non-token events', async () => {
    const sessionManager = createSessionManagerMock();
    sessionManager.startSession.mockImplementation(
      async (input: {
        onEvent?: (event: QaStreamEvent) => void;
        query: string;
        sessionId?: string;
      }) => {
        input.onEvent?.(
          mkEvent(
            'token',
            {
              token: 'stream token',
            },
            1,
            'session-stream',
          ),
        );
        input.onEvent?.(
          mkEvent(
            'stage',
            {
              stage: 'answering',
              message: 'Running QA',
            },
            2,
            'session-stream',
          ),
        );
        input.onEvent?.(
          mkEvent(
            'progress',
            {
              progress: 1,
              total: 1,
              message: 'Completed',
            },
            3,
            'session-stream',
          ),
        );
        return {
          sessionId: 'session-stream',
          state: mkTerminalState('completed', 'session-stream', 3),
          events: [],
          result: QA_ANSWER_RESULT,
        };
      },
    );
    mockCreateQaStreamingSessionManager.mockReturnValue(sessionManager);

    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('qa_stream_start');
    const { extra, sendNotification } = createToolExtra(42);

    const result = await handler({ query: 'what is handover?' }, extra);

    expect(sessionManager.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'what is handover?',
      }),
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        sessionId: 'session-stream',
        state: 'completed',
        lastSequence: 3,
        result: QA_ANSWER_RESULT,
      }),
    );
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  test('qa_stream_start returns QA_STREAM_INVALID_INPUT on validation failure', async () => {
    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('qa_stream_start');
    const { extra } = createToolExtra('token');

    const result = await handler({ query: '' }, extra);

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'QA_STREAM_INVALID_INPUT',
        }),
      }),
    );
  });

  test('qa_stream_start maps SESSION_NOT_FOUND to QA_STREAM_SESSION_NOT_FOUND', async () => {
    const sessionManager = createSessionManagerMock();
    sessionManager.startSession.mockRejectedValue(
      new QaSessionStoreError('no session', 'SESSION_NOT_FOUND', true),
    );
    mockCreateQaStreamingSessionManager.mockReturnValue(sessionManager);

    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('qa_stream_start');
    const { extra } = createToolExtra();

    const result = await handler({ query: 'test' }, extra);

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'QA_STREAM_SESSION_NOT_FOUND',
        }),
      }),
    );
  });

  test('qa_stream_status returns lifecycle payload with default lastAckSequence', async () => {
    const sessionManager = createSessionManagerMock();
    sessionManager.getSessionState.mockReturnValue(mkRunningState('session-status', 5));
    sessionManager.resumeSession.mockReturnValue({
      sessionId: 'session-status',
      state: mkRunningState('session-status', 5),
      events: [
        mkEvent(
          'stage',
          {
            stage: 'answering',
            message: 'Answering',
          },
          5,
          'session-status',
        ),
      ],
    });
    mockCreateQaStreamingSessionManager.mockReturnValue(sessionManager);

    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('qa_stream_status');

    const result = await handler({ sessionId: 'session-status' });

    expect(sessionManager.getSessionState).toHaveBeenCalledWith('session-status', 0);
    expect(sessionManager.resumeSession).toHaveBeenCalledWith({
      sessionId: 'session-status',
      lastAckSequence: 0,
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        sessionId: 'session-status',
        state: 'running',
        lastSequence: 5,
      }),
    );
  });

  test('qa_stream_status returns QA_STREAM_INVALID_INPUT for empty sessionId', async () => {
    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('qa_stream_status');

    const result = await handler({ sessionId: '' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'QA_STREAM_INVALID_INPUT',
        }),
      }),
    );
  });

  test('qa_stream_status maps SESSION_SEQUENCE_MISMATCH and default session errors', async () => {
    const sessionManager = createSessionManagerMock();
    sessionManager.getSessionState.mockImplementationOnce(() => {
      throw new QaSessionStoreError('bad cursor', 'SESSION_SEQUENCE_MISMATCH', true);
    });
    sessionManager.getSessionState.mockImplementationOnce(() => {
      throw new QaSessionStoreError('terminal transition', 'SESSION_TERMINAL_TRANSITION', true);
    });
    mockCreateQaStreamingSessionManager.mockReturnValue(sessionManager);

    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('qa_stream_status');

    const first = await handler({ sessionId: 'session-err' });
    const second = await handler({ sessionId: 'session-err' });

    expect(first.isError).toBe(true);
    expect(first.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'QA_STREAM_SEQUENCE_MISMATCH',
        }),
      }),
    );
    expect(second.isError).toBe(true);
    expect(second.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'MCP_SERVE_ERROR',
        }),
      }),
    );
  });

  test('qa_stream_resume returns QA_STREAM_INVALID_CURSOR when lastAckSequence exceeds lastSequence', async () => {
    const sessionManager = createSessionManagerMock();
    sessionManager.getSessionState.mockReturnValue(mkRunningState('session-resume', 2));
    mockCreateQaStreamingSessionManager.mockReturnValue(sessionManager);

    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('qa_stream_resume');
    const { extra } = createToolExtra(100);

    const result = await handler({ sessionId: 'session-resume', lastAckSequence: 5 }, extra);

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'QA_STREAM_INVALID_CURSOR',
        }),
      }),
    );
  });

  test('qa_stream_resume waits for terminal streamed event and returns final state', async () => {
    const unsubscribe = vi.fn();
    const sessionManager = createSessionManagerMock();
    sessionManager.getSessionState
      .mockReturnValueOnce(mkRunningState('session-running', 3))
      .mockReturnValueOnce(mkTerminalState('completed', 'session-running', 4));
    sessionManager.resumeSession.mockImplementation(
      (input: { onEvent?: (event: QaStreamEvent) => void; sessionId: string }) => {
        setTimeout(() => {
          input.onEvent?.(
            mkEvent(
              'final',
              {
                result: QA_ANSWER_RESULT,
              },
              4,
              input.sessionId,
            ),
          );
        }, 0);
        return {
          sessionId: input.sessionId,
          state: mkRunningState(input.sessionId, 3),
          events: [],
          unsubscribe,
        };
      },
    );
    mockCreateQaStreamingSessionManager.mockReturnValue(sessionManager);

    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('qa_stream_resume');
    const { extra, sendNotification } = createToolExtra('progress-token');

    const result = await handler({ sessionId: 'session-running', lastAckSequence: 1 }, extra);

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        sessionId: 'session-running',
        state: 'completed',
        lastSequence: 4,
      }),
    );
  });

  test('qa_stream_resume returns QA_STREAM_INVALID_INPUT for invalid payload', async () => {
    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('qa_stream_resume');
    const { extra } = createToolExtra();

    const result = await handler({ sessionId: '' }, extra);

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'QA_STREAM_INVALID_INPUT',
        }),
      }),
    );
  });

  test('qa_stream_cancel returns success payload and handles SESSION_NOT_FOUND', async () => {
    const sessionManager = createSessionManagerMock();
    sessionManager.cancelSession
      .mockReturnValueOnce(mkTerminalState('cancelled', 'session-cancel', 6))
      .mockImplementationOnce(() => {
        throw new QaSessionStoreError('missing session', 'SESSION_NOT_FOUND', true);
      });
    mockCreateQaStreamingSessionManager.mockReturnValue(sessionManager);

    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('qa_stream_cancel');

    const success = await handler({ sessionId: 'session-cancel', reason: 'user stop' });
    const missing = await handler({ sessionId: 'session-missing' });

    expect(success.isError).toBeUndefined();
    expect(success.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        sessionId: 'session-cancel',
        state: 'cancelled',
        cancelledAt: ISO_TIME,
        lastSequence: 6,
      }),
    );
    expect(missing.isError).toBe(true);
    expect(missing.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'QA_STREAM_SESSION_NOT_FOUND',
        }),
      }),
    );
  });

  test('qa_stream_cancel returns QA_STREAM_INVALID_INPUT for invalid payload', async () => {
    const server = createMockServer();
    registerMcpTools(server as never, { config: CONFIG });
    const handler = server.getHandler('qa_stream_cancel');

    const result = await handler({ sessionId: '', reason: '' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'QA_STREAM_INVALID_INPUT',
        }),
      }),
    );
  });
});
