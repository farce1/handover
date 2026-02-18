# Configuration reference

handover supports three configuration sources. Values are merged in this precedence order (highest to lowest):

1. **CLI flags** — `--provider openai`, `--model gpt-4o`, etc.
2. **Environment variables** — `HANDOVER_PROVIDER`, `HANDOVER_MODEL`, `HANDOVER_OUTPUT`
3. **`.handover.yml`** — config file in the project root
4. **Zod defaults** — built-in defaults; most keys have sensible values

The authoritative schema is in `src/config/schema.ts`. The loading logic and precedence implementation are in `src/config/loader.ts`.

## Top-level options

### `provider`

|              |                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------- |
| Type         | `string` (enum)                                                                           |
| Default      | `anthropic`                                                                               |
| Valid values | `anthropic`, `openai`, `ollama`, `groq`, `together`, `deepseek`, `azure-openai`, `custom` |
| Env override | `HANDOVER_PROVIDER`                                                                       |

The LLM provider to use for AI analysis rounds. Each named provider comes with preset defaults (base URL, default model, API key env var). See [providers.md](providers.md) for a full comparison.

```yaml
provider: openai
```

---

### `model`

|              |                                                         |
| ------------ | ------------------------------------------------------- |
| Type         | `string`                                                |
| Default      | Provider default (e.g. `claude-opus-4-6` for Anthropic) |
| Env override | `HANDOVER_MODEL`                                        |

The model name to use. When omitted, the provider preset's default model is used. Specify a model if you want a faster or cheaper alternative, or to pin a specific version.

```yaml
model: claude-sonnet-4-5
```

---

### `apiKeyEnv`

|         |                                             |
| ------- | ------------------------------------------- |
| Type    | `string`                                    |
| Default | Provider default (e.g. `ANTHROPIC_API_KEY`) |

The name of the environment variable that holds the API key. Useful when you have the key stored under a non-standard name, or when using the `custom` provider. API keys are never read from the config file — they are always resolved from the environment at runtime.

```yaml
apiKeyEnv: MY_CUSTOM_LLM_KEY
```

---

### `baseUrl`

|         |                  |
| ------- | ---------------- |
| Type    | `string` (URL)   |
| Default | Provider default |

Override the API endpoint URL. Required for `azure-openai` (which has no shared endpoint) and `custom`. Also useful for routing traffic through a proxy or self-hosted gateway.

```yaml
baseUrl: https://my-gateway.internal/v1
```

---

### `timeout`

|         |                                                                  |
| ------- | ---------------------------------------------------------------- |
| Type    | `number` (integer, milliseconds)                                 |
| Default | Provider default (120000 for cloud providers, 300000 for Ollama) |

Per-request timeout in milliseconds. Increase for slow models or large projects. Cloud providers default to 2 minutes; Ollama defaults to 5 minutes.

```yaml
timeout: 180000
```

---

### `output`

|              |                   |
| ------------ | ----------------- |
| Type         | `string` (path)   |
| Default      | `./handover`      |
| Env override | `HANDOVER_OUTPUT` |

Directory where handover writes its 14 output documents. Relative paths are resolved from the current working directory. The directory is created if it doesn't exist.

```yaml
output: docs/handover
```

---

### `audience`

|              |                 |
| ------------ | --------------- |
| Type         | `string` (enum) |
| Default      | `human`         |
| Valid values | `human`, `ai`   |

Controls output formatting. `human` produces readable prose with narrative flow. `ai` produces structured output with YAML front-matter blocks and explicit section headers — optimized for ingestion by AI coding tools and RAG pipelines.

```yaml
audience: ai
```

---

### `include`

|         |                            |
| ------- | -------------------------- |
| Type    | `string[]` (glob patterns) |
| Default | `["**/*"]`                 |

Glob patterns specifying which files to include in the analysis. By default all files are included (subject to `exclude`). Use this to narrow analysis to a subdirectory or file type.

```yaml
include:
  - 'src/**'
  - '*.ts'
```

---

### `exclude`

|         |                            |
| ------- | -------------------------- |
| Type    | `string[]` (glob patterns) |
| Default | `[]`                       |

Glob patterns for files to exclude from analysis. Applied after `include`. Common uses: exclude generated code, legacy directories, or large binary assets.

```yaml
exclude:
  - '**/*.generated.ts'
  - 'legacy/**'
  - 'dist/**'
```

---

### `context`

|         |          |
| ------- | -------- |
| Type    | `string` |
| Default | _(none)_ |

Additional free-text context injected into AI prompts. Use this to tell the AI about domain-specific constraints, conventions, or project goals that aren't obvious from the code alone.

```yaml
context: |
  This is an internal tool used by the payments team.
  All financial calculations must be in integer cents, never floats.
```

---

### `costWarningThreshold`

|         |                       |
| ------- | --------------------- |
| Type    | `number` (USD)        |
| Default | _(none — no warning)_ |

If set, handover warns before proceeding when the estimated cost exceeds this value. Useful as a guard against accidentally running expensive analysis on large repos.

```yaml
costWarningThreshold: 2.00
```

---

## Project options (`project.*`)

Provide metadata about your project. These values are injected into AI prompts and appear in the generated documents. All fields are optional.

### `project.name`

|         |                                                  |
| ------- | ------------------------------------------------ |
| Type    | `string`                                         |
| Default | _(inferred from package.json or directory name)_ |

The project's display name. Used in document headings and introductions.

```yaml
project:
  name: Order Management Service
```

---

### `project.description`

|         |          |
| ------- | -------- |
| Type    | `string` |
| Default | _(none)_ |

A one-sentence description of what the project does. Injected into AI prompts to improve context quality.

```yaml
project:
  description: 'REST API for managing customer orders from placement to fulfilment'
```

---

### `project.domain`

|         |          |
| ------- | -------- |
| Type    | `string` |
| Default | _(none)_ |

The business or technical domain (e.g. `e-commerce`, `fintech`, `devtools`). Helps the AI frame its analysis appropriately.

```yaml
project:
  domain: fintech
```

---

### `project.teamSize`

|         |          |
| ------- | -------- |
| Type    | `string` |
| Default | _(none)_ |

Team size context (e.g. `1`, `5`, `50+`). The AI uses this to calibrate the level of detail in documentation and onboarding guidance.

```yaml
project:
  teamSize: '8'
```

---

### `project.deployTarget`

|         |          |
| ------- | -------- |
| Type    | `string` |
| Default | _(none)_ |

Where the project is deployed (e.g. `AWS Lambda`, `Kubernetes`, `Vercel`, `bare metal`). Used in the Deployment document.

```yaml
project:
  deployTarget: AWS ECS Fargate
```

---

## Analysis options (`analysis.*`)

### `analysis.concurrency`

|         |                             |
| ------- | --------------------------- |
| Type    | `number` (positive integer) |
| Default | `4`                         |

Maximum number of concurrent LLM API calls during AI analysis rounds. Reduce to `1` for providers with strict rate limits. Ollama defaults to `1` automatically.

```yaml
analysis:
  concurrency: 2
```

---

### `analysis.staticOnly`

|         |           |
| ------- | --------- |
| Type    | `boolean` |
| Default | `false`   |

When `true`, skip all AI analysis rounds. Only static analyzers run. Documents are generated with the available static data; AI-enriched sections are marked as unavailable. Equivalent to the `--static-only` CLI flag. Free — no API key required.

```yaml
analysis:
  staticOnly: true
```

---

## Context window options (`contextWindow.*`)

These options control which files are prioritized when packing the source code into the AI context window.

### `contextWindow.maxTokens`

|         |                                                 |
| ------- | ----------------------------------------------- |
| Type    | `number` (positive integer)                     |
| Default | _(provider preset — e.g. 200000 for Anthropic)_ |

Override the token budget for the context window. Reduce to lower cost; increase if your provider supports a larger window than the preset default.

```yaml
contextWindow:
  maxTokens: 100000
```

---

### `contextWindow.pin`

|         |                            |
| ------- | -------------------------- |
| Type    | `string[]` (glob patterns) |
| Default | `[]`                       |

Files matching these globs are always included in the AI context window, regardless of scoring. Use for core files that must be present for accurate analysis.

```yaml
contextWindow:
  pin:
    - 'src/core/**'
    - 'src/types/**'
```

---

### `contextWindow.boost`

|         |                            |
| ------- | -------------------------- |
| Type    | `string[]` (glob patterns) |
| Default | `[]`                       |

Files matching these globs receive a higher priority score during context packing. They are included before lower-priority files when the budget is tight, but not guaranteed to be included (unlike `pin`).

```yaml
contextWindow:
  boost:
    - 'src/api/**'
    - 'src/services/**'
```

---

## Full example `.handover.yml`

```yaml
# Provider and model
provider: anthropic
model: claude-sonnet-4-5
output: docs/handover
audience: human

# File selection
include:
  - '**/*'
exclude:
  - 'dist/**'
  - '**/*.generated.ts'
  - 'node_modules/**'

# Additional context for AI prompts
context: |
  Internal tooling project. Audience is senior engineers familiar with TypeScript.

# Cost guard
costWarningThreshold: 3.00

# Project metadata
project:
  name: My Project
  description: 'A brief description of what this project does'
  domain: devtools
  teamSize: '5'
  deployTarget: GitHub Actions + npm

# Analysis tuning
analysis:
  concurrency: 4
  staticOnly: false

# Context window
contextWindow:
  maxTokens: 150000
  pin:
    - 'src/core/**'
  boost:
    - 'src/api/**'
```
