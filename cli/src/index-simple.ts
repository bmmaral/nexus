#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('nexus')
  .description('AI-Powered Project Memory & Repository Sync System')
  .version('1.0.0');

// Simple test command
program
  .command('test')
  .description('Test command')
  .action(() => {
    console.log('✅ Nexus CLI is working!');
    console.log('Project Nexus - AI-Powered Project Memory System');
  });

program.parse(process.argv);


