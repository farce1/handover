# Contributing to handover-cli

handover-cli generates AI-powered codebase documentation — the kind of summary you'd write to hand off a codebase to another developer (or LLM). Contributions are welcome. By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Prerequisites

- **Node.js** >= 18
- **git**

---

## Getting Started

```bash
git clone https://github.com/farce1/handover.git
cd handover
npm install
npm run build
npm test
```

If all tests pass, you're ready to make changes.

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Run CLI from source with tsx (no build step needed) |
| `npm run build` | Build production output with tsup |
| `npm test` | Run test suite with Vitest |
| `npm run typecheck` | Type-check source files with tsc (no emit) |

Run `npm test` and `npm run typecheck` before pushing any changes.

---

## Branch Naming Convention

Use a type prefix that matches the commit type:

```
feat/short-description
fix/short-description
docs/short-description
chore/short-description
```

Examples:
- `feat/add-gemini-provider`
- `fix/parser-null-check`
- `docs/contributing-guide`
- `chore/update-deps`

---

## Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description
```

**Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`

**Examples:**
- `feat(providers): add Gemini support`
- `fix(parser): handle empty files`
- `docs(readme): update usage examples`
- `test(analyzers): add edge case coverage`

Commit messages drive automated changelog generation via release-please, so correct formatting matters.

---

## Opening an Issue

All issues must use a template — blank issues are disabled. Choose the template that fits:

- **Bug report** — something is broken
- **Feature request** — something should be added or changed
- **Documentation improvement** — something is missing, wrong, or unclear

The templates guide you to provide the information needed to act on the issue quickly.

---

## Submitting a Pull Request

1. Fork the repository and create a branch following the naming convention above.
2. Make your changes.
3. Ensure `npm test` and `npm run typecheck` pass with no new failures.
4. Push your branch and open a PR against `main`.
5. Fill out the PR template checklist.

Community reviewers are welcome to review each other's PRs — this speeds things up. The maintainer gives final approval before merging.

---

## Code Review Process

- Be specific and constructive. Point to code, not people.
- Explain *why* you're requesting a change, not just *what* to change.
- Contributors are encouraged to review open PRs — it's a great way to learn the codebase.
- The maintainer gives final approval on all merges.

---

## Architecture Overview

The source lives under `src/`. Here's a quick tour:

| Directory | Purpose |
|-----------|---------|
| `src/cli/` | CLI entry point (Commander.js) |
| `src/config/` | Configuration loading and validation |
| `src/domain/` | Zod domain models and types |
| `src/parsing/` | Language parsers (tree-sitter) |
| `src/analyzers/` | Static analysis pipeline (8 analyzers) |
| `src/providers/` | LLM provider adapters (Anthropic, OpenAI, etc.) |
| `src/ai-rounds/` | Multi-round AI analysis orchestration |
| `src/orchestrator/` | DAG-based pipeline orchestrator |
| `src/renderers/` | Document output renderers |
| `src/context/` | Context window management |
| `src/grammars/` | Tree-sitter grammar loading |
| `src/cache/` | Response caching |
| `src/ui/` | Terminal UI components |
| `src/utils/` | Shared utilities |

If you're adding a new LLM provider, look at `src/providers/`. If you're adding a new language parser, start in `src/parsing/`.
