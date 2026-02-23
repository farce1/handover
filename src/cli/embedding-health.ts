import { loadConfig } from '../config/loader.js';
import { HandoverError, handleCliError } from '../utils/errors.js';
import { EmbeddingHealthChecker } from '../vector/embedding-health.js';
import { DEFAULT_EMBEDDING_LOCALITY_MODE } from '../vector/types.js';

interface EmbeddingHealthFailurePayload {
  ok: false;
  mode: string;
  provider: string;
  checks: {
    connectivity: {
      ok: boolean;
      detail: string;
    };
    modelReady: {
      ok: boolean;
      detail: string;
    };
  };
  fix: string;
  summary: string;
}

function writeStdout(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeFailureDiagnostics(payload: EmbeddingHealthFailurePayload): void {
  writeStdout(JSON.stringify(payload, null, 2));
}

export async function runEmbeddingHealth(): Promise<void> {
  try {
    const config = loadConfig();
    const mode = config.embedding?.mode ?? DEFAULT_EMBEDDING_LOCALITY_MODE;

    if (mode === 'remote-only') {
      writeStdout('Embedding health: ready (mode: remote-only, provider: remote)');
      return;
    }

    const local = config.embedding?.local;
    if (!local?.model) {
      throw new HandoverError(
        'Local embedding model is required for health checks',
        `Embedding mode '${mode}' requires embedding.local.model`,
        'Set embedding.local.model in .handover.yml or run with --embedding-mode remote-only',
        'EMBEDDING_LOCAL_MODEL_MISSING',
      );
    }

    const checker = new EmbeddingHealthChecker();
    const result = await checker.checkLocalProvider({
      mode,
      baseUrl: local.baseUrl,
      model: local.model,
      timeoutMs: local.timeout,
    });

    if (!result.ok) {
      writeFailureDiagnostics({
        ok: false,
        mode: result.mode,
        provider: result.provider,
        checks: result.checks,
        fix: result.fix,
        summary: result.summary,
      });

      throw new HandoverError(
        'Embedding provider health check failed',
        result.summary,
        result.fix,
        'EMBEDDING_HEALTH_FAILED',
      );
    }

    writeStdout(`Embedding health: ready (mode: ${result.mode}, provider: ${result.provider})`);
  } catch (err) {
    handleCliError(err, 'Failed to run embedding health check');
  }
}
