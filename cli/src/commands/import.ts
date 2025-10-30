import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import { GitManager } from '../lib/git-manager';
import { ConversationProcessor } from '../lib/conversation-processor';
import { NexusConfig } from '../lib/config';

export const importCommand = new Command('import')
  .description('Import conversations or modules')
  .argument('<type>', 'Type of import (conversation, module)')
  .option('-f, --file <path>', 'File to import')
  .option('-p, --platform <platform>', 'Platform (chatgpt, claude, gemini)')
  .option('--no-commit', 'Skip auto-commit')
  .option('--no-extract', 'Skip decision extraction')
  .action(async (type, options) => {
    if (type === 'conversation') {
      await importConversation(options);
    } else if (type === 'module') {
      await importModule(options);
    } else {
      console.error(chalk.red(`Unknown import type: ${type}`));
      console.log(chalk.gray('Available types: conversation, module'));
      process.exit(1);
    }
  });

async function importConversation(options: any): Promise<void> {
  let filePath = options.file;
  
  // Interactive file selection if not provided
  if (!filePath) {
    const answer = await inquirer.prompt([{
      type: 'input',
      name: 'file',
      message: 'Path to conversation file:',
      validate: async (input) => {
        if (!input) return 'File path is required';
        if (!await fs.pathExists(input)) return 'File not found';
        return true;
      }
    }]);
    filePath = answer.file;
  }
  
  // Auto-detect platform if not specified
  const platform = options.platform || await detectPlatform(filePath);
  
  if (!platform) {
    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'platform',
      message: 'Select the conversation platform:',
      choices: ['chatgpt', 'claude', 'gemini', 'other']
    }]);
    options.platform = answer.platform;
  }
  
  const spinner = ora(`Importing ${platform} conversation...`).start();
  
  try {
    const processor = new ConversationProcessor();
    const git = new GitManager();
    
    // Read and parse conversation
    spinner.text = 'Parsing conversation...';
    const conversation = await processor.parseConversation(filePath, platform);
    
    // Extract decisions if enabled
    let decisions: any[] = [];
    if (options.extract !== false) {
      spinner.text = 'Extracting key decisions...';
      decisions = await processor.extractDecisions(conversation);
    }
    
    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${timestamp}-${platform}-${Date.now()}.json`;
    const conversationPath = path.join(process.cwd(), 'conversations', filename);
    
    // Save conversation
    spinner.text = 'Saving conversation...';
    await fs.ensureDir(path.dirname(conversationPath));
    await fs.writeJSON(conversationPath, {
      ...conversation,
      metadata: {
        imported: new Date().toISOString(),
        platform,
        originalFile: path.basename(filePath),
        decisionsExtracted: decisions.length
      },
      decisions
    }, { spaces: 2 });
    
    // Generate summary
    spinner.text = 'Generating summary...';
    const summary = await processor.generateSummary(conversation, decisions);
    
    // Update conversation graph
    spinner.text = 'Updating conversation graph...';
    await updateConversationGraph(conversation, decisions);
    
    // Commit if enabled
    if (options.commit !== false) {
      spinner.text = 'Committing changes...';
      await git.addFiles(['conversations/' + filename]);
      await git.commit(
        `feat(conversation): Import ${platform} conversation - ${summary}`,
        { author: 'Nexus Bot <nexus@bot.local>' }
      );
    }
    
    spinner.succeed('Conversation imported successfully!');
    
    // Display results
    console.log('\n' + chalk.green('✓') + ` Imported: ${filename}`);
    console.log(chalk.blue('📊') + ` Found ${decisions.length} key decisions`);
    
    if (decisions.length > 0) {
      console.log('\n' + chalk.gray('Top decisions:'));
      decisions.slice(0, 3).forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.text}`);
        if (d.confidence) {
          console.log(chalk.gray(`     Confidence: ${Math.round(d.confidence * 100)}%`));
        }
      });
    }
    
    console.log('\n' + chalk.gray('Summary:') + ' ' + summary);
    
    // Suggest next steps
    console.log('\n' + chalk.blue('Next steps:'));
    console.log('  • View timeline: ' + chalk.cyan('nexus timeline'));
    console.log('  • Run analysis: ' + chalk.cyan('nexus analyze'));
    console.log('  • Check status: ' + chalk.cyan('nexus status'));
    
  } catch (error: any) {
    spinner.fail('Import failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

async function importModule(options: any): Promise<void> {
  const spinner = ora('Importing module...').start();
  
  try {
    let sourcePath = options.file;
    
    if (!sourcePath) {
      const answer = await inquirer.prompt([{
        type: 'input',
        name: 'source',
        message: 'Path to module file or directory:',
        validate: async (input) => {
          if (!input) return 'Path is required';
          if (!await fs.pathExists(input)) return 'Path not found';
          return true;
        }
      }]);
      sourcePath = answer.source;
    }
    
    // Get module name
    const defaultName = path.basename(sourcePath, path.extname(sourcePath));
    const { moduleName } = await inquirer.prompt([{
      type: 'input',
      name: 'moduleName',
      message: 'Module name:',
      default: defaultName
    }]);
    
    // Copy module to modules directory
    const modulesDir = path.join(process.cwd(), 'modules');
    await fs.ensureDir(modulesDir);
    
    const stat = await fs.stat(sourcePath);
    let targetPath: string;
    
    if (stat.isDirectory()) {
      targetPath = path.join(modulesDir, moduleName);
      await fs.copy(sourcePath, targetPath);
    } else {
      const ext = path.extname(sourcePath);
      targetPath = path.join(modulesDir, moduleName + ext);
      await fs.copy(sourcePath, targetPath);
    }
    
    // Create module metadata
    const metadataPath = path.join(modulesDir, `${moduleName}.meta.json`);
    await fs.writeJSON(metadataPath, {
      name: moduleName,
      imported: new Date().toISOString(),
      source: sourcePath,
      type: stat.isDirectory() ? 'directory' : 'file',
      description: '',
      dependencies: [],
      exports: []
    }, { spaces: 2 });
    
    spinner.succeed('Module imported successfully!');
    
    console.log('\n' + chalk.green('✓') + ` Module: ${moduleName}`);
    console.log(chalk.green('✓') + ` Location: ${targetPath}`);
    
    // Offer to update PRD
    const { updatePRD } = await inquirer.prompt([{
      type: 'confirm',
      name: 'updatePRD',
      message: 'Update PRD with module information?',
      default: true
    }]);
    
    if (updatePRD) {
      // TODO: Update PRD with module information
      console.log(chalk.yellow('PRD update not yet implemented'));
    }
    
  } catch (error: any) {
    spinner.fail('Module import failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

async function detectPlatform(filePath: string): Promise<string | null> {
  const content = await fs.readFile(filePath, 'utf-8');
  const fileName = path.basename(filePath).toLowerCase();
  
  // Check filename patterns
  if (fileName.includes('chatgpt') || fileName.includes('openai')) {
    return 'chatgpt';
  }
  if (fileName.includes('claude') || fileName.includes('anthropic')) {
    return 'claude';
  }
  if (fileName.includes('gemini') || fileName.includes('bard') || fileName.includes('google')) {
    return 'gemini';
  }
  
  // Check content patterns
  try {
    const json = JSON.parse(content);
    
    // ChatGPT patterns
    if (json.model?.includes('gpt') || json.messages?.[0]?.role === 'system') {
      return 'chatgpt';
    }
    
    // Claude patterns
    if (json.model?.includes('claude') || json.human_input || json.ai_response) {
      return 'claude';
    }
    
    // Gemini patterns
    if (json.model?.includes('gemini') || json.candidates) {
      return 'gemini';
    }
  } catch {
    // Not JSON, check for other patterns
    if (content.includes('Human:') && content.includes('Assistant:')) {
      return 'claude';
    }
    if (content.includes('User:') && content.includes('ChatGPT:')) {
      return 'chatgpt';
    }
  }
  
  return null;
}

async function updateConversationGraph(conversation: any, decisions: any[]): Promise<void> {
  const graphPath = path.join(process.cwd(), '.nexus', 'conversation-graph.json');
  
  let graph: any = { events: [] };
  if (await fs.pathExists(graphPath)) {
    graph = await fs.readJSON(graphPath);
  }
  
  // Add conversation event
  graph.events.push({
    timestamp: new Date().toISOString(),
    type: 'conversation',
    platform: conversation.platform || 'unknown',
    messageCount: conversation.messages?.length || 0,
    decisionsFound: decisions.length,
    summary: conversation.summary
  });
  
  // Add decision events
  for (const decision of decisions) {
    graph.events.push({
      timestamp: decision.timestamp || new Date().toISOString(),
      type: 'decision',
      text: decision.text,
      confidence: decision.confidence,
      source: 'conversation'
    });
  }
  
  // Sort by timestamp
  graph.events.sort((a: any, b: any) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  // Keep only last 1000 events
  if (graph.events.length > 1000) {
    graph.events = graph.events.slice(-1000);
  }
  
  await fs.writeJSON(graphPath, graph, { spaces: 2 });
}


