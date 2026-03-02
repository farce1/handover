import { GitError, simpleGit } from 'simple-git';

export type GitFingerprintResult =
  | { kind: 'ok'; changedFiles: Set<string> }
  | { kind: 'fallback'; reason: string };

export async function getGitChangedFiles(
  rootDir: string,
  sinceRef: string,
): Promise<GitFingerprintResult> {
  const git = simpleGit(rootDir);

  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    return { kind: 'fallback', reason: 'Not a git repo' };
  }

  try {
    const shallow = await git.raw(['rev-parse', '--is-shallow-repository']);
    if (shallow.trim() === 'true') {
      return { kind: 'fallback', reason: 'Shallow clone detected' };
    }
  } catch {
    // Older git versions may not support --is-shallow-repository.
  }

  const status = await git.status();
  if (status.detached) {
    return { kind: 'fallback', reason: 'Detached HEAD' };
  }

  try {
    const resolved = await git.revparse([sinceRef]);
    if (!resolved.trim()) {
      throw new Error(`Invalid git ref "${sinceRef}"`);
    }
  } catch (error) {
    if (error instanceof GitError) {
      throw new Error(`Invalid git ref "${sinceRef}": ${error.message}`);
    }
    throw error;
  }

  const diff = await git.diffSummary([sinceRef, 'HEAD']);
  const changedFiles = new Set<string>();

  for (const file of diff.files) {
    changedFiles.add(file.file);
  }

  for (const file of status.modified) {
    changedFiles.add(file);
  }
  for (const file of status.created) {
    changedFiles.add(file);
  }
  for (const file of status.deleted) {
    changedFiles.add(file);
  }
  for (const rename of status.renamed) {
    changedFiles.add(rename.to);
  }
  for (const file of status.not_added) {
    changedFiles.add(file);
  }
  for (const file of status.staged) {
    changedFiles.add(file);
  }

  return { kind: 'ok', changedFiles };
}
