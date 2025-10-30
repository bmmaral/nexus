import { Command } from 'commander';
import chalk from 'chalk';
import { NexusConfig } from '../lib/config';

export const configCommand = new Command('config')
  .description('Manage configuration')
  .argument('<action>', 'Action (get, set, list)')
  .argument('[key]', 'Configuration key')
  .argument('[value]', 'Configuration value')
  .action(async (action, key, value) => {
    const config = new NexusConfig();
    await config.load();
    
    switch (action) {
      case 'get':
        if (!key) {
          console.error(chalk.red('Key is required for get action'));
          process.exit(1);
        }
        const val = config.get(key);
        console.log(`${key}: ${JSON.stringify(val, null, 2)}`);
        break;
        
      case 'set':
        if (!key || value === undefined) {
          console.error(chalk.red('Key and value are required for set action'));
          process.exit(1);
        }
        config.set(key, value);
        await config.save();
        console.log(chalk.green(`✓ ${key} set to ${value}`));
        break;
        
      case 'list':
        const all = config.list();
        console.log(chalk.bold('\n⚙️  Configuration:\n'));
        console.log(JSON.stringify(all, null, 2));
        break;
        
      default:
        console.error(chalk.red(`Unknown action: ${action}`));
        console.log(chalk.gray('Available actions: get, set, list'));
        process.exit(1);
    }
  });


