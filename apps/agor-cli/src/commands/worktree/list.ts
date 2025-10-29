/**
 * `agor worktree list` - List worktrees
 *
 * Shows all worktrees, optionally filtered by repository.
 */

import { createClient, isDaemonRunning } from '@agor/core/api';
import { getDaemonUrl } from '@agor/core/config';
import { formatShortId } from '@agor/core/db';
import type { Repo, Worktree } from '@agor/core/types';
import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import Table from 'cli-table3';

export default class WorktreeList extends Command {
  static description = 'List git worktrees';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --repo-id 01933e4a',
  ];

  static flags = {
    'repo-id': Flags.string({
      description: 'Filter by repository ID',
    }),
  };

  /**
   * Format relative time
   */
  private formatRelativeTime(isoDate: string): string {
    const now = Date.now();
    const date = new Date(isoDate).getTime();
    const diff = now - date;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(WorktreeList);

    // Check if daemon is running
    const daemonUrl = await getDaemonUrl();
    const running = await isDaemonRunning(daemonUrl);

    if (!running) {
      this.error(
        `Daemon not running. Start it with: ${chalk.cyan('cd apps/agor-daemon && pnpm dev')}`
      );
    }

    try {
      const client = createClient(daemonUrl);
      const worktreesService = client.service('worktrees');
      const reposService = client.service('repos');

      // Fetch worktrees - optionally filtered by repo ID
      let allWorktrees: Worktree[] = [];

      if (flags['repo-id']) {
        // Filter by repo ID
        const worktreesResult = await worktreesService.find({
          query: { repo_id: flags['repo-id'], $limit: 1000 },
        });
        allWorktrees = (
          Array.isArray(worktreesResult) ? worktreesResult : worktreesResult.data
        ) as Worktree[];
      } else {
        // Show all worktrees
        const worktreesResult = await worktreesService.find({ query: { $limit: 1000 } });
        allWorktrees = (
          Array.isArray(worktreesResult) ? worktreesResult : worktreesResult.data
        ) as Worktree[];
      }

      if (allWorktrees.length === 0) {
        this.log(chalk.dim('No worktrees found.'));
        this.log('');
        this.log(`Create one with: ${chalk.cyan('agor worktree add <name> --repo-id <id>')}`);
        this.log('');
        client.io.close();
        process.exit(0);
        return;
      }

      this.log('');

      // Fetch repo details for each worktree's repo_id
      const repoCache = new Map<string, Repo>();
      for (const wt of allWorktrees) {
        if (!repoCache.has(wt.repo_id)) {
          try {
            const repo = (await reposService.get(wt.repo_id)) as Repo;
            repoCache.set(wt.repo_id, repo);
          } catch {
            // Repo might have been deleted, use ID as fallback
          }
        }
      }

      // Query all sessions and count by worktree_id
      const sessionsService = client.service('sessions');
      const sessionCounts = new Map<string, number>();

      try {
        // Fetch all sessions (use high limit to get all)
        const sessionsResult = await sessionsService.find({
          query: { $limit: 10000 },
        });
        const allSessions = Array.isArray(sessionsResult) ? sessionsResult : sessionsResult.data;

        // Count sessions per worktree
        for (const session of allSessions) {
          const count = sessionCounts.get(session.worktree_id) || 0;
          sessionCounts.set(session.worktree_id, count + 1);
        }
      } catch {
        // If sessions fetch fails, all counts remain 0
      }

      // Display simple flat table
      const table = new Table({
        head: [
          chalk.cyan('ID'),
          chalk.cyan('Repo'),
          chalk.cyan('Name'),
          chalk.cyan('Branch'),
          chalk.cyan('Sessions'),
          chalk.cyan('Last Used'),
        ],
        style: {
          head: [],
          border: ['dim'],
        },
        colWidths: [10, 18, 18, 22, 10, 15],
      });

      for (const worktree of allWorktrees) {
        const repo = repoCache.get(worktree.repo_id);
        const sessionCount = sessionCounts.get(worktree.worktree_id) || 0;
        table.push([
          chalk.dim(formatShortId(worktree.worktree_id)),
          repo ? repo.slug : chalk.dim(formatShortId(worktree.repo_id)),
          worktree.name,
          worktree.ref,
          sessionCount.toString(),
          chalk.dim(this.formatRelativeTime(worktree.last_used || worktree.created_at)),
        ]);
      }

      this.log(table.toString());
      this.log('');

      this.log(chalk.dim(`Showing ${allWorktrees.length} worktree(s)`));
      this.log('');

      // Close socket
      client.io.close();
      process.exit(0);
    } catch (error) {
      this.error(
        `Failed to list worktrees: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
