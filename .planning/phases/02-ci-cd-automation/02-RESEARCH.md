# Phase 2: CI/CD Automation - Research

**Researched:** 2026-02-18
**Domain:** GitHub Actions CI/CD, release automation, DX tooling, security scanning
**Confidence:** HIGH (core stack verified via Context7 and official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### CI strictness
- Node matrix: 20 + 22 (LTS only)
- Full quality gate on PRs: lint + typecheck + tests + build must all pass to merge
- Test coverage threshold: 80% minimum — blocks PRs that drop below
- Integration tests: skip unless `HANDOVER_INTEGRATION` env var is set (maintainer/nightly opt-in)

#### Release flow
- Fully automatic: merge release-please PR → npm publish via OIDC, no manual step
- CHANGELOG.md starts fresh from next release — no retroactive entries
- release-please takes over changelog generation from conventional commits

#### DX tooling
- Pre-commit hooks: husky + lint-staged runs ESLint fix and Prettier on staged files (auto-corrects)
- Commitlint: enforce conventional commits — reject non-conforming commit messages
- Prettier: add fresh — install and configure with standard settings, format entire codebase
- Dependabot: weekly PRs, grouped by type (one PR for production deps, one for dev deps)

#### Trust signals
- Badges: CI status, npm version, npm downloads, license, Scorecard, CodeQL, coverage
- Coverage reporting service: Claude's discretion (Codecov or Coveralls — pick best fit for OSS)

### Claude's Discretion
- Pre-release channel (beta) — decide based on project maturity and need
- release-please config pattern (standalone vs manifest) — pick what fits current repo structure
- CodeQL scan scope (TS/JS only vs also Actions workflows) — decide based on value
- Badge placement in README — fit with existing structure
- Coverage service choice (Codecov or Coveralls)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This phase wires together six distinct subsystems: CI quality gate, release automation, DX pre-commit hooks, dependency management, security scanning, and trust signal badges. Each subsystem is well-defined with clear standard tooling for the Node/GitHub ecosystem. The stack is mature and all tools have active maintenance and high ecosystem adoption.

The biggest planning concern is the **npm OIDC trusted publishing requirement**: it requires npm ≥11.5.1 OR Node ≥22.14.0. The publish job must explicitly upgrade npm or use a Node version that ships with a compatible npm. The matrix uses Node 20 and 22, which both satisfy the npm 11 runtime requirement (`^20.17.0 || >=22.9.0`), but GitHub-hosted runners may ship an older npm — the publish workflow must run `npm install -g npm@latest` before publishing.

The second planning concern is the **release-please token**: the default `GITHUB_TOKEN` prevents CI checks from triggering on release PRs (GitHub security measure to prevent recursive workflows). A PAT (`RELEASE_PLEASE_TOKEN` secret) must be configured and passed as the `token` input.

**Primary recommendation:** Use manifest config for release-please (recommended over standalone even for single packages per official docs), OIDC for npm publish, Codecov for coverage, and keep ESLint flat config (`eslint.config.js`) since the project already uses ESM (`"type": "module"`).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `googleapis/release-please-action` | v4 | Automates release PRs, changelog, version bumps | Official Google action, PR-based gate before publish |
| `github/codeql-action` | v4 | Static security analysis for JS/TS | Official GitHub security scanning |
| `ossf/scorecard-action` | v2.4.3 | OpenSSF supply chain security score | Required for Scorecard badge |
| `husky` | 9.1.7 | Git hook management | Near-zero config, fastest modern git hooks tool |
| `lint-staged` | 16.2.7 | Run linters on staged files only | Standard companion to husky |
| `prettier` | 3.8.1 | Opinionated code formatter | Zero-config formatting standard |
| `@commitlint/cli` | 20.4.1 | Lint commit messages in CI and pre-commit | Standard conventional-commit enforcer |
| `@commitlint/config-conventional` | 20.4.1 | Shared conventional-commits ruleset | Official shareable config |
| `eslint` | 9.x | JavaScript/TypeScript linting | Industry standard |
| `typescript-eslint` | latest | TypeScript ESLint integration | Official TS+ESLint bridge |
| `@vitest/coverage-v8` | (matches vitest) | Coverage provider for vitest | Built-in v8 coverage, no extra setup |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `eslint-config-prettier` | latest | Disables ESLint rules that conflict with Prettier | Required when using both ESLint and Prettier |
| `codecov/codecov-action` | v4+ | Upload coverage to Codecov | Part of CI quality gate |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Codecov | Coveralls | Coveralls has higher npm weekly downloads (667k vs 396k) and is recommended for small OSS; Codecov offers richer branch/function analytics and a more modern GitHub Actions integration. **Chosen: Codecov** — better branch/function metrics, widely adopted in modern OSS, 3-line Actions setup |
| release-please manifest config | Standalone `release-type: node` | Standalone works for single packages but manifest is now the recommended pattern per official docs ("highly recommend using manifest configurations even for single library repositories") and reduces API calls |
| ESLint flat config (eslint.config.js) | Legacy .eslintrc | Legacy format was removed in ESLint 9. Project uses ESM so `eslint.config.js` is the correct filename |
| `@vitest/coverage-v8` | `@vitest/coverage-istanbul` | v8 now uses AST-based remapping (since Vitest 3.2.0) producing identical accuracy to istanbul; no extra instrumentation overhead |

**Installation (DX tooling):**
```bash
npm install --save-dev husky lint-staged prettier eslint typescript-eslint eslint-config-prettier @commitlint/cli @commitlint/config-conventional @vitest/coverage-v8
```

---

## Architecture Patterns

### Recommended Workflow File Structure
```
.github/
├── workflows/
│   ├── ci.yml               # quality gate (lint, typecheck, test, build)
│   ├── release-please.yml   # release PR automation + npm publish on release
│   ├── codeql.yml           # CodeQL security analysis
│   └── scorecard.yml        # OpenSSF Scorecard
├── dependabot.yml           # dependency update config (NOT in workflows/)
```

### Pattern 1: CI Quality Gate Workflow (ci.yml)

**What:** Runs lint + typecheck + tests + build on every push and PR across Node 20 and 22 matrix. Integration tests are gated behind `HANDOVER_INTEGRATION`.

**When to use:** Always triggers on `push` and `pull_request`.

```yaml
# Source: Context7 / GitHub Actions official docs
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  quality:
    name: Quality Gate (Node ${{ matrix.node-version }})
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
        env:
          # Integration tests opt-in: not set here, so they skip
          HANDOVER_INTEGRATION: ''
      - run: npm run build
      - uses: codecov/codecov-action@v4
        if: matrix.node-version == 20  # Upload once, not per matrix leg
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info
```

### Pattern 2: release-please Manifest Config + npm Publish

**What:** release-please monitors conventional commits on `main`, creates and updates a "Release PR". When merged, it creates the GitHub Release tag. The same workflow then publishes to npm via OIDC.

**Manifest config (recommended over standalone) — two files needed:**

`release-please-config.json`:
```json
{
  "packages": {
    ".": {
      "release-type": "node",
      "changelog-path": "CHANGELOG.md",
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": true
    }
  }
}
```

`.release-please-manifest.json`:
```json
{
  ".": "0.1.0"
}
```

`release-please.yml` workflow:
```yaml
# Source: Context7 /googleapis/release-please-action
name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          # PAT required so CI checks trigger on the release PR
          token: ${{ secrets.RELEASE_PLEASE_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json

  publish:
    needs: release-please
    if: needs.release-please.outputs.release_created
    runs-on: ubuntu-latest
    permissions:
      id-token: write  # Required for OIDC trusted publishing
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      # OIDC requires npm >=11.5.1; upgrade npm on the runner
      - run: npm install -g npm@latest
      - run: npm ci
      - run: npm run build
      - run: npm publish --provenance --access public
        # No NODE_AUTH_TOKEN needed with OIDC trusted publishing
```

### Pattern 3: Husky + lint-staged + commitlint

**What:** Pre-commit hook auto-fixes ESLint and Prettier on staged files. Commit-msg hook rejects commits that don't follow conventional commits format.

```bash
# Source: Context7 /websites/typicode_github_io_husky + /websites/commitlint_js

# Install
npx husky init
# Creates .husky/pre-commit and adds "prepare": "husky" to package.json

# Add pre-commit hook
echo "npx lint-staged" > .husky/pre-commit

# Add commit-msg hook
echo "npx --no -- commitlint --edit \$1" > .husky/commit-msg
```

`lint-staged` config in `package.json`:
```json
{
  "lint-staged": {
    "*.{ts,js}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

`commitlint.config.js`:
```js
// Source: Context7 /websites/commitlint_js
export default { extends: ['@commitlint/config-conventional'] };
```

### Pattern 4: Commitlint in CI

**What:** Validates commit messages in CI to catch direct pushes that bypass local hooks.

```yaml
# Source: Context7 /websites/commitlint_js — CI setup guide
- name: Validate commits
  if: github.event_name == 'pull_request'
  run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose
```

Note: `fetch-depth: 0` is required on the checkout step when using commitlint in CI.

### Pattern 5: CodeQL Workflow

**What:** Static analysis for security vulnerabilities. Runs on push/PR and weekly.

```yaml
# Source: github/codeql-action starter workflow
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 3 * * 1'  # weekly Monday 3am UTC

permissions:
  security-events: write
  contents: read  # required for private repos; harmless for public

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v4
        with:
          languages: javascript-typescript
          # Actions workflow scanning: adds value for supply chain but not required
          # Recommendation: include 'actions' language for full supply chain coverage
      - uses: github/codeql-action/autobuild@v4
      - uses: github/codeql-action/analyze@v4
```

**Scope decision (CodeQL language):** Use `javascript-typescript` only (TS/JS code). Including `actions` workflow scanning adds supply chain coverage but is low signal for this project at current maturity. Use JS/TS only.

### Pattern 6: OpenSSF Scorecard Workflow

**What:** Runs security posture checks, uploads results, and updates the Scorecard badge. Must run in strict isolation — no top-level env vars or permissions.

```yaml
# Source: ossf/scorecard-action README
name: Scorecard

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 4 * * 1'  # weekly Monday 4am UTC

jobs:
  analysis:
    name: Scorecard analysis
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      id-token: write    # required for publish_results: true
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: ossf/scorecard-action@v2.4.3
        with:
          results_file: results.sarif
          results_format: sarif
          publish_results: true
      - uses: actions/upload-artifact@v4
        with:
          name: SARIF file
          path: results.sarif
      - uses: github/codeql-action/upload-sarif@v4
        with:
          sarif_file: results.sarif
```

**Critical constraint:** Scorecard workflow CANNOT have top-level `env:` or `defaults:` keys, and only the scorecard job may have `id-token: write`. This must be a standalone workflow file.

### Pattern 7: Dependabot Grouped Updates

```yaml
# .github/dependabot.yml
# Source: GitHub Docs official — grouping by dependency-type
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    groups:
      production-deps:
        dependency-type: production
      dev-deps:
        dependency-type: development
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
```

Note: Including `github-actions` ecosystem keeps action versions current automatically.

### Pattern 8: Vitest Coverage Threshold

Add to `vitest.config.ts` to enforce 80% minimum and generate lcov for Codecov upload:

```typescript
// Source: vitest.dev/config/coverage
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],   // lcov required for Codecov upload
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

### Anti-Patterns to Avoid

- **Using `GITHUB_TOKEN` for release-please:** CI checks won't trigger on the release PR. Use a PAT secret (`RELEASE_PLEASE_TOKEN`).
- **Using `NPM_TOKEN` secret for publish:** OIDC trusted publishing is now GA and more secure. Remove `NODE_AUTH_TOKEN` entirely.
- **Top-level `env:` in the scorecard workflow:** Scorecard-action v2 will fail. Keep scorecard as an isolated file.
- **Running coverage upload on every matrix leg:** Upload once (e.g., `if: matrix.node-version == 20`) to avoid duplicate reports and rate limit issues.
- **Running `npm publish` without `--provenance`:** Omits attestation. Always include `--provenance --access public`.
- **Using `.eslintrc` format:** ESLint 9 dropped legacy config. Use `eslint.config.js` (flat config).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Changelog generation | Custom scripts | release-please | Handles section grouping, version detection, PR-based review gate |
| Commit message parsing for releases | Custom regex | release-please conventional commits | Complex edge cases (scopes, breaking change footers, multi-commit PRs) |
| npm publish token management | Manual token rotation | OIDC trusted publishing | No secret to store, rotate, or leak; short-lived credentials per publish |
| Coverage thresholds | Custom CI scripts | vitest `thresholds` config + codecov `fail_ci_if_error` | Built-in, integrates directly into test run |
| Staged-file linting | Custom git hooks | husky + lint-staged | Handles partial staging, stash-based restoring, performance |

**Key insight:** Every item in this phase has a high-quality, actively maintained tool. The planner should not invent any custom logic.

---

## Decisions Resolved (Claude's Discretion)

### 1. Pre-release channel (beta)
**Decision: Skip for now.** The project is at v0.1.0 with no public user base yet. A beta channel adds workflow complexity (separate branch strategy, pre-release versioning) without a clear audience. Release-please supports `prerelease-type: beta` in the manifest config if needed later. Pre-release can be added as a follow-on task.

### 2. release-please config pattern: Manifest
**Decision: Manifest config** (`release-please-config.json` + `.release-please-manifest.json`). The official release-please docs explicitly recommend manifest even for single-package repos: "We highly recommend using manifest configurations (even for single library repositories) as the configuration format is well defined and it reduces the number of necessary API calls."

### 3. CodeQL scan scope
**Decision: `javascript-typescript` only.** Actions workflow scanning adds marginal value at current project scale. The TS/JS codebase is the security surface area. Keep it simple; add `actions` language later if supply-chain posture requires it.

### 4. Badge placement in README
**Decision: Existing badge block.** The README already has a `<p align="center">` badge block with 4 badges (CI, npm version, license, downloads). Add coverage, Scorecard, and CodeQL badges to that same block. No structural change to README needed.

### 5. Coverage service: Codecov
**Decision: Codecov.** Offers branch/function/line/statement metrics vs. Coveralls' line-only default. Modern GitHub Actions integration (3-line workflow). Free for open source. The Codecov Action is widely adopted in the modern OSS ecosystem. One tradeoff: Codecov requires a `CODECOV_TOKEN` secret for public repos (or public repo token from Codecov dashboard — no billing info needed).

---

## Common Pitfalls

### Pitfall 1: release-please PRs don't trigger CI
**What goes wrong:** The release PR is created by `GITHUB_TOKEN`. By GitHub's design, resources created by `GITHUB_TOKEN` do not spawn new workflow runs. CI never runs on the release PR — it can be merged without passing checks.
**Why it happens:** GitHub prevents recursive workflow triggers as a security measure.
**How to avoid:** Pass a PAT (stored as `RELEASE_PLEASE_TOKEN` secret) as the `token` input to `googleapis/release-please-action@v4`.
**Warning signs:** Release PRs show no CI checks in the PR "Checks" tab.

### Pitfall 2: npm OIDC publish fails due to npm version
**What goes wrong:** The publish step fails with an authentication error even with correct `id-token: write` permissions.
**Why it happens:** npm OIDC trusted publishing requires npm ≥11.5.1. GitHub-hosted runners do not ship npm 11 by default (as of early 2026).
**How to avoid:** Add `run: npm install -g npm@latest` before the `npm publish` step in the publish job.
**Warning signs:** `npm publish` exits with 401/403 despite correct OIDC setup.

### Pitfall 3: Scorecard workflow has top-level env vars
**What goes wrong:** Scorecard-action fails or produces degraded results.
**Why it happens:** scorecard-action v2 enforces strict workflow constraints: no top-level `env:` or `defaults:`, only the scorecard job may have `id-token: write`.
**How to avoid:** Keep scorecard as a standalone, minimal workflow file. Do not add any shared env blocks.
**Warning signs:** Scorecard action throws permission or configuration errors in the run log.

### Pitfall 4: Coverage upload on every matrix leg causes duplicates
**What goes wrong:** Codecov receives N coverage uploads (one per matrix leg) and may report incorrect merged coverage or trigger rate limits.
**Why it happens:** Matrix jobs all run the same steps including coverage upload.
**How to avoid:** Gate the coverage upload step: `if: matrix.node-version == 20`.

### Pitfall 5: husky prepare script breaks CI installs
**What goes wrong:** `npm ci` in GitHub Actions runs the `prepare` script, which calls `husky`. This fails in CI environments that lack git.
**Why it happens:** Husky's `prepare` script runs on every `npm install` or `npm ci`.
**How to avoid:** Husky v9 auto-detects CI environments and skips installation in CI. No extra workaround needed as long as husky ≥9 is used.

### Pitfall 6: commitlint fetch-depth in CI
**What goes wrong:** commitlint fails to find the base commit SHA when validating a PR's commit range.
**Why it happens:** Default `actions/checkout` uses `fetch-depth: 1` (shallow clone), which doesn't include the base branch history.
**How to avoid:** Set `fetch-depth: 0` on the `actions/checkout` step when commitlint is running in CI.

### Pitfall 7: ESLint flat config filename with "type": "module"
**What goes wrong:** ESLint fails to load config, or uses wrong module format.
**Why it happens:** The project has `"type": "module"` in `package.json`. With ESM, `eslint.config.js` is loaded as ESM. Using `.cjs` or `.mjs` suffix adds unnecessary complexity.
**How to avoid:** Use `eslint.config.js` (no suffix). Export `default` array. This is correct for ESM projects.

---

## Code Examples

Verified patterns from official sources:

### ESLint Flat Config for TypeScript (ESM project)
```javascript
// eslint.config.js
// Source: typescript-eslint.io/getting-started
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
);
```

### Prettier Config
```javascript
// prettier.config.js (or .prettierrc)
// Standard config — no magic, matches community defaults
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
};
```

### Add lint script to package.json
```json
{
  "scripts": {
    "lint": "eslint src --max-warnings 0",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write ."
  }
}
```

### README Badge Block Addition
```html
<!-- Add to existing <p align="center"> badge block -->
<a href="https://codecov.io/gh/farce1/handover"><img src="https://codecov.io/gh/farce1/handover/branch/main/graph/badge.svg" alt="coverage"></a>
<a href="https://scorecard.dev/viewer/?uri=github.com/farce1/handover"><img src="https://api.scorecard.dev/projects/github.com/farce1/handover/badge" alt="OpenSSF Scorecard"></a>
<a href="https://github.com/farce1/handover/actions/workflows/codeql.yml"><img src="https://github.com/farce1/handover/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
```

Note: The README CI badge already references `ci.yml` (`workflow/status/farce1/handover/ci.yml`). That matches the planned workflow filename.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `.eslintrc.json` / `.eslintrc.js` | `eslint.config.js` (flat config) | ESLint 9.0, April 2024 | Legacy config removed; must use flat config |
| `NPM_TOKEN` secret for publish | OIDC trusted publishing (`--provenance`) | npm GA Sept 2025 | No long-lived secrets; provenance attestation auto-included |
| `release-please-action@v3` standalone `release-type` | `release-please-action@v4` manifest config | v4 release, 2023 | Manifest is now the recommended pattern for all repos |
| `istanbul`-only coverage in vitest | `v8` with AST remapping | Vitest 3.2.0, 2025 | v8 accuracy now matches istanbul; v8 is the default and preferred |
| `scorecard-action@v1` | `scorecard-action@v2.4.3` | v2, 2022; current 2025 | v2 requires `id-token: write`; badge publishing requires `publish_results: true` |

**Deprecated/outdated:**
- `NPM_TOKEN` for automated publishing: Still works but deprecated in favor of OIDC trusted publishing
- `release-please-action@v3`: Archived; v4 is current
- `google-github-actions/release-please-action`: Archived; moved to `googleapis/release-please-action`

---

## Open Questions

1. **RELEASE_PLEASE_TOKEN PAT scope**
   - What we know: A PAT is needed for CI checks to trigger on release PRs
   - What's unclear: Whether a fine-grained PAT (with limited repo scopes) or a classic PAT is needed
   - Recommendation: Use a fine-grained PAT with `contents: write`, `pull-requests: write`, `issues: write` on the repo. Document this in setup instructions.

2. **CHANGELOG.md initial state**
   - What we know: User decided CHANGELOG starts fresh — no retroactive entries
   - What's unclear: Whether to seed an empty `CHANGELOG.md` now or let release-please create it on first release PR
   - Recommendation: Seed a minimal `CHANGELOG.md` with a `# Changelog` header and a note that history begins from the next release. This prevents release-please from encountering a missing file on first run.

3. **Codecov token for public repos**
   - What we know: Codecov can work without a token for public repos (via the "public repo" flow), but the token prevents rate limiting
   - What's unclear: Whether the project will be a private or public GitHub repo at the time CI runs
   - Recommendation: Add `CODECOV_TOKEN` as a secret (free from Codecov dashboard for OSS) to avoid any rate-limit issues. Make it optional in the workflow (`if: secrets.CODECOV_TOKEN`) so it works even without the secret.

4. **npm trusted publishing — npmjs.com configuration**
   - What we know: The npm package must be published at least once manually before OIDC can be configured, OR the npm package page must exist for the trusted publisher to be set up
   - What's unclear: Has `handover-cli` been published to npm before? If not, the first publish must use `NPM_TOKEN` to create the package, then OIDC can be configured
   - Recommendation: Plan a "bootstrap publish" task: publish once manually or with NPM_TOKEN, then configure OIDC trusted publisher on npmjs.com, then switch to OIDC workflow.

---

## Sources

### Primary (HIGH confidence)
- Context7 `/googleapis/release-please-action` — workflow YAML, manifest config, OIDC npm publish
- Context7 `/googleapis/release-please` — manifest vs standalone recommendation, bootstrap, config schema
- Context7 `/websites/typicode_github_io_husky` — husky v9 install, prepare script, CI behavior
- Context7 `/websites/commitlint_js` — commitlint CI workflow, husky commit-msg hook, config
- https://vitest.dev/config/coverage — coverage thresholds, reporters, v8 provider
- https://github.com/ossf/scorecard-action — v2.4.3, workflow constraints, badge setup
- https://remarkablemark.org/blog/2025/12/19/npm-trusted-publishing/ — OIDC npm publish requirements

### Secondary (MEDIUM confidence)
- https://docs.npmjs.com/trusted-publishers/ — OIDC trusted publishing overview (page returned CSS only; information sourced via WebSearch cross-verification)
- WebSearch results for dependabot grouped updates — verified against GitHub Docs official reference
- WebSearch results for CodeQL starter workflow — cross-verified with github/codeql-action repository
- WebSearch: npm 11 node requirements (`^20.17.0 || >=22.9.0`) — multiple sources agree

### Tertiary (LOW confidence)
- Codecov vs Coveralls comparison — StackShare/npmtrends data; not official docs. Confidence: LOW for download numbers, MEDIUM for feature comparison

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools verified via Context7 or official docs; versions confirmed via npm registry
- Architecture patterns: HIGH — workflow YAMLs derived from official sources (Context7, scorecard-action README, GitHub starter workflows)
- Pitfalls: HIGH — GITHUB_TOKEN/release-please issue confirmed by official release-please docs; OIDC npm version requirement confirmed by official npm blog; others from Context7 official docs
- Discretion decisions: MEDIUM — based on available evidence and official recommendations, but some (pre-release skip, Codecov choice) involve judgment calls

**Research date:** 2026-02-18
**Valid until:** 2026-03-20 (stable ecosystem, but npm OIDC tooling moving fast — recheck if publish failures occur)
