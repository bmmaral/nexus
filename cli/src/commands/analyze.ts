import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { CodeAnalyzer } from '../lib/code-analyzer';
import { PRDParser } from '../lib/prd-parser';
import { GitManager } from '../lib/git-manager';
import { ReportGenerator } from '../lib/report-generator';

export const analyzeCommand = new Command('analyze')
  .description('Analyze code-PRD synchronization')
  .option('-q, --quick', 'Quick analysis (skip deep scan)')
  .option('-o, --output <format>', 'Output format (md, json, html)', 'md')
  .option('--no-commit', 'Don\'t commit report')
  .option('--pr-mode', 'PR analysis mode')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    const spinner = ora('Analyzing code-PRD synchronization...').start();
    
    try {
      const cwd = process.cwd();
      const git = new GitManager(cwd);
      
      // Check if git repository
      if (!await git.isGitRepo()) {
        spinner.fail('Not a git repository');
        process.exit(1);
      }
      
      // Check for PRD.md
      const prdPath = path.join(cwd, 'PRD.md');
      if (!await fs.pathExists(prdPath)) {
        spinner.fail('PRD.md not found');
        console.log(chalk.yellow('Please create a PRD.md file first'));
        console.log(chalk.gray('Run: nexus init'));
        process.exit(1);
      }
      
      // Parse PRD
      spinner.text = 'Parsing PRD...';
      const prdParser = new PRDParser();
      const prdData = await prdParser.parse(prdPath);
      
      if (options.verbose) {
        console.log(chalk.gray('\nPRD Summary:'));
        console.log(chalk.gray(`  - Endpoints: ${prdData.endpoints.length}`));
        console.log(chalk.gray(`  - Models: ${prdData.models.length}`));
        console.log(chalk.gray(`  - Features: ${prdData.features.length}`));
      }
      
      // Analyze codebase
      spinner.text = 'Analyzing codebase...';
      const analyzer = new CodeAnalyzer(cwd);
      const codeData = await analyzer.analyze({
        quick: options.quick,
        verbose: options.verbose
      });
      
      if (options.verbose) {
        console.log(chalk.gray('\nCode Summary:'));
        console.log(chalk.gray(`  - Files analyzed: ${codeData.filesAnalyzed}`));
        console.log(chalk.gray(`  - Endpoints found: ${codeData.endpoints.length}`));
        console.log(chalk.gray(`  - Models found: ${codeData.models.length}`));
      }
      
      // Compare PRD vs Code
      spinner.text = 'Comparing PRD with code...';
      const comparison = await compareData(prdData, codeData);
      
      // Check for AI-generated changes
      spinner.text = 'Checking for AI-generated changes...';
      const aiChanges = await detectAIChanges(git, codeData);
      comparison.aiChanges = aiChanges;
      
      // Generate report
      spinner.text = 'Generating report...';
      const reportGen = new ReportGenerator();
      const report = await reportGen.generate(comparison, options.output);
      
      // Save report
      const reportsDir = path.join(cwd, 'reports');
      await fs.ensureDir(reportsDir);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportName = `code-sync-report-${timestamp}.${options.output}`;
      const reportPath = path.join(reportsDir, reportName);
      
      await fs.writeFile(reportPath, report);
      
      // Also save latest report
      const latestPath = path.join(reportsDir, `code-sync-report.${options.output}`);
      await fs.writeFile(latestPath, report);
      
      // Commit if enabled
      if (options.commit !== false && !options.prMode) {
        spinner.text = 'Committing report...';
        await git.addFiles([`reports/code-sync-report.${options.output}`]);
        
        const summary = generateCommitSummary(comparison);
        await git.commit(
          `auto(analyzer): ${summary}`,
          { author: 'Nexus Bot <nexus@bot.local>' }
        );
      }
      
      // Handle PR mode
      if (options.prMode) {
        const prAnalysis = generatePRAnalysis(comparison);
        await fs.writeFile('pr-analysis.md', prAnalysis);
      }
      
      spinner.succeed('Analysis complete!');
      
      // Display summary
      displayAnalysisSummary(comparison);
      
      console.log('\n' + chalk.gray(`Report saved to: ${reportPath}`));
      
      // Suggest next steps based on findings
      suggestNextSteps(comparison);
      
    } catch (error: any) {
      spinner.fail('Analysis failed');
      console.error(chalk.red('Error:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

async function compareData(prdData: any, codeData: any): Promise<any> {
  const issues: {
    high: any[];
    medium: any[];
    low: any[];
  } = {
    high: [],
    medium: [],
    low: []
  };
  
  // Check for undocumented endpoints
  for (const endpoint of codeData.endpoints) {
    const documented = prdData.endpoints.find((e: any) => 
      e.path === endpoint.path && e.method === endpoint.method
    );
    
    if (!documented) {
      issues.high.push({
        type: 'undocumented_endpoint',
        title: `Undocumented endpoint: ${endpoint.method} ${endpoint.path}`,
        endpoint,
        recommendation: 'Update PRD with endpoint specification'
      });
    }
  }
  
  // Check for missing implementations
  for (const prdEndpoint of prdData.endpoints) {
    const implemented = codeData.endpoints.find((e: any) => 
      e.path === prdEndpoint.path && e.method === prdEndpoint.method
    );
    
    if (!implemented) {
      issues.high.push({
        type: 'missing_implementation',
        title: `PRD endpoint not implemented: ${prdEndpoint.method} ${prdEndpoint.path}`,
        endpoint: prdEndpoint,
        recommendation: 'Implement the endpoint or update PRD'
      });
    }
  }
  
  // Check data models
  for (const model of codeData.models) {
    const prdModel = prdData.models.find((m: any) => m.name === model.name);
    
    if (!prdModel) {
      issues.medium.push({
        type: 'undocumented_model',
        title: `Undocumented model: ${model.name}`,
        model,
        recommendation: 'Add model specification to PRD'
      });
    } else {
      // Check field differences
      const fieldDiffs = compareFields(prdModel.fields, model.fields);
      if (fieldDiffs.length > 0) {
        issues.medium.push({
          type: 'model_mismatch',
          title: `Model fields mismatch: ${model.name}`,
          differences: fieldDiffs,
          recommendation: 'Synchronize model definition in PRD with implementation'
        });
      }
    }
  }
  
  // Check for missing models
  for (const prdModel of prdData.models) {
    const implemented = codeData.models.find((m: any) => m.name === prdModel.name);
    
    if (!implemented) {
      issues.medium.push({
        type: 'missing_model',
        title: `PRD model not implemented: ${prdModel.name}`,
        model: prdModel,
        recommendation: 'Implement the model or update PRD'
      });
    }
  }
  
  // Check configuration drift
  if (prdData.config && codeData.config) {
    const configDiffs = compareConfigs(prdData.config, codeData.config);
    configDiffs.forEach((diff: any) => {
      issues.low.push({
        type: 'config_drift',
        title: `Configuration mismatch: ${diff.key}`,
        prdValue: diff.prdValue,
        codeValue: diff.codeValue,
        recommendation: 'Update configuration in PRD or code'
      });
    });
  }
  
  return {
    prdSummary: {
      endpoints: prdData.endpoints.length,
      models: prdData.models.length,
      features: prdData.features.length
    },
    codeSummary: {
      endpoints: codeData.endpoints.length,
      models: codeData.models.length,
      filesAnalyzed: codeData.filesAnalyzed
    },
    issues,
    syncPercentage: calculateSyncPercentage(issues),
    lastAnalysis: new Date().toISOString()
  };
}

function compareFields(prdFields: any[], codeFields: any[]): any[] {
  const differences = [];
  
  // Check for missing fields in code
  for (const prdField of prdFields) {
    if (!codeFields.find(f => f.name === prdField.name)) {
      differences.push({
        type: 'missing_in_code',
        field: prdField.name
      });
    }
  }
  
  // Check for extra fields in code
  for (const codeField of codeFields) {
    if (!prdFields.find(f => f.name === codeField.name)) {
      differences.push({
        type: 'extra_in_code',
        field: codeField.name
      });
    }
  }
  
  // Check for type mismatches
  for (const prdField of prdFields) {
    const codeField = codeFields.find(f => f.name === prdField.name);
    if (codeField && prdField.type !== codeField.type) {
      differences.push({
        type: 'type_mismatch',
        field: prdField.name,
        prdType: prdField.type,
        codeType: codeField.type
      });
    }
  }
  
  return differences;
}

function compareConfigs(prdConfig: any, codeConfig: any): any[] {
  const differences = [];
  
  for (const key in prdConfig) {
    if (codeConfig[key] !== undefined && prdConfig[key] !== codeConfig[key]) {
      differences.push({
        key,
        prdValue: prdConfig[key],
        codeValue: codeConfig[key]
      });
    }
  }
  
  return differences;
}

async function detectAIChanges(git: GitManager, codeData: any): Promise<any[]> {
  const aiChanges = [];
  const aiCommits = await git.getAICommits(20);
  
  for (const commit of aiCommits) {
    // Check which files were changed
    const changedFiles = commit.files || [];
    
    for (const file of changedFiles) {
      // Check if file contains endpoints or models
      const fileEndpoints = codeData.endpoints.filter((e: any) => e.file === file);
      const fileModels = codeData.models.filter((m: any) => m.file === file);
      
      if (fileEndpoints.length > 0 || fileModels.length > 0) {
        aiChanges.push({
          commit: commit.hash,
          author: commit.author,
          date: commit.date,
          message: commit.message,
          file,
          endpoints: fileEndpoints,
          models: fileModels
        });
      }
    }
  }
  
  return aiChanges;
}

function calculateSyncPercentage(issues: any): number {
  const totalIssues = issues.high.length + issues.medium.length + issues.low.length;
  
  if (totalIssues === 0) return 100;
  
  // Weight issues by severity
  const weightedIssues = 
    (issues.high.length * 3) + 
    (issues.medium.length * 2) + 
    (issues.low.length * 1);
  
  // Maximum possible weight (assuming 10 issues of each type)
  const maxWeight = 60;
  
  const percentage = Math.max(0, 100 - (weightedIssues / maxWeight * 100));
  return Math.round(percentage);
}

function generateCommitSummary(comparison: any): string {
  const { issues } = comparison;
  
  if (issues.high.length > 0) {
    return `🔴 Critical: ${issues.high.length} high priority issues detected`;
  } else if (issues.medium.length > 0) {
    return `🟡 Warning: ${issues.medium.length} medium priority issues`;
  } else if (issues.low.length > 0) {
    return `🔵 Minor: ${issues.low.length} low priority issues`;
  } else {
    return `✅ Synced: PRD and code are aligned (${comparison.syncPercentage}%)`;
  }
}

function generatePRAnalysis(comparison: any): string {
  let analysis = '## 🔍 Nexus Analysis Report\n\n';
  
  analysis += `**Sync Status:** ${comparison.syncPercentage}%\n\n`;
  
  if (comparison.issues.high.length > 0) {
    analysis += '### 🔴 High Priority Issues\n\n';
    comparison.issues.high.forEach((issue: any) => {
      analysis += `- ${issue.title}\n`;
      analysis += `  - **Recommendation:** ${issue.recommendation}\n`;
    });
    analysis += '\n';
  }
  
  if (comparison.issues.medium.length > 0) {
    analysis += '### 🟡 Medium Priority Issues\n\n';
    comparison.issues.medium.slice(0, 5).forEach((issue: any) => {
      analysis += `- ${issue.title}\n`;
    });
    if (comparison.issues.medium.length > 5) {
      analysis += `- ... and ${comparison.issues.medium.length - 5} more\n`;
    }
    analysis += '\n';
  }
  
  if (comparison.aiChanges.length > 0) {
    analysis += '### 🤖 AI-Generated Changes Detected\n\n';
    analysis += 'The following changes were made by AI agents:\n';
    comparison.aiChanges.slice(0, 3).forEach((change: any) => {
      analysis += `- ${change.file} (${change.author})\n`;
    });
    analysis += '\n';
  }
  
  analysis += '### ✅ Checklist\n\n';
  analysis += '- [ ] Review the analysis report\n';
  analysis += '- [ ] Update PRD if needed\n';
  analysis += '- [ ] Address high priority issues\n';
  analysis += '- [ ] Verify AI-generated changes\n';
  
  analysis += '\n---\n*Generated by Project Nexus*';
  
  return analysis;
}

function displayAnalysisSummary(comparison: any): void {
  const { issues, syncPercentage } = comparison;
  
  console.log(chalk.bold('\n📊 Analysis Summary\n'));
  
  // Sync status
  const syncColor = syncPercentage >= 80 ? chalk.green : 
                    syncPercentage >= 60 ? chalk.yellow : chalk.red;
  console.log(`Sync Status: ${syncColor(`${syncPercentage}%`)}`);
  
  // Issue counts
  if (issues.high.length > 0) {
    console.log(chalk.red(`\n🔴 High Priority: ${issues.high.length} issues`));
    issues.high.slice(0, 3).forEach((issue: any) => {
      console.log(chalk.red(`   • ${issue.title}`));
    });
  }
  
  if (issues.medium.length > 0) {
    console.log(chalk.yellow(`\n🟡 Medium Priority: ${issues.medium.length} issues`));
    issues.medium.slice(0, 2).forEach((issue: any) => {
      console.log(chalk.yellow(`   • ${issue.title}`));
    });
  }
  
  if (issues.low.length > 0) {
    console.log(chalk.blue(`\n🔵 Low Priority: ${issues.low.length} issues`));
  }
  
  // AI changes
  if (comparison.aiChanges && comparison.aiChanges.length > 0) {
    console.log(chalk.magenta(`\n🤖 AI-Generated Changes: ${comparison.aiChanges.length} detected`));
  }
}

function suggestNextSteps(comparison: any): void {
  const { issues, syncPercentage } = comparison;
  
  console.log('\n' + chalk.blue('Suggested Next Steps:'));
  
  if (issues.high.length > 0) {
    console.log('  1. ' + chalk.red('Address high priority issues immediately'));
    console.log('     Run: ' + chalk.cyan('nexus fix high-priority'));
  }
  
  if (syncPercentage < 80) {
    console.log('  2. ' + chalk.yellow('Update PRD to match current implementation'));
    console.log('     Run: ' + chalk.cyan('nexus update prd'));
  }
  
  if (comparison.aiChanges && comparison.aiChanges.length > 0) {
    console.log('  3. ' + chalk.magenta('Review AI-generated changes'));
    console.log('     Run: ' + chalk.cyan('nexus review ai-changes'));
  }
  
  console.log('  4. ' + chalk.green('View detailed report'));
  console.log('     Run: ' + chalk.cyan('nexus report view'));
}
