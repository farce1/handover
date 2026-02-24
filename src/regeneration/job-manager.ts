import { randomUUID } from 'node:crypto';
import {
  regenerationStatusResponseSchema,
  regenerationTriggerResponseSchema,
  type RegenerationClientGuidance,
  type RegenerationFailure,
  type RegenerationJob,
  type RegenerationStatusResponse,
  type RegenerationTargetRef,
  type RegenerationTriggerResponse,
} from './schema.js';
import {
  createRegenerationJobStore,
  type RegenerationJobStore,
  type RegenerationJobStoreError,
} from './job-store.js';
import { normalizeRegenerationTarget, RegenerationTargetError } from './targets.js';

interface TriggerRegenerationInput {
  target?: string;
}

interface GetRegenerationStatusInput {
  jobId: string;
}

interface RegenerationRunnerInput {
  jobId: string;
  target: RegenerationTargetRef;
}

export interface RegenerationRunnerResult {
  outcome: 'completed';
  summary: string;
  steps: string[];
}

type RegenerationRunner = (input: RegenerationRunnerInput) => Promise<RegenerationRunnerResult>;

export interface RegenerationJobManager {
  trigger(input: TriggerRegenerationInput): RegenerationTriggerResponse;
  getStatus(input: GetRegenerationStatusInput): RegenerationStatusResponse;
}

export interface CreateRegenerationJobManagerOptions {
  store?: RegenerationJobStore;
  runner: RegenerationRunner;
}

function buildGuidance(job: RegenerationJob): RegenerationClientGuidance {
  if (job.state === 'queued' || job.state === 'running') {
    return {
      nextTool: 'regenerate_docs_status',
      message:
        'Poll regenerate_docs_status with this job ID until the job reaches a terminal state.',
      pollAfterMs: 750,
    };
  }

  if (job.state === 'completed') {
    return {
      nextTool: 'regenerate_docs',
      message: 'Regeneration completed. Trigger regenerate_docs again if you need a new run.',
    };
  }

  return {
    nextTool: 'regenerate_docs',
    message: 'Regeneration failed. Resolve remediation details and retry regenerate_docs.',
  };
}

function toFailurePayload(error: unknown): RegenerationFailure {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return {
      code: error.code,
      reason: error.message,
      remediation: 'Inspect regeneration logs, fix the root cause, and retry regenerate_docs.',
    };
  }

  if (error instanceof Error) {
    return {
      code: error.name || 'REGENERATION_EXECUTION_FAILED',
      reason: error.message,
      remediation: 'Inspect regeneration logs, fix the root cause, and retry regenerate_docs.',
    };
  }

  return {
    code: 'REGENERATION_EXECUTION_FAILED',
    reason: String(error),
    remediation: 'Inspect regeneration logs, fix the root cause, and retry regenerate_docs.',
  };
}

export function createRegenerationJobManager(
  options: CreateRegenerationJobManagerOptions,
): RegenerationJobManager {
  const store = options.store ?? createRegenerationJobStore();
  const activeJobsByTarget = new Map<string, string>();

  async function runJobLifecycle(jobId: string, target: RegenerationTargetRef): Promise<void> {
    try {
      store.transitionJob({
        jobId,
        to: 'running',
      });

      const execution = await options.runner({
        jobId,
        target,
      });
      if (execution.outcome !== 'completed') {
        throw new Error(`Unexpected regeneration runner outcome: ${String(execution.outcome)}`);
      }

      store.transitionJob({
        jobId,
        to: 'completed',
      });
    } catch (error) {
      const failure = toFailurePayload(error);
      try {
        store.transitionJob({
          jobId,
          to: 'failed',
          failure,
        });
      } catch {
        // Ignore terminal transition races; canonical terminal state already persisted.
      }
    } finally {
      if (activeJobsByTarget.get(target.key) === jobId) {
        activeJobsByTarget.delete(target.key);
      }
    }
  }

  function createJoinedResponse(job: RegenerationJob): RegenerationTriggerResponse {
    return regenerationTriggerResponseSchema.parse({
      ok: true,
      job,
      dedupe: {
        joined: true,
        key: job.target.key,
        reason: 'in_flight_target',
      },
      guidance: buildGuidance(job),
    });
  }

  return {
    trigger(input: TriggerRegenerationInput): RegenerationTriggerResponse {
      try {
        store.cleanupExpiredJobs();
        const normalizedTarget = normalizeRegenerationTarget(input.target);

        const activeJobId = activeJobsByTarget.get(normalizedTarget.key);
        if (activeJobId) {
          return createJoinedResponse(store.getJob(activeJobId));
        }

        const persistedActiveJob = store.getActiveJobByTarget(normalizedTarget.key);
        if (persistedActiveJob) {
          activeJobsByTarget.set(normalizedTarget.key, persistedActiveJob.id);
          return createJoinedResponse(persistedActiveJob);
        }

        const jobId = randomUUID();
        const queuedJob = store.createJob({
          jobId,
          target: normalizedTarget,
        });

        activeJobsByTarget.set(normalizedTarget.key, queuedJob.id);
        void runJobLifecycle(queuedJob.id, normalizedTarget);

        return regenerationTriggerResponseSchema.parse({
          ok: true,
          job: queuedJob,
          dedupe: {
            joined: false,
            key: normalizedTarget.key,
            reason: 'none',
          },
          guidance: buildGuidance(queuedJob),
        });
      } catch (error) {
        if (error instanceof RegenerationTargetError) {
          return error.response;
        }

        const failure = toFailurePayload(error);
        return regenerationTriggerResponseSchema.parse({
          ok: false,
          error: failure,
          guidance: {
            nextTool: 'regenerate_docs',
            message: 'Retry regenerate_docs after resolving the reported failure.',
          },
        });
      }
    },

    getStatus(input: GetRegenerationStatusInput): RegenerationStatusResponse {
      try {
        const job = store.getJob(input.jobId);
        return regenerationStatusResponseSchema.parse({
          ok: true,
          job,
          guidance: buildGuidance(job),
        });
      } catch (error) {
        const failure = toFailurePayload(error);

        return regenerationStatusResponseSchema.parse({
          ok: false,
          error: failure,
          guidance: {
            nextTool: 'regenerate_docs',
            message:
              'If this job ID is unknown or expired, trigger regenerate_docs to start a new job.',
          },
        });
      }
    },
  };
}

export type { RegenerationJobStoreError };
