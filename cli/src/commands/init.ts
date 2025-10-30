import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import { GitManager } from '../lib/git-manager';
import { createGitHooks } from '../lib/git-hooks';
import { createGitHubWorkflows } from '../lib/github-workflows';
import { NexusConfig } from '../lib/config';

export const initCommand = new Command('init')
  .description('Initialize Nexus in current repository')
  .option('-f, --force', 'Force initialization even if already initialized')
  .option('--no-hooks', 'Skip git hooks installation')
  .option('--no-workflows', 'Skip GitHub workflows creation')
  .action(async (options) => {
    const spinner = ora('Initializing Project Nexus...').start();
    
    try {
      const cwd = process.cwd();
      const git = new GitManager(cwd);
      
      // Check if git repository
      if (!await git.isGitRepo()) {
        spinner.fail('Not a git repository');
        console.error(chalk.red('Please run this command in a git repository'));
        process.exit(1);
      }
      
      // Check if already initialized
      const nexusPath = path.join(cwd, '.nexus');
      if (fs.existsSync(nexusPath) && !options.force) {
        spinner.fail('Project already initialized');
        console.log(chalk.yellow('Use --force to reinitialize'));
        process.exit(1);
      }
      
      // Create folder structure
      spinner.text = 'Creating folder structure...';
      const folders = [
        '.nexus',
        'conversations',
        'modules',
        'reports',
        '.github/workflows'
      ];
      
      for (const folder of folders) {
        await fs.ensureDir(path.join(cwd, folder));
      }
      
      // Create configuration
      spinner.text = 'Creating configuration...';
      const config = new NexusConfig(cwd);
      await config.initialize();
      
      // Create initial PRD if not exists
      const prdPath = path.join(cwd, 'PRD.md');
      if (!fs.existsSync(prdPath)) {
        spinner.text = 'Creating initial PRD template...';
        await createInitialPRD(prdPath);
      }
      
      // Setup git hooks
      if (options.hooks !== false) {
        spinner.text = 'Setting up git hooks...';
        await createGitHooks(cwd);
      }
      
      // Create GitHub workflows
      if (options.workflows !== false) {
        spinner.text = 'Creating GitHub workflows...';
        await createGitHubWorkflows(cwd);
      }
      
      // Create .gitignore entries
      spinner.text = 'Updating .gitignore...';
      await updateGitignore(cwd);
      
      spinner.succeed('Project Nexus initialized successfully!');
      
      // Show success message and next steps
      console.log('\n' + chalk.green('✓') + ' Created folder structure');
      console.log(chalk.green('✓') + ' Initialized configuration');
      console.log(chalk.green('✓') + ' Set up git hooks');
      console.log(chalk.green('✓') + ' Created GitHub workflows');
      console.log(chalk.green('✓') + ' Ready to track your project!');
      
      console.log('\n' + chalk.blue('Next steps:'));
      console.log('  1. Import a conversation: ' + chalk.cyan('nexus import conversation'));
      console.log('  2. Analyze your code: ' + chalk.cyan('nexus analyze'));
      console.log('  3. Check status: ' + chalk.cyan('nexus status'));
      console.log('  4. View timeline: ' + chalk.cyan('nexus timeline'));
      
      // Offer to run initial analysis
      const { runAnalysis } = await inquirer.prompt([{
        type: 'confirm',
        name: 'runAnalysis',
        message: 'Would you like to run an initial analysis now?',
        default: true
      }]);
      
      if (runAnalysis) {
        console.log('\n' + chalk.blue('Running initial analysis...'));
        const { analyzeCommand } = await import('./analyze');
        await analyzeCommand.parseAsync(['analyze'], { from: 'user' });
      }
      
    } catch (error: any) {
      spinner.fail('Initialization failed');
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

async function createInitialPRD(prdPath: string): Promise<void> {
  const template = `# Project Requirements Document

## Project Overview
**Name:** [Project Name]
**Description:** [Brief description of the project]
**Version:** 1.0.0
**Last Updated:** ${new Date().toISOString().split('T')[0]}

## Problem Statement
[Describe the problem this project solves]

## Goals
- [ ] Goal 1
- [ ] Goal 2
- [ ] Goal 3

## Features
### Core Features
- Feature 1: [Description]
- Feature 2: [Description]
- Feature 3: [Description]

### Nice to Have
- Feature 4: [Description]
- Feature 5: [Description]

## Technical Architecture
### Technology Stack
- **Backend:** [Node.js/Python/etc.]
- **Frontend:** [React/Vue/etc.]
- **Database:** [PostgreSQL/MongoDB/etc.]
- **Infrastructure:** [AWS/GCP/etc.]

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/example | GET | Example endpoint |

### Data Models
\`\`\`json
{
  "User": {
    "id": "string",
    "name": "string",
    "email": "string"
  }
}
\`\`\`

## Development Plan
### Phase 1: Foundation (Week 1-2)
- [ ] Setup project structure
- [ ] Initialize database
- [ ] Create basic API

### Phase 2: Core Features (Week 3-4)
- [ ] Implement feature 1
- [ ] Implement feature 2
- [ ] Add authentication

### Phase 3: Polish (Week 5-6)
- [ ] Testing
- [ ] Documentation
- [ ] Deployment

## Next Steps
1. [Immediate next action]
2. [Following action]
3. [Future consideration]

## Notes
- [Any additional notes or considerations]

---
*This PRD is tracked by Project Nexus*
`;
  
  await fs.writeFile(prdPath, template);
}

async function updateGitignore(cwd: string): Promise<void> {
  const gitignorePath = path.join(cwd, '.gitignore');
  const entries = [
    '\n# Project Nexus',
    '.nexus/cache/',
    '.nexus/temp/',
    'reports/*.temp.*',
    'conversations/*.backup',
    '*.nexus.log'
  ];
  
  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = await fs.readFile(gitignorePath, 'utf-8');
  }
  
  // Check if already has Nexus entries
  if (!content.includes('# Project Nexus')) {
    content += entries.join('\n');
    await fs.writeFile(gitignorePath, content);
  }
}


