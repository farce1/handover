import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HandoverError,
  ConfigError,
  ProviderError,
  OrchestratorError,
  handleCliError,
} from './errors.js';

// ─── HandoverError ───────────────────────────────────────────────────────────

describe('HandoverError', () => {
  it('sets message, reason, fix, and name', () => {
    const err = new HandoverError('msg', 'because', 'do this');
    expect(err.message).toBe('msg');
    expect(err.reason).toBe('because');
    expect(err.fix).toBe('do this');
    expect(err.name).toBe('HandoverError');
    expect(err instanceof Error).toBe(true);
  });

  it('format() includes message, reason, and fix text', () => {
    const err = new HandoverError('Something broke', 'Bad input', 'Fix the input');
    const formatted = err.format();
    expect(formatted).toContain('Something broke');
    expect(formatted).toContain('Bad input');
    expect(formatted).toContain('Fix the input');
  });

  it('format() includes code when code is provided', () => {
    const err = new HandoverError('msg', 'why', 'fix', 'ERR_CODE');
    const formatted = err.format();
    expect(formatted).toContain('ERR_CODE');
  });

  it('format() does not include Code line when code is omitted', () => {
    const err = new HandoverError('msg', 'why', 'fix');
    const formatted = err.format();
    expect(formatted).not.toContain('Code:');
  });
});

// ─── ConfigError ─────────────────────────────────────────────────────────────

describe('ConfigError', () => {
  it('fileNotFound() creates ConfigError with correct message and code', () => {
    const err = ConfigError.fileNotFound('/path/to/.handover.yml');
    expect(err).toBeInstanceOf(ConfigError);
    expect(err).toBeInstanceOf(HandoverError);
    expect(err.name).toBe('ConfigError');
    expect(err.message).toContain('/path/to/.handover.yml');
    expect(err.code).toBe('CONFIG_NOT_FOUND');
  });

  it('validationFailed() creates ConfigError with issue details', () => {
    const issues = [
      { path: 'provider', message: 'invalid value' },
      { path: 'output', message: 'required field' },
    ];
    const err = ConfigError.validationFailed(issues);
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.code).toBe('CONFIG_INVALID');
    expect(err.message).toBe('Invalid configuration');
    expect(err.reason).toContain('provider');
    expect(err.reason).toContain('invalid value');
  });

  it('invalidYaml() creates ConfigError with path and parse error', () => {
    const err = ConfigError.invalidYaml('.handover.yml', 'unexpected token');
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.code).toBe('CONFIG_PARSE_ERROR');
    expect(err.message).toContain('.handover.yml');
    expect(err.reason).toContain('unexpected token');
  });

  it('constructor defaults code to CONFIG_ERROR', () => {
    const err = new ConfigError('msg', 'reason', 'fix');
    expect(err.code).toBe('CONFIG_ERROR');
  });
});

// ─── ProviderError ───────────────────────────────────────────────────────────

describe('ProviderError', () => {
  it('missingApiKey() returns known env var for anthropic', () => {
    const err = ProviderError.missingApiKey('anthropic');
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('PROVIDER_NO_API_KEY');
    expect(err.message).toContain('ANTHROPIC_API_KEY');
  });

  it('missingApiKey() falls back to uppercase env var for unknown providers', () => {
    const err = ProviderError.missingApiKey('myprovider');
    expect(err.message).toContain('MYPROVIDER_API_KEY');
  });

  it('rateLimited() creates error with retry delay in seconds', () => {
    const err = ProviderError.rateLimited(5000);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('PROVIDER_RATE_LIMITED');
    expect(err.reason).toContain('5s');
  });

  it('timeout() creates error with timeout duration in seconds', () => {
    const err = ProviderError.timeout(30000);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('PROVIDER_TIMEOUT');
    expect(err.message).toContain('30s');
  });

  it('requestFailed() creates error with HTTP status and truncated body', () => {
    const err = ProviderError.requestFailed(429, 'Too many requests');
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('PROVIDER_REQUEST_FAILED');
    expect(err.message).toContain('429');
    expect(err.reason).toContain('Too many requests');
  });

  it('requestFailed() truncates body to 200 chars', () => {
    const longBody = 'x'.repeat(500);
    const err = ProviderError.requestFailed(500, longBody);
    expect(err.reason.length).toBeLessThanOrEqual(200);
  });

  it('constructor defaults code to PROVIDER_ERROR', () => {
    const err = new ProviderError('msg', 'reason', 'fix');
    expect(err.code).toBe('PROVIDER_ERROR');
  });
});

// ─── OrchestratorError ───────────────────────────────────────────────────────

describe('OrchestratorError', () => {
  it('cyclicDependency() creates error with cycle path', () => {
    const err = OrchestratorError.cyclicDependency(['a', 'b', 'c', 'a']);
    expect(err).toBeInstanceOf(OrchestratorError);
    expect(err.code).toBe('ORCHESTRATOR_CYCLE');
    expect(err.reason).toContain('a -> b -> c -> a');
  });

  it('missingDependency() creates error with step and missing dep names', () => {
    const err = OrchestratorError.missingDependency('stepB', 'stepA');
    expect(err).toBeInstanceOf(OrchestratorError);
    expect(err.code).toBe('ORCHESTRATOR_MISSING_DEP');
    expect(err.message).toContain('stepB');
    expect(err.message).toContain('stepA');
  });

  it('stepFailed() creates error with step id and underlying error message', () => {
    const cause = new Error('connection refused');
    const err = OrchestratorError.stepFailed('myStep', cause);
    expect(err).toBeInstanceOf(OrchestratorError);
    expect(err.code).toBe('ORCHESTRATOR_STEP_FAILED');
    expect(err.message).toContain('myStep');
    expect(err.reason).toBe('connection refused');
  });

  it('constructor defaults code to ORCHESTRATOR_ERROR', () => {
    const err = new OrchestratorError('msg', 'reason', 'fix');
    expect(err.code).toBe('ORCHESTRATOR_ERROR');
  });
});

// ─── handleCliError ──────────────────────────────────────────────────────────

describe('handleCliError()', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls process.exit(1) for HandoverError instances', () => {
    const err = new HandoverError('msg', 'reason', 'fix');
    expect(() => handleCliError(err)).not.toThrow();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('wraps plain Error in HandoverError before logging', () => {
    const err = new Error('plain error');
    expect(() => handleCliError(err)).not.toThrow();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('wraps non-Error values using String() conversion', () => {
    expect(() => handleCliError('some string error')).not.toThrow();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('uses provided context when wrapping unknown errors', () => {
    expect(() => handleCliError(new Error('boom'), 'loading config')).not.toThrow();
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
