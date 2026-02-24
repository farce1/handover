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
  regenerationFailureSchema,
  regenerationJobSchema,
  type RegenerationFailure,
  type RegenerationJob,
  type RegenerationTargetRef,
} from './schema.js';

const HANDOVER_DIR = '.handover';
const REGENERATION_JOBS_DIR = 'regeneration-jobs';
const DEFAULT_TERMINAL_JOB_TTL_MS = 24 * 60 * 60 * 1000;

const persistedRegenerationJobSchema = z
  .object({
    job: regenerationJobSchema,
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

type PersistedRegenerationJob = z.infer<typeof persistedRegenerationJobSchema>;

type RegenerationJobStoreErrorCode =
  | 'JOB_NOT_FOUND'
  | 'JOB_FILE_CORRUPT'
  | 'JOB_INVALID_TRANSITION';

export class RegenerationJobStoreError extends Error {
  constructor(
    message: string,
    public readonly code: RegenerationJobStoreErrorCode,
    public readonly recoverable: boolean,
  ) {
    super(message);
    this.name = 'RegenerationJobStoreError';
  }
}

export interface CreateRegenerationJobStoreOptions {
  rootDir?: string;
  terminalJobTtlMs?: number;
  now?: () => Date;
}

export interface CreateRegenerationJobInput {
  jobId: string;
  target: RegenerationTargetRef;
}

export interface TransitionRegenerationJobInput {
  jobId: string;
  to: 'running' | 'completed' | 'failed';
  failure?: RegenerationFailure;
}

export interface RegenerationJobStore {
  createJob(input: CreateRegenerationJobInput): RegenerationJob;
  transitionJob(input: TransitionRegenerationJobInput): RegenerationJob;
  getJob(jobId: string): RegenerationJob;
  getActiveJobByTarget(targetKey: string): RegenerationJob | undefined;
  cleanupExpiredJobs(): string[];
}

function resolveRegenerationStoreDir(rootDir?: string): string {
  if (rootDir) {
    return resolve(rootDir);
  }

  return join(process.cwd(), HANDOVER_DIR, REGENERATION_JOBS_DIR);
}

function filePathForJob(baseDir: string, jobId: string): string {
  return join(baseDir, `${jobId}.json`);
}

function writeJobFile(path: string, record: PersistedRegenerationJob): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(record, null, 2), 'utf-8');
  renameSync(tmpPath, path);
}

function readJobFile(path: string): PersistedRegenerationJob {
  const raw = readFileSync(path, 'utf-8');

  try {
    return persistedRegenerationJobSchema.parse(JSON.parse(raw));
  } catch {
    throw new RegenerationJobStoreError(
      `Regeneration job file is malformed and requires recovery: ${path}`,
      'JOB_FILE_CORRUPT',
      true,
    );
  }
}

function assertTransitionAllowed(
  from: RegenerationJob['state'],
  to: TransitionRegenerationJobInput['to'],
): void {
  if (from === 'queued' && to === 'running') {
    return;
  }

  if (from === 'running' && (to === 'completed' || to === 'failed')) {
    return;
  }

  throw new RegenerationJobStoreError(
    `Invalid regeneration transition: ${from} -> ${to}. Allowed transitions are queued -> running -> completed|failed.`,
    'JOB_INVALID_TRANSITION',
    true,
  );
}

function createQueuedJob(
  jobId: string,
  target: RegenerationTargetRef,
  at: string,
): RegenerationJob {
  return regenerationJobSchema.parse({
    id: jobId,
    state: 'queued',
    target,
    createdAt: at,
    updatedAt: at,
  });
}

function transitionJob(
  current: RegenerationJob,
  to: TransitionRegenerationJobInput['to'],
  at: string,
  failure?: RegenerationFailure,
): RegenerationJob {
  assertTransitionAllowed(current.state, to);

  if (to === 'running') {
    return regenerationJobSchema.parse({
      id: current.id,
      state: 'running',
      target: current.target,
      createdAt: current.createdAt,
      updatedAt: at,
      startedAt: at,
    });
  }

  if (to === 'completed') {
    if (current.state !== 'running') {
      throw new RegenerationJobStoreError(
        `Cannot mark non-running job as completed: ${current.id}`,
        'JOB_INVALID_TRANSITION',
        true,
      );
    }

    return regenerationJobSchema.parse({
      id: current.id,
      state: 'completed',
      target: current.target,
      createdAt: current.createdAt,
      updatedAt: at,
      startedAt: current.startedAt,
      terminalAt: at,
    });
  }

  if (current.state !== 'running') {
    throw new RegenerationJobStoreError(
      `Cannot mark non-running job as failed: ${current.id}`,
      'JOB_INVALID_TRANSITION',
      true,
    );
  }

  const parsedFailure = regenerationFailureSchema.parse(
    failure ?? {
      code: 'REGENERATION_FAILED',
      reason: 'Regeneration failed without a specific reason.',
      remediation: 'Review logs and retry regenerate_docs for the same target.',
    },
  );

  return regenerationJobSchema.parse({
    id: current.id,
    state: 'failed',
    target: current.target,
    createdAt: current.createdAt,
    updatedAt: at,
    startedAt: current.startedAt,
    terminalAt: at,
    failure: parsedFailure,
  });
}

export function createRegenerationJobStore(
  options: CreateRegenerationJobStoreOptions = {},
): RegenerationJobStore {
  const now = options.now ?? (() => new Date());
  const terminalJobTtlMs = options.terminalJobTtlMs ?? DEFAULT_TERMINAL_JOB_TTL_MS;
  const baseDir = resolveRegenerationStoreDir(options.rootDir);
  mkdirSync(baseDir, { recursive: true });

  function loadRecord(jobId: string): PersistedRegenerationJob {
    const path = filePathForJob(baseDir, jobId);
    if (!existsSync(path)) {
      throw new RegenerationJobStoreError(
        `Regeneration job does not exist: ${jobId}`,
        'JOB_NOT_FOUND',
        true,
      );
    }

    return readJobFile(path);
  }

  function persistRecord(record: PersistedRegenerationJob): void {
    writeJobFile(filePathForJob(baseDir, record.job.id), record);
  }

  function cleanupExpiredJobs(): string[] {
    mkdirSync(baseDir, { recursive: true });
    const removed: string[] = [];

    for (const entry of readdirSync(baseDir)) {
      if (!entry.endsWith('.json')) {
        continue;
      }

      const path = join(baseDir, entry);
      const record = readJobFile(path);
      if (!record.expiresAt) {
        continue;
      }

      const expiresAtMs = Date.parse(record.expiresAt);
      if (!Number.isFinite(expiresAtMs)) {
        throw new RegenerationJobStoreError(
          `Regeneration job file has invalid expiration timestamp: ${path}`,
          'JOB_FILE_CORRUPT',
          true,
        );
      }

      if (expiresAtMs <= now().getTime()) {
        rmSync(path, { force: true });
        removed.push(record.job.id);
      }
    }

    return removed;
  }

  return {
    createJob(input: CreateRegenerationJobInput): RegenerationJob {
      cleanupExpiredJobs();
      const jobId = input.jobId.trim();
      const at = now().toISOString();
      const job = createQueuedJob(jobId, input.target, at);
      persistRecord({ job });
      return job;
    },

    transitionJob(input: TransitionRegenerationJobInput): RegenerationJob {
      cleanupExpiredJobs();
      const record = loadRecord(input.jobId);
      const at = now().toISOString();
      const nextJob = transitionJob(record.job, input.to, at, input.failure);

      const expiresAt =
        nextJob.state === 'completed' || nextJob.state === 'failed'
          ? new Date(Date.parse(nextJob.terminalAt) + terminalJobTtlMs).toISOString()
          : undefined;

      persistRecord({
        job: nextJob,
        expiresAt,
      });

      return nextJob;
    },

    getJob(jobId: string): RegenerationJob {
      cleanupExpiredJobs();
      const record = loadRecord(jobId);
      return record.job;
    },

    getActiveJobByTarget(targetKey: string): RegenerationJob | undefined {
      cleanupExpiredJobs();

      for (const entry of readdirSync(baseDir)) {
        if (!entry.endsWith('.json')) {
          continue;
        }

        const record = readJobFile(join(baseDir, entry));
        if (
          record.job.target.key === targetKey &&
          (record.job.state === 'queued' || record.job.state === 'running')
        ) {
          return record.job;
        }
      }

      return undefined;
    },

    cleanupExpiredJobs,
  };
}
