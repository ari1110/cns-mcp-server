#!/usr/bin/env node
/**
 * CNS Agent Runner CLI - Command-line interface for the agent execution service
 */

// import { AgentRunner } from '../agent-runner/index.js'; // Disabled
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
  
  // CLI runner disabled - needs refactoring for new architecture
  console.log('CLI runner temporarily disabled - use full CNS server');
  return;
  
  try {
    switch (command) {
      case 'start':
        logger.info('Starting CNS Agent Runner...');
        
        // Handle graceful shutdown
        console.log('CLI start command temporarily disabled');
        process.exit(0);
        
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