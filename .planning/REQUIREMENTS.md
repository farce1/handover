# Requirements: Handover

**Defined:** 2026-03-01
**Core Value:** Every person (or LLM) who encounters this repo should understand what handover does, how to use it, and how to contribute — within minutes, not hours.

## v7.0 Requirements

Requirements for milestone v7.0 Quality, Performance & Polish. Each maps to roadmap phases.

### Testing & Coverage

- [x] **TEST-01**: Coverage gate raised to 90%+ lines/functions/statements, 85%+ branches
- [x] **TEST-02**: New test suites for highest-gap modules (renderers/utils, auth/resolve, auth/pkce-login, config/schema, context/packer, mcp/tools)
- [x] **TEST-03**: Coverage exclusion list frozen with written justification for each existing exclusion

### Incremental Regeneration

- [x] **REGEN-01**: User can run `handover generate --since <ref>` to only re-analyze files changed since a git ref
- [x] **REGEN-02**: Incremental mode falls back gracefully to content-hash in non-git, detached HEAD, and shallow clone environments

### Search & QA

- [x] **SRCH-01**: `--type` valid values shown in `handover search --help` output
- [x] **SRCH-02**: Zero-results search displays available doc types as guidance
- [x] **SRCH-03**: Low-relevance results display distance warning when best match quality is poor
- [x] **SRCH-04**: Search results show OSC8 clickable terminal file links (TTY-gated, plain text fallback)
- [x] **SRCH-05**: QA mode displays timing and token stats ("Answer in 2.3s using 1,240 tokens from 4 sources")
- [x] **SRCH-06**: MCP `semantic_search` response includes `content` (top 3) and `docType` fields

### Documentation & Onboarding

- [ ] **DOCS-01**: User guide for `handover search` and `handover reindex` workflows
- [ ] **DOCS-02**: `handover init` has TTY guard and `--yes` flag for non-interactive/CI usage
- [ ] **DOCS-03**: User guide for incremental regeneration (`--since` flag, cache behavior)
- [ ] **DOCS-04**: Contributor guide documenting test patterns, mock factories, and coverage exclusion rationale
- [ ] **DOCS-05**: `starlight-links-validator` added to CI to catch broken doc links

## Future Requirements

Deferred to next milestone. Tracked but not in current roadmap.

### Auth Ergonomics

- **AUTH-05**: OS keychain-backed credential storage
- **AUTH-06**: Headless device-code auth flow for SSH/container environments
- **AUTH-07**: `handover auth token` support for CI/CD injection
- **AUTH-08**: `handover auth logout` command and full credential clearing

### Advanced Features

- **REGEN-03**: Source-to-document dependency graph for surgical per-renderer regeneration
- **TEST-04**: Integration test suite (`test:integration`) requiring real API keys
- **SRCH-07**: `--format json` flag for machine-readable search output

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Remove all coverage exclusions | CLI commands and providers require live APIs; keep exclusions, document rationale |
| Git-dirty check blocking generation | Developers iterate on dirty trees; warn only, never block |
| Per-file 100% coverage requirements | Brittle; global 90% with future autoUpdate is sufficient |
| Interactive REPL search mode | Streaming QA via `--mode qa` already handles multi-turn pattern |
| `thresholds.autoUpdate` in vitest | Blocked by upstream vitest#9227 (config rewrite bug); enable when fixed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 27 | Complete |
| TEST-02 | Phase 27 | Complete |
| TEST-03 | Phase 27 | Complete |
| REGEN-01 | Phase 28 | Complete |
| REGEN-02 | Phase 28 | Complete |
| SRCH-01 | Phase 29 | Complete |
| SRCH-02 | Phase 29 | Complete |
| SRCH-03 | Phase 29 | Complete |
| SRCH-04 | Phase 29 | Complete |
| SRCH-05 | Phase 29 | Complete |
| SRCH-06 | Phase 29 | Complete |
| DOCS-01 | Phase 30 | Pending |
| DOCS-02 | Phase 30 | Pending |
| DOCS-03 | Phase 30 | Pending |
| DOCS-04 | Phase 30 | Pending |
| DOCS-05 | Phase 30 | Pending |

**Coverage:**
- v7.0 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-02 after phase 29 completion*
