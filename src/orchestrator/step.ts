import type { StepDefinition } from './types.js';

/**
 * Create a validated step definition.
 */
export function createStep(def: StepDefinition): StepDefinition {
  if (!def.id || def.id.trim().length === 0) {
    throw new Error('Step id is required');
  }
  if (!def.name || def.name.trim().length === 0) {
    throw new Error('Step name is required');
  }
  if (!Array.isArray(def.deps)) {
    throw new Error('Step deps must be an array');
  }
  if (typeof def.execute !== 'function') {
    throw new Error('Step execute must be a function');
  }

  return Object.freeze({
    id: def.id,
    name: def.name,
    deps: [...def.deps],
    execute: def.execute,
    onSkip: def.onSkip,
  });
}
