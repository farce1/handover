import type { BranchPattern } from './types.js';

/**
 * Infer the branching strategy from branch names (pure; no git access).
 * Extracted from the git-history analyzer so the classification is testable.
 */
export function detectBranchStrategy(branchNames: string[]): {
  strategy: BranchPattern['strategy'];
  evidence: string[];
} {
  const hasReleaseBranches = branchNames.some((b) => /release[/-]/.test(b));
  const hasDevelop = branchNames.some((b) => /(?:^|\/)(?:develop|dev)$/.test(b));
  const hasFeatureBranches = branchNames.some((b) => /feature[/-]/.test(b));
  const hasHotfix = branchNames.some((b) => /hotfix[/-]/.test(b));

  let strategy: BranchPattern['strategy'] = 'unknown';
  const evidence: string[] = [];

  if (hasDevelop && hasReleaseBranches) {
    strategy = 'git-flow';
    evidence.push('develop branch present');
    evidence.push('release branches found');
    if (hasHotfix) evidence.push('hotfix branches found');
    if (hasFeatureBranches) evidence.push('feature branches found');
  } else if (hasFeatureBranches && !hasDevelop) {
    strategy = 'feature-branch';
    evidence.push('feature branches without develop');
    if (hasReleaseBranches) evidence.push('release branches found');
  } else if (branchNames.length <= 3) {
    strategy = 'trunk-based';
    evidence.push(`${branchNames.length} total branches (<=3 suggests trunk-based)`);
  } else {
    evidence.push(`${branchNames.length} branches, no clear naming convention`);
  }

  return { strategy, evidence };
}
