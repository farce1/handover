import { HandoverError } from '../utils/errors.js';

export interface McpStructuredError {
  code: string;
  message: string;
  action: string;
}

export function createMcpStructuredError(error: unknown): McpStructuredError {
  if (error instanceof HandoverError) {
    return {
      code: error.code ?? 'MCP_SERVE_ERROR',
      message: error.message,
      action: error.fix,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'MCP_SERVE_ERROR',
      message: error.message,
      action: 'Review the error details and retry `handover serve`.',
    };
  }

  return {
    code: 'MCP_SERVE_ERROR',
    message: String(error),
    action: 'Review the error details and retry `handover serve`.',
  };
}
