#!/usr/bin/env node
/**
 * CNS Daemon - Unified orchestration system
 * Runs both MCP server and agent runner in a single process
 */

import { fork, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { AgentRunner } from '../agent-runner/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DaemonConfig {
  enableMcpServer: boolean;
  enableAgentRunner: boolean;
  mcpServerMode: 'stdio' | 'daemon';
  maxAgents: number;
  pollInterval: number; // seconds
}

export class CNSDaemon {
  private mcpServerProcess: ChildProcess | null = null;
  private agentRunner: AgentRunner | null = null;
  private isRunning = false;
  private config: DaemonConfig;

  constructor(config: Partial<DaemonConfig> = {}) {
    this.config = {
      enableMcpServer: true,
      enableAgentRunner: true,
      mcpServerMode: 'daemon',
      maxAgents: parseInt(process.env.CNS_MAX_AGENTS || '3'),
      pollInterval: parseInt(process.env.CNS_POLL_INTERVAL || '10'),
      ...config
    };
  }

  async start() {
    logger.info('🚀 Starting CNS Daemon (Unified Orchestration System)');
    
    this.isRunning = true;
    
    // Start MCP server
    if (this.config.enableMcpServer) {
      await this.startMcpServer();
    }
    
    // Start agent runner
    if (this.config.enableAgentRunner) {
      await this.startAgentRunner();
    }
    
    // Set up graceful shutdown
    this.setupGracefulShutdown();
    
    logger.info('✅ CNS Daemon started successfully');
    logger.info('   🔧 MCP Server:', this.config.enableMcpServer ? 'Running' : 'Disabled');
    logger.info('   🤖 Agent Runner:', this.config.enableAgentRunner ? 'Running' : 'Disabled');
    logger.info('   📊 Max Agents:', this.config.maxAgents);
  }

  async stop() {
    logger.info('🛑 Stopping CNS Daemon');
    
    this.isRunning = false;
    
    // Stop agent runner
    if (this.agentRunner) {
      logger.info('Stopping agent runner...');
      await this.agentRunner.stop();
      this.agentRunner = null;
    }
    
    // Stop MCP server
    if (this.mcpServerProcess) {
      logger.info('Stopping MCP server...');
      this.mcpServerProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise((resolve) => {
        if (!this.mcpServerProcess) {
          resolve(void 0);
          return;
        }
        
        this.mcpServerProcess.on('exit', () => resolve(void 0));
        
        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.mcpServerProcess && !this.mcpServerProcess.killed) {
            this.mcpServerProcess.kill('SIGKILL');
          }
          resolve(void 0);
        }, 5000);
      });
      
      this.mcpServerProcess = null;
    }
    
    logger.info('✅ CNS Daemon stopped');
  }

  private async startMcpServer() {
    logger.info('Starting MCP server...');
    
    const serverPath = join(__dirname, '..', 'index.js');
    
    if (this.config.mcpServerMode === 'stdio') {
      // Run MCP server in stdio mode (for Claude Code integration)
      logger.info('MCP server running in stdio mode (background process)');
      this.mcpServerProcess = fork(serverPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          CNS_DAEMON_MODE: 'true'
        }
      });
    } else {
      // Run MCP server as daemon process
      this.mcpServerProcess = fork(serverPath, [], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          CNS_DAEMON_MODE: 'true'
        }
      });
    }
    
    this.mcpServerProcess.on('error', (error) => {
      logger.error('MCP server error:', error);
    });
    
    this.mcpServerProcess.on('exit', (code, signal) => {
      logger.warn('MCP server exited', { code, signal });
      if (this.isRunning) {
        logger.info('Restarting MCP server...');
        setTimeout(() => this.startMcpServer(), 2000);
      }
    });
    
    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    logger.info('✅ MCP server started');
  }

  private async startAgentRunner() {
    logger.info('Starting agent runner...');
    
    // Set environment variables for agent runner
    process.env.CNS_MAX_AGENTS = this.config.maxAgents.toString();
    
    // Daemon disabled - needs refactoring for new architecture
    logger.info('Daemon agent runner temporarily disabled');
    return;
    
    try {
      logger.info('✅ Agent runner started');
    } catch (error) {
      logger.error('Failed to start agent runner:', error);
      throw error;
    }
  }

  private setupGracefulShutdown() {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
    
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        await this.stop();
        process.exit(0);
      });
    });
    
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception:', error);
      await this.stop();
      process.exit(1);
    });
    
    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      await this.stop();
      process.exit(1);
    });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      mcpServer: {
        enabled: this.config.enableMcpServer,
        running: this.mcpServerProcess !== null && !this.mcpServerProcess.killed,
        pid: this.mcpServerProcess?.pid
      },
      agentRunner: {
        enabled: this.config.enableAgentRunner,
        running: this.agentRunner !== null,
        status: this.agentRunner?.getStatus()
      },
      config: this.config
    };
  }
}

// CLI interface for direct execution
async function main() {
  const command = process.argv[2] || 'start';
  
  if (command === 'help' || command === '--help') {
    console.log(`
CNS Daemon - Unified Orchestration System

Usage:
  cns-daemon [command]

Commands:
  start         Start the complete CNS system (default)
  mcp-only      Start only MCP server  
  runner-only   Start only agent runner
  status        Show daemon status
  help          Show this help

Environment Variables:
  CNS_MAX_AGENTS       Maximum concurrent agents (default: 3)
  CNS_POLL_INTERVAL    Agent polling interval in seconds (default: 10)
  DATABASE_PATH        Path to CNS database
  CNS_SERVER_PATH      Override MCP server path
`);
    return;
  }
  
  const daemon = new CNSDaemon({
    enableMcpServer: command !== 'runner-only',
    enableAgentRunner: command !== 'mcp-only'
  });
  
  try {
    if (command === 'status') {
      console.log('Status check not implemented for standalone daemon');
      console.log('Use process managers or ps aux | grep cns');
      return;
    }
    
    await daemon.start();
    
    // Keep process running
    logger.info('CNS Daemon is running. Press Ctrl+C to stop.');
    
    // Prevent exit
    process.stdin.resume();
    
  } catch (error) {
    logger.error('CNS Daemon error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('CNS Daemon fatal error:', error);
    process.exit(1);
  });
}