# Phase 26: Runtime Validation - Research

**Researched:** 2026-02-28
**Domain:** Human-executed validation runbook for deferred v4.0/v5.0 runtime behaviors
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Validation Scope
- Claude autonomously identifies deferred items by reviewing v4.0/v5.0 milestone artifacts (phase summaries, roadmap notes, known deferrals)
- Coverage level determined by Claude based on risk assessment — comprehensive for high-risk behaviors, lighter for well-tested paths
- v6.0 auth behaviors included at Claude's discretion based on existing test coverage gaps
- Provider coverage determined by Claude based on what's critical to validate vs already well-tested

#### Test Format & Structure
- Format chosen by Claude based on what best fits the content (runbook, table matrix, or hybrid)
- Detail level at Claude's discretion — self-contained instructions where needed, concise where familiarity can be assumed
- Document organization (single vs split) determined by Claude based on scenario count
- Destination (docs/ vs .planning/) determined by Claude based on purpose and audience

#### Pass/Fail Criteria
- Approach per scenario at Claude's discretion — automated assertions where output is deterministic, manual observation where needed
- Failure handling determined by Claude based on severity
- Output matching approach (exact vs pattern) per scenario based on output determinism
- Edge cases included at Claude's discretion based on risk assessment

#### Results & Reporting
- Results recording approach determined by Claude based on chosen format
- Reusability (one-time vs repeatable) determined by Claude based on scenario nature
- Milestone gating behavior determined by Claude based on project context
- Timing/performance metrics included at Claude's discretion based on scenario relevance

### Claude's Discretion
All four areas were delegated to Claude's judgment. Key guideline: make pragmatic decisions that maximize confidence in runtime correctness while keeping the validation effort proportional to risk. Favor automated checks where feasible, manual verification only where runtime behavior can't be programmatically asserted.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 26 is a pure human-executed validation phase. No new features are built. The goal is to systematically verify six runtime behaviors (VAL-01 through VAL-06) that were deferred from earlier milestones because their correctness depends on live providers, real MCP clients, and actual runtime conditions that cannot be simulated in unit tests.

The deferred items were tracked in `VERIFICATION.md` files throughout phases 12–18. Each phase verifier flagged `human_needed` status and recorded specific test scenarios in `human_verification:` metadata blocks. Phase 26 plans must collect those deferred tests, add any new gaps from the v6.0 auth work (phases 21–25), and organize them into two plans that map to the six requirements.

The dominant format should be a self-contained runbook: numbered steps, exact commands, expected output patterns, explicit pass/fail gates, and a results table the executor checks off. Scenarios that require real providers (generate→reindex pipeline, semantic relevance) are high-cost and should run once on a canonical target repo. MCP client interop scenarios should cover all three required clients (Claude Desktop, Cursor, VS Code) but can share a common test sequence to reduce repetition.

**Primary recommendation:** Split into exactly two plans matching the phase plan breakdown (26-01 for pipeline/embedding/relevance; 26-02 for MCP interop/streaming/regen). Each plan produces one runbook document in `.planning/phases/26-runtime-validation/` targeting a human executor, not CI.

---

## Standard Stack

### Core
No new packages are introduced. This phase uses only the existing built CLI.

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `handover` CLI (dist build) | current | All validation commands | Target under test |
| `npm run build` | — | Produces `dist/index.js` for subprocess execution | CLI entrypoint for integration |
| `sqlite3` CLI | system | Inspect `.handover/search.db` vector database | Ad-hoc index verification |
| Claude Desktop / Cursor / VS Code | latest stable | MCP client interop targets | The three required clients per VAL-03 |
| Ollama | latest stable | Local embedding provider for VAL-05 | Only local embedding runtime available |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `HANDOVER_INTEGRATION=1 npx vitest run` | Run existing integration test suite | VAL-01 pipeline baseline check before human validation |
| `jq` | Parse JSON output from MCP tool calls | Inspecting raw tool response payloads |
| `curl` or `websocat` | HTTP transport smoke tests | VAL-03 if VS Code uses HTTP transport |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Human runbook | Automated e2e test | Cannot programmatically drive Claude Desktop / Cursor GUI; streaming timing is non-deterministic |
| Single combined doc | Split per plan | Two plans each map to distinct environments (CLI-only vs MCP clients) — splitting reduces cognitive load |

---

## Architecture Patterns

### Recommended Document Structure
```
.planning/phases/26-runtime-validation/
├── 26-RESEARCH.md          # This file
├── 26-01-PLAN.md           # Plan for pipeline + embedding + relevance (VAL-01, VAL-02, VAL-05)
├── 26-02-PLAN.md           # Plan for MCP interop + streaming + regen (VAL-03, VAL-04, VAL-06)
├── 26-01-RUNBOOK.md        # Executable validation runbook for plan 01 (produced during plan 01)
└── 26-02-RUNBOOK.md        # Executable validation runbook for plan 02 (produced during plan 02)
```

The runbooks are the primary deliverable. Plans describe what to write; runbooks are what the human executor actually follows.

### Pattern 1: Runbook Scenario Format
**What:** Each scenario is a self-contained numbered block with: setup, steps, expected output, pass/fail gate.
**When to use:** All scenarios. Consistency makes it easy to check off and record results.
**Example:**
```markdown
### S-03: Semantic Relevance Quality

**Requirement:** VAL-02
**Risk:** HIGH — core value proposition of semantic search
**Environment:** Must have populated real index (generated from a non-trivial codebase)

**Setup:**
1. Confirm `handover generate` and `handover reindex` have completed for a real project
2. Confirm `.handover/search.db` exists and is non-empty (`sqlite3 .handover/search.db "SELECT COUNT(*) FROM chunks"` returns > 0)

**Steps:**
1. Run: `handover search "authentication flow" --top-k 5`
2. Run: `handover search "database schema" --top-k 5`
3. Run: `handover search "error handling patterns" --top-k 5`

**Expected:** Each query returns results where the top result's `section` and `snippet` fields are topically related to the query. Results are ranked by descending relevance score.

**Pass gate:** Manual judgment — top result is clearly relevant to at least 2 of 3 queries.
**Fail gate:** Top results are random sections with no apparent connection to the query terms.

**Result:** [ ] PASS  [ ] FAIL  Notes: ___
```

### Pattern 2: Results Recording Table
**What:** A single results table at the top of each runbook that the executor fills in as they proceed.
**When to use:** Placed at the top of each runbook so overall status is visible without reading the whole document.

```markdown
| Scenario | Requirement | Result | Notes |
|----------|-------------|--------|-------|
| S-01: Pipeline end-to-end | VAL-01 | [ ] PASS / [ ] FAIL | |
| S-02: Reindex incremental | VAL-01 | [ ] PASS / [ ] FAIL | |
| S-03: Semantic relevance | VAL-02 | [ ] PASS / [ ] FAIL | |
```

### Anti-Patterns to Avoid
- **Over-specifying output:** Streaming output, token counts, and cost estimates vary by run. Match on structural presence (e.g., "contains 'Reindex completed'") rather than exact strings.
- **Asserting internal state without observable evidence:** Don't require the executor to inspect source code or logs unless a specific log line is the only evidence.
- **Conflating client setups:** Each MCP client (Claude Desktop, Cursor, VS Code) has a distinct configuration path. Keep their setup steps separated in the runbook.

---

## Deferred Items Catalog

This is the complete list of items left as `human_needed` in phase verification files, cross-referenced with Phase 26 requirements.

### From Phase 12 (Vector Storage Foundation) → VAL-01
| Deferred Test | Phase Source | VAL Req |
|--------------|-------------|---------|
| `handover generate` then `handover reindex` with `OPENAI_API_KEY` set; verify `.handover/search.db` created with embeddings | `12-VERIFICATION.md` | VAL-01 |
| Second `handover reindex` on unchanged docs shows "skipped N unchanged documents" | `12-VERIFICATION.md` | VAL-01 |
| Modify one generated doc and re-run reindex; only that doc re-embedded | `12-VERIFICATION.md` | VAL-01 |
| `sqlite3 .handover/search.db "SELECT COUNT(*) FROM chunks"` shows non-zero count | `12-VERIFICATION.md` | VAL-01 |

### From Phase 13 (Query Engine CLI Search) → VAL-02
| Deferred Test | Phase Source | VAL Req |
|--------------|-------------|---------|
| `handover search "authentication flow" --top-k 5` returns ranked, relevant results on populated index | `13-VERIFICATION.md` | VAL-02 |
| TTY vs non-TTY output readability check for search results | `13-VERIFICATION.md` | VAL-02 |

### From Phase 14 (MCP Server Tools + Resources) → VAL-03
| Deferred Test | Phase Source | VAL Req |
|--------------|-------------|---------|
| Real MCP client connects over stdio, calls `resources/list`, calls `semantic_search` | `14-VERIFICATION.md` | VAL-03 |

### From Phase 15 (LLM Q&A + Advanced Features) → VAL-02, VAL-03
| Deferred Test | Phase Source | VAL Req |
|--------------|-------------|---------|
| `handover search "How does the DAG orchestrator work?" --mode qa` returns synthesized answer + citations | `15-VERIFICATION.md` | VAL-02 |
| MCP `prompts/list` shows workflows; `prompts/get` supports resume/completion flow | `15-VERIFICATION.md` | VAL-03 |

### From Phase 16 (Streaming QA Session Lifecycle) → VAL-04
| Deferred Test | Phase Source | VAL Req |
|--------------|-------------|---------|
| `qa_stream_start` with `_meta.progressToken` produces multiple `notifications/progress` updates before terminal event | `16-VERIFICATION.md` | VAL-04 |
| Start stream, capture `lastSequence`, disconnect, call `qa_stream_resume`; only missed events replayed, continues live until terminal | `16-VERIFICATION.md` | VAL-04 |

### From Phase 17 (Local Embedding Provider Routing) → VAL-05
| Deferred Test | Phase Source | VAL Req |
|--------------|-------------|---------|
| `handover reindex --embedding-mode local-only` reports `provider local` in embedding route summary | `17-VERIFICATION.md` | VAL-05 |
| `handover reindex --embedding-mode remote-only` reports `provider remote` in embedding route summary | `17-VERIFICATION.md` | VAL-05 |
| Non-interactive `local-preferred` with local provider unavailable fails with confirmation-required remediation (no silent fallback) | `17-VERIFICATION.md` | VAL-05 |

### From Phase 18 (Remote Regeneration Job Control) → VAL-06
| Deferred Test | Phase Source | VAL Req |
|--------------|-------------|---------|
| `regenerate_docs` from real remote MCP client returns `{ok:true, jobId, state, target, dedupe, next}` over transport | `18-VERIFICATION.md` | VAL-06 |
| Two rapid duplicate triggers return same `jobId` with `dedupe.joined=true` on second call | `18-VERIFICATION.md` | VAL-06 |
| Status polling on `jobId` reaches terminal `completed` or `failed` with legal state progression | `18-VERIFICATION.md` | VAL-06 |

### New Items from v6.0 Auth (Phases 21-25) → Claude's Discretion
Phase 25 verification passed fully automated (3/3). Phases 21-24 are auth infrastructure (PKCE login, token store, auth CLI commands, onboarding). The auth system is tested at the unit level (17/17 tests in `resolve.test.ts`). The subscription flow (PKCE browser login) inherently requires a real Codex subscription to exercise end-to-end.

**Inclusion decision:** Include one auth smoke test in plan 26-01 to confirm `handover generate` with a real provider credential succeeds (this is already covered by VAL-01 pipeline scenario). The PKCE OAuth subscription flow is explicitly out of scope for this validation phase — it requires a paid Codex subscription, has no practical "expected output" that differs meaningfully from API-key auth at the generate level, and the unit test coverage is strong. Skip it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP client simulation | Custom stdio harness | Real clients (Claude Desktop, Cursor, VS Code) | Client-specific quirks (reconnect semantics, progress notification rendering) require real client behavior |
| Embedding quality scoring | Algorithmic relevance judge | Human inspector following structured criteria | Semantic quality is inherently subjective; algorithmic scoring would add false precision |
| Provider availability mocking | Test doubles | Real provider with real credentials | VAL-01/02/05 explicitly require non-synthetic test data |

---

## Common Pitfalls

### Pitfall 1: Running With Stale or Corrupted Index
**What goes wrong:** Semantic relevance (VAL-02) looks bad because the index was built from a trivial or empty project.
**Why it happens:** Executor ran `handover reindex` before `handover generate` completed, or used a minimal fixture project.
**How to avoid:** Always generate against a non-trivial real codebase (e.g., the handover repo itself, or a well-known OSS project). Verify chunk count > 50 before running search validation.
**Warning signs:** `handover search` returns 0 results or all results show 50% relevance uniformly.

### Pitfall 2: MCP Client stdio Protocol Corruption
**What goes wrong:** MCP server startup text appears on stdout instead of stderr, breaking the JSON-RPC channel and preventing client connection.
**Why it happens:** Any `console.log()` or `process.stdout.write()` call in the serve path corrupts the stdio stream. All diagnostics must go to stderr.
**How to avoid:** Check that `handover serve` startup messages say "MCP server listening on stdio" and appear in the client's stderr/log panel, not as malformed JSON in the conversation.
**Warning signs:** Client shows connection error or malformed response immediately after connecting.

### Pitfall 3: Embedding Model Mismatch Between Reindex and Search
**What goes wrong:** `handover search` fails with `SEARCH_EMBEDDING_MISMATCH` after reindex with different locality mode.
**Why it happens:** Index was built with one model (e.g., Ollama's `nomic-embed-text`) but search uses OpenAI `text-embedding-3-small`.
**How to avoid:** Use consistent `--embedding-mode` between reindex and search, or run `handover reindex --force` when switching modes.
**Warning signs:** The error message itself is explicit; this is a hard fail with remediation.

### Pitfall 4: Streaming QA Timing Depends on Provider Latency
**What goes wrong:** `qa_stream_start` completes too fast to observe multiple progress notifications.
**Why it happens:** Fast providers finish before the MCP client's notification polling cycle fires.
**How to avoid:** Use a computationally expensive query against a large index. The QA session involves a full LLM round-trip which takes several seconds on any production provider.
**Warning signs:** Only one progress event (the final event) is received. This is still technically a pass if the final event carries a complete result, but the streaming behavior intent is not validated.

### Pitfall 5: `handover serve` Prerequisites Not Met
**What goes wrong:** MCP server exits immediately with `MCP_DOCS_MISSING` before any client can connect.
**Why it happens:** `handover generate` was not run before `handover serve`, or output docs are in a different directory than configured.
**How to avoid:** Always run generate first, confirm 14 `.md` files exist in the output directory, then start `handover serve`.
**Warning signs:** Server exits with non-zero code and stderr contains `MCP_DOCS_MISSING`.

---

## Code Examples

These are the exact CLI commands and configuration snippets the runbook scenarios will reference.

### VAL-01: Provider-Backed Pipeline
```bash
# Source: src/cli/generate.ts + src/cli/reindex.ts
# Requires: ANTHROPIC_API_KEY (or other provider key)

# Step 1: Generate docs
handover generate --provider anthropic --verbose

# Step 2: Reindex
handover reindex --verbose

# Step 3: Verify index
sqlite3 .handover/search.db "SELECT COUNT(*) FROM chunks"

# Expected output from reindex (pattern match):
# Embedding route: mode remote-only, provider remote.
# Reindex completed successfully.
```

### VAL-02: Semantic Relevance
```bash
# Source: src/vector/query-engine.ts + src/cli/search.ts
# Requires: populated index from VAL-01

handover search "architecture overview" --top-k 5
handover search "testing strategy" --top-k 5 --type testing-strategy
handover search "How does caching work?" --mode qa --top-k 10
```

### VAL-03: MCP Client Setup (stdio)
```yaml
# Claude Desktop mcpServers config (~/.config/claude/claude_desktop_config.json):
{
  "mcpServers": {
    "handover": {
      "command": "node",
      "args": ["/path/to/project/dist/index.js", "serve"],
      "cwd": "/path/to/project"
    }
  }
}
```

### VAL-04: Streaming QA Tools
The streaming QA tools (`qa_stream_start`, `qa_stream_status`, `qa_stream_resume`, `qa_stream_cancel`) are only exercisable through an MCP client that supports tool calling with `_meta.progressToken`. In Claude Desktop, calling `qa_stream_start` as a tool call from a conversation is the validation path.

### VAL-05: Local Embedding Fallback
```bash
# Source: src/vector/embedding-router.ts + src/vector/embedding-health.ts
# Requires: Ollama running with nomic-embed-text model

# .handover.yml for local embedding:
embedding:
  provider: openai
  model: text-embedding-3-small
  mode: local-preferred
  local:
    baseUrl: http://localhost:11434
    model: nomic-embed-text

# Test local route visibility:
handover reindex --embedding-mode local-only --verbose
# Expected: "Embedding route: mode local-only, provider local."

# Test fallback with local unavailable (stop Ollama first):
handover reindex --embedding-mode local-preferred
# Expected (non-interactive): EMBEDDING_CONFIRMATION_REQUIRED error with remediation
```

### VAL-06: Remote Regeneration
```
# Tool calls to execute from an MCP client:
# 1. Call: regenerate_docs { "target": "docs" }
#    Expect: { ok: true, jobId: "<uuid>", state: "queued"|"running", dedupe: { joined: false } }

# 2. Call: regenerate_docs_status { "jobId": "<uuid from step 1>" }
#    Expect: { ok: true, state: "running"|"completed"|"failed", lifecycle: { ... } }

# 3. Poll step 2 until state is "completed" or "failed"
#    Expect: lifecycle.progressPercent = 100, next.tool = "regenerate_docs"

# 4. Call regenerate_docs again immediately (dedupe test):
#    While first job still running: second call returns same jobId, dedupe.joined = true
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No human validation tracking | `human_verification:` blocks in phase VERIFICATION.md files | v4.0 (phase 12-18) | Phase 26 has a clear, structured inventory of what to validate |
| Manual MCP testing with no defined pass criteria | Structured runbook with explicit pass/fail gates | Phase 26 (new) | Validation is repeatable and objective |
| Integration tests gated behind `HANDOVER_INTEGRATION=1` | Existing test infra in `tests/integration/` | Phase 11 | Automated coverage for CLI pipeline exists; Phase 26 covers the gap above it |

---

## Open Questions

1. **Which real codebase to use for VAL-01/02?**
   - What we know: Integration tests use 5 cloned OSS repos from `tests/integration/targets.ts`
   - What's unclear: Whether to use one of those or the handover repo itself
   - Recommendation: Use the handover repo itself — it's immediately available, has a populated git history, well-organized TypeScript, and provides a meaningful semantic search corpus. No cloning required.

2. **Which MCP client to start with for VAL-03/04/06?**
   - What we know: Claude Desktop, Cursor, VS Code all support MCP stdio
   - What's unclear: Whether all three are available on the executor's machine
   - Recommendation: Claude Desktop is the most natural for a developer running this validation. Cursor and VS Code are secondary. Runbook should note that passing at least 2 of 3 clients is acceptable for the milestone gate, with all 3 preferred.

3. **Ollama availability for VAL-05 (local embedding)**
   - What we know: Local embedding uses Ollama at `http://localhost:11434` with `nomic-embed-text`
   - What's unclear: Whether the executor has Ollama installed and the model pulled
   - Recommendation: Include setup instructions in the VAL-05 scenario. If Ollama is not available, the scenario should be marked SKIP (not FAIL) with a note, since the routing code is fully unit-tested and the scenario is an environment issue, not a code issue.

4. **Auth smoke test scope**
   - What we know: Phase 25 passed all automated security checks. Auth resolution is 17/17 unit tested.
   - What's unclear: Whether to validate the interactive `handover auth login openai` PKCE flow
   - Recommendation: Skip PKCE end-to-end — it requires a live Codex subscription. The VAL-01 pipeline scenario already validates that `resolveAuth` works correctly when `ANTHROPIC_API_KEY` is set (the most common real-world path). Document this skip explicitly in the runbook.

---

## Sources

### Primary (HIGH confidence)
- Direct source code inspection: `src/vector/embedding-router.ts`, `src/vector/embedding-health.ts`, `src/qa/streaming-session.ts`, `src/mcp/tools.ts`, `src/regeneration/job-manager.ts`, `src/cli/serve.ts`, `src/cli/reindex.ts`, `src/cli/generate.ts`
- Phase VERIFICATION.md files: `12-VERIFICATION.md` through `18-VERIFICATION.md`, `20-VERIFICATION.md`, `25-VERIFICATION.md` — all contain structured `human_verification:` metadata blocks used as the deferred items catalog
- `tests/integration/generate.test.ts` + `tests/integration/setup.ts` — existing integration test infrastructure reused as baseline for VAL-01

### Secondary (MEDIUM confidence)
- `package.json` scripts and dependency versions — current as of reading
- `.planning/PROJECT.md` milestone history — v4.0/v5.0 requirement tracking

### Tertiary (LOW confidence)
- None required — all findings sourced from codebase artifacts directly

---

## Metadata

**Confidence breakdown:**
- Deferred items catalog: HIGH — sourced directly from phase VERIFICATION.md `human_verification:` blocks
- CLI command syntax: HIGH — sourced from `src/cli/index.ts` command registrations and option definitions
- MCP tool payload shapes: HIGH — sourced from `src/mcp/tools.ts` Zod schemas
- Embedding routing behavior: HIGH — sourced from `src/vector/embedding-router.ts` logic
- Pass/fail criteria for semantic relevance: MEDIUM — inherently subjective, criteria are pragmatic guidelines

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable codebase; 30-day window appropriate)
