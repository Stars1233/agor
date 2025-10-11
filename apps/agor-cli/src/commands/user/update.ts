/**
 * `agor user update` - Update a user
 */

import { createClient } from '@agor/core/api';
import { Args, Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import inquirer from 'inquirer';

export default class UserUpdate extends Command {
  static description = 'Update a user account';

  static examples = [
    '<%= config.bin %> <%= command.id %> test@example.com --name "New Name"',
    '<%= config.bin %> <%= command.id %> 0199d1bd --role member',
    '<%= config.bin %> <%= command.id %> test@example.com --password newpassword123',
  ];

  static args = {
    user: Args.string({
      description: 'User email or ID',
      required: true,
    }),
  };

  static flags = {
    email: Flags.string({
      description: 'New email address',
    }),
    name: Flags.string({
      description: 'New name',
    }),
    password: Flags.string({
      description: 'New password (will prompt if not provided)',
    }),
    role: Flags.string({
      description: 'New role',
      options: ['owner', 'admin', 'member', 'viewer'],
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(UserUpdate);

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

      // If no flags provided, prompt for what to update
      if (!flags.email && !flags.name && !flags.password && !flags.role) {
        const { fields } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'fields',
            message: 'What would you like to update?',
            choices: [
              { name: 'Email', value: 'email' },
              { name: 'Name', value: 'name' },
              { name: 'Password', value: 'password' },
              { name: 'Role', value: 'role' },
            ],
          },
        ]);

        if (fields.length === 0) {
          this.log(chalk.gray('No changes selected'));
          process.exit(0);
        }

        // Prompt for each selected field
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'email',
            message: 'New email:',
            when: fields.includes('email'),
            default: user.email,
            validate: (input: string) => {
              if (!input) return 'Email is required';
              if (!input.includes('@')) return 'Please enter a valid email';
              return true;
            },
          },
          {
            type: 'input',
            name: 'name',
            message: 'New name:',
            when: fields.includes('name'),
            default: user.name,
          },
          {
            type: 'password',
            name: 'password',
            message: 'New password:',
            when: fields.includes('password'),
            validate: (input: string) => {
              if (!input) return 'Password is required';
              if (input.length < 8) return 'Password must be at least 8 characters';
              return true;
            },
            mask: '*',
          },
          {
            type: 'list',
            name: 'role',
            message: 'New role:',
            when: fields.includes('role'),
            choices: ['owner', 'admin', 'member', 'viewer'],
            default: user.role,
          },
        ]);

        // Apply answers to flags
        if (answers.email) flags.email = answers.email;
        if (answers.name) flags.name = answers.name;
        if (answers.password) flags.password = answers.password;
        if (answers.role) flags.role = answers.role;
      }

      // Build update object
      const updates: Partial<User> & { password?: string } = {};
      if (flags.email) updates.email = flags.email;
      if (flags.name) updates.name = flags.name;
      if (flags.password) updates.password = flags.password;
      if (flags.role) updates.role = flags.role as 'owner' | 'admin' | 'member' | 'viewer';

      if (Object.keys(updates).length === 0) {
        this.log(chalk.gray('No changes to apply'));
        process.exit(0);
      }

      // Update user
      this.log('');
      this.log(chalk.gray('Updating user...'));
      const updatedUser = await usersService.patch(user.user_id, updates);

      this.log(`${chalk.green('✓')} User updated successfully`);
      this.log('');
      this.log(`  Email: ${chalk.cyan(updatedUser.email)}`);
      this.log(`  Name:  ${chalk.cyan(updatedUser.name || '(not set)')}`);
      this.log(`  Role:  ${chalk.cyan(updatedUser.role)}`);
      this.log(`  ID:    ${chalk.gray(updatedUser.user_id.substring(0, 8))}`);

      // Clean up socket
      await new Promise<void>(resolve => {
        client.io.once('disconnect', () => resolve());
        client.io.close();
        setTimeout(() => resolve(), 1000);
      });
      process.exit(0);
    } catch (error) {
      this.log('');
      this.log(chalk.red('✗ Failed to update user'));
      if (error instanceof Error) {
        this.log(chalk.red(`  ${error.message}`));
      }
      process.exit(1);
    }
  }
}
