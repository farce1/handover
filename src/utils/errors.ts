import pc from 'picocolors';
import { logger } from './logger.js';

/**
 * Base error class with Rust-compiler-inspired formatting.
 * Every error tells you: what happened, why, and how to fix it.
 */
export class HandoverError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
    public readonly fix: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HandoverError';
  }

  /**
   * Format the error for terminal display.
   * Produces a three-part message: what/why/fix.
   */
  format(): string {
    const lines: string[] = [
      `${pc.red('✗')} ${pc.bold('Error:')} ${this.message}`,
      '',
      `  ${pc.yellow('Why:')} ${this.reason}`,
      `  ${pc.green('Fix:')} ${this.fix}`,
    ];

    if (this.code) {
      lines.push(`  ${pc.dim(`Code: ${this.code}`)}`);
    }

    return lines.join('\n');
  }
}

/**
 * Configuration errors — loading, validation, missing files.
 */
export class ConfigError extends HandoverError {
  constructor(message: string, reason: string, fix: string, code?: string) {
    super(message, reason, fix, code ?? 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }

  static fileNotFound(path: string): ConfigError {
    return new ConfigError(
      `Config file not found: ${path}`,
      'No .handover.yml exists in the current directory',
      `Run ${pc.cyan('handover init')} to create one, or run ${pc.cyan('handover generate')} without it (zero-config mode)`,
      'CONFIG_NOT_FOUND',
    );
  }

  static validationFailed(issues: Array<{ path: string; message: string }>): ConfigError {
    const issueList = issues
      .map((i) => `  ${pc.dim('•')} ${pc.cyan(i.path)}: ${i.message}`)
      .join('\n');

    return new ConfigError(
      'Invalid configuration',
      `The following config values are invalid:\n${issueList}`,
      `Fix the values in ${pc.cyan('.handover.yml')} or run ${pc.cyan('handover init')} to regenerate`,
      'CONFIG_INVALID',
    );
  }

  static invalidYaml(path: string, parseError: string): ConfigError {
    return new ConfigError(
      `Failed to parse ${path}`,
      `YAML syntax error: ${parseError}`,
      `Check the YAML syntax in ${pc.cyan(path)} — common issues: wrong indentation, unquoted special characters`,
      'CONFIG_PARSE_ERROR',
    );
  }
}

/**
 * LLM Provider errors — authentication, rate limits, timeouts.
 */
export class ProviderError extends HandoverError {
  constructor(message: string, reason: string, fix: string, code?: string) {
    super(message, reason, fix, code ?? 'PROVIDER_ERROR');
    this.name = 'ProviderError';
  }

  static missingApiKey(provider: string): ProviderError {
    const envVarMap: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      groq: 'GROQ_API_KEY',
      together: 'TOGETHER_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      'azure-openai': 'AZURE_OPENAI_API_KEY',
      custom: 'LLM_API_KEY',
    };

    const envVar = envVarMap[provider] ?? `${provider.toUpperCase()}_API_KEY`;

    return new ProviderError(
      `${envVar} not found in environment`,
      `The ${provider} provider requires an API key to send requests`,
      `Set it with:\n\n  ${pc.cyan(`export ${envVar}=your-api-key-here`)}\n\n  Get your key from the ${provider} dashboard`,
      'PROVIDER_NO_API_KEY',
    );
  }

  static rateLimited(retryAfterMs: number): ProviderError {
    const seconds = Math.ceil(retryAfterMs / 1000);
    return new ProviderError(
      'Rate limited by provider',
      `Too many requests — provider asked to wait ${seconds}s`,
      `Reduce concurrency in ${pc.cyan('.handover.yml')} (analysis.concurrency) or wait and retry`,
      'PROVIDER_RATE_LIMITED',
    );
  }

  static timeout(timeoutMs: number): ProviderError {
    return new ProviderError(
      `Request timed out after ${Math.ceil(timeoutMs / 1000)}s`,
      'The LLM provider did not respond within the timeout window',
      'Try again — if persistent, check provider status page or increase timeout',
      'PROVIDER_TIMEOUT',
    );
  }

  static requestFailed(status: number, body: string): ProviderError {
    return new ProviderError(
      `Provider returned HTTP ${status}`,
      body.slice(0, 200),
      'Check your API key and provider configuration',
      'PROVIDER_REQUEST_FAILED',
    );
  }
}

/**
 * Handle a CLI-level error by logging it and exiting the process.
 * Wraps unknown errors in HandoverError for consistent formatting.
 */
export function handleCliError(err: unknown, context?: string): never {
  const toLog = err instanceof HandoverError
    ? err
    : new HandoverError(
        err instanceof Error ? err.message : String(err),
        context ?? 'An unexpected error occurred',
        'Check the error above and try again',
      );
  logger.error(toLog);
  process.exit(1);
}

/**
 * DAG Orchestrator errors — cycles, step failures, invalid graphs.
 */
export class OrchestratorError extends HandoverError {
  constructor(message: string, reason: string, fix: string, code?: string) {
    super(message, reason, fix, code ?? 'ORCHESTRATOR_ERROR');
    this.name = 'OrchestratorError';
  }

  static cyclicDependency(cycle: string[]): OrchestratorError {
    const cyclePath = cycle.join(' -> ');
    return new OrchestratorError(
      'Cyclic dependency detected in pipeline',
      `Steps form a cycle: ${cyclePath}`,
      'Remove or reorder step dependencies to break the cycle',
      'ORCHESTRATOR_CYCLE',
    );
  }

  static missingDependency(stepId: string, missingDep: string): OrchestratorError {
    return new OrchestratorError(
      `Step "${stepId}" depends on unknown step "${missingDep}"`,
      `The dependency "${missingDep}" is not registered in the orchestrator`,
      `Register "${missingDep}" before "${stepId}", or remove the dependency`,
      'ORCHESTRATOR_MISSING_DEP',
    );
  }

  static stepFailed(stepId: string, error: Error): OrchestratorError {
    return new OrchestratorError(
      `Step "${stepId}" failed`,
      error.message,
      'Check the step implementation and its inputs',
      'ORCHESTRATOR_STEP_FAILED',
    );
  }
}
