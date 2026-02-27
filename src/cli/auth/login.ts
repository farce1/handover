import { log } from '@clack/prompts';
import { pkceLogin } from '../../auth/index.js';
import { TokenStore } from '../../auth/token-store.js';
import { HandoverError, handleCliError } from '../../utils/errors.js';

export async function runAuthLogin(provider: string): Promise<void> {
  try {
    if (provider !== 'openai') {
      log.error(`Subscription auth is only available for openai. Use an API key for ${provider}.`);
      throw new HandoverError(
        `Unsupported provider for subscription auth: ${provider}`,
        'Only openai currently supports subscription authentication',
        `Use handover auth login openai or configure API key auth for ${provider}`,
        'AUTH_PROVIDER_UNSUPPORTED',
      );
    }

    const store = new TokenStore();
    await pkceLogin(provider, store);
    log.success(`Successfully authenticated with ${provider}`);
  } catch (err) {
    handleCliError(err, `Failed to authenticate with ${provider}`);
  }
}
