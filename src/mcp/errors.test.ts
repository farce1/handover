import { describe, expect, test } from 'vitest';
import { HandoverError } from '../utils/errors.js';
import { createMcpStructuredError } from './errors.js';

describe('createMcpStructuredError', () => {
  test('maps HandoverError with explicit code to structured payload', () => {
    const input = new HandoverError(
      'MCP tool failed',
      'qa_stream_start payload was invalid',
      'Pass required fields and retry',
      'QA_STREAM_INVALID_INPUT',
    );

    const result = createMcpStructuredError(input);

    expect(result).toEqual({
      code: 'QA_STREAM_INVALID_INPUT',
      message: 'MCP tool failed',
      action: 'Pass required fields and retry',
    });
  });

  test('falls back to MCP_SERVE_ERROR when HandoverError has undefined code', () => {
    const input = new HandoverError(
      'Missing code should fall back',
      'Details',
      'Retry with valid MCP payload',
    );

    const result = createMcpStructuredError(input);

    expect(result.code).toBe('MCP_SERVE_ERROR');
    expect(result.message).toBe('Missing code should fall back');
    expect(result.action).toBe('Retry with valid MCP payload');
  });

  test('maps plain Error to MCP_SERVE_ERROR with retry action', () => {
    const result = createMcpStructuredError(new Error('network failure'));

    expect(result).toEqual({
      code: 'MCP_SERVE_ERROR',
      message: 'network failure',
      action: 'Review the error details and retry `handover serve`.',
    });
  });

  test('maps string input to MCP_SERVE_ERROR', () => {
    const result = createMcpStructuredError('something went wrong');

    expect(result).toEqual({
      code: 'MCP_SERVE_ERROR',
      message: 'something went wrong',
      action: 'Review the error details and retry `handover serve`.',
    });
  });

  test('maps non-Error primitives and nullish values through String()', () => {
    expect(createMcpStructuredError(42)).toEqual({
      code: 'MCP_SERVE_ERROR',
      message: '42',
      action: 'Review the error details and retry `handover serve`.',
    });
    expect(createMcpStructuredError(null)).toEqual({
      code: 'MCP_SERVE_ERROR',
      message: 'null',
      action: 'Review the error details and retry `handover serve`.',
    });
    expect(createMcpStructuredError(undefined)).toEqual({
      code: 'MCP_SERVE_ERROR',
      message: 'undefined',
      action: 'Review the error details and retry `handover serve`.',
    });
  });
});
