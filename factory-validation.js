#!/usr/bin/env node

/**
 * Factory Validation Test
 * 
 * This test validates the agent factory by actually using the MCP interface
 * to queue tasks and monitor agent execution.
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readdir } from 'fs/promises';

class FactoryValidation {
  constructor() {
    this.serverProcess = null;
    this.client = null;
    this.results = {
      serverStart: false,
      mcpConnection: false,
      taskQueuing: false,
      agentSpawning: false,
      workspaceCreation: false
    };
  }

  async run() {
    console.log('🏭 FACTORY VALIDATION TEST');
    console.log('=' .repeat(60));
    console.log('Testing agent factory with real MCP interface');
    console.log('=' .repeat(60));

    try {
      // Start server
      await this.startServer();
      
      // Connect MCP client
      await this.connectMCPClient();
      
      // Queue test tasks
      await this.queueTestTasks();
      
      // Monitor execution
      await this.monitorExecution();
      
      // Generate report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
    } finally {
      await this.cleanup();
    }
  }

  async startServer() {
    console.log('\\n📦 Starting CNS MCP Server...');
    
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('npm', ['start'], {
        cwd: process.cwd(),
        env: { ...process.env, CNS_MAX_AGENTS: '3' }
      });

      let serverReady = false;
      const timeout = setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Server startup timeout'));
        }
      }, 30000);

      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (!serverReady) {
          console.log('Server:', output.trim());
        }
        
        if (output.includes('CNS MCP Server running') || 
            output.includes('Agent runner started successfully')) {
          serverReady = true;
          this.results.serverStart = true;
          clearTimeout(timeout);
          console.log('✅ Server started successfully');
          setTimeout(resolve, 2000); // Give it a moment to stabilize
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (!error.includes('[dotenv]') && !error.includes('info:')) {
          console.error('Server error:', error);
        }
      });

      this.serverProcess.on('exit', (code) => {
        if (!serverReady) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });
  }

  async connectMCPClient() {
    console.log('\\n🔌 Connecting MCP client...');
    
    try {
      const transport = new StdioClientTransport({
        command: 'npm',
        args: ['start'],
        env: { ...process.env }
      });

      this.client = new Client({
        name: 'factory-validator',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      await this.client.connect(transport);
      this.results.mcpConnection = true;
      console.log('✅ MCP client connected');
      
    } catch (error) {
      console.error('❌ Failed to connect MCP client:', error.message);
      throw error;
    }
  }

  async queueTestTasks() {
    console.log('\\n📋 Queuing test tasks...');
    
    try {
      // Queue a simple test task
      const result = await this.client.callTool('launch_agent', {
        agent_type: 'general-purpose',
        specifications: 'Test task: Verify agent factory is working by echoing "Factory test successful"'
      });
      
      console.log('Task queued:', result);
      this.results.taskQueuing = true;
      console.log('✅ Task successfully queued');
      
    } catch (error) {
      console.error('❌ Failed to queue task:', error.message);
    }
  }

  async monitorExecution() {
    console.log('\\n👁️ Monitoring agent execution...');
    
    // Wait for agent runner to poll (it polls every 10 seconds)
    console.log('Waiting for agent runner to detect task...');
    await this.sleep(15000);
    
    // Check for agent processes
    const { stdout } = await this.execAsync('ps aux | grep -E "claude.*--resume.*--input" | grep -v grep | wc -l');
    const agentCount = parseInt(stdout.trim()) || 0;
    
    if (agentCount > 0) {
      this.results.agentSpawning = true;
      console.log(`✅ Agent spawning confirmed (${agentCount} agents running)`);
    } else {
      console.log('❌ No agent processes detected');
    }
    
    // Check for workspace creation
    try {
      const workspacesDir = `${process.env.HOME}/.cns/workspaces`;
      const contents = await readdir(workspacesDir);
      const agentWorkspaces = contents.filter(name => 
        name.includes('agent') || name.includes('general-purpose')
      );
      
      if (agentWorkspaces.length > 0) {
        this.results.workspaceCreation = true;
        console.log(`✅ Workspace creation confirmed (${agentWorkspaces.length} workspaces)`);
      } else {
        console.log('❌ No workspaces created');
      }
    } catch {
      console.log('⚠️ Could not check workspaces');
    }
    
    // Monitor for a bit longer
    console.log('\\nMonitoring for 30 more seconds...');
    await this.sleep(30000);
  }

  generateReport() {
    console.log('\\n' + '='.repeat(60));
    console.log('📊 FACTORY VALIDATION RESULTS');
    console.log('='.repeat(60));
    
    const capabilities = [
      ['Server Startup', this.results.serverStart],
      ['MCP Connection', this.results.mcpConnection],
      ['Task Queuing', this.results.taskQueuing],
      ['Agent Spawning', this.results.agentSpawning],
      ['Workspace Creation', this.results.workspaceCreation]
    ];
    
    capabilities.forEach(([capability, working]) => {
      const status = working ? '✅ WORKING' : '❌ FAILED';
      console.log(`  ${capability.padEnd(20)}: ${status}`);
    });
    
    const workingCount = Object.values(this.results).filter(Boolean).length;
    const totalCount = Object.keys(this.results).length;
    const score = Math.round(workingCount / totalCount * 100);
    
    console.log(`\\n🎯 Factory Score: ${workingCount}/${totalCount} (${score}%)`);
    
    if (score === 100) {
      console.log('\\n🎉 AGENT FACTORY IS FULLY FUNCTIONAL!');
      console.log('The "factory" concept is validated and working.');
    } else if (score >= 60) {
      console.log('\\n✅ Agent factory has core functionality');
      console.log('Some components need attention.');
    } else {
      console.log('\\n❌ Agent factory is not functional');
      console.log('Critical issues need to be resolved.');
    }
    
    console.log('=' .repeat(60));
  }

  async cleanup() {
    console.log('\\n🧹 Cleaning up...');
    
    if (this.client) {
      try {
        await this.client.close();
      } catch {}
    }
    
    if (this.serverProcess) {
      this.serverProcess.kill();
      await this.sleep(2000);
    }
    
    console.log('✅ Cleanup complete');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async execAsync(command) {
    const { promisify } = await import('util');
    const { exec } = await import('child_process');
    return promisify(exec)(command);
  }
}

// Run validation
const validator = new FactoryValidation();
validator.run().catch(console.error);