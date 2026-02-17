# Phase 5: AI Analysis Rounds - Research

**Researched:** 2026-02-17
**Domain:** Progressive AI analysis with Zod-validated structured output, hallucination validation against AST-derived facts, parallel round execution, inter-round context flow
**Confidence:** HIGH

## Summary

Phase 5 implements six progressive AI rounds that transform Phase 3's static analysis facts into structured understanding. Each round calls the existing `LLMProvider.complete()` method with a round-specific Zod schema and receives validated structured output. The existing tool_use pattern in `AnthropicProvider` already handles Zod-to-JSON-Schema conversion, tool_choice forcing, and Zod `.parse()` validation -- this is production-ready infrastructure that Phase 5 consumes directly.

The core architecture is: a `RoundRunner` function per round (1-6) that assembles a prompt from static analysis data + compressed prior-round context (Phase 4's `compressRoundOutput`), sends it through `LLMProvider.complete()` with a round-specific Zod schema, validates critical claims against AST-derived facts, and returns the validated output. The DAG orchestrator already handles dependency ordering and parallel execution -- Phase 5 registers rounds as DAG steps with the correct dependency edges (Round 1 -> Round 2 -> [Rounds 3, 4, 5, 6 in parallel where appropriate]).

The SDK situation: the project currently uses `@anthropic-ai/sdk@0.39.0` with the `tool_use` pattern for structured output. The latest SDK (`0.74.0`) adds `messages.parse()` with `zodOutputFormat` and native `output_config.format` for structured outputs (generally available for Claude Opus 4.6). Both approaches work. The existing `tool_use` approach is proven and deployed -- upgrading the SDK is beneficial but not blocking. If upgraded, Phase 5 can optionally use the newer `output_config` approach, but the `tool_use` pattern in `AnthropicProvider.complete()` will continue to work at any SDK version.

**Primary recommendation:** Build six round-specific modules under `src/ai-rounds/`, each exporting a Zod schema and a `createRound{N}Step()` function that returns a `StepDefinition` for the DAG. Use the existing `LLMProvider.complete()` interface unchanged. Add a `validateClaims()` utility that cross-checks AI output against `StaticAnalysisResult` AST data. Wire rounds into the DAG in `generate.ts` replacing the current placeholder steps. No new npm dependencies required beyond upgrading `@anthropic-ai/sdk` to `>=0.50.0` for improved stability (not strictly required).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Analysis depth & audience
- Target audience is both new team members AND senior engineers -- layered output with quick overview for experienced devs and deeper explanation available for those who need it
- Tone is direct and honest -- call out tech debt, anti-patterns, and questionable decisions plainly; the new dev needs to know what they're walking into
- Project Overview (Round 1) interleaves business purpose and technical landscape -- purpose-driven technical overview, not one before the other
- Module Detection (Round 2) infers logical boundaries even when code doesn't have explicit separation -- help the reader see the forest through the trees

#### AI confidence handling
- Architecture patterns (Round 4): only state patterns with high confidence -- skip uncertain pattern matches entirely rather than hedging
- Feature extraction (Round 3): trace features across modules even when the trace is uncertain in places -- cross-module tracing is more valuable than conservative scoping
- Edge cases (Round 5): only flag provable issues evidenced in the code -- error handling gaps, unchecked returns, etc. No speculative "potential race condition" flags
- Deployment inference (Round 6): best effort always -- piece together whatever deployment signals exist (Dockerfile, env vars, scripts, CI configs) into a coherent picture

#### Fact validation
- When AI claims conflict with AST-derived facts (e.g., claimed dependency not found in imports): drop the claim silently -- trust code over model
- Validation scope: critical claims only -- dependency/import claims and file references are cross-checked; high-level observations like "this module handles auth" are fine unchecked
- If a round has >30% of claims dropped by validation: auto-retry once with stricter prompting
- Final output includes a brief validation summary ("X claims validated, Y corrected") -- builds trust in output quality

#### Failure & degradation
- When a round completely fails: fall back to presenting raw static analysis data (file list, import graph) without AI interpretation
- When a dependency round fails (e.g., Round 2 Module Detection): skip dependent rounds entirely -- they can't work without the upstream output
- Failure visibility: both per-section indicators AND a consolidated summary report at the end listing all rounds that failed/degraded, with reasons and affected documents
- Quality detection: heuristic quality check (length, specificity, code references) on round output -- if too generic, retry once with stronger prompting

### Claude's Discretion
- Exact prompt structures and system instructions for each round
- How context is compressed/summarized between rounds
- Specific quality check heuristics and thresholds
- Parallelization implementation details (Rounds 3, 5, 6 after Round 2)
- Round 5 per-module fan-out strategy

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (no new deps) | -- | All functionality built on existing project infrastructure | Phase 5 consumes the existing `LLMProvider.complete()` interface, `DAGOrchestrator`, `compressRoundOutput`, `scoreFiles`, `packFiles`, and `TokenUsageTracker` from Phases 1-4 |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^3.24.0 | Round-specific output schemas (AI-08) | Each of the 6 rounds defines a Zod schema for its structured output; `LLMProvider.complete()` validates via `.parse()` |
| zod-to-json-schema | ^3.24.0 | Convert Zod to JSON Schema for tool_use input_schema | Already used by `AnthropicProvider` -- no changes needed |
| @anthropic-ai/sdk | ^0.39.0 (current) | LLM provider API calls | `AnthropicProvider.complete()` already handles tool_use pattern with Zod validation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing `tool_use` pattern | SDK `messages.parse()` + `zodOutputFormat` (SDK >=0.50) | Newer approach uses `output_config.format` for native structured outputs (GA for Claude Opus 4.6). Cleaner API, no tool_use wrapping needed. BUT: requires SDK upgrade, and the current `tool_use` approach works perfectly. Recommend upgrading SDK as a separate concern, not blocking Phase 5 |
| Per-round sequential execution | Full DAG parallelization | DAG orchestrator already handles this. Register rounds as steps with dependency edges. Rounds 3, 5, 6 run in parallel after Round 2 automatically |
| Single prompt with all rounds | Progressive 6-round approach | Progressive rounds manage context window better, enable parallelism, and produce more focused output per round |

**Installation:**
```bash
# No new packages needed. Optional SDK upgrade:
# npm install @anthropic-ai/sdk@latest
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── ai-rounds/
│   ├── types.ts              # Shared types: RoundInput, RoundOutput, ValidationResult
│   ├── schemas.ts            # Zod schemas for all 6 round outputs (AI-08)
│   ├── round-1-overview.ts   # AI-01: Project Overview
│   ├── round-2-modules.ts    # AI-02: Module Detection
│   ├── round-3-features.ts   # AI-03: Feature Extraction
│   ├── round-4-architecture.ts # AI-04: Architecture Detection
│   ├── round-5-edge-cases.ts # AI-05: Edge Cases & Conventions (per-module fan-out)
│   ├── round-6-deployment.ts # AI-06: Deployment Inference
│   ├── validator.ts          # AI-09: Hallucination validation against AST facts
│   ├── quality.ts            # Quality check heuristics and retry logic
│   ├── prompts.ts            # System and user prompt templates for each round
│   └── runner.ts             # Orchestration: wires rounds into DAG steps
└── cli/
    └── generate.ts           # Updated: replace placeholders with real round steps
```

### Pattern 1: Round as DAG Step
**What:** Each AI round is a `StepDefinition` registered in the existing `DAGOrchestrator`. Rounds declare their dependencies so the orchestrator handles sequencing and parallelism automatically.
**When to use:** For all 6 rounds.
**Example:**
```typescript
// Source: Existing DAGOrchestrator in src/orchestrator/dag.ts
import { createStep } from '../orchestrator/step.js';
import type { StepDefinition, StepContext } from '../domain/types.js';
import type { LLMProvider } from '../providers/base.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext } from '../context/types.js';

function createRound1Step(
  provider: LLMProvider,
  staticAnalysis: StaticAnalysisResult,
  packedContext: PackedContext,
  config: HandoverConfig,
): StepDefinition {
  return createStep({
    id: 'ai-round-1',
    name: 'AI Round 1: Project Overview',
    deps: ['static-analysis'],  // Depends on static analysis completing
    execute: async (ctx: StepContext) => {
      const prompt = buildRound1Prompt(staticAnalysis, packedContext, config);
      const result = await provider.complete(prompt, Round1OutputSchema);
      const validated = validateRound1Claims(result.data, staticAnalysis);
      return validated;
    },
    onSkip: () => {
      // PIPE-07: Return raw static data as fallback
      return buildRound1Fallback(staticAnalysis);
    },
  });
}

// DAG wiring in generate.ts:
// Round 1 -> Round 2 -> [Round 3, Round 4, Round 5, Round 6] (parallel)
// Round 4 depends on Rounds 1-3 (accumulates context)
// Round 5 fans out per-module (PIPE-03)
```

### Pattern 2: Structured Output with Existing Provider
**What:** Each round defines a Zod schema. The existing `LLMProvider.complete<T>(request, schema)` method handles JSON Schema conversion via `zod-to-json-schema`, forces `tool_choice`, and validates the response with `schema.parse()`. No provider changes needed.
**When to use:** Every AI round call.
**Example:**
```typescript
// Source: Existing AnthropicProvider.complete() in src/providers/anthropic.ts
import { z } from 'zod';

// Round 1 output schema (AI-01)
export const Round1OutputSchema = z.object({
  projectName: z.string(),
  primaryLanguage: z.string(),
  framework: z.string().optional(),
  purpose: z.string(),       // Business purpose
  technicalLandscape: z.string(), // Technical overview
  keyDependencies: z.array(z.object({
    name: z.string(),
    role: z.string(),        // What it does in this project
  })),
  entryPoints: z.array(z.object({
    path: z.string(),
    type: z.string(),        // 'CLI', 'API', 'web', etc.
    description: z.string(),
  })),
  projectScale: z.object({
    fileCount: z.number(),
    estimatedComplexity: z.enum(['small', 'medium', 'large']),
    mainConcerns: z.array(z.string()),
  }),
  findings: z.array(z.string()),     // Key findings for compression
  openQuestions: z.array(z.string()), // Questions for later rounds
});

// Usage: result = await provider.complete(request, Round1OutputSchema);
// result.data is automatically typed as z.infer<typeof Round1OutputSchema>
```

### Pattern 3: Hallucination Validation (AI-09)
**What:** After each round, cross-check critical AI claims against AST-derived facts from `StaticAnalysisResult`. Drop claims that conflict. Track validation stats for the summary.
**When to use:** After every round's LLM response, before storing the result.
**Example:**
```typescript
// Source: Locked decision -- trust code over model
import type { StaticAnalysisResult } from '../analyzers/types.js';

interface ValidationResult {
  validated: number;    // Claims that passed validation
  corrected: number;    // Claims dropped silently
  total: number;        // Total validatable claims
  dropRate: number;     // corrected / total
}

function validateFileClaims(
  claimedFiles: string[],
  analysis: StaticAnalysisResult,
): { valid: string[]; dropped: string[] } {
  const knownPaths = new Set(
    analysis.fileTree.directoryTree
      .filter(e => e.type === 'file')
      .map(e => e.path),
  );

  const valid: string[] = [];
  const dropped: string[] = [];

  for (const path of claimedFiles) {
    if (knownPaths.has(path)) {
      valid.push(path);
    } else {
      dropped.push(path); // Drop silently -- trust code over model
    }
  }

  return { valid, dropped };
}

function validateImportClaims(
  claimedImports: Array<{ from: string; to: string }>,
  analysis: StaticAnalysisResult,
): { valid: typeof claimedImports; dropped: typeof claimedImports } {
  // Build actual import map from AST data
  const actualImports = new Map<string, Set<string>>();
  for (const file of analysis.ast.files) {
    const sources = new Set(file.imports.map(i => i.source));
    actualImports.set(file.path, sources);
  }

  const valid: typeof claimedImports = [];
  const dropped: typeof claimedImports = [];

  for (const claim of claimedImports) {
    const fileImports = actualImports.get(claim.from);
    if (fileImports && fileImports.has(claim.to)) {
      valid.push(claim);
    } else {
      dropped.push(claim); // Drop silently
    }
  }

  return { valid, dropped };
}
```

### Pattern 4: Quality Check with Auto-Retry
**What:** After receiving a round's output, run heuristic quality checks. If output is too generic (short, few code references, no specificity), retry once with stronger prompting.
**When to use:** After validation, before accepting the round's output.
**Example:**
```typescript
// Source: User decision -- heuristic quality check
interface QualityMetrics {
  textLength: number;
  codeReferences: number;  // Count of file paths, function names, etc.
  specificity: number;     // Ratio of project-specific terms vs generic language
  isAcceptable: boolean;
}

function checkRoundQuality(
  output: Record<string, unknown>,
  roundNumber: number,
): QualityMetrics {
  const text = JSON.stringify(output);
  const codeRefPattern = /(?:src\/|\.ts|\.js|\.py|\.rs|\.go|function\s+\w+|class\s+\w+)/g;
  const codeReferences = (text.match(codeRefPattern) ?? []).length;

  // Thresholds vary by round type
  const minLength = roundNumber === 6 ? 200 : 500; // Deployment can be shorter
  const minRefs = roundNumber === 1 ? 3 : 5;       // Overview needs fewer refs

  return {
    textLength: text.length,
    codeReferences,
    specificity: codeReferences / Math.max(text.length / 100, 1),
    isAcceptable: text.length >= minLength && codeReferences >= minRefs,
  };
}

// Retry with stronger prompting if quality check fails:
// Add to system prompt: "You MUST reference specific files, functions, and
// code patterns from the provided codebase. Generic observations without
// code evidence are not acceptable."
```

### Pattern 5: Per-Module Fan-Out for Round 5 (PIPE-03)
**What:** Round 5 (Edge Cases & Conventions) fans out per module identified by Round 2. Each module gets its own LLM call analyzing that module's source files, error handling, and tests. Results are aggregated.
**When to use:** Round 5 only.
**Example:**
```typescript
// Source: PIPE-03 requirement, Round 5 per-module analysis
import type { Module } from '../domain/types.js';

async function runRound5Parallel(
  modules: Module[],
  provider: LLMProvider,
  analysis: StaticAnalysisResult,
  priorContext: RoundContext[],
): Promise<Round5Output> {
  // Fan out: one LLM call per module, all in parallel
  const moduleResults = await Promise.allSettled(
    modules.map(async (module) => {
      // Pack only this module's files
      const moduleFiles = analysis.ast.files.filter(
        f => f.path.startsWith(module.path),
      );

      const prompt = buildRound5ModulePrompt(module, moduleFiles, priorContext);
      const result = await provider.complete(prompt, Round5ModuleSchema);
      return { module: module.name, data: result.data };
    }),
  );

  // Aggregate: collect fulfilled results, log failures
  const results: Round5ModuleResult[] = [];
  for (const r of moduleResults) {
    if (r.status === 'fulfilled') {
      results.push(r.value);
    }
    // Failed module analyses are logged but don't block others
  }

  return { modules: results };
}
```

### Pattern 6: Prompt Assembly with Context Accumulation (AI-07)
**What:** Each round's prompt includes: (1) system instructions for the round, (2) packed file content from Phase 4, (3) compressed context from all prior rounds, (4) round-specific static analysis data. The compressor from Phase 4 handles context size management.
**When to use:** Every round's prompt assembly.
**Example:**
```typescript
// Source: AI-07 requirement, Phase 4 compressor
import { compressRoundOutput } from '../context/compressor.js';
import type { CompletionRequest } from '../domain/types.js';

function buildRoundPrompt(
  roundNumber: number,
  systemInstructions: string,
  packedContext: PackedContext,
  priorRounds: RoundContext[],
  roundSpecificData: string,
  estimateTokensFn: (text: string) => number,
): CompletionRequest {
  // Assemble prior context
  const priorContextText = priorRounds
    .map(r => `## Round ${r.roundNumber} Context\n` +
      `Modules: ${r.modules.join(', ')}\n` +
      `Findings:\n${r.findings.map(f => `- ${f}`).join('\n')}\n` +
      `Relationships: ${r.relationships.join('; ')}`)
    .join('\n\n');

  // Assemble file content
  const fileContent = packedContext.files
    .filter(f => f.tier !== 'skip')
    .map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  return {
    systemPrompt: systemInstructions,
    userPrompt: [
      '<codebase_context>',
      fileContent,
      '</codebase_context>',
      '',
      '<prior_analysis>',
      priorContextText || 'No prior analysis (this is the first round).',
      '</prior_analysis>',
      '',
      '<round_data>',
      roundSpecificData,
      '</round_data>',
      '',
      '<instructions>',
      `Analyze the codebase using the provided context. ` +
      `Reference specific files and code patterns. ` +
      `Be direct and honest about tech debt and anti-patterns.`,
      '</instructions>',
    ].join('\n'),
    temperature: 0.3, // Low temperature for analytical tasks
    maxTokens: 4096,
  };
}
```

### Pattern 7: Graceful Degradation (PIPE-07)
**What:** When a round fails completely, produce a fallback result from raw static analysis data. When a dependency round fails, skip dependent rounds via the DAG's existing skip mechanism.
**When to use:** Error handling for every round.
**Example:**
```typescript
// Source: PIPE-07 requirement, existing DAGOrchestrator skip behavior

interface RoundFallback {
  roundNumber: number;
  status: 'degraded' | 'failed';
  reason: string;
  staticFallback: Record<string, unknown>; // Raw static data
}

function buildRound2Fallback(analysis: StaticAnalysisResult): RoundFallback {
  // Present raw file structure as module approximation
  const topDirs = new Set<string>();
  for (const entry of analysis.fileTree.directoryTree) {
    if (entry.type === 'directory' && entry.path.split('/').length <= 2) {
      topDirs.add(entry.path);
    }
  }

  return {
    roundNumber: 2,
    status: 'degraded',
    reason: 'AI analysis failed; showing directory structure as module approximation',
    staticFallback: {
      modules: [...topDirs].map(dir => ({
        name: dir.split('/').pop(),
        path: dir,
        purpose: '(AI analysis unavailable)',
        files: analysis.fileTree.directoryTree
          .filter(e => e.type === 'file' && e.path.startsWith(dir))
          .map(e => e.path),
      })),
    },
  };
}
```

### Anti-Patterns to Avoid
- **Building a custom LLM client for structured output:** The existing `LLMProvider.complete()` with Zod validation is production-ready. Do not bypass it or build a parallel implementation. Phase 5 is a consumer of the provider, not a provider implementation phase.
- **Putting all 6 rounds in a single mega-prompt:** This defeats the purpose of progressive analysis. Each round builds on prior context. A single prompt would hit context limits on any non-trivial project and lose the parallelism benefit.
- **Validating every AI claim against AST data:** The user explicitly scoped validation to critical claims only (file references, import/dependency claims). High-level observations like "this module handles authentication" do not need AST cross-checking. Over-validation wastes compute and is fragile.
- **Using AI-powered summarization between rounds:** Phase 4 already built deterministic `compressRoundOutput()`. Do not call the LLM to summarize prior round output. This is a locked decision.
- **Retrying indefinitely on quality failures:** The user decision is "retry once with stricter prompting." Not twice, not three times. One retry, then accept the result or degrade gracefully.
- **Blocking all rounds when one fails:** The DAG orchestrator already handles this correctly -- failed steps skip their dependents, but independent branches continue. Do not add additional failure propagation logic.
- **Using high temperature for analysis:** Analytical/classification tasks should use low temperature (0.2-0.4). High temperature increases hallucination risk and reduces consistency.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output | Custom JSON parsing/extraction | `LLMProvider.complete<T>(request, schema)` | Already implements tool_use forcing + Zod validation. Zero additional code needed |
| Parallel round execution | Custom Promise.all orchestration | `DAGOrchestrator.execute()` with step dependencies | Already implements Kahn's algorithm, parallel execution, failure skip. Register rounds as steps |
| Inter-round context compression | AI-powered summarization | `compressRoundOutput()` from Phase 4 | Deterministic extraction, locked decision. Already handles token budget truncation |
| Token usage tracking | Custom counters | `TokenUsageTracker` from Phase 4 | Already records per-round usage, warns at threshold, produces summary |
| File content packing | Re-reading and scoring files | `packFiles()` + `scoreFiles()` from Phase 4 | Already scores, tiers, and packs files within token budget |
| Retry with backoff | Custom retry logic | `retryWithBackoff()` from `utils/rate-limiter.ts` | Already handles 429/529 with exponential backoff and jitter |
| Error formatting | Custom error messages | `ProviderError`, `HandoverError` from `utils/errors.ts` | Rust-compiler-inspired error format already established |

**Key insight:** Phase 5 is primarily a prompt engineering and orchestration phase. The infrastructure (provider, orchestrator, context management, error handling, retry logic) is already built. Phase 5's job is to write the prompts, define the schemas, and wire the rounds into the DAG.

## Common Pitfalls

### Pitfall 1: Context Window Overflow from Accumulated Rounds
**What goes wrong:** By Round 4-6, the accumulated context from prior rounds plus packed file content exceeds the 200K token budget, causing API errors.
**Why it happens:** Each round adds output that becomes context for subsequent rounds. Without compression, context grows linearly.
**How to avoid:** Use Phase 4's `compressRoundOutput()` with strict per-round token budgets. Reserve a fixed token allocation per accumulated round context (e.g., 2000 tokens per prior round = max 10K for 5 prior rounds). The compressor's progressive truncation (open questions -> findings -> relationships -> modules) handles overflow gracefully.
**Warning signs:** Token usage warnings from `TokenUsageTracker`, API `context_length_exceeded` errors on later rounds.

### Pitfall 2: Zod Schema Too Complex for Tool Use
**What goes wrong:** Complex nested Zod schemas with optional fields, unions, and arrays produce JSON Schemas that exceed the tool input_schema complexity limits, causing malformed or incomplete responses.
**Why it happens:** The `zod-to-json-schema` conversion can produce deeply nested `$ref` structures. Anthropic's structured output has limitations: no recursive schemas, no complex enum types, `additionalProperties` must be `false`.
**How to avoid:** Keep round output schemas flat where possible. Use `z.string()` for free-form analysis text rather than deeply nested objects. Put structured data (modules, files, dependencies) in arrays of simple objects. Test each schema against the provider before implementation. Note: structured outputs (GA for Claude Opus 4.6) remove the `$ref` issue when using `output_config.format` instead of `tool_use`, but this requires SDK upgrade.
**Warning signs:** Empty or incomplete tool_use responses, Zod validation errors on the response, `400` errors about schema complexity.

### Pitfall 3: Round 5 Per-Module Fan-Out Exceeding Rate Limits
**What goes wrong:** For projects with 15+ detected modules, Round 5 fires 15+ concurrent LLM calls, overwhelming the rate limiter or hitting Anthropic's per-minute limits.
**Why it happens:** `Promise.allSettled` launches all calls immediately. The rate limiter (concurrency 4 default) queues excess calls, but the total burst may still trigger 429s.
**How to avoid:** The existing `RateLimiter` in `AnthropicProvider` already limits concurrent calls to the configured concurrency (default 4). The `retryWithBackoff` handles 429s. For very large projects, batch the module fan-out: process modules in groups of `concurrency * 2` with `Promise.allSettled`. This naturally stays within rate limits.
**Warning signs:** Multiple 429 retries logged for Round 5, significantly longer Round 5 execution time.

### Pitfall 4: Prompt Too Large for Small Context Windows
**What goes wrong:** System prompt + packed file content + prior context + round instructions exceed the context window, especially for non-Anthropic providers with smaller windows (Ollama models: 4K-32K).
**Why it happens:** Phase 5 is designed for Anthropic's 200K context window. Other providers have drastically smaller windows.
**How to avoid:** The `TokenBudget` from Phase 4 already accounts for this via `LLMProvider.maxContextTokens()`. But prompt overhead (system prompt, structural wrapping, prior context) must be subtracted from the file content budget. For small-window providers, the packer will naturally include fewer files. Ensure the system prompt for each round is reasonably sized (under 1000 tokens). Consider a `maxSystemPromptTokens` constant.
**Warning signs:** API errors on Ollama or other small-window providers, empty packed file lists.

### Pitfall 5: Module Detection Failure Cascading to All Subsequent Rounds
**What goes wrong:** Round 2 (Module Detection) fails, and Rounds 3-6 all get skipped because they depend on module boundaries.
**Why it happens:** The user decision says "when a dependency round fails, skip dependent rounds entirely." If Round 2 fails, everything downstream stops.
**How to avoid:** This is correct behavior per the user decision. However, implement a meaningful fallback for Round 2: use the top-level directory structure as an approximation of module boundaries. This static fallback allows the pipeline to continue with degraded (but still useful) module information. Mark the output as `status: 'degraded'` so Phase 6 can indicate reduced confidence.
**Warning signs:** Round 2 failure with all subsequent rounds showing `status: 'skipped'`.

### Pitfall 6: Validation Auto-Retry Creating Infinite Loops
**What goes wrong:** A round fails validation (>30% claims dropped), retries with stricter prompting, fails again, and the system enters an infinite retry loop.
**Why it happens:** The >30% threshold may be too strict for certain project types, or the stricter prompting may not fix the root cause.
**How to avoid:** The user decision caps retries at "auto-retry once." Implement this as a boolean flag: `hasRetried`. If the retry also fails validation, accept the result with dropped claims and log a warning. Never retry more than once.
**Warning signs:** Two consecutive validation failures for the same round, high claim drop rates even after retry.

### Pitfall 7: Temperature Too High Causing Inconsistent Analysis
**What goes wrong:** With default temperature (0.7 in the existing `AnthropicProvider`), the AI produces different analysis results on re-runs of the same codebase, confusing users.
**Why it happens:** Temperature 0.7 adds significant randomness to output. Analysis tasks benefit from deterministic, reproducible output.
**How to avoid:** Set temperature to 0.2-0.3 for all analysis rounds. This keeps output focused and reproducible while allowing minimal creativity for natural language phrasing. The existing `CompletionRequest.temperature` field already supports this as an optional override.
**Warning signs:** Significantly different output on consecutive runs of the same codebase.

## Code Examples

### Round 1 System Prompt (Project Overview)
```typescript
// Source: AI-01 requirement, Claude 4 best practices
const ROUND_1_SYSTEM = `You are a senior software architect analyzing a codebase for developer handover documentation.

Your task: produce a project overview that interleaves business purpose with technical landscape. A new developer reading this should understand BOTH what the project does and how it's built, simultaneously.

Guidelines:
- Be direct and honest. Call out tech debt, anti-patterns, and questionable decisions plainly.
- Reference specific files and code patterns from the provided codebase.
- For each key finding, cite the file path where you observed it.
- If the project has issues (poor error handling, mixed concerns, unclear naming), state them clearly.
- Produce layered output: the first paragraph should give a senior engineer the essential picture; subsequent sections add depth for junior developers.

You MUST reference specific files, functions, and code patterns. Generic observations without code evidence are not acceptable.`;
```

### Round 2 System Prompt (Module Detection)
```typescript
// Source: AI-02 requirement, user decision on module inference
const ROUND_2_SYSTEM = `You are analyzing a codebase to identify logical module boundaries for developer handover documentation.

Your task: identify bounded contexts and module boundaries, even when the code doesn't have explicit separation. Help the reader see the forest through the trees.

Guidelines:
- Infer logical modules from import patterns, directory structure, naming conventions, and functional cohesion.
- Each module should have: a name, a path (directory or file prefix), a clear purpose statement, and a list of public API surface (exported functions/classes).
- Identify inter-module relationships (which modules depend on which).
- For flat codebases without clear directory boundaries, group files by functional concern.
- Be honest about modules with mixed concerns or unclear boundaries.

Use the AST data (imports, exports, function signatures) to ground your analysis in code facts, not speculation.`;
```

### Complete Round Execution Pattern
```typescript
// Source: Composite pattern from existing infrastructure
import type { LLMProvider } from '../providers/base.js';
import type { StaticAnalysisResult } from '../analyzers/types.js';
import type { PackedContext, RoundContext } from '../context/types.js';
import { compressRoundOutput } from '../context/compressor.js';
import { TokenUsageTracker } from '../context/tracker.js';

interface RoundExecutionResult<T> {
  data: T;
  validation: ValidationResult;
  quality: QualityMetrics;
  context: RoundContext; // Compressed context for next round
  status: 'success' | 'degraded' | 'retried';
}

async function executeRound<T>(
  roundNumber: number,
  provider: LLMProvider,
  schema: z.ZodType<T>,
  buildPrompt: (isRetry: boolean) => CompletionRequest,
  validate: (data: T) => ValidationResult,
  checkQuality: (data: T) => QualityMetrics,
  buildFallback: () => T,
  tracker: TokenUsageTracker,
  estimateTokensFn: (text: string) => number,
): Promise<RoundExecutionResult<T>> {
  let hasRetried = false;

  const attempt = async (isRetry: boolean): Promise<RoundExecutionResult<T>> => {
    const request = buildPrompt(isRetry);
    const result = await provider.complete(request, schema);

    // Record token usage
    tracker.recordRound({
      round: roundNumber,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      contextTokens: estimateTokensFn(request.systemPrompt + request.userPrompt),
      fileContentTokens: 0, // Tracked separately
      budgetTokens: provider.maxContextTokens(),
    });

    // Validate claims against AST data
    const validation = validate(result.data);

    // Check if >30% claims dropped -> retry once
    if (validation.dropRate > 0.3 && !hasRetried) {
      hasRetried = true;
      return attempt(true); // Retry with stricter prompting
    }

    // Quality check
    const quality = checkQuality(result.data);
    if (!quality.isAcceptable && !hasRetried) {
      hasRetried = true;
      return attempt(true); // Retry with stronger prompting
    }

    // Compress for next round
    const context = compressRoundOutput(
      roundNumber,
      result.data as Record<string, unknown>,
      2000, // Max tokens for compressed context per round
      estimateTokensFn,
    );

    return {
      data: result.data,
      validation,
      quality,
      context,
      status: hasRetried ? 'retried' : 'success',
    };
  };

  try {
    return await attempt(false);
  } catch (error) {
    // Complete failure: fall back to static data
    const fallbackData = buildFallback();
    const context = compressRoundOutput(
      roundNumber,
      fallbackData as Record<string, unknown>,
      2000,
      estimateTokensFn,
    );

    return {
      data: fallbackData,
      validation: { validated: 0, corrected: 0, total: 0, dropRate: 0 },
      quality: { textLength: 0, codeReferences: 0, specificity: 0, isAcceptable: false },
      context,
      status: 'degraded',
    };
  }
}
```

### DAG Wiring in generate.ts
```typescript
// Source: Existing generate.ts, replacing placeholder steps
// Round dependency graph:
//
// static-analysis
//       |
//   ai-round-1 (Project Overview)
//       |
//   ai-round-2 (Module Detection)
//      / | \  \
//     /  |  \  \
//   R3  R4  R5  R6  (parallel after R2)
//
// R3: Feature Extraction (deps: R1, R2)
// R4: Architecture Detection (deps: R1, R2, R3)
// R5: Edge Cases -- fans out per module (deps: R2)
// R6: Deployment Inference (deps: R1)

const steps = [
  createStep({
    id: 'static-analysis',
    name: 'Static Analysis',
    deps: [],
    execute: async () => runStaticAnalysis(rootDir, config),
  }),
  createStep({
    id: 'ai-round-1',
    name: 'AI Round 1: Project Overview',
    deps: ['static-analysis'],
    execute: async (ctx) => { /* ... */ },
  }),
  createStep({
    id: 'ai-round-2',
    name: 'AI Round 2: Module Detection',
    deps: ['ai-round-1'],
    execute: async (ctx) => { /* ... */ },
  }),
  createStep({
    id: 'ai-round-3',
    name: 'AI Round 3: Feature Extraction',
    deps: ['ai-round-2'],   // Also uses R1 context (accumulated)
    execute: async (ctx) => { /* ... */ },
  }),
  createStep({
    id: 'ai-round-4',
    name: 'AI Round 4: Architecture Detection',
    deps: ['ai-round-3'],   // Sequential: needs R1+R2+R3 context
    execute: async (ctx) => { /* ... */ },
  }),
  createStep({
    id: 'ai-round-5',
    name: 'AI Round 5: Edge Cases & Conventions',
    deps: ['ai-round-2'],   // Only needs R2 modules, fans out per-module
    execute: async (ctx) => { /* ... */ },
  }),
  createStep({
    id: 'ai-round-6',
    name: 'AI Round 6: Deployment Inference',
    deps: ['ai-round-2'],   // Needs R1 context (via R2), env/CI data
    execute: async (ctx) => { /* ... */ },
  }),
];
```

### Validation Summary Generation
```typescript
// Source: User decision -- validation summary for trust building
interface PipelineValidationSummary {
  totalClaims: number;
  validatedClaims: number;
  correctedClaims: number;
  roundSummaries: Array<{
    round: number;
    name: string;
    status: 'success' | 'degraded' | 'retried' | 'skipped' | 'failed';
    validated: number;
    corrected: number;
    reason?: string;
  }>;
}

function buildValidationSummary(
  roundResults: Map<number, RoundExecutionResult<unknown>>,
): PipelineValidationSummary {
  let totalClaims = 0;
  let validatedClaims = 0;
  let correctedClaims = 0;
  const roundSummaries: PipelineValidationSummary['roundSummaries'] = [];

  for (const [round, result] of roundResults) {
    totalClaims += result.validation.total;
    validatedClaims += result.validation.validated;
    correctedClaims += result.validation.corrected;

    roundSummaries.push({
      round,
      name: ROUND_NAMES[round],
      status: result.status,
      validated: result.validation.validated,
      corrected: result.validation.corrected,
    });
  }

  return { totalClaims, validatedClaims, correctedClaims, roundSummaries };
}
```

## Discretion Recommendations

### Prompt Structure: XML Tags for Structured Sections
**Recommendation:** Use XML tags (`<codebase_context>`, `<prior_analysis>`, `<round_data>`, `<instructions>`) to clearly delimit prompt sections. Anthropic's official documentation recommends XML format indicators for Claude, and the existing project already uses this pattern.
**Confidence:** HIGH -- Directly from Anthropic's prompt engineering best practices for Claude 4.x models.

### Temperature: 0.3 for All Analysis Rounds
**Recommendation:** Use temperature 0.3 for all 6 rounds. This balances determinism (reproducible analysis) with enough flexibility for natural language generation. The default 0.7 in `AnthropicProvider` is too high for analytical tasks. Pass `temperature: 0.3` in each round's `CompletionRequest`.
**Confidence:** HIGH -- Standard practice for classification/extraction tasks. Anthropic docs recommend lower temperature for tasks requiring precision.

### Context Compression: 2000 Tokens Per Prior Round
**Recommendation:** Allocate 2000 tokens per prior round for compressed context. This means by Round 6, at most 10K tokens are used for prior-round context (5 prior rounds x 2000). Phase 4's `compressRoundOutput()` already handles truncation within a token budget. This leaves the majority of the 200K budget for packed file content and the round's own output.
**Confidence:** HIGH -- 2000 tokens per round is generous enough to capture key findings but bounded enough to prevent context overflow.

### Quality Check Thresholds
**Recommendation:**
- Minimum output text length: 500 characters for Rounds 1-5, 200 characters for Round 6 (deployment may have limited signals)
- Minimum code references (file paths, function names): 3 for Round 1, 5 for Rounds 2-5, 2 for Round 6
- If a round's output contains zero file path references, always retry regardless of length
**Confidence:** MEDIUM -- These thresholds are reasonable starting points but may need tuning based on real codebase analysis results. Start conservative (low thresholds) and tighten later.

### Parallelization: R3+R5+R6 After R2, R4 After R3
**Recommendation:** The dependency graph should be:
- R1 -> R2 (sequential: R2 needs R1's overview)
- R2 -> R3, R5, R6 (parallel: these are independent tracks after module detection)
- R3 -> R4 (sequential: architecture detection benefits from feature context)

This achieves the 40% speedup requirement (PIPE-02) because R3, R5, and R6 run in parallel. R4 waits for R3 but runs concurrently with R5 and R6. The DAG orchestrator handles this automatically via step dependencies.

Total parallel execution time: max(R3+R4, R5, R6) instead of R3+R4+R5+R6. For typical projects where rounds take 10-30 seconds each, this saves 20-60 seconds.
**Confidence:** HIGH -- This matches the PIPE-02 requirement and the DAG orchestrator already supports this pattern.

### Round 5 Fan-Out Strategy
**Recommendation:** For each module detected by Round 2:
1. Filter `StaticAnalysisResult.ast.files` to files within that module's path
2. Build a module-specific `PackedContext` using the existing packer (with a per-module token sub-budget)
3. Call `LLMProvider.complete()` with the module-specific prompt and Round5ModuleSchema
4. Use `Promise.allSettled()` so failed modules don't block others
5. Aggregate results into the Round 5 output

Per-module token budget: `(remaining token budget) / moduleCount`, with a minimum of 4000 tokens per module. If a project has 30 modules, this means small budgets per module -- in that case, only include signatures-tier content.

Cap at 20 concurrent module analyses to avoid overwhelming the rate limiter. For projects with >20 modules, batch in groups of 10.
**Confidence:** MEDIUM -- The batching threshold (20) may need adjustment based on real rate limit behavior. The per-module budget calculation is straightforward.

### Stricter Prompting for Retries
**Recommendation:** When retrying a round after quality/validation failure, add these modifications:
1. Prepend to system prompt: "IMPORTANT: Your previous attempt was too generic. You MUST reference specific files, functions, and code patterns from the provided codebase. Every claim must cite a file path."
2. Add to instructions: "If you are uncertain about a claim, omit it entirely rather than stating it vaguely."
3. Lower temperature from 0.3 to 0.1 for the retry attempt
**Confidence:** HIGH -- Explicit instructions about code references combined with lower temperature reliably improve specificity in Claude's output.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tool_use` forced via `tool_choice` for structured output | Native `output_config.format` with `json_schema` type | Nov 2025 (GA Feb 2026) | Cleaner API, no tool wrapping, SDK auto-validates. BUT: `tool_use` still works and is what this project currently uses |
| Manual JSON parsing of LLM responses | SDK `messages.parse()` + `zodOutputFormat()` | SDK v0.50+ | Automatic Zod-to-JSON-Schema conversion and response validation built into SDK. Eliminates custom `zod-to-json-schema` usage |
| Single mega-prompt for codebase analysis | Progressive multi-round analysis | 2024+ | Better context management, enables parallelism, more focused output per round |
| Trust all LLM output | Validate critical claims against deterministic facts | 2025+ | Research shows AST-based validation achieves near-100% precision for import/dependency claim validation |
| `output_format` parameter | `output_config.format` parameter | Late 2025 | `output_format` is deprecated but still works temporarily. New code should use `output_config.format` |

**Deprecated/outdated:**
- **`output_format` parameter**: Deprecated in favor of `output_config.format`. The old parameter still works temporarily but will be removed.
- **`@anthropic-ai/tokenizer`**: Beta, not accurate for Claude 3+. Do not use.
- **Prefilled responses (last assistant turn)**: Not supported starting with Claude Opus 4.6. Use system prompt instructions instead.

## Open Questions

1. **SDK upgrade timing and approach**
   - What we know: Current SDK (0.39.0) works with `tool_use` pattern. Latest SDK (0.74.0) adds `messages.parse()`, `zodOutputFormat()`, `output_config.format` native structured outputs. Both approaches produce correct results.
   - What's unclear: Whether to upgrade SDK as part of Phase 5 or handle it separately. Upgrading may introduce breaking changes in the provider layer.
   - Recommendation: Keep the existing `tool_use` approach for Phase 5 implementation. Upgrade SDK in a separate task (before or after Phase 5). The `AnthropicProvider.complete()` interface isolates Phase 5 from SDK internals.

2. **Max output tokens per round**
   - What we know: Current default is 4096 in `AnthropicProvider`. Some rounds (especially Round 2 Module Detection for large projects) may need more output tokens.
   - What's unclear: The optimal `maxTokens` per round. Too low truncates output; too high wastes cost.
   - Recommendation: Default to 4096 for most rounds. Allow per-round override via the `CompletionRequest.maxTokens` field. Round 2 and Round 5 may need 8192 for complex projects.

3. **How to handle Round 4 dependency on Round 3**
   - What we know: The success criteria say Rounds 3, 5, 6 run in parallel after Round 2. But AI-04 says Round 4 identifies patterns from Rounds 1-3, implying it depends on Round 3.
   - What's unclear: Whether Round 4 truly needs Round 3's output or can run with just Rounds 1-2.
   - Recommendation: Make Round 4 depend on Round 3 (sequential R3 -> R4). This still allows parallelism: R5 and R6 run concurrently with R3+R4 chain. The 40% speedup is achievable because max(R3+R4, R5, R6) < R3+R4+R5+R6.

## Sources

### Primary (HIGH confidence)
- Anthropic Structured Outputs documentation (https://platform.claude.com/docs/en/build-with-claude/structured-outputs) -- GA for Claude Opus 4.6, `output_config.format` with `json_schema` type, SDK `zodOutputFormat()` helper, JSON Schema limitations
- Anthropic Claude 4 Prompting Best Practices (https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices) -- XML tags for prompt sections, temperature guidance, explicit instructions, minimal over-prompting for Claude Opus 4.6
- Context7: @anthropic-ai/sdk TypeScript (/anthropics/anthropic-sdk-typescript) -- `messages.parse()`, `zodOutputFormat()`, `tool_use` pattern, rate limiting, retry behavior
- Context7: zod-to-json-schema (/stefanterdell/zod-to-json-schema) -- `zodToJsonSchema()` API, definitions handling, options configuration
- Existing codebase: `AnthropicProvider.complete()` at `src/providers/anthropic.ts` -- tool_use structured output pattern already implemented
- Existing codebase: `DAGOrchestrator` at `src/orchestrator/dag.ts` -- Kahn's algorithm, parallel execution, failure skip behavior
- Existing codebase: `compressRoundOutput()` at `src/context/compressor.ts` -- deterministic inter-round context compression
- Existing codebase: `TokenUsageTracker` at `src/context/tracker.ts` -- per-round token tracking with warnings

### Secondary (MEDIUM confidence)
- Anthropic SDK npm registry (@anthropic-ai/sdk) -- Current version 0.74.0, installed version 0.39.0, helpers directory available in newer versions
- AST-based hallucination detection research (https://arxiv.org/abs/2601.19106) -- Deterministic AST validation achieving near-100% precision for code fact claims
- Anthropic Prompt Engineering Overview (https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) -- General principles for structured prompting

### Tertiary (LOW confidence)
- Optimal quality check thresholds -- Starting values (500 chars, 3-5 code refs) are reasonable but may need tuning based on real analysis results
- Per-module token budget for Round 5 fan-out -- The `remaining / moduleCount` heuristic is logical but untested at scale
- Rate limit behavior at high fan-out concurrency -- The existing RateLimiter handles this, but real-world behavior with 15+ queued module analyses is unverified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies. All functionality built on existing infrastructure from Phases 1-4.
- Architecture: HIGH -- Round-as-DAG-step pattern directly follows existing `StepDefinition` interface. Prompt assembly uses established patterns.
- Prompt engineering: HIGH -- Based on Anthropic's official Claude 4.x best practices. XML tags, low temperature, explicit instructions.
- Hallucination validation: HIGH -- Cross-checking file paths and import claims against `StaticAnalysisResult` AST data is straightforward and well-grounded.
- Quality checks: MEDIUM -- Threshold values are reasonable starting points but lack empirical validation on real codebases.
- Parallelization: HIGH -- DAG orchestrator already supports this. Step dependency wiring is deterministic.
- Round 5 fan-out: MEDIUM -- Pattern is sound but batching thresholds and per-module budgets need real-world testing.

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (internal architecture; no fast-moving external dependencies unless SDK is upgraded)
