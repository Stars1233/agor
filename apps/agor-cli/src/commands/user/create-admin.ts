/**
 * `agor user create-admin` - Create default admin user (admin/admin)
 */

import { createClient } from '@agor/core/api';
import { Command } from '@oclif/core';
import chalk from 'chalk';

export default class UserCreateAdmin extends Command {
  static description = 'Create default admin user (admin@agor.live / admin)';

  static examples = ['<%= config.bin %> <%= command.id %>'];

  async run(): Promise<void> {
    try {
      // Create FeathersJS client
      const client = createClient();

      // Check if admin user already exists
      // biome-ignore lint/suspicious/noExplicitAny: FeathersJS service typing issue
      const usersService = client.service('users') as any;
      const result = await usersService.find();
      const users = (Array.isArray(result) ? result : result.data) as User[];

      const existingAdmin = users.find(u => u.email === 'admin@agor.live');

      if (existingAdmin) {
        this.log(chalk.yellow('⚠ Admin user already exists'));
        this.log('');
        this.log(`  Email: ${chalk.cyan('admin@agor.live')}`);
        this.log(`  Name:  ${chalk.cyan(existingAdmin.name || '(not set)')}`);
        this.log(`  Role:  ${chalk.cyan(existingAdmin.role)}`);
        this.log(`  ID:    ${chalk.gray(existingAdmin.user_id.substring(0, 8))}`);
        this.log('');
        this.log(
          chalk.gray(
            'To reset password, use: agor user update admin@agor.live --password newpassword'
          )
        );

        // Clean up socket
        await new Promise<void>(resolve => {
          client.io.once('disconnect', () => resolve());
          client.io.close();
          setTimeout(() => resolve(), 1000);
        });
        process.exit(0);
      }

      // Create default admin user
      this.log(chalk.gray('Creating admin user...'));
      const user = await usersService.create({
        email: 'admin@agor.live',
        password: 'admin',
        name: 'Admin',
        role: 'admin',
      });

      this.log(`${chalk.green('✓')} Admin user created successfully`);
      this.log('');
      this.log(`  Email:    ${chalk.cyan('admin@agor.live')}`);
      this.log(`  Password: ${chalk.cyan('admin')}`);
      this.log(`  Name:     ${chalk.cyan(user.name)}`);
      this.log(`  Role:     ${chalk.cyan(user.role)}`);
      this.log(`  ID:       ${chalk.gray(user.user_id.substring(0, 8))}`);
      this.log('');
      this.log(chalk.yellow('⚠ SECURITY WARNING'));
      this.log(chalk.gray('  Change the password immediately using:'));
      this.log(chalk.gray('  agor user update admin@agor.live --password <new-password>'));

      // Clean up socket
      await new Promise<void>(resolve => {
        client.io.once('disconnect', () => resolve());
        client.io.close();
        setTimeout(() => resolve(), 1000);
      });
      process.exit(0);
    } catch (error) {
      this.log('');
      this.log(chalk.red('✗ Failed to create admin user'));
      if (error instanceof Error) {
        this.log(chalk.red(`  ${error.message}`));
      }
      process.exit(1);
    }
  }
}
