# Phase 24: Generate Integration & Onboarding - Research

**Researched:** 2026-02-27
**Domain:** Generate pipeline wiring for subscription auth, banner/cost display changes, subscription-specific error handling, first-run onboarding UX
**Confidence:** HIGH (all integration points verified directly in codebase; no new external libraries required)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Startup banner & run output
- Auth method displayed inline with provider: e.g. "Provider: openai (subscription)" or "Provider: anthropic (api-key)"
- Label only — no extra visual distinction (no icons, colors, or token expiry in banner)
- Per-round progress output is identical for subscription and API key runs
- Final summary shows token counts but replaces dollar cost for subscription runs

#### Error & rate-limit messaging
- Subscription 429 errors fail immediately with info: "Rate limited. Try again in Xm Ys." — no auto-wait, no interactive prompt
- Error formatting style is consistent across auth types — only message content differs

#### First-run onboarding flow
- Auto-detect existing env vars (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) and skip setup for providers with detected keys — no confirmation prompt needed
- Entry point, provider selection UX, and auth method presentation are Claude's discretion
- Whether onboarding auto-starts generate or confirms and waits is Claude's discretion

#### Cost & usage display
- Final summary: show token counts, replace dollar amount with subscription label (exact wording Claude's discretion)
- Per-round cost column treatment for subscription runs is Claude's discretion (dashes vs hide)
- Whether to surface remaining quota from rate-limit headers is Claude's discretion
- API key cost display may receive minor consistency improvements at Claude's discretion

### Claude's Discretion
- Missing-auth error format (single line vs box) — pick the clearest presentation
- Mid-generation token expiry handling — decide between silent refresh+continue vs abort based on technical safety
- Error prefix/label strategy — whether to prefix errors with auth type for disambiguation
- Subscription-specific error phrasing
- Entry point for onboarding (when and how to intercept in runGenerate)
- Provider selection UX and auth method presentation during onboarding
- Whether onboarding auto-starts generate or confirms and waits
- Exact wording for "subscription credits" label in summary
- Per-round cost column treatment for subscription (dashes vs hide)
- Whether to surface remaining quota from rate-limit headers

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 24 wires the subscription auth infrastructure (built in Phase 23) into `handover generate` and adds a first-run onboarding wizard. There are no new external libraries to install — every tool needed already exists in the codebase. The work is entirely internal wiring and UI changes.

The six concrete areas: (1) factory/generate wiring — subscription tokens already pass as `apiKey` into `OpenAICompatibleProvider`, and Phase 23 implemented the full resolve path; the factory just needs the `authResult.source` to be surfaced to the display layer; (2) banner changes — `DisplayState` needs an `authMethod` field that `renderBanner` uses to append "(subscription)" or "(api-key)"; (3) cost display changes — `isSubscription` flag on `DisplayState` controls whether dollar amounts are rendered or replaced with a label; (4) missing-subscription-auth error — `resolveAuth()` currently falls through to the generic `noCredential` error when subscription is configured but no stored token exists; it needs a specific branch that throws `AuthError.noCredential` with the correct `handover auth login openai` fix text; (5) subscription 429 error handling — the current `retryWithBackoff` auto-retries 429s; subscription 429s must instead fail immediately with a rate-limit window duration message extracted from the response headers; (6) first-run onboarding — a new module (`src/cli/onboarding.ts`) that detects "no usable provider" state and guides the user through provider + auth selection using `@clack/prompts`.

**Primary recommendation:** Treat this as six discrete tasks: DisplayState extension, banner component update, cost display update, auth error specialization, rate-limit error bypass, and onboarding wizard. All changes are surgical and contained in `src/ui/types.ts`, `src/ui/components.ts`, `src/ui/ci-renderer.ts`, `src/auth/resolve.ts`, `src/providers/openai-compat.ts`, `src/cli/generate.ts`, and a new `src/cli/onboarding.ts`.

---

## Standard Stack

### Core (already installed — no new deps needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@clack/prompts` | `^1.0.1` (installed) | `select()`, `group()`, `intro()`, `outro()`, `confirm()`, `log.*()` for onboarding wizard | Already the project's interactive UX library; `init.ts` uses it for provider selection |
| `openai` | `^6.22.0` (installed) | `OpenAI.RateLimitError` and `OpenAI.AuthenticationError` type checking; `.headers.get('retry-after')` | Already the provider SDK for OpenAI-compatible providers |
| `picocolors` | `^1.1.0` (installed) | Error and banner formatting | Already the project color standard |
| `openid-client` | `^6.8.2` (installed) | Token refresh for mid-generation 401 recovery (if chosen) | Already installed from Phase 23 |

### No New Dependencies

No external packages need to be installed for Phase 24. All capabilities required exist in the current `package.json`.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── ui/
│   ├── types.ts             # Add authMethod and isSubscription to DisplayState
│   ├── components.ts        # Update renderBanner and renderCompletionSummary for subscription
│   └── ci-renderer.ts       # Update onBanner and onComplete for subscription
├── auth/
│   └── resolve.ts           # Add subscription-specific branch before generic noCredential
├── providers/
│   └── openai-compat.ts     # Override isRetryable for subscription 429 (no auto-retry)
│                            # OR: detect subscription 429 in retryWithBackoff via new hook
└── cli/
    ├── generate.ts          # Pass authMethod to DisplayState; call onboarding if needed
    └── onboarding.ts        # NEW: first-run wizard using @clack/prompts
```

### Pattern 1: DisplayState Extension for Auth Method

**What:** Add `authMethod` and `isSubscription` to `DisplayState` so all rendering components can differentiate subscription from api-key without accessing config directly.

**When to use:** Set in `runGenerate()` after `loadConfig()`.

**Current `DisplayState` (src/ui/types.ts):**
```typescript
// Already has: isLocal, provider, model
// Missing: authMethod, isSubscription
```

**New fields to add:**
```typescript
// Source: verified src/ui/types.ts — extend DisplayState interface
/** Auth method in use: 'api-key' or 'subscription'. */
authMethod?: 'api-key' | 'subscription';
/** True when running with subscription auth (controls cost display). */
isSubscription?: boolean;
```

**Wiring in generate.ts:**
```typescript
// Source: verified src/cli/generate.ts lines 129-149 (displayState initialization)
const displayState: DisplayState = {
  // ... existing fields ...
  authMethod: config.authMethod,
  isSubscription: config.authMethod === 'subscription',
};
```

### Pattern 2: Banner Component Update

**What:** Append auth method in parentheses to provider/model string in the banner.

**Current `renderBanner` (src/ui/components.ts, lines 27-37):**
```typescript
export function renderBanner(state: DisplayState): string[] {
  const sep = pc.dim(' \u00B7 ');
  const arrow = pc.cyan(SYMBOLS.arrow);
  const name = pc.bold('handover');
  const providerModel = `${state.provider}/${state.model}`;
  // ...
  return [`${arrow} ${name}${sep}${providerModel}${sep}${files}${sep}${lang}${localBadge}`];
}
```

**Updated pattern:**
```typescript
// Source: verified src/ui/components.ts
export function renderBanner(state: DisplayState): string[] {
  const sep = pc.dim(' \u00B7 ');
  const arrow = pc.cyan(SYMBOLS.arrow);
  const name = pc.bold('handover');
  // Auth method label appended in parentheses per locked decision
  const authLabel = state.authMethod ? ` (${state.authMethod})` : '';
  const providerModel = `${state.provider}/${state.model}${authLabel}`;
  const files = `${state.fileCount} files`;
  const lang = state.language;
  const localBadge = state.isLocal ? `${sep}${pc.green(pc.bold('LOCAL'))}` : '';
  return [`${arrow} ${name}${sep}${providerModel}${sep}${files}${sep}${lang}${localBadge}`];
}
```

**CI renderer banner (src/ui/ci-renderer.ts, `onBanner`):**
```typescript
// Source: verified src/ui/ci-renderer.ts onBanner method
onBanner(state: DisplayState): void {
  const authLabel = state.authMethod ? ` (${state.authMethod})` : '';
  console.log(
    `${this.timestamp()} handover \u00B7 ${state.provider}/${state.model}${authLabel} \u00B7 ${state.fileCount} files \u00B7 ${state.language}`,
  );
}
```

### Pattern 3: Cost Display for Subscription Runs

**What:** In subscription mode, replace dollar amounts with a label instead of showing `$0.00` or computed costs that don't reflect real spend.

**Context:** The `TokenUsageTracker` computes costs using `MODEL_COSTS` pricing table (src/context/tracker.ts). For subscription runs, these computed costs are meaningless dollar figures — the user pays through their subscription credits, not per-token. The tracker still computes a number (it doesn't know about auth method), so we suppress it at the display layer.

**Three display sites to update:**

1. **`renderCompletionSummary` (src/ui/components.ts, lines 339-393):**
```typescript
// Source: verified src/ui/components.ts
// Current: if (!state.isLocal) { parts.push(pc.yellow(formatCost(state.totalCost))); }
// New:
if (!state.isLocal && !state.isSubscription) {
  parts.push(pc.yellow(formatCost(state.totalCost)));
} else if (state.isSubscription) {
  parts.push(pc.dim('subscription credits'));  // exact wording: Claude's discretion
}
```

2. **`renderRoundBlock` (src/ui/components.ts, lines 176-291):**
```typescript
// Source: verified src/ui/components.ts
// For "done" round status (line 210):
// Current: if (!isLocal && rd.cost !== undefined) { parts.push(pc.yellow(formatCost(rd.cost))); }
// New (per-round cost column: Claude's discretion — recommend hiding for subscription):
if (!isLocal && !isSubscription && rd.cost !== undefined) {
  parts.push(pc.yellow(formatCost(rd.cost)));
}
// Running total line (line 281):
// Current: if (!isLocal && totalCost > 0) { lines.push(`  ${pc.yellow(formatCost(totalCost))} total`); }
// New: also gate on !isSubscription
```

3. **`CIRenderer.onComplete` (src/ui/ci-renderer.ts, lines 125-143):**
```typescript
// Source: verified src/ui/ci-renderer.ts
// Current: if (!state.isLocal) { parts.push(formatCost(state.totalCost)); }
// New:
if (!state.isLocal && !state.isSubscription) {
  parts.push(formatCost(state.totalCost));
} else if (state.isSubscription) {
  parts.push('subscription credits');
}
```

**Note:** `renderRoundBlock` takes `isLocal` as a parameter. Add `isSubscription?: boolean` parameter to this function signature to avoid touching DisplayState from the component.

### Pattern 4: Missing Subscription Auth Error (GEN-04)

**What:** When `authMethod: subscription` is configured but no stored token exists, throw a specific error directing the user to `handover auth login openai`, not the generic api-key-focused `noCredential` error.

**Current flow in `resolveAuth` (src/auth/resolve.ts, lines 136-147):**
```typescript
if (config.authMethod === 'subscription') {
  const credential = await tokenStore.read();
  if (credential && credential.provider === config.provider) {
    const refreshed = await refreshIfNeeded(credential, tokenStore);
    // ...returns refreshed token
  }
  // FALLS THROUGH to generic noCredential — wrong for subscription
}
if (!isTTY(process.stdout) || isCI()) {
  throw AuthError.noCredential(config.provider, envVarName);
}
// ...interactive password prompt — wrong for subscription
```

**Fix — add an early throw for subscription with no stored credential:**
```typescript
// Source: verified src/auth/resolve.ts — add after the subscription credential check block
if (config.authMethod === 'subscription') {
  const credential = await tokenStore.read();
  if (credential && credential.provider === config.provider) {
    const refreshed = await refreshIfNeeded(credential, tokenStore);
    logSource(config.provider, 'credential-store', 'using stored subscription token');
    return { apiKey: refreshed.token, source: 'credential-store' };
  }
  // No stored token: specific error (GEN-04)
  throw new AuthError(
    `Not authenticated with ${config.provider} subscription`,
    `No stored subscription token found for provider "${config.provider}"`,
    `Run handover auth login ${config.provider} to authenticate`,
    'AUTH_SUBSCRIPTION_NOT_LOGGED_IN',
  );
}
```

**Why not reuse `AuthError.noCredential`:** That static factory hard-codes api-key-focused fix text ("Export API key:"). GEN-04 requires the fix text to reference `handover auth login openai` exclusively.

### Pattern 5: Subscription 429 — Fail Immediately with Window Duration

**What:** When `authMethod: subscription`, a 429 response must NOT trigger the existing retry loop (which waits 30s/60s/120s). Instead, fail immediately with a "Rate limited. Try again in Xm Ys." message, using the `retry-after` header value from the response.

**Context:**
- The OpenAI SDK's `RateLimitError` has `.headers: Headers` (standard Web API Headers object with `.get(name): string | null`).
- The `retry-after` header from OpenAI contains seconds as a float string (e.g., `"18247"` for ~5 hours).
- The `x-ratelimit-reset-requests` header may contain a timestamp (less reliable).
- Current `isRetryable` in `OpenAICompatibleProvider` returns `true` for `OpenAI.RateLimitError`.
- Current `retryWithBackoff` uses delays of 30s/60s/120s — far too short for 5-hour subscription windows.

**Two approaches:**

**Approach A (recommended): Pass subscription mode to the provider, override `isRetryable`**

The `OpenAICompatibleProvider` constructor already has all config information. Add a `isSubscription` flag and override `isRetryable` to return `false` for 429 when in subscription mode, then throw a descriptive `ProviderError` with the window duration:

```typescript
// Source: verified src/providers/openai-compat.ts and src/providers/base-provider.ts
// In OpenAICompatibleProvider, modify doComplete to wrap the error:
protected isRetryable(err: unknown): boolean {
  if (this.isSubscription && err instanceof OpenAI.RateLimitError) {
    return false;  // Subscription 429s fail immediately
  }
  if (err instanceof OpenAI.RateLimitError) return true;
  // ...existing logic
}
```

But `isRetryable` returns `bool` — we also need to transform the error into a `ProviderError` with the duration message. The cleanest place is to throw the specialized error in `doComplete` before `retryWithBackoff` sees it, or override the error in `complete()`.

**Approach B: Catch 429 in the round execution and re-throw**

This is more surgical: catch `OpenAI.RateLimitError` in the provider's `doComplete` method when `isSubscription=true`, extract the retry-after header, and immediately throw a `ProviderError` with the formatted duration — bypassing `retryWithBackoff` entirely.

```typescript
// Source: verified src/providers/openai-compat.ts — add to doComplete
// At the top of doComplete (or in the catch block):
try {
  // ... existing completion logic
} catch (err) {
  if (this.isSubscription && err instanceof OpenAI.RateLimitError) {
    const retryAfterSecs = parseFloat(err.headers?.get('retry-after') ?? '0');
    const durationStr = formatRateLimitDuration(retryAfterSecs);
    throw new ProviderError(
      `Rate limited`,
      `Subscription rate limit reached`,
      `Try again in ${durationStr}`,
      'PROVIDER_SUBSCRIPTION_RATE_LIMITED',
    );
  }
  throw err;
}
```

**Duration formatting helper:**
```typescript
function formatRateLimitDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'a moment';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}
```

**Recommendation:** Use Approach B (catch in `doComplete`). It's minimal, keeps `isRetryable` simple, and gives us full control over the error message before `retryWithBackoff` sees it. The `ProviderError` thrown from `doComplete` is not retryable (no `isRetryable` override needed — `ProviderError` is not retried by default).

**`isSubscription` plumbing to provider:** The `OpenAICompatibleProvider` constructor takes `preset, apiKey, model, concurrency, baseUrl`. Add `isSubscription?: boolean` as a 6th parameter, passed from `createProvider()` in `factory.ts`.

### Pattern 6: Mid-Generation 401 Handling

**What:** If the subscription token expires while a round is mid-execution, OpenAI SDK throws `OpenAI.AuthenticationError` (HTTP 401). This is currently not retryable (`isRetryable` doesn't match), so `retryWithBackoff` re-throws it. The error then propagates up through `handleCliError`.

**Technical safety analysis:**
- Proactive refresh in `resolveAuth()` runs with a 5-minute buffer before generation begins.
- If token has >5 min remaining at generation start, mid-generation expiry is possible only for long-running 6-round pipelines where rounds 5/6 take >5 min.
- OpenAI refresh tokens are single-use (rotate on each refresh). A mid-generation refresh during concurrent round execution could cause token rotation conflicts if two rounds both see expiry.
- Subscription concurrency is already enforced to 1 (Phase 23), so concurrent refresh conflicts cannot occur.
- Despite concurrency=1, attempting a silent refresh mid-generation requires passing a refresh callback into the provider — this is architectural complexity with no existing hook.

**Recommendation: Abort with clear error message.** The proactive 5-minute refresh buffer handles the normal case. If a 401 occurs anyway (e.g., token was revoked, not just expired), the correct response is to abort with `AuthError.sessionExpired(provider)` guidance. This is cleaner and safer than a refresh callback.

**Implementation:**
- Override `isRetryable` in `OpenAICompatibleProvider` to detect 401 AuthenticationError and throw `AuthError.sessionExpired()` instead of letting it propagate as a generic error:

```typescript
// Source: verified src/providers/openai-compat.ts
// In doComplete catch block, when isSubscription:
if (this.isSubscription && err instanceof OpenAI.AuthenticationError) {
  throw AuthError.sessionExpired(this.preset.name);
}
```

**The resulting error message** from `AuthError.sessionExpired`:
```
✗ Error: openai session expired
  Why: The stored authentication session is no longer valid or has expired
  Fix: Re-authenticate with: handover auth login openai
```
This meets the requirement for clear guidance without complex infrastructure.

### Pattern 7: First-Run Onboarding Wizard

**What:** When `handover generate` is run with no usable provider configured, instead of prompting for an API key password or failing with a generic error, show a guided provider + auth setup flow.

**Trigger condition (Claude's discretion recommendation):**
A first-run state exists when ALL of these are true:
1. No `.handover.yml` exists in the current directory (no explicit config)
2. None of the major provider env vars are set: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`
3. The terminal is a TTY (not CI — no interactive prompts in CI)

This is checked at the top of `runGenerate()` before `loadConfig()` and the pipeline start.

**Why before loadConfig:** If no config and no env vars, `loadConfig()` returns defaults (`anthropic`, `api-key`) and then `resolveAuth()` would prompt for a password. The onboarding should intercept this before any pipeline logic runs.

**New module: `src/cli/onboarding.ts`**

```typescript
// Source: verified @clack/prompts API and init.ts patterns
import * as p from '@clack/prompts';
import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { stringify as stringifyYaml } from 'yaml';
import pc from 'picocolors';
import { DEFAULT_API_KEY_ENV } from '../config/defaults.js';
import { pkceLogin } from '../auth/index.js';
import { TokenStore } from '../auth/token-store.js';

/** Returns true if the user has no usable provider configured. */
export function isFirstRun(): boolean {
  if (existsSync('.handover.yml')) return false;
  const envVars = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'];
  return !envVars.some((v) => process.env[v]?.trim());
}

/** Onboarding wizard: guides user through provider and auth selection. */
export async function runOnboarding(): Promise<boolean> {
  p.intro(pc.bgCyan(pc.black(' handover setup ')));
  p.log.info('No provider configured. Let\'s set one up.');

  const providerChoice = await p.select({
    message: 'Which LLM provider do you want to use?',
    options: [
      { value: 'anthropic', label: 'Anthropic (Claude)', hint: 'API key required' },
      { value: 'openai', label: 'OpenAI (GPT-4o)', hint: 'API key' },
      { value: 'openai-subscription', label: 'OpenAI Codex subscription', hint: 'Browser login' },
      { value: 'gemini', label: 'Google Gemini', hint: 'API key' },
      { value: 'ollama', label: 'Ollama', hint: 'Local — no API key' },
    ],
  });

  if (p.isCancel(providerChoice)) {
    p.cancel('Setup cancelled.');
    return false;
  }

  // ... handle each choice, write .handover.yml, run auth login if subscription
  // ... return true to continue with generate, false to abort
}
```

**Provider-specific branches:**
- `anthropic`: Write `.handover.yml` with `provider: anthropic`. Direct user to set `ANTHROPIC_API_KEY` and exit (no interactive key entry in onboarding — let resolveAuth handle it on next run, or accept current env).
- `openai` (api-key): Write `.handover.yml` with `provider: openai`. Direct user to set `OPENAI_API_KEY`.
- `openai-subscription`: Write `.handover.yml` with `provider: openai, authMethod: subscription`. Run `pkceLogin('openai', new TokenStore())` inline. On success, confirm and auto-continue generate.
- `gemini`: Write `.handover.yml` with `provider: gemini`. Direct user to set `GEMINI_API_KEY`.
- `ollama`: Write `.handover.yml` with `provider: ollama`. No auth needed. Auto-continue.

**Auto-continue vs confirm (Claude's discretion recommendation):** For subscription (which just completed login) and ollama (no auth needed), auto-continue generate immediately. For api-key providers that need env vars set, show a note with the env var export command and exit (user must set the env var and re-run — can't continue without the key).

**Wiring in generate.ts:**
```typescript
// Source: verified src/cli/generate.ts structure — add near top of runGenerate
import { isFirstRun, runOnboarding } from './onboarding.js';

export async function runGenerate(options: GenerateOptions): Promise<void> {
  // First-run detection: before any pipeline logic
  if (isTTY(process.stdout) && !isCI() && isFirstRun()) {
    const shouldContinue = await runOnboarding();
    if (!shouldContinue) return;
    // On success: either the env var is set (ollama) or credentials are stored (subscription)
    // Continue into normal generate flow
  }

  const renderer = createRenderer();
  // ... rest of existing runGenerate
}
```

**Note on `@clack/prompts` `isCI` import:** `isCI` is exported from `@clack/prompts` (verified in `/node_modules/@clack/prompts/dist/index.d.mts`). The `isTTY` function is also available. Both are already used in `src/auth/resolve.ts`.

### Anti-Patterns to Avoid

- **Showing `$0.00` for subscription runs:** The `TokenUsageTracker` still computes a dollar cost even for subscription (it uses model pricing tables and doesn't know about auth method). Always gate on `isSubscription` at the display layer — never let `formatCost(0)` or `formatCost(computed)` appear for subscription runs.
- **Reusing `AuthError.noCredential` for subscription:** Its fix text references exporting an env var, which is wrong for subscription. Create a dedicated error or inline the error with the correct `handover auth login` fix text.
- **Auto-retrying subscription 429 with the existing backoff:** The 5-hour rate windows make 30s/60s/120s backoff pointless. The retry loop MUST be bypassed — either by throwing a non-retryable error before `retryWithBackoff` processes it, or by returning `false` from `isRetryable` when subscription + 429.
- **Checking `isSubscription` in the `retryWithBackoff` utility:** The rate limiter utility doesn't know about auth method and shouldn't. Keep subscription-aware logic in the provider layer.
- **Blocking the onboarding check in CI:** CI has no TTY. Guard with `!isCI()` to avoid hanging in automated pipelines. The existing `isTTY` + `isCI` pattern from `@clack/prompts` is the correct check.
- **Writing `.handover.yml` without validation:** Use `HandoverConfigSchema.parse()` before writing, exactly as `runInit` does. This prevents creating invalid config files.
- **Calling `pkceLogin` in the onboarding without a spinner:** PKCE login opens a browser and waits. Use `@clack/prompts` `spinner()` during the wait, exactly as `pkce-login.ts` already does.
- **Missing `src: 'credential-store'` in `AuthResult`:** When subscription auth resolves via stored token, the `AuthResult.source` is `'credential-store'`. This source is currently not surfaced to `DisplayState`. Adding `authMethod` to `DisplayState` is sufficient for display; do not overload `AuthResult.source` for this purpose.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive provider selection | Custom readline prompts | `@clack/prompts` `select()` | Already installed, used in `runInit`; handles cancel, styling, hints |
| Rate-limit duration formatting | Custom duration string | Small helper function (<10 lines) using `Math.floor` | Simple enough to inline; no library needed |
| Config file writing in onboarding | Custom YAML serialization | `yaml` `stringify()` + existing `HandoverConfigSchema.parse()` pattern | Already used in `runInit` — copy the exact pattern |
| Browser OAuth in onboarding | Custom PKCE flow | `pkceLogin()` from `src/auth/pkce-login.ts` | Already implemented and tested in Phase 23 |
| Subscription 429 detection | Status code string matching | `err instanceof OpenAI.RateLimitError` | Type-safe; handles SDK error hierarchy correctly |
| `retry-after` header parsing | Custom header parsing | `err.headers?.get('retry-after')` on `OpenAI.RateLimitError` | The `RateLimitError` `.headers` is a standard `Headers` object with `.get()` |

**Key insight:** Phase 24 has zero new infrastructure. Every building block — interactive prompts, OAuth, token store, error classes, rate limiter, config schema — already exists and is tested. This phase is pure wiring.

---

## Common Pitfalls

### Pitfall 1: Subscription Auth Method Not Reaching DisplayState

**What goes wrong:** `authMethod` is in `HandoverConfig` and accessible at the top of `runGenerate`, but it's never set on `DisplayState`. Banner shows `openai/gpt-4o` without "(subscription)".

**Why it happens:** `displayState` is initialized with `provider` and `model` but has no `authMethod` field — the type doesn't include it yet, and the generate flow doesn't set it.

**How to avoid:** Add `authMethod?: 'api-key' | 'subscription'` and `isSubscription?: boolean` to the `DisplayState` interface in `src/ui/types.ts`. Set both in `runGenerate()` when initializing `displayState` (lines ~129-149). Both component functions (`renderBanner`, `renderCompletionSummary`, `renderRoundBlock`) need to check `isSubscription`.

**Warning signs:** Banner tests pass with static strings but don't include auth method; subscription summary shows $0.00 instead of "subscription credits".

### Pitfall 2: `renderRoundBlock` Signature Change Breaks Callers

**What goes wrong:** `renderRoundBlock` currently takes `(rounds, totalCost, costWarningThreshold, spinnerFrame, isLocal, streamVisible)`. Adding `isSubscription` as a 7th parameter breaks `TerminalRenderer.buildRoundLines()` which calls it.

**Why it happens:** `renderRoundBlock` is a pure component function that takes explicit parameters — not `DisplayState` directly.

**How to avoid:** Add `isSubscription?: boolean` as an optional 7th parameter. Update `TerminalRenderer.buildRoundLines()` to pass `state.isSubscription`. Since it's optional and defaults to `undefined` (falsy), the cost display logic `if (!isLocal && !isSubscription && ...)` works correctly without requiring callers to opt in.

**Warning signs:** TypeScript error "Expected 6 arguments, but got 7" if TerminalRenderer is not updated.

### Pitfall 3: Subscription 429 Still Retries Due to `isRetryable` Ordering

**What goes wrong:** If the subscription 429 error is thrown as a `ProviderError` inside `doComplete`, `retryWithBackoff` sees it. But `isRetryable` checks `err instanceof OpenAI.RateLimitError` first — if the error was already re-thrown as `ProviderError`, this check fails and `isRetryable` returns `false`. Good. But if the catch-and-rethrow happens after `retryWithBackoff` has already wrapped the call, the retry logic may have already incremented attempt count.

**Why it happens:** `BaseProvider.complete()` calls `retryWithBackoff(() => this.doComplete(...))`. If `doComplete` throws early (before the OpenAI API is called), `retryWithBackoff` receives the `ProviderError` directly and checks `isRetryable(ProviderError)`. Since `ProviderError` is not `OpenAI.RateLimitError`, `isRetryable` returns `false` → no retry. Correct behavior.

**How to avoid:** Ensure the subscription 429 catch-and-rethrow happens INSIDE `doComplete`, not at the `complete()` level. The `ProviderError` thrown by the subscription 429 handler is non-retryable by default — confirmed correct.

**Warning signs:** In tests, a mocked 429 from subscription still triggers `onRetry` callback.

### Pitfall 4: Missing Token Stored After Onboarding Subscription Login

**What goes wrong:** Onboarding runs `pkceLogin('openai', store)`, user authenticates in browser, tokens are stored. But `resolveAuth()` is called AFTER onboarding in the normal generate flow. If the config isn't written to disk (`provider: openai, authMethod: subscription`), `loadConfig()` still returns defaults (`anthropic`, `api-key`) and `resolveAuth()` never checks the credential store.

**Why it happens:** Onboarding writes `.handover.yml` but the `config` variable in `runGenerate` was captured before onboarding ran (if config is loaded before the onboarding check).

**How to avoid:** Call `isFirstRun()` before `loadConfig()` — which is before `const config = loadConfig(cliOverrides)` at line 112 of `generate.ts`. If onboarding runs and writes `.handover.yml`, the subsequent `loadConfig()` will read it. Sequence:
```
1. isFirstRun() check (before loadConfig)
2. runOnboarding() -> writes .handover.yml + stores tokens
3. loadConfig() -> reads new .handover.yml (provider: openai, authMethod: subscription)
4. resolveAuth() -> finds stored token -> returns credential
5. Normal generate pipeline starts
```

**Warning signs:** After onboarding, generate fails with "AUTH_SUBSCRIPTION_NOT_LOGGED_IN" despite successful browser login.

### Pitfall 5: `retry-after` Header Absent or Non-Numeric

**What goes wrong:** Subscription 429 response doesn't include `retry-after` header, or the value is an HTTP-date string instead of seconds. Duration formatting shows "Try again in 0s" or NaN.

**Why it happens:** `retry-after` can be either a decimal number of seconds (most OpenAI responses) or an HTTP-date format. The `parseFloat` of a date string returns `NaN`.

**How to avoid:**
```typescript
function parseRetryAfterSeconds(err: OpenAI.RateLimitError): number | null {
  const rawMs = err.headers?.get('retry-after-ms');
  if (rawMs) {
    const ms = parseFloat(rawMs);
    if (Number.isFinite(ms) && ms > 0) return ms / 1000;
  }
  const raw = err.headers?.get('retry-after');
  if (!raw) return null;
  const secs = parseFloat(raw);
  if (Number.isFinite(secs) && secs > 0) return secs;
  // HTTP-date format
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, (date - Date.now()) / 1000);
  return null;
}
```

**Warning signs:** Formatted duration shows "0s" or "NaN" in the error message.

### Pitfall 6: Onboarding Runs in Non-TTY Mode

**What goes wrong:** `handover generate` is run in CI with no provider configured. `isFirstRun()` returns true. Onboarding tries to call `p.select()` in non-TTY mode → clack/prompts throws or hangs.

**Why it happens:** `isFirstRun()` only checks file and env var state, not TTY state.

**How to avoid:** Guard in `runGenerate` with both `isTTY(process.stdout)` AND `!isCI()` before calling `runOnboarding()`:
```typescript
import { isCI, isTTY } from '@clack/prompts';
if (!isCI() && isTTY(process.stdout) && isFirstRun()) {
  // ... onboarding
}
```

**Warning signs:** CI tests hang or throw "Error reading input" when ANTHROPIC_API_KEY is not set.

---

## Code Examples

Verified patterns from codebase sources:

### Passing `isSubscription` to Provider Constructor
```typescript
// Source: verified src/providers/factory.ts createProvider() and src/providers/openai-compat.ts
// In factory.ts, pass isSubscription to provider:
case 'openai-compat':
  return new OpenAICompatibleProvider(
    preset, apiKey, model, concurrency, config.baseUrl, isSubscription
  );

// In OpenAICompatibleProvider constructor:
constructor(
  preset: ProviderPreset,
  apiKey: string,
  model: string,
  concurrency: number,
  baseUrl?: string,
  isSubscription?: boolean,  // new optional param
) {
  super(model, concurrency);
  this.isSubscription = isSubscription ?? false;
  // ... existing setup
}
```

### Subscription 429 Handler in `doComplete`
```typescript
// Source: verified src/providers/openai-compat.ts doComplete pattern + OpenAI SDK error types
import OpenAI from 'openai';
import { ProviderError } from '../utils/errors.js';

// Inside doComplete catch block:
} catch (err) {
  if (this.isSubscription && err instanceof OpenAI.RateLimitError) {
    const secs = parseRetryAfterSeconds(err);
    const duration = secs != null ? formatRateLimitDuration(secs) : 'a moment';
    throw new ProviderError(
      'Rate limited',
      'Subscription rate limit reached',
      `Try again in ${duration}`,
      'PROVIDER_SUBSCRIPTION_RATE_LIMITED',
    );
  }
  if (this.isSubscription && err instanceof OpenAI.AuthenticationError) {
    throw AuthError.sessionExpired(this.preset.name);
  }
  throw err;
}
```

### First-Run Detection
```typescript
// Source: verified src/cli/generate.ts structure (loadConfig at line 112)
//         and src/config/loader.ts existsSync check
import { existsSync } from 'node:fs';
import { isCI, isTTY } from '@clack/prompts';

export function isFirstRun(): boolean {
  // Has explicit config file -> not first run
  if (existsSync('.handover.yml')) return false;
  // Has any recognized provider env var -> not first run
  const envVars = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GROQ_API_KEY',
    'DEEPSEEK_API_KEY',
  ];
  return !envVars.some((v) => process.env[v]?.trim());
}
```

### Subscription-Specific AuthError
```typescript
// Source: verified src/auth/types.ts AuthError class pattern
// Add as a new static factory on AuthError, or inline in resolve.ts:
import pc from 'picocolors';

// In resolve.ts, after subscription credential check fails:
throw new AuthError(
  `Not authenticated with ${config.provider} (subscription)`,
  `No stored subscription token found for provider "${config.provider}"`,
  `Run \`${pc.cyan(`handover auth login ${config.provider}`)}\` to authenticate`,
  'AUTH_SUBSCRIPTION_NOT_LOGGED_IN',
);
```

### Onboarding Wizard Skeleton
```typescript
// Source: verified src/cli/init.ts patterns + @clack/prompts API
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { writeFileSync } from 'node:fs';
import { stringify as stringifyYaml } from 'yaml';
import { HandoverConfigSchema } from '../config/schema.js';
import { pkceLogin } from '../auth/index.js';
import { TokenStore } from '../auth/token-store.js';

export async function runOnboarding(): Promise<boolean> {
  p.intro(pc.bgCyan(pc.black(' handover setup ')));

  const choice = await p.select({
    message: 'No provider configured. Which do you want to use?',
    options: [
      { value: 'anthropic', label: 'Anthropic', hint: 'Requires ANTHROPIC_API_KEY' },
      { value: 'openai', label: 'OpenAI', hint: 'Requires OPENAI_API_KEY' },
      { value: 'openai-subscription', label: 'OpenAI Codex subscription', hint: 'Browser login' },
      { value: 'gemini', label: 'Google Gemini', hint: 'Requires GEMINI_API_KEY' },
      { value: 'ollama', label: 'Ollama (local)', hint: 'No API key needed' },
    ],
  });

  if (p.isCancel(choice)) {
    p.cancel('Setup cancelled. Run handover generate again after configuring a provider.');
    return false;
  }

  const provider = choice === 'openai-subscription' ? 'openai' : (choice as string);
  const authMethod = choice === 'openai-subscription' ? 'subscription' : 'api-key';
  const configObj: Record<string, unknown> = { provider };
  if (authMethod === 'subscription') configObj.authMethod = authMethod;

  // Write .handover.yml
  HandoverConfigSchema.parse(configObj);  // validate before writing
  const yamlContent = `# handover configuration\n# Generated by first-run setup\n\n${stringifyYaml(configObj)}`;
  writeFileSync('.handover.yml', yamlContent, 'utf-8');
  p.log.success(`Created .handover.yml (provider: ${provider}${authMethod === 'subscription' ? ', authMethod: subscription' : ''})`);

  if (choice === 'openai-subscription') {
    // Run browser login
    await pkceLogin('openai', new TokenStore());
    p.log.success('Authenticated with OpenAI Codex subscription');
    // Auto-continue generate
    return true;
  }

  if (provider === 'ollama') {
    // Ollama needs no auth
    return true;
  }

  // API key providers: show env var and exit (user must set key and re-run)
  const envVar = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' }[provider] ?? 'LLM_API_KEY';
  p.note(
    `Run: export ${envVar}=your-api-key-here\nThen run: handover generate`,
    'Set your API key'
  );
  p.outro('Setup complete. Set your API key and run handover generate again.');
  return false;  // Don't continue generate — key not set yet
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 23 delivered subscription tokens but didn't wire them into generate display | Phase 24 adds authMethod to DisplayState and updates all display components | Phase 24 | Banner and cost display become subscription-aware |
| Generic `AUTH_NO_CREDENTIAL` error for all auth failures | Subscription-specific error with `handover auth login` fix text | Phase 24 | GEN-04 met: clear, actionable error for subscription users |
| Auto-retry all 429s with 30s/60s/120s backoff | Subscription 429s fail immediately with rate-limit window duration | Phase 24 | GEN-05 met: subscription 429 feels like "come back later", not a retry loop |
| No onboarding: `resolveAuth` prompts for password or fails | First-run detection routes to wizard before pipeline starts | Phase 24 | ONB-01/02/03 met: guided setup instead of cryptic errors |

**Not deprecated — still current:**
- `TokenUsageTracker.getTotalCost()` — still computed for api-key users; suppressed at display layer for subscription
- `retryWithBackoff` — unchanged; subscription 429 is thrown as `ProviderError` before retry logic engages
- `AuthError.noCredential` — unchanged; still used for api-key providers without env vars

---

## Open Questions

1. **What model does OpenAI Codex subscription expose via the API?**
   - What we know: The `openai` preset defaults to `gpt-4o` (presets.ts line 72). Codex subscription uses OpenAI's API at `https://api.openai.com/v1` — the same base URL.
   - What's unclear: Whether Codex subscription tokens restrict which models are accessible. If subscription tokens only work with specific models (e.g., `gpt-4.1` or `o3-mini`), the default `gpt-4o` may or may not be accessible.
   - Recommendation: Leave `gpt-4o` as the default for now. If users get 403 errors on the model, they can override via `config.model`. Flag this for validation testing.
   - Confidence: LOW — needs runtime verification with actual Codex subscription.

2. **What does the `retry-after` header look like in actual Codex subscription 429 responses?**
   - What we know: The OpenAI SDK parses `retry-after` and `retry-after-ms` headers internally for its own retry logic. The `RateLimitError.headers` object has `.get()`.
   - What's unclear: Whether Codex subscription 429s include a `retry-after` header with the specific rate-limit window duration (the "5-hour windows" mentioned in decisions). The header may be absent or may contain a small value unrelated to the subscription window.
   - Recommendation: Implement `parseRetryAfterSeconds` with graceful fallback to `null` when no header is present. Show "Try again later" if duration is unknown. Flag for validation testing.
   - Confidence: LOW — needs runtime verification.

3. **Does the `@clack/prompts` `isTTY` import conflict with the `isTTY` import in `resolve.ts`?**
   - What we know: `src/auth/resolve.ts` already imports `{ isTTY }` from `@clack/prompts`. The onboarding module will do the same.
   - What's unclear: Nothing — this is a verified import from the installed package.
   - Recommendation: Use the same import pattern as `resolve.ts`. No conflict expected.
   - Confidence: HIGH.

4. **Should the `isSubscription` constructor parameter on `OpenAICompatibleProvider` affect only OpenAI, or all openai-compat providers?**
   - What we know: Currently only `openai` supports subscription auth (enforced by `runAuthLogin` and the schema validation). The `isSubscription` parameter would be `true` only when `config.authMethod === 'subscription'`.
   - What's unclear: Whether subscription auth might be added for other providers in a future phase.
   - Recommendation: Make the parameter on `OpenAICompatibleProvider` regardless — it only activates when true, which only happens for OpenAI subscription. Other openai-compat providers pass `false` implicitly.
   - Confidence: HIGH.

5. **Single-use refresh token rotation risk during concurrent CLI processes**
   - What we know: Phase 23 RESEARCH documented this risk (refreshing a token while another CLI process also refreshes causes the second refresh to fail with "refresh token already used"). Subscription concurrency=1 prevents concurrent requests within a single run, but two separate CLI processes (e.g., two terminal windows) running `handover generate` simultaneously could both read the same stored credential and both attempt refresh.
   - What's unclear: Whether Phase 24 scope needs to address this. The phase boundary says "does not include auth infrastructure changes."
   - Recommendation: Out of scope for Phase 24. Document as a known limitation. The 5-minute refresh buffer reduces the likelihood: most runs complete well within the buffer window.
   - Confidence: HIGH (this is a known limitation, not a new bug introduced by Phase 24).

---

## Sources

### Primary (HIGH confidence)
- `src/ui/types.ts` — `DisplayState` interface, all existing fields; verified no `authMethod` field exists
- `src/ui/components.ts` — `renderBanner`, `renderCompletionSummary`, `renderRoundBlock`; all cost-gating logic verified
- `src/ui/ci-renderer.ts` — `onBanner`, `onComplete` cost-gating; `isLocal` pattern verified
- `src/auth/resolve.ts` — subscription fallthrough to `noCredential`; exact lines 136-147 verified
- `src/auth/types.ts` — `AuthError.noCredential`, `AuthError.sessionExpired` static factories
- `src/providers/openai-compat.ts` — `doComplete`, `isRetryable`, OpenAI SDK error types; verified `err instanceof OpenAI.RateLimitError` pattern
- `src/providers/factory.ts` — `createProvider()` constructor calls; `isSubscription` already computed at line 87
- `src/cli/generate.ts` — `runGenerate()` entry point; `displayState` initialization at lines 129-149; auth resolution at line 227
- `src/cli/init.ts` — `@clack/prompts` select/group/intro/outro patterns; YAML writing + config validation pattern
- `src/config/defaults.ts` — env var names for all providers
- `src/config/schema.ts` — `authMethod` field; `HandoverConfigSchema.parse()`
- `/node_modules/@clack/prompts/dist/index.d.mts` — `select`, `isCancel`, `isTTY`, `isCI` exports; verified at v1.0.1
- `/node_modules/openai/core/error.d.ts` — `RateLimitError extends APIError<429, Headers>`; `.headers: Headers` field
- `/node_modules/openai/client.js` — `retry-after` and `retry-after-ms` header parsing patterns (lines 408-424)
- Phase 23 RESEARCH.md — subscription concurrency=1, token store design, rotating refresh tokens, OAuth endpoints

### Secondary (MEDIUM confidence)
- Phase 23 VERIFICATION.md — confirmed all Phase 23 deliverables are in place and tested
- `src/providers/base-provider.ts` — `retryWithBackoff` integration pattern; how `isRetryable` gates retry

### Tertiary (LOW confidence)
- Codex subscription 429 `retry-after` header presence and format — unverified; needs runtime testing
- Which model(s) are accessible with Codex subscription tokens — unverified; needs runtime testing

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing
- Architecture: HIGH — all integration points verified in live codebase
- Banner/cost display: HIGH — exact code paths identified with line numbers
- Auth error specialization: HIGH — existing `AuthError` pattern is clear and extensible
- Subscription 429 handling: HIGH (implementation pattern) / LOW (header format in practice)
- Onboarding wizard: HIGH (implementation pattern) / MEDIUM (UX flow — partially Claude's discretion)
- Mid-gen 401: HIGH (abort recommendation is safe; refresh callback deferred as out of scope)

**Research date:** 2026-02-27
**Valid until:** 2026-03-13 (no new dependencies; valid until OpenAI auth changes — stable for 2 weeks)
