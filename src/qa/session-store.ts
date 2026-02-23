import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import {
  qaReplayCursorSchema,
  qaSessionStateSchema,
  qaStreamEventSchema,
  type QaSessionState,
  type QaStreamEvent,
} from './streaming-schema.js';

const HANDOVER_DIR = '.handover';
const QA_SESSIONS_DIR = 'qa-sessions';
const DEFAULT_TERMINAL_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const qaSessionRecordSchema = z
  .object({
    sessionId: z.string().trim().min(1),
    status: z.enum(['running', 'completed', 'cancelled', 'failed']),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    terminalAt: z.string().datetime({ offset: true }).optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
    lastSequence: z.number().int().nonnegative(),
    events: z.array(qaStreamEventSchema),
  })
  .strict();

type QaSessionRecord = z.infer<typeof qaSessionRecordSchema>;

type QaSessionStoreErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_FILE_CORRUPT'
  | 'SESSION_SEQUENCE_MISMATCH'
  | 'SESSION_TERMINAL_TRANSITION';

export class QaSessionStoreError extends Error {
  constructor(
    message: string,
    public readonly code: QaSessionStoreErrorCode,
    public readonly recoverable: boolean,
  ) {
    super(message);
    this.name = 'QaSessionStoreError';
  }
}

export interface CreateQaSessionStoreOptions {
  rootDir?: string;
  sessionTtlMs?: number;
  now?: () => Date;
}

export interface CreateSessionInput {
  sessionId: string;
}

export interface QaSessionStore {
  createSession(input: CreateSessionInput): QaSessionState;
  appendEvent(event: QaStreamEvent): QaStreamEvent;
  replayEvents(sessionId: string, lastAckSequence: number): QaStreamEvent[];
  getSessionState(sessionId: string, lastAckSequence?: number): QaSessionState;
  cleanupExpiredSessions(): string[];
}

function toSessionState(record: QaSessionRecord, lastAckSequence: number): QaSessionState {
  return qaSessionStateSchema.parse({
    sessionId: record.sessionId,
    status: record.status,
    terminalAt: record.terminalAt,
    lastSequence: record.lastSequence,
    updatedAt: record.updatedAt,
    cursor: qaReplayCursorSchema.parse({ lastAckSequence }),
  });
}

function resolveSessionStoreDir(rootDir?: string): string {
  if (rootDir) {
    return resolve(rootDir);
  }

  return join(process.cwd(), HANDOVER_DIR, QA_SESSIONS_DIR);
}

function filePathForSession(baseDir: string, sessionId: string): string {
  return join(baseDir, `${sessionId}.json`);
}

function writeSessionFile(path: string, record: QaSessionRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(record, null, 2), 'utf-8');
  renameSync(tmpPath, path);
}

function readSessionFile(path: string): QaSessionRecord {
  const raw = readFileSync(path, 'utf-8');

  try {
    const parsed = JSON.parse(raw);
    return qaSessionRecordSchema.parse(parsed);
  } catch {
    throw new QaSessionStoreError(
      `Session file is malformed and requires recovery: ${path}`,
      'SESSION_FILE_CORRUPT',
      true,
    );
  }
}

function transitionStatusFromEvent(event: QaStreamEvent): QaSessionRecord['status'] {
  if (event.kind === 'final') {
    return 'completed';
  }

  if (event.kind === 'cancelled') {
    return 'cancelled';
  }

  if (event.kind === 'error') {
    return 'failed';
  }

  return 'running';
}

export function createQaSessionStore(options: CreateQaSessionStoreOptions = {}): QaSessionStore {
  const now = options.now ?? (() => new Date());
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_TERMINAL_SESSION_TTL_MS;
  const baseDir = resolveSessionStoreDir(options.rootDir);
  mkdirSync(baseDir, { recursive: true });

  function loadSessionRecord(sessionId: string): QaSessionRecord {
    const path = filePathForSession(baseDir, sessionId);
    if (!existsSync(path)) {
      throw new QaSessionStoreError(
        `Session does not exist: ${sessionId}`,
        'SESSION_NOT_FOUND',
        true,
      );
    }

    return readSessionFile(path);
  }

  function persistSessionRecord(record: QaSessionRecord): void {
    writeSessionFile(filePathForSession(baseDir, record.sessionId), record);
  }

  function cleanupExpiredSessions(): string[] {
    mkdirSync(baseDir, { recursive: true });
    const removed: string[] = [];

    for (const entry of readdirSync(baseDir)) {
      if (!entry.endsWith('.json')) {
        continue;
      }

      const path = join(baseDir, entry);
      const record = readSessionFile(path);
      if (!record.expiresAt) {
        continue;
      }

      const expiresAtMs = Date.parse(record.expiresAt);
      if (!Number.isFinite(expiresAtMs)) {
        throw new QaSessionStoreError(
          `Session file has invalid expiration timestamp: ${path}`,
          'SESSION_FILE_CORRUPT',
          true,
        );
      }

      if (expiresAtMs <= now().getTime()) {
        rmSync(path, { force: true });
        removed.push(record.sessionId);
      }
    }

    return removed;
  }

  return {
    createSession(input: CreateSessionInput): QaSessionState {
      cleanupExpiredSessions();

      const sessionId = input.sessionId.trim();
      const createdAt = now().toISOString();
      const path = filePathForSession(baseDir, sessionId);

      const record: QaSessionRecord = {
        sessionId,
        status: 'running',
        createdAt,
        updatedAt: createdAt,
        lastSequence: 0,
        events: [],
      };

      writeSessionFile(path, record);
      return toSessionState(record, 0);
    },

    appendEvent(event: QaStreamEvent): QaStreamEvent {
      cleanupExpiredSessions();

      const parsedEvent = qaStreamEventSchema.parse(event);
      const record = loadSessionRecord(parsedEvent.sessionId);
      const expectedSequence = record.lastSequence + 1;
      if (parsedEvent.sequence !== expectedSequence) {
        throw new QaSessionStoreError(
          `Expected sequence ${expectedSequence} for session ${record.sessionId}, got ${parsedEvent.sequence}`,
          'SESSION_SEQUENCE_MISMATCH',
          true,
        );
      }

      const nextStatus = transitionStatusFromEvent(parsedEvent);
      const isTerminalEvent = nextStatus !== 'running';
      const isAlreadyTerminal = record.status !== 'running';
      if (isTerminalEvent && isAlreadyTerminal) {
        throw new QaSessionStoreError(
          `Session ${record.sessionId} already finalized as ${record.status}`,
          'SESSION_TERMINAL_TRANSITION',
          true,
        );
      }

      record.events.push(parsedEvent);
      record.lastSequence = parsedEvent.sequence;
      record.updatedAt = parsedEvent.at;
      record.status = nextStatus;

      if (isTerminalEvent) {
        record.terminalAt = parsedEvent.at;
        record.expiresAt = new Date(Date.parse(parsedEvent.at) + sessionTtlMs).toISOString();
      }

      persistSessionRecord(record);
      return parsedEvent;
    },

    replayEvents(sessionId: string, lastAckSequence: number): QaStreamEvent[] {
      cleanupExpiredSessions();

      const cursor = qaReplayCursorSchema.parse({ lastAckSequence });
      const record = loadSessionRecord(sessionId);
      return record.events
        .filter((event) => event.sequence > cursor.lastAckSequence)
        .sort((left, right) => left.sequence - right.sequence);
    },

    getSessionState(sessionId: string, lastAckSequence = 0): QaSessionState {
      cleanupExpiredSessions();

      const cursor = qaReplayCursorSchema.parse({ lastAckSequence });
      const record = loadSessionRecord(sessionId);
      return toSessionState(record, cursor.lastAckSequence);
    },

    cleanupExpiredSessions,
  };
}
