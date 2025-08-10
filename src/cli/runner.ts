#!/usr/bin/env node
/**
 * CNS Agent Runner CLI - Command-line interface for the agent execution service
 */

import { AgentRunner } from '../agent-runner/index.js';
import { logger } from '../utils/logger.js';

async function main() {
  const command = process.argv[2];
  
  if (!command || command === 'help') {
    console.log(`
CNS Agent Runner - Autonomous agent execution service

Usage:
  cns-runner start    Start the agent runner service
  cns-runner status   Show runner status
  cns-runner stop     Stop the runner (sends SIGTERM)
  cns-runner help     Show this help message

Environment Variables:
  CNS_MAX_AGENTS      Maximum concurrent agents (default: 3)
  CNS_SERVER_PATH     Path to CNS MCP server
  DATABASE_PATH       Path to CNS database
`);
    return;
  }
  
  const runner = new AgentRunner();
  
  try {
    switch (command) {
      case 'start':
        logger.info('Starting CNS Agent Runner...');
        
        // Handle graceful shutdown
        process.on('SIGTERM', async () => {
          logger.info('Received SIGTERM, shutting down gracefully...');
          await runner.stop();
          process.exit(0);
        });
        
        process.on('SIGINT', async () => {
          logger.info('Received SIGINT, shutting down gracefully...');
          await runner.stop();
          process.exit(0);
        });
        
        await runner.start();
        
        // Keep process running
        logger.info('Agent Runner is running. Press Ctrl+C to stop.');
        break;
        
      case 'status':
        // This would require connecting to a running runner instance
        // For now, just show if the process is running
        console.log('Status check not yet implemented');
        console.log('Use "ps aux | grep cns-runner" to check if running');
        break;
        
      case 'stop':
        // This would require process management
        console.log('Stop command not yet implemented');
        console.log('Use "pkill cns-runner" or kill the process manually');
        break;
        
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Use "cns-runner help" for usage information');
        process.exit(1);
    }
    
  } catch (error) {
    logger.error('CNS Agent Runner error', { error });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('CNS Agent Runner fatal error', { error });
    process.exit(1);
  });
}