---
title: Providers
---

# Providers

handover supports 8 LLM providers through a unified interface. The provider system is designed around named presets: each provider ships with a base URL, default model, API key env var, and concurrency settings. You only need to name the provider — everything else is pre-configured.

Under the hood, `BaseProvider` handles retry logic and rate-limiting. Concrete providers implement the completion call, using either the Anthropic SDK or the OpenAI-compatible SDK depending on the provider's `sdkType`.

The authoritative preset registry is in `src/providers/presets.ts`. The schema's valid provider values are defined in `src/config/schema.ts`.

## Provider comparison

| Provider       | Env var                | Default model                                  | Local? | Notes                                         |
| -------------- | ---------------------- | ---------------------------------------------- | ------ | --------------------------------------------- |
| `anthropic`    | `ANTHROPIC_API_KEY`    | `claude-opus-4-6`                              | No     | Default provider; uses Anthropic SDK          |
| `openai`       | `OPENAI_API_KEY`       | `gpt-4o`                                       | No     | OpenAI-compatible SDK                         |
| `ollama`       | _(none required)_      | _(set via `--model`)_                          | Yes    | Fully local; no data leaves your machine      |
| `groq`         | `GROQ_API_KEY`         | `llama-3.3-70b-versatile`                      | No     | Fast inference; OpenAI-compatible             |
| `together`     | `TOGETHER_API_KEY`     | `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo` | No     | Open model hosting; OpenAI-compatible         |
| `deepseek`     | `DEEPSEEK_API_KEY`     | `deepseek-chat`                                | No     | Low cost; OpenAI-compatible                   |
| `azure-openai` | `AZURE_OPENAI_API_KEY` | `gpt-4o`                                       | No     | Requires `baseUrl` (your Azure endpoint)      |
| `custom`       | `LLM_API_KEY`          | _(set via `--model`)_                          | Varies | Any OpenAI-compatible API; requires `baseUrl` |

## Configuring a provider

Set the provider via `.handover.yml`, the `HANDOVER_PROVIDER` environment variable, or the `--provider` CLI flag.

**Anthropic (default):**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx handover-cli generate
```

Or in `.handover.yml`:

```yaml
provider: anthropic
model: claude-sonnet-4-5
```

**OpenAI:**

```bash
export OPENAI_API_KEY=sk-...
npx handover-cli generate --provider openai
```

**Ollama (fully local, free):**

```bash
ollama pull llama3.1:8b
npx handover-cli generate --provider ollama --model llama3.1:8b
```

Ollama requires no API key and runs entirely on your machine. The default concurrency is set to `1` automatically to avoid overwhelming a local inference server.

## Custom provider

The `custom` provider is an escape hatch for any OpenAI-compatible API endpoint not listed above. It requires two settings:

1. **`baseUrl`** — the API endpoint (required; no preset default)
2. **`model`** — the model name to request (required; no preset default)

The API key is read from `LLM_API_KEY` by default. Override with `apiKeyEnv` to use a different env var name.

Example for a self-hosted vLLM server:

```yaml
provider: custom
baseUrl: http://my-vllm-server:8000/v1
model: mistral-7b-instruct
apiKeyEnv: VLLM_API_KEY
```

```bash
export VLLM_API_KEY=...
npx handover-cli generate
```

The custom provider works with any service that implements the OpenAI `/v1/chat/completions` API, including vLLM, LM Studio, llama.cpp server, and hosted services with OpenAI-compatible APIs.
