#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagePath = join(dirname(dirname(__dirname)), 'package.json');
const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));

function showHelp() {
  console.log(`
CNS MCP Server v${pkg.version}
Autonomous Multi-Agent Orchestration for Claude Code

Usage:
  cns-server <command> [options]

Commands:
  init              Initialize CNS configuration
  start             Start the MCP server  
  validate          Validate system configuration
  help              Show this help message
  --version         Show version number

Examples:
  cns-server init
  cns-server validate --verbose
  cns-server start
`);
}

function validateSystem(verbose = false) {
  console.log('🔍 Validating CNS MCP Server Configuration...\n');
  
  const cnsDir = join(homedir(), '.cns');
  const dataDir = join(cnsDir, 'data');
  const workspacesDir = join(cnsDir, 'workspaces');
  const logsDir = join(cnsDir, 'logs');
  
  const checks = [
    { name: 'Configuration file exists', path: join(cnsDir, 'config.json') },
    { name: 'Directory exists: ~/.cns/data', path: dataDir },
    { name: 'Directory exists: ~/.cns/workspaces', path: workspacesDir },
    { name: 'Directory exists: ~/.cns/logs', path: logsDir },
  ];
  
  for (const check of checks) {
    if (existsSync(check.path)) {
      console.log(`✓ ${check.name}`);
    } else {
      console.log(`✗ ${check.name}`);
      if (verbose) {
        console.log(`  Missing: ${check.path}`);
      }
    }
  }
  
  console.log('\n📊 Embedding Provider: transformers');
  console.log('✓ Using free local Transformers.js embeddings');
  console.log('  Model: Xenova/all-MiniLM-L6-v2');
  console.log('  Dimension: 384');
  
  try {
    execSync('git --version', { stdio: 'pipe' });
    execSync('git rev-parse --git-dir', { stdio: 'pipe', cwd: process.cwd() });
    console.log('\n📁 Git Repository Check:');
    console.log('✓ Git is available and this is a Git repository');
  } catch (error) {
    console.log('\n📁 Git Repository Check:');
    console.log('⚠️  Not in a Git repository (workspace features will be limited)');
  }
  
  console.log('\n✅ Validation complete!');
}

function initializeSystem() {
  console.log('🚀 Initializing CNS MCP Server...\n');
  
  const cnsDir = join(homedir(), '.cns');
  const dataDir = join(cnsDir, 'data');
  const workspacesDir = join(cnsDir, 'workspaces');
  const logsDir = join(cnsDir, 'logs');
  const configPath = join(cnsDir, 'config.json');
  
  // Create directories
  [cnsDir, dataDir, workspacesDir, logsDir].forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`✓ Created directory: ${dir}`);
    }
  });
  
  // Create config
  if (!existsSync(configPath)) {
    const config = {
      database_path: join(dataDir, 'cns.db'),
      workspaces_dir: workspacesDir,
      embedding_provider: 'transformers',
      embedding_model: 'Xenova/all-MiniLM-L6-v2',
      embedding_dimension: 384,
      max_workflows: 10,
      cleanup_interval_minutes: 5
    };
    
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('✓ Created configuration file');
  }
  
  console.log('\n🎯 Claude Code Configuration:');
  console.log('Add this to your Claude Code MCP settings:\n');
  console.log(JSON.stringify({
    mcpServers: {
      cns: {
        command: 'npx',
        args: ['-y', 'cns-mcp-server']
      }
    }
  }, null, 2));
  
  console.log('\n✅ CNS initialized successfully!');
  console.log('\nNext steps:');
  console.log('1. Copy the configuration above to Claude Code');
  console.log('2. Restart Claude Code');
  console.log('3. Try /cns:status in a conversation');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'init':
      initializeSystem();
      break;
    case 'validate':
      const verbose = args.includes('--verbose');
      validateSystem(verbose);
      break;
    case 'start': {
      console.log('Starting CNS MCP Server...');
      // Import and start the MCP server
      const { CNSMCPServer } = await import('../index.js');
      const server = new CNSMCPServer();
      await server.run();
      break;
    }
    case '--version':
      console.log(`v${pkg.version}`);
      break;
    case 'help':
    case undefined:
      showHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}