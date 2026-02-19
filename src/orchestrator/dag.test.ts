import { describe, it, expect, vi } from 'vitest';
import { DAGOrchestrator } from './dag.js';
import { OrchestratorError } from '../utils/errors.js';
import type { StepDefinition } from './types.js';

// ─── Helper ─────────────────────────────────────────────────────────────────

function mkStep(
  id: string,
  deps: string[],
  executeFn?: () => Promise<unknown>,
  onSkip?: () => void,
): StepDefinition {
  return {
    id,
    name: id.toUpperCase(),
    deps,
    execute: executeFn ?? (async () => {}),
    ...(onSkip ? { onSkip } : {}),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DAGOrchestrator', () => {
  // ─── Step ordering ──────────────────────────────────────────────────────

  describe('step ordering', () => {
    it('single step with no deps completes successfully', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(mkStep('a', []));

      const results = await dag.execute();

      expect(results.get('a')?.status).toBe('completed');
    });

    it('linear A->B->C executes in order', async () => {
      const dag = new DAGOrchestrator();
      const log: string[] = [];

      dag.addStep(
        mkStep('a', [], async () => {
          log.push('a');
        }),
      );
      dag.addStep(
        mkStep('b', ['a'], async () => {
          log.push('b');
        }),
      );
      dag.addStep(
        mkStep('c', ['b'], async () => {
          log.push('c');
        }),
      );

      await dag.execute();

      expect(log).toEqual(['a', 'b', 'c']);
    });

    it('diamond A->B, A->C, B+C->D: A first, D last, all complete', async () => {
      const dag = new DAGOrchestrator();
      const log: string[] = [];

      dag.addStep(
        mkStep('a', [], async () => {
          log.push('a');
        }),
      );
      dag.addStep(
        mkStep('b', ['a'], async () => {
          log.push('b');
        }),
      );
      dag.addStep(
        mkStep('c', ['a'], async () => {
          log.push('c');
        }),
      );
      dag.addStep(
        mkStep('d', ['b', 'c'], async () => {
          log.push('d');
        }),
      );

      const results = await dag.execute();

      expect(log[0]).toBe('a');
      expect(log[log.length - 1]).toBe('d');
      expect(results.get('a')?.status).toBe('completed');
      expect(results.get('b')?.status).toBe('completed');
      expect(results.get('c')?.status).toBe('completed');
      expect(results.get('d')?.status).toBe('completed');
    });

    it('two independent steps (parallel roots) both complete', async () => {
      const dag = new DAGOrchestrator();

      dag.addStep(mkStep('a', []));
      dag.addStep(mkStep('b', []));

      const results = await dag.execute();

      expect(results.get('a')?.status).toBe('completed');
      expect(results.get('b')?.status).toBe('completed');
    });

    it('wide fan-out A->{B,C,D,E}: A first, all five complete', async () => {
      const dag = new DAGOrchestrator();
      const log: string[] = [];

      dag.addStep(
        mkStep('a', [], async () => {
          log.push('a');
        }),
      );
      dag.addStep(
        mkStep('b', ['a'], async () => {
          log.push('b');
        }),
      );
      dag.addStep(
        mkStep('c', ['a'], async () => {
          log.push('c');
        }),
      );
      dag.addStep(
        mkStep('d', ['a'], async () => {
          log.push('d');
        }),
      );
      dag.addStep(
        mkStep('e', ['a'], async () => {
          log.push('e');
        }),
      );

      const results = await dag.execute();

      expect(log[0]).toBe('a');
      expect(results.get('a')?.status).toBe('completed');
      expect(results.get('b')?.status).toBe('completed');
      expect(results.get('c')?.status).toBe('completed');
      expect(results.get('d')?.status).toBe('completed');
      expect(results.get('e')?.status).toBe('completed');
    });
  });

  // ─── Validation ─────────────────────────────────────────────────────────

  describe('validation', () => {
    it('cycle A->B->A throws OrchestratorError with code ORCHESTRATOR_CYCLE', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(mkStep('a', ['b']));
      dag.addStep(mkStep('b', ['a']));

      try {
        await dag.execute();
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(OrchestratorError);
        expect((e as OrchestratorError).code).toBe('ORCHESTRATOR_CYCLE');
      }
    });

    it('larger cycle A->B->C->A throws OrchestratorError with code ORCHESTRATOR_CYCLE', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(mkStep('a', ['c']));
      dag.addStep(mkStep('b', ['a']));
      dag.addStep(mkStep('c', ['b']));

      try {
        await dag.execute();
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(OrchestratorError);
        expect((e as OrchestratorError).code).toBe('ORCHESTRATOR_CYCLE');
      }
    });

    it('missing dependency reference throws OrchestratorError with code ORCHESTRATOR_MISSING_DEP', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(mkStep('b', ['nonexistent']));

      try {
        await dag.execute();
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(OrchestratorError);
        expect((e as OrchestratorError).code).toBe('ORCHESTRATOR_MISSING_DEP');
      }
    });

    it('duplicate step id throws synchronously with message containing the step id', () => {
      const dag = new DAGOrchestrator();
      dag.addStep(mkStep('a', []));

      expect(() => dag.addStep(mkStep('a', []))).toThrowError(/a/);
    });
  });

  // ─── Skip propagation ───────────────────────────────────────────────────

  describe('skip propagation', () => {
    it('direct failure: B fails, C (depends on B) is skipped', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(mkStep('a', []));
      dag.addStep(
        mkStep('b', ['a'], async () => {
          throw new Error('b failed');
        }),
      );
      dag.addStep(mkStep('c', ['b']));

      const results = await dag.execute();

      expect(results.get('b')?.status).toBe('failed');
      expect(results.get('c')?.status).toBe('skipped');
    });

    it('fan-out failure: A fails, B and C (both depend on A) are skipped', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(
        mkStep('a', [], async () => {
          throw new Error('a failed');
        }),
      );
      dag.addStep(mkStep('b', ['a']));
      dag.addStep(mkStep('c', ['a']));

      const results = await dag.execute();

      expect(results.get('b')?.status).toBe('skipped');
      expect(results.get('c')?.status).toBe('skipped');
    });

    it('transitive skip (3-step chain): A->B->C, A fails — B and C both skipped', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(
        mkStep('a', [], async () => {
          throw new Error('a failed');
        }),
      );
      dag.addStep(mkStep('b', ['a']));
      dag.addStep(mkStep('c', ['b']));

      const results = await dag.execute();

      expect(results.get('a')?.status).toBe('failed');
      expect(results.get('b')?.status).toBe('skipped');
      expect(results.get('c')?.status).toBe('skipped');
    });

    it('diamond failure: A->B, A->C, B+C->D, B fails — D is skipped even though C succeeds', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(mkStep('a', []));
      dag.addStep(
        mkStep('b', ['a'], async () => {
          throw new Error('b failed');
        }),
      );
      dag.addStep(mkStep('c', ['a']));
      dag.addStep(mkStep('d', ['b', 'c']));

      const results = await dag.execute();

      expect(results.get('b')?.status).toBe('failed');
      expect(results.get('c')?.status).toBe('completed');
      expect(results.get('d')?.status).toBe('skipped');
    });

    it('independent branch continues: A->B(fail), C->D(success) — D completes', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(mkStep('a', []));
      dag.addStep(
        mkStep('b', ['a'], async () => {
          throw new Error('b failed');
        }),
      );
      dag.addStep(mkStep('c', []));
      dag.addStep(mkStep('d', ['c']));

      const results = await dag.execute();

      expect(results.get('b')?.status).toBe('failed');
      expect(results.get('d')?.status).toBe('completed');
    });

    it('onSkip callback invoked when step is transitively skipped', async () => {
      const dag = new DAGOrchestrator();
      const onSkipC = vi.fn();

      dag.addStep(
        mkStep('a', [], async () => {
          throw new Error('a failed');
        }),
      );
      dag.addStep(mkStep('b', ['a']));
      dag.addStep(mkStep('c', ['b'], undefined, onSkipC));

      await dag.execute();

      expect(onSkipC).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Event hooks ────────────────────────────────────────────────────────

  describe('events', () => {
    it('onStepStart called for each step with correct (stepId, name) args', async () => {
      const onStepStart = vi.fn();
      const dag = new DAGOrchestrator({ onStepStart });

      dag.addStep(mkStep('a', []));
      dag.addStep(mkStep('b', ['a']));

      await dag.execute();

      expect(onStepStart).toHaveBeenCalledTimes(2);
      expect(onStepStart).toHaveBeenCalledWith('a', 'A');
      expect(onStepStart).toHaveBeenCalledWith('b', 'B');
    });

    it('onStepComplete called on success with result containing status: completed', async () => {
      const onStepComplete = vi.fn();
      const dag = new DAGOrchestrator({ onStepComplete });

      dag.addStep(mkStep('a', []));

      await dag.execute();

      expect(onStepComplete).toHaveBeenCalledTimes(1);
      const result = onStepComplete.mock.calls[0][0];
      expect(result.status).toBe('completed');
      expect(result.stepId).toBe('a');
    });

    it('onStepFail called on failure with result containing status: failed and error', async () => {
      const onStepFail = vi.fn();
      const dag = new DAGOrchestrator({ onStepFail });

      dag.addStep(
        mkStep('a', [], async () => {
          throw new Error('boom');
        }),
      );

      await dag.execute();

      expect(onStepFail).toHaveBeenCalledTimes(1);
      const result = onStepFail.mock.calls[0][0];
      expect(result.status).toBe('failed');
      expect(result.stepId).toBe('a');
      expect(result.error).toBeInstanceOf(Error);
    });
  });

  // ─── Step result data ───────────────────────────────────────────────────

  describe('results', () => {
    it('completed step has duration > 0 after async work', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(
        mkStep('a', [], async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 5));
        }),
      );

      const results = await dag.execute();

      const result = results.get('a');
      expect(typeof result?.duration).toBe('number');
      expect(result?.duration).toBeGreaterThan(0);
    });

    it('completed step captures returned data', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(mkStep('a', [], async () => ({ key: 'value' })));

      const results = await dag.execute();

      expect(results.get('a')?.data).toEqual({ key: 'value' });
    });

    it('skipped step has duration 0', async () => {
      const dag = new DAGOrchestrator();
      dag.addStep(
        mkStep('a', [], async () => {
          throw new Error('a failed');
        }),
      );
      dag.addStep(mkStep('b', ['a']));

      const results = await dag.execute();

      expect(results.get('b')?.duration).toBe(0);
    });
  });
});
