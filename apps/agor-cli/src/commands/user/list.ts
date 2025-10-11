/**
 * `agor user list` - List all users
 */

import { createClient } from '@agor/core/api';
import { Command } from '@oclif/core';
import chalk from 'chalk';
import Table from 'cli-table3';

export default class UserList extends Command {
  static description = 'List all users';

  static examples = ['<%= config.bin %> <%= command.id %>'];

  async run(): Promise<void> {
    try {
      // Create FeathersJS client
      const client = createClient();

      // Fetch users
      // biome-ignore lint/suspicious/noExplicitAny: FeathersJS service typing issue
      const result = await (client.service('users') as any).find();
      const users = Array.isArray(result) ? result : result.data;

      if (users.length === 0) {
        this.log(chalk.yellow('No users found'));
        this.log('');
        this.log(chalk.gray('Create a user with: agor user create'));
        process.exit(0);
      }

      // Create table
      const table = new Table({
        head: [
          chalk.cyan('ID'),
          chalk.cyan('Email'),
          chalk.cyan('Name'),
          chalk.cyan('Role'),
          chalk.cyan('Created'),
        ],
        style: {
          head: [],
          border: [],
        },
      });

      // Add rows
      for (const user of users) {
        const shortId = user.user_id.substring(0, 8);
        const roleColor =
          user.role === 'owner'
            ? chalk.red
            : user.role === 'admin'
              ? chalk.yellow
              : user.role === 'member'
                ? chalk.green
                : chalk.gray;

        table.push([
          chalk.gray(shortId),
          user.email,
          user.name || chalk.gray('(not set)'),
          roleColor(user.role),
          new Date(user.created_at).toLocaleDateString(),
        ]);
      }

      this.log('');
      this.log(table.toString());
      this.log('');
      this.log(chalk.gray(`Total: ${users.length} user${users.length === 1 ? '' : 's'}`));

      // Clean up socket
      await new Promise<void>(resolve => {
        client.io.once('disconnect', () => resolve());
        client.io.close();
        setTimeout(() => resolve(), 1000);
      });
      process.exit(0);
    } catch (error) {
      this.log(chalk.red('✗ Failed to list users'));
      if (error instanceof Error) {
        this.log(chalk.red(`  ${error.message}`));
      }
      process.exit(1);
    }
  }
}
