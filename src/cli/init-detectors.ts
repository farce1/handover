/**
 * Init wizard detection + patching helpers.
 *
 * Per Phase 31 CONTEXT.md D-26: all new init logic lives here so that
 * src/cli/init.ts stays skim-readable. This module is INCLUDED in vitest
 * coverage (unlike init.ts and monorepo.ts which are integration-only).
 *
 * Trust boundary note: cwd / entries arguments are internal (passed from
 * runInit() which gets them from process.cwd()). They are NOT user-attacker
 * controlled — see threat model T-31-03 in 31-02-PLAN.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { DEFAULT_API_KEY_ENV } from '../config/defaults.js';
import { PROVIDER_PRESETS } from '../providers/presets.js';
import { TokenStore } from '../auth/token-store.js';
import { HandoverConfigSchema } from '../config/schema.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DetectedProvider {
  provider: string;
  source: 'env-var' | 'ollama-probe' | 'codex-subscription';
  costPerMillion: number;
}

export type UpgradeBucket = 'customized' | 'at-default' | 'missing' | 'unknown';

export interface UpgradeDiff {
  key: string;
  currentValue: unknown;
  defaultValue: unknown;
  action: UpgradeBucket;
}

// Codex subscription rank: planner-locked at 0.001 per CONTEXT.md D-02 +
// RESEARCH.md Open Question #1. Sits between Ollama (0) and metered providers
// (>= 0.28 for deepseek).
const CODEX_SUBSCRIPTION_RANK = 0.001;

// ─── detectProviders ────────────────────────────────────────────────────────

/**
 * Discover every provider for which credentials are available.
 *
 * Sources scanned:
 *  1. Environment variables from DEFAULT_API_KEY_ENV
 *  2. Codex subscription credential at ~/.handover/credentials.json
 *  3. Local Ollama HTTP probe at http://localhost:11434/v1/models (500 ms timeout)
 *
 * Results are sorted by costPerMillion ascending (cheapest first).
 * Per D-02 Ollama (cost = 0) wins outright; Codex subscription beats metered OpenAI.
 *
 * Never logs env-var values (T-31-01).
 */
export async function detectProviders(): Promise<DetectedProvider[]> {
  const detected: DetectedProvider[] = [];

  // 1. Env-var based providers
  for (const [provider, envVar] of Object.entries(DEFAULT_API_KEY_ENV)) {
    if (!envVar) continue; // Ollama has empty apiKeyEnv — handled by probe below
    if (process.env[envVar]) {
      // Boolean check ONLY — never read the value (T-31-01)
      const preset = PROVIDER_PRESETS[provider];
      const cost = preset?.isLocal
        ? 0
        : (preset?.pricing[preset.defaultModel]?.inputPerMillion ?? Infinity);
      detected.push({ provider, source: 'env-var', costPerMillion: cost });
    }
  }

  // 2. Codex subscription detection (D-05)
  //    Codex beats metered OpenAI — remove env-var openai entry if present.
  try {
    const store = new TokenStore();
    const cred = await store.read();
    if (cred && cred.provider === 'openai') {
      const idx = detected.findIndex((d) => d.provider === 'openai');
      if (idx >= 0) detected.splice(idx, 1);
      detected.push({
        provider: 'openai',
        source: 'codex-subscription',
        costPerMillion: CODEX_SUBSCRIPTION_RANK,
      });
    }
  } catch {
    // TokenStore handles its own corrupt-file cleanup; ignore here
  }

  // 3. Ollama probe (D-01 + Pitfall 5: validate response shape, not just 200 OK)
  try {
    const res = await fetch('http://localhost:11434/v1/models', {
      signal: AbortSignal.timeout(500),
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: unknown[] };
      if (Array.isArray(json.data)) {
        detected.push({
          provider: 'ollama',
          source: 'ollama-probe',
          costPerMillion: 0,
        });
      }
    }
  } catch {
    // Not reachable — not detected. Non-fatal.
  }

  return detected.sort((a, b) => a.costPerMillion - b.costPerMillion);
}

// ─── cheapestDetected ───────────────────────────────────────────────────────

/**
 * Return the cheapest detected provider's name, or null if none detected.
 * Per D-04: if zero detected providers, callers should fall back to 'anthropic'
 * default (the existing init.ts:34 behavior).
 */
export function cheapestDetected(providers: DetectedProvider[]): string | null {
  return providers[0]?.provider ?? null;
}

// ─── patchGitignore ─────────────────────────────────────────────────────────

const HANDOVER_MARKER = '# handover';
const HANDOVER_END_MARKER = '# end handover';
const NEGATION_WARNING =
  'Found user negation rule for .handover/* — leaving .gitignore unchanged. Add cache/telemetry entries manually if needed.';

/**
 * Idempotently patch .gitignore with handover-owned entries.
 *
 * Per CONTEXT.md D-09 through D-13:
 *  - Entries are written as a single marker-delimited block: `# handover` ... `# end handover`
 *  - Idempotent: marker presence short-circuits the write
 *  - Negation-safe: if any `!.handover*` line exists, do not modify the file
 *  - Non-fatal: filesystem errors do not throw (init UX must remain smooth)
 *  - Cross-platform: gitignore entries use forward-slash literals on all OSes
 *
 * Trust boundary: cwd is from process.cwd(), entries are internal constants.
 * Never expose this function to user-supplied input (T-31-03).
 */
export function patchGitignore(cwd: string, entries: string[]): void {
  const gitignorePath = join(cwd, '.gitignore');

  let content = '';
  try {
    content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  } catch {
    return; // Non-fatal: read failure → skip patching
  }

  const lines = content.split('\n').map((l) => l.trim());

  // Negation bailout (D-12 + Pitfall 2: any prefix '!.handover' counts)
  if (lines.some((l) => l.startsWith('!.handover'))) {
    console.warn(NEGATION_WARNING);
    return;
  }

  // Idempotent: marker present → already patched
  if (lines.includes(HANDOVER_MARKER)) {
    return;
  }

  // Filter entries already covered by a literal match (do NOT outsmart globs)
  const toAdd = entries.filter((e) => !lines.includes(e));
  if (toAdd.length === 0) {
    return;
  }

  // Build the marker-delimited block (D-11)
  const block = ['', HANDOVER_MARKER, ...toAdd, HANDOVER_END_MARKER, ''].join('\n');

  const needsLeadingNewline = content.length > 0 && !content.endsWith('\n');
  const newContent = content + (needsLeadingNewline ? '\n' : '') + block;

  try {
    // Ensure cwd exists — defensive for fresh memfs setups and rare
    // race conditions where cwd was removed between process.cwd() and now.
    if (!existsSync(cwd)) {
      mkdirSync(cwd, { recursive: true });
    }
    writeFileSync(gitignorePath, newContent, 'utf-8');
  } catch {
    // Non-fatal: write failure → log nothing (avoids noisy init in restricted FS)
  }
}

// ─── computeUpgradeDiff ─────────────────────────────────────────────────────

/**
 * Compare a user's existing .handover.yml against the current schema defaults
 * and produce a three-bucket diff (CONTEXT.md D-14 through D-19).
 *
 * Buckets:
 *   - 'customized': key present and differs from schema default → PRESERVE on upgrade
 *   - 'at-default': key present and matches schema default → no-op on upgrade
 *   - 'missing':    key absent from raw → ADD with current default
 *   - 'unknown':    key present in raw but not in schema → PRESERVE intact (D-19)
 *
 * Equality is JSON-string based (handles nested objects, arrays). The schema is
 * intentionally NOT used for parsing the raw YAML — Zod's default behavior
 * strips unknown keys, which would silently lose user customizations (Pitfall 4).
 *
 * Trust boundary T-31-02: yaml v2 `parse()` does not execute code or
 * prototype-pollute. We additionally guard the post-parse object shape.
 */
export function computeUpgradeDiff(existingYaml: string): UpgradeDiff[] {
  let raw: unknown;
  try {
    raw = parseYaml(existingYaml);
  } catch {
    return [];
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return [];
  }
  const rawObj = raw as Record<string, unknown>;

  // HandoverConfigSchema.parse({}) yields all .default() values for known keys.
  const schemaDefaults = HandoverConfigSchema.parse({}) as Record<string, unknown>;
  const knownKeys = Object.keys(schemaDefaults);
  const knownKeySet = new Set(knownKeys);

  const diffs: UpgradeDiff[] = [];

  for (const key of knownKeys) {
    if (!(key in rawObj)) {
      diffs.push({
        key,
        currentValue: undefined,
        defaultValue: schemaDefaults[key],
        action: 'missing',
      });
      continue;
    }
    const isCustomized = JSON.stringify(rawObj[key]) !== JSON.stringify(schemaDefaults[key]);
    diffs.push({
      key,
      currentValue: rawObj[key],
      defaultValue: schemaDefaults[key],
      action: isCustomized ? 'customized' : 'at-default',
    });
  }

  for (const key of Object.keys(rawObj)) {
    if (!knownKeySet.has(key)) {
      diffs.push({
        key,
        currentValue: rawObj[key],
        defaultValue: undefined,
        action: 'unknown',
      });
    }
  }

  return diffs;
}
