import { HandoverError } from '../utils/errors.js';
import type { EmbeddingLocalityMode, EmbeddingProviderRoute } from './types.js';

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
}

export interface EmbeddingHealthCheck {
  ok: boolean;
  detail: string;
}

export interface EmbeddingHealthChecks {
  connectivity: EmbeddingHealthCheck;
  modelReady: EmbeddingHealthCheck;
}

export interface EmbeddingHealthResult {
  ok: boolean;
  mode: EmbeddingLocalityMode;
  provider: EmbeddingProviderRoute;
  checks: EmbeddingHealthChecks;
  fix: string;
  summary: string;
  successSummary: string;
}

export interface LocalHealthInput {
  mode: EmbeddingLocalityMode;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

export class EmbeddingHealthChecker {
  async checkLocalProvider(input: LocalHealthInput): Promise<EmbeddingHealthResult> {
    const baseUrl = input.baseUrl.replace(/\/$/, '');
    const timeoutMs = input.timeoutMs ?? 5_000;

    const connectivity = await this.checkConnectivity(baseUrl, timeoutMs);
    const modelReady = connectivity.ok
      ? await this.checkModelReady(baseUrl, input.model, timeoutMs)
      : {
          ok: false,
          detail: `Skipped because connectivity check failed for ${baseUrl}`,
        };

    const ok = connectivity.ok && modelReady.ok;
    const fix =
      `Start Ollama and verify endpoint ${baseUrl}. ` +
      `Install the model with 'ollama pull ${input.model}' and retry.`;

    const summary = ok
      ? `Local embedding ready (${input.model} @ ${baseUrl})`
      : 'Local embedding health check failed';

    return {
      ok,
      mode: input.mode,
      provider: 'local',
      checks: {
        connectivity,
        modelReady,
      },
      fix,
      summary,
      successSummary: ok ? summary : '',
    };
  }

  assertReady(result: EmbeddingHealthResult): void {
    if (result.ok) {
      return;
    }

    throw new HandoverError(
      'Embedding provider health check failed',
      `${result.checks.connectivity.detail}; ${result.checks.modelReady.detail}`,
      result.fix,
      'EMBEDDING_HEALTH_FAILED',
    );
  }

  private async checkConnectivity(
    baseUrl: string,
    timeoutMs: number,
  ): Promise<EmbeddingHealthCheck> {
    try {
      await this.fetchJson(`${baseUrl}/api/version`, {
        method: 'GET',
        timeoutMs,
      });

      return {
        ok: true,
        detail: `Connected to ${baseUrl}/api/version`,
      };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async checkModelReady(
    baseUrl: string,
    model: string,
    timeoutMs: number,
  ): Promise<EmbeddingHealthCheck> {
    try {
      await this.fetchJson(`${baseUrl}/api/show`, {
        method: 'POST',
        body: JSON.stringify({ model }),
        timeoutMs,
      });

      return {
        ok: true,
        detail: `Model '${model}' is available`,
      };
    } catch (showError) {
      try {
        const tags = await this.fetchJson(`${baseUrl}/api/tags`, {
          method: 'GET',
          timeoutMs,
        });
        const parsed = tags as OllamaTagsResponse;
        const installed = (parsed.models ?? []).some((entry) => {
          const candidate = entry.name ?? entry.model;
          return candidate === model;
        });

        if (!installed) {
          return {
            ok: false,
            detail: `Model '${model}' is not installed`,
          };
        }

        return {
          ok: false,
          detail: `Model '${model}' is installed but /api/show failed`,
        };
      } catch {
        return {
          ok: false,
          detail: showError instanceof Error ? showError.message : String(showError),
        };
      }
    }
  }

  private async fetchJson(
    url: string,
    options: {
      method: 'GET' | 'POST';
      body?: string;
      timeoutMs: number;
    },
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: options.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
      }

      return await response.json();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${options.timeoutMs}ms`);
      }

      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
