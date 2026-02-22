import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const CHECKPOINT_FILE = 'workflow-checkpoints.json';
const HANDOVER_DIR = '.handover';

export interface WorkflowCheckpoint {
  workflowId: string;
  selectedBranch: string;
  stepIndex: number;
  requiredArgs: string[];
  args: Record<string, string>;
  updatedAt: string;
}

interface WorkflowCheckpointStore {
  checkpoints: Record<string, WorkflowCheckpoint>;
}

interface WorkflowCheckpointPathOptions {
  outputDir?: string;
}

function resolveCheckpointPath(options: WorkflowCheckpointPathOptions = {}): string {
  if (options.outputDir) {
    return resolve(options.outputDir, '..', HANDOVER_DIR, CHECKPOINT_FILE);
  }

  return join(process.cwd(), HANDOVER_DIR, CHECKPOINT_FILE);
}

function readCheckpointStore(path: string): WorkflowCheckpointStore {
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as WorkflowCheckpointStore;
    if (!parsed.checkpoints || typeof parsed.checkpoints !== 'object') {
      return { checkpoints: {} };
    }

    return parsed;
  } catch {
    return { checkpoints: {} };
  }
}

function writeCheckpointStore(path: string, store: WorkflowCheckpointStore): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf-8');
}

export function loadWorkflowCheckpoint(
  workflowId: string,
  options: WorkflowCheckpointPathOptions = {},
): WorkflowCheckpoint | null {
  const path = resolveCheckpointPath(options);
  const store = readCheckpointStore(path);

  return store.checkpoints[workflowId] ?? null;
}

export function saveWorkflowCheckpoint(
  checkpoint: Omit<WorkflowCheckpoint, 'updatedAt'>,
  options: WorkflowCheckpointPathOptions = {},
): WorkflowCheckpoint {
  const path = resolveCheckpointPath(options);
  const store = readCheckpointStore(path);

  const persisted: WorkflowCheckpoint = {
    ...checkpoint,
    updatedAt: new Date().toISOString(),
  };

  store.checkpoints[checkpoint.workflowId] = persisted;
  writeCheckpointStore(path, store);

  return persisted;
}

export function clearWorkflowCheckpoint(
  workflowId: string,
  options: WorkflowCheckpointPathOptions = {},
): void {
  const path = resolveCheckpointPath(options);
  const store = readCheckpointStore(path);

  if (!store.checkpoints[workflowId]) {
    return;
  }

  delete store.checkpoints[workflowId];

  if (Object.keys(store.checkpoints).length === 0) {
    rmSync(path, { force: true });
    return;
  }

  writeCheckpointStore(path, store);
}
