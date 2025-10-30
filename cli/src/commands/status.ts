import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { table } from 'table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { GitManager } from '../lib/git-manager';
import { NexusConfig } from '../lib/config';

dayjs.extend(relativeTime);

export const statusCommand = new Command('status')
  .description('Show project status')
  .option('-v, --verbose', 'Detailed output')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Checking project status...').start();
    
    try {
      const cwd = process.cwd();
      const git = new GitManager(cwd);
      const config = new NexusConfig(cwd);
      
      // Check if initialized
      if (!await fs.pathExists(path.join(cwd, '.nexus'))) {
        spinner.fail('Project not initialized');
        console.log(chalk.yellow('Run: nexus init'));
        process.exit(1);
      }
      
      await config.load();
      
      spinner.text = 'Gathering project information...';
      const status = await gatherProjectStatus(cwd, git, config);
      
      spinner.succeed('Status check complete');
      
      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        displayStatus(status, options.verbose);
      }
      
    } catch (error: any) {
      spinner.fail('Status check failed');
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

async function gatherProjectStatus(cwd: string, git: GitManager, config: NexusConfig): Promise<any> {
  const status: any = {
    projectName: await git.getRepoName(),
    branch: await git.getCurrentBranch(),
    initialized: dayjs(config.get('initialized')).format('YYYY-MM-DD'),
    lastCommit: null,
    prdStatus: 'unknown',
    syncStatus: 'unknown',
    activeIssues: 0,
    conversationCount: 0,
    moduleCount: 0,
    reuseCount: 0,
    warnings: [],
    inactiveDays: 0
  };
  
  // Get last commit
  const lastCommit = await git.getLastCommit();
  if (lastCommit) {
    status.lastCommit = {
      date: lastCommit.date,
      message: lastCommit.message,
      author: lastCommit.author,
      timeAgo: dayjs(lastCommit.date).fromNow()
    };
    
    // Calculate inactive days
    status.inactiveDays = await git.calculateInactiveDays();
    if (status.inactiveDays > 5) {
      status.warnings.push(`Project inactive for ${status.inactiveDays} days`);
    }
  }
  
  // Check PRD status
  const prdPath = path.join(cwd, 'PRD.md');
  if (await fs.pathExists(prdPath)) {
    const prdStat = await fs.stat(prdPath);
    const lastModified = await git.getLastModifiedDate('PRD.md');
    
    if (lastModified) {
      const daysSinceUpdate = dayjs().diff(dayjs(lastModified), 'day');
      if (daysSinceUpdate > 14) {
        status.prdStatus = 'stale';
        status.warnings.push(`PRD not updated for ${daysSinceUpdate} days`);
      } else {
        status.prdStatus = 'current';
      }
    } else {
      status.prdStatus = 'untracked';
    }
    
    status.prdLastModified = lastModified || prdStat.mtime;
  } else {
    status.prdStatus = 'missing';
    status.warnings.push('PRD.md not found');
  }
  
  // Check sync status
  const latestReport = path.join(cwd, 'reports', 'code-sync-report.md');
  if (await fs.pathExists(latestReport)) {
    const reportStat = await fs.stat(latestReport);
    const reportAge = dayjs().diff(dayjs(reportStat.mtime), 'day');
    
    if (reportAge > 3) {
      status.syncStatus = 'outdated';
      status.warnings.push('Analysis report is outdated');
    } else {
      // Read report to get sync percentage
      try {
        const reportContent = await fs.readFile(latestReport, 'utf-8');
        const syncMatch = reportContent.match(/Sync Status:.*?(\d+)%/);
        if (syncMatch) {
          const syncPercentage = parseInt(syncMatch[1]);
          if (syncPercentage >= 80) {
            status.syncStatus = 'good';
          } else if (syncPercentage >= 60) {
            status.syncStatus = 'warning';
          } else {
            status.syncStatus = 'poor';
          }
          status.syncPercentage = syncPercentage;
        }
      } catch {
        status.syncStatus = 'unknown';
      }
    }
    
    status.lastAnalysis = reportStat.mtime;
  } else {
    status.syncStatus = 'not-analyzed';
    status.warnings.push('No analysis report found');
  }
  
  // Count conversations
  const conversationsDir = path.join(cwd, 'conversations');
  if (await fs.pathExists(conversationsDir)) {
    const conversations = await fs.readdir(conversationsDir);
    status.conversationCount = conversations.filter(f => f.endsWith('.json')).length;
  }
  
  // Count modules
  const modulesDir = path.join(cwd, 'modules');
  if (await fs.pathExists(modulesDir)) {
    const modules = await fs.readdir(modulesDir);
    status.moduleCount = modules.filter(f => !f.endsWith('.meta.json')).length;
  }
  
  // Check for reuse suggestions
  const reusePath = path.join(cwd, '.nexus', 'reuse-suggestions.json');
  if (await fs.pathExists(reusePath)) {
    const suggestions = await fs.readJSON(reusePath);
    status.reuseCount = suggestions.length || 0;
  }
  
  // Check GitHub issues (if possible)
  const remoteUrl = await git.getRemoteUrl();
  if (remoteUrl && remoteUrl.includes('github.com')) {
    // Extract owner and repo from URL
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^.]+)/);
    if (match) {
      status.githubRepo = `${match[1]}/${match[2]}`;
    }
  }
  
  // Check for uncommitted changes
  const changedFiles = await git.getChangedFiles();
  if (changedFiles.length > 0) {
    status.uncommittedChanges = changedFiles.length;
    status.warnings.push(`${changedFiles.length} uncommitted changes`);
  }
  
  return status;
}

function displayStatus(status: any, verbose: boolean = false): void {
  console.log(chalk.bold('\n📊 Project Status\n'));
  
  // Basic info table
  const basicInfo = [
    [chalk.gray('Project'), status.projectName],
    [chalk.gray('Branch'), status.branch],
    [chalk.gray('Initialized'), status.initialized],
    [chalk.gray('Last Commit'), formatTimeAgo(status.lastCommit)],
    [chalk.gray('PRD Status'), formatStatus(status.prdStatus)],
    [chalk.gray('Code Sync'), formatSyncStatus(status.syncStatus, status.syncPercentage)],
    [chalk.gray('Conversations'), status.conversationCount],
    [chalk.gray('Modules'), status.moduleCount]
  ];
  
  if (status.reuseCount > 0) {
    basicInfo.push([chalk.gray('Reuse Opportunities'), chalk.green(status.reuseCount)]);
  }
  
  if (status.uncommittedChanges) {
    basicInfo.push([chalk.gray('Uncommitted Changes'), chalk.yellow(status.uncommittedChanges)]);
  }
  
  const tableConfig = {
    border: {
      topBody: '─',
      topJoin: '┬',
      topLeft: '┌',
      topRight: '┐',
      bottomBody: '─',
      bottomJoin: '┴',
      bottomLeft: '└',
      bottomRight: '┘',
      bodyLeft: '│',
      bodyRight: '│',
      bodyJoin: '│',
      joinBody: '─',
      joinLeft: '├',
      joinRight: '┤',
      joinJoin: '┼'
    }
  };
  
  console.log(table(basicInfo, tableConfig));
  
  // Warnings
  if (status.warnings.length > 0) {
    console.log(chalk.yellow('\n⚠️  Warnings:'));
    status.warnings.forEach((warning: string) => {
      console.log(chalk.yellow(`  • ${warning}`));
    });
  }
  
  // Verbose details
  if (verbose) {
    console.log(chalk.bold('\n📝 Detailed Information\n'));
    
    if (status.lastCommit) {
      console.log(chalk.gray('Last Commit:'));
      console.log(`  Message: ${status.lastCommit.message}`);
      console.log(`  Author: ${status.lastCommit.author}`);
      console.log(`  Date: ${dayjs(status.lastCommit.date).format('YYYY-MM-DD HH:mm:ss')}`);
    }
    
    if (status.lastAnalysis) {
      console.log(chalk.gray('\nLast Analysis:'));
      console.log(`  Date: ${dayjs(status.lastAnalysis).format('YYYY-MM-DD HH:mm:ss')}`);
      console.log(`  Age: ${dayjs(status.lastAnalysis).fromNow()}`);
    }
    
    if (status.githubRepo) {
      console.log(chalk.gray('\nGitHub:'));
      console.log(`  Repository: ${status.githubRepo}`);
    }
  }
  
  // Next steps
  console.log(chalk.bold('\n✨ Suggested Actions\n'));
  
  if (status.inactiveDays > 5) {
    console.log('  • ' + chalk.yellow('Resume development or archive project'));
    console.log('    Run: ' + chalk.cyan('nexus timeline'));
  }
  
  if (status.prdStatus === 'missing') {
    console.log('  • ' + chalk.red('Create PRD.md'));
    console.log('    Run: ' + chalk.cyan('nexus init'));
  } else if (status.prdStatus === 'stale') {
    console.log('  • ' + chalk.yellow('Update PRD documentation'));
  }
  
  if (status.syncStatus === 'not-analyzed' || status.syncStatus === 'outdated') {
    console.log('  • ' + chalk.blue('Run code analysis'));
    console.log('    Run: ' + chalk.cyan('nexus analyze'));
  }
  
  if (status.conversationCount === 0) {
    console.log('  • ' + chalk.gray('Import AI conversations'));
    console.log('    Run: ' + chalk.cyan('nexus import conversation'));
  }
  
  if (status.reuseCount > 0) {
    console.log('  • ' + chalk.green(`Review ${status.reuseCount} reuse opportunities`));
    console.log('    Run: ' + chalk.cyan('nexus scout'));
  }
  
  if (status.uncommittedChanges) {
    console.log('  • ' + chalk.yellow('Commit pending changes'));
    console.log('    Run: ' + chalk.cyan('git add . && git commit'));
  }
}

function formatTimeAgo(lastCommit: any): string {
  if (!lastCommit) return chalk.gray('Never');
  return lastCommit.timeAgo;
}

function formatStatus(status: string): string {
  switch (status) {
    case 'current':
      return chalk.green('✓ Current');
    case 'stale':
      return chalk.yellow('⚠ Stale');
    case 'missing':
      return chalk.red('✗ Missing');
    case 'untracked':
      return chalk.gray('? Untracked');
    default:
      return chalk.gray(status);
  }
}

function formatSyncStatus(status: string, percentage?: number): string {
  const percentStr = percentage !== undefined ? ` (${percentage}%)` : '';
  
  switch (status) {
    case 'good':
      return chalk.green('✓ Synced' + percentStr);
    case 'warning':
      return chalk.yellow('⚠ Drift' + percentStr);
    case 'poor':
      return chalk.red('✗ Major Drift' + percentStr);
    case 'outdated':
      return chalk.gray('? Outdated');
    case 'not-analyzed':
      return chalk.gray('- Not Analyzed');
    default:
      return chalk.gray(status);
  }
}


