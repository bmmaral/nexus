#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { importCommand } from './commands/import';
import { analyzeCommand } from './commands/analyze';
import { statusCommand } from './commands/status';
import { scoutCommand } from './commands/scout';
import { timelineCommand } from './commands/timeline';
import { configCommand } from './commands/config';
import { remindCommand } from './commands/remind';
const packageJson = require('../package.json');
const version = packageJson.version;

const program = new Command();

// ASCII Art Logo
const logo = `
${chalk.cyan('╔═══════════════════════════════════╗')}
${chalk.cyan('║')}     ${chalk.bold.blue('PROJECT NEXUS')}              ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.gray('AI-Powered Project Memory')}    ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════╝')}
`;

program
  .name('nexus')
  .description('AI-Powered Project Memory & Repository Sync System')
  .version(version)
  .addHelpText('before', logo);

// Register commands
program.addCommand(initCommand);
program.addCommand(importCommand);
program.addCommand(analyzeCommand);
program.addCommand(statusCommand);
program.addCommand(scoutCommand);
program.addCommand(timelineCommand);
program.addCommand(configCommand);
program.addCommand(remindCommand);

// Global error handling
program.exitOverride();

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error: any) {
    if (error.code === 'commander.missingArgument') {
      console.error(chalk.red('Error: Missing required argument'));
    } else if (error.code === 'commander.unknownCommand') {
      console.error(chalk.red('Error: Unknown command'));
    } else {
      console.error(chalk.red('Error:'), error.message);
    }
    process.exit(1);
  }
}

// Run the CLI
main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
