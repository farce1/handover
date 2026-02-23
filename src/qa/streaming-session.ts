import { randomUUID } from 'node:crypto';
import { answerQuestion, type AnswerQuestionInput, type AnswerQuestionResult } from './answerer.js';
import {
  createQaSessionStore,
  type QaSessionStore,
  type QaSessionStoreError,
} from './session-store.js';
import {
  qaSessionStateSchema,
  qaStreamEventSchema,
  type QaSessionState,
  type QaStreamEvent,
} from './streaming-schema.js';
import type { HandoverConfig } from '../config/schema.js';

interface StartQaStreamingSessionInput {
  sessionId?: string;
  query: string;
  topK?: number;
  types?: string[];
  signal?: AbortSignal;
  onEvent?: (event: QaStreamEvent) => void;
}

interface ResumeQaStreamingSessionInput {
  sessionId: string;
  lastAckSequence: number;
  onEvent?: (event: QaStreamEvent) => void;
}

interface CancelQaStreamingSessionInput {
  sessionId: string;
  reason?: string;
}

interface QaStreamingSessionHandle {
  sessionId: string;
  state: QaSessionState;
  events: QaStreamEvent[];
  result?: AnswerQuestionResult;
  unsubscribe?: () => void;
}

export interface QaStreamingSessionManager {
  startSession(input: StartQaStreamingSessionInput): Promise<QaStreamingSessionHandle>;
  resumeSession(input: ResumeQaStreamingSessionInput): QaStreamingSessionHandle;
  cancelSession(input: CancelQaStreamingSessionInput): QaSessionState;
  getSessionState(sessionId: string, lastAckSequence?: number): QaSessionState;
}

export interface CreateQaStreamingSessionManagerOptions {
  config: HandoverConfig;
  store?: QaSessionStore;
  now?: () => Date;
  answerFn?: (input: AnswerQuestionInput) => Promise<AnswerQuestionResult>;
  onEvent?: (event: QaStreamEvent) => void;
}

interface ActiveSessionRuntime {
  controller: AbortController;
  emitCancelled: (reason?: string) => QaStreamEvent | null;
  isTerminal: () => boolean;
}

export function createQaStreamingSessionManager(
  options: CreateQaStreamingSessionManagerOptions,
): QaStreamingSessionManager {
  const store = options.store ?? createQaSessionStore();
  const answerFn = options.answerFn ?? answerQuestion;
  const now = options.now ?? (() => new Date());
  const active = new Map<string, ActiveSessionRuntime>();
  const listeners = new Map<string, Set<(event: QaStreamEvent) => void>>();

  class QaSessionCancelledError extends Error {
    constructor() {
      super('QA streaming session cancelled');
      this.name = 'QaSessionCancelledError';
    }
  }

  function addListener(sessionId: string, listener: (event: QaStreamEvent) => void): () => void {
    const current = listeners.get(sessionId) ?? new Set<(event: QaStreamEvent) => void>();
    current.add(listener);
    listeners.set(sessionId, current);

    return () => {
      const registered = listeners.get(sessionId);
      if (!registered) {
        return;
      }

      registered.delete(listener);
      if (registered.size === 0) {
        listeners.delete(sessionId);
      }
    };
  }

  function publish(event: QaStreamEvent, sink?: (event: QaStreamEvent) => void): void {
    options.onEvent?.(event);
    sink?.(event);
    const sessionListeners = listeners.get(event.sessionId);
    if (!sessionListeners) {
      return;
    }

    for (const listener of sessionListeners) {
      listener(event);
    }
  }

  function buildEmitter(
    sessionId: string,
    sink?: (event: QaStreamEvent) => void,
  ): {
    emit: <K extends QaStreamEvent['kind']>(
      kind: K,
      data: Extract<QaStreamEvent, { kind: K }>['data'],
    ) => QaStreamEvent | null;
    isTerminal: () => boolean;
  } {
    let nextSequence = store.getSessionState(sessionId).lastSequence + 1;
    let terminal = store.getSessionState(sessionId).status !== 'running';

    return {
      emit(kind, data) {
        if (terminal) {
          return null;
        }

        const event = qaStreamEventSchema.parse({
          sessionId,
          sequence: nextSequence,
          at: now().toISOString(),
          kind,
          data,
        });

        const persisted = store.appendEvent(event);
        nextSequence += 1;
        if (
          persisted.kind === 'final' ||
          persisted.kind === 'cancelled' ||
          persisted.kind === 'error'
        ) {
          terminal = true;
        }

        publish(persisted, sink);
        if (terminal) {
          listeners.delete(sessionId);
        }
        return persisted;
      },
      isTerminal: () => terminal,
    };
  }

  function cancelRunningSession(sessionId: string, reason?: string): QaSessionState {
    const runtime = active.get(sessionId);
    if (runtime) {
      runtime.controller.abort();
      runtime.emitCancelled(reason);
    }

    return qaSessionStateSchema.parse(store.getSessionState(sessionId));
  }

  return {
    async startSession(input: StartQaStreamingSessionInput): Promise<QaStreamingSessionHandle> {
      const sessionId = input.sessionId ?? randomUUID();
      store.createSession({ sessionId });

      const { emit, isTerminal } = buildEmitter(sessionId, input.onEvent);
      const controller = new AbortController();

      if (input.signal) {
        if (input.signal.aborted) {
          controller.abort();
        } else {
          input.signal.addEventListener('abort', () => controller.abort(), { once: true });
        }
      }

      const emitCancelled = (reason?: string): QaStreamEvent | null => {
        return emit('cancelled', reason ? { reason } : {});
      };

      active.set(sessionId, {
        controller,
        emitCancelled,
        isTerminal,
      });

      emit('stage', { stage: 'starting', message: 'Session started' });
      emit('progress', { progress: 0, total: 1, message: 'Preparing QA answer' });

      if (controller.signal.aborted) {
        emitCancelled('Cancelled before execution started');
        active.delete(sessionId);
        return {
          sessionId,
          state: store.getSessionState(sessionId),
          events: store.replayEvents(sessionId, 0),
        };
      }

      try {
        emit('stage', { stage: 'answering', message: 'Running grounded QA' });

        const answerPromise = answerFn({
          config: options.config,
          query: input.query,
          topK: input.topK,
          types: input.types,
        });

        const abortPromise = new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new QaSessionCancelledError()), {
            once: true,
          });
        });

        let result: AnswerQuestionResult;
        try {
          result = await Promise.race([answerPromise, abortPromise]);
        } catch (error) {
          if (controller.signal.aborted && error instanceof QaSessionCancelledError) {
            emitCancelled('Cancelled while execution was in-flight');
            answerPromise.catch(() => undefined);
            return {
              sessionId,
              state: store.getSessionState(sessionId),
              events: store.replayEvents(sessionId, 0),
            };
          }

          throw error;
        }

        if (!isTerminal()) {
          emit('progress', { progress: 1, total: 1, message: 'Completed' });
          emit('final', { result });
        }

        return {
          sessionId,
          result,
          state: store.getSessionState(sessionId),
          events: store.replayEvents(sessionId, 0),
        };
      } catch (error) {
        if (!isTerminal()) {
          if (controller.signal.aborted) {
            emitCancelled('Cancelled while execution was in-flight');
          } else {
            emit('error', {
              code: error instanceof Error ? error.name : 'QA_STREAM_ERROR',
              message: error instanceof Error ? error.message : String(error),
              recoverable: false,
            });
          }
        }

        throw error;
      } finally {
        active.delete(sessionId);
      }
    },

    resumeSession(input: ResumeQaStreamingSessionInput): QaStreamingSessionHandle {
      const events = store.replayEvents(input.sessionId, input.lastAckSequence);
      for (const event of events) {
        publish(event, input.onEvent);
      }

      const state = store.getSessionState(input.sessionId, input.lastAckSequence);
      const unsubscribe =
        state.status === 'running' && input.onEvent
          ? addListener(input.sessionId, input.onEvent)
          : undefined;

      return {
        sessionId: input.sessionId,
        state,
        events,
        unsubscribe,
      };
    },

    cancelSession(input: CancelQaStreamingSessionInput): QaSessionState {
      return cancelRunningSession(input.sessionId, input.reason ?? 'Cancelled by user');
    },

    getSessionState(sessionId: string, lastAckSequence = 0): QaSessionState {
      return store.getSessionState(sessionId, lastAckSequence);
    },
  };
}

export type { QaSessionStoreError };
