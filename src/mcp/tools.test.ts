import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { RegenerationJobManager } from '../regeneration/job-manager.js';
import { createRegenerationToolHandlers } from './tools.js';

const ISO_TIME = '2026-03-01T00:00:00Z';
const TARGET = {
  key: 'my-project',
  requested: 'my-project',
  canonical: '.',
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
