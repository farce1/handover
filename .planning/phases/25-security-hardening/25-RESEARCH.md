# Phase 25: Security Hardening - Research

**Researched:** 2026-02-28
**Domain:** npm publish safety, auth log redaction, provider restriction documentation
**Confidence:** HIGH (all findings verified directly in codebase; no external libraries required)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Publish safety mechanism
- Use `files` allowlist in package.json as the primary safeguard — anything not explicitly listed is excluded
- Scope limited to credential paths (credentials.json, auth token files) — not a full repo audit
- `npm pack --dry-run` verification runs in CI on every PR, not just releases
- Hard fail: PR cannot merge if credential paths are detected in the package contents

#### Documentation tone
- Factual and brief — no editorializing about Anthropic's policies
- "Anthropic requires API key authentication. OAuth/subscription auth is not supported."

### Claude's Discretion
- **Log redaction approach**: Whether to use point-of-use audit, centralized filter, or both — based on existing logging architecture
- **Log content format**: Method name only vs method + masked token — pick the safest approach that still enables debugging
- **Log level audit scope**: Which levels to audit for token leaks — based on codebase logging patterns
- **Log redaction testing**: Whether to add automated tests for log output cleanliness
- **Documentation placement**: Where in the project docs to place the Anthropic restriction note — based on existing doc structure
- **Documentation scope**: Whether to document all providers' auth methods or just the Anthropic restriction
- **CLI guard for Anthropic + subscription**: Whether a runtime guard is needed based on current auth flow
- **CI job structure**: New dedicated job vs step in existing workflow — based on current CI structure
- **CI scan patterns**: What patterns to check for (credential paths only vs token patterns in file contents)
- **CI log redaction enforcement**: Whether to add CI-enforced log redaction tests
- **CI reporting**: Pass/fail only vs PR comment with details — based on current CI patterns

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 25 is a targeted hardening pass covering three orthogonal concerns: publish safety (SEC-01), log redaction (SEC-02), and provider restriction documentation (SEC-03). All three can be implemented with zero new dependencies — this phase is entirely about auditing existing code and adding enforcement mechanisms.

The current state is mostly already safe. The `files` allowlist in `package.json` already restricts the published package to `dist/`, `README.md`, and `LICENSE`. No `.handover/` paths or credential files appear in the current `npm pack --dry-run` output. The auth log calls in `resolve.ts` and `pkce-login.ts` log only method names and provider names — never token values. The one gap is enforcement: there is no automated CI check to verify these invariants hold if someone adds a new file to the allowlist or a new log statement that includes a key. The Anthropic subscription restriction exists in `schema.ts` (as a Zod superRefine validation error) and in `cli/auth/login.ts` (as a runtime guard), but it is not documented anywhere in `docs/`.

**Primary recommendation:** Add a CI publish-safety job (new dedicated job, separate from the `quality` matrix, because it only needs to run once and does not need Node matrix coverage), add a log-redaction vitest to `resolve.test.ts`, and add two sentences to `docs/src/content/docs/user/providers.md` in the Anthropic section.

---

## Standard Stack

### Core
| Component | What It Does | Why Standard |
|-----------|-------------|--------------|
| `npm pack --dry-run` | Lists all files that would be included in the published tarball without creating it | Built into npm, no additional dependencies |
| `files` in `package.json` | Allowlist-based publish safeguard — only explicitly listed paths are included | Already present; stronger than `.npmignore` for opt-in posture |
| GitHub Actions `run:` step with inline shell | CI enforcement of the pack check | Matches existing CI pattern; no external action needed |
| vitest (`vi.fn()` + `mockLogger`) | Log redaction test | Already used in `resolve.test.ts` with `vi.hoisted()` pattern |

### No New Dependencies
This phase requires no `npm install`. All tooling is already present: vitest, memfs, GitHub Actions, npm CLI.

---

## Architecture Patterns

### Recommended Project Structure

No new files or directories needed beyond what exists. Changes touch:

```
src/auth/resolve.ts          # SEC-02: audit only — already clean
src/auth/resolve.test.ts     # SEC-02: add log redaction assertions
.github/workflows/ci.yml     # SEC-01: add publish-safety job
docs/src/content/docs/user/providers.md   # SEC-03: add Anthropic auth note
```

### Pattern 1: SEC-01 — Publish Safety CI Check

**What:** A dedicated `publish-safety` job in `ci.yml` that runs `npm pack --dry-run`, parses the file list from stdout, and fails with a descriptive error if any credential paths appear.

**Why a new job (not a step in `quality`):** The `quality` job uses a Node matrix (20 and 22). Publish safety only needs to run once — there is no value in running it twice. A dedicated job is cleaner and makes the CI status message specific (`publish-safety` vs `Quality Gate (Node 22)`).

**CI structure (based on existing patterns in `ci.yml`):**

```yaml
publish-safety:
  name: Publish Safety
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
    - uses: actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238 # v6
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - run: npm run build
    - name: Verify no credential paths in published package
      run: |
        PACK_OUTPUT=$(npm pack --dry-run 2>&1)
        echo "$PACK_OUTPUT"
        if echo "$PACK_OUTPUT" | grep -E "credentials\.json|\.handover/"; then
          echo "ERROR: Credential paths detected in npm package contents"
          exit 1
        fi
        echo "PASS: No credential paths found in package"
```

**Why `npm run build` before the check:** `npm pack` requires the `dist/` directory to exist (the `files` field references `dist/`). Without a build, the tarball would be incomplete and the check meaningless. The `quality` job already runs `build` as the last step.

**Scan patterns (credential paths only):** Per the locked decision, the check covers credential path strings in the file list, not token patterns in file contents. The relevant patterns are:
- `credentials.json` — the credential store file name
- `.handover/` — the credential store directory (would catch subdirectories too)

Content scanning of dist bundles for token patterns is out of scope per the locked decision ("scope limited to credential paths").

**CI reporting (pass/fail only):** The step echoes the full pack output (so reviewers can see what's in the tarball), then prints a clear PASS or ERROR message. No PR comment action. This matches the existing CI patterns where steps use `run:` with inline shell, not posting-action integrations.

### Pattern 2: SEC-02 — Log Redaction

**Current state (from codebase audit):**

All auth log calls in the codebase are already clean — they log method names and provider names only, never token values. The complete inventory:

| File | Log call | Content logged | Token leak risk |
|------|----------|----------------|-----------------|
| `src/auth/resolve.ts:91` | `logger.debug(...)` | `[auth] Token refreshed for ${credential.provider}` | None — provider name only |
| `src/auth/resolve.ts:94` | `logger.warn(...)` | `[auth] Token refresh failed, trying current token` | None — static string |
| `src/auth/resolve.ts:100` | `logger.info(...)` via `logSource()` | `[auth] ${provider} resolved via ${source} (${detail})` | None — detail is always a description string, never a value |
| `src/auth/pkce-login.ts:264` | `logger.debug(...)` | OpenID discovery error message | None — error message only |
| `src/auth/pkce-login.ts:291` | `logger.debug(...)` | Browser open failure message | None — error message only |
| `src/auth/pkce-login.ts:334` | `logger.debug(...)` | `[auth] OAuth authentication succeeded for ${provider}` | None — provider name only |
| `src/auth/token-store.ts:64` | `logger.warn(...)` | Re-authenticate message | None — no token value |
| `src/providers/factory.ts:90` | `logger.info(...)` | `[factory] Subscription auth: enforcing concurrency=1` | None — static string |

**The `logSource` call sites and their `detail` arguments — verified safe:**
- `'local provider does not require credentials'` — static
- `'using --api-key flag'` — static (no key value)
- `'using GOOGLE_API_KEY (fallback)'` — static (env var name, not value)
- `` `using ${envVarName}` `` — env var name (e.g., `ANTHROPIC_API_KEY`), not the value
- `'using stored subscription token'` — static (no token value)
- `'user provided key interactively'` — static (no key value)

**The `authUrl` logged in `pkce-login.ts`:** The OAuth authorization URL contains `code_challenge` (a SHA-256 hash of the PKCE verifier, not the verifier itself), `state`, and `client_id`. These are public values by design in the PKCE flow — the URL is intentionally displayed to the user for browser authentication. This is not a leak.

**Recommended approach: point-of-use audit (audit-only, no centralized filter needed).** The existing code is already compliant. The task is to add test coverage that enforces this remains true.

**Log content format recommendation: method name only.** The current `logSource` function logs `(${detail})` where detail is always a human-readable description string. This is preferable to `method + masked token` (e.g., `sk-ant-***`) because:
1. No masking logic to maintain or get wrong
2. No risk of partial masking exposing prefix patterns
3. Sufficient for debugging (you know which resolution path was taken)

**Log level audit scope:** Only `debug` and `info` calls in `src/auth/` need auditing (already complete above). The `warn` calls are error-path messages that contain no token values. The `error` level is not used in auth modules.

**Log redaction testing:** Add assertions to the existing `resolve.test.ts` — it already uses `mockLogger` via `vi.hoisted()`. The pattern is:

```typescript
// In resolve.test.ts (already has mockLogger with info/warn/debug mocks)
test('log output never contains token values', async () => {
  process.env.OPENAI_API_KEY = 'sk-real-api-key-value';
  const store = createMockStore();
  await resolveAuth(makeConfig({ provider: 'openai' }), undefined, store as unknown as TokenStore);

  // Assert info calls contain no token values
  for (const call of mockLogger.info.mock.calls) {
    expect(call[0]).not.toContain('sk-real-api-key-value');
  }
  for (const call of mockLogger.debug.mock.calls) {
    expect(call[0]).not.toContain('sk-real-api-key-value');
  }
});
```

This is a regression guard — it will catch any future change to `logSource` or `refreshIfNeeded` that accidentally includes `credential.token`, `cliApiKey`, or `envValue` in a log message.

**CLI guard for Anthropic + subscription:** Already implemented in two places:
1. `src/config/schema.ts` line 109–115: Zod `superRefine` rejects `{ provider: 'anthropic', authMethod: 'subscription' }` at config parse time with the message `"Anthropic does not support subscription auth - use authMethod: api-key"`.
2. `src/cli/auth/login.ts` line 8–16: `runAuthLogin` rejects any provider other than `openai` with a clear error.

No additional CLI guard is needed — the existing guards fire before any auth resolution or credential store access.

### Pattern 3: SEC-03 — Anthropic Restriction Documentation

**Current state:** The restriction exists in code but not in docs:
- `src/config/schema.ts` — validation error if `authMethod: subscription` + `provider: anthropic`
- `src/cli/auth/login.ts` — runtime error if `handover auth login anthropic`
- `docs/src/content/docs/user/providers.md` — the Anthropic section has no mention of auth restrictions

**Documentation placement:** `docs/src/content/docs/user/providers.md` in the Anthropic row of the "Configuring a provider" section. This is where users look when setting up Anthropic — the natural place to see auth requirements.

**Documentation scope:** Document only the Anthropic restriction (as decided). Other providers (openai, gemini, etc.) do not need auth method documentation at this time.

**Exact content to add (factual and brief, per locked decision):**

In the Anthropic section of `providers.md`, after the existing bash/yaml code blocks, add:

```markdown
**Authentication:** Anthropic requires API key authentication. OAuth/subscription auth is not supported.
```

This is a single sentence — factual, no editorializing. It should be placed after the code blocks so it's visible when users scroll past the setup examples.

**Does `configuration.md` need updating?** The `authMethod` config key is not currently documented in `configuration.md` (confirmed by grep). The phase scope is restricted to documenting the Anthropic restriction in provider setup docs. Adding `authMethod` to the configuration reference would be a scope expansion — it is not required by SEC-03's success criterion. Leave `configuration.md` unchanged for this phase.

### Anti-Patterns to Avoid
- **Scanning dist bundle contents for token strings:** Not in scope (locked decision). The `files` allowlist prevents the credential file from being included — content scanning the compiled JS is unnecessary complexity.
- **Centralized log filter/sanitizer middleware:** Not needed because the audit shows no current token logging. A centralized filter adds maintenance burden without addressing a real gap.
- **Adding `.npmignore`:** The user decided to use `files` allowlist. `.npmignore` would be redundant and creates confusion (when both exist, `.npmignore` takes precedence, which would override the `files` field unexpectedly).
- **Documenting the restriction in CHANGELOG or AGENTS.md:** SEC-03 success criterion is specifically "provider setup docs" — that maps to `providers.md`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tarball file listing | Custom tar parser | `npm pack --dry-run` | Built-in, always reflects actual npm publish behavior |
| Log sanitization | Regex scrubber in Logger class | Point-of-use audit + test | No actual leaks exist; a scrubber would mask symptoms not causes |
| CI job for pack check | New workflow file | New job in existing `ci.yml` | Keeps all CI logic in one file, consistent with project convention |

---

## Common Pitfalls

### Pitfall 1: npm pack --dry-run Requires a Built dist/
**What goes wrong:** If `npm run build` hasn't run before `npm pack --dry-run`, the `dist/` directory doesn't exist and the tarball contents list is incomplete or empty. The check would pass spuriously.
**Why it happens:** The `files` field includes `dist/` but `npm pack` doesn't fail if the directory is absent — it just excludes it silently.
**How to avoid:** Always run `npm run build` before `npm pack --dry-run` in the CI check step.
**Warning signs:** Pack output shows `total files: 2` (only LICENSE and README) instead of 47.

### Pitfall 2: Grep Pattern Matching dist/ Paths
**What goes wrong:** If the credential patterns used in grep are too broad (e.g., just `credentials`), they could match legitimate dist file names or source map content that happens to contain the word "credentials" (e.g., error message strings compiled into the bundle).
**Why it happens:** The dist bundle contains string literals from `token-store.ts` — including the path string `~/.handover/credentials.json` inside the compiled JS. But this is in a dist/ file, not as a separate tarball entry.
**How to avoid:** The grep checks the file LIST (tarball entries), not file CONTENTS. `npm pack --dry-run` outputs `npm notice <size> <path>` lines — grep on the path portion only. The path `dist/chunk-....js` will never match `credentials.json` because we're checking the entry name, not the bundle content.
**Warning signs:** False positives where `credentials.json` appears as a substring in a dist file name (impossible with the current content-hash naming convention like `chunk-7WSN5BTF.js`).

### Pitfall 3: Zod Validation Error vs. Runtime Guard Confusion
**What goes wrong:** A developer testing the Anthropic subscription restriction might try `handover auth login anthropic` expecting the Zod error, but actually hits the `login.ts` guard first (which fires before config loading). Or vice versa — they might bypass `login.ts` by directly writing credentials and hitting the Zod error on the next `generate` run.
**Why it matters for this phase:** Both guards are already in place. SEC-03 documentation should describe the restriction outcome, not its implementation mechanism.
**How to avoid:** The documentation phrase "OAuth/subscription auth is not supported" describes the user-observable behavior. Do not expose the implementation detail (Zod vs. CLI guard) in user-facing docs.

### Pitfall 4: Test Covering the Wrong Logger Instance
**What goes wrong:** A log redaction test that imports `logger` directly and checks it, while `resolve.ts` uses a different instance (or a re-exported singleton).
**Why it happens:** `logger` is a singleton exported from `src/utils/logger.ts`. The existing `resolve.test.ts` mocks it correctly via `vi.mock('../utils/logger.js', () => ({ logger: mockLogger }))`.
**How to avoid:** Follow the exact mock pattern already in `resolve.test.ts`. The new log redaction test lives in the same file and uses the already-established `mockLogger`.

---

## Code Examples

### SEC-01: CI Publish Safety Step

```yaml
# In .github/workflows/ci.yml — new job after the existing "quality" job
publish-safety:
  name: Publish Safety
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
    - uses: actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238 # v6
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - run: npm run build
    - name: Verify no credential paths in published package
      run: |
        PACK_OUTPUT=$(npm pack --dry-run 2>&1)
        echo "$PACK_OUTPUT"
        if echo "$PACK_OUTPUT" | grep -E "credentials\.json|\.handover/"; then
          echo "ERROR: Credential paths detected in npm package contents"
          exit 1
        fi
        echo "PASS: No credential paths found in package"
```

### SEC-02: Log Redaction Regression Test

```typescript
// In src/auth/resolve.test.ts — add to the existing describe('resolveAuth') block
// Uses the already-established mockLogger from vi.hoisted()

test('logSource never includes API key values in log output', async () => {
  const sensitiveKey = 'sk-ant-api03-supersecret-value';
  process.env.OPENAI_API_KEY = sensitiveKey;
  const store = createMockStore();

  await resolveAuth(makeConfig({ provider: 'openai' }), undefined, store as unknown as TokenStore);

  // All logger calls: info, debug, warn — none should contain the key value
  const allLogCalls = [
    ...mockLogger.info.mock.calls,
    ...mockLogger.debug.mock.calls,
    ...mockLogger.warn.mock.calls,
  ];
  for (const [msg] of allLogCalls) {
    expect(String(msg)).not.toContain(sensitiveKey);
  }
});

test('logSource never includes CLI api key flag value in log output', async () => {
  const sensitiveKey = 'cli-key-supersecret-value';
  const store = createMockStore();

  await resolveAuth(makeConfig(), sensitiveKey, store as unknown as TokenStore);

  const allLogCalls = [
    ...mockLogger.info.mock.calls,
    ...mockLogger.debug.mock.calls,
  ];
  for (const [msg] of allLogCalls) {
    expect(String(msg)).not.toContain(sensitiveKey);
  }
});

test('logSource never includes subscription token in log output', async () => {
  const sensitiveToken = 'eyJ-subscription-token-supersecret';
  const store = createMockStore({ provider: 'openai', token: sensitiveToken });

  await resolveAuth(
    makeConfig({ provider: 'openai', authMethod: 'subscription' }),
    undefined,
    store as unknown as TokenStore,
  );

  const allLogCalls = [
    ...mockLogger.info.mock.calls,
    ...mockLogger.debug.mock.calls,
  ];
  for (const [msg] of allLogCalls) {
    expect(String(msg)).not.toContain(sensitiveToken);
  }
});
```

### SEC-03: Provider Documentation Addition

```markdown
<!-- In docs/src/content/docs/user/providers.md — in the Anthropic section -->

**Anthropic (default):**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx handover-cli generate
```

Or in `.handover.yml`:

```yaml
provider: anthropic
model: claude-sonnet-4-5
```

**Authentication:** Anthropic requires API key authentication. OAuth/subscription auth is not supported.
```

---

## State of the Art

| Old Approach | Current Approach | Impact for this Phase |
|--------------|------------------|-----------------------|
| `.npmignore` exclusion list | `files` allowlist in package.json | `files` is already in place; `.npmignore` not needed |
| No publish verification in CI | `npm pack --dry-run` in CI | New — add as `publish-safety` job |
| Trust-based log hygiene | Regression tests for log cleanliness | New — add 3 tests to `resolve.test.ts` |
| Auth restrictions in code only | Auth restrictions in user docs | New — add to `providers.md` |

---

## Open Questions

1. **Should `npm pack --dry-run` also be added to `release.yml`?**
   - What we know: The release workflow already runs `npm run release:precheck` (lint + typecheck + test + build). It does not run a pack check.
   - What's unclear: Whether the CI check in `ci.yml` is sufficient (every PR runs it), or whether a redundant check in `release.yml` adds value.
   - Recommendation: The locked decision says "runs in CI on every PR" — the release workflow is a separate concern. Adding it to `release.yml` is a reasonable belt-and-suspenders addition but not required by the success criteria. Leave it out to keep scope tight; it can be added in a follow-up.

2. **Should the `authMethod` config key be documented in `configuration.md`?**
   - What we know: `authMethod` is a real config key with two valid values (`api-key`, `subscription`) but is not documented in `configuration.md`.
   - What's unclear: Whether SEC-03 scope covers the config reference or just provider setup docs.
   - Recommendation: Leave `configuration.md` unchanged. SEC-03 success criterion is "provider setup docs state Anthropic requires API key auth" — `providers.md` satisfies this. Adding `authMethod` to `configuration.md` is a documentation gap but it is out of phase scope.

3. **Should the log redaction test cover `pkce-login.ts`?**
   - What we know: `pkce-login.ts` has no token value logging (confirmed by audit). Its log calls contain only error messages, provider names, and the OAuth URL (which is safe).
   - What's unclear: Whether a separate test for `pkce-login.ts` adds meaningful coverage or just complexity.
   - Recommendation: Skip — `pkce-login.ts` is in the coverage exclusion list (`src/cli/auth/status.ts` is not but `pkce-login.ts` may be integration-only). The `resolve.ts` tests cover the primary token-logging surface. If log redaction testing for `pkce-login.ts` is desired, it's a separate follow-up.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection — `src/auth/resolve.ts`, `src/auth/pkce-login.ts`, `src/auth/token-store.ts`, `src/providers/factory.ts` — all log calls audited line by line
- `package.json` — `files` allowlist verified as `["dist/", "README.md", "LICENSE"]`
- `npm pack --dry-run` — executed locally; confirmed no credential paths in output (47 files, all `dist/*.js`, `dist/*.js.map`, `README.md`, `LICENSE`)
- `.github/workflows/ci.yml` — read in full; confirmed existing job structure and step patterns
- `src/config/schema.ts` lines 109–115 — Zod superRefine guard for Anthropic + subscription
- `src/cli/auth/login.ts` lines 8–16 — runtime guard for unsupported providers
- `docs/src/content/docs/user/providers.md` — read in full; confirmed no existing auth restriction note for Anthropic
- `vitest.config.ts` — coverage exclusions verified; `resolve.test.ts` is not excluded
- `src/auth/resolve.test.ts` — read in full; confirmed `vi.hoisted()` + `mockLogger` pattern already in use

### Secondary (MEDIUM confidence)
- npm documentation on `files` vs `.npmignore` precedence: when both exist, `.npmignore` takes precedence. Since no `.npmignore` exists in this project, `files` is the sole control.

---

## Metadata

**Confidence breakdown:**
- SEC-01 (publish safety): HIGH — `npm pack --dry-run` output verified locally; `files` allowlist confirmed working; CI YAML pattern matches existing `ci.yml` jobs
- SEC-02 (log redaction): HIGH — all auth log calls audited directly; no token values found; test pattern matches existing `resolve.test.ts` convention
- SEC-03 (documentation): HIGH — `providers.md` read in full; placement decision is clear; content wording is locked by user decision

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (30 days — stable domain; no fast-moving dependencies)
