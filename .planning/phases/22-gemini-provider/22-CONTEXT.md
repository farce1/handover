# Phase 22: Gemini Provider - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Google Gemini as a fully supported LLM provider. Users can set `provider: gemini` in `.handover.yml` and run `handover generate`, `handover reindex`, and `handover search` using Gemini models for both chat completion and embeddings. Auth is API-key-based (Google AI Studio key). This phase does NOT add OAuth/subscription auth for Gemini — that's a research question for potential future work.

</domain>

<decisions>
## Implementation Decisions

### Model selection
- Full model family pass-through: users can specify any Gemini model ID and handover passes it to the API
- No hardcoded model list — API validates the model ID
- Default generation and embedding models are Claude's discretion (pick what's stable and cost-effective at implementation time)

### Config & auth experience
- Environment variable precedence: check `GEMINI_API_KEY` first, fall back to `GOOGLE_API_KEY` (covers both conventions)
- Auth resolution follows existing Phase 21 precedence: CLI flag > env var > credential store > interactive prompt
- Config shape mirrors existing providers (provider, model, apiKey fields) — no Gemini-specific fields beyond what's needed
- Placement in `handover init` flow is Claude's discretion (fit with existing provider selection patterns)

### Embedding behavior
- Index compatibility, provider switching behavior, and fallback patterns are Claude's discretion (match existing codebase patterns)
- Embedding quality validation deferred to Phase 26 (Runtime Validation) which already covers semantic search verification

### Runtime experience
- Cost display, safety filter handling, banner content, and rate limit behavior are Claude's discretion (keep consistent with existing provider patterns)

### Claude's Discretion
- Default generation model (pick what's stable and cost-effective)
- Default embedding model (pick what's dimension-compatible with existing search)
- Model ID validation approach (match existing provider patterns)
- Auth method support (API key only vs also subscription — based on what Google actually offers)
- Init flow placement (equal vs secondary listing)
- Config shape details beyond mirroring existing structure
- Provider switch / reindex behavior
- Local embedding fallback behavior
- Cost display format
- Safety filter rejection handling
- Startup banner content
- Rate limit / concurrency handling for free tier

</decisions>

<specifics>
## Specific Ideas

- User noted that Gemini might support OAuth for subscription-based calls — researcher should investigate whether Google AI Studio or Gemini API offers any subscription/OAuth model similar to OpenAI Codex
- Anthropic is confirmed API-key-only (ToS enforcement) — this is already a locked decision from v6.0 research
- User wants both `GEMINI_API_KEY` and `GOOGLE_API_KEY` env vars checked (dual convention support)

</specifics>

<deferred>
## Deferred Ideas

- Gemini OAuth/subscription auth — If research confirms Google offers this, it could be a future phase or folded into Phase 23/24 auth work
- Gemini-specific config options (safety settings, generation config) — keep config simple for now, expand if users need it

</deferred>

---

*Phase: 22-gemini-provider*
*Context gathered: 2026-02-26*
