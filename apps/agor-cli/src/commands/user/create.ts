/**
 * `agor user create` - Create a new user
 */

import { createClient } from '@agor/core/api';
import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import inquirer from 'inquirer';

export default class UserCreate extends Command {
  static description = 'Create a new user account';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --email admin@localhost --name Admin',
    '<%= config.bin %> <%= command.id %> --email max@example.com --role admin',
  ];

  static flags = {
    email: Flags.string({
      description: 'User email address',
      required: false,
    }),
    name: Flags.string({
      description: 'User display name',
      required: false,
    }),
    password: Flags.string({
      description: 'User password (will prompt if not provided)',
      required: false,
    }),
    role: Flags.string({
      description: 'User role',
      options: ['owner', 'admin', 'member', 'viewer'],
      default: 'admin',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(UserCreate);

    try {
      // Prompt for missing fields
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'email',
          message: 'Email address:',
          when: !flags.email,
          validate: (input: string) => {
            if (!input) return 'Email is required';
            if (!input.includes('@')) return 'Please enter a valid email';
            return true;
          },
        },
        {
          type: 'input',
          name: 'name',
          message: 'Name (optional):',
          when: !flags.name,
        },
        {
          type: 'password',
          name: 'password',
          message: 'Password:',
          when: !flags.password,
          validate: (input: string) => {
            if (!input) return 'Password is required';
            if (input.length < 8) return 'Password must be at least 8 characters';
            return true;
          },
          mask: '*',
        },
        {
          type: 'password',
          name: 'confirmPassword',
          message: 'Confirm password:',
          when: !flags.password,
          validate: (input: string, answers: { password?: string }) => {
            if (input !== (answers.password || flags.password)) {
              return 'Passwords do not match';
            }
            return true;
          },
          mask: '*',
        },
      ]);

      const email = flags.email || answers.email;
      const name = flags.name || answers.name;
      const password = flags.password || answers.password;

      // Create FeathersJS client
      const client = createClient();

      // Create user
      this.log('');
      this.log(chalk.gray('Creating user...'));
      // biome-ignore lint/suspicious/noExplicitAny: FeathersJS service typing issue
      const user = await (client.service('users') as any).create({
        email,
        password,
        name: name || undefined,
        role: flags.role as 'owner' | 'admin' | 'member' | 'viewer',
      });

      this.log(`${chalk.green('✓')} User created successfully`);
      this.log('');
      this.log(`  Email: ${chalk.cyan(user.email)}`);
      this.log(`  Name:  ${chalk.cyan(user.name || '(not set)')}`);
      this.log(`  Role:  ${chalk.cyan(user.role)}`);
      this.log(`  ID:    ${chalk.gray(user.user_id.substring(0, 8))}`);
      this.log('');
      this.log(chalk.gray('Next steps:'));
      this.log(chalk.gray('  1. Start daemon: pnpm --filter @agor/daemon dev'));
      this.log(chalk.gray('  2. Login via UI: http://localhost:5173'));

      // Clean up socket
      await new Promise<void>(resolve => {
        client.io.once('disconnect', () => resolve());
        client.io.close();
        setTimeout(() => resolve(), 1000);
      });
      process.exit(0);
    } catch (error) {
      this.log('');
      this.log(chalk.red('✗ Failed to create user'));
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          this.log(chalk.red('  User with this email already exists'));
        } else {
          this.log(chalk.red(`  ${error.message}`));
        }
      }
      process.exit(1);
    }
  }
}
