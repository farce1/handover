# Stack Research

**Domain:** OSS CLI Tool Infrastructure (documentation, CI/CD, contributor experience, LLM-friendliness)
**Researched:** 2026-02-18
**Confidence:** HIGH (versions verified via npm registry; tooling choices verified via official docs and multiple sources)

---

## Context

Handover is a brownfield TypeScript CLI (Node.js, Commander.js, Vitest, tsup), published as `handover-cli` on npm. The existing runtime stack is settled. This research covers the **OSS infrastructure layer**: what tools top-tier open source CLI projects use for CI/CD, changelog automation, contributor experience, docs, and LLM-friendliness.

---

## Recommended Stack

### CI/CD — GitHub Actions Workflows

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `actions/checkout` | `v4` | Checkout code in workflows | Current major; v3 is stale; v4 uses Node.js 20 internally |
| `actions/setup-node` | `v4` | Install Node.js with caching | v4 supports automatic npm cache; `cache: 'npm'` one-liner |
| `googleapis/release-please-action` | `v4` | Automated release PRs + CHANGELOG | PR-based release gate (merge to ship); generates CHANGELOG.md from conventional commits; the `google-github-actions/release-please-action` repo was archived Aug 2024, moved to `googleapis/` org |
| `codecov/codecov-action` | `v5` | Upload coverage to Codecov | v5 is current; supports Vitest LCOV output; free for OSS; more granular metrics than Coveralls |

**Workflow files to create:**

- `.github/workflows/ci.yml` — test + lint + typecheck on every PR and push to main
- `.github/workflows/release.yml` — runs release-please; conditionally publishes to npm when release PR merges

**CI matrix:** Test against Node.js `20` and `22` (both LTS). Node 18 reaches EOL April 2025; Node 20 is current LTS; Node 22 is next LTS. Match `engines.node` in `package.json`.

---

### Changelog Automation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `googleapis/release-please-action` | `v4` | Generates CHANGELOG.md, bumps versions, opens release PRs | PR-based workflow gives one review gate before shipping; ideal for a single-package npm CLI where you want controlled releases without surprise publishes |

**Why release-please over alternatives:**
- **vs. semantic-release:** semantic-release auto-publishes on merge with no human checkpoint. For a solo/small-team project, release-please's PR-based approach adds a deliberate review step before each npm publish.
- **vs. changesets:** changesets requires every contributor to create a changeset file. For an OSS CLI that primarily accepts community bug fixes, this extra step adds friction. Release-please derives releases automatically from commit messages.
- **vs. standard-version:** deprecated; unmaintained since 2022.

**Configuration:** `release-type: node` in the action config; commit messages must follow Conventional Commits (enforced by commitlint in the pre-commit hook stack).

---

### Commit Quality Enforcement

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `husky` | `9.1.7` | Git hooks manager | v9 drops the old JS config for a shell-script-per-hook model; zero dependencies; 2 kB gzipped |
| `@commitlint/cli` | `20.4.1` | Validates commit messages against conventional commits spec | Enforced locally so contributors can't break the changelog automation |
| `@commitlint/config-conventional` | `20.4.1` | Preset extending Conventional Commits v1.0.0 | Standard preset; what release-please parses |
| `lint-staged` | `16.2.7` | Run linters only on staged files | Prevents slow pre-commit hooks that lint the entire codebase; only touches changed files |
| `prettier` | `3.8.1` | Code formatter | Opinionated, zero-config for contributors; v3 is current; integrates with lint-staged |
| `eslint` | `10.0.0` | Linter | ESLint v10 uses flat config by default; v9/v10 is the current generation |
| `typescript-eslint` | `8.56.0` | TypeScript-aware ESLint rules | The unified package (replaces `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`); v8 supports ESLint flat config natively |

**Why this exact stack:**
husky v9 + commitlint is the industry standard for enforcing conventional commits in OSS TypeScript projects. lint-staged + prettier is what keeps contributor PRs clean without requiring them to manually format. ESLint v10 flat config (`eslint.config.mjs`) replaces the deprecated `.eslintrc.*` pattern.

---

### Documentation Infrastructure

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Markdown files in `docs/` | — | User-facing reference docs | No build step; GitHub renders natively; LLM-readable; works without a deployed docs site |
| `llms.txt` at repo root | spec v1 | LLM-friendly project manifest | The emerging standard (llmstxt.org); adopted by Anthropic, Cursor, LangChain, thousands of Mintlify-hosted sites; makes the project discoverable to AI agents |

**Why NOT VitePress or Docusaurus for now:** Both are 4-6 hour setup investments with deployment infrastructure (GitHub Pages/Netlify). For a CLI tool where most users arrive via npm, Markdown docs in `docs/` serve 90% of needs. VitePress can be added later when the project reaches critical mass. Start with what GitHub renders.

---

### Badges and Discoverability

| Technology | Purpose | Format |
|------------|---------|--------|
| shields.io | npm version, CI status, license, coverage badges | `https://img.shields.io/npm/v/handover-cli` |

**Recommended badge set for README header:**

```markdown
[![npm version](https://img.shields.io/npm/v/handover-cli)](https://www.npmjs.com/package/handover-cli)
[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Coverage](https://codecov.io/gh/OWNER/REPO/graph/badge.svg)](https://codecov.io/gh/OWNER/REPO)
```

---

### Community Infrastructure Files

| File | Location | Purpose | Format |
|------|----------|---------|--------|
| `CONTRIBUTING.md` | repo root | How to contribute: setup, PR process, commit format | Markdown |
| `CODE_OF_CONDUCT.md` | repo root | Community expectations | Markdown (Contributor Covenant v2.1 is the standard) |
| `SECURITY.md` | repo root | How to report vulnerabilities | Markdown |
| `CHANGELOG.md` | repo root | Release history | Auto-generated by release-please; never hand-edited |
| `FUNDING.yml` | `.github/` | GitHub Sponsors button | YAML; `github: [username]` or `custom: [URL]` |
| Bug report template | `.github/ISSUE_TEMPLATE/bug_report.yml` | Structured bug reports | GitHub YAML issue form (not markdown template) |
| Feature request template | `.github/ISSUE_TEMPLATE/feature_request.yml` | Feature proposals | GitHub YAML issue form |
| Issue template config | `.github/ISSUE_TEMPLATE/config.yml` | Disable blank issues; add contact links | YAML |
| PR template | `.github/PULL_REQUEST_TEMPLATE.md` | Checklist for PR authors | Markdown |

**Why YAML issue forms over markdown templates:** GitHub's YAML-based issue forms enforce structured input via form fields, dropdowns, and checkboxes. Research shows they reduce resolution time and reopen rates compared to freeform markdown templates. Use `.yml` extension in `.github/ISSUE_TEMPLATE/`.

---

### LLM-Friendliness

| Artifact | Location | Purpose |
|----------|----------|---------|
| `llms.txt` | repo root | Machine-readable project manifest for AI crawlers and coding assistants |
| `docs/llms-full.txt` | `docs/` | Full concatenated documentation for LLMs with limited context windows |

**llms.txt format (current spec v1, from llmstxt.org):**

```markdown
# handover-cli

> Generate AI-powered codebase documentation for seamless handovers between developers and AI assistants.

handover-cli is a TypeScript CLI tool that analyzes your codebase and generates comprehensive Markdown documentation optimized for LLM consumption.

## Docs

- [Getting Started](docs/getting-started.md): Installation and first run
- [Configuration](docs/configuration.md): TOML config reference
- [CLI Reference](docs/cli-reference.md): All commands and flags

## Examples

- [Basic Usage](docs/examples/basic.md): Common workflows
- [Advanced Config](docs/examples/advanced.md): Custom prompts and output

## Optional

- [CHANGELOG](CHANGELOG.md): Release history
- [CONTRIBUTING](CONTRIBUTING.md): How to contribute
```

**Why llms.txt matters for this project specifically:** handover-cli's primary audience includes developers using AI coding assistants. A well-structured `llms.txt` makes the tool self-describing to those same assistants. Adoption has crossed the threshold: Anthropic, Cursor, and LangChain all publish `llms.txt`. Not having one in 2026 is a missed signal.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `release-please` | `semantic-release` | semantic-release auto-publishes with no human checkpoint; a surprise `3.0.0` publish from a miscategorized commit breaks users |
| `release-please` | `changesets` | changesets requires contributors to create changeset files; adds friction for community PRs |
| `release-please` | `standard-version` | Unmaintained since 2022; do not use |
| `typescript-eslint` v8 unified | `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` separately | The separate packages are the old pattern; `typescript-eslint` v8 is the unified modern package |
| `eslint` v10 flat config | `.eslintrc.json` | `.eslintrc.*` format is deprecated as of ESLint v9; ESLint v10 drops it |
| `googleapis/release-please-action` | `google-github-actions/release-please-action` | The `google-github-actions` repo was archived Aug 2024; use `googleapis` org |
| Markdown `docs/` | VitePress or Docusaurus | Overkill for initial OSS launch; adds deployment complexity; defer until project needs full docs site |
| Codecov | Coveralls | Codecov has better metrics (line/branch/function), better PR integration, and a better free tier for OSS |
| shields.io | badgen.net | shields.io is the de-facto standard; more badge types; better maintained |
| YAML issue forms | Markdown issue templates | YAML forms enforce structure; markdown templates are free-text and get ignored |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `standard-version` | Unmaintained since 2022; no active development | `release-please` |
| `@semantic-release/*` for this project | Over-engineered for single-package CLI; auto-publish without checkpoint | `release-please` |
| `google-github-actions/release-please-action` | Archived Aug 2024; repo is read-only | `googleapis/release-please-action@v4` |
| `.eslintrc.json` / `.eslintrc.js` | Deprecated ESLint config format; dropped in ESLint v10 | `eslint.config.mjs` (flat config) |
| `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` separately | Old pattern; unified `typescript-eslint` replaces both | `typescript-eslint` v8 |
| VitePress/Docusaurus at launch | 4-6 hour investment; deployment overhead; wrong priority for OSS launch phase | Markdown in `docs/` folder |
| Markdown issue templates (`.md`) | Freeform text; contributors skip sections | YAML issue forms (`.yml`) |
| Semantic versioning by hand | Error-prone; inconsistent; wastes maintainer time | release-please automation |
| `husky` v4 / `.huskyrc` config | Old husky; the new v9 shell-script model is faster and simpler | `husky` v9 |

---

## Installation

```bash
# Commit quality enforcement (dev deps only)
npm install -D husky lint-staged @commitlint/cli @commitlint/config-conventional

# Linting and formatting
npm install -D eslint typescript-eslint prettier

# Initialize husky
npx husky init

# No additional npm installs needed for CI/CD (GitHub Actions) or docs (Markdown)
```

**Husky hooks to configure:**
- `.husky/commit-msg` → `npx --no -- commitlint --edit "$1"`
- `.husky/pre-commit` → `npx lint-staged`

**`lint-staged` config in `package.json`:**
```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

**`commitlint.config.js`:**
```js
export default { extends: ['@commitlint/config-conventional'] };
```

---

## CI Workflow Skeletons

### `.github/workflows/ci.yml`
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v5
        if: matrix.node-version == 22
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
```

### `.github/workflows/release.yml`
```yaml
name: Release
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
          release-type: node

  publish:
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `typescript-eslint@8` | `eslint@9-10`, `typescript@5` | Do NOT use `@typescript-eslint/*` v7 with ESLint v10; use unified `typescript-eslint` v8 |
| `husky@9` | Node.js ≥ 18 | Requires `"prepare": "husky"` in `package.json` scripts |
| `lint-staged@16` | Node.js ≥ 18, `husky@9` | v16 is current; v15 had breaking changes around config format |
| `googleapis/release-please-action@v4` | Node.js release type with `package.json` | Uses `release-type: node`; reads `version` from `package.json` |
| `codecov/codecov-action@v5` | Vitest with `coverage.reporter: ['lcov']` | Must configure Vitest to emit `lcov` format; add `@vitest/coverage-v8` |

---

## Stack Patterns by Variant

**If sole maintainer (no team):**
- Stick with release-please (PR-based); gives you a review moment before each publish
- Skip `lint-staged` for speed (keep commitlint; it directly enables release automation)

**If accepting high-volume community PRs:**
- Keep the full lint-staged + prettier + commitlint stack; it prevents you from reviewing formatting in PRs
- Add `CODEOWNERS` file to auto-assign PR reviewers

**If adding a docs site later:**
- Use VitePress (simpler than Docusaurus; faster builds; Vue-based but irrelevant for a docs site; excellent for TypeScript projects)
- Deploy to GitHub Pages via Actions
- Maintain `llms.txt` pointing to the deployed site URLs

---

## Sources

- [llmstxt.org](https://llmstxt.org/) — llms.txt spec v1 (required H1, blockquote summary, H2-delimited file lists) — HIGH confidence
- [googleapis/release-please-action](https://github.com/googleapis/release-please-action) — v4 current; `release-type: node`; `googleapis` org is active replacement for archived `google-github-actions` org — HIGH confidence (official repo)
- [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) — spec for commit message format that release-please and commitlint parse — HIGH confidence (official spec)
- [npm registry — husky@9.1.7](https://www.npmjs.com/package/husky) — verified via `npm show husky version` — HIGH confidence
- [npm registry — lint-staged@16.2.7](https://www.npmjs.com/package/lint-staged) — verified via `npm show lint-staged version` — HIGH confidence
- [npm registry — @commitlint/cli@20.4.1](https://www.npmjs.com/package/@commitlint/cli) — verified via `npm show` — HIGH confidence
- [npm registry — prettier@3.8.1](https://www.npmjs.com/package/prettier) — verified via `npm show` — HIGH confidence
- [npm registry — eslint@10.0.0](https://www.npmjs.com/package/eslint) — verified via `npm show` — HIGH confidence
- [npm registry — typescript-eslint@8.56.0](https://www.npmjs.com/package/typescript-eslint) — verified via `npm show` — HIGH confidence
- [shields.io NPM Version badge](https://shields.io/badges/npm-version) — URL format verified — HIGH confidence
- [GitHub Docs — Issue Forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms) — YAML form syntax — HIGH confidence (official docs)
- [GitHub Docs — FUNDING.yml](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository) — format verified — HIGH confidence
- [oleksiipopov.com — NPM Release Automation comparison](https://oleksiipopov.com/blog/npm-release-automation/) — release-please vs semantic-release vs changesets analysis — MEDIUM confidence (secondary source, matches official docs)
- [codecov/codecov-action@v5](https://github.com/codecov/codecov-action) — v5 is current; integrates with Vitest LCOV — MEDIUM confidence (WebSearch verified)
- [ESLint flat config 2025](https://eslint.org/blog/2025/03/flat-config-extends-define-config-global-ignores/) — v9/v10 deprecates `.eslintrc.*` — HIGH confidence (official ESLint blog)
- GitHub Actions `setup-node@v4` — supports `cache: 'npm'` automatically when `package.json` has `packageManager` field — HIGH confidence (official GitHub docs)

---

*Stack research for: OSS infrastructure for handover-cli*
*Researched: 2026-02-18*
