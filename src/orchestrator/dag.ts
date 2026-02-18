import { OrchestratorError } from '../utils/errors.js';
import type { StepDefinition, StepResult, StepContext, DAGEvents } from './types.js';

/**
 * DAG orchestrator with reactive execution using Kahn's algorithm.
 * PIPE-01: Steps run as soon as their dependencies resolve.
 * PIPE-07: Failed steps skip dependents, independent branches continue.
 */
export class DAGOrchestrator {
  private steps = new Map<string, StepDefinition>();
  private events: DAGEvents;

  constructor(events: DAGEvents = {}) {
    this.events = events;
  }

  /**
   * Register a step in the DAG.
   */
  addStep(step: StepDefinition): void {
    if (this.steps.has(step.id)) {
      throw new Error(`Step "${step.id}" already registered`);
    }
    this.steps.set(step.id, step);
  }

  /**
   * Register multiple steps.
   */
  addSteps(steps: StepDefinition[]): void {
    for (const step of steps) {
      this.addStep(step);
    }
  }

  /**
   * Validate the DAG before execution.
   * Checks: all deps exist, no cycles (Kahn's algorithm).
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check all dependencies reference existing steps
    for (const [id, step] of this.steps) {
      for (const dep of step.deps) {
        if (!this.steps.has(dep)) {
          errors.push(`Step "${id}" depends on unknown step "${dep}"`);
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Cycle detection via Kahn's algorithm
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const [id, step] of this.steps) {
      inDegree.set(id, step.deps.length);
      for (const dep of step.deps) {
        const list = dependents.get(dep) ?? [];
        list.push(id);
        dependents.set(dep, list);
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    let processed = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      processed++;
      for (const dep of dependents.get(current) ?? []) {
        const newDegree = (inDegree.get(dep) ?? 0) - 1;
        inDegree.set(dep, newDegree);
        if (newDegree === 0) queue.push(dep);
      }
    }

    if (processed < this.steps.size) {
      // Find nodes still with non-zero in-degree (cycle participants)
      const cycleNodes: string[] = [];
      for (const [id, degree] of inDegree) {
        if (degree > 0) cycleNodes.push(id);
      }
      errors.push(`Cyclic dependency detected involving: ${cycleNodes.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Execute all steps respecting dependencies.
   * Independent steps run in parallel. Failed steps skip dependents.
   */
  async execute(config?: unknown): Promise<Map<string, StepResult>> {
    // Validate first
    const validation = this.validate();
    if (!validation.valid) {
      const cycleError = validation.errors.find((e) => e.includes('Cyclic'));
      if (cycleError) {
        throw OrchestratorError.cyclicDependency(validation.errors);
      }
      for (const err of validation.errors) {
        if (err.includes('unknown step')) {
          const match = err.match(/Step "(.+)" depends on unknown step "(.+)"/);
          if (match) {
            throw OrchestratorError.missingDependency(match[1], match[2]);
          }
        }
      }
      throw new OrchestratorError(
        'Invalid DAG',
        validation.errors.join('; '),
        'Fix the step dependencies',
      );
    }

    const results = new Map<string, StepResult>();
    const context: StepContext = { results, config };

    // Compute in-degrees
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const [id, step] of this.steps) {
      inDegree.set(id, step.deps.length);
      for (const dep of step.deps) {
        const list = dependents.get(dep) ?? [];
        list.push(id);
        dependents.set(dep, list);
      }
    }

    const running = new Map<string, Promise<void>>();

    const startStep = (step: StepDefinition): void => {
      this.events.onStepStart?.(step.id, step.name);

      const start = Date.now();
      const promise = step
        .execute(context)
        .then((data) => {
          const result: StepResult = {
            stepId: step.id,
            status: 'completed',
            duration: Date.now() - start,
            data,
          };
          results.set(step.id, result);
          running.delete(step.id);
          this.events.onStepComplete?.(result);
          checkDependents(step.id);
        })
        .catch((err) => {
          const result: StepResult = {
            stepId: step.id,
            status: 'failed',
            duration: Date.now() - start,
            error: err,
          };
          results.set(step.id, result);
          running.delete(step.id);
          this.events.onStepFail?.(result);
          skipDependents(step.id);
        });

      running.set(step.id, promise);
    };

    const checkDependents = (completedId: string): void => {
      for (const depId of dependents.get(completedId) ?? []) {
        const newDegree = (inDegree.get(depId) ?? 0) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0 && !results.has(depId)) {
          const depStep = this.steps.get(depId)!;

          // Check if any dependency failed
          const anyDepFailed = depStep.deps.some(
            (d) => results.get(d)?.status === 'failed' || results.get(d)?.status === 'skipped',
          );

          if (anyDepFailed) {
            skipStep(depId);
          } else {
            startStep(depStep);
          }
        }
      }
    };

    const skipStep = (stepId: string): void => {
      const step = this.steps.get(stepId)!;
      const result: StepResult = {
        stepId,
        status: 'skipped',
        duration: 0,
      };
      results.set(stepId, result);
      step.onSkip?.();
      skipDependents(stepId);
    };

    const skipDependents = (failedId: string): void => {
      for (const depId of dependents.get(failedId) ?? []) {
        const newDegree = (inDegree.get(depId) ?? 0) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0 && !results.has(depId)) {
          skipStep(depId);
        }
      }
    };

    // Start all steps with zero in-degree
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        startStep(this.steps.get(id)!);
      }
    }

    // Wait for all to complete
    while (running.size > 0) {
      await Promise.race(running.values());
    }

    return results;
  }
}
