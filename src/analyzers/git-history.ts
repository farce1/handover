import { simpleGit } from 'simple-git';
import { logger } from '../utils/logger.js';
import type {
  AnalysisContext,
  AnalyzerResult,
  GitHistoryResult,
  BranchPattern,
  GitCommit,
  Contributor,
  FileOwnership,
} from './types.js';

// ─── Helper: empty result when not a git repo ────────────────────────────────

function emptyGitResult(warning: string): GitHistoryResult {
  return {
    isGitRepo: false,
    branchPattern: {
      strategy: 'unknown',
      evidence: [],
      activeBranches: [],
      staleBranches: [],
      defaultBranch: '',
      branchCount: 0,
    },
    recentCommits: [],
    mostChangedFiles: [],
    activityByMonth: {},
    contributors: [],
    fileOwnership: [],
    warnings: [warning],
  };
}

// ─── Main analyzer ──────────────────────────────────────────────────────────

/**
 * Git history analyzer (STAT-03).
 *
 * Extracts branch patterns with strategy detection, commit history with
 * configurable depth, file churn, contributor data, and file ownership.
 * Gracefully returns empty result when not in a git repository.
 */
export async function analyzeGitHistory(
  ctx: AnalysisContext,
): Promise<AnalyzerResult<GitHistoryResult>> {
  const start = performance.now();

  try {
    const git = simpleGit(ctx.rootDir);

    // Check if this is a git repo
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return {
        success: true,
        data: emptyGitResult('Not a git repository'),
        elapsed: performance.now() - start,
      };
    }

    // ── Branch analysis ──────────────────────────────────────────────────

    const branches = await git.branch(['-a', '--sort=-committerdate']);
    const branchNames = branches.all;

    // Detect branching strategy from naming patterns
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

    // Identify active (within 30 days) and stale (90+ days) branches
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    const activeBranches: string[] = [];
    const staleBranches: string[] = [];

    // Get branch last-commit dates via for-each-ref
    try {
      const refOutput = await git.raw([
        'for-each-ref',
        '--format=%(refname:short)|%(committerdate:iso-strict)',
        'refs/heads/',
        'refs/remotes/',
      ]);
      for (const line of refOutput.trim().split('\n')) {
        if (!line) continue;
        const [name, dateStr] = line.split('|');
        if (!name || !dateStr) continue;
        const commitDate = new Date(dateStr).getTime();
        const age = now - commitDate;
        if (age <= thirtyDaysMs) {
          activeBranches.push(name);
        } else if (age >= ninetyDaysMs) {
          staleBranches.push(name);
        }
      }
    } catch {
      // for-each-ref failure is non-critical; continue with empty arrays
    }

    // Count local and remote branches
    const localCount = Object.keys(branches.branches).filter(
      (b) => !b.startsWith('remotes/'),
    ).length;
    const _remoteCount = branchNames.length - localCount;

    const branchPattern: BranchPattern = {
      strategy,
      evidence,
      activeBranches,
      staleBranches,
      defaultBranch: branches.current,
      branchCount: branchNames.length,
    };

    // ── Commit history with configurable depth ────────────────────────────

    const sinceArg: string[] = [];
    if (ctx.gitDepth !== 'full') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      sinceArg.push(`--since=${sixMonthsAgo.toISOString().split('T')[0]}`);
    }

    let parsedCommits: Array<{
      hash: string;
      author: string;
      email: string;
      date: string;
      message: string;
    }> = [];

    try {
      const rawLog = await git.raw(['log', '--all', '--format=%H|%an|%ae|%aI|%s', ...sinceArg]);

      parsedCommits = rawLog
        .trim()
        .split('\n')
        .filter((line) => line.includes('|'))
        .map((line) => {
          const parts = line.split('|');
          return {
            hash: parts[0] ?? '',
            author: parts[1] ?? '',
            email: parts[2] ?? '',
            date: parts[3] ?? '',
            message: parts.slice(4).join('|'), // message may contain pipes
          };
        });
    } catch {
      // Empty repo with no commits
    }

    // Take most recent 100 commits for recentCommits array
    const recentCommits: GitCommit[] = parsedCommits.slice(0, 100).map((c) => ({
      hash: c.hash,
      author: c.author,
      date: c.date,
      message: c.message,
    }));

    // ── Most-changed files (churn) ────────────────────────────────────────

    const fileChangeCounts = new Map<string, number>();
    try {
      const nameOnlyLog = await git.raw(['log', '--all', '--name-only', '--format=', ...sinceArg]);

      for (const line of nameOnlyLog.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) {
          fileChangeCounts.set(trimmed, (fileChangeCounts.get(trimmed) ?? 0) + 1);
        }
      }
    } catch {
      // Empty repo or no commits
    }

    const mostChangedFiles = [...fileChangeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([path, changes]) => ({ path, changes }));

    // ── Activity by month ─────────────────────────────────────────────────

    const activityByMonth: Record<string, number> = {};
    for (const commit of parsedCommits) {
      const monthKey = commit.date.slice(0, 7); // YYYY-MM
      if (monthKey) {
        activityByMonth[monthKey] = (activityByMonth[monthKey] ?? 0) + 1;
      }
    }

    // ── Contributors ──────────────────────────────────────────────────────

    const contributorMap = new Map<string, { name: string; email: string; count: number }>();
    for (const commit of parsedCommits) {
      const key = `${commit.author}|${commit.email}`;
      const existing = contributorMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        contributorMap.set(key, {
          name: commit.author,
          email: commit.email,
          count: 1,
        });
      }
    }

    const contributors: Contributor[] = [...contributorMap.values()]
      .sort((a, b) => b.count - a.count)
      .map((c) => ({
        name: c.name,
        email: c.email,
        commitCount: c.count,
      }));

    // ── File ownership (top contributor per most-changed file) ────────────

    const fileOwnership: FileOwnership[] = [];
    // Limit to top 30 most-changed files to avoid N+1 performance issue
    for (const { path: filePath } of mostChangedFiles.slice(0, 30)) {
      try {
        const authorLog = await git.raw([
          'log',
          '--all',
          '--format=%an',
          '--follow',
          '--',
          filePath,
        ]);

        const authorCounts = new Map<string, number>();
        for (const line of authorLog.trim().split('\n')) {
          const trimmed = line.trim();
          if (trimmed) {
            authorCounts.set(trimmed, (authorCounts.get(trimmed) ?? 0) + 1);
          }
        }

        let topContributor = '';
        let maxCount = 0;
        for (const [author, count] of authorCounts) {
          if (count > maxCount) {
            topContributor = author;
            maxCount = count;
          }
        }

        if (topContributor) {
          fileOwnership.push({
            path: filePath,
            topContributor,
            commitCount: maxCount,
          });
        }
      } catch {
        // Individual file log failure is non-critical
      }
    }

    return {
      success: true,
      data: {
        isGitRepo: true,
        branchPattern,
        recentCommits,
        mostChangedFiles,
        activityByMonth,
        contributors,
        fileOwnership,
        warnings: [],
      },
      elapsed: performance.now() - start,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // Gracefully handle non-git repos even if checkIsRepo() itself throws
    if (msg.includes('not a git repository') || msg.includes('Not a git repository')) {
      logger.info('No git history available -- skipping git analysis');
      return {
        success: true,
        data: emptyGitResult('Not a git repository'),
        elapsed: performance.now() - start,
      };
    }

    return {
      success: false,
      error: msg,
      elapsed: performance.now() - start,
    };
  }
}
