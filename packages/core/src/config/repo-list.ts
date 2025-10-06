/**
 * Repo List Utilities
 *
 * Generate flattened lists of repo references for UI selection
 */

import type { Repo, RepoSlug, WorktreeName } from '../types';

/**
 * Repo reference option for UI selection
 */
export interface RepoReferenceOption {
  /** Display label (e.g., "anthropics/agor:main" or "/Users/max/code/agor") */
  label: string;

  /** Reference value (same as label, used for config) */
  value: string;

  /** Reference type */
  type: 'path' | 'managed' | 'managed-worktree';

  /** Repository slug (for managed repos) */
  slug?: RepoSlug;

  /** Worktree name (for managed worktrees) */
  worktree?: WorktreeName;

  /** Display description */
  description?: string;
}

/**
 * Generate a list of all repo reference options
 *
 * Creates options for:
 * - Each managed repo (bare repo)
 * - Each worktree of each managed repo
 * - User paths can be added manually
 *
 * @param repos - List of Agor-managed repositories
 * @returns Flattened list of selectable repo references
 *
 * @example
 * const options = getRepoReferenceOptions(repos);
 * // [
 * //   { label: "anthropics/agor", value: "anthropics/agor", type: "managed", ... },
 * //   { label: "anthropics/agor:main", value: "anthropics/agor:main", type: "managed-worktree", ... },
 * //   { label: "anthropics/agor:feat-auth", value: "anthropics/agor:feat-auth", type: "managed-worktree", ... },
 * //   { label: "apache/superset", value: "apache/superset", type: "managed", ... },
 * //   { label: "apache/superset:main", value: "apache/superset:main", type: "managed-worktree", ... },
 * // ]
 */
export function getRepoReferenceOptions(repos: Repo[]): RepoReferenceOption[] {
  const options: RepoReferenceOption[] = [];

  for (const repo of repos) {
    // Add bare repo option
    options.push({
      label: repo.slug,
      value: repo.slug,
      type: 'managed',
      slug: repo.slug,
      description: `${repo.name} (bare repo)`,
    });

    // Add worktree options
    for (const worktree of repo.worktrees) {
      const ref = `${repo.slug}:${worktree.name}`;
      options.push({
        label: ref,
        value: ref,
        type: 'managed-worktree',
        slug: repo.slug,
        worktree: worktree.name,
        description: `${repo.name} @ ${worktree.ref}`,
      });
    }
  }

  return options;
}

/**
 * Group repo reference options by repository
 *
 * Useful for hierarchical dropdowns/menus
 *
 * @param repos - List of Agor-managed repositories
 * @returns Map of repo slug to options
 *
 * @example
 * const grouped = getGroupedRepoReferenceOptions(repos);
 * // {
 * //   "anthropics/agor": [
 * //     { label: "anthropics/agor", ... },
 * //     { label: "anthropics/agor:main", ... },
 * //     { label: "anthropics/agor:feat-auth", ... },
 * //   ],
 * //   "apache/superset": [...]
 * // }
 */
export function getGroupedRepoReferenceOptions(
  repos: Repo[]
): Record<RepoSlug, RepoReferenceOption[]> {
  const grouped: Record<RepoSlug, RepoReferenceOption[]> = {};

  for (const repo of repos) {
    const options: RepoReferenceOption[] = [];

    // Add bare repo option
    options.push({
      label: repo.slug,
      value: repo.slug,
      type: 'managed',
      slug: repo.slug,
      description: `${repo.name} (bare repo)`,
    });

    // Add worktree options
    for (const worktree of repo.worktrees) {
      const ref = `${repo.slug}:${worktree.name}`;
      options.push({
        label: ref,
        value: ref,
        type: 'managed-worktree',
        slug: repo.slug,
        worktree: worktree.name,
        description: `${repo.name} @ ${worktree.ref}`,
      });
    }

    grouped[repo.slug] = options;
  }

  return grouped;
}

/**
 * Get default repo reference (first worktree of first repo, or first repo)
 *
 * @param repos - List of Agor-managed repositories
 * @returns Default reference or undefined if no repos
 */
export function getDefaultRepoReference(repos: Repo[]): string | undefined {
  if (repos.length === 0) return undefined;

  const firstRepo = repos[0];

  // Prefer first worktree if available
  if (firstRepo.worktrees.length > 0) {
    const firstWorktree = firstRepo.worktrees[0];
    return `${firstRepo.slug}:${firstWorktree.name}`;
  }

  // Fallback to bare repo
  return firstRepo.slug;
}
