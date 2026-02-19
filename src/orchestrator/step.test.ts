import { describe, expect, test } from 'vitest';
import { createStep } from './step.js';

describe('createStep()', () => {
  const validExecute = async () => undefined;

  describe('returns frozen object', () => {
    test('the returned step is frozen', () => {
      const step = createStep({
        id: 'test-step',
        name: 'Test Step',
        deps: [],
        execute: validExecute,
      });
      expect(Object.isFrozen(step)).toBe(true);
    });
  });

  describe('defensive copy of deps array', () => {
    test('mutating the original deps array does not affect the step deps', () => {
      const originalDeps = ['dep-a', 'dep-b'];
      const step = createStep({
        id: 'test-step',
        name: 'Test Step',
        deps: originalDeps,
        execute: validExecute,
      });
      originalDeps.push('dep-c');
      expect(step.deps).toEqual(['dep-a', 'dep-b']);
      expect(step.deps).toHaveLength(2);
    });
  });

  describe('preserves all fields', () => {
    test('id, name, deps, execute, and onSkip are all preserved', () => {
      const onSkip = () => {};
      const step = createStep({
        id: 'my-step',
        name: 'My Step',
        deps: ['other-step'],
        execute: validExecute,
        onSkip,
      });
      expect(step.id).toBe('my-step');
      expect(step.name).toBe('My Step');
      expect(step.deps).toEqual(['other-step']);
      expect(step.execute).toBe(validExecute);
      expect(step.onSkip).toBe(onSkip);
    });
  });

  describe('validation: invalid id throws', () => {
    test.each([
      { id: '', name: 'x', error: 'Step id is required' },
      { id: ' ', name: 'x', error: 'Step id is required' },
      { id: 'x', name: '', error: 'Step name is required' },
      { id: 'x', name: ' ', error: 'Step name is required' },
    ])('throws "$error" for id="$id", name="$name"', ({ id, name, error }) => {
      expect(() => createStep({ id, name, deps: [], execute: validExecute })).toThrow(error);
    });
  });

  describe('throws when deps is not an array', () => {
    test('throws "Step deps must be an array" for non-array deps', () => {
      expect(() =>
        createStep({
          id: 'step',
          name: 'Step',
          deps: 'not-array' as unknown as string[],
          execute: validExecute,
        }),
      ).toThrow('Step deps must be an array');
    });
  });

  describe('throws when execute is not a function', () => {
    test('throws "Step execute must be a function" for non-function execute', () => {
      expect(() =>
        createStep({
          id: 'step',
          name: 'Step',
          deps: [],
          execute: 'not-fn' as unknown as () => Promise<unknown>,
        }),
      ).toThrow('Step execute must be a function');
    });
  });

  describe('optional onSkip', () => {
    test('preserves onSkip when provided', () => {
      const onSkip = () => {};
      const step = createStep({
        id: 'step',
        name: 'Step',
        deps: [],
        execute: validExecute,
        onSkip,
      });
      expect(step.onSkip).toBe(onSkip);
    });

    test('onSkip is undefined when not provided', () => {
      const step = createStep({ id: 'step', name: 'Step', deps: [], execute: validExecute });
      expect(step.onSkip).toBeUndefined();
    });
  });
});
