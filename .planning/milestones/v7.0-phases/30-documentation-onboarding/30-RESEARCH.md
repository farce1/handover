# Phase 30: Documentation & Onboarding - Research

**Researched:** 2026-03-02
**Domain:** Starlight docs authoring, CLI hardening (TTY guard), broken-link CI validation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

User deferred all implementation decisions to Claude.

### Claude's Discretion

**Doc structure & tone:**
- Page depth (quick-start vs comprehensive) for search.md, regeneration.md, testing.md
- Code example density and inline vs linked examples
- Cross-linking strategy between user/contributor sections
- Match existing doc tone from getting-started.md and configuration.md

**Sidebar & navigation:**
- New user guide pages (`search.md`, `regeneration.md`) slot into existing "User Guides" sidebar group
- New contributor page (`testing.md`) slots into existing "Contributor docs" sidebar group
- Ordering within groups — place after existing entries or interleave logically

**`handover init` TTY guard behavior:**
- Detection method for non-TTY (e.g., `process.stdout.isTTY`)
- Messaging when non-TTY detected without `--yes` flag
- How silent `--yes` mode is (fully silent vs summary output)
- Overwrite detection: current code already checks `existsSync('.handover.yml')` — extend for `--yes` mode

**Contributor testing guide scope:**
- Document `createMockProvider()`, `memfs` setup, coverage exclusion rationale
- Depth of testing philosophy vs just the practical patterns
- Whether to include example test snippets from actual test files

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 30 has three distinct work streams. The first is Starlight doc authoring: write two user-guide pages (`search.md`, `regeneration.md`) and one contributor page (`testing.md`), then register all three in the sidebar in `docs/astro.config.mjs`. The existing docs (`getting-started.md`, `configuration.md`, `architecture.md`, `development.md`) establish a concrete tone and structure to match: H1 → short paragraph → H2 sections → code blocks with short prose explanations. Pages are moderate length, not exhaustive references.

The second stream is CLI hardening: add `--yes` to `handover init` so it can run without prompts in CI. The existing codebase already uses `@clack/prompts` `isCI()` and `isTTY()` helpers elsewhere (`src/cli/generate.ts`, `src/auth/resolve.ts`). The `runInit()` function in `src/cli/init.ts` is self-contained and needs: (a) a new `--yes` option wired in `src/cli/index.ts`, (b) a non-TTY detection branch that errors if neither `--yes` nor a TTY is present, (c) overwrite guard that skips the interactive confirm when `--yes` is given (treating existing config as "do not overwrite" unless explicitly overridden). `isCI()` checks `process.env.CI === 'true'`; `isTTY()` checks `stream.isTTY === true`.

The third stream is CI link validation: add `starlight-links-validator` (v0.19.2, package `starlight-links-validator`) to the Starlight plugin array in `docs/astro.config.mjs`. The plugin runs during `astro build` and fails the build on broken internal links. The existing `docs:build` script (`npm run docs:build`) maps directly to `astro build`, and the `docs-deploy.yml` workflow already runs this step — no new CI job is needed; the build step already serves as the gate. The plugin is zero-config beyond adding it to `plugins: []`.

**Primary recommendation:** Author the three doc pages first to shake out what links exist, then add `starlight-links-validator` so CI catches any link mistakes in the new pages before they ship.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@astrojs/starlight` | `^0.37.6` (already installed) | Docs site framework | Already in use — no change |
| `starlight-links-validator` | `^0.19.2` | Validate internal doc links at build time | Official Starlight plugin; recommended on starlight.astro.build/resources/plugins/ |
| `@clack/prompts` | `^1.0.1` (already installed) | TTY/CI detection helpers for CLI | Already used in `generate.ts` and `auth/resolve.ts` — consistent pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `memfs` | `^4.56.10` (already in devDependencies) | In-memory filesystem for test isolation | Already used in `token-store.test.ts`; no new install needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `starlight-links-validator` | `astro-link-validator` or `astro-broken-link-checker` | `starlight-links-validator` is Starlight-native, maintained by HiDeoo, and listed in the official Starlight plugin registry — the authoritative choice for this stack |
| `@clack/prompts` `isCI()` / `isTTY()` | `process.env.CI` and `process.stdout.isTTY` directly | Both work; `@clack/prompts` helpers are already the established pattern in this codebase — stay consistent |

**Installation:**
```bash
# Only net-new dependency
npm install --save-dev starlight-links-validator
```

---

## Architecture Patterns

### Recommended Project Structure

New files to create:

```
docs/src/content/docs/
├── user/
│   ├── search.md          # DOCS-01: new
│   └── regeneration.md    # DOCS-03: new
└── contributor/
    └── testing.md         # DOCS-04: new

src/cli/
└── init.ts                # DOCS-02: modify (TTY guard + --yes flag)
```

Files to modify:

```
docs/astro.config.mjs      # sidebar entries + starlightLinksValidator plugin
src/cli/index.ts           # wire --yes flag to init command
```

---

### Pattern 1: Starlight Page Authoring

**What:** Starlight pages are Markdown with a `title` frontmatter key. No `description` field is present in existing pages. The H1 mirrors the `title`. Sections use H2 only in the existing pages (no H3 unless a section gets long). Code blocks use triple-backtick with language identifier.

**When to use:** Every new doc page follows this pattern.

**Example (from `getting-started.md`):**
```markdown
---
title: Getting started
---

# Getting started

handover scans a codebase and produces 14 interconnected markdown documents...

## Prerequisites

- **Node.js >= 18** — check with `node --version`
```

**Key conventions observed across existing pages:**
- Bold for technical terms on first use within a list item
- Tables for options/flags (two-column: Flag | Description)
- Inline code for all CLI flags, file paths, and config keys
- Short sections — each H2 section fits on one screen
- Outbound cross-links at bottom of page (e.g., `- [configuration](./configuration/)`)

---

### Pattern 2: Sidebar Registration

**What:** Add new pages to the `sidebar` array in `docs/astro.config.mjs` under the correct group. Starlight resolves page URLs from the content path.

**Example (existing pattern):**
```javascript
// docs/astro.config.mjs
{
  label: 'User Guides',
  items: [
    { label: 'Getting started', link: '/user/getting-started/' },
    { label: 'Configuration', link: '/user/configuration/' },
    { label: 'Providers', link: '/user/providers/' },
    { label: 'MCP setup', link: '/user/mcp-setup/' },
    { label: 'Output documents', link: '/user/output-documents/' },
    // Add after 'Output documents':
    { label: 'Search', link: '/user/search/' },
    { label: 'Regeneration', link: '/user/regeneration/' },
  ],
},
{
  label: 'Contributor docs',
  items: [
    { label: 'Development', link: '/contributor/development/' },
    { label: 'Architecture', link: '/contributor/architecture/' },
    { label: 'Adding providers', link: '/contributor/adding-providers/' },
    { label: 'Adding analyzers', link: '/contributor/adding-analyzers/' },
    // Add after 'Adding analyzers':
    { label: 'Testing', link: '/contributor/testing/' },
  ],
},
```

**Ordering recommendation:** Append new pages after existing entries in each group. `search.md` and `regeneration.md` are feature-specific guides that fit naturally after the foundational `output-documents.md`. `testing.md` is a peer to the existing `development.md` and contributor how-tos.

---

### Pattern 3: starlight-links-validator Plugin Setup

**What:** Add the plugin to the Starlight `plugins:` array. The plugin runs during `astro build` and fails the build if any internal link is broken. Runs on production build only (not `astro dev`).

**Source:** Official docs at https://starlight-links-validator.vercel.app/getting-started/

**Example:**
```javascript
// docs/astro.config.mjs
import starlightLinksValidator from 'starlight-links-validator';

export default defineConfig({
  integrations: [
    starlight({
      plugins: [starlightLinksValidator()],
      // ...rest of config
    }),
  ],
});
```

**Default behavior:** Errors on broken page links, invalid hash anchors, relative links, and local (localhost) links. No configuration needed for this phase — defaults are correct.

**CI integration:** The existing `docs-deploy.yml` workflow runs `npm run docs:build` which calls `astro build --config docs/astro.config.mjs`. The link validator runs as part of that build and fails the step if links are broken. No new CI job is needed.

---

### Pattern 4: `handover init` TTY Guard and `--yes` Flag

**What:** Make `runInit()` work in non-interactive environments. Two additions:
1. Register `--yes` on the `init` command in `src/cli/index.ts`
2. Modify `runInit()` in `src/cli/init.ts` to accept `yes?: boolean` and branch accordingly

**Detection pattern (consistent with existing codebase):**
```typescript
// src/cli/init.ts
import { isCI, isTTY } from '@clack/prompts';

export async function runInit(options: { yes?: boolean } = {}): Promise<void> {
  const isInteractive = isTTY(process.stdout) && !isCI();

  if (!isInteractive && !options.yes) {
    // Non-TTY without --yes: fail with actionable message
    process.stderr.write(
      'handover init: non-interactive environment detected. Run with --yes to create a default config.\n'
    );
    process.exit(1);
    return;
  }

  // Overwrite guard in --yes mode:
  if (existsSync('.handover.yml')) {
    if (options.yes) {
      // --yes never silently overwrites: exit 0 with message (safe default)
      process.stderr.write('.handover.yml already exists — skipping (use --force to overwrite)\n');
      return;
    }
    // Interactive: prompt as before
    const overwrite = await p.confirm({ ... });
    ...
  }

  if (options.yes) {
    // Non-interactive: write default config (provider: anthropic) silently
    // No spinner, no prompts — just write + single summary line to stdout
  } else {
    // Interactive: existing p.group() flow unchanged
  }
}
```

**`@clack/prompts` `isCI()` implementation (verified):** `() => process.env.CI === 'true'`
**`@clack/prompts` `isTTY()` implementation (verified):** `(stream) => stream.isTTY === true`

**Wire in `src/cli/index.ts`:**
```typescript
program
  .command('init')
  .description('Create .handover.yml configuration file')
  .option('--yes', 'Skip prompts and create default config (for CI/non-interactive use)')
  .action(runInit);
```

**Behavior matrix:**

| Environment | `--yes` | Result |
|-------------|---------|--------|
| TTY | no | Interactive prompts (existing behavior) |
| TTY | yes | Silent default config write |
| Non-TTY (CI) | no | Error: "run with --yes" |
| Non-TTY (CI) | yes | Silent default config write |
| TTY, config exists | no | Interactive overwrite confirm |
| TTY, config exists | yes | Skip (do not overwrite), exit 0 |
| Non-TTY, config exists | yes | Skip (do not overwrite), exit 0 |

---

### Pattern 5: `createMockProvider()` — Contributor Testing Pattern

**What:** `src/providers/__mocks__/index.ts` exports `createMockProvider()` which builds a fully type-checked `LLMProvider` stub using `vi.fn()`.

**Source:** `src/providers/__mocks__/index.ts` (verified in codebase)

**Example:**
```typescript
// In a test file:
import { createMockProvider } from '../providers/__mocks__/index.js';

const provider = createMockProvider();
(provider.complete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
  data: { ... },
  usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
  model: 'mock',
  duration: 0,
});
```

**Why it exists:** Real provider classes require API keys, network, and SDK constructors. `createMockProvider()` returns a plain object satisfying the `LLMProvider` interface with `vi.fn()` on each method, enabling round-level unit tests without any provider setup.

---

### Pattern 6: `memfs` Setup for Filesystem Tests

**What:** `memfs` is used to replace `node:fs` and `node:fs/promises` with an in-memory filesystem in Vitest. The `vol` object controls the virtual filesystem state.

**Source:** `src/auth/token-store.test.ts` (verified in codebase)

**Example:**
```typescript
import { vol } from 'memfs';
import { beforeEach, vi } from 'vitest';

// Replace real fs modules with memfs
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}));

// Reset between tests
beforeEach(() => {
  vol.reset();
});

// Seed the virtual filesystem
vol.fromJSON({
  '/mock-home/.handover/credentials.json': JSON.stringify({ token: 'abc' }),
});
```

**Why it exists:** Tests that write/read config files or credentials need isolation. Using `memfs` means no real filesystem side effects, no temp-directory cleanup, and no OS-dependent paths.

---

### Anti-Patterns to Avoid

- **Linking to anchor IDs that don't exist:** `starlight-links-validator` will catch these, but write links carefully during authoring to avoid CI failures on the first pass.
- **Relative links in Starlight pages:** The validator's `errorOnRelativeLinks: true` default rejects `./configuration` — use absolute-from-root links like `/user/configuration/`.
- **Using `process.env.CI` directly for TTY detection in `init.ts`:** The existing codebase uses `@clack/prompts` `isCI()` and `isTTY()` — stay consistent; don't add a third detection pattern.
- **Silent overwrite in `--yes` mode:** The success criteria explicitly states "does not silently overwrite an existing config". In `--yes` mode, skip (not overwrite) when `.handover.yml` exists.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Broken link detection | Custom link extractor + HTTP checker | `starlight-links-validator` | Handles hash anchors, multi-locale, trailing slash variants, sidebar links — edge cases in custom implementations are numerous |
| In-memory filesystem for tests | Custom mock object for `node:fs` | `memfs` (already in devDependencies) | Fully compatible with Node.js `fs` API including `existsSync`, `vol.fromJSON`, etc. |
| Non-TTY detection | `process.stdout.isTTY === undefined` checks | `@clack/prompts` `isTTY()` and `isCI()` | Already the established pattern in this codebase |

**Key insight:** The link validator is the only net-new package. Everything else (memfs, @clack/prompts helpers) is already present.

---

## Common Pitfalls

### Pitfall 1: `starlight-links-validator` Slows `astro build` Significantly

**What goes wrong:** The validator caches must rebuild when Astro's Content Layer cache is invalidated, which happens on every plugin change. For this project's small doc site this is negligible, but know that the plugin intentionally invalidates the content layer cache on each run to ensure links are re-validated.

**Why it happens:** The plugin registers itself as a content layer integration; re-validation on every build is by design.

**How to avoid:** This is expected behavior, not a bug. For very large sites, `exclude` patterns can be used, but the handover doc site is small enough that no exclusions are needed.

**Warning signs:** Build time increases by >30 seconds on a small site — investigate.

---

### Pitfall 2: Sidebar Links and File Paths Must Match Exactly

**What goes wrong:** Adding a page at `docs/src/content/docs/user/search.md` but registering it in the sidebar as `/user/search` (without trailing slash) may produce 404s or broken link validation failures depending on the Astro `trailingSlash` setting.

**Why it happens:** The project uses default Astro settings; Starlight enforces trailing slashes on page links by default.

**How to avoid:** Use trailing slashes in all sidebar `link` values (e.g., `/user/search/`). This matches the existing sidebar entries exactly.

**Warning signs:** `starlight-links-validator` reports 404 for a page that clearly exists.

---

### Pitfall 3: `handover init --yes` Must Not Overwrite Existing Config

**What goes wrong:** A CI pipeline running `handover init --yes` on a repo that already has `.handover.yml` silently overwrites the user's config.

**Why it happens:** Simple `--yes` implementations skip all confirmation prompts including overwrite confirmation.

**How to avoid:** Explicit guard: if `.handover.yml` exists and `--yes` is set, print a message and exit 0 (do not overwrite). Only proceed with write if the file does not exist.

**Warning signs:** User's custom config values disappear after running `handover init --yes` in CI.

---

### Pitfall 4: `@clack/prompts` `isCI()` Only Checks `CI=true`

**What goes wrong:** Assuming `isCI()` detects all CI environments. GitHub Actions sets `CI=true`, but other CI systems may not.

**Why it happens:** `@clack/prompts` `isCI()` is `() => process.env.CI === 'true'`. It is a narrow check.

**How to avoid:** The TTY guard (`isTTY(process.stdout)`) is the primary check. `isCI()` is a belt-and-suspenders addition. In `--yes` mode, CI detection doesn't matter — the flag is explicit.

**Warning signs:** Non-interactive CI hangs waiting for prompts on systems that don't set `CI=true`.

**Recommendation:** Guard primarily on `!isTTY(process.stdout)`, not on `isCI()`. The `--yes` flag bypasses both checks.

---

### Pitfall 5: Coverage Config Is FROZEN — Do Not Add `src/cli/init.ts` Exclusions

**What goes wrong:** After adding `--yes` logic to `init.ts`, there may be a temptation to exclude new branches from coverage. The `vitest.config.ts` has a frozen exclusion list with explicit instructions: "Do NOT add entries without justification."

**Why it happens:** `src/cli/init.ts` is already excluded from coverage (`'src/cli/init.ts': CLI entry point — integration-only`). No action needed.

**How to avoid:** The entire `src/cli/init.ts` file is already excluded. No coverage config changes required.

---

## Code Examples

Verified patterns from official sources:

### starlight-links-validator plugin registration

```javascript
// Source: https://starlight-links-validator.vercel.app/getting-started/
// docs/astro.config.mjs
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightLinksValidator from 'starlight-links-validator';

const basePath = '/handover/';

export default defineConfig({
  site: 'https://farce1.github.io',
  base: basePath,
  srcDir: './docs/src',
  outDir: 'docs/dist',
  integrations: [
    starlight({
      title: 'handover',
      plugins: [starlightLinksValidator()],  // <-- add this line
      // ...rest unchanged
    }),
  ],
});
```

### init.ts TTY guard with --yes

```typescript
// Source: verified against existing codebase patterns (src/auth/resolve.ts, src/cli/generate.ts)
// src/cli/init.ts

import { isCI, isTTY } from '@clack/prompts';

export interface InitOptions {
  yes?: boolean;
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const isInteractive = isTTY(process.stdout) && !isCI();

  // Non-interactive without --yes: exit with instruction
  if (!isInteractive && !options.yes) {
    process.stderr.write(
      'handover init: non-interactive environment detected.\n' +
      'Run with --yes to create a default configuration file non-interactively.\n'
    );
    process.exit(1);
    return;
  }

  // Overwrite guard: never silently overwrite
  if (existsSync('.handover.yml')) {
    if (options.yes) {
      process.stdout.write('.handover.yml already exists — skipping.\n');
      return;
    }
    // Interactive path: prompt as existing code does
    const overwrite = await p.confirm({ message: '.handover.yml already exists. Overwrite?', initialValue: false });
    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Keeping existing config.');
      return;
    }
  }

  if (options.yes) {
    // Silent mode: write defaults, one summary line
    // ... write config with provider: 'anthropic'
    process.stdout.write('Created .handover.yml with default configuration.\n');
    process.stdout.write('Run handover generate to analyze your codebase.\n');
    return;
  }

  // Interactive: existing p.intro(), p.group(), etc. unchanged
  p.intro(pc.bgCyan(pc.black(' handover init ')));
  // ...
}
```

### src/cli/index.ts init command with --yes

```typescript
// Source: verified against existing commander pattern in src/cli/index.ts
program
  .command('init')
  .description('Create .handover.yml configuration file')
  .option('--yes', 'Skip prompts and write a default config (for CI/non-interactive environments)')
  .action(runInit);
```

### Starlight page frontmatter and structure

```markdown
---
title: Search
---

# Search

handover generates a semantic search index alongside your documentation. Use `handover search` to query it and `handover reindex` to rebuild it after generating new documents.

## Quick start

...

## Next steps

- [configuration](./configuration/)
- [regeneration](./regeneration/)
```

### createMockProvider usage (from runner.test.ts)

```typescript
// Source: src/ai-rounds/runner.test.ts (verified in codebase)
import { createMockProvider } from '../providers/__mocks__/index.js';

const provider = createMockProvider();
(provider.complete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
  data: { /* structured output matching round schema */ },
  usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
  model: 'mock',
  duration: 0,
});
```

### memfs setup pattern (from token-store.test.ts)

```typescript
// Source: src/auth/token-store.test.ts (verified in codebase)
import { vol } from 'memfs';
import { beforeEach, vi } from 'vitest';

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return memfs.fs;
});

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}));

beforeEach(() => {
  vol.reset();
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual link checking / no link validation | `starlight-links-validator` integrated at build time | Phase 30 (new) | Broken internal links fail CI before deploy |
| `handover init` interactive-only | `handover init --yes` for non-interactive environments | Phase 30 (new) | CI pipelines can scaffold config without hanging |

**Deprecated/outdated:**
- `starlight-links-validator` v0.14.x had a regression with custom slug pages fixed in Astro 5.1.1+. The current project uses `astro: ^5.17.3` which is well past this fix. No issue.

---

## Open Questions

1. **Should `--yes` also accept a provider flag (e.g., `handover init --yes --provider openai`)?**
   - What we know: Success criteria only requires `--yes` that "silently skips prompts". No provider flag is mentioned.
   - What's unclear: Whether CI users will need to customize provider during init.
   - Recommendation: Implement `--yes` only for Phase 30. A `--provider` flag on init can be Phase 31+ scope.

2. **Should `starlight-links-validator` be added to the `docs:build` script or to CI separately?**
   - What we know: The plugin integrates into `astro build` — it runs whenever `npm run docs:build` runs. The `docs-deploy.yml` workflow runs `npm run docs:build`. No separate CI step is needed.
   - What's unclear: Whether the team wants local `npm run docs:build` to also validate links (it will, automatically, once the plugin is installed).
   - Recommendation: This is the correct behavior. Document in DOCS-05 that `npm run docs:build` now validates links.

3. **Which default provider should `handover init --yes` use?**
   - What we know: `HandoverConfigSchema` defaults `provider` to `'anthropic'`. The `runInit()` interactive flow starts with Anthropic as the first option.
   - Recommendation: Use `provider: 'anthropic'` as the `--yes` default, matching the schema default and the interactive default.

---

## Sources

### Primary (HIGH confidence)

- Codebase: `src/cli/init.ts` — verified complete `runInit()` implementation, existing overwrite guard
- Codebase: `src/cli/index.ts` — verified commander pattern for option registration
- Codebase: `src/cli/generate.ts` — verified `isCI()` / `isTTY()` import pattern from `@clack/prompts`
- Codebase: `src/auth/resolve.ts` — verified `isTTY(process.stdout) || isCI()` pattern
- Codebase: `src/cli/search.ts` — verified `Boolean(process.stdout.isTTY)` TTY detection
- Codebase: `src/providers/__mocks__/index.ts` — verified `createMockProvider()` implementation
- Codebase: `src/auth/token-store.test.ts` — verified `memfs` `vol.reset()` / `vi.mock` pattern
- Codebase: `vitest.config.ts` — verified coverage exclusion list and frozen policy
- Codebase: `docs/astro.config.mjs` — verified existing sidebar structure and Starlight config shape
- Codebase: `docs/src/content/docs/user/getting-started.md` — tone and structure reference
- Codebase: `docs/src/content/docs/user/configuration.md` — table-heavy reference style
- Codebase: `docs/src/content/docs/contributor/development.md` — contributor guide tone
- Codebase: `.github/workflows/docs-deploy.yml` — verified `npm run docs:build` is the gate job
- Runtime: `@clack/prompts` `isCI()` source = `() => process.env.CI === 'true'` (verified via Node.js)
- Runtime: `@clack/prompts` `isTTY()` source = `(stream) => stream.isTTY === true` (verified via Node.js)
- Official docs: https://starlight-links-validator.vercel.app/getting-started/ — installation and config
- Official docs: https://starlight-links-validator.vercel.app/configuration/ — configuration options

### Secondary (MEDIUM confidence)

- GitHub releases: https://github.com/HiDeoo/starlight-links-validator/releases — latest version 0.19.2 (Dec 2025)
- WebSearch: Confirmed `starlight-links-validator` is the Starlight plugin registry recommended tool for link validation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in existing `package.json` or official docs
- Architecture (doc pages): HIGH — exact file paths, frontmatter format, sidebar registration verified from codebase
- TTY guard implementation: HIGH — existing patterns in `generate.ts` and `auth/resolve.ts` verified in source
- `starlight-links-validator` config: HIGH — verified via official docs and runtime
- Pitfalls: HIGH for most; MEDIUM for build-time performance (not measured on this project)

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable libraries; Starlight plugin API unlikely to change)
