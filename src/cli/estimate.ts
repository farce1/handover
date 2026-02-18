/**
 * Estimate command handler.
 * Shows estimated token count and cost comparison across all providers.
 *
 * Zero network calls, no API key required.
 * Uses file discovery for size estimation and provider presets for pricing.
 */

import { resolve } from 'node:path';
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { discoverFiles } from '../analyzers/file-discovery.js';
import { PROVIDER_PRESETS } from '../providers/presets.js';
import { formatTokens, formatCost, SYMBOLS } from '../ui/formatters.js';

/** Options accepted by the estimate command. */
export interface EstimateOptions {
  provider?: string;
  model?: string;
  verbose?: boolean;
}

/** Cost comparison entry for a single provider/model. */
interface CostEntry {
  providerName: string;
  modelName: string;
  estimatedCost: number;
  isLocal: boolean;
  isCurrent: boolean;
}

/**
 * Run the estimate command.
 * Discovers files, estimates tokens, and prints a styled cost comparison.
 */
export async function runEstimate(options: EstimateOptions): Promise<void> {
  // Load config (no API key resolution — no network calls)
  const cliOverrides: Record<string, unknown> = {};
  if (options.provider) cliOverrides.provider = options.provider;
  if (options.model) cliOverrides.model = options.model;
  const config = loadConfig(cliOverrides);

  // Discover files
  const files = await discoverFiles(resolve(process.cwd()));
  const fileCount = files.length;
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  // Estimate tokens: chars/4 heuristic (Phase 4 decision)
  const estimatedTokens = Math.ceil(totalBytes / 4);

  // Current provider/model
  const currentPreset = PROVIDER_PRESETS[config.provider];
  const currentModel = config.model ?? currentPreset?.defaultModel ?? 'unknown';

  // Build cost comparison across all provider presets
  const entries: CostEntry[] = [];

  for (const preset of Object.values(PROVIDER_PRESETS)) {
    const isCurrent = preset.name === config.provider;
    const modelName = isCurrent ? currentModel : preset.defaultModel;

    if (preset.isLocal) {
      entries.push({
        providerName: preset.name,
        modelName: modelName || preset.name,
        estimatedCost: 0,
        isLocal: true,
        isCurrent,
      });
      continue;
    }

    const pricing = preset.pricing[modelName];
    if (!pricing) {
      // No pricing data for this model — skip or show N/A
      entries.push({
        providerName: preset.name,
        modelName: modelName || preset.defaultModel,
        estimatedCost: 0,
        isLocal: false,
        isCurrent,
      });
      continue;
    }

    // Input tokens dominate; output ~20% of input as heuristic
    const inputCost = (estimatedTokens / 1_000_000) * pricing.inputPerMillion;
    const outputCost = ((estimatedTokens * 0.2) / 1_000_000) * pricing.outputPerMillion;
    const totalCost = inputCost + outputCost;

    entries.push({
      providerName: preset.name,
      modelName,
      estimatedCost: totalCost,
      isLocal: false,
      isCurrent,
    });
  }

  // Sort: current first, then by cost ascending (local last)
  entries.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    if (a.isLocal && !b.isLocal) return 1;
    if (!a.isLocal && b.isLocal) return -1;
    return a.estimatedCost - b.estimatedCost;
  });

  // Render styled output
  const sep = pc.dim(' \u00B7 ');
  const arrow = pc.cyan(SYMBOLS.arrow);

  // Header line
  const header = `${arrow} ${pc.bold('handover estimate')}${sep}${config.provider}/${currentModel}${sep}${fileCount} files${sep}${formatTokens(estimatedTokens)}`;
  console.log(header);
  console.log('');

  // Find longest provider/model label for alignment
  const labels = entries.map((e) => `${e.providerName}/${e.modelName}`);
  const maxLabelLen = Math.max(...labels.map((l) => l.length));

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const label = labels[i];
    const padded = label.padEnd(maxLabelLen);

    let line: string;
    if (entry.isCurrent) {
      const marker = pc.green(SYMBOLS.arrow);
      if (entry.isLocal) {
        line = `  ${marker} ${padded}${sep}${pc.dim('FREE (local)')}`;
      } else {
        line = `  ${marker} ${padded}${sep}${pc.yellow(formatCost(entry.estimatedCost))}`;
      }
    } else {
      const indent = '    ';
      if (entry.isLocal) {
        line = `${indent}${padded}${sep}${pc.dim('FREE (local)')}`;
      } else if (entry.estimatedCost === 0) {
        line = `${indent}${padded}${sep}${pc.dim('N/A')}`;
      } else {
        line = `${indent}${padded}${sep}${pc.yellow(formatCost(entry.estimatedCost))}`;
      }
    }

    console.log(line);
  }
}
