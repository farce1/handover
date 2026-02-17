# Roadmap: handover

## Overview

Handover delivers a CLI tool that produces 14 interconnected, LLM-optimized markdown documents from any codebase via a 3-phase pipeline (static analysis, progressive AI synthesis, document rendering). The roadmap follows the data flow: foundation and domain model first, then language parsing, then static analyzers that produce deterministic facts, then AI rounds that transform facts into understanding, then document renderers that produce the final output. UX, providers, and reliability layer on top once the core pipeline works end-to-end. Nine phases deliver all 91 v1 requirements with comprehensive depth.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Project Foundation** - Domain model, config system, CLI scaffolding, and DAG orchestrator skeleton
- [ ] **Phase 2: Language Parsing** - Tree-sitter WASM integration for multi-language AST extraction with memory-safe lifecycle
- [ ] **Phase 3: Static Analysis Pipeline** - Eight concurrent analyzers extracting deterministic facts from the codebase
- [ ] **Phase 4: Context Window Management** - File priority scoring and token-budgeted content packing for LLM prompts
- [ ] **Phase 5: AI Analysis Rounds** - Six progressive AI rounds transforming static facts into structured understanding
- [ ] **Phase 6: Document Synthesis** - Fourteen cross-referenced markdown documents rendered from AI-populated domain entities
- [ ] **Phase 7: Terminal UX** - Rich progress display with spinners, progress bars, cost tracking, and CI/CD compatibility
- [ ] **Phase 8: Provider Ecosystem and Reliability** - OpenAI, Ollama, and custom providers plus caching and crash recovery
- [ ] **Phase 9: Integration and Hardening** - End-to-end pipeline validation, performance optimization, and npm publish readiness

## Phase Details

### Phase 1: Project Foundation
**Goal**: Developer has a working CLI skeleton with the domain model, config loader, DAG orchestrator, and Anthropic LLM provider that all downstream phases plug into
**Depends on**: Nothing (first phase)
**Requirements**: CLI-01, CLI-02, CLI-06, CLI-07, CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, PIPE-01, PIPE-05, PIPE-06, PROV-01, PROV-05, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):
  1. User can run `handover init` and get a valid `.handover.yml` created via interactive prompts
  2. User can run `handover generate` and see the DAG orchestrator execute placeholder steps in dependency order
  3. User can configure provider, model, include/exclude patterns, and business context in `.handover.yml` and see CLI flags override config values
  4. Anthropic provider can send a prompt and receive a Zod-validated structured response
  5. API keys are read from environment variables only, never stored in config files, and terminal clearly indicates when code is sent to cloud
**Plans**: 3 plans in 2 waves

Plans:
- [ ] 01-01-PLAN.md — TypeScript project setup, domain model Zod schemas, shared utilities (Wave 1)
- [ ] 01-02-PLAN.md — Config system with YAML loader and CLI commands with @clack/prompts init (Wave 2)
- [ ] 01-03-PLAN.md — DAG orchestrator, Anthropic provider, rate limiter, pipeline wiring (Wave 2)

### Phase 2: Language Parsing
**Goal**: Codebase files in TypeScript, Python, Rust, and Go are parsed into structured AST data (exports, imports, function signatures, class hierarchies) with safe WASM memory management, and all other languages fall back to regex extraction
**Depends on**: Phase 1
**Requirements**: LANG-01, LANG-02, LANG-03, LANG-04, LANG-05, LANG-06
**Success Criteria** (what must be TRUE):
  1. TypeScript/JavaScript file produces extracted exports, imports, function signatures, and class hierarchies via tree-sitter
  2. Python, Rust, and Go files each produce equivalent AST extraction via their respective tree-sitter grammars
  3. A Ruby or Java file (unsupported grammar) falls back to regex-based extraction and still produces function/class signatures
  4. Parsing 500+ files completes without WASM memory leaks (tree objects freed in try/finally)
  5. Grammar loading is lazy -- only grammars for detected languages are loaded
**Plans**: 3 plans in 2 waves

Plans:
- [ ] 02-01-PLAN.md — Parsing infrastructure: Zod symbol schemas, language map, ParserService with WASM safety, base extractor (Wave 1)
- [ ] 02-02-PLAN.md — TypeScript/JavaScript and Python tree-sitter extractors (Wave 2)
- [ ] 02-03-PLAN.md — Rust and Go tree-sitter extractors, regex fallback, public parsing API (Wave 2)

### Phase 3: Static Analysis Pipeline
**Goal**: Eight concurrent analyzers extract deterministic facts (file tree, dependencies, git history, TODOs, env vars, AST data, tests, docs) from any codebase and produce typed results that AI rounds can consume
**Depends on**: Phase 2
**Requirements**: STAT-01, STAT-02, STAT-03, STAT-04, STAT-05, STAT-06, STAT-07, STAT-08, STAT-09, STAT-10, CLI-03
**Success Criteria** (what must be TRUE):
  1. User can run `handover analyze --static-only` and get a complete static analysis report with zero AI cost
  2. All eight analyzers run concurrently and produce typed results (file tree, dependency graph, git history, TODOs, env vars, AST exports/imports, test locations, existing docs)
  3. .gitignore patterns are respected -- node_modules, build artifacts, and ignored paths never appear in results
  4. Package manifests (package.json, Cargo.toml, go.mod, requirements.txt, pyproject.toml) are correctly parsed for dependency information
  5. Static analysis of a 200-file project completes in under 5 seconds
**Plans**: 4 plans in 3 waves

Plans:
- [ ] 03-01-PLAN.md — Analyzer foundation: types, file discovery, cache, analysis context (Wave 1)
- [ ] 03-02-PLAN.md — Simple analyzers: FileTree, DependencyGraph, TodoScanner, EnvScanner (Wave 2)
- [ ] 03-03-PLAN.md — Complex analyzers: GitHistory, ASTAnalyzer, TestAnalyzer, DocAnalyzer (Wave 2)
- [ ] 03-04-PLAN.md — Coordinator, report formatter, CLI analyze command (Wave 3)

### Phase 4: Context Window Management
**Goal**: File priority scoring and token-budgeted packing ensure the most important files get full content in LLM prompts while less important files get signature-only summaries, all within provider token limits
**Depends on**: Phase 3
**Requirements**: CTX-01, CTX-02, CTX-03, CTX-04
**Success Criteria** (what must be TRUE):
  1. Files receive priority scores (0-100) based on entry point detection, import count, export count, git activity, edge case presence, and config file status
  2. High-priority files are included with full content, medium-priority files as signatures only, and low-priority files are skipped -- all within the provider's token budget
  3. Oversized files get two-pass treatment: signatures first, then deep-dive on important sections
  4. Inter-round context uses summarization/compression rather than raw concatenation
**Plans**: 3 plans in 2 waves

Plans:
- [ ] 04-01-PLAN.md — Zod schemas, token estimation, file priority scorer with six CTX-02 factors (Wave 1)
- [ ] 04-02-PLAN.md — Greedy context packer with signature extraction and oversized file two-pass (Wave 2)
- [ ] 04-03-PLAN.md — Deterministic context compressor, token usage tracker, config extensions (Wave 2)

### Phase 5: AI Analysis Rounds
**Goal**: Six progressive AI rounds transform static facts into structured understanding -- project overview, module boundaries, features, architecture patterns, edge cases, and deployment info -- with hallucination validation against AST-derived facts
**Depends on**: Phase 4
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, AI-06, AI-07, AI-08, AI-09, PIPE-02, PIPE-03, PIPE-04, PIPE-07, PIPE-08
**Success Criteria** (what must be TRUE):
  1. Round 1 produces a project overview, Round 2 identifies module boundaries, and each subsequent round builds on prior round outputs as accumulated context
  2. Rounds 3 (features), 5 (edge cases), and 6 (deployment) run in parallel after Round 2 completes, achieving at least 40% speedup over sequential execution
  3. Round 5 fans out per-module for parallel per-module analysis
  4. All AI responses are validated against Zod schemas, and AI-generated claims about dependencies/imports are cross-checked against AST-derived facts
  5. A failed AI round does not block independent documents -- missing sections are clearly marked rather than crashing the pipeline
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

### Phase 6: Document Synthesis
**Goal**: Fourteen cross-referenced markdown documents are rendered from AI-populated domain entities, with YAML front-matter, mermaid diagrams, validated cross-references, and LLM-optimized structure
**Depends on**: Phase 5
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07, DOC-08, DOC-09, DOC-10, DOC-11, DOC-12, DOC-13, DOC-14, DOC-15, DOC-16, DOC-17, DOC-18, DOC-19, CLI-05
**Success Criteria** (what must be TRUE):
  1. Running `handover generate` produces all 14 markdown files (00-INDEX through 13-DEPLOYMENT) in the output folder
  2. User can run `handover generate --only arch,features,deps` to generate only specific documents
  3. Every document includes YAML front-matter, a 2-sentence self-contained summary, and cross-references with relative paths that resolve to valid targets
  4. Architecture and dependency documents include mermaid diagram suggestions where visualization adds value
  5. Code references use full paths (e.g., `src/auth/middleware.ts:L42`) throughout all documents
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

### Phase 7: Terminal UX
**Goal**: Users see rich, informative progress throughout the entire pipeline -- startup banner, per-analyzer spinners, per-round progress bars with token/cost tracking, document render progress, and a completion summary -- with graceful degradation in CI/CD environments
**Depends on**: Phase 6
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09, UX-10, UX-11
**Success Criteria** (what must be TRUE):
  1. Startup banner displays project name, provider, detected language, and file count in a framed box
  2. Static analysis shows per-analyzer spinners that transition to checkmarks (done) or X (failed), and AI analysis shows per-round progress bars with live token counts and cost
  3. Running totals of tokens, cost, and elapsed time update in real-time, and completion summary shows all generated files, total tokens, total cost, and duration in a framed box
  4. Colors follow semantic palette (cyan headers, green success, yellow warnings/cost, red errors, magenta AI activity) and NO_COLOR environment variable disables all color
  5. Non-TTY environments (CI/CD) disable animations and output structured log lines instead
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD

### Phase 8: Provider Ecosystem and Reliability
**Goal**: Users can switch between Anthropic, OpenAI, Ollama, or any OpenAI-compatible endpoint via config alone, see cost estimates before running, and recover from crashes without re-running completed work
**Depends on**: Phase 5
**Requirements**: PROV-02, PROV-03, PROV-04, CLI-04, REL-01, REL-02, REL-03, SEC-01, SEC-04
**Success Criteria** (what must be TRUE):
  1. User can switch from Anthropic to OpenAI or a custom OpenAI-compatible endpoint by changing only the config file, with no code changes needed
  2. User can run Ollama for fully local analysis with zero external data transfer and concurrency capped at 1
  3. User can run `handover estimate` to see token count and cost estimate before any API calls are made
  4. LLM calls retry with exponential backoff (3 attempts: 30s, 60s, 120s) and intermediate results are cached to disk so the pipeline can resume from the last successful step after a crash
  5. No code is stored beyond the local filesystem at any point in the pipeline
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD
- [ ] 08-03: TBD

### Phase 9: Integration and Hardening
**Goal**: The complete pipeline works reliably on diverse real-world codebases (TypeScript, Python, Go, Rust), meets performance targets, handles edge cases gracefully, and is ready for npm publish
**Depends on**: Phase 7, Phase 8
**Requirements**: (no new requirements -- validates all prior phases deliver their requirements end-to-end)
**Success Criteria** (what must be TRUE):
  1. `handover generate` completes successfully on at least 5 diverse real-world codebases (TypeScript SPA, Python API, Go microservice, Rust CLI, mixed-language project)
  2. Full pipeline (static + AI + render) completes in under 2 minutes for a 200-file project
  3. `npx handover generate` works as a zero-install experience on a fresh machine with Node.js installed
  4. Monorepo detection warns the user and proceeds with single-package analysis rather than crashing
  5. Edge cases (empty repos, binary-only dirs, repos with no git history, enormous files) produce useful output or clear error messages rather than crashes
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9
(Note: Phase 8 depends on Phase 5, not Phase 7 -- Phases 7 and 8 can overlap after Phase 6/5 respectively)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation | 0/3 | Not started | - |
| 2. Language Parsing | 0/2 | Not started | - |
| 3. Static Analysis Pipeline | 0/3 | Not started | - |
| 4. Context Window Management | 0/2 | Not started | - |
| 5. AI Analysis Rounds | 0/3 | Not started | - |
| 6. Document Synthesis | 0/3 | Not started | - |
| 7. Terminal UX | 0/2 | Not started | - |
| 8. Provider Ecosystem and Reliability | 0/3 | Not started | - |
| 9. Integration and Hardening | 0/2 | Not started | - |
