/**
 * `agor user delete` - Delete a user
 */

import { createClient } from '@agor/core/api';
import { Args, Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import inquirer from 'inquirer';

export default class UserDelete extends Command {
  static description = 'Delete a user account';

  static examples = [
    '<%= config.bin %> <%= command.id %> test@example.com',
    '<%= config.bin %> <%= command.id %> 0199d1bd',
    '<%= config.bin %> <%= command.id %> test@example.com --force',
  ];

  static args = {
    user: Args.string({
      description: 'User email or ID',
      required: true,
    }),
  };

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Skip confirmation prompt',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(UserDelete);

    try {
      // Create FeathersJS client
      const client = createClient();

      // Find user by email or ID
      // biome-ignore lint/suspicious/noExplicitAny: FeathersJS service typing issue
      const usersService = client.service('users') as any;
      const result = await usersService.find();
      const users = (Array.isArray(result) ? result : result.data) as User[];

      const user = users.find(
        u => u.email === args.user || u.user_id === args.user || u.user_id.startsWith(args.user)
      );

      if (!user) {
        this.log(chalk.red('✗ User not found'));
        this.log(chalk.gray(`  No user matching: ${args.user}`));
        process.exit(1);
      }

      // Confirm deletion (unless --force)
      if (!flags.force) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Delete user ${chalk.cyan(user.email)} (${chalk.gray(user.user_id.substring(0, 8))})`,
            default: false,
          },
        ]);

        if (!confirm) {
          this.log(chalk.gray('Cancelled'));
          process.exit(0);
        }
      }

      // Delete user
      await usersService.remove(user.user_id);

      this.log(`${chalk.green('✓')} User deleted successfully`);
      this.log('');
      this.log(`  Email: ${chalk.cyan(user.email)}`);
      this.log(`  ID:    ${chalk.gray(user.user_id.substring(0, 8))}`);

      // Clean up socket
      await new Promise<void>(resolve => {
        client.io.once('disconnect', () => resolve());
        client.io.close();
        setTimeout(() => resolve(), 1000);
      });
      process.exit(0);
    } catch (error) {
      this.log(chalk.red('✗ Failed to delete user'));
      if (error instanceof Error) {
        this.log(chalk.red(`  ${error.message}`));
      }
      process.exit(1);
    }
  }
}
