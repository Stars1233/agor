/**
 * Git Utils for Agor
 *
 * Provides Git operations for repo management and worktree isolation
 */

import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { simpleGit } from 'simple-git';

/**
 * Get git binary path
 *
 * Searches common locations for git executable.
 * Needed because daemon may not have git in PATH.
 */
function getGitBinary(): string | undefined {
  const { existsSync } = require('node:fs');
  const commonPaths = [
    '/opt/homebrew/bin/git', // Homebrew on Apple Silicon
    '/usr/local/bin/git', // Homebrew on Intel
    '/usr/bin/git', // System git (Docker and Linux)
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Fall back to 'git' in PATH
  return undefined;
}

/**
 * Create a configured simple-git instance
 *
 * Automatically detects git binary path for consistent behavior
 * across different environments (native, Docker, etc.)
 */
function createGit(baseDir?: string) {
  const gitBinary = getGitBinary();
  return simpleGit({
    baseDir,
    binary: gitBinary,
  });
}

export interface CloneOptions {
  url: string;
  targetDir?: string;
  bare?: boolean;
  onProgress?: (progress: CloneProgress) => void;
}

export interface CloneProgress {
  method: string;
  stage: string;
  progress: number;
  processed?: number;
  total?: number;
}

export interface CloneResult {
  path: string;
  repoName: string;
  defaultBranch: string;
}

/**
 * Get default Agor repos directory (~/.agor/repos)
 */
export function getReposDir(): string {
  return join(homedir(), '.agor', 'repos');
}

/**
 * Extract repo name from Git URL
 *
 * Examples:
 * - git@github.com:apache/superset.git -> superset
 * - https://github.com/facebook/react.git -> react
 */
export function extractRepoName(url: string): string {
  const match = url.match(/\/([^/]+?)(?:\.git)?$/);
  if (!match) {
    throw new Error(`Could not extract repo name from URL: ${url}`);
  }
  return match[1];
}

/**
 * Clone a Git repository to ~/.agor/repos/<name>
 *
 * @param options - Clone options
 * @returns Clone result with path and metadata
 */
export async function cloneRepo(options: CloneOptions): Promise<CloneResult> {
  const repoName = extractRepoName(options.url);
  const reposDir = getReposDir();
  const targetPath = options.targetDir || join(reposDir, repoName);

  // Ensure repos directory exists
  await mkdir(reposDir, { recursive: true });

  // Check if target directory already exists
  const { existsSync } = await import('node:fs');
  if (existsSync(targetPath)) {
    throw new Error(`Repository directory already exists: ${targetPath}`);
  }

  // Configure git with progress tracking
  const git = createGit();
  if (options.onProgress) {
    git.outputHandler((_command, stdout, stderr) => {
      // Note: Progress tracking through outputHandler is limited
      // This is a simplified version - simple-git's progress callback
      // in constructor works better, but we need the binary path too
    });
  }

  // Clone the repo
  await git.clone(options.url, targetPath, options.bare ? ['--bare'] : []);

  // Get default branch
  const repoGit = createGit(targetPath);
  const branches = await repoGit.branch();
  const defaultBranch = branches.current || 'main';

  return {
    path: targetPath,
    repoName,
    defaultBranch,
  };
}

/**
 * Check if a directory is a Git repository
 */
export async function isGitRepo(path: string): Promise<boolean> {
  try {
    const git = createGit(path);
    await git.status();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(repoPath: string): Promise<string> {
  const git = createGit(repoPath);
  const status = await git.status();
  return status.current || '';
}

/**
 * Get current commit SHA
 */
export async function getCurrentSha(repoPath: string): Promise<string> {
  const git = createGit(repoPath);
  const log = await git.log({ maxCount: 1 });
  return log.latest?.hash || '';
}

/**
 * Check if working directory is clean (no uncommitted changes)
 */
export async function isClean(repoPath: string): Promise<boolean> {
  const git = createGit(repoPath);
  const status = await git.status();
  return status.isClean();
}

/**
 * Get remote URL
 */
export async function getRemoteUrl(repoPath: string, remote: string = 'origin'): Promise<string> {
  const git = createGit(repoPath);
  const remotes = await git.getRemotes(true);
  const remoteObj = remotes.find(r => r.name === remote);
  return remoteObj?.refs.fetch || '';
}

/**
 * Get worktrees directory (~/.agor/worktrees)
 */
export function getWorktreesDir(): string {
  return join(homedir(), '.agor', 'worktrees');
}

/**
 * Get path for a specific worktree
 */
export function getWorktreePath(repoSlug: string, worktreeName: string): string {
  return join(getWorktreesDir(), repoSlug, worktreeName);
}

export interface WorktreeInfo {
  name: string;
  path: string;
  ref: string;
  sha: string;
  detached: boolean;
}

/**
 * Create a git worktree
 *
 * @param repoPath - Path to bare repository
 * @param worktreePath - Path where worktree should be created
 * @param ref - Branch/tag/commit to checkout
 * @param createBranch - Whether to create a new branch
 * @param pullLatest - Whether to fetch from remote before creating worktree
 * @param sourceBranch - Source branch to base new branch on (used with createBranch)
 */
export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  ref: string,
  createBranch: boolean = false,
  pullLatest: boolean = false,
  sourceBranch?: string
): Promise<void> {
  const git = createGit(repoPath);

  // Pull latest from remote if requested and ref is a branch name (not SHA)
  if (pullLatest && !ref.match(/^[0-9a-f]{7,40}$/)) {
    const refToPull = sourceBranch || ref;
    try {
      await git.fetch(['origin', refToPull]);
    } catch (error) {
      // Ignore fetch errors (branch might not exist on remote yet)
      console.warn(`Failed to fetch ${refToPull} from origin:`, error);
    }
  }

  const args = [worktreePath];

  if (createBranch) {
    args.push('-b', ref);
    // Use origin/sourceBranch as base if pullLatest is enabled
    if (pullLatest && sourceBranch) {
      args.push(`origin/${sourceBranch}`);
    } else if (sourceBranch) {
      args.push(sourceBranch);
    }
  } else {
    args.push(ref);
  }

  await git.raw(['worktree', 'add', ...args]);
}

/**
 * List all worktrees for a repository
 */
export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  const git = createGit(repoPath);
  const output = await git.raw(['worktree', 'list', '--porcelain']);

  const worktrees: WorktreeInfo[] = [];
  const lines = output.split('\n');

  let current: Partial<WorktreeInfo> = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      current.path = line.substring(9);
      current.name = basename(current.path);
    } else if (line.startsWith('HEAD ')) {
      current.sha = line.substring(5);
    } else if (line.startsWith('branch ')) {
      current.ref = line.substring(7).replace('refs/heads/', '');
      current.detached = false;
    } else if (line.startsWith('detached')) {
      current.detached = true;
    } else if (line === '') {
      if (current.path && current.sha) {
        worktrees.push(current as WorktreeInfo);
      }
      current = {};
    }
  }

  // Handle last entry
  if (current.path && current.sha) {
    worktrees.push(current as WorktreeInfo);
  }

  return worktrees;
}

/**
 * Remove a git worktree
 */
export async function removeWorktree(repoPath: string, worktreeName: string): Promise<void> {
  const git = createGit(repoPath);
  await git.raw(['worktree', 'remove', worktreeName]);
}

/**
 * Prune stale worktree metadata
 */
export async function pruneWorktrees(repoPath: string): Promise<void> {
  const git = createGit(repoPath);
  await git.raw(['worktree', 'prune']);
}

/**
 * Check if a remote branch exists
 */
export async function hasRemoteBranch(
  repoPath: string,
  branchName: string,
  remote: string = 'origin'
): Promise<boolean> {
  const git = createGit(repoPath);
  const branches = await git.branch(['-r']);
  return branches.all.includes(`${remote}/${branchName}`);
}

/**
 * Get list of remote branches
 */
export async function getRemoteBranches(
  repoPath: string,
  remote: string = 'origin'
): Promise<string[]> {
  const git = createGit(repoPath);
  const branches = await git.branch(['-r']);
  return branches.all.filter(b => b.startsWith(`${remote}/`)).map(b => b.replace(`${remote}/`, ''));
}

/**
 * Get git state for a repository (SHA + dirty status)
 *
 * Returns the current commit SHA with "-dirty" suffix if working directory has uncommitted changes.
 * If not in a git repo or SHA cannot be determined, returns "unknown".
 *
 * Examples:
 * - "abc123def456" (clean working directory)
 * - "abc123def456-dirty" (uncommitted changes)
 * - "unknown" (not a git repo or error)
 */
export async function getGitState(repoPath: string): Promise<string> {
  try {
    // Check if it's a git repo first
    if (!(await isGitRepo(repoPath))) {
      return 'unknown';
    }

    // Get current SHA
    const sha = await getCurrentSha(repoPath);
    if (!sha) {
      return 'unknown';
    }

    // Check if working directory is clean
    const clean = await isClean(repoPath);

    return clean ? sha : `${sha}-dirty`;
  } catch (error) {
    console.warn(`Failed to get git state for ${repoPath}:`, error);
    return 'unknown';
  }
}
