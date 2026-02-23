---
title: Output documents
---

# Output documents

handover generates 14 interconnected markdown documents in the configured output directory (default: `./handover/`). Each document covers a distinct aspect of the project. They are cross-referenced with links and include YAML front-matter for programmatic consumption.

The renderers that produce each document are in `src/renderers/`. Each renderer file name maps directly to the document it produces.

## Documents

| #   | Filename                       | Renderer                       | What it covers                                                         |
| --- | ------------------------------ | ------------------------------ | ---------------------------------------------------------------------- |
| 00  | `00-INDEX.md`                  | `render-00-index.ts`           | Master index with document status and navigation links                 |
| 01  | `01-PROJECT-OVERVIEW.md`       | `render-01-overview.ts`        | Project purpose, tech stack, entry points, and 2-sentence summary      |
| 02  | `02-GETTING-STARTED.md`        | `render-02-getting-started.ts` | Setup, first run, and development workflow for the analysed project    |
| 03  | `03-ARCHITECTURE.md`           | `render-03-architecture.ts`    | System design, architectural patterns, and module relationships        |
| 04  | `04-FILE-STRUCTURE.md`         | `render-04-file-structure.ts`  | Annotated directory tree with file-by-file explanations                |
| 05  | `05-FEATURES.md`               | `render-05-features.ts`        | Feature inventory with code traces back to implementation              |
| 06  | `06-MODULES.md`                | `render-06-modules.ts`         | Module-by-module deep dive: purpose, API surface, dependencies         |
| 07  | `07-DEPENDENCIES.md`           | `render-07-dependencies.ts`    | External dependencies, internal dependency graph, risk assessment      |
| 08  | `08-ENVIRONMENT.md`            | `render-08-environment.ts`     | Environment variables, secrets, config files, and runtime requirements |
| 09  | `09-EDGE-CASES-AND-GOTCHAS.md` | `render-09-edge-cases.ts`      | Gotchas, error handling patterns, and known failure modes              |
| 10  | `10-TECH-DEBT-AND-TODOS.md`    | `render-10-tech-debt.ts`       | TODOs, complexity hotspots, and refactoring opportunities              |
| 11  | `11-CONVENTIONS.md`            | `render-11-conventions.ts`     | Coding patterns, naming conventions, and project-specific rules        |
| 12  | `12-TESTING-STRATEGY.md`       | `render-12-testing.ts`         | Test strategy, coverage posture, and test file locations               |
| 13  | `13-DEPLOYMENT.md`             | `render-13-deployment.ts`      | Build process, CI/CD pipeline, and deployment targets                  |

## Document relationships

The documents are designed to complement each other. They cross-reference each other with links so a reader can navigate from an architecture overview straight to module details, or from a feature trace to the testing document. The index (`00-INDEX.md`) is the canonical entry point and shows the generation status of all other documents.

Some documents depend on AI analysis rounds to reach full quality. When `--static-only` is used, AI-enriched sections are noted as unavailable and the document is populated with static analysis data only. All 14 documents are always generated regardless of mode.

Documents include YAML front-matter (`title`, `documentId`, `status`, `aiRoundsUsed`) that makes them suitable for programmatic consumption and RAG ingestion. Use `--audience ai` to produce output with additional structured YAML blocks throughout the document body.

## Example output

This is what the opening of `01-PROJECT-OVERVIEW.md` looks like for a typical project:

```markdown
---
title: Project Overview
documentId: 01-project-overview
category: overview
status: complete
aiRoundsUsed:
  - round: 1
    name: Project Overview
---

# Project Overview

my-api is a Node.js REST API for managing customer orders. Built with TypeScript,
it exposes a GraphQL interface backed by PostgreSQL and is deployed to AWS Lambda.

## What This Project Does

Provides order lifecycle management — creation, payment, fulfilment, and returns —
via a GraphQL API consumed by the company's mobile and web clients.

## Tech Stack

| Layer    | Technology              |
| -------- | ----------------------- |
| Runtime  | Node.js 20              |
| Language | TypeScript 5            |
| API      | GraphQL (Apollo Server) |
| Database | PostgreSQL via Prisma   |
| Auth     | JWT + AWS Cognito       |

## Entry Points

- `src/index.ts` — Lambda handler, initialises the Apollo Server
- `src/schema/index.ts` — GraphQL schema root
```

## Generating specific documents

Use `--only` to generate a subset of documents. This reduces API cost when you only need certain views:

```bash
# Generate only architecture and modules
npx handover-cli generate --only arch,modules

# Generate the onboarding group (overview, getting-started, arch, file-structure)
npx handover-cli generate --only onboard

# Generate quality-related docs (edge-cases, tech-debt, testing, conventions)
npx handover-cli generate --only quality
```

Available group aliases: `core` (arch, modules, features), `ops` (env, deploy, deps), `onboard` (overview, getting-started, arch, files), `quality` (edge-cases, tech-debt, testing, conventions).
