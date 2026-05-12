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
import { DEFAULT_API_KEY_ENV } from '../config/defaults.js';
import { PROVIDER_PRESETS } from '../providers/presets.js';
import { TokenStore } from '../auth/token-store.js';

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

// ─── patchGitignore / computeUpgradeDiff added in Task 2 + Task 3 ───────────
