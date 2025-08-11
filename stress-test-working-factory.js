#!/usr/bin/env node

/**
 * Agent Factory Stress Test
 * 
 * Now that we've proven the basic functionality works, this stress test validates:
 * - Concurrent agent execution (3 agents simultaneously)
 * - Workspace isolation (agents don't interfere)
 * - Resource management (cleanup, memory)
 * - Burst handling (rapid launches)
 * - Error resilience
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readdir, readFile } from 'fs/promises';
import { spawn } from 'child_process';

class AgentFactoryStressTest {
  constructor() {
    this.client = null;
    this.serverProcess = null;
    this.results = {
      tasksLaunched: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      maxConcurrentAgents: 0,
      peakWorkspaces: 0,
      avgExecutionTime: 0,
      testStart: Date.now()
    };
  }

  async run() {
    console.log('🚀 AGENT FACTORY STRESS TEST');
    console.log('=' .repeat(60));
    console.log('Testing concurrent execution, isolation, and resilience');
    console.log('=' .repeat(60));

    try {
      await this.connectToRunningCNS();
      
      console.log('\n📊 Phase 1: Concurrent Execution Test');
      await this.testConcurrentExecution();
      
      console.log('\n⚡ Phase 2: Burst Load Test'); 
      await this.testBurstLoad();
      
      console.log('\n🔄 Phase 3: Sustained Load Test');
      await this.testSustainedLoad();
      
      console.log('\n🛡️ Phase 4: Error Resilience Test');
      await this.testErrorResilience();
      
      await this.generateStressReport();
      
    } catch (error) {
      console.error('❌ Stress test failed:', error.message);
    } finally {
      if (this.client) {
        await this.client.close();
      }
    }
  }

  async connectToRunningCNS() {
    console.log('🔌 Connecting to running CNS MCP server...');
    
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['/home/ari1110/projects/cns-mcp-server/dist/index.js'],
      env: { ...process.env }
    });

    this.client = new Client({
      name: 'stress-tester',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await this.client.connect(transport);
    console.log('✅ Connected to CNS');
  }

  async testConcurrentExecution() {
    console.log('Launching 5 agents simultaneously...');
    
    const tasks = [
      this.launchAgent('concurrent-1', 'Create file concurrent-1.txt with content "Agent 1 executed"'),
      this.launchAgent('concurrent-2', 'Create file concurrent-2.txt with content "Agent 2 executed"'),
      this.launchAgent('concurrent-3', 'Create file concurrent-3.txt with content "Agent 3 executed"'),
      this.launchAgent('concurrent-4', 'Create file concurrent-4.txt with content "Agent 4 executed"'),
      this.launchAgent('concurrent-5', 'Create file concurrent-5.txt with content "Agent 5 executed"')
    ];
    
    const results = await Promise.allSettled(tasks);
    this.results.tasksLaunched += 5;
    
    // Monitor for 30 seconds to see concurrent execution
    console.log('⏳ Monitoring concurrent execution for 30 seconds...');
    await this.monitorConcurrency(30000);
    
    console.log(`✅ Concurrent test launched: ${results.filter(r => r.status === 'fulfilled').length}/5 tasks`);
  }

  async testBurstLoad() {
    console.log('Launching 10 agents in rapid succession...');
    
    const burstTasks = [];
    for (let i = 1; i <= 10; i++) {
      burstTasks.push(
        this.launchAgent(`burst-${i}`, `Burst test ${i}: Create file burst-${i}.txt with content "Burst agent ${i} completed"`)
      );
      // Small delay between launches to test queuing
      await this.sleep(100);
    }
    
    const results = await Promise.allSettled(burstTasks);
    this.results.tasksLaunched += 10;
    
    console.log(`✅ Burst test launched: ${results.filter(r => r.status === 'fulfilled').length}/10 tasks`);
    
    // Monitor burst execution
    await this.monitorConcurrency(45000);
  }

  async testSustainedLoad() {
    console.log('Testing sustained load with 15 agents over 60 seconds...');
    
    const sustainedTasks = [];
    for (let i = 1; i <= 15; i++) {
      sustainedTasks.push(
        this.launchAgent(`sustained-${i}`, `Sustained test ${i}: Create file sustained-${i}.txt with content "Sustained agent ${i} completed"`)
      );
      
      // Stagger launches every 4 seconds
      if (i < 15) await this.sleep(4000);
    }
    
    const results = await Promise.allSettled(sustainedTasks);
    this.results.tasksLaunched += 15;
    
    console.log(`✅ Sustained test launched: ${results.filter(r => r.status === 'fulfilled').length}/15 tasks`);
    
    // Monitor sustained execution
    await this.monitorConcurrency(60000);
  }

  async testErrorResilience() {
    console.log('Testing error resilience with intentionally failing agents...');
    
    const errorTasks = [
      this.launchAgent('error-1', 'This task should fail: Run an invalid command "nonexistent-command"'),
      this.launchAgent('success-after-error', 'Create file success-after-error.txt with content "Success after error"'),
      this.launchAgent('error-2', 'Another failing task: Access non-existent file /impossible/path/file.txt'),
      this.launchAgent('final-success', 'Create file final-success.txt with content "Factory resilient to errors"')
    ];
    
    const results = await Promise.allSettled(errorTasks);
    this.results.tasksLaunched += 4;
    
    console.log(`✅ Error resilience test launched: ${results.filter(r => r.status === 'fulfilled').length}/4 tasks`);
    
    // Monitor error recovery
    await this.monitorConcurrency(20000);
  }

  async launchAgent(agentType, task) {
    try {
      const result = await this.client.callTool('launch_agent', {
        agent_type: agentType,
        specifications: task
      });
      return result;
    } catch (error) {
      console.error(`Failed to launch agent ${agentType}:`, error.message);
      throw error;
    }
  }

  async monitorConcurrency(duration) {
    const interval = 5000; // Check every 5 seconds
    let elapsed = 0;
    
    while (elapsed < duration) {
      try {
        const status = await this.client.callTool('get_system_status');
        const statusData = JSON.parse(status.content[0].text);
        
        const runningAgents = statusData.health_checks.agent_runner.metadata.runningAgents;
        const workspaces = statusData.workspaces.active_worktrees - 1; // Subtract main repo
        
        if (runningAgents > this.results.maxConcurrentAgents) {
          this.results.maxConcurrentAgents = runningAgents;
        }
        
        if (workspaces > this.results.peakWorkspaces) {
          this.results.peakWorkspaces = workspaces;
        }
        
        if (runningAgents > 0 || statusData.workflows.pending_tasks > 0) {
          console.log(`📈 Running: ${runningAgents} agents, ${statusData.workflows.pending_tasks} pending, ${workspaces} workspaces`);
        }
        
      } catch (error) {
        console.warn('Monitoring error:', error.message);
      }
      
      await this.sleep(interval);
      elapsed += interval;
    }
  }

  async generateStressReport() {
    console.log('\n' + '='.repeat(60));
    console.log('🏭 AGENT FACTORY STRESS TEST RESULTS');
    console.log('='.repeat(60));
    
    const duration = (Date.now() - this.results.testStart) / 1000;
    
    // Count completed tasks by checking for created files
    const completedTasks = await this.countCompletedTasks();
    this.results.tasksCompleted = completedTasks;
    this.results.tasksFailed = this.results.tasksLaunched - completedTasks;
    
    console.log(`⏱️  Total test duration: ${duration.toFixed(1)}s`);
    console.log(`🚀 Tasks launched: ${this.results.tasksLaunched}`);
    console.log(`✅ Tasks completed: ${this.results.tasksCompleted}`);
    console.log(`❌ Tasks failed: ${this.results.tasksFailed}`);
    console.log(`📊 Success rate: ${((this.results.tasksCompleted / this.results.tasksLaunched) * 100).toFixed(1)}%`);
    console.log(`⚡ Peak concurrent agents: ${this.results.maxConcurrentAgents}`);
    console.log(`📁 Peak workspaces: ${this.results.peakWorkspaces}`);
    console.log(`🔄 Throughput: ${(this.results.tasksLaunched / duration).toFixed(2)} tasks/second`);
    
    // Performance assessment
    const successRate = (this.results.tasksCompleted / this.results.tasksLaunched) * 100;
    
    console.log('\n🎯 FACTORY PERFORMANCE ASSESSMENT:');
    if (successRate >= 90 && this.results.maxConcurrentAgents >= 2) {
      console.log('🎉 EXCELLENT: Agent factory handles stress testing perfectly!');
      console.log('🚀 Ready for production team-based autonomous agent deployment');
    } else if (successRate >= 80) {
      console.log('✅ GOOD: Agent factory is functional but may need optimization');
    } else if (successRate >= 60) {
      console.log('⚠️  NEEDS IMPROVEMENT: Factory has issues under stress');
    } else {
      console.log('❌ POOR: Factory is not ready for production use');
    }
    
    console.log('='.repeat(60));
  }

  async countCompletedTasks() {
    try {
      const workspacesDir = '/home/ari1110/.cns/workspaces';
      const contents = await readdir(workspacesDir);
      
      let completedCount = 0;
      const taskFiles = [
        'concurrent-1.txt', 'concurrent-2.txt', 'concurrent-3.txt', 'concurrent-4.txt', 'concurrent-5.txt',
        ...Array.from({length: 10}, (_, i) => `burst-${i+1}.txt`),
        ...Array.from({length: 15}, (_, i) => `sustained-${i+1}.txt`),
        'success-after-error.txt', 'final-success.txt'
      ];
      
      for (const workspace of contents) {
        if (workspace === 'test-workspace-fix') continue;
        
        const workspacePath = `${workspacesDir}/${workspace}`;
        try {
          const workspaceFiles = await readdir(workspacePath);
          const foundFiles = taskFiles.filter(file => workspaceFiles.includes(file));
          completedCount += foundFiles.length;
        } catch {
          // Skip inaccessible workspaces
        }
      }
      
      return completedCount;
    } catch {
      return 0;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the stress test
const stressTest = new AgentFactoryStressTest();
stressTest.run().catch(console.error);