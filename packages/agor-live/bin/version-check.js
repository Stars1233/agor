/**
 * Node.js version check utility
 * Used by CLI and daemon entry points to ensure Node 20+ requirement
 */

import chalk from 'chalk';

export function checkNodeVersion() {
  const nodeVersion = process.versions.node;
  const majorVersion = parseInt(nodeVersion.split('.')[0], 10);

  if (majorVersion < 20) {
    console.error(chalk.red('✖ Error: Agor requires Node.js v20.0.0 or higher'));
    console.error(chalk.yellow(`  Current version: v${nodeVersion}\n`));
    console.error('Please upgrade Node.js:');
    console.error(`  • Using nvm: ${chalk.cyan('nvm install 20 && nvm use 20')}`);
    console.error(`  • Download: ${chalk.cyan('https://nodejs.org/')}\n`);
    process.exit(1);
  }
}
