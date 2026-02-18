# Contributing to handover

handover is a CLI tool that generates comprehensive codebase documentation by combining static analysis with LLM reasoning. Contributions help make knowledge transfer easier for teams handing off projects. All contributions — code, docs, bug reports, and ideas — are welcome.

## Prerequisites

- Node >= 18
- An LLM API key (required for integration tests — any supported provider works)

## Quick start

```bash
git clone https://github.com/farce1/handover.git
cd handover
npm install
npm run build
```

Run tests:

```bash
npm test                              # Unit/integration tests
HANDOVER_INTEGRATION=1 npm test      # Integration tests (requires API key)
```

## Guides

- [Architecture](docs/contributor/architecture.md): How a handover run flows from CLI entry to rendered output
- [Development](docs/contributor/development.md): Local dev workflow from clone to PR — commands, testing, and conventions
- [Adding a provider](docs/contributor/adding-providers.md): Step-by-step guide to implementing a new LLM provider
- [Adding an analyzer](docs/contributor/adding-analyzers.md): Step-by-step guide to implementing a new static analyzer

## Finding work

Browse [issues labeled `good first issue`](https://github.com/farce1/handover/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) to get started. Submit pull requests against `main`. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
