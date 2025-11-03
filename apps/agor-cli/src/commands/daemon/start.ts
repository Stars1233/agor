/**
 * `agor daemon start` - Start daemon in background
 */

import { isDaemonRunning } from '@agor/core/api';
import { getDaemonUrl } from '@agor/core/config';
import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { getDaemonPath, isInstalledPackage } from '../../lib/context.js';
import { startDaemon } from '../../lib/daemon-manager.js';

export default class DaemonStart extends Command {
  static description = 'Start daemon in background';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --foreground',
  ];

  static flags = {
    foreground: Flags.boolean({
      char: 'f',
      description: 'Run daemon in foreground (synchronous)',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DaemonStart);

    // Check if running in production mode
    if (!isInstalledPackage()) {
      this.log(chalk.red('✗ Daemon lifecycle commands only work in production mode.'));
      this.log('');
      this.log(chalk.bold('In development, start the daemon with:'));
      this.log(`  ${chalk.cyan('cd apps/agor-daemon && pnpm dev')}`);
      this.log('');
      this.exit(1);
    }

    // Get daemon binary path
    const daemonPath = getDaemonPath();
    if (!daemonPath) {
      this.log(chalk.red('✗ Daemon binary not found'));
      this.log('');
      this.log('Your installation may be corrupted. Try reinstalling:');
      this.log(`  ${chalk.cyan('npm install -g agor-live')}`);
      this.log('');
      this.exit(1);
    }

    // Check if daemon binary actually exists
    const fs = await import('node:fs');
    if (!fs.existsSync(daemonPath)) {
      this.log(chalk.red('✗ Daemon binary not found'));
      this.log('');
      this.log(`Expected location: ${chalk.dim(daemonPath)}`);
      this.log('');
      this.log('Your installation may be corrupted. Try reinstalling:');
      this.log(`  ${chalk.cyan('npm install -g agor-live')}`);
      this.log('');
      this.exit(1);
    }

    // Check if already running
    const daemonUrl = await getDaemonUrl();
    const running = await isDaemonRunning(daemonUrl);

    if (running) {
      this.log(chalk.yellow('⚠ Daemon is already running'));
      this.log('');
      this.log('Check status with:');
      this.log(`  ${chalk.cyan('agor daemon status')}`);
      this.log('');
      this.exit(0);
    }

    try {
      if (flags.foreground) {
        // Foreground mode: run daemon inline (blocking)
        this.log(chalk.green('Starting daemon in foreground mode...'));
        this.log(chalk.dim(`URL: ${daemonUrl}`));
        this.log(chalk.dim('Press Ctrl+C to stop'));
        this.log('');

        const { spawn } = await import('node:child_process');

        // Start daemon as foreground process (inherits stdio)
        const child = spawn('node', [daemonPath], {
          stdio: 'inherit',
          env: {
            ...process.env,
            NODE_ENV: 'production',
          },
        });

        // Wait for child to exit
        await new Promise<void>((resolve, reject) => {
          child.on('exit', code => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Daemon exited with code ${code}`));
            }
          });

          child.on('error', reject);
        });
      } else {
        // Background mode: start detached daemon
        const pid = startDaemon(daemonPath);

        this.log(chalk.green('✓ Daemon started successfully'));
        this.log('');
        this.log(`  PID: ${chalk.cyan(String(pid))}`);
        this.log(`  URL: ${chalk.cyan(daemonUrl)}`);
        this.log('');
        this.log('View logs with:');
        this.log(`  ${chalk.cyan('agor daemon logs')}`);
        this.log('');

        // Wait for daemon to fully boot (including migrations if fresh install)
        // Try multiple times with exponential backoff
        let isRunning = false;
        const maxAttempts = 5;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const waitTime = 1000 * (attempt + 1); // 1s, 2s, 3s, 4s, 5s
          await new Promise(resolve => setTimeout(resolve, waitTime));

          isRunning = await isDaemonRunning(daemonUrl);
          if (isRunning) break;
        }

        if (!isRunning) {
          this.log(chalk.yellow('⚠ Daemon started but not responding'));
          this.log('');
          this.log('This may be normal if migrations are running on first startup.');
          this.log('Check logs for errors:');
          this.log(`  ${chalk.cyan('agor daemon logs')}`);
          this.log('');
        }
      }
    } catch (error) {
      this.log(chalk.red('✗ Failed to start daemon'));
      this.log('');
      this.log(`Error: ${(error as Error).message}`);
      this.log('');
      this.exit(1);
    }
  }
}
