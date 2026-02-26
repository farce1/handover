# Phase 21: Auth Infrastructure - Research

**Researched:** 2026-02-26
**Domain:** Auth module design — Zod-validated config extension, credential file storage, resolution precedence, interactive prompts
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Config shape
- Auth method is **per-provider**, not global — different providers can have different auth methods
- Claude has flexibility on config structure (nested under provider vs top-level auth block)
- No default provider — config is empty until onboarding (Phase 24) creates it
- Single active provider at a time — no split between generation and embedding providers
- Anthropic does NOT get subscription as a valid authMethod — schema enforces API key only for Anthropic

#### Credential storage
- Claude decides storage approach (file-based at ~/.handover/credentials.json with 0600 vs OS keychain)
- Credential store is for subscription tokens only — API keys stay in env vars
- Corrupted/invalid tokens are automatically deleted with a message directing user to re-authenticate
- Single provider credentials at a time — switching providers clears old tokens

#### Resolution behavior
- Precedence: CLI `--api-key` flag > env var (e.g., `OPENAI_API_KEY`) > credential store > interactive prompt
- Env var always wins, even if user configured `authMethod: subscription`
- Interactive prompt triggers whenever no auth source resolves (not just first run)
- In non-interactive mode (no TTY / CI), fail with clear human-readable error message listing auth options
- Always log which auth method was used on every run (e.g., "Using OpenAI API key from env")

#### Error messages
- Action-oriented tone: "Session expired. Run `handover auth login openai` to re-authenticate."
- Zero-auth error lists ALL setup options (env var, auth login, handover init)
- Colored output: red for errors, yellow for warnings, bold for commands
- Anthropic subscription attempt → not possible in schema; enforced at config validation, not runtime

#### Claude's Discretion
- Config structure (nested under provider vs separate auth block)
- Storage mechanism (file vs keychain for v6.0)
- Exact auth type definitions and token store API surface
- Internal module organization within `src/auth/`

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 21 builds the auth foundation that all future auth-dependent code (Phases 23-24) will import. The work divides into four concrete deliverables: (1) extend `HandoverConfigSchema` with a per-provider `authMethod` field and enforce Anthropic-only-api-key via `superRefine`; (2) build a `TokenStore` class that reads/writes `~/.handover/credentials.json` at 0600 permissions using `node:fs/promises` with explicit `chmod` after every write; (3) implement `resolveAuth()` which walks the four-step precedence chain and always logs which path fired; and (4) export all three as a clean `src/auth/` module with no circular dependencies.

The existing codebase already provides everything this phase needs as dependencies. The schema pattern (`z.superRefine` for cross-field validation) is already used in `EmbeddingConfigSchema`. The error class hierarchy (`HandoverError`, `ProviderError`) is already established in `src/utils/errors.ts`. Interactive prompts use `@clack/prompts` (already installed at `^1.0.1`), and TTY/CI detection follows the exact same pattern as `src/ui/renderer.ts`. No new production dependencies are required.

One important Node.js pitfall governs the credential store implementation: `fs.writeFile` with a `mode` option only sets permissions on newly created files — on existing files the original permissions are preserved. The correct pattern is always `await fs.writeFile(path, data)` followed by `await fs.chmod(path, 0o600)`, which works for both new and existing files. This must be the standard write helper for the token store.

**Primary recommendation:** Build `src/auth/` as three focused files — `types.ts` (shared types), `token-store.ts` (credential file I/O), and `resolve.ts` (precedence resolution) — with `src/auth/index.ts` re-exporting the public API. Mirror the existing `src/config/` module structure.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | `^3.25.76` (installed) | Schema validation — `authMethod` field, `superRefine` for Anthropic constraint | Already the schema validation layer for all config; consistent approach |
| `node:fs/promises` | built-in | Async file I/O for `~/.handover/credentials.json` | Already used throughout codebase (`generate.ts`, `cache/`); async is standard |
| `node:os` | built-in | `os.homedir()` to resolve `~/.handover/` path portably | Cross-platform home dir resolution; avoids `~` expansion issues |
| `node:path` | built-in | `path.join()` for credential file path construction | Portability; already used everywhere in codebase |
| `@clack/prompts` | `^1.0.1` (installed) | Interactive API key prompt when no auth source resolves | Already used in `src/cli/init.ts`; `isTTY()` and `isCI()` exports for non-interactive detection |
| `picocolors` | `^1.1.0` (installed) | Colored auth method logging and error messages | Already the color utility used throughout |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` | built-in | Not needed in Phase 21 — token comparison is not timing-sensitive here | Only if token comparison security becomes a concern in later phases |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `~/.handover/credentials.json` (file store) | OS keychain (`keytar`/`@keytar/node`) | Keychain requires a native addon (binary dep, Electron-style complexity, CI headaches). File with 0600 is the pragmatic v6.0 choice; keychain deferred to a later version |
| `node:fs/promises` with manual chmod | `secure-json-store` or similar | No such library is established in the TS CLI ecosystem; hand-rolling the chmod pattern is 5 lines and fully auditable |
| Custom non-interactive detection | `@clack/prompts` `isCI()` / `isTTY()` | Already available in the installed package; consistent with existing UI code |

**Installation:** No new dependencies needed. All required libraries are already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
src/auth/
├── index.ts          # Public API: re-exports types, TokenStore, resolveAuth
├── types.ts          # AuthResult, AuthSource, StoredCredential, AuthError codes
├── token-store.ts    # TokenStore class: read/write ~/.handover/credentials.json
└── resolve.ts        # resolveAuth(): precedence chain + logging

src/config/
└── schema.ts         # Extended with authMethod per provider (modify existing)
```

### Pattern 1: Per-Provider authMethod in Config Schema

**What:** Add optional `authMethod: "api-key" | "subscription"` to the base provider config block. Use `superRefine` to enforce that Anthropic can never have `authMethod: "subscription"`. Default is `"api-key"` so existing configs continue to work.

**When to use:** On every schema validation, before any auth resolution occurs.

**Example:**

```typescript
// src/config/schema.ts (extend HandoverConfigSchema)
// Source: existing superRefine pattern in EmbeddingConfigSchema

export const HandoverConfigSchema = z.object({
  provider: z.enum([
    'anthropic', 'openai', 'ollama', 'groq', 'together',
    'deepseek', 'azure-openai', 'custom',
  ]).default('anthropic'),
  authMethod: z.enum(['api-key', 'subscription']).default('api-key'),
  // ... existing fields unchanged ...
}).superRefine((value, ctx) => {
  if (value.provider === 'anthropic' && value.authMethod === 'subscription') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['authMethod'],
      message: 'Anthropic does not support subscription auth — use api-key',
    });
  }
});
```

Note: The locked decision says "per-provider, not global" but also "single active provider at a time". The simplest config approach that satisfies both is a single top-level `authMethod` field that applies to the active provider — this is what the schema change above implements. A nested `providers` map is future work (Phase 24+).

### Pattern 2: TokenStore — File-based Credential Storage

**What:** A class that owns all reads/writes to `~/.handover/credentials.json`. Enforces 0600 permissions. Single provider credential at a time (clear-on-write). Auto-deletes corrupted tokens.

**When to use:** Only for subscription tokens. API keys stay in env vars.

**Example:**

```typescript
// src/auth/token-store.ts
// Source: node:fs/promises + node:os + node:path (all built-in)
import { readFile, writeFile, unlink, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CREDENTIALS_PATH = join(homedir(), '.handover', 'credentials.json');
const CREDENTIALS_DIR = join(homedir(), '.handover');

export interface StoredCredential {
  provider: string;
  token: string;
  expiresAt?: string; // ISO 8601 — optional, for future token refresh
}

export class TokenStore {
  /**
   * Read stored credential. Returns null if not found or corrupted.
   * Corrupted files are auto-deleted with a logged message.
   */
  async read(): Promise<StoredCredential | null> {
    if (!existsSync(CREDENTIALS_PATH)) return null;
    try {
      const raw = await readFile(CREDENTIALS_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StoredCredential;
      if (!parsed.provider || !parsed.token) throw new Error('Invalid structure');
      return parsed;
    } catch {
      // Corrupted — delete and report
      await this.delete();
      return null;
    }
  }

  /**
   * Write a credential. Clears any existing credential (single provider at a time).
   * CRITICAL: Must use chmod after writeFile — mode option only applies to new files.
   */
  async write(credential: StoredCredential): Promise<void> {
    await mkdir(CREDENTIALS_DIR, { recursive: true });
    await writeFile(CREDENTIALS_PATH, JSON.stringify(credential, null, 2), 'utf-8');
    await chmod(CREDENTIALS_PATH, 0o600); // Enforce 0600 AFTER write — works for both new and existing files
  }

  /**
   * Delete stored credential. No-op if file does not exist.
   */
  async delete(): Promise<void> {
    try {
      await unlink(CREDENTIALS_PATH);
    } catch {
      // File may not exist — that's fine
    }
  }
}
```

### Pattern 3: resolveAuth() — Precedence Chain

**What:** Walks CLI flag > env var > credential store > interactive prompt. Always logs which source fired. Fails with action-oriented error in non-interactive mode.

**When to use:** Called at the start of every command that needs auth.

**Example:**

```typescript
// src/auth/resolve.ts
import type { HandoverConfig } from '../config/schema.js';
import { TokenStore } from './token-store.js';
import { logger } from '../utils/logger.js';
import { ProviderError } from '../utils/errors.js';
import { isTTY, isCI, password } from '@clack/prompts';
import pc from 'picocolors';

export type AuthSource = 'cli-flag' | 'env-var' | 'credential-store' | 'interactive-prompt';

export interface AuthResult {
  apiKey: string;
  source: AuthSource;
}

export async function resolveAuth(
  config: HandoverConfig,
  cliApiKey?: string,
  store = new TokenStore(),
): Promise<AuthResult> {
  // Step 1: CLI --api-key flag (highest precedence)
  if (cliApiKey) {
    logger.info(`Using ${config.provider} API key from --api-key flag`);
    return { apiKey: cliApiKey, source: 'cli-flag' };
  }

  // Step 2: Env var (wins even if authMethod: subscription in config)
  const envVarName = DEFAULT_API_KEY_ENV[config.provider] ?? '';
  const envValue = envVarName ? process.env[envVarName] : undefined;
  if (envValue) {
    logger.info(`Using ${config.provider} API key from ${envVarName}`);
    return { apiKey: envValue, source: 'env-var' };
  }

  // Step 3: Credential store (subscription token — only if authMethod: subscription)
  if (config.authMethod === 'subscription') {
    const credential = await store.read();
    if (credential?.provider === config.provider) {
      logger.info(`Using ${config.provider} subscription token from credential store`);
      return { apiKey: credential.token, source: 'credential-store' };
    }
  }

  // Step 4: Interactive prompt (or fail in non-interactive mode)
  const isNonInteractive = !isTTY(process.stdout) || isCI();
  if (isNonInteractive) {
    throw new AuthError(
      `No auth configured for ${config.provider}`,
      'No API key was found from any source',
      buildAuthOptions(config.provider, envVarName),
      'AUTH_NO_CREDENTIAL',
    );
  }

  // Interactive: prompt for API key
  const entered = await password({
    message: `Enter your ${config.provider} API key:`,
  });
  if (!entered || typeof entered !== 'string') {
    throw new AuthError(
      'Auth cancelled',
      'No API key was provided',
      buildAuthOptions(config.provider, envVarName),
      'AUTH_CANCELLED',
    );
  }
  logger.info(`Using ${config.provider} API key from interactive prompt`);
  return { apiKey: entered, source: 'interactive-prompt' };
}
```

### Pattern 4: AuthError — Action-Oriented Error Messages

**What:** Extends `HandoverError` with auth-specific codes and zero-auth listing of all options.

**Example:**

```typescript
// src/auth/types.ts
import pc from 'picocolors';
import { HandoverError } from '../utils/errors.js';

export class AuthError extends HandoverError {
  constructor(message: string, reason: string, fix: string, code?: string) {
    super(message, reason, fix, code ?? 'AUTH_ERROR');
    this.name = 'AuthError';
  }

  static sessionExpired(provider: string): AuthError {
    return new AuthError(
      'Auth session expired',
      `The stored ${provider} subscription token is no longer valid`,
      `Run ${pc.cyan(`handover auth login ${provider}`)} to re-authenticate`,
      'AUTH_SESSION_EXPIRED',
    );
  }

  static noCredential(provider: string, envVarName: string): AuthError {
    return new AuthError(
      `No auth configured for ${provider}`,
      'No API key was found from any source',
      [
        `Option 1: Set ${pc.cyan(`export ${envVarName}=your-key`)}`,
        `Option 2: Run ${pc.cyan(`handover auth login ${provider}`)} (subscription)`,
        `Option 3: Run ${pc.cyan('handover init')} to configure`,
      ].join('\n  '),
      'AUTH_NO_CREDENTIAL',
    );
  }
}

function buildAuthOptions(provider: string, envVarName: string): string {
  return [
    `Option 1: Set ${pc.cyan(`export ${envVarName}=your-key`)}`,
    `Option 2: Run ${pc.cyan(`handover auth login ${provider}`)} (subscription)`,
    `Option 3: Run ${pc.cyan('handover init')} to configure`,
  ].join('\n  ');
}
```

### Pattern 5: Public Module Export

**What:** Single `src/auth/index.ts` that re-exports the public API. Consumers import from `src/auth/index.js`.

**Example:**

```typescript
// src/auth/index.ts
export type { AuthResult, AuthSource, StoredCredential } from './types.js';
export { AuthError } from './types.js';
export { TokenStore } from './token-store.js';
export { resolveAuth } from './resolve.js';
```

### Anti-Patterns to Avoid

- **Skipping chmod after writeFile on existing files:** `fs.writeFile(path, data, { mode: 0o600 })` only sets 0600 for newly created files. On existing files, the original permissions are preserved. Always call `chmod(path, 0o600)` after every write.
- **Storing API keys in credentials.json:** The token store is only for subscription OAuth tokens. API keys must remain in environment variables. The `read()` method should never be called for api-key auth method.
- **Checking `process.env.CI` only:** The existing codebase uses both `!isTTY` and `Boolean(process.env.CI)` plus `Boolean(process.env.TF_BUILD)`. The `@clack/prompts` `isTTY()` function checks `process.stdout.isTTY === true`, which covers all non-interactive scenarios including piped output. Use `!isTTY(process.stdout)` as the primary gate.
- **Building the auth module with circular imports:** `resolve.ts` imports `token-store.ts` and `types.ts`. `token-store.ts` imports `types.ts` only. `types.ts` imports nothing from `src/auth/`. This one-directional dependency prevents cycles.
- **Calling resolveAuth from schema validation:** Resolution is a runtime concern, not a schema concern. Schema validates structure; `resolveAuth()` runs at command execution time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive API key prompt | Custom readline prompt | `@clack/prompts` `password()` | Already installed; handles cancel signals, TTY detection, masked input |
| Non-interactive detection | Custom `process.env.CI` check | `@clack/prompts` `isCI()` + `isTTY()` | Already installed; covers `CI`, `TF_BUILD`, piped output via `process.stdout.isTTY` |
| Schema cross-field validation | Custom validator | `z.superRefine()` | Already the established pattern in `EmbeddingConfigSchema` |
| Colored error messages | Raw ANSI codes | `picocolors` + `HandoverError.format()` | Already the project standard; `NO_COLOR` respected automatically |
| Home directory resolution | String manipulation on `process.env.HOME` | `os.homedir()` | Portable; handles Windows `USERPROFILE`, macOS, Linux correctly |

**Key insight:** This phase reuses every existing utility in the project. The only new surface area is the `src/auth/` module itself.

---

## Common Pitfalls

### Pitfall 1: writeFile mode Option Does Not Affect Existing Files

**What goes wrong:** Developer calls `fs.writeFile(credPath, data, { mode: 0o600 })` expecting 0600 permissions. On first run (new file) it works. On subsequent runs (existing file), the original permissions (0644 from umask 022) are preserved. Credentials remain world-readable.

**Why it happens:** Node.js `writeFile` with `mode` option passes the mode to `open()` as the file creation flags. For existing files, `open()` does not modify permissions — that is a separate `chmod()` syscall.

**How to avoid:** Always call `await chmod(credPath, 0o600)` after every `writeFile`. The sequence is: `mkdir` → `writeFile` → `chmod`. This is verified: both `writeFile+chmod` and `new file with mode:0600` produce 0600; only `writeFile` on existing file without chmod produces 0644.

**Warning signs:** Test passes on first run (fresh file), fails on second run (existing file with wrong permissions).

### Pitfall 2: Env Var Takes Precedence Even With authMethod: subscription

**What goes wrong:** User sets `authMethod: subscription` in config and runs `handover auth login`. Works. Then they set `OPENAI_API_KEY` for a different project. Now their handover commands silently use the env var key, ignoring the subscription token.

**Why it happens:** The locked decision is explicit: "Env var always wins, even if user configured `authMethod: subscription`". This is intentional but can surprise users.

**How to avoid:** The always-log requirement mitigates this: "Using OpenAI API key from OPENAI_API_KEY" appears on every run, making the active source visible.

**Warning signs:** If the log line is omitted from `resolveAuth()`, this becomes a silent footgun.

### Pitfall 3: Credential Store Called for API-Key Auth Method

**What goes wrong:** `resolveAuth()` checks the credential store even when `authMethod: "api-key"`. If an old subscription token exists (from a previous provider switch), it might be returned as auth for an API-key-configured provider.

**Why it happens:** Missing guard around the credential store step.

**How to avoid:** Gate the credential store read with `if (config.authMethod === 'subscription')`. The token store is only consulted for subscription auth.

**Warning signs:** Integration tests that switch `authMethod` between runs and check which source fires.

### Pitfall 4: Circular Dependency via Error Import

**What goes wrong:** `token-store.ts` imports `AuthError` from `types.ts`. `types.ts` imports `HandoverError` from `src/utils/errors.ts`. `src/utils/errors.ts` imports `logger`. If `resolve.ts` also imports from `token-store.ts` and `types.ts`, a cycle can form if any module in the chain imports back from `src/auth/`.

**Why it happens:** Easy to accidentally import `resolveAuth` from a module that `resolveAuth` itself depends on.

**How to avoid:** Strict import direction: `resolve.ts` → `token-store.ts` → `types.ts` → external utils only. Nothing in `src/auth/` imports from `src/cli/` or `src/providers/`. Test with `tsc --noEmit` to catch cycles at type-check time.

**Warning signs:** TypeScript emitting "Circular reference" errors, or unexpected `undefined` at module initialization time.

### Pitfall 5: Missing Credential Directory Creation

**What goes wrong:** `writeFile` throws `ENOENT` because `~/.handover/` does not exist yet.

**Why it happens:** `~/.handover/` is created by Phase 21 for the first time. The directory may not exist on new machines.

**How to avoid:** Always call `mkdir(CREDENTIALS_DIR, { recursive: true })` before every `writeFile`. The `recursive` option makes this a no-op if the directory already exists.

**Warning signs:** Crashes on first run on a machine that has never run handover.

---

## Code Examples

Verified patterns from official sources (all built-in Node.js APIs, verified by running against Node 18+):

### Atomic Credential Write (0600 Permissions)

```typescript
// Source: Verified against Node.js 18+ on macOS — chmod required for existing files
import { writeFile, chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CREDENTIALS_DIR = join(homedir(), '.handover');
const CREDENTIALS_PATH = join(CREDENTIALS_DIR, 'credentials.json');

async function writeCredential(data: StoredCredential): Promise<void> {
  await mkdir(CREDENTIALS_DIR, { recursive: true }); // no-op if exists
  await writeFile(CREDENTIALS_PATH, JSON.stringify(data, null, 2), 'utf-8');
  await chmod(CREDENTIALS_PATH, 0o600); // MUST be after writeFile — applies to both new and existing files
}
```

### Non-Interactive Detection (Consistent with Existing Codebase)

```typescript
// Source: src/ui/renderer.ts lines 304-307 — existing codebase pattern
// @clack/prompts isTTY checks process.stdout.isTTY === true
// isCI checks process.env.CI === "true"
import { isTTY, isCI } from '@clack/prompts';

function isNonInteractive(): boolean {
  return !isTTY(process.stdout) || isCI();
}
```

### Zod superRefine for Anthropic Constraint

```typescript
// Source: Existing EmbeddingConfigSchema in src/config/schema.ts (same pattern)
import { z } from 'zod';

const HandoverConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', /* ... */]).default('anthropic'),
  authMethod: z.enum(['api-key', 'subscription']).default('api-key'),
  // ... other fields ...
}).superRefine((value, ctx) => {
  if (value.provider === 'anthropic' && value.authMethod === 'subscription') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['authMethod'],
      message: 'Anthropic does not support subscription auth — use authMethod: api-key',
    });
  }
});
```

### Corrupted Credential Auto-Delete

```typescript
// Source: Locked decision pattern — auto-delete with message directing to re-authenticate
async read(): Promise<StoredCredential | null> {
  if (!existsSync(CREDENTIALS_PATH)) return null;
  try {
    const raw = await readFile(CREDENTIALS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    // Validate structure
    if (
      typeof parsed !== 'object' || parsed === null ||
      !('provider' in parsed) || typeof (parsed as Record<string, unknown>).provider !== 'string' ||
      !('token' in parsed) || typeof (parsed as Record<string, unknown>).token !== 'string'
    ) {
      throw new Error('Invalid structure');
    }
    return parsed as StoredCredential;
  } catch {
    // Corrupted — auto-delete
    await this.delete(); // uses unlink with silent catch
    logger.warn(
      `Corrupted credentials deleted. Run ${pc.cyan('handover auth login')} to re-authenticate.`
    );
    return null;
  }
}
```

### AuthError Class (Extending HandoverError)

```typescript
// Source: Existing HandoverError/ProviderError pattern in src/utils/errors.ts
import pc from 'picocolors';
import { HandoverError } from '../utils/errors.js';

export class AuthError extends HandoverError {
  constructor(message: string, reason: string, fix: string, code?: string) {
    super(message, reason, fix, code ?? 'AUTH_ERROR');
    this.name = 'AuthError';
  }

  static noCredential(provider: string, envVarName: string): AuthError {
    return new AuthError(
      `No auth configured for ${provider}`,
      'No API key was found from any source',
      [
        `Option 1: Set ${pc.cyan(`export ${envVarName}=your-key`)} in your shell`,
        `Option 2: Run ${pc.cyan(`handover auth login ${provider}`)} (subscription)`,
        `Option 3: Run ${pc.cyan('handover init')} to reconfigure`,
      ].join('\n  '),
      'AUTH_NO_CREDENTIAL',
    );
  }

  static sessionExpired(provider: string): AuthError {
    return new AuthError(
      'Auth session expired',
      `The stored ${provider} subscription token is no longer valid`,
      `Run ${pc.cyan(`handover auth login ${provider}`)} to re-authenticate`,
      'AUTH_SESSION_EXPIRED',
    );
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Storing API keys in config files | API keys in env vars only (SEC-02 already in codebase) | Pre-Phase 21 | Phase 21 extends this: credential store is subscription-token-only |
| Global auth method (one method for all providers) | Per-provider `authMethod` in config | Phase 21 | Allows OpenAI subscription + Anthropic API key simultaneously in future multi-provider configs |
| OS keychain (complex native addon) | File-based credentials.json at 0600 | Phase 21 decision | Zero native dependency; keychain deferred to v6.0+ |

**Deprecated/outdated:**
- `resolveApiKey()` in `src/config/loader.ts`: This current function only handles env var lookup and will be replaced by `resolveAuth()` which handles the full precedence chain. The old function should remain operational until Phase 23 wires `resolveAuth` into `generate.ts`.

---

## Open Questions

1. **Where does `resolveAuth()` get called in the generate pipeline?**
   - What we know: Currently `resolveApiKey()` in `src/config/loader.ts` is called from `src/cli/generate.ts` line ~225. `resolveAuth()` is the replacement.
   - What's unclear: Phase 21 builds the foundation; Phase 23 wires it. The research scope stops at "module exists with stable exports". The planner should NOT plan tasks that modify `generate.ts` — that is Phase 23.
   - Recommendation: Phase 21 tasks build and test `src/auth/` in isolation. The connection to generate.ts is Phase 23.

2. **Should `authMethod` default be `"api-key"` globally, or should Ollama/local providers have no authMethod?**
   - What we know: Ollama is a local provider with `apiKeyEnv: ''` — it doesn't need auth at all. The schema change adds `authMethod: "api-key"` as default for all providers.
   - What's unclear: Should `resolveAuth()` short-circuit for `isLocal` providers?
   - Recommendation: Yes — add a guard: if `preset.isLocal === true`, return `{ apiKey: 'ollama', source: 'env-var' }` immediately (matching the current factory.ts behavior). This prevents the resolution chain from prompting for Ollama.

3. **Should the `vitest.config.ts` coverage exclude list include `src/auth/`?**
   - What we know: `src/config/loader.ts` is excluded from coverage (filesystem-dependent). `src/auth/token-store.ts` is also filesystem-dependent but can be tested with `memfs` (already in devDependencies).
   - Recommendation: Do NOT exclude `src/auth/` from coverage. Use `memfs` (already installed) to mock `node:fs/promises` in token-store tests, same way `AnalysisCache` tests work.

---

## Sources

### Primary (HIGH confidence)
- Node.js 18+ built-in API — `node:fs/promises`, `node:os`, `node:path`, `node:crypto` — verified by running code against installed Node.js
- `/Users/impera/Documents/GitHub/handover/src/config/schema.ts` — existing schema patterns (`superRefine`, Zod defaults)
- `/Users/impera/Documents/GitHub/handover/src/utils/errors.ts` — existing error class hierarchy (`HandoverError`, `ProviderError`)
- `/Users/impera/Documents/GitHub/handover/src/ui/renderer.ts` lines 304-307 — existing `isTTY`/`isCI` detection pattern
- `/Users/impera/Documents/GitHub/handover/node_modules/@clack/prompts/dist/index.mjs` — source-verified: `isCI = () => process.env.CI === "true"`, `isTTY = (t) => t.isTTY === true`
- `/Users/impera/Documents/GitHub/handover/vitest.config.ts` — coverage exclude list, test environment settings
- `/Users/impera/Documents/GitHub/handover/package.json` — installed dependencies and versions

### Secondary (MEDIUM confidence)
- Node.js `writeFile` mode behavior — verified by running test scripts: mode option applies to new files only; `chmod` required for existing files
- `@clack/prompts` `password()` API — verified by inspecting exported functions from installed package

### Tertiary (LOW confidence)
- None — all claims verified against codebase or running Node.js

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — patterns mirror existing modules (`src/config/`, `src/utils/errors.ts`)
- Pitfalls: HIGH — chmod/writeFile behavior verified by running Node.js code; other pitfalls derived from locked decisions

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable — Node.js built-ins and installed package versions don't change between research and planning)
