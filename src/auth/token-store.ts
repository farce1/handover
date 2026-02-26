import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pc from 'picocolors';
import type { StoredCredential } from './types.js';
import { logger } from '../utils/logger.js';

const CREDENTIALS_DIR = join(homedir(), '.handover');
const CREDENTIALS_PATH = join(CREDENTIALS_DIR, 'credentials.json');

function isValidCredential(value: unknown): value is StoredCredential {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredCredential>;

  if (typeof candidate.provider !== 'string' || candidate.provider.trim().length === 0) {
    return false;
  }

  if (typeof candidate.token !== 'string' || candidate.token.trim().length === 0) {
    return false;
  }

  if (candidate.expiresAt !== undefined && typeof candidate.expiresAt !== 'string') {
    return false;
  }

  return true;
}

export class TokenStore {
  async write(credential: StoredCredential): Promise<void> {
    await mkdir(CREDENTIALS_DIR, { recursive: true });
    await writeFile(CREDENTIALS_PATH, JSON.stringify(credential), 'utf-8');
    await chmod(CREDENTIALS_PATH, 0o600);
  }

  async read(): Promise<StoredCredential | null> {
    if (!existsSync(CREDENTIALS_PATH)) {
      return null;
    }

    try {
      const raw = await readFile(CREDENTIALS_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;

      if (!isValidCredential(parsed)) {
        throw new Error('Invalid credential payload');
      }

      return parsed;
    } catch {
      await this.delete();
      logger.warn(
        `Stored credentials are invalid and were removed. Re-authenticate with ${pc.cyan('handover auth login')}.`,
      );
      return null;
    }
  }

  async delete(): Promise<void> {
    try {
      await unlink(CREDENTIALS_PATH);
    } catch {
      // no-op when file does not exist
    }
  }
}
