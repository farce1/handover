import { Command } from 'commander';

export function createAuthCommand(): Command {
  const auth = new Command('auth').description('Manage authentication for LLM providers');

  auth
    .command('login <provider>')
    .description('Authenticate with a provider via browser OAuth')
    .action(async (provider: string) => {
      const { runAuthLogin } = await import('./login.js');
      await runAuthLogin(provider);
    });

  auth
    .command('status')
    .description('Show current authentication status')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const { runAuthStatus } = await import('./status.js');
      await runAuthStatus(opts);
    });

  return auth;
}

export const authCommand = createAuthCommand();
