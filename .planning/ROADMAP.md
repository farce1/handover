# Roadmap: Handover

## Milestones

- ✅ **v1.0 OSS Excellence** - Phases 1-3 (shipped 2026-02-18) - `.planning/milestones/v1.0-ROADMAP.md`
- ✅ **v2.0 Performance** - Phases 4-7 (shipped 2026-02-19) - `.planning/milestones/v2.0-ROADMAP.md`
- ✅ **v3.0 Robustness** - Phases 8-11 (shipped 2026-02-20) - `.planning/milestones/v3.0-ROADMAP.md`
- ✅ **v4.0 MCP Server & Semantic Search** - Phases 12-15 (shipped 2026-02-22) - `.planning/milestones/v4.0-ROADMAP.md`
- ✅ **v5.0 Remote & Advanced MCP** - Phases 16-20 (shipped 2026-02-26) - `.planning/milestones/v5.0-ROADMAP.md`
- ✅ **v6.0 Codex Auth & Validation** - Phases 21-26 (shipped 2026-02-28) - `.planning/milestones/v6.0-ROADMAP.md`
- 🚧 **v7.0 Quality, Performance & Polish** - Phases 27-30 (in progress)

## Phases

<details>
<summary>✅ v1.0 through v6.0 (Phases 1-26) - SHIPPED</summary>

See milestone archives in `.planning/milestones/`.

</details>

### 🚧 v7.0 Quality, Performance & Polish (In Progress)

**Milestone Goal:** Raise test coverage to 90%+, add git-aware incremental regeneration, polish search/QA UX, and close documentation gaps with smarter onboarding.

- [x] **Phase 27: Test Coverage & Infrastructure** - Raise the CI coverage gate from the currently-failing 80% to a verified 90%+ (completed 2026-03-01)
- [ ] **Phase 28: Git-Aware Incremental Regeneration** - Users can re-analyze only files changed since a git ref, with graceful fallback in non-git environments
- [ ] **Phase 29: Search & QA UX Polish** - Search output surfaces result quality signals, clickable links, zero-results guidance, and enriched MCP responses
- [ ] **Phase 30: Documentation & Onboarding** - User and contributor docs reflect final behavior, `handover init` gains TTY guard, broken-link CI check added

## Phase Details

### Phase 27: Test Coverage & Infrastructure
**Goal**: The CI coverage gate passes at 90%+ and every coverage exclusion is documented with written justification
**Depends on**: Nothing (first phase of v7.0)
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. `npm test` passes with vitest thresholds at 90% lines/functions/statements and 85% branches — no failures
  2. New test files exist for `renderers/utils`, `auth/resolve`, `auth/pkce-login`, `config/schema`, `context/packer`, and `mcp/tools` with output assertions (not only mock call assertions)
  3. The vitest coverage exclusion list is frozen with a written comment justifying each entry (including `gemini.ts` added immediately for its zero-API-key-testable surface)
  4. `json-summary` reporter is active and the GitHub Actions coverage comment reflects the new thresholds
**Plans:** 6/6 plans complete
**Verification:** passed (`.planning/phases/27-test-coverage-infrastructure/27-VERIFICATION.md`)

Plans:
- [x] 27-01-PLAN.md — Freeze exclusion list with justifications, add 7 missing exclusions, narrow mcp glob, add json-summary reporter, fix 80% gate
- [x] 27-02-PLAN.md — Expand tests for renderers/utils, config/schema, context/packer (pure-function targets)
- [x] 27-03-PLAN.md — Expand tests for auth/resolve, auth/pkce-login; create mcp/tools.test.ts (mock-heavy targets)
- [x] 27-04-PLAN.md — Raise thresholds in batches (80→85→88→90 lines/funcs/stmts, 80→83→85 branches)
- [x] 27-05-PLAN.md — [gap closure] Deep MCP coverage: expand mcp/tools.test.ts for all tool handlers, create mcp/errors.test.ts
- [x] 27-06-PLAN.md — [gap closure] Secondary module branch coverage + raise thresholds to 90/90/90/85

### Phase 28: Git-Aware Incremental Regeneration
**Goal**: Users can skip re-analysis of unchanged files by pointing generate at a git ref, with safe fallback when git context is unavailable
**Depends on**: Phase 27
**Requirements**: REGEN-01, REGEN-02
**Success Criteria** (what must be TRUE):
  1. Running `handover generate --since <ref>` only re-analyzes files changed since that ref; unchanged files use cached round results
  2. Running `handover generate --since <ref>` in a non-git directory, detached HEAD, or shallow clone prints an explicit warning and falls back to full content-hash mode without crashing
  3. `src/cache/git-fingerprint.ts` exists with unit tests that cover the untracked-file detection path (`git.status()` paired with `git.diff()`)
  4. Existing `.handover.yml` files without a `cache.mode` key continue to work (defaults to `content-hash`)
**Plans:** 2 plans

Plans:
- [ ] 28-01-PLAN.md — Implement and test `src/cache/git-fingerprint.ts` with TDD (simple-git diff+status detection, fallback paths, invalid ref error)
- [ ] 28-02-PLAN.md — Wire `--since <ref>` CLI flag into generate.ts, integrate git-fingerprint at analysisFingerprint site, update display layer

### Phase 29: Search & QA UX Polish
**Goal**: Search output communicates result quality, guides users when results are absent, and MCP clients receive enriched structured responses
**Depends on**: Phase 27
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, SRCH-06
**Success Criteria** (what must be TRUE):
  1. `handover search --help` lists the valid `--type` values in the options description
  2. A search that returns zero results displays the available doc types as guidance instead of a bare empty message
  3. A search where the best-match cosine distance exceeds the quality threshold displays a distance warning alongside results
  4. Search results on a TTY show OSC8 clickable file links; piped/non-TTY output shows plain paths
  5. `handover search --mode qa` output includes timing and token stats ("Answer in 2.3s using 1,240 tokens from 4 sources")
  6. The MCP `semantic_search` tool response includes a `content` field (top 3 results only) and a `docType` field
**Plans**: TBD

Plans:
- [ ] 29-01: Add `--type` help text, zero-results guidance (`VectorStore.getDocTypeSummary()`), and distance warning to CLI search output
- [ ] 29-02: Add OSC8 TTY-gated clickable links to search results and QA timing/token stats
- [ ] 29-03: Enrich MCP `semantic_search` response with `content` (top 3) and `docType` fields

### Phase 30: Documentation & Onboarding
**Goal**: Users can find search/reindex/incremental-regen guidance in the docs, contributors can navigate the test patterns, and broken doc links are caught in CI
**Depends on**: Phases 28 and 29 (documents their final behavior)
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05
**Success Criteria** (what must be TRUE):
  1. `docs/src/content/user/search.md` and a reindex walkthrough exist and are linked in the docs sidebar
  2. `docs/src/content/user/regeneration.md` covers the `--since` flag, cache behavior, and non-git fallback
  3. `handover init` accepts `--yes` and silently skips prompts in non-TTY/CI environments; it detects and does not silently overwrite an existing config
  4. `docs/src/content/contributor/testing.md` documents `createMockProvider()`, `memfs` setup, and coverage exclusion rationale
  5. `starlight-links-validator` runs in CI and the `docs:build` job fails on broken internal links
**Plans**: TBD

Plans:
- [ ] 30-01: Add `starlight-links-validator` to CI before writing any new pages; add `handover init` TTY guard and `--yes` flag
- [ ] 30-02: Write `docs/src/content/user/search.md` and reindex walkthrough; wire sidebar entries
- [ ] 30-03: Write `docs/src/content/user/regeneration.md` and `docs/src/content/contributor/testing.md`

## Progress

**Execution Order:**
Phase 27 → Phase 28 (parallel with 29, after 27) → Phase 29 (parallel with 28, after 27) → Phase 30

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 27. Test Coverage & Infrastructure | v7.0 | 6/6 | Complete | 2026-03-01 |
| 28. Git-Aware Incremental Regeneration | v7.0 | 0/2 | Not started | - |
| 29. Search & QA UX Polish | v7.0 | 0/3 | Not started | - |
| 30. Documentation & Onboarding | v7.0 | 0/3 | Not started | - |
