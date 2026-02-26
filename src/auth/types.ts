import pc from 'picocolors';
import { HandoverError } from '../utils/errors.js';

export type AuthSource = 'cli-flag' | 'env-var' | 'credential-store' | 'interactive-prompt';

export interface AuthResult {
  apiKey: string;
  source: AuthSource;
}

export interface StoredCredential {
  provider: string;
  token: string;
  expiresAt?: string;
}

export class AuthError extends HandoverError {
  constructor(message: string, reason: string, fix: string, code = 'AUTH_ERROR') {
    super(message, reason, fix, code);
    this.name = 'AuthError';
  }

  static noCredential(provider: string, envVarName: string): AuthError {
    return new AuthError(
      `No credentials configured for ${provider}`,
      `Could not find credentials for provider "${provider}" from CLI flags, environment variables, or credential store`,
      [
        'Use one of these options:',
        '',
        `1) Export API key: ${pc.cyan(`export ${envVarName}=your-api-key-here`)}`,
        `2) Login interactively: ${pc.cyan(`handover auth login ${provider}`)}`,
        `3) Run setup wizard: ${pc.cyan('handover init')}`,
      ].join('\n'),
      'AUTH_NO_CREDENTIAL',
    );
  }

  static sessionExpired(provider: string): AuthError {
    return new AuthError(
      `${provider} session expired`,
      'The stored authentication session is no longer valid or has expired',
      `Re-authenticate with: ${pc.cyan(`handover auth login ${provider}`)}`,
      'AUTH_SESSION_EXPIRED',
    );
  }
}
