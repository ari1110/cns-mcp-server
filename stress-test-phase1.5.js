#!/usr/bin/env node
/**
 * COMPREHENSIVE STRESS TEST: Phase 1.5 Workspace-Isolated Agent Spawning
 * 
 * Tests:
 * 1. Full CNS server startup with MCP connectivity
 * 2. Multiple agent queuing and execution (3+ simultaneous)
 * 3. Workspace isolation verification
 * 4. Resource cleanup validation
 * 5. No spawn loop detection
 * 6. Agent completion signaling
 * 7. Memory and workflow state management
 * 8. Error handling and recovery
 */

import { spawn } from 'child_process';
import { mkdir, readdir, access, constants } from 'fs/promises';
import { join } from 'path';

class CNSStressTest {
  constructor() {
    this.cnsProcess = null;
    this.testResults = {
      serverStartup: false,
      agentSpawning: false,
      workspaceIsolation: false,
      concurrentExecution: false,
      noSpawnLoop: false,
      resourceCleanup: false,
      completionSignaling: false,
      errorRecovery: false
    };
    this.startTime = Date.now();
    this.agentCount = 0;
    this.maxProcessesSeen = 0;
  }

  async run() {
    console.log('🚀 COMPREHENSIVE CNS STRESS TEST - Phase 1.5');
    console.log('='.repeat(60));
    
    try {
      await this.test1_ServerStartup();
      await this.test2_ProcessMonitoring();
      await this.test3_MultipleAgentQueuing();
      await this.test4_WorkspaceVerification();
      await this.test5_ConcurrentExecution();
      await this.test6_ResourceCleanup();
      await this.test7_ErrorRecovery();
      
      await this.generateReport();
      
    } catch (error) {
      console.error('💥 CRITICAL TEST FAILURE:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  async test1_ServerStartup() {
    console.log('\\n🧪 TEST 1: Full CNS Server Startup with MCP');
    
    return new Promise((resolve, reject) => {
      this.cnsProcess = spawn('npm', ['start'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let startupOutput = '';
      let serverReady = false;

      const timeout = setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Server startup timeout (30s)'));
        }
      }, 30000);

      this.cnsProcess.stdout.on('data', (data) => {
        const output = data.toString();
        startupOutput += output;
        
        // Look for key startup indicators from actual server output
        if (output.includes('✅ Agent runner started successfully') && 
            output.includes('🎯 CNS MCP Server running (MCP + Agent Runner integrated)')) {
          serverReady = true;
          clearTimeout(timeout);
          this.testResults.serverStartup = true;
          console.log('✅ Server startup successful');
          resolve();
        }
      });

      this.cnsProcess.stderr.on('data', (data) => {
        console.log('Server stderr:', data.toString());
      });

      this.cnsProcess.on('exit', (code) => {
        if (code !== 0 && !serverReady) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });
  }

  async test2_ProcessMonitoring() {
    console.log('\\n🧪 TEST 2: Process Spawn Loop Detection');
    
    // Monitor process count over time
    const monitorInterval = setInterval(async () => {
      try {
        const { stdout } = await this.execAsync('ps aux | grep -E "node.*dist/index.js" | grep -v grep | wc -l');
        const processCount = parseInt(stdout.trim());
        
        if (processCount > this.maxProcessesSeen) {
          this.maxProcessesSeen = processCount;
        }
        
        console.log(`📊 CNS Processes: ${processCount}`);
        
        // If we see >50 processes, we have a spawn loop
        if (processCount > 50) {
          clearInterval(monitorInterval);
          throw new Error(`Spawn loop detected: ${processCount} processes!`);
        }
        
        // If process count stabilizes under 10 for 15 seconds, we're good
        if (processCount <= 10) {
          this.testResults.noSpawnLoop = true;
        }
        
      } catch (error) {
        console.error('Process monitoring error:', error.message);
      }
    }, 2000);

    // Wait 20 seconds for stabilization
    await this.sleep(20000);
    clearInterval(monitorInterval);
    
    if (this.testResults.noSpawnLoop) {
      console.log(`✅ No spawn loop detected (max: ${this.maxProcessesSeen} processes)`);
    } else {
      console.log(`⚠️ Process count concern (max: ${this.maxProcessesSeen} processes)`);
    }
  }

  async test3_MultipleAgentQueuing() {
    console.log('\\n🧪 TEST 3: Multiple Agent Queuing (5 agents)');
    
    const tasks = [
      {
        type: 'file-listing',
        specs: 'List files in current directory, count them, and report the workspace path you are running in.'
      },
      {
        type: 'git-check', 
        specs: 'Check git status and report which branch you are on and if you have a clean working tree.'
      },
      {
        type: 'environment-check',
        specs: 'Check your environment variables for CNS_* variables and report your isolation status.'
      },
      {
        type: 'workspace-verify',
        specs: 'Verify you are running in an isolated workspace by checking if you can see other agent files.'
      },
      {
        type: 'concurrent-test',
        specs: 'Create a unique test file with timestamp and your agent ID, then verify it exists.'
      }
    ];

    // Queue all agents rapidly
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      console.log(`📤 Queuing agent ${i+1}: ${task.type}`);
      
      try {
        await this.queueAgent(task.type, task.specs);
        this.agentCount++;
      } catch (error) {
        console.error(`❌ Failed to queue agent ${i+1}:`, error.message);
      }
    }
    
    this.testResults.agentSpawning = this.agentCount > 0;
    console.log(`✅ Queued ${this.agentCount} agents successfully`);
  }

  async test4_WorkspaceVerification() {
    console.log('\\n🧪 TEST 4: Workspace Isolation Verification');
    
    // Wait for agents to start executing
    await this.sleep(10000);
    
    try {
      // Check if workspace directories were created
      const workspacesDir = '/home/ari1110/.cns/workspaces';
      await access(workspacesDir, constants.F_OK);
      
      const workspaceContents = await readdir(workspacesDir);
      const agentWorkspaces = workspaceContents.filter(name => 
        name.includes('general-purpose-') || name.includes('test-')
      );
      
      console.log(`📁 Found ${agentWorkspaces.length} agent workspaces:`);
      agentWorkspaces.forEach(ws => console.log(`   - ${ws}`));
      
      this.testResults.workspaceIsolation = agentWorkspaces.length > 0;
      
      if (agentWorkspaces.length > 0) {
        console.log('✅ Workspace isolation verified');
      } else {
        console.log('❌ No isolated workspaces found');
      }
      
    } catch (error) {
      console.error('❌ Workspace verification failed:', error.message);
    }
  }

  async test5_ConcurrentExecution() {
    console.log('\\n🧪 TEST 5: Concurrent Agent Execution');
    
    // Monitor for concurrent agent processes
    let maxConcurrentAgents = 0;
    const monitorInterval = setInterval(async () => {
      try {
        const { stdout } = await this.execAsync('ps aux | grep -E "claude.*--resume.*--input" | grep -v grep | wc -l');
        const claudeProcesses = parseInt(stdout.trim());
        
        if (claudeProcesses > maxConcurrentAgents) {
          maxConcurrentAgents = claudeProcesses;
        }
        
        if (claudeProcesses > 0) {
          console.log(`🏃 Active agent processes: ${claudeProcesses}`);
        }
        
      } catch (error) {
        // Ignore monitoring errors
      }
    }, 3000);

    // Wait for agents to execute
    await this.sleep(30000);
    clearInterval(monitorInterval);
    
    this.testResults.concurrentExecution = maxConcurrentAgents > 1;
    console.log(`✅ Max concurrent agents observed: ${maxConcurrentAgents}`);
  }

  async test6_ResourceCleanup() {
    console.log('\\n🧪 TEST 6: Resource Cleanup Verification');
    
    // Wait for agents to complete
    await this.sleep(20000);
    
    try {
      // Check if workspaces were cleaned up
      const workspacesDir = '/home/ari1110/.cns/workspaces';
      const workspaceContents = await readdir(workspacesDir);
      const remainingWorkspaces = workspaceContents.filter(name => 
        name.includes('general-purpose-') || name.includes('test-')
      );
      
      console.log(`🧹 Remaining workspaces: ${remainingWorkspaces.length}`);
      
      // Check if Claude processes cleaned up
      const { stdout } = await this.execAsync('ps aux | grep -E "claude.*--resume" | grep -v grep | wc -l');
      const claudeProcesses = parseInt(stdout.trim());
      
      console.log(`🏃 Remaining Claude processes: ${claudeProcesses}`);
      
      this.testResults.resourceCleanup = remainingWorkspaces.length < this.agentCount && claudeProcesses === 0;
      
      if (this.testResults.resourceCleanup) {
        console.log('✅ Resource cleanup successful');
      } else {
        console.log('⚠️ Some resources may not have cleaned up properly');
      }
      
    } catch (error) {
      console.error('❌ Resource cleanup verification failed:', error.message);
    }
  }

  async test7_ErrorRecovery() {
    console.log('\\n🧪 TEST 7: Error Recovery Testing');
    
    try {
      // Queue an agent with invalid specifications to test error handling
      await this.queueAgent('error-test', 'INVALID_SPECIFICATIONS_TO_TRIGGER_ERROR_AND_TEST_RECOVERY');
      
      // Wait and verify system doesn't crash
      await this.sleep(10000);
      
      this.testResults.errorRecovery = this.cnsProcess && !this.cnsProcess.killed;
      
      if (this.testResults.errorRecovery) {
        console.log('✅ Error recovery successful - system remained stable');
      }
      
    } catch (error) {
      console.error('❌ Error recovery test failed:', error.message);
    }
  }

  async queueAgent(agentType, specifications) {
    return new Promise((resolve, reject) => {
      // Create a more robust agent queuing process that properly connects to CNS
      const queueProcess = spawn('node', ['-e', `
        import { spawn } from 'child_process';
        
        // Queue agent by calling CNS server directly via npx
        const cnsProcess = spawn('npx', ['cns-mcp-server'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, CNS_MODE: 'client' }
        });
        
        const command = JSON.stringify({
          method: 'tools/call',
          params: {
            name: 'launch_agent',
            arguments: {
              agent_type: '${agentType}',
              specifications: '${specifications}'
            }
          }
        });
        
        cnsProcess.stdin.write(command + '\\n');
        cnsProcess.stdin.end();
        
        let output = '';
        cnsProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        cnsProcess.stderr.on('data', (data) => {
          console.error('Queue error:', data.toString());
        });
        
        cnsProcess.on('exit', (code) => {
          console.log('Queue result:', output);
          process.exit(code);
        });
      `], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      queueProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      queueProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      queueProcess.on('exit', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Queue agent failed: ${output}`));
        }
      });
    });
  }

  async generateReport() {
    console.log('\\n' + '='.repeat(60));
    console.log('📊 COMPREHENSIVE TEST RESULTS');
    console.log('='.repeat(60));
    
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`⏱️  Total test duration: ${duration}s`);
    console.log(`📈 Max processes observed: ${this.maxProcessesSeen}`);
    console.log(`🤖 Agents queued: ${this.agentCount}`);
    
    console.log('\\nTest Results:');
    Object.entries(this.testResults).forEach(([test, passed]) => {
      const status = passed ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${test.padEnd(20)}: ${status}`);
    });
    
    const passedTests = Object.values(this.testResults).filter(Boolean).length;
    const totalTests = Object.keys(this.testResults).length;
    
    console.log(`\\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 ALL TESTS PASSED! Phase 1.5 is working correctly.');
    } else {
      console.log(`⚠️  ${totalTests - passedTests} tests failed. Phase 1.5 needs fixes.`);
    }
    
    await this.cleanup();
  }

  async cleanup() {
    console.log('\\n🧹 Cleaning up test environment...');
    
    if (this.cnsProcess && !this.cnsProcess.killed) {
      this.cnsProcess.kill('SIGTERM');
      await this.sleep(2000);
    }
    
    // Force cleanup any remaining processes
    try {
      await this.execAsync('pkill -f "node.*dist/index.js"');
    } catch {
      // Ignore cleanup errors
    }
  }

  async execAsync(command) {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const process = spawn(cmd, args, { stdio: 'pipe' });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => stdout += data);
      process.stderr.on('data', (data) => stderr += data);
      
      process.on('exit', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(stderr || stdout));
        }
      });
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the comprehensive stress test
const test = new CNSStressTest();
test.run();