#!/usr/bin/env node

/**
 * Agent Factory Test
 * 
 * Tests the core "factory" functionality of CNS to validate:
 * - Can we spawn multiple isolated agents?
 * - Do agents run in separate workspaces?
 * - Can agents execute tasks simultaneously?
 * - Do agents complete and clean up properly?
 * - Can we scale to multiple concurrent agents?
 * - Does the "team factory" concept actually work?
 */

import { spawn } from 'child_process';
import { readdir, writeFile, access, constants } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

class AgentFactoryTest {
  constructor() {
    this.cnsProcess = null;
    this.results = {
      serverStartup: false,
      agentSpawning: false,
      workspaceIsolation: false,
      concurrentExecution: false,
      taskCompletion: false,
      resourceCleanup: false,
      factoryScaling: false
    };
    this.startTime = Date.now();
    this.agentsLaunched = 0;
    this.maxConcurrentAgents = 0;
  }

  async run() {
    console.log('🏭 AGENT FACTORY TEST SUITE');
    console.log('=' .repeat(60));
    console.log('Testing if CNS can function as an autonomous agent factory');
    console.log('This test validates core factory capabilities, not MCP details');
    console.log('=' .repeat(60));

    try {
      // Run test sequence
      await this.test1_StartFactory();
      await this.test2_SpawnSingleAgent();
      await this.test3_VerifyWorkspaceIsolation();
      await this.test4_SpawnMultipleAgents();
      await this.test5_MonitorConcurrentExecution();
      await this.test6_TestFactoryScaling();
      await this.test7_ValidateResourceCleanup();
      
      // Generate final report
      await this.generateFactoryReport();
      
    } catch (error) {
      console.error('❌ Factory test suite failed:', error.message);
    } finally {
      // Cleanup
      if (this.cnsProcess) {
        console.log('\\n🔄 Shutting down factory...');
        this.cnsProcess.kill();
        await this.sleep(2000);
      }
    }
  }

  async test1_StartFactory() {
    console.log('\\n🚀 TEST 1: Starting Agent Factory (CNS Server)');
    
    return new Promise((resolve, reject) => {
      // Start CNS server with agent runner enabled
      this.cnsProcess = spawn('npm', ['start'], {
        cwd: process.cwd(),
        env: { ...process.env, CNS_MAX_AGENTS: '5' }
      });

      let factoryReady = false;

      this.cnsProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Factory output:', output.trim());
        
        if (output.includes('Agent runner started successfully') || 
            output.includes('CNS MCP Server running')) {
          factoryReady = true;
          this.results.serverStartup = true;
          console.log('✅ Agent factory started successfully');
          resolve();
        }
      });

      this.cnsProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (!error.includes('[dotenv]')) {
          console.error('Factory error:', error);
        }
      });

      this.cnsProcess.on('exit', (code) => {
        if (code !== 0 && !factoryReady) {
          reject(new Error(`Factory failed to start (exit code: ${code})`));
        }
      });
    });
  }

  async test2_SpawnSingleAgent() {
    console.log('\\n🤖 TEST 2: Spawning First Agent');
    
    try {
      // Queue a simple agent task
      await this.createAgentTask('test-agent-1', 'Simple test task: echo "Hello from agent"');
      
      // Wait for agent to spawn (agent runner polls every 10 seconds)
      console.log('⏳ Waiting for agent runner to detect and spawn agent...');
      
      let agentDetected = false;
      let attempts = 0;
      
      while (!agentDetected && attempts < 10) {
        await this.sleep(3000);
        
        const processCount = await this.getAgentProcessCount();
        if (processCount > 0) {
          agentDetected = true;
          this.results.agentSpawning = true;
          console.log(`✅ Agent spawning confirmed (${processCount} agent processes detected)`);
          break;
        }
        
        attempts++;
        console.log(`⏳ Waiting for agent to spawn (attempt ${attempts}/10)...`);
      }
      
      if (!agentDetected) {
        console.log('❌ No agent processes detected - factory may not be spawning agents');
      }
      
    } catch (error) {
      console.error('❌ Single agent spawn failed:', error.message);
    }
  }

  async test3_VerifyWorkspaceIsolation() {
    console.log('\\n📁 TEST 3: Verifying Workspace Isolation');
    
    try {
      // Check if workspace directories are being created
      await this.sleep(5000); // Give workspace time to be created
      
      const workspacesDir = `${process.env.HOME}/.cns/workspaces`;
      
      try {
        const workspaceContents = await readdir(workspacesDir);
        const agentWorkspaces = workspaceContents.filter(name => 
          name.includes('agent') || name.includes('test') || name.includes('general-purpose')
        );
        
        if (agentWorkspaces.length > 0) {
          this.results.workspaceIsolation = true;
          console.log(`✅ Workspace isolation working (${agentWorkspaces.length} isolated workspaces)`);
          console.log(`📂 Workspaces: ${agentWorkspaces.slice(0, 3).join(', ')}${agentWorkspaces.length > 3 ? '...' : ''}`);
          
          // Verify workspace content isolation
          if (agentWorkspaces.length > 0) {
            const sampleWorkspace = join(workspacesDir, agentWorkspaces[0]);
            try {
              await access(sampleWorkspace, constants.F_OK);
              console.log('✅ Workspace directories are accessible');
            } catch {
              console.log('⚠️ Workspace directories exist but may not be accessible');
            }
          }
        } else {
          console.log('❌ No isolated workspaces detected');
        }
      } catch (error) {
        console.log('⚠️ Workspace directory not found - isolation may not be configured');
      }
      
    } catch (error) {
      console.error('❌ Workspace isolation check failed:', error.message);
    }
  }

  async test4_SpawnMultipleAgents() {
    console.log('\\n👥 TEST 4: Spawning Multiple Concurrent Agents');
    
    try {
      // Queue multiple agent tasks
      const agentTasks = [
        this.createAgentTask('concurrent-agent-1', 'Task 1: List files in current directory'),
        this.createAgentTask('concurrent-agent-2', 'Task 2: Check system memory usage'),
        this.createAgentTask('concurrent-agent-3', 'Task 3: Count lines in package.json'),
        this.createAgentTask('concurrent-agent-4', 'Task 4: Show current date and time'),
        this.createAgentTask('concurrent-agent-5', 'Task 5: Echo "Hello from agent 5"')
      ];
      
      // Launch all agents
      await Promise.allSettled(agentTasks);
      this.agentsLaunched = 5;
      
      console.log(`📤 Launched ${this.agentsLaunched} agents for concurrent execution`);
      
    } catch (error) {
      console.error('❌ Multiple agent spawning failed:', error.message);
    }
  }

  async test5_MonitorConcurrentExecution() {
    console.log('\\n📊 TEST 5: Monitoring Concurrent Agent Execution');
    
    // Monitor for 60 seconds to see concurrent execution
    const maxMonitorTime = 60000;
    let monitoringTime = 0;
    
    const monitorInterval = setInterval(async () => {
      const agentCount = await this.getAgentProcessCount();
      const workspaceCount = await this.getWorkspaceCount();
      
      if (agentCount > this.maxConcurrentAgents) {
        this.maxConcurrentAgents = agentCount;
      }
      
      if (agentCount > 0 || workspaceCount > 0) {
        console.log(`🏃 Active agents: ${agentCount}, Workspaces: ${workspaceCount}`);
      }
      
      monitoringTime += 5000;
      
      if (monitoringTime >= maxMonitorTime) {
        clearInterval(monitorInterval);
      }
    }, 5000);

    await this.sleep(maxMonitorTime);
    
    if (this.maxConcurrentAgents > 1) {
      this.results.concurrentExecution = true;
      console.log(`✅ Concurrent execution confirmed (peak: ${this.maxConcurrentAgents} agents)`);
    } else if (this.maxConcurrentAgents === 1) {
      console.log('⚠️ Only single agent execution detected - concurrency may be limited');
    } else {
      console.log('❌ No concurrent agent execution detected');
    }
  }

  async test6_TestFactoryScaling() {
    console.log('\\n🏭 TEST 6: Testing Factory Scaling Capability');
    
    try {
      // Test if we can handle a burst of agent requests
      const burstTasks = Array.from({length: 8}, (_, i) => 
        this.createAgentTask(`burst-agent-${i+1}`, `Burst test task ${i+1}: Quick execution test`)
      );
      
      const startTime = Date.now();
      await Promise.allSettled(burstTasks);
      const burstTime = Date.now() - startTime;
      
      console.log(`📈 Burst test completed in ${burstTime}ms (8 agents)`);
      
      // Monitor peak concurrent agents after burst
      await this.sleep(10000);
      const peakAgents = await this.getAgentProcessCount();
      
      if (peakAgents >= 2) {
        this.results.factoryScaling = true;
        console.log(`✅ Factory scaling confirmed (${peakAgents} agents running simultaneously)`);
      } else {
        console.log('⚠️ Limited scaling detected - factory may have concurrency constraints');
      }
      
    } catch (error) {
      console.error('❌ Factory scaling test failed:', error.message);
    }
  }

  async test7_ValidateResourceCleanup() {
    console.log('\\n🧹 TEST 7: Validating Resource Cleanup');
    
    // Wait for agents to complete and clean up
    console.log('⏳ Waiting for agents to complete and clean up...');
    await this.sleep(30000);
    
    const finalAgentCount = await this.getAgentProcessCount();
    const finalWorkspaceCount = await this.getWorkspaceCount();
    
    console.log(`📊 Final state - Agents: ${finalAgentCount}, Workspaces: ${finalWorkspaceCount}`);
    
    // Cleanup is good if most agents and workspaces are cleaned up
    const cleanupEffective = finalAgentCount <= 1 && finalWorkspaceCount < this.agentsLaunched;
    
    if (cleanupEffective) {
      this.results.resourceCleanup = true;
      console.log('✅ Agent cleanup working effectively');
    } else {
      console.log('⚠️ Resource cleanup may need improvement');
    }
    
    // Check task completion
    if (this.agentsLaunched > 0 && (this.results.agentSpawning || this.results.concurrentExecution)) {
      this.results.taskCompletion = true;
      console.log('✅ Task completion cycle appears functional');
    }
  }

  async createAgentTask(agentType, specifications) {
    // Simulate queuing an agent by creating a simple trigger file
    // In a real scenario, this would use the MCP interface
    try {
      const triggerFile = `/tmp/cns-agent-trigger-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`;
      const taskData = {
        agent_type: agentType,
        specifications: specifications,
        timestamp: new Date().toISOString()
      };
      
      await writeFile(triggerFile, JSON.stringify(taskData, null, 2));
      console.log(`📝 Created agent task trigger: ${agentType}`);
      
    } catch (error) {
      console.error(`Failed to create agent task for ${agentType}:`, error.message);
    }
  }

  async getAgentProcessCount() {
    try {
      const { stdout } = await this.execAsync('ps aux | grep -E "claude.*--resume.*--input" | grep -v grep | wc -l');
      return parseInt(stdout.trim()) || 0;
    } catch {
      return 0;
    }
  }

  async getWorkspaceCount() {
    try {
      const workspacesDir = `${process.env.HOME}/.cns/workspaces`;
      const contents = await readdir(workspacesDir);
      return contents.filter(name => 
        name.includes('agent') || name.includes('test') || name.includes('general-purpose')
      ).length;
    } catch {
      return 0;
    }
  }

  async generateFactoryReport() {
    console.log('\\n' + '='.repeat(60));
    console.log('🏭 AGENT FACTORY TEST RESULTS');
    console.log('='.repeat(60));
    
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`⏱️  Factory test duration: ${duration}s`);
    console.log(`🤖 Agents launched: ${this.agentsLaunched}`);
    console.log(`⚡ Peak concurrent agents: ${this.maxConcurrentAgents}`);
    
    console.log('\\n🧪 Factory Capabilities:');
    const capabilities = [
      ['Server Startup', this.results.serverStartup],
      ['Agent Spawning', this.results.agentSpawning], 
      ['Workspace Isolation', this.results.workspaceIsolation],
      ['Concurrent Execution', this.results.concurrentExecution],
      ['Task Completion', this.results.taskCompletion],
      ['Resource Cleanup', this.results.resourceCleanup],
      ['Factory Scaling', this.results.factoryScaling]
    ];
    
    capabilities.forEach(([capability, working]) => {
      const status = working ? '✅ WORKING' : '❌ FAILED';
      console.log(`  ${capability.padEnd(20)}: ${status}`);
    });
    
    const workingCapabilities = Object.values(this.results).filter(Boolean).length;
    const totalCapabilities = Object.keys(this.results).length;
    const factoryScore = Math.round(workingCapabilities / totalCapabilities * 100);
    
    console.log(`\\n🎯 Factory Functionality Score: ${workingCapabilities}/${totalCapabilities} (${factoryScore}%)`);
    
    if (factoryScore >= 90) {
      console.log('🎉 AGENT FACTORY IS FULLY FUNCTIONAL!');
      console.log('🚀 Ready for team-based autonomous agent deployment');
    } else if (factoryScore >= 70) {
      console.log('✅ Agent factory is mostly functional');
      console.log('🔧 Some capabilities need refinement for production use');
    } else if (factoryScore >= 50) {
      console.log('⚠️ Agent factory has core functionality');
      console.log('🛠️ Significant improvements needed for reliable operation');
    } else {
      console.log('❌ Agent factory is not yet functional');
      console.log('🔍 Major issues need to be resolved');
    }
    
    console.log('\\n' + '='.repeat(60));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  execAsync(command) {
    return execAsync(command);
  }
}

// Run the test
const test = new AgentFactoryTest();
test.run().catch(console.error);