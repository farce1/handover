import { HandoverError } from '../utils/errors.js';
import { EmbeddingHealthChecker, type EmbeddingHealthResult } from './embedding-health.js';
import type { EmbeddingClient } from './embedder.js';
import type { EmbeddingLocalityMode, EmbeddingRouteMetadata } from './types.js';
import type { LocalEmbeddingProvider } from './local-embedder.js';

export interface ResolveEmbeddingRouteInput {
  mode: EmbeddingLocalityMode;
  operation: 'indexing' | 'retrieval' | 'health-check';
  interactive: boolean;
  remoteProvider: EmbeddingClient;
  localProvider?: LocalEmbeddingProvider;
  confirmRemoteFallback?: (state: {
    operation: ResolveEmbeddingRouteInput['operation'];
    diagnostics: EmbeddingHealthResult;
  }) => Promise<boolean>;
}

export interface EmbeddingRouteResolution {
  provider: EmbeddingClient;
  metadata: EmbeddingRouteMetadata;
  diagnostics?: EmbeddingHealthResult;
}

export class EmbeddingRouter {
  constructor(
    private readonly healthChecker: EmbeddingHealthChecker = new EmbeddingHealthChecker(),
  ) {}

  async resolve(input: ResolveEmbeddingRouteInput): Promise<EmbeddingRouteResolution> {
    if (input.mode === 'remote-only') {
      return {
        provider: input.remoteProvider,
        metadata: {
          mode: input.mode,
          provider: 'remote',
          reason: 'Mode is remote-only',
        },
      };
    }

    const localProvider = input.localProvider;
    if (!localProvider) {
      throw new HandoverError(
        'Local embedding provider is not configured',
        `Embedding mode '${input.mode}' requires a local provider instance`,
        'Set embedding.local.model in .handover.yml or use --embedding-mode remote-only',
        'EMBEDDING_LOCAL_PROVIDER_MISSING',
      );
    }

    const diagnostics = await this.healthChecker.checkLocalProvider({
      mode: input.mode,
      baseUrl: localProvider.getBaseUrl(),
      model: localProvider.model,
      timeoutMs: localProvider.getTimeoutMs(),
    });

    if (diagnostics.ok) {
      return {
        provider: localProvider,
        diagnostics,
        metadata: {
          mode: input.mode,
          provider: 'local',
          reason: diagnostics.successSummary,
        },
      };
    }

    if (input.mode === 'local-only') {
      throw new HandoverError(
        'Local embedding provider is unavailable',
        diagnostics.summary,
        diagnostics.fix,
        'EMBEDDING_LOCAL_UNAVAILABLE',
      );
    }

    if (!input.interactive) {
      throw new HandoverError(
        'Remote fallback requires explicit confirmation in local-preferred mode',
        `${diagnostics.summary}. Non-interactive execution cannot prompt for confirmation`,
        'Rerun interactively to confirm fallback, or set --embedding-mode remote-only for this run',
        'EMBEDDING_CONFIRMATION_REQUIRED',
      );
    }

    if (!input.confirmRemoteFallback) {
      throw new HandoverError(
        'Remote fallback confirmation handler is missing',
        'Router cannot ask for explicit confirmation without a confirmation callback',
        'Provide confirmRemoteFallback when resolving in local-preferred mode',
        'EMBEDDING_CONFIRMATION_HANDLER_MISSING',
      );
    }

    const approved = await input.confirmRemoteFallback({
      operation: input.operation,
      diagnostics,
    });

    if (!approved) {
      throw new HandoverError(
        'Remote fallback was declined',
        'User denied fallback from local-preferred to remote provider',
        'Start local embedding provider or rerun with --embedding-mode remote-only',
        'EMBEDDING_FALLBACK_DECLINED',
      );
    }

    return {
      provider: input.remoteProvider,
      diagnostics,
      metadata: {
        mode: input.mode,
        provider: 'remote',
        reason: 'User confirmed remote fallback from local-preferred mode',
      },
    };
  }
}
